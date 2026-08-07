import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(import.meta.dirname, '..');
const evidenceRoot = resolve(repositoryRoot, 'conformance-results');
const conformanceFixture = fileURLToPath(
  new URL('../tests/fixtures/conformance-stdio-proxy.ts', import.meta.url),
);

/**
 * The revision the official server suite can measure for this product.
 *
 * Its scenarios run over Streamable HTTP, which the proxy fixture stands in
 * front of the real stdio binary. That works for the dated revisions through
 * 2025-11-25, whose semantics are the server's own.
 */
const MEASURABLE_REVISION = '2025-11-25';

/**
 * A claimed revision the official server suite cannot measure here, and why.
 *
 * 2026-07-28 is the stateless revision: its server scenarios test per-request
 * `_meta`, stateless session handling, HTTP caching, and header validation —
 * Streamable HTTP semantics that belong to the transport, not to the server
 * behind it. `bga-mcp` ships stdio only, so those scenarios would measure the
 * loopback proxy. Running them and calling the result conformance would be a
 * claim about the harness. The stdio evidence for this revision is the packaged
 * E2E suite, which negotiates it with a real SDK client.
 */
const UNMEASURABLE_REVISIONS = [
  {
    revision: '2026-07-28',
    reason:
      'The official server suite tests this revision over Streamable HTTP with stateless per-request _meta. bga-mcp ships stdio only, so those scenarios would measure the loopback proxy rather than the server. Packaged stdio E2E covers this revision instead.',
  },
] as const;
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

async function runConformance(
  url: string,
  outputDirectory: string,
  options: { readonly revision?: string; readonly baseline?: string } = {},
): Promise<CommandResult> {
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
    // The frozen requirement set for the revision, rather than whatever the
    // suite has accumulated since: an implementation is measured against what
    // conformance meant when the revision shipped.
    ...(options.revision === undefined
      ? ['--scenario', 'server-initialize']
      : ['--requirements', options.revision]),
    ...(options.baseline === undefined ? [] : ['--expected-failures', options.baseline]),
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

/** Counts the entries in a baseline, so the evidence can report the exclusion. */
async function countBaselinedScenarios(revision: string): Promise<number> {
  const text = await readFile(
    resolve(repositoryRoot, `config/conformance-baseline-${revision}.yml`),
    'utf8',
  );
  return text.split(/\r?\n/u).filter((line) => /^\s+-\s+\S/u.test(line)).length;
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
    const outputDirectory = resolve(evidenceRoot, `candidate-${MEASURABLE_REVISION}`);
    const result = await runConformance(candidate.url, outputDirectory, {
      revision: MEASURABLE_REVISION,
      baseline: resolve(repositoryRoot, `config/conformance-baseline-${MEASURABLE_REVISION}.yml`),
    });
    // The baseline makes the exit code meaningful in both directions: an
    // unlisted failure is a regression, and a listed one that starts passing is
    // a stale entry. Either fails here.
    if (result.exitCode !== 0) {
      throw new Error(`Official conformance failed:\n${result.output}`);
    }
    if ((await readdir(outputDirectory)).length === 0) {
      throw new Error('Official conformance produced no evidence files');
    }

    // The per-check files cannot say whether a failure was expected, so the
    // outcome is recorded here from the authority on it: the official CLI's
    // exit code under the reviewed baseline. The count of baselined scenarios
    // travels with it, because "passed" means much less when the exclusion list
    // is long, and a reader of the evidence should see its size.
    await writeFile(
      resolve(outputDirectory, 'result.json'),
      `${JSON.stringify(
        {
          revision: MEASURABLE_REVISION,
          status: 'passed',
          baseline: `config/conformance-baseline-${MEASURABLE_REVISION}.yml`,
          baselinedScenarios: await countBaselinedScenarios(MEASURABLE_REVISION),
          recordedAt: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
    );
    process.stdout.write(result.output);
  } finally {
    await candidate.close();
  }

  // A revision the suite cannot measure is recorded as such, so the evidence
  // artifact reports it as not-applicable rather than leaving a silent gap that
  // reads as coverage.
  for (const { revision, reason } of UNMEASURABLE_REVISIONS) {
    const directory = resolve(evidenceRoot, `candidate-${revision}`);
    await rm(directory, { recursive: true, force: true });
    await mkdir(directory, { recursive: true });
    await writeFile(
      resolve(directory, 'not-applicable.json'),
      `${JSON.stringify({ revision, reason, recordedAt: new Date().toISOString() }, null, 2)}\n`,
    );
    process.stdout.write(`Official conformance is not applicable for ${revision}: ${reason}\n`);
  }
}

await main();
