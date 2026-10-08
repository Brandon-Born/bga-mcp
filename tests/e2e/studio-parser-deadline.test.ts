// secret-scan:allow-file Original non-secret synthetic session.
import { createServer, type Server } from 'node:http';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  callTool,
  digestDirectory,
  installPackagedServer,
  withPackagedServer,
  type PackagedServer,
} from '../helpers/packaged.js';

const parserModule = new URL('./parser-deadline-stub.ts', import.meta.url).href;
const networkModule = new URL('./doc-network-stub.ts', import.meta.url).href;
const CANARY = 'synthetic-studio-parser-content';
let server: PackagedServer<'legacy'>;
let stub: Server;
let port: number;
async function probe(expiry: boolean) {
  const control = resolve(server.temporaryRoot, 'studio-parser.control');
  const log = resolve(server.temporaryRoot, 'studio-parser.log');
  await writeFile(control, 'armed');
  await writeFile(log, '');
  const before = await digestDirectory(server.projects.legacy);
  const result = await withPackagedServer(
    server.cli,
    [
      '--project-root',
      server.projects.legacy,
      '--allow-network',
      '--experimental-studio-logs',
      '--studio-dev-account',
      'mytest0',
      '--operation-timeout-ms',
      '5000',
    ],
    async (client) => {
      const response = await callTool(client, 'read_studio_logs', { gameId: 'mcpverification' });
      expect(response.isError, response.text).toBe(expiry);
      const text = await readFile(log, 'utf8');
      if (expiry) {
        expect(response.text).toContain('policy.timeout.exceeded');
        expect(response.text).not.toContain(CANARY);
        expect(text.match(/parser-checkpoint/gu) ?? []).toHaveLength(5);
      } else expect(JSON.stringify(response.structured)).toContain(CANARY);
      await writeFile(control, 'disarmed');
      await new Promise<void>((ready) => {
        setTimeout(ready, 100);
      });
      expect(await readFile(log, 'utf8')).toBe(text);
      expect((await callTool(client, 'check_setup', {})).isError).toBe(false);
    },
    {
      nodeArguments: ['--import', 'tsx', '--import', networkModule, '--import', parserModule],
      env: {
        ...process.env,
        BGA_MCP_DOC_STUB_PORT: String(port),
        BGA_STUDIO_SESSION: 'studioParserOriginalCanary',
        BGA_MCP_PARSER_DEADLINE_CONTROL: control,
        BGA_MCP_PARSER_DEADLINE_TRANSCRIPT: log,
        BGA_MCP_PARSER_DEADLINE_MS: '5000',
        BGA_MCP_PARSER_DEADLINE_CHECKPOINT: '5',
        BGA_MCP_PARSER_DEADLINE_FUNCTION: 'studio',
      },
    },
  );
  expect(result.stderr).toBe('');
  expect(await digestDirectory(server.projects.legacy)).toBe(before);
}
beforeAll(async () => {
  server = await installPackagedServer('studio-parser-deadline', { legacy: 'legacy' });
  // Scripted-source parsing evidence only; never evidence for the rendered live panel.
  stub = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(
      '<html><body><pre>' +
        Array.from(
          { length: 20 },
          (_, index) => `20/06 21:50:56 [info] [T403] [4/mytest0] ${CANARY}${String(index)}`,
        ).join('\n') +
        '</pre></body></html>',
    );
  });
  await new Promise<void>((ready) => {
    stub.listen(0, '127.0.0.1', ready);
  });
  const address = stub.address();
  port = typeof address === 'object' && address !== null ? address.port : 0;
}, 240_000);
afterAll(async () => {
  await new Promise<void>((closed, reject) => {
    stub.close((error) => (error === undefined ? closed() : reject(error)));
  });
  await server.cleanup();
});
it('[E2E-STUDIO-READ-CANCELLATION] expires synchronously in installed Studio parsing while its client remains alive', async () => {
  await probe(true);
});
it('[E2E-STUDIO-READ-CANCELLATION] detects removal of installed Studio parsing checkpoints', async () => {
  const module = resolve(dirname(server.cli), 'studio/logline.js');
  const original = await readFile(module, 'utf8');
  const altered = original.replaceAll('cancellationCheckpoint(signal);', '');
  expect(altered).not.toBe(original);
  const replace = async (bytes: string) => {
    await writeFile(module + '.parser-probe', bytes);
    await rename(module + '.parser-probe', module);
  };
  try {
    await replace(altered);
    await probe(false);
  } finally {
    await replace(original);
    expect(await readFile(module, 'utf8')).toBe(original);
  }
});
