import type { ParseOutcome } from './parse.js';

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
  /** Payload keys the handler reads. */
  readonly payloadKeys: readonly string[];
}

/** Keys the framework adds to every notification payload. */
const FRAMEWORK_PAYLOAD_KEYS = new Set(['i18n', 'player_name', 'player_id']);

// Legacy: notifyAllPlayers / notifyPlayer. Modern: $this->bga->notify->all /
// ->player, documented in the BGA Studio migration guide. Both are read,
// because the documentation marks the legacy form superseded, not removed.
const NOTIFY =
  /(?:\$this->|self::|static::)?notify(All)?Player(?:s)?\s*\(|->bga->notify->(all|player)\s*\(/gu;
// Legacy object literals use `notif_x: function`, modern classes use
// `async notif_x(notif)`. Both bind the same way as far as the framework is
// concerned. https://en.doc.boardgamearena.com/BGA_Studio_Migration_Guide
const HANDLER_METHOD = /(?:async\s+)?notif_([A-Za-z_]\w*)\s*(?:[:=]\s*(?:function|\()|\()/gu;
const SUBSCRIBE =
  /(?:dojo\.subscribe|this\.subscribeNotif)\s*\(\s*(?:'([^']*)'|"([^"]*)"|([^,)]+))/gu;

/** Splits a call's arguments at top level, respecting nesting and strings. */
function splitArguments(source: string, openIndex: number): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  let quote: string | null = null;

  for (let index = openIndex; index < source.length; index += 1) {
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

function phpArrayKeys(literal: string): string[] {
  const keys: string[] = [];
  for (const match of literal.matchAll(/(?:'([^']+)'|"([^"]+)")\s*=>/gu)) {
    const key = match[1] ?? match[2];
    if (key !== undefined && !FRAMEWORK_PAYLOAD_KEYS.has(key)) {
      keys.push(key);
    }
  }
  return [...new Set(keys)].sort();
}

function stringLiteral(argument: string): string | null {
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
export function parseSentNotifications(source: string): ParseOutcome<readonly SentNotification[]> {
  const sent: SentNotification[] = [];
  const unsupported: string[] = [];

  for (const match of source.matchAll(NOTIFY)) {
    const modern = match[2];
    const scope: 'all' | 'player' =
      modern === undefined
        ? match[1] === undefined
          ? 'player'
          : 'all'
        : (modern as 'all' | 'player');
    const parts = splitArguments(source, match.index + match[0].length - 1);
    // notifyAllPlayers(name, message, args); notifyPlayer(playerId, name, message, args)
    const nameArgument = scope === 'all' ? parts[0] : parts[1];
    const payloadArgument = scope === 'all' ? parts[2] : parts[3];
    if (nameArgument === undefined) {
      continue;
    }

    const name = stringLiteral(nameArgument);
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
    sent.push({ name, payloadKeys: phpArrayKeys(payloadArgument), scope });
  }

  return { value: sent, unsupported };
}

export interface HandlerOutcome extends ParseOutcome<readonly NotificationHandler[]> {
  /** Names subscribed more than once. A fact, not an unreadable construct. */
  readonly duplicates: readonly string[];
}

/**
 * Reads the notification handlers a client declares.
 *
 * Recognizes explicit `dojo.subscribe` calls and the `notif_<name>` method
 * convention the modern framework binds automatically. Payload keys are the
 * `notif.args.<key>` reads inside the handler.
 */
export function parseNotificationHandlers(source: string): HandlerOutcome {
  const handlers = new Map<string, NotificationHandler>();
  const unsupported: string[] = [];
  const duplicates: string[] = [];

  const methodMatches = [...source.matchAll(HANDLER_METHOD)];
  for (const [index, match] of methodMatches.entries()) {
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
      const key = read[1] ?? read[2];
      if (key !== undefined && !FRAMEWORK_PAYLOAD_KEYS.has(key)) {
        payloadKeys.add(key);
      }
    }
    handlers.set(name, {
      name,
      binding: 'method',
      payloadKeys: [...payloadKeys].sort(),
    });
  }

  const subscribed = new Set<string>();
  for (const match of source.matchAll(SUBSCRIBE)) {
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
    handlers.set(name, {
      name,
      binding: 'subscribe',
      payloadKeys: existing?.payloadKeys ?? [],
    });
  }

  return {
    value: [...handlers.values()].sort((left, right) => left.name.localeCompare(right.name)),
    unsupported,
    duplicates: [...new Set(duplicates)].sort(),
  };
}
