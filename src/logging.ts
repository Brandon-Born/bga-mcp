import { toPublicError } from './errors.js';
import { redactText, type RedactionOptions } from './redaction.js';

/**
 * Log lines are part of the output boundary: stderr is captured by MCP clients
 * and by CI artifacts. Every line leaves this module already redacted.
 */
export function formatErrorLog(
  scope: string,
  error: unknown,
  options: RedactionOptions = {},
): string {
  const published = toPublicError(error, options);
  return `bga-mcp ${scope} [${published.code}]: ${published.message}\n`;
}

export function formatMessageLog(
  scope: string,
  message: string,
  options: RedactionOptions = {},
): string {
  return `bga-mcp ${scope}: ${redactText(message, options)}\n`;
}
