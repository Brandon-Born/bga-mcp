import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { relative, resolve } from 'node:path';

import { connectStdio } from '../../tests/helpers/mcp.js';
import { runCommand } from '../../tests/helpers/process.js';
import { waitForProcessExit } from '../../tests/helpers/scenario.js';

const installPlaceholder = '/absolute/path/to/bga-mcp-install';
const artifactPlaceholder = '/absolute/path/to/verified/bga-mcp-1.0.0-rc.1.tgz';

export async function digestDirectory(directory: string): Promise<string> {
  const hash = createHash('sha256');
  const walk = async (current: string): Promise<void> => {
    for (const entry of (await readdir(current, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const child = resolve(current, entry.name);
      if (entry.isDirectory()) await walk(child);
      else {
        hash.update(relative(directory, child));
        hash.update(await readFile(child));
      }
    }
  };
  await walk(directory);
  return hash.digest('hex');
}

/** Executes the published guide itself; substitutions supply only consumer-owned paths. */
export async function exerciseInstallGuide(artifact: string, repository: string) {
  const guide = await readFile(resolve(repository, 'docs/INSTALL.md'), 'utf8');
  const scratch = await mkdtemp(resolve(tmpdir(), 'bga-install-guide-'));
  const installation = resolve(scratch, 'install');
  const project = resolve(scratch, 'game');
  const block = (id: string, language: string): string => {
    const escaped = new RegExp(
      `<!-- guide:${id} -->\\s*\x60\x60\x60${language}\\n([\\s\\S]*?)\x60\x60\x60`,
      'u',
    );
    const match = escaped.exec(guide);
    assert(match?.[1], `Missing guide block ${id}`);
    return match[1].trim();
  };
  const command = async (id: string): Promise<string> => {
    const source = block(id, 'sh');
    // This is a single argv recipe, never arbitrary shell evaluation.
    const tokens = source
      .match(/"[^"\r\n]*"|[^\s"]+/gu)
      ?.map((value) => value.replace(/^"|"$/gu, ''));
    assert(tokens?.[0] === 'corepack' && tokens[1] === 'pnpm');
    const args = tokens
      .slice(1)
      .map((value) =>
        value === installPlaceholder
          ? installation
          : value === artifactPlaceholder
            ? artifact
            : value,
      );
    const result = await runCommand(
      process.platform === 'win32' ? 'corepack.cmd' : 'corepack',
      args,
      { timeoutMs: 120_000 },
    );
    assert.equal(result.exitCode, 0, `${id}: ${result.stderr}\n${result.stdout}`);
    return result.stdout;
  };
  try {
    await mkdir(installation);
    await writeFile(
      resolve(installation, 'package.json'),
      JSON.stringify(JSON.parse(block('manifest', 'json')) as unknown),
    );
    await cp(resolve(repository, 'tests/fixtures/projects/legacy'), project, { recursive: true });
    await rm(resolve(project, 'expected.json'), { force: true });
    const before = await digestDirectory(project);
    await command('install');
    assert.match(await command('version'), /1\.0\.0-rc\.1/u);
    const platform = process.platform === 'win32' ? 'windows' : 'posix';
    const recipe = JSON.parse(block(`${platform}-client`, 'json')) as {
      command: string;
      args: string[];
    };
    const substitute = (value: string) =>
      value
        .replaceAll(installPlaceholder, installation)
        .replaceAll('/absolute/path/to/your/game', project)
        .replaceAll('C:\\absolute\\path\\to\\bga-mcp-install', installation)
        .replaceAll('C:\\absolute\\path\\to\\your\\game', project);
    const executable = substitute(recipe.command);
    const args = recipe.args.map(substitute);
    const use = async (configured: boolean) => {
      const connection = await connectStdio(executable, configured ? args : args.slice(0, -2), {
        timeoutMs: 20_000,
      });
      const pid = connection.transport.pid;
      try {
        const inventory = JSON.parse(
          await readFile(resolve(installation, 'node_modules/bga-mcp/config/release.json'), 'utf8'),
        ) as { capabilities: { tools: string[]; resources: string[] } };
        assert.deepEqual(
          (await connection.client.listTools()).tools.map((entry) => entry.name).sort(),
          [...inventory.capabilities.tools].sort(),
        );
        assert.deepEqual(
          (await connection.client.listResources()).resources.map((entry) => entry.uri).sort(),
          [...inventory.capabilities.resources].sort(),
        );
        const result = await connection.client.callTool({ name: 'inspect_project', arguments: {} });
        if (configured) {
          assert.notEqual(result.isError, true);
          assert.equal((result.structuredContent as { layout: string }).layout, 'legacy');
        } else {
          assert.equal(result.isError, true);
          assert.match(JSON.stringify(result), /policy\.root\.unconfigured/u);
        }
      } finally {
        await connection.client.close();
        if (pid !== null) await waitForProcessExit(pid);
      }
      assert.equal(connection.stderr(), '');
    };
    await use(true);
    await use(false);
    await command('update');
    await use(true);
    assert.equal(await digestDirectory(project), before);
    await command('remove');
    await assert.rejects(
      access(
        resolve(
          installation,
          'node_modules/.bin',
          process.platform === 'win32' ? 'bga-mcp.cmd' : 'bga-mcp',
        ),
      ),
    );
    const metadata = JSON.parse(await readFile(resolve(installation, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    assert.equal(metadata.dependencies?.['bga-mcp'], undefined);
    return {
      schemaVersion: 1,
      guideDigest: `sha256:${createHash('sha256').update(guide).digest('hex')}`,
      artifactDigest: `sha256:${createHash('sha256')
        .update(await readFile(artifact))
        .digest('hex')}`,
      platform: process.platform,
      node: process.version,
      install: 'passed',
      discovery: 'matched installed inventory',
      firstUse: 'passed',
      unconfiguredRoot: 'refused',
      repeatInstall: 'passed',
      crossVersionUpgrade: 'not evaluated: only one candidate',
      projectUnchanged: true,
      serverExited: true,
      removal: 'passed',
    };
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
