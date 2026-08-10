import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { Client } from '@modelcontextprotocol/client';

import {
  callTool,
  installPackagedServer,
  withPackagedServer,
  type PackagedServer,
} from '../helpers/packaged.js';
import { runCommand } from '../helpers/process.js';

/**
 * Proves that no payload leaves the installed server above its configured
 * budget, whether the server wrote it or not.
 *
 * The 2026-08-08 review found the budget applied to successes and to nothing
 * else: a refusal carrying a 12,000-character argument came back as a
 * 12,162-byte result under a 64-byte budget. Two further payloads behave the
 * same way and are covered here — a resource failure, which leaves as a
 * protocol error rather than a result, and the protocol library's own argument
 * validation, which answers before any handler of this server runs.
 *
 * What is measured is `JSON.stringify` of the payload this server owns: the
 * `CallToolResult`, or a resource's `contents`. The JSON-RPC envelope is
 * measured separately below rather than folded into the same number, because
 * the framing belongs to the protocol library and a budget that counted it
 * would mean something different from one revision to the next.
 */

/** Long enough that no bound could be an accident, and marked so it can be found. */
const LONG = `canaryOverlongArgument${'Z'.repeat(12_000)}`;
const MARKER = 'canaryOverlongArgument';

let server: PackagedServer<'legacy'>;
let floor: number;

async function connect<T>(
  budget: number,
  use: (client: Client) => Promise<T>,
): Promise<{ result: T; stderr: string }> {
  return await withPackagedServer(
    server.cli,
    ['--project-root', server.projects.legacy, '--max-output-bytes', String(budget)],
    use,
  );
}

function payloadBytes(payload: unknown): number {
  return Buffer.byteLength(JSON.stringify(payload), 'utf8');
}

beforeAll(async () => {
  server = await installPackagedServer('output-budget', { legacy: 'legacy' });
  // The floor the installed build enforces, read from the build itself rather
  // than copied here, so this suite cannot disagree with what it is testing.
  const help = await runCommand(process.execPath, [server.cli, '--help'], { timeoutMs: 30_000 });
  const stated = /minimum (\d+)/u.exec(help.stdout)?.[1];
  expect(stated, help.stdout).toBeDefined();
  floor = Number.parseInt(stated ?? '0', 10);
}, 240_000);

afterAll(async () => {
  await server.cleanup();
});

