import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { connectStdio } from '../helpers/mcp.js';
import { runToolScenario, waitForProcessExit } from '../helpers/scenario.js';

const nonserver = fileURLToPath(new URL('../fixtures/nonserver.ts', import.meta.url));
const faultyServer = fileURLToPath(new URL('../fixtures/faulty-server.ts', import.meta.url));
const nodeArguments = (file: string, ...arguments_: string[]): string[] => [
  '--import',
  'tsx',
  file,
  ...arguments_,
];

describe('E2E harness self-tests', () => {
  it('detects startup and handshake failures', async () => {
    await expect(
      connectStdio('definitely-not-a-bga-mcp-executable', [], {
        timeoutMs: 500,
      }),
    ).rejects.toThrow();
    await expect(
      connectStdio(process.execPath, nodeArguments(nonserver, 'invalid-json'), {
        timeoutMs: 500,
      }),
    ).rejects.toThrow();
  });

  it.each([
    {
      name: 'schema',
      mode: 'schema',
      arguments: { value: 42 },
      expected: [{ type: 'text', text: '42' }],
      message: /MCP error|invalid/iu,
    },
    {
      name: 'response',
      mode: 'response',
      arguments: { value: 'expected' },
      expected: [{ type: 'text', text: 'expected' }],
      message: /Unexpected tool response/iu,
    },
    {
      name: 'side-effect',
      mode: 'side-effect',
      arguments: { value: 'expected' },
      expected: [{ type: 'text', text: 'expected' }],
      message: /changed the protected test root/iu,
    },
    {
      name: 'timeout',
      mode: 'hang',
      arguments: { value: 'expected' },
      expected: [{ type: 'text', text: 'expected' }],
      message: /timed out|timeout/iu,
    },
  ])('detects a seeded $name failure and still cleans up', async (seed) => {
    const root = await mkdtemp(join(tmpdir(), `bga-mcp-${seed.name}-`));
    try {
      await expect(
        runToolScenario({
          command: process.execPath,
          arguments: nodeArguments(faultyServer),
          toolName: 'fault_probe',
          toolArguments: seed.arguments,
          expectedResult: seed.expected,
          root,
          env: {
            BGA_MCP_FAULT_MODE: seed.mode,
            BGA_MCP_TEST_ROOT: root,
          },
          timeoutMs: 500,
        }),
      ).rejects.toThrow(seed.message);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('detects cleanup failures', async () => {
    await expect(waitForProcessExit(process.pid, 20)).rejects.toThrow(
      /did not exit during cleanup/iu,
    );
  });
});
