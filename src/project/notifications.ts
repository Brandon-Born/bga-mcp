import type { ParseOutcome } from './parse.js';
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
// Legacy object literals use `notif_x: function`, modern classes use
// `async notif_x(notif)`. Both are the same declaration as far as the
// framework is concerned, and the prefix is whatever the registration says.
// https://en.doc.boardgamearena.com/BGA_Studio_Migration_Guide
function handlerMethodPattern(prefix: string): RegExp {
  return new RegExp(
    `(?:async\\s+)?${prefix.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}([A-Za-z_]\\w*)\\s*(?:[:=]\\s*(?:function|\\()|\\()`,
    'gu',
  );
}
const SUBSCRIBE =
  /(?:dojo\.subscribe|this\.subscribeNotif)\s*\(\s*(?:'([^']*)'|"([^"]*)"|([^,)]+))/gu;

/** Splits a call's arguments at top level, respecting nesting and strings. */
function splitArguments(source: string, openIndex: number, signal?: AbortSignal): string[] {
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
        return parts;
      }
    }
    if (character === ',' && depth === 1) {
      parts.push(current);
      current = '';
      continue;
    }
    current += character;
  }
  return parts;
}

function phpArrayKeys(literal: string, signal?: AbortSignal): string[] {
  const keys: string[] = [];
  for (const match of literal.matchAll(/(?:'([^']+)'|"([^"]+)")\s*=>/gu)) {
    cancellationCheckpoint(signal);
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
  const sent: SentNotification[] = [];
  const unsupported: string[] = [];

  for (const match of source.matchAll(NOTIFY)) {
    cancellationCheckpoint(signal);
    const modern = match[2];
    const scope: 'all' | 'player' =
      modern === undefined
        ? match[1] === undefined
          ? 'player'
          : 'all'
        : (modern as 'all' | 'player');
    const parts = splitArguments(source, match.index + match[0].length - 1, signal);
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

    if (payloadArgument === undefined) {
      sent.push({ name, payloadKeys: [], scope });
      continue;
    }
    const trimmedPayload = payloadArgument.trim();
    const literalPayload = /^(?:\[|array\s*\()/u.test(trimmedPayload);
    if (!literalPayload) {
      unsupported.push(`notification '${name}' sent with a computed payload`);
      sent.push({ name, payloadKeys: [], scope });
      continue;
    }
    sent.push({ name, payloadKeys: phpArrayKeys(payloadArgument, signal), scope });
  }

  cancellationCheckpoint(signal);
  return { value: sent, unsupported };
}

export interface HandlerOutcome extends ParseOutcome<readonly NotificationHandler[]> {
  /** Names subscribed more than once. A fact, not an unreadable construct. */
  readonly duplicates: readonly string[];
  /** What `setupPromiseNotifications` registers, where the client calls it. */
  readonly registration: PromiseRegistration | null;
}

export interface PromiseRegistration {
  /** The prefix it auto-detects, `notif_` unless the call changes it. */
  readonly prefix: string;
  /** Names it is told to skip: "You'll need to subscribe to it manually". */
  readonly ignored: readonly string[];
}

const PROMISE_SETUP = /\b(?:bgaS|s)etupPromiseNotifications\s*\(/u;

/**
 * Reads what `setupPromiseNotifications` was told to register.
 *
 * Its options decide which methods become handlers at all: `prefix` changes
 * what counts as one, and `ignoreNotifications` removes names from the
 * registration entirely.
 */
export function parsePromiseRegistration(
  source: string,
  signal?: AbortSignal,
): PromiseRegistration | null {
  cancellationCheckpoint(signal);
  const call = PROMISE_SETUP.exec(source);
  if (call === null) {
    return null;
  }
  const options = source.slice(call.index, call.index + 600);
  const prefix = /prefix\s*:\s*'([^']*)'|prefix\s*:\s*"([^"]*)"/u.exec(options);
  const ignored = /ignoreNotifications\s*:\s*\[([^\]]*)\]/u.exec(options)?.[1] ?? '';

  const parsed = {
    prefix: prefix?.[1] ?? prefix?.[2] ?? 'notif_',
    ignored: [] as string[],
  };
  for (const entry of ignored.matchAll(/'([^']*)'|"([^"]*)"/gu)) {
    cancellationCheckpoint(signal);
    parsed.ignored.push(entry[1] ?? entry[2] ?? '');
  }
  return parsed;
}

/**
 * Reads the notification handlers a client declares.
 *
 * Recognizes explicit `dojo.subscribe` calls and the `notif_<name>` method
 * convention. A method is only a handler once something registers it, so the
 * registration is read too: `setupPromiseNotifications` may run anywhere in
 * the client, and a caller passes what it found there as `registration`.
 * Payload keys are the `notif.args.<key>` reads inside the handler.
 */
export function parseNotificationHandlers(
  source: string,
  registration?: PromiseRegistration | null,
  signal?: AbortSignal,
): HandlerOutcome {
  cancellationCheckpoint(signal);
  const effectiveRegistration =
    registration === undefined ? parsePromiseRegistration(source, signal) : registration;
  const handlers = new Map<string, NotificationHandler>();
  const unsupported: string[] = [];
  const duplicates: string[] = [];

  const methodMatches = [
    ...source.matchAll(handlerMethodPattern(effectiveRegistration?.prefix ?? 'notif_')),
  ];
  for (const [index, match] of methodMatches.entries()) {
    cancellationCheckpoint(signal);
    const name = match[1];
    if (name === undefined) {
      continue;
    }
    const start = match.index;
    const end = methodMatches[index + 1]?.index ?? source.length;
    const body = source.slice(start, end);
    const payloadKeys = new Set<string>();
    for (const read of body.matchAll(
      /\bargs\s*(?:\.\s*([A-Za-z_$][\w$]*)|\[\s*'([^']+)'\s*\])/gu,
    )) {
      cancellationCheckpoint(signal);
      const key = read[1] ?? read[2];
      if (key !== undefined && !FRAMEWORK_PAYLOAD_KEYS.has(key)) {
        payloadKeys.add(key);
      }
    }
    handlers.set(name, {
      name,
      binding: 'method',
      bound: effectiveRegistration !== null && !effectiveRegistration.ignored.includes(name),
      payloadKeys: [...payloadKeys].sort(),
    });
  }

  const subscribed = new Set<string>();
  for (const match of source.matchAll(SUBSCRIBE)) {
    cancellationCheckpoint(signal);
    const name = match[1] ?? match[2];
    if (name === undefined) {
      unsupported.push(
        `notification subscribed with a computed name: ${(match[3] ?? '').trim().slice(0, 40)}`,
      );
      continue;
    }
    if (subscribed.has(name)) {
      duplicates.push(name);
    }
    subscribed.add(name);
    const existing = handlers.get(name);
    // A manual subscription binds the handler whatever the registration says;
    // it is the documented way to attach an ignored notification.
    handlers.set(name, {
      name,
      binding: 'subscribe',
      bound: true,
      payloadKeys: existing?.payloadKeys ?? [],
    });
  }

  cancellationCheckpoint(signal);
  return {
    value: [...handlers.values()].sort((left, right) => left.name.localeCompare(right.name)),
    unsupported,
    duplicates: [...new Set(duplicates)].sort(),
    registration: effectiveRegistration,
  };
}
