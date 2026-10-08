// secret-scan:allow-file Original non-secret credential canaries, never a real session.
import { chmod, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { connectStdio } from '../helpers/mcp.js';
import {
  callTool,
  digestDirectory,
  installPackagedServer,
  type PackagedServer,
} from '../helpers/packaged.js';
import { runCommand } from '../helpers/process.js';
import { waitForProcessExit } from '../helpers/scenario.js';

const matrixModule = new URL('./fs-matrix-stub.ts', import.meta.url).href;
const denyModule = new URL('./network-denied.ts', import.meta.url).href;
const CANARY = 'deadline-provider-content-must-not-be-published';
let server: PackagedServer<'legacy'>;
let session: string;

interface Event {
  sequence: number;
  event: string;
  operation?: string;
  expired: boolean;
  files: number;
  directories: number;
  time: number;
}
function events(source: string): Event[] {
  return source
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Event);
}
function complete(transcript: Event[], target: string): boolean {
  const selected = transcript.findIndex((event) => event.event === 'selected:issued');
  return (
    (!target.startsWith('readPackagedConfig:') ||
      transcript.filter((event) => event.event === 'readFile:signal').length ===
        transcript.filter((event) => event.event === 'work:end' && event.operation === target)
          .length) &&
    selected >= 0 &&
    transcript.some(
      (event, index) =>
        index > selected &&
        event.operation === target &&
        ['work:end', 'cleanup:end'].includes(event.event),
    ) &&
    transcript.at(-1)?.files === 0 &&
    transcript.at(-1)?.directories === 0 &&
    transcript.filter((event) => event.event === 'work:start').length ===
      transcript.filter((event) => event.event === 'work:end').length &&
    transcript.filter((event) => event.event === 'cleanup:start').length ===
      transcript.filter((event) => event.event === 'cleanup:end').length
  );
}
async function observe(log: string, target: string): Promise<string> {
  const stop = performance.now() + 5_000;
  let text = await readFile(log, 'utf8');
  while (!complete(events(text), target) && performance.now() < stop) {
    await new Promise<void>((ready) => {
      setTimeout(ready, 25);
    });
    text = await readFile(log, 'utf8');
  }
  return text;
}
function assertOrder(text: string, target: string, atSettlement?: string): void {
  const transcript = events(text);
  expect(complete(transcript, target), text).toBe(true);
  expect(transcript.map((event) => event.sequence)).toEqual(
    transcript.map((_, index) => index + 1),
  );
  const issued = transcript.findIndex((event) => event.event === 'selected:issued');
  const expired = transcript.findIndex((event) => event.event === 'deadline:expire');
  const published = transcript.findIndex((event) => event.event === 'response:timeout');
  const completed = transcript.findIndex(
    (event, index) =>
      index > issued &&
      event.operation === target &&
      ['work:end', 'cleanup:end'].includes(event.event),
  );
  expect(expired).toBeGreaterThan(issued);
  expect(completed).toBeGreaterThan(expired);
  expect(published).toBeGreaterThan(expired);
  expect(transcript.filter((event) => event.event === 'work:start' && event.expired)).toEqual([]);
  if (published < completed || (atSettlement !== undefined && atSettlement !== text)) {
    const ceiling = transcript.findIndex((event) => event.event === 'cleanup:ceiling');
    expect(ceiling).toBeGreaterThan(expired);
    expect(published).toBeGreaterThan(ceiling);
    const publication = transcript[published];
    const expiry = transcript[expired];
    if (!publication || !expiry) throw new Error('Missing publication or expiry');
    expect(publication.time - expiry.time).toBeGreaterThanOrEqual(200);
  }
}

