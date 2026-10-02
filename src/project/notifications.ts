import type { AnyNode, Program } from 'acorn';

import type { ParseOutcome } from './parse.js';
import { readJavaScript, walkJavaScript } from './javascript.js';
import { maskComments, maskLiterals, readPhpCode } from './php.js';
import { cancellationCheckpoint, periodicCancellationCheckpoint } from '../deadline.js';

/**
 * Readers for the notification contract between a BGA server and its client.
 *
 * The server pushes a named notification with a payload; the client subscribes
 * to that name and reads the payload. A mismatch fails silently at runtime —
 * no error, the interface simply never updates — which is why it is worth
 * checking statically. Nothing here executes project code.
 */

export interface SentNotification {
  readonly name: string;
  /** Payload keys the server sends, excluding framework-managed keys. */
  readonly payloadKeys: readonly string[];
  /** Whether the complete payload shape is known, including an omitted known-empty payload. */
  readonly payloadShape: 'known' | 'unknown';
  readonly scope: 'all' | 'player';
}

export interface NotificationHandler {
  readonly name: string;
  /** How the client attached the handler. */
  readonly binding: 'subscribe' | 'method';
  /**
   * Whether the framework will actually call it.
   *
   * A `notif_…` method is only registered when `setupPromiseNotifications`
   * runs: it "auto-detect[s] all notifications declared on the game object
   * (functions starting with `notif_`) and register[s] them with
   * dojo.subscribe". Without that call, or with the name in its
   * `ignoreNotifications` list, the method is a method and nothing more.
   */
  readonly bound: boolean;
  /** Payload keys the handler reads. */
  readonly payloadKeys: readonly string[];
}

/**
 * Notification types the framework defines, which a game may send without
 * writing a handler.
 *
 * "Pre-defined notification types": `message` "shows on players log and have
 * no other effect", `tableWindow` opens a scoring dialog, and `simplePause`
 * "will just delay other notifications".
 */
export const PREDEFINED_NOTIFICATIONS = ['message', 'tableWindow', 'simplePause'] as const;

/** Keys the framework adds to every notification payload. */
const FRAMEWORK_PAYLOAD_KEYS = new Set(['i18n', 'player_name', 'player_id']);

