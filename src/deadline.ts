/**
 * Cooperative monotonic deadlines for synchronous work.
 *
 * An AbortController timer cannot run while JavaScript is inside a long
 * synchronous parser. Registering the controller's deadline here lets parser
 * loops compare the clock themselves and abort at deterministic checkpoints.
 * The WeakMap is process-local and cannot extend a signal's lifetime.
 */

interface RegisteredDeadline {
  readonly expiresAt: number;
  readonly expire: () => void;
}

const deadlines = new WeakMap<AbortSignal, RegisteredDeadline>();

export function registerDeadline(
  signal: AbortSignal,
  timeoutMs: number,
  expire: () => void,
): () => void {
  deadlines.set(signal, { expiresAt: performance.now() + timeoutMs, expire });
  return () => {
    deadlines.delete(signal);
  };
}

/** Throws for an abort or a monotonic deadline, including inside sync loops. */
export function cancellationCheckpoint(signal?: AbortSignal): void {
  if (signal === undefined) {
    return;
  }
  signal.throwIfAborted();
  const deadline = deadlines.get(signal);
  if (deadline !== undefined && performance.now() >= deadline.expiresAt) {
    deadline.expire();
    signal.throwIfAborted();
  }
}

/**
 * Amortized checkpoint for character-by-character parsers.
 *
 * Reading the monotonic clock for every byte materially changes parser cost. A check
 * every 1,024 iterations keeps the longest uncancellable run small while the
 * bit mask keeps the hot path cheap. Index zero is checked deliberately, so an
 * operation already past its deadline never starts a large synchronous pass.
 */
export function periodicCancellationCheckpoint(iteration: number, signal?: AbortSignal): void {
  if ((iteration & 0x3ff) === 0) {
    cancellationCheckpoint(signal);
  }
}
