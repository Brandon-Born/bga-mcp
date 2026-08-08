import { z } from 'zod';

import { redactText, redactValue, type RedactionOptions } from './redaction.js';

export const ERROR_CONTRACT_VERSION = 1 as const;

/**
 * Stable public error codes. A code is part of the compatibility contract:
 * it may be added, but never repurposed or silently removed.
 */
export const ERROR_CODES = {
  configInvalid: 'config.invalid',
  policyRootUnconfigured: 'policy.root.unconfigured',
  policyRootNotAllowed: 'policy.root.not-allowed',
  policyRootUnavailable: 'policy.root.unavailable',
  policyPathTraversal: 'policy.path.traversal',
  policyPathSymlinkEscape: 'policy.path.symlink-escape',
  policyPathNotFound: 'policy.path.not-found',
  policyRemoteNotAllowed: 'policy.remote.not-allowed',
  resourceProjectAmbiguous: 'resource.project.ambiguous',
  policyNetworkDisabled: 'policy.network.disabled',
  policyDocSourceNotAllowed: 'policy.doc-source.not-allowed',
  policyDocAddressBlocked: 'policy.doc-address.blocked',
  policyDocRequestContent: 'policy.doc-request.content',
  policyDocFetchFailed: 'policy.doc-fetch.failed',
  policyStudioDisabled: 'policy.studio.disabled',
  policyStudioNoSession: 'policy.studio.no-session',
  policyStudioNotAllowed: 'policy.studio.not-allowed',
  policyMutationNotRequested: 'policy.mutation.not-requested',
  policyMutationDisabled: 'policy.mutation.disabled',
  policyTimeoutExceeded: 'policy.timeout.exceeded',
  policyOutputTooLarge: 'policy.output.too-large',
  internalUnexpected: 'internal.unexpected',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export const PUBLIC_ERROR_CODES: readonly ErrorCode[] = Object.values(ERROR_CODES);

export const PublicErrorSchema = z
  .strictObject({
    schemaVersion: z.literal(ERROR_CONTRACT_VERSION),
    code: z.enum(PUBLIC_ERROR_CODES as [ErrorCode, ...ErrorCode[]]),
    message: z.string().min(1),
    details: z.record(z.string(), z.unknown()).optional(),
  })
  .meta({
    title: 'bga-mcp public error',
    description: 'Version 1 wire contract for errors returned across the MCP boundary.',
  });

export type PublicError = z.infer<typeof PublicErrorSchema>;

export interface BgaMcpErrorOptions {
  /** Safe, already-structured context. Values are redacted before publication. */
  readonly details?: Record<string, unknown>;
  readonly cause?: unknown;
}

/** Base class for every failure that is safe to describe to a client. */
export class BgaMcpError extends Error {
  override readonly name: string = 'BgaMcpError';
  readonly code: ErrorCode;
  readonly details: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, options: BgaMcpErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.code = code;
    this.details = options.details ?? {};
  }
}

/** A request that the policy boundary refused. */
export class PolicyViolationError extends BgaMcpError {
  override readonly name = 'PolicyViolationError';
}

const UNEXPECTED_MESSAGE = 'The server failed unexpectedly. No further detail is safe to report.';

/**
 * Converts any thrown value into the stable public error contract.
 *
 * Known errors keep their code, message, and structured details. Anything else
 * collapses into `internal.unexpected` so stack traces, library internals, and
 * unredacted values never cross the MCP boundary.
 */
export function toPublicError(error: unknown, options: RedactionOptions = {}): PublicError {
  if (error instanceof BgaMcpError) {
    const details = redactValue(error.details, options) as Record<string, unknown>;
    return {
      schemaVersion: ERROR_CONTRACT_VERSION,
      code: error.code,
      message: redactText(error.message, options),
      ...(Object.keys(details).length === 0 ? {} : { details }),
    };
  }

  return {
    schemaVersion: ERROR_CONTRACT_VERSION,
    code: ERROR_CODES.internalUnexpected,
    message: UNEXPECTED_MESSAGE,
    details: { kind: error instanceof Error ? redactText(error.name, options) : typeof error },
  };
}

export function parsePublicError(value: unknown): PublicError {
  return PublicErrorSchema.parse(value);
}

export function getPublicErrorJsonSchema(): object {
  return z.toJSONSchema(PublicErrorSchema, { reused: 'ref' });
}
