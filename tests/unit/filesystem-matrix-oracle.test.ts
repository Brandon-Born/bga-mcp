import {
  expectMatrixDeadlineOrder,
  type FilesystemMatrixEvent,
  type FilesystemMatrixProbeResult,
} from '../helpers/filesystem-matrix.js';

const target = 'readProjectFile:close';
function result(
  late: boolean,
  firstSnapshotIncludesCompletion = true,
): FilesystemMatrixProbeResult {
  const events: FilesystemMatrixEvent[] = [];
  function add(event: string, time: number, files: number, expired: boolean, operation?: string) {
    events.push({
      sequence: events.length + 1,
      event,
      time,
      files,
      directories: 0,
      expired,
      ...(operation === undefined ? {} : { operation }),
    });
  }
  add('file:acquired', 0, 1, false);
  add('cleanup:start', 1, 1, false, target);
  add('selected:issued', 2, 1, false, target);
  add('deadline:expire', 3, 1, true);
  if (late) {
    add('cleanup:ceiling', 253, 1, true);
    add('response:timeout', 254, 1, true);
  }
  add('file:released', late ? 603 : 153, 0, true);
  add('cleanup:end', late ? 604 : 154, 0, true, target);
  if (!late) add('response:timeout', 155, 0, true);
  const text = (rows: readonly FilesystemMatrixEvent[]) =>
    rows.map((event) => JSON.stringify(event)).join('\n') + '\n';
  const full = text(events);
  const published = events.findIndex((event) => event.event === 'response:timeout');
  return {
    response: { isError: true, text: 'policy.timeout.exceeded' },
    setup: { isError: false, text: 'ready' },
    stderr: '',
    atSettlement: firstSnapshotIncludesCompletion ? full : text(events.slice(0, published + 1)),
    afterWait: full,
    afterQuiescence: full,
  };
}
function lateHandleCleanup(firstSnapshotIncludesCompletion: boolean): FilesystemMatrixProbeResult {
  const rows = [
    { event: 'work:start', operation: 'readProjectFile:open', time: 1, expired: false, files: 0 },
    {
      event: 'selected:issued',
      operation: 'readProjectFile:open',
      time: 2,
      expired: false,
      files: 0,
    },
    { event: 'deadline:expire', time: 3, expired: true, files: 0 },
    { event: 'file:acquired', time: 153, expired: true, files: 1 },
    { event: 'work:end', operation: 'readProjectFile:open', time: 154, expired: true, files: 1 },
    {
      event: 'cleanup:start',
      operation: 'readProjectFile:close',
      time: 155,
      expired: true,
      files: 1,
    },
    { event: 'cleanup:ceiling', time: 253, expired: true, files: 1 },
    { event: 'response:timeout', time: 254, expired: true, files: 1 },
    { event: 'file:released', time: 555, expired: true, files: 0 },
    {
      event: 'cleanup:end',
      operation: 'readProjectFile:close',
      time: 556,
      expired: true,
      files: 0,
    },
  ].map((event, index) => ({ ...event, sequence: index + 1, directories: 0 }));
  const text = (events: typeof rows) =>
    events.map((event) => JSON.stringify(event)).join('\n') + '\n';
  const full = text(rows);
  return {
    response: { isError: true, text: 'policy.timeout.exceeded' },
    setup: { isError: false, text: 'ready' },
    stderr: '',
    atSettlement: firstSnapshotIncludesCompletion ? full : text(rows.slice(0, 8)),
    afterWait: full,
    afterQuiescence: full,
  };
}

function change(
  probe: FilesystemMatrixProbeResult,
  edit: (events: FilesystemMatrixEvent[]) => FilesystemMatrixEvent[],
): FilesystemMatrixProbeResult {
  const modify = (text: string) =>
    edit(
      text
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as FilesystemMatrixEvent),
    )
      .map((event, index) => JSON.stringify({ ...event, sequence: index + 1 }))
      .join('\n') + '\n';
  return {
    ...probe,
    atSettlement: modify(probe.atSettlement),
    afterWait: modify(probe.afterWait),
    afterQuiescence: modify(probe.afterQuiescence),
  };
}

describe('filesystem deadline oracle causal ordering (synthetic transcripts)', () => {
  it('accepts cleanup before publication with zero resources and completed cleanup', () => {
    expect(() => expectMatrixDeadlineOrder(result(false), target, 150)).not.toThrow();
  });
  it.each([false, true])(
    'accepts genuine ceiling-before-publication when parent first read includes completion=%s',
    (includesCompletion) => {
      const probe = result(true, includesCompletion);
      expect(probe.atSettlement === probe.afterWait).toBe(includesCompletion);
      expect(() => expectMatrixDeadlineOrder(probe, target, 600)).not.toThrow();
    },
  );
  it.each([false, true])(
    'accepts selected work completing before publication while native handle cleanup crosses the ceiling, late parent=%s',
    (lateParent) => {
      expect(() =>
        expectMatrixDeadlineOrder(lateHandleCleanup(lateParent), 'readProjectFile:open', 150),
      ).not.toThrow();
    },
  );
  it('rejects removed waiting even if the parent first reads after completion', () => {
    const probe = change(result(true), (events) =>
      events.filter((event) => event.event !== 'cleanup:ceiling'),
    );
    expect(probe.atSettlement).toBe(probe.afterWait);
    expect(() => expectMatrixDeadlineOrder(probe, target, 600)).toThrow();
    const pendingHandle = change(lateHandleCleanup(true), (events) =>
      events.filter((event) => event.event !== 'cleanup:ceiling'),
    );
    expect(() => expectMatrixDeadlineOrder(pendingHandle, 'readProjectFile:open', 150)).toThrow();
  });
  it('rejects a ceiling recorded after publication', () => {
    const probe = change(result(true), (events) => {
      const ceiling = events.findIndex((event) => event.event === 'cleanup:ceiling');
      const first = events[ceiling];
      const second = events[ceiling + 1];
      if (!first || !second) throw new Error('Missing fixture ceiling/publication');
      [events[ceiling], events[ceiling + 1]] = [second, first];
      return events;
    });
    expect(() => expectMatrixDeadlineOrder(probe, target, 600)).toThrow();
  });
  it('rejects publication before the required real cleanup interval', () => {
    const probe = change(result(true), (events) =>
      events.map((event) => (event.event === 'response:timeout' ? { ...event, time: 20 } : event)),
    );
    expect(() => expectMatrixDeadlineOrder(probe, target, 600)).toThrow();
  });
  it('rejects early publication that precedes terminal directory cleanup', () => {
    const probe = change(result(false), (events) => {
      const publication = events.pop();
      const completion = events.at(-1);
      if (!publication || !completion) throw new Error('Missing fixture events');
      return [...events.slice(0, -1), publication, completion];
    });
    expect(() => expectMatrixDeadlineOrder(probe, target, 150)).toThrow();
  });
  it('rejects leaked resources and work started after expiry', () => {
    const leaked = change(result(false), (events) =>
      events.map((event) => ({ ...event, files: 1 })),
    );
    expect(() => expectMatrixDeadlineOrder(leaked, target, 150)).toThrow();
    const work = change(result(true), (events) => {
      const last = events.at(-1);
      if (!last) throw new Error('Missing fixture terminal event');
      return [...events, { ...last, event: 'work:start', operation: 'walk:lstat' }];
    });
    expect(() => expectMatrixDeadlineOrder(work, target, 600)).toThrow();
  });
});
