import { expect } from 'vitest';

/** Test-only observations from the installed process; not a production hook. */
export interface FilesystemMatrixProbeResult {
  readonly response: { readonly isError: boolean; readonly text: string };
  readonly setup: { readonly isError: boolean; readonly text: string };
  readonly stderr: string;
  readonly atSettlement: string;
  readonly afterWait: string;
  readonly afterQuiescence: string;
}

export interface FilesystemMatrixEvent {
  readonly sequence: number;
  readonly event: string;
  readonly operation?: string;
  readonly expired: boolean;
  readonly files: number;
  readonly directories: number;
  readonly time: number;
}
export function matrixEvents(text: string): FilesystemMatrixEvent[] {
  return text
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as FilesystemMatrixEvent);
}

export function matrixCleanupObserved(
  events: readonly FilesystemMatrixEvent[],
  target: string,
): boolean {
  const issued = events.findIndex((event) => event.event === 'selected:issued');
  const completed = events.some(
    (event, index) =>
      index > issued &&
      (event.event === 'work:end' || event.event === 'cleanup:end') &&
      event.operation === target,
  );
  const last = events.at(-1);
  return (
    issued >= 0 &&
    completed &&
    last?.files === 0 &&
    last.directories === 0 &&
    events.filter((event) => event.event === 'work:start').length ===
      events.filter((event) => event.event === 'work:end').length &&
    events.filter((event) => event.event === 'cleanup:start').length ===
      events.filter((event) => event.event === 'cleanup:end').length &&
    // Iterator return releases the native directory, but the policy's finally
    // still awaits close(). Observe that terminal cleanup too; an intermediate
    // balanced transcript is not proof that no further cleanup will start.
    events.filter((event) => event.event === 'directory:acquired').length ===
      events.filter(
        (event) => event.event === 'cleanup:end' && event.operation === 'walk:dir-close',
      ).length
  );
}

export function expectMatrixQuiescence(result: FilesystemMatrixProbeResult) {
  expect(result.response.isError, result.response.text).toBe(true);
  expect(result.response.text).toContain('policy.timeout.exceeded');
  expect(result.setup.isError, result.setup.text).toBe(false);
  expect(result.stderr).not.toContain('Unhandled');
  expect(result.stderr).not.toContain('Closing file descriptor');
  const events = matrixEvents(result.afterWait);
  expect(events.map((event) => event.sequence)).toEqual(events.map((_, index) => index + 1));
  expect(events.filter((event) => event.event === 'selected:issued')).toHaveLength(1);
  const issued = events.findIndex((event) => event.event === 'selected:issued');
  const expired = events.findIndex((event) => event.event === 'deadline:expire');
  expect(expired).toBeGreaterThan(issued);
  expect(events.filter((event) => event.event === 'work:start' && event.expired)).toEqual([]);
  expect(events.at(-1), JSON.stringify(events)).toMatchObject({ files: 0, directories: 0 });
  expect(result.afterQuiescence).toBe(result.afterWait);
  return events;
}

export function expectMatrixDeadlineOrder(
  result: FilesystemMatrixProbeResult,
  target: string,
  completionMs: number,
): void {
  const events = expectMatrixQuiescence(result);
  expect(matrixCleanupObserved(events, target)).toBe(true);
  const published = events.findIndex((event) => event.event === 'response:timeout');
  const expired = events.findIndex((event) => event.event === 'deadline:expire');
  const completed = events.findIndex(
    (event, index) =>
      index > expired &&
      (event.event === 'work:end' || event.event === 'cleanup:end') &&
      event.operation === target,
  );
  expect(published).toBeGreaterThan(expired);
  expect(completed).toBeGreaterThan(expired);
  if (matrixCleanupObserved(events.slice(0, published + 1), target)) {
    expect(published).toBeGreaterThan(completed);
    // Establish quiescence at publication from the child events themselves.
    // The parent may read its first snapshot only after late cleanup completed.
    expect(events[published]).toMatchObject({ files: 0, directories: 0 });
  } else {
    // Any native work or handle cleanup remaining at publication requires the actual production
    // cleanup timer fired. Removed awaiting still fails: it publishes before
    // that timer, regardless of runner speed or the nominal injected delay.
    const ceiling = events.findIndex((event) => event.event === 'cleanup:ceiling');
    expect(ceiling).toBeGreaterThan(expired);
    expect(published).toBeGreaterThan(ceiling);
    const publication = events[published];
    const expiry = events[expired];
    if (!publication || !expiry) throw new Error('Missing timeout/expiry transcript events');
    expect(publication.time - expiry.time).toBeGreaterThanOrEqual(200);
  }
  if (completionMs === 600) expect(completed).toBeGreaterThan(published);
}