// Three documented spellings of the same send, and a real project mixes them:
// legacy `notifyAllPlayers`/`notifyPlayer`; `$this->bga->notify->all`/`->player`
// on the game class; and the state-class shortcut, where "the Game sub-objects
// are available on the State class too, so you can write `$this->notif->all`
// without needing to pass through the game variable".
const NOTIFY =
  /(?:\$this->|self::|static::)?notify(All)?Player(?:s)?\s*\(|->(?:bga->)?notif(?:y)?->(all|player)\s*\(/gu;
interface SplitCallArguments {
  readonly parts: readonly string[];
  readonly complete: boolean;
}

/** Splits a call's arguments at top level, respecting nesting and strings. */
function splitArguments(
  source: string,
  openIndex: number,
  signal?: AbortSignal,
): SplitCallArguments {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  let quote: string | null = null;

  for (let index = openIndex; index < source.length; index += 1) {
    periodicCancellationCheckpoint(index - openIndex, signal);
    const character = source[index] ?? '';
    if (quote !== null) {
      current += character;
      if (character === quote && source[index - 1] !== '\\') {
        quote = null;
      }
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      current += character;
      continue;
    }
    if (character === '(' || character === '[') {
      depth += 1;
      if (depth === 1 && character === '(') {
        continue;
      }
    } else if (character === ')' || character === ']') {
      depth -= 1;
      if (depth === 0) {
        parts.push(current);
        return { parts, complete: true };
      }
    }
    if (character === ',' && depth === 1) {
      parts.push(current);
      current = '';
      continue;
    }
    current += character;
  }
  if (current.trim() !== '') parts.push(current);
  return { parts, complete: false };
}

function phpArrayKeys(literal: string, signal?: AbortSignal): string[] {
  const keys: string[] = [];
  const masked = maskLiterals(literal, signal);
  for (const match of literal.matchAll(/(?:'([^']+)'|"([^"]+)")\s*=>/gu)) {
    cancellationCheckpoint(signal);
    if (masked[match.index] !== literal[match.index]) continue;
    const key = match[1] ?? match[2];
    if (key !== undefined && !FRAMEWORK_PAYLOAD_KEYS.has(key)) {
      keys.push(key);
    }
  }
  return [...new Set(keys)].sort();
}

function stringLiteral(argument: string, signal?: AbortSignal): string | null {
  cancellationCheckpoint(signal);
  const trimmed = argument.trim();
  const match = /^(?:'([^']*)'|"([^"]*)")$/u.exec(trimmed);
  return match === null ? null : (match[1] ?? match[2] ?? null);
}

/**
 * Reads the notifications a PHP source sends.
 *
 * Recognizes `notifyAllPlayers` and `notifyPlayer`. A notification whose name
 * or payload is assembled at runtime is reported as unsupported.
 */
export function parseSentNotifications(
  source: string,
  signal?: AbortSignal,
): ParseOutcome<readonly SentNotification[]> {
  cancellationCheckpoint(signal);
  const syntax = readPhpCode(source, signal);
  if (syntax.unsupported.length > 0) return { value: [], unsupported: syntax.unsupported };
  const sent: SentNotification[] = [];
  const unsupported: string[] = [];

  const argumentsSource = maskComments(source, signal);
  for (const match of syntax.value.matchAll(NOTIFY)) {
    cancellationCheckpoint(signal);
    const modern = match[2];
    const scope: 'all' | 'player' =
      modern === undefined
        ? match[1] === undefined
          ? 'player'
          : 'all'
        : (modern as 'all' | 'player');
    const split = splitArguments(argumentsSource, match.index + match[0].length - 1, signal);
    const parts = split.parts;
    // notifyAllPlayers(name, message, args); notifyPlayer(playerId, name, message, args)
    const nameArgument = scope === 'all' ? parts[0] : parts[1];
    const payloadArgument = scope === 'all' ? parts[2] : parts[3];
    if (nameArgument === undefined) {
      continue;
    }

    const name = stringLiteral(nameArgument, signal);
    if (name === null) {
      unsupported.push(
        `notification sent with a computed name: ${nameArgument.trim().slice(0, 40)}`,
      );
      continue;
    }

    if (!split.complete) {
      unsupported.push(`notification '${name}' has malformed arguments`);
      sent.push({ name, payloadKeys: [], payloadShape: 'unknown', scope });
      continue;
    }

    if (payloadArgument === undefined) {
      sent.push({ name, payloadKeys: [], payloadShape: 'known', scope });
      continue;
    }
    const trimmedPayload = payloadArgument.trim();
    const literalPayload = /^(?:\[|array\s*\()/u.test(trimmedPayload);
    if (!literalPayload || maskLiterals(trimmedPayload, signal).includes('...')) {
      unsupported.push(`notification '${name}' sent with a computed payload`);
      sent.push({
        name,
        payloadKeys: literalPayload ? phpArrayKeys(payloadArgument, signal) : [],
        payloadShape: 'unknown',
        scope,
      });
      continue;
    }
    sent.push({
      name,
      payloadKeys: phpArrayKeys(payloadArgument, signal),
      payloadShape: 'known',
      scope,
    });
  }

  cancellationCheckpoint(signal);
  return { value: sent, unsupported };
}

export interface HandlerOutcome extends ParseOutcome<readonly NotificationHandler[]> {
  /** Names subscribed more than once. A fact, not an unreadable construct. */
  readonly duplicates: readonly string[];
  /** What `setupPromiseNotifications` registers, where the client calls it. */
  readonly registration: PromiseRegistration | null;
  /** No missing-side conclusions when syntax or registration cannot be established. */
  readonly complete: boolean;
}

export interface PromiseRegistration {
  /** The prefix it auto-detects, `notif_` unless the call changes it. */
  readonly prefix: string;
  /** Names it is told to skip: "You'll need to subscribe to it manually". */
  readonly ignored: readonly string[];
}

/** A static property name; dynamic computation is never evaluated. */
function propertyName(node: AnyNode | null | undefined): string | null {
  if (node?.type === 'Identifier') return node.name;
  if (node?.type === 'Literal' && typeof node.value === 'string') return node.value;
  return null;
}

function callName(node: AnyNode): string | null {
  if (node.type !== 'CallExpression') return null;
  if (node.callee.type === 'Identifier') return node.callee.name;
  if (node.callee.type !== 'MemberExpression' || node.callee.computed) return null;
  return propertyName(node.callee.property);
}

function registrationInProgram(
  program: Program,
  signal?: AbortSignal,
): ParseOutcome<PromiseRegistration | null> {
  let registration: PromiseRegistration | null = null;
  const unsupported: string[] = [];
  for (const node of walkJavaScript(program, signal)) {
    if (
      !['setupPromiseNotifications', 'bgaSetupPromiseNotifications'].includes(callName(node) ?? '')
    )
      continue;
    if (node.type !== 'CallExpression') continue;
    const options = node.arguments[0];
    let prefix = 'notif_';
    const ignored: string[] = [];
    if (options !== undefined && !(options.type === 'Identifier' && options.name === 'undefined')) {
      if (options.type !== 'ObjectExpression') {
        unsupported.push('promise notification registration has computed options');
        continue;
      }
      for (const option of options.properties) {
        cancellationCheckpoint(signal);
        if (option.type !== 'Property' || option.computed) {
          unsupported.push('promise notification registration has computed option keys');
          continue;
        }
        const key = propertyName(option.key);
        if (key === 'prefix') {
          if (option.value.type === 'Literal' && typeof option.value.value === 'string')
            prefix = option.value.value;
          else unsupported.push('promise notification registration has a computed prefix');
        }
        if (key === 'ignoreNotifications') {
          if (option.value.type !== 'ArrayExpression') {
            unsupported.push('promise notification registration has a computed ignore list');
            continue;
          }
          for (const entry of option.value.elements) {
            cancellationCheckpoint(signal);
            if (entry?.type === 'Literal' && typeof entry.value === 'string')
              ignored.push(entry.value);
            else unsupported.push('promise notification registration has a computed ignored name');
          }
        }
      }
    }
    const next = { prefix, ignored };
    if (registration !== null && JSON.stringify(registration) !== JSON.stringify(next))
      unsupported.push('promise notification registrations disagree about prefix or ignored names');
    registration = next;
  }
  return { value: unsupported.length === 0 ? registration : null, unsupported };
}

/** Registration uncertainty must travel to cross-file rules, not become a default. */
export function readPromiseRegistration(
  source: string,
  signal?: AbortSignal,
): ParseOutcome<PromiseRegistration | null> {
  const syntax = readJavaScript(source, signal);
  return syntax.value === null
    ? { value: null, unsupported: syntax.unsupported }
    : registrationInProgram(syntax.value, signal);
}

function payloadReads(body: AnyNode, signal?: AbortSignal): string[] {
  const keys = new Set<string>();
  for (const node of walkJavaScript(body, signal)) {
    if (node.type !== 'MemberExpression') continue;
    const object = node.object;
    const args =
      (object.type === 'Identifier' && object.name === 'args') ||
      (object.type === 'MemberExpression' &&
        (!object.computed || object.property.type === 'Literal') &&
        propertyName(object.property) === 'args');
    if (!args) continue;
    const key =
      node.computed && node.property.type !== 'Literal' ? null : propertyName(node.property);
    if (key !== null && !FRAMEWORK_PAYLOAD_KEYS.has(key)) keys.add(key);
  }
  return [...keys].sort();
}

/**
 * Only parsed function-valued declarations and actual subscription calls supply
 * contracts. Comments, strings, regex literals and template text are not nodes
 * declaring handlers. Template substitutions remain executable expressions.
 * https://en.doc.boardgamearena.com/Game_interface_logic:_Game.js:
 * "Auto-detect all notifications declared on the game object".
 */
export function parseNotificationHandlers(
  source: string,
  registration?: PromiseRegistration | null,
  signal?: AbortSignal,
): HandlerOutcome {
  const syntax = readJavaScript(source, signal);
  if (syntax.value === null)
    return {
      value: [],
      unsupported: syntax.unsupported,
      duplicates: [],
      registration: null,
      complete: false,
    };
  const local = registrationInProgram(syntax.value, signal);
  const effectiveRegistration = registration === undefined ? local.value : registration;
  const handlers = new Map<string, NotificationHandler>();
  const unsupported = [...local.unsupported];
  const duplicates: string[] = [];
  const prefix = effectiveRegistration?.prefix ?? 'notif_';
  const nodes = [...walkJavaScript(syntax.value, signal)];
  for (const node of nodes) {
    cancellationCheckpoint(signal);
    if (
      node.type !== 'Property' &&
      node.type !== 'MethodDefinition' &&
      node.type !== 'PropertyDefinition'
    )
      continue;
    if (node.type !== 'Property' && node.static) continue;
    if (node.computed && node.key.type !== 'Literal') {
      unsupported.push('client declaration has a computed property name');
      continue;
    }
    const fullName = propertyName(node.key);
    if (fullName === null) continue;
    if (!fullName.startsWith(prefix) || fullName === prefix) continue;
    const value = node.value;
    if (
      (node.type === 'MethodDefinition' && node.kind !== 'method') ||
      (node.type === 'Property' && node.kind !== 'init') ||
      (value?.type !== 'FunctionExpression' && value?.type !== 'ArrowFunctionExpression')
    ) {
      unsupported.push('notification-prefixed declaration is not a readable function value');
      continue;
    }
    const name = fullName.slice(prefix.length);
    handlers.set(name, {
      name,
      binding: 'method',
      bound: effectiveRegistration !== null && !effectiveRegistration.ignored.includes(name),
      payloadKeys: payloadReads(value.body, signal),
    });
  }
  const subscribed = new Set<string>();
  for (const node of nodes) {
    cancellationCheckpoint(signal);
    if (
      node.type !== 'CallExpression' ||
      node.callee.type !== 'MemberExpression' ||
      node.callee.computed
    )
      continue;
    const target = node.callee.object;
    const method = propertyName(node.callee.property);
    if (!(
      (target.type === 'Identifier' && target.name === 'dojo' && method === 'subscribe') ||
      (target.type === 'ThisExpression' && method === 'subscribeNotif')
    ))
      continue;
    const argument = node.arguments[0];
    if (argument?.type !== 'Literal' || typeof argument.value !== 'string') {
      const text =
        argument === undefined
          ? ''
          : source.slice(argument.start, argument.end).trim().slice(0, 40);
      unsupported.push(`notification subscribed with a computed name: ${text}`);
      continue;
    }
    const name = argument.value;
    if (subscribed.has(name)) duplicates.push(name);
    subscribed.add(name);
    handlers.set(name, {
      name,
      binding: 'subscribe',
      bound: true,
      payloadKeys: handlers.get(name)?.payloadKeys ?? [],
    });
  }
  cancellationCheckpoint(signal);
  return {
    value: [...handlers.values()].sort((left, right) => left.name.localeCompare(right.name)),
    unsupported,
    duplicates: [...new Set(duplicates)].sort(),
    registration: effectiveRegistration,
    complete: unsupported.length === 0,
  };
}
