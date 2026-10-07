import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';

import { connectStdio } from '../helpers/mcp.js';
import { installPackagedServer, type PackagedServer } from '../helpers/packaged.js';
import { waitForProcessExit } from '../helpers/scenario.js';

const tools = [
  'audit_database_usage',
  'inspect_project',
  'run_pre_release_audit',
  'validate_action_contracts',
  'validate_notifications',
  'validate_project',
  'validate_state_machine',
].sort();
const resources = ['bga://project/diagnostics', 'bga://project/states', 'bga://project/summary'];
let server: PackagedServer<'project'>;
let entry: string;
let originalEntry: string;
let profile: string;
let networkLog: string;
let writeLog: string;

async function snapshot(root: string): Promise<unknown> {
  const rows: Record<string, string> = {};
  const walk = async (directory: string): Promise<void> => {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, item.name);
      const name = relative(root, path).split(sep).join('/');
      const info = await stat(path);
      rows[name] = `${String(info.size)}:${String(info.mtimeMs)}`;
      if (item.isDirectory()) await walk(path);
      else
        rows[name] += `:${createHash('sha256')
          .update(await readFile(path))
          .digest('hex')}`;
    }
  };
  await walk(root);
  return rows;
}

// Rename a new inode over our installed entry. pnpm can hardlink package
// contents, so overwriting the original inode could mutate other installations.
async function replaceEntry(content: string): Promise<void> {
  const temporary = resolve(dirname(entry), 'telemetry-control-entry.tmp');
  await writeFile(temporary, content, { mode: 0o755 });
  await rename(temporary, entry);
}

function injectBeforeStartup(probe: string): string {
  const headerEnd = originalEntry.startsWith('#!') ? originalEntry.indexOf('\n') + 1 : 0;
  return `${originalEntry.slice(0, headerEnd)}${probe}\n${originalEntry.slice(headerEnd)}`;
}

async function exercise(): Promise<void> {
  await writeFile(networkLog, '');
  await writeFile(writeLog, '');
  const connection = await connectStdio(
    server.publicCommand.command,
    [...server.publicCommand.arguments, '--project-root', server.projects.project],
    {
      cwd: profile,
      timeoutMs: 20_000,
      env: {
        ...process.env,
        // These are isolated child environment values, never shell variables
        // or changes to the developer's real profile.
        HOME: profile,
        USERPROFILE: profile,
        APPDATA: profile,
        LOCALAPPDATA: profile,
        XDG_CONFIG_HOME: profile,
        XDG_DATA_HOME: profile,
        XDG_CACHE_HOME: profile,
        XDG_STATE_HOME: profile,
        TSX_DISABLE_CACHE: '1',
        NODE_OPTIONS: [
          `--import=${import.meta.resolve('tsx')}`,
          `--import=${new URL('./network-denied.ts', import.meta.url).href}`,
          `--import=${new URL('./telemetry-write-denied.ts', import.meta.url).href}`,
        ].join(' '),
        BGA_MCP_NETWORK_LOG: networkLog,
        BGA_MCP_WRITE_LOG: writeLog,
      },
    },
  );
  const processId = connection.transport.pid;
  try {
    expect((await connection.client.listTools()).tools.map((item) => item.name).sort()).toEqual(
      tools,
    );
    expect(
      (await connection.client.listResources()).resources.map((item) => item.uri).sort(),
    ).toEqual(resources);
    expect((await connection.client.listResourceTemplates()).resourceTemplates).toEqual([]);
    expect((await connection.client.listPrompts()).prompts).toEqual([]);
    for (let repeat = 0; repeat < 2; repeat++) {
      for (const name of tools) {
        const response = await connection.client.callTool({ name, arguments: {} });
        expect(response.isError, name).not.toBe(true);
        expect(response.structuredContent, name).toBeDefined();
      }
      for (const uri of resources) {
        const response = await connection.client.readResource({ uri });
        expect(response.contents).toHaveLength(1);
      }
    }
  } finally {
    await connection.client.close();
    if (processId !== null) await waitForProcessExit(processId);
  }
  expect(connection.stderr()).toBe('');
}

async function assertAbsent(): Promise<void> {
  expect(await readFile(networkLog, 'utf8'), 'outbound attempt').toBe('');
  expect(await readFile(writeLog, 'utf8'), 'filesystem mutation attempt').toBe('');
}

beforeAll(async () => {
  server = await installPackagedServer('telemetry-absence', { project: 'legacy' });
  entry = resolve(server.packageRoot, 'dist/release-cli.js');
  originalEntry = await readFile(entry, 'utf8');
  profile = resolve(server.temporaryRoot, 'isolated-profile');
  await mkdir(profile);
  await writeFile(resolve(profile, 'existing-preferences.txt'), 'original profile control\n');
  networkLog = resolve(server.temporaryRoot, 'network-attempts.log');
  writeLog = resolve(server.temporaryRoot, 'write-attempts.log');
}, 240_000);

afterAll(async () => {
  await server.cleanup();
});

it('[E2E-TELEMETRY-ABSENT] runs the installed public inventory twice without traffic, identifiers, filesystem writes or project changes', async () => {
  const before = await snapshot(profile);
  const projectBefore = await snapshot(server.projects.project);
  await exercise();
  await assertAbsent();
  expect(await snapshot(profile)).toEqual(before);
  expect(await snapshot(server.projects.project)).toEqual(projectBefore);
});

it('[E2E-TELEMETRY-NETWORK-CONTROL] detects an independently injected caught analytics request in the installed public entry without sending it', async () => {
  await replaceEntry(
    injectBeforeStartup("try { await fetch('https://example.invalid/analytics'); } catch {}"),
  );
  try {
    await exercise();
    await expect(assertAbsent()).rejects.toThrow('outbound attempt');
    expect(await readFile(networkLog, 'utf8')).toBe('fetch\n');
    expect(await readFile(writeLog, 'utf8')).toBe('');
  } finally {
    await replaceEntry(originalEntry);
  }
});

it('[E2E-TELEMETRY-WRITE-CONTROL] detects an independently injected analytics identifier write in the installed public entry without persisting it', async () => {
  const before = await snapshot(profile);
  await replaceEntry(
    injectBeforeStartup(
      "try { const fs = await import('node:fs/promises'); await fs.writeFile(process.env.HOME + '/analytics-id', 'synthetic-id'); } catch {}",
    ),
  );
  try {
    await exercise();
    await expect(assertAbsent()).rejects.toThrow('filesystem mutation attempt');
    expect(await readFile(writeLog, 'utf8')).toBe('fs/promises.writeFile\n');
    expect(await readFile(networkLog, 'utf8')).toBe('');
    expect(await snapshot(profile)).toEqual(before);
  } finally {
    await replaceEntry(originalEntry);
  }
});
