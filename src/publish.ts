import type { JSONRPCMessage, Transport } from '@modelcontextprotocol/server';

import { ERROR_CODES, PUBLIC_ERROR_CODES, toPublicError } from './errors.js';
import type { PolicyBoundary } from './policy.js';
import { redactText, redactValue, type RedactionOptions } from './redaction.js';

/**
 * The one place a result leaves this process, successful or not.
 *
 * Failures already had such a place. Successes did not, and the 2026-08-08
 * review found what that costs: a password inside a SQL literal came back
 * verbatim from `audit_database_usage`, because every tool was individually
 * careful about the things its author had thought of. A control that depends on
 * each call site remembering is not a control, so this function owns the whole
 * boundary — minimize, redact, render, measure — and every tool and resource
 * goes through it.
 *
 * Order matters and is the point:
 *
 * 1. The structured content is parsed against its published schema, so what is
 *    redacted below is what the contract says the result is.
 * 2. It is redacted, then parsed again. Redaction that broke the shape would be
 *    a different result rather than a safer one, and the second parse is what
 *    makes "schema-preserving" a checked claim instead of an intention.
 * 3. The text summary is rendered *from the redacted structure*. A summary built
 *    from the original would reintroduce, in prose, exactly the values that were
 *    just removed from the fields — which is how a redaction boundary that looks
 *    complete publishes anyway.
 * 4. The rendered text is redacted too, because a summary can name something no
 *    field holds.
 * 5. The budget is measured last, on the exact payload about to be sent.
 *
 * The same budget bounds a failure. The review found that half missing too: a
 * refusal carrying a 12,000-character argument came back as a 12,162-byte
 * result under a 64-byte budget, because the shrinking ladder below did not
 * exist and the argument was never capped on its way into the details.
 *
 * ## What the budget measures
 *
 * `JSON.stringify` of the payload this server owns — the `CallToolResult`, or a
 * resource's `contents` — in UTF-8 bytes. It does not include the JSON-RPC
 * envelope the transport wraps around it: the framing is the protocol library's
 * and can change with a protocol revision, so a server-owned budget that
 * counted it would mean something different from one release to the next.
 * Framing is small, constant per message, and measured separately by the
 * packaged scenario rather than assumed.
 */

/** The published contract of a result: anything that can validate its own shape. */
export interface OutputShape<Result> {
  readonly parse: (value: unknown) => Result;
}

export interface PublishOptions {
  /** How filesystem-looking text is treated. See {@link RedactionOptions.paths}. */
  readonly paths?: RedactionOptions['paths'];
}

function publicationOptions(policy: PolicyBoundary, options: PublishOptions): RedactionOptions {
  return { ...policy.redactionOptions, paths: options.paths ?? 'shape' };
}

/**
 * Publishes a successful tool result.
 *
 * `summarize` receives the redacted structure rather than the original, so a
 * summary cannot say what the fields no longer do.
 */
export function publishResult<Result>(
  policy: PolicyBoundary,
  label: string,
  shape: OutputShape<Result>,
  value: unknown,
  summarize: (result: Result) => string,
  options: PublishOptions = {},
): { content: { type: 'text'; text: string }[]; structuredContent: Result } {
  const redaction = publicationOptions(policy, options);
  const structuredContent = shape.parse(redactValue(shape.parse(value), redaction));
  const text = redactText(summarize(structuredContent), redaction);
  const result = { content: [{ type: 'text' as const, text }], structuredContent };
  // Measured on the payload rather than on its parts: the wrapper is bytes the
  // client receives too, and a budget that ignored them would be a budget for
  // something nobody sends.
  policy.assertOutputWithinLimit(label, JSON.stringify(result));
  return result;
}

/**
 * Publishes a successful resource body.
 *
 * A resource has no structured content and no summary — the JSON document is
 * the whole result — so this is the same boundary with the parts that do not
 * apply left out, rather than a second boundary with its own rules.
 */
export function publishJson(
  policy: PolicyBoundary,
  uri: URL,
  label: string,
  value: unknown,
  options: PublishOptions = {},
): { contents: { uri: string; mimeType: string; text: string }[] } {
  const redacted = redactValue(value, publicationOptions(policy, options));
  const text = `${JSON.stringify(redacted, null, 2)}\n`;
  const result = { contents: [{ uri: uri.href, mimeType: 'application/json', text }] };
  policy.assertOutputWithinLimit(label, JSON.stringify(result));
  return result;
}

/** What a failure says when the failure itself did not fit. */
const BUDGET_MESSAGE = 'The result did not fit the configured output budget.';

function failureResult(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): { isError: true; content: { type: 'text'; text: string }[] } {
  const suffix = details === undefined ? '' : ` ${JSON.stringify(details)}`;
  return { isError: true, content: [{ type: 'text', text: `${code}: ${message}${suffix}` }] };
}

function payloadBytes(payload: unknown): number {
  return Buffer.byteLength(JSON.stringify(payload), 'utf8');
}