describe('packaged output budget', () => {
  it('[E2E-POLICY-FINAL-OUTPUT-LIMIT] refuses a budget too small to hold its own failure', async () => {
    const refused = await runCommand(
      process.execPath,
      [
        server.cli,
        '--project-root',
        server.projects.legacy,
        '--max-output-bytes',
        String(floor - 1),
      ],
      { timeoutMs: 30_000 },
    );

    expect(refused.exitCode).toBe(2);
    expect(refused.stderr).toContain('config.invalid');
    expect(refused.stderr).toContain(String(floor));
    // Nothing was served: a configuration in which no answer could ever be sent
    // fails once, at startup, rather than at every call.
    expect(refused.stdout).toBe('');
  });

  it('[E2E-POLICY-FINAL-OUTPUT-LIMIT] bounds a refusal that reflects an argument', async () => {
    const { result, stderr } = await connect(
      floor,
      async (client) =>
        await callTool(client, 'search_bga_docs', { query: 'states', sourceId: LONG }),
    );

    expect(result.isError).toBe(true);
    expect(
      payloadBytes({ content: [{ type: 'text', text: result.text }], isError: true }),
    ).toBeLessThanOrEqual(floor);
    // The code survives the shrink — it is what a caller branches on — and the
    // rejected value does not.
    expect(result.text).toContain('policy.doc-source.not-allowed');
    expect(result.text).not.toContain(MARKER);
    expect(stderr).not.toContain(MARKER);
  });

  it('[E2E-POLICY-FINAL-OUTPUT-LIMIT] bounds the validation failure the protocol library writes', async () => {
    // Rejected before any handler of this server runs, so only the bound on the
    // way out of the process can catch it.
    const { result, stderr } = await connect(floor, async (client) => {
      const raw = await client.callTool(
        { name: 'validate_project', arguments: { [LONG]: 1 } },
        { timeout: 15_000 },
      );
      return { bytes: payloadBytes(raw), text: JSON.stringify(raw) };
    });

    expect(result.bytes).toBeLessThanOrEqual(floor);
    expect(result.text).not.toContain(MARKER);
    expect(stderr).not.toContain(MARKER);
  });

  it('[E2E-POLICY-FINAL-OUTPUT-LIMIT] bounds a resource failure, which is not a result at all', async () => {
    const { result, stderr } = await connect(floor, async (client) => {
      try {
        await client.readResource({ uri: `bga://docs/${LONG}` }, { timeout: 15_000 });
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
      throw new Error('the oversized topic was expected to fail');
    });

    expect(Buffer.byteLength(result, 'utf8')).toBeLessThanOrEqual(floor);
    expect(result).not.toContain(MARKER);
    expect(stderr).not.toContain(MARKER);
  });

  it('[E2E-POLICY-FINAL-OUTPUT-LIMIT] bounds every capability, and leaves discovery alone', async () => {
    const { result, stderr } = await connect(floor, async (client) => {
      const listed = await client.listTools();
      const calls: Record<string, number> = {};
      for (const tool of listed.tools) {
        const raw = await client.callTool(
          { name: tool.name, arguments: { projectRoot: LONG } },
          { timeout: 20_000 },
        );
        calls[tool.name] = payloadBytes(raw);
        expect(JSON.stringify(raw), `${tool.name} echoed its argument`).not.toContain(MARKER);
      }
      return { tools: listed.tools.length, calls };
    });

    expect(result.tools).toBeGreaterThan(0);
    for (const [name, bytes] of Object.entries(result.calls)) {
      expect(bytes, `${name} published ${String(bytes)} bytes`).toBeLessThanOrEqual(floor);
    }
    expect(stderr).not.toContain(MARKER);
  });

  it('[E2E-POLICY-FINAL-OUTPUT-LIMIT] holds under multibyte text and the documented maximum', async () => {
    const multibyte = `€${'€'.repeat(4_000)}`;
    const { result } = await connect(floor, async (client) => {
      const raw = await client.callTool(
        { name: 'inspect_project', arguments: { projectRoot: multibyte } },
        { timeout: 15_000 },
      );
      return payloadBytes(raw);
    });
    // Bytes, not characters: three per character here.
    expect(result).toBeLessThanOrEqual(floor);

    // At the documented maximum the same project answers normally, so the floor
    // above is a floor rather than the only budget that works.
    const { result: large } = await connect(
      33_554_432,
      async (client) => await callTool(client, 'inspect_project', {}),
    );
    expect(large.isError, large.text).toBe(false);
    expect(large.text).toContain('legacy layout');
  });

  it('[E2E-POLICY-FINAL-OUTPUT-LIMIT] keeps the framing it does not count small, and retains nothing oversized', async () => {
    // The budget is the server-owned payload. The envelope around it is the
    // protocol library's, so it is measured rather than assumed: a frame that
    // dwarfed the payload would make the budget meaningless even while every
    // assertion above passed.
    const { result, stderr } = await connect(floor, async (client) => {
      const raw = await client.callTool(
        { name: 'inspect_project', arguments: { projectRoot: LONG } },
        { timeout: 15_000 },
      );
      const payload = payloadBytes(raw);
      const frame = payloadBytes({ jsonrpc: '2.0', id: 1, result: raw });
      return { payload, frame };
    });

    expect(result.payload).toBeLessThanOrEqual(floor);
    // Framing is constant per message and small beside the payload budget.
    expect(result.frame - result.payload).toBeLessThan(40);
    expect(stderr).not.toContain(MARKER);

    // Nothing oversized was kept on the way past, either.
    const kept = await readdir(server.temporaryRoot, { recursive: true, withFileTypes: true });
    for (const entry of kept) {
      if (!entry.isFile() || !entry.name.endsWith('.log')) {
        continue;
      }
      const text = await readFile(resolve(entry.parentPath, entry.name), 'utf8');
      expect(text, `${entry.name} retained the rejected argument`).not.toContain(MARKER);
    }
  });
});
