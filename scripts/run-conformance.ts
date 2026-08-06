import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(import.meta.dirname, '..');
const evidenceRoot = resolve(repositoryRoot, 'conformance-results');
const conformanceFixture = fileURLToPath(
  new URL('../tests/fixtures/conformance-http-server.ts', import.meta.url),
);
const conformanceGracefulExit = new URL('./conformance-graceful-exit.ts', import.meta.url).href;
const conformanceCli = resolve(
  repositoryRoot,
  'node_modules/@modelcontextprotocol/conformance/dist/index.js',
);

interface CommandResult {
  readonly exitCode: number;
  readonly output: string;
}

async function run(command: string, arguments_: readonly string[]): Promise<CommandResult> {
  return await new Promise((resolve_, reject) => {
    const child = spawn(command, arguments_, {
      cwd: repositoryRoot,
      env: { ...process.env, NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      output += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      output += chunk;
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal !== null) {
        reject(new Error(`Conformance command exited from signal ${signal}`));
        return;
      }
      resolve_({ exitCode: code ?? 1, output });
    });
  });
}

async function runConformance(url: string, outputDirectory: string): Promise<CommandResult> {
  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });
  return await run(process.execPath, [
    '--import',
    'tsx',
    '--import',
    conformanceGracefulExit,
    conformanceCli,
    'server',
    '--url',
    url,
    '--scenario',
    'server-initialize',
    '--spec-version',
    '2025-11-25',
    '--output-dir',
    outputDirectory,
  ]);
}

async function startSeededViolation(): Promise<{
  readonly url: string;
  readonly close: () => Promise<void>;
}> {
  const server = createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => {
      body += chunk;
    });
    request.on('end', () => {
      let id: unknown = null;
      try {
        id = (JSON.parse(body) as { id?: unknown }).id ?? null;
      } catch {
        // The deliberately invalid endpoint still returns a malformed MCP result.
      }
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          jsonrpc: '2.0',
          id,
          result: { protocolVersion: '1900-01-01', capabilities: {} },
        }),
      );
    });
  });
  await new Promise<void>((resolve_, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve_);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Seeded violation server did not receive a TCP address');
  }
  return {
    url: `http://127.0.0.1:${String(address.port)}/mcp`,
    close: async () =>
      await new Promise<void>((resolve_, reject) => {
        server.close((error) => (error === undefined ? resolve_() : reject(error)));
      }),
  };
}

async function startCandidate(): Promise<{
  readonly url: string;
  readonly close: () => Promise<void>;
}> {
  const child = spawn(process.execPath, ['--import', 'tsx', conformanceFixture], {
    cwd: repositoryRoot,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  let stderr = '';
  child.stderr.on('data', (chunk: string) => {
    stderr += chunk;
  });

  const url = await new Promise<string>((resolve_, reject) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Conformance adapter startup timed out: ${stderr}`));
    }, 5_000);
    child.stdout.on('data', (chunk: string) => {
      const match = /CONFORMANCE_URL=(\S+)/u.exec(chunk);
      if (match?.[1] !== undefined) {
        clearTimeout(timeout);
        resolve_(match[1]);
      }
    });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Conformance adapter exited ${String(code)}: ${stderr}`));
    });
    child.once('error', reject);
  });

  return {
    url,
    close: async () => {
      if (child.exitCode !== null) {
        return;
      }
      child.kill('SIGTERM');
      await new Promise<void>((resolve_) => child.once('exit', () => resolve_()));
    },
  };
}

async function main(): Promise<void> {
  await mkdir(evidenceRoot, { recursive: true });

  const violation = await startSeededViolation();
  try {
    const result = await runConformance(
      violation.url,
      resolve(evidenceRoot, 'seeded-protocol-violation'),
    );
    if (result.exitCode === 0) {
      throw new Error('Official conformance did not detect the seeded protocol violation');
    }
  } finally {
    await violation.close();
  }

  const candidate = await startCandidate();
  try {
    const outputDirectory = resolve(evidenceRoot, 'candidate-2025-11-25');
    const result = await runConformance(candidate.url, outputDirectory);
    if (result.exitCode !== 0) {
      throw new Error(`Official conformance failed:\n${result.output}`);
    }
    if ((await readdir(outputDirectory)).length === 0) {
      throw new Error('Official conformance produced no evidence files');
    }
    process.stdout.write(result.output);
  } finally {
    await candidate.close();
  }
}

await main();
