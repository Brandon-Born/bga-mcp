import type { PolicyBoundary } from './policy.js';
import { redactText, redactValue, type RedactionOptions } from './redaction.js';

/**
 * The one place a successful result leaves this process.
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
 * 5. The budget is measured last, on what is actually about to be sent.
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
  policy.assertOutputWithinLimit(label, `${JSON.stringify(structuredContent)}${text}`);
  return { content: [{ type: 'text', text }], structuredContent };
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
  label: string,
  value: unknown,
  options: PublishOptions = {},
): string {
  const redacted = redactValue(value, publicationOptions(policy, options));
  const text = `${JSON.stringify(redacted, null, 2)}\n`;
  policy.assertOutputWithinLimit(label, text);
  return text;
}