async function probe(
  target: string,
  completionMs: number,
  era = '2025-11-25',
  startup = false,
  recoveryMs = 0,
) {
  const log = resolve(server.temporaryRoot, 'remaining-matrix.log');
  const network = resolve(server.temporaryRoot, 'remaining-network.log');
  await writeFile(log, '');
  await writeFile(network, '');
  const provider = target.startsWith('readSessionFile:');
  const roots = target.startsWith('ensureClientRoots:');
  const configuration = target.startsWith('readPackagedConfig:');
  const rootDigest = await digestDirectory(server.projects.legacy);
  const environment = {
    ...process.env,
    BGA_MCP_FS_MATRIX_TARGET: target,
    BGA_MCP_FS_MATRIX_OCCURRENCE: '1',
    BGA_MCP_FS_MATRIX_COMPLETION_MS: String(completionMs),
    BGA_MCP_FS_MATRIX_TRANSCRIPT: log,
    BGA_MCP_FS_MATRIX_STARTUP: startup ? '1' : '0',
    BGA_MCP_FS_MATRIX_RECOVERY_MS: String(recoveryMs),
    BGA_MCP_NETWORK_LOG: network,
    BGA_STUDIO_SESSION: '',
  };
  const arguments_ = [
    '--import',
    'tsx',
    '--import',
    denyModule,
    '--import',
    matrixModule,
    server.cli,
    '--operation-timeout-ms',
    '100',
    ...(!roots ? ['--project-root', server.projects.legacy] : []),
    ...(provider ? ['--experimental-studio-logs', '--studio-session-file', session] : []),
    ...(configuration && !startup ? ['--allow-network'] : []),
  ];
  if (startup) {
    const response = await runCommand(process.execPath, arguments_, {
      env: environment,
      timeoutMs: 20_000,
    });
    expect(response.exitCode).not.toBe(0);
    expect(response.stderr).toContain('policy.timeout.exceeded');
    expect(response.stdout + response.stderr).not.toContain(CANARY);
    expect(response.stdout + response.stderr).not.toContain(session);
    const final = await observe(log, target);
    assertOrder(final, target);
    expect(await readFile(network, 'utf8')).toBe('');
    expect(await digestDirectory(server.projects.legacy)).toBe(rootDigest);
    return { text: final, atSettlement: final };
  }
  const connection = await connectStdio(process.execPath, arguments_, {
    env: environment,
    timeoutMs: 20_000,
    protocolVersion: era,
    ...(roots
      ? {
          clientOptions: {
            capabilities: { roots: {} },
            ...(era === '2026-07-28' ? { inputRequired: { autoFulfill: true, maxRounds: 4 } } : {}),
          },
        }
      : {}),
  });
  let rootRequests = 0;
  if (roots)
    connection.client.setRequestHandler('roots/list', async () => {
      await Promise.resolve();
      rootRequests++;
      return { roots: [{ uri: pathToFileURL(server.projects.legacy).href }] };
    });
  const processId = connection.transport.pid;
  try {
    const response = configuration
      ? await connection.client
          .readResource({ uri: 'bga://docs/states' }, { timeout: 20_000 })
          .then(
            () => 'unexpected success',
            (error: unknown) => String(error),
          )
      : (await callTool(connection.client, roots ? 'inspect_project' : 'check_setup', {}, 20_000))
          .text;
    expect(response).toContain('policy.timeout.exceeded');
    expect(response).not.toContain(CANARY);
    const atSettlement = await readFile(log, 'utf8');
    const final = await observe(log, target);
    assertOrder(final, target, atSettlement);
    if (configuration)
      expect(events(final)).toContainEqual(
        expect.objectContaining({ event: 'readFile:signal', operation: 'aborted' }),
      );
    await new Promise<void>((ready) => {
      setTimeout(ready, 100);
    });
    expect(await readFile(log, 'utf8')).toBe(final);
    expect(await readFile(network, 'utf8')).toBe('');
    if (configuration) {
      const retryResult = await connection.client
        .readResource({ uri: 'bga://docs/states' }, { timeout: 20_000 })
        .then(
          () => 'unexpected success',
          (error: unknown) => String(error),
        );
      const retryText = await observe(log, target);
      const retry = events(retryText);
      expect(complete(retry, target), retryText).toBe(true);
      expect(
        retry.filter((event) => event.event === 'work:start' && event.operation === target),
        'A cancelled catalog must be read again before it can be reused.',
      ).toHaveLength(2);
      const retryNetwork = await readFile(network, 'utf8');
      if (retryNetwork === '') {
        expect(retryResult).toContain('policy.timeout.exceeded');
        expect(retryResult).toContain('"operation":"bga-docs-topic"');
        expect(retryResult).toContain('"timeoutMs":100');
      } else {
        expect(retryNetwork).toBe('https.request\n');
        expect(retryResult).toContain(
          'internal.unexpected: The server failed unexpectedly. No further detail is safe to report.',
        );
        expect(retryResult).toContain('"kind":"Error"');
      }
      expect(retryResult).not.toContain(CANARY);
      expect(retryResult).not.toContain(session);
      if (recoveryMs > 0) {
        expect(retryNetwork).toBe('');
        expect(retry).toContainEqual(
          expect.objectContaining({ event: 'recovery:issued', operation: target }),
        );
      }
      await new Promise<void>((ready) => {
        setTimeout(ready, 100);
      });
      expect(await readFile(log, 'utf8')).toBe(retryText);
      expect(await readFile(network, 'utf8')).toBe(retryNetwork);
    }
    // Discovery proves that this same transport remains responsive without
    // assuming an independent native file read always finishes within 100 ms.
    const beforeDiscovery = await readFile(log, 'utf8');
    const discovery = await connection.client.listTools();
    expect(discovery.tools.map((tool) => tool.name)).toContain('check_setup');
    expect(discovery.tools.map((tool) => tool.name)).toContain('inspect_project');
    expect(await readFile(log, 'utf8')).toBe(beforeDiscovery);
    if (recoveryMs > 0 && !configuration) {
      const slow = await callTool(connection.client, 'check_setup', {}, 20_000);
      expect(slow.isError).toBe(true);
      expect(slow.text).toContain('policy.timeout.exceeded');
      expect(slow.text).toContain('"operation":"check_setup"');
      expect(slow.text).toContain('"timeoutMs":100');
      expect(slow.text).not.toContain(CANARY);
      expect(slow.text).not.toContain(session);
      const released = await observe(log, target);
      expect(complete(events(released), target), released).toBe(true);
      expect(events(released)).toContainEqual(
        expect.objectContaining({ event: 'recovery:issued', operation: 'readSessionFile:read' }),
      );
      expect((await connection.client.listTools()).tools.map((tool) => tool.name)).toContain(
        'check_setup',
      );
      expect(await readFile(log, 'utf8')).toBe(released);
      expect(await readFile(network, 'utf8')).toBe('');
    }
    if (roots) {
      // Root recovery is an additional state-specific witness: actual adoption
      // must be retried, rather than reporting success from expired cached state.
      const recovery = await callTool(connection.client, 'check_setup', {}, 20_000);
      expect(recovery.isError, recovery.text).toBe(false);
      expect(recovery.structured?.findings).toContainEqual({
        code: 'project.roots.available',
        status: 'ok',
        summary:
          '1 project root(s) available. Pass projectRoot explicitly when choosing among several already available roots.',
      });
      const recovered = events(await readFile(log, 'utf8'));
      expect(
        recovered.filter((event) => event.event === 'work:start' && event.operation === target),
      ).toHaveLength(2);
      // 2025 requests roots again over the wire. 2026 can retry the provider
      // supplied in its first MRTR answer; both must issue native realpath again.
      expect(rootRequests).toBeGreaterThanOrEqual(era === '2025-11-25' ? 2 : 1);
    }
    expect(connection.stderr()).not.toContain('Unhandled');
    expect(connection.stderr()).not.toContain('Closing file descriptor');
    expect(connection.stderr()).not.toContain(CANARY);
    return { text: final, atSettlement };
  } finally {
    await connection.client.close();
    if (processId !== null) await waitForProcessExit(processId);
    expect(await digestDirectory(server.projects.legacy)).toBe(rootDigest);
  }
}
async function mutate(
  replace: (source: string) => string,
  use: () => Promise<void>,
): Promise<void> {
  const module = resolve(dirname(server.cli), 'policy.js');
  const original = await readFile(module, 'utf8');
  const modified = replace(original);
  expect(modified).not.toBe(original);
  async function install(bytes: string): Promise<void> {
    await writeFile(module + '.probe', bytes);
    await rename(module + '.probe', module);
  }
  try {
    await install(modified);
    await use();
  } finally {
    await install(original);
    expect(await readFile(module, 'utf8')).toBe(original);
  }
}

