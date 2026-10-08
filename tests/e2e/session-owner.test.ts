// secret-scan:allow-file Original non-secret ownership canary, never a real session.
import { chmod, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';

import { connectStdio } from '../helpers/mcp.js';
import { callTool, installPackagedServer, type PackagedServer } from '../helpers/packaged.js';
import { waitForProcessExit } from '../helpers/scenario.js';

const ownerModule = new URL('./session-owner-stub.ts', import.meta.url).href;
const denyModule = new URL('./network-denied.ts', import.meta.url).href;
const CANARY = 'ownership-fixture-content-must-never-be-published';
let server: PackagedServer<'legacy'>;
let file: string;
let log: string;
let network: string;
interface Event {
  event: string;
  processUid: number;
  fileUid?: number;
  mode?: number;
  size?: number;
  requestedBytes?: number;
}
function observed(text: string): Event[] {
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Event);
}
async function probe(
  asExistingRoot: boolean,
  options: { grow?: boolean; relative?: boolean; deleted?: boolean } = {},
) {
  await writeFile(log, '');
  await writeFile(network, '');
  const variables = {
    BGA_MCP_OWNER_FILE: file,
    BGA_MCP_OWNER_TRANSCRIPT: log,
    BGA_MCP_NETWORK_LOG: network,
    BGA_MCP_OWNER_GROW: options.grow ? '1' : '0',
  };
  const nodeArguments = [
    '--import',
    'tsx',
    '--import',
    denyModule,
    '--import',
    ownerModule,
    server.cli,
    '--project-root',
    server.projects.legacy,
    '--experimental-studio-logs',
    '--studio-session-file',
    options.relative ? relative(process.cwd(), file) : file,
  ];
  // CI-only existing root account. env -i drops every inherited credential;
  // no user-machine privilege, account creation, ownership change or live read.
  const connection = asExistingRoot
    ? await connectStdio(
        'sudo',
        [
          '-n',
          'env',
          '-i',
          'PATH=/usr/bin:/bin',
          ...Object.entries(variables).map(([key, value]) => `${key}=${value}`),
          process.execPath,
          ...nodeArguments,
        ],
        { timeoutMs: 20_000 },
      )
    : await connectStdio(process.execPath, nodeArguments, {
        timeoutMs: 20_000,
        env: { ...process.env, ...variables, BGA_STUDIO_SESSION: '' },
      });
  const pid = connection.transport.pid;
  try {
    const tools = await connection.client.listTools();
    expect(tools.tools.some((tool) => tool.name === 'check_setup')).toBe(true);
    if (options.deleted) await unlink(file);
    const response = await callTool(connection.client, 'check_setup', {});
    expect(response.isError, response.text).toBe(false);
    expect(response.text).not.toContain(file);
    expect(response.text).not.toContain(CANARY);
    expect(JSON.stringify(response.structured)).not.toContain(file);
    expect(JSON.stringify(response.structured)).not.toContain(CANARY);
    expect(connection.stderr()).toBe('');
    return { response, transcript: observed(await readFile(log, 'utf8')) };
  } finally {
    await connection.client.close();
    if (pid !== null) await waitForProcessExit(pid);
    if (options.grow || options.deleted) await writeFile(file, CANARY, { mode: 0o600 });
    expect(await readFile(network, 'utf8')).toBe('');
    expect(await readFile(file, 'utf8')).toBe(CANARY);
  }
}
async function replaceModule(text: string): Promise<void> {
  const module = resolve(dirname(server.cli), 'policy.js');
  await writeFile(module + '.owner-probe', text);
  await rename(module + '.owner-probe', module);
}
beforeAll(async () => {
  server = await installPackagedServer('session-owner', { legacy: 'legacy' });
  file = resolve(server.temporaryRoot, 'owned-ownership-fixture.txt');
  log = resolve(server.temporaryRoot, 'ownership-metadata.jsonl');
  network = resolve(server.temporaryRoot, 'ownership-network.log');
  await writeFile(file, CANARY, { mode: 0o600 });
  await chmod(file, 0o600);
}, 240_000);
afterAll(async () => {
  await server.cleanup();
});

it('[E2E-STUDIO-SESSION-FILE-SAFE] bounds growing descriptors and resolves relative/deleted files without caching credentials', async () => {
  if (process.platform === 'win32') {
    expect((await probe(false)).response.text).toContain('not supported on Windows');
    return;
  }
  const growing = await probe(false, { grow: true });
  expect(growing.transcript).toContainEqual(
    expect.objectContaining({ event: 'growth', size: 8192 }),
  );
  const reads = growing.transcript.filter((event) => event.event === 'read');
  expect(reads).toHaveLength(1);
  expect(reads[0]?.requestedBytes).toBe(Buffer.byteLength(CANARY));
  expect(growing.response.text).toContain('larger than 4096 bytes');
  expect((await probe(false, { relative: true })).response.text).toContain(
    'A Studio session was found in the configured file',
  );
  const deleted = await probe(false, { deleted: true });
  expect(deleted.response.text).toContain('could not be opened');
  expect(deleted.response.text).not.toContain('A Studio session was found');
});

it('[E2E-STUDIO-SESSION-FILE-OWNER] observes actual owner metadata and proves the platform-specific decision', async () => {
  if (process.platform === 'win32') {
    const result = await probe(false);
    expect(result.response.text).toContain('not supported on Windows');
    expect(result.transcript).toEqual([]);
    return;
  }
  const currentOwner = await probe(false);
  const metadata = await stat(file);
  expect(metadata.uid).toBe(process.getuid?.());
  expect(metadata.mode & 0o777).toBe(0o600);
  expect(currentOwner.response.text).toContain('A Studio session was found in the configured file');
  expect(
    currentOwner.transcript
      .filter((event) => event.event === 'stat')
      .every(
        (event) =>
          event.processUid === metadata.uid &&
          event.fileUid === metadata.uid &&
          event.mode === 0o600,
      ),
  ).toBe(true);
  expect(currentOwner.transcript.filter((event) => event.event === 'read')).not.toHaveLength(0);
  // Ordinary local runs prove the current-owner decision. Hosted POSIX CI also
  // supplies the genuine distinct-owner refusal; the receipt must name which ran.
  if (process.env.GITHUB_ACTIONS !== 'true') return;
  expect(process.getuid?.()).not.toBe(0);
  const refused = await probe(true);
  expect(refused.response.text).toContain('belongs to another account');
  expect(refused.transcript.filter((event) => event.event === 'stat')).not.toHaveLength(0);
  expect(
    refused.transcript
      .filter((event) => event.event === 'stat')
      .every(
        (event) => event.processUid === 0 && event.fileUid === metadata.uid && event.mode === 0o600,
      ),
  ).toBe(true);
  expect(refused.transcript.filter((event) => event.event === 'read')).toHaveLength(0);
  expect(refused.transcript.filter((event) => event.event === 'close')).toHaveLength(
    refused.transcript.filter((event) => event.event === 'open').length,
  );

  const module = resolve(dirname(server.cli), 'policy.js');
  const original = await readFile(module, 'utf8');
  const mutated = original.replace(
    "typeof process.getuid === 'function' && stats.uid !== process.getuid()",
    'false',
  );
  expect(mutated).not.toBe(original);
  try {
    await replaceModule(mutated);
    const control = await probe(true);
    expect(control.response.text).not.toContain('belongs to another account');
    expect(control.response.text).toContain('A Studio session was found in the configured file');
    expect(control.transcript.filter((event) => event.event === 'read')).not.toHaveLength(0);
  } finally {
    await replaceModule(original);
    expect(await readFile(module, 'utf8')).toBe(original);
  }
});