/**
 * The smallest budget a server can be started with.
 *
 * A budget below this could not hold the shortest failure this server is able
 * to produce, so every result would be refused and the refusal would be refused
 * too. Startup rejects it rather than accepting a configuration in which
 * nothing can ever be answered. It is derived from the longest error code
 * rather than picked, so adding a code cannot quietly make the floor wrong.
 */
export const MINIMUM_OUTPUT_BYTES = Math.max(
  ...PUBLIC_ERROR_CODES.map((code) => payloadBytes(failureResult(code, BUDGET_MESSAGE))),
);

/**
 * Renders any failure as the stable public error a client receives, within the
 * configured budget.
 *
 * Three rungs, most informative first: the message with its structured details,
 * the message alone, and — always small enough to send — the code with a fixed
 * sentence. The code survives every rung, because which refusal happened is
 * what a caller branches on, and the rejected value survives none of them.
 */
export function publishFailure(
  policy: PolicyBoundary,
  error: unknown,
): { isError: true; content: { type: 'text'; text: string }[] } {
  const published = toPublicError(error, policy.redactionOptions);
  const budget = policy.config.maxOutputBytes;
  const candidates = [
    failureResult(published.code, published.message, published.details),
    failureResult(published.code, published.message),
  ];
  return (
    candidates.find((candidate) => payloadBytes(candidate) <= budget) ??
    failureResult(published.code, BUDGET_MESSAGE)
  );
}

/**
 * The last bound, on the way out of the process.
 *
 * Everything above bounds what this server's own handlers produce. Not every
 * payload is one of those: the protocol library validates a call's arguments
 * before any handler runs, and its rejection is a result this server sends
 * without ever having seen it. A 12,000-character property name came back as a
 * 12,145-byte result under a 137-byte budget that way — nothing in the server
 * was wrong, and the byte count was the caller's to choose anyway.
 *
 * So the budget is applied once more where every payload passes: the transport
 * this server owns. `serveStdio` takes the transport as an argument for exactly
 * this kind of reason, and only `send` is wrapped, so nothing else about the
 * transport's behaviour changes.
 *
 * It bounds a tool result and a resource read — the payloads the budget is
 * about, recognizable by their own shape — and the message of an error
 * response. A catalog is deliberately left alone: `tools/list` is this server
 * describing itself, its size is not the caller's to choose, and refusing it
 * would make a small budget mean "cannot be discovered" rather than "answers
 * briefly".
 */
export function boundOutgoingPayloads<T extends { send: Transport['send'] }>(
  transport: T,
  policy: PolicyBoundary,
): T {
  const send = transport.send.bind(transport);
  transport.send = async (message, options) => {
    await send(boundMessage(message, policy.config.maxOutputBytes), options);
  };
  return transport;
}

/** The parts of an outgoing message this bound looks at. */
interface OutgoingEnvelope {
  readonly result?: { readonly content?: unknown; readonly contents?: unknown };
  readonly error?: { readonly code?: unknown; readonly message?: unknown };
}

/** True for the payload shapes this budget is about: a tool result, a resource read. */
function isPublishedPayload(result: NonNullable<OutgoingEnvelope['result']>): boolean {
  return Array.isArray(result.content) || Array.isArray(result.contents);
}

function boundMessage(message: JSONRPCMessage, budget: number): JSONRPCMessage {
  const envelope = message as OutgoingEnvelope;
  const { result, error } = envelope;
  if (result !== undefined) {
    if (isPublishedPayload(result) && payloadBytes(result) > budget) {
      return {
        ...message,
        result: failureResult(ERROR_CODES.policyOutputTooLarge, BUDGET_MESSAGE),
      };
    }
    return message;
  }

  if (error !== undefined && payloadBytes(error) > budget) {
    return {
      ...message,
      // The code is the protocol library's and stays: a caller branches on it,
      // and it is not the part that grew.
      error: {
        code: error.code,
        message: `${ERROR_CODES.policyOutputTooLarge}: ${BUDGET_MESSAGE}`,
      },
    } as unknown as JSONRPCMessage;
  }
  return message;
}

/**
 * The same ladder for a resource, which has no result to put an error in.
 *
 * A resource failure leaves as a protocol error, so it is a thrown message
 * rather than a payload — but it is a message this server wrote, of a length
 * this server chose, and the budget applies to it for the same reason.
 */
export function publishResourceFailure(policy: PolicyBoundary, error: unknown): never {
  const published = toPublicError(error, policy.redactionOptions);
  const budget = policy.config.maxOutputBytes;
  const details = published.details === undefined ? '' : ` ${JSON.stringify(published.details)}`;
  const candidates = [
    `${published.code}: ${published.message}${details}`,
    `${published.code}: ${published.message}`,
  ];
  const fitting =
    candidates.find((candidate) => Buffer.byteLength(candidate, 'utf8') <= budget) ??
    `${published.code}: ${BUDGET_MESSAGE}`;
  throw new Error(fitting);
}