beforeAll(async () => {
  server = await installPackagedServer('remaining-operation-deadlines', { legacy: 'legacy' });
  session = resolve(server.temporaryRoot, 'owned-session.txt');
  await writeFile(session, CANARY, { mode: 0o600 });
  await chmod(session, 0o600);
}, 240_000);
afterAll(async () => {
  await server.cleanup();
});

for (const era of ['2025-11-25', '2026-07-28']) {
  for (const completion of [150, 600])
    it(`[E2E-POLICY-CANCELLATION] quiesces adopted roots on ${era} with ${String(completion)} ms issued completion`, async () => {
      await probe('ensureClientRoots:realpath', completion, era);
    });
}
it('[E2E-STUDIO-READ-CANCELLATION] remains discoverable when an independent provider read exceeds the unchanged request deadline', async () => {
  if (process.platform === 'win32') {
    await probe('readPackagedConfig:readFile', 150);
    return;
  }
  await probe('readSessionFile:close', 600, '2025-11-25', false, 150);
});
for (const completion of [150, 600])
  it(`[E2E-POLICY-CANCELLATION] quiesces lazy package configuration with ${String(completion)} ms issued completion`, async () => {
    await probe('readPackagedConfig:readFile', completion);
  });
it('[E2E-POLICY-CANCELLATION] proves a cancelled catalog is re-read when that independent read also exceeds its deadline', async () => {
  await probe('readPackagedConfig:readFile', 600, '2025-11-25', false, 150);
});
for (const target of ['resolveConfiguredRoots:realpath', 'readPackagedConfig:readFile']) {
  for (const completion of [150, 600])
    it(`[E2E-POLICY-CANCELLATION] bounds startup ${target} with ${String(completion)} ms issued completion`, async () => {
      await probe(target, completion, '2025-11-25', true);
    });
}
for (const target of ['open', 'stat', 'read', 'close']) {
  for (const startup of [false, true]) {
    for (const completion of [150, 600])
      it(`[E2E-STUDIO-READ-CANCELLATION] quiesces ${startup ? 'startup' : 'request'} provider ${target} with ${String(completion)} ms issued completion`, async () => {
        if (process.platform === 'win32') {
          const connection = await connectStdio(
            process.execPath,
            [server.cli, '--experimental-studio-logs', '--studio-session-file', session],
            { timeoutMs: 20_000 },
          );
          const pid = connection.transport.pid;
          try {
            const result = await callTool(connection.client, 'check_setup', {});
            expect(result.text).toContain('not supported on Windows');
            expect(result.text).not.toContain(session);
            expect(result.text).not.toContain(CANARY);
          } finally {
            await connection.client.close();
            if (pid !== null) await waitForProcessExit(pid);
          }
        } else await probe(`readSessionFile:${target}`, completion, '2025-11-25', startup);
      });
  }
}
it('[E2E-POLICY-CANCELLATION] rejects removal of the installed cleanup await', async () => {
  await mutate(
    (source) =>
      source.replace(
        'await Promise.race([settled, delay(CLEANUP_WINDOW_MS)]);',
        'void Promise.race([settled, delay(CLEANUP_WINDOW_MS)]);',
      ),
    async () => {
      await expect(probe('ensureClientRoots:realpath', 150)).rejects.toThrow();
    },
  );
});
it('[E2E-POLICY-CANCELLATION] rejects retaining the expired client-root answer as reusable state', async () => {
  await mutate(
    (source) =>
      source.replace(
        /if \(options\.signal\?\.aborted === true\) \{([\s\S]*?)this\.#clientRootsFetched = false;/u,
        'if (options.signal?.aborted === true) {$1void 0;',
      ),
    async () => {
      await expect(probe('ensureClientRoots:realpath', 150)).rejects.toThrow();
    },
  );
});
it('[E2E-POLICY-CANCELLATION] rejects removing package-read abort propagation and post-read checkpoint', async () => {
  await mutate(
    (source) =>
      source.replace(
        /(async #readPackagedConfig\([\s\S]*?)(?=\n {4}assertRemoteProjectAllowed)/u,
        (whole: string) =>
          whole.replaceAll('cancellationCheckpoint(signal);', '').replace(/\n\s*signal,/u, '\n'),
      ),
    async () => {
      await expect(probe('readPackagedConfig:readFile', 150)).rejects.toThrow();
    },
  );
});
it('[E2E-POLICY-CANCELLATION] rejects warming the catalog cache from a cancelled read', async () => {
  const catalog = await readFile(resolve(server.packageRoot, 'config/doc-sources.json'), 'utf8');
  await mutate(
    (source) =>
      source
        .replace('if (this.#catalog === undefined) {', 'if (this.#catalog === undefined) { try {')
        .replace(
          'this.#catalog = catalog;',
          `this.#catalog = catalog; } catch (error) { this.#catalog = parseDocumentationCatalog(${JSON.stringify(catalog)}); throw error; }`,
        ),
    async () => {
      await expect(probe('readPackagedConfig:readFile', 600)).rejects.toThrow(
        'A cancelled catalog must be read again before it can be reused.',
      );
    },
  );
});
it('[E2E-STUDIO-READ-CANCELLATION] rejects removing descriptor cleanup', async () => {
  if (process.platform === 'win32') {
    await probe('readPackagedConfig:readFile', 150);
    return;
  }
  await mutate(
    (source) =>
      source.replace(
        /(async #readSessionFile\([\s\S]*?)(?=\n {4}#normalizeSession)/u,
        (whole: string) => whole.replace('await handle.close();', 'void handle;'),
      ),
    async () => {
      await expect(probe('readSessionFile:read', 150)).rejects.toThrow();
    },
  );
});
