import { randomUUID } from 'node:crypto';
import { createServer as createHttpServer } from 'node:http';

import {
  localhostHostValidation,
  localhostOriginValidation,
  NodeStreamableHTTPServerTransport,
} from '@modelcontextprotocol/node';

import { createServer } from '../../src/server.js';

const validateHost = localhostHostValidation();
const validateOrigin = localhostOriginValidation();
const transport = new NodeStreamableHTTPServerTransport({
  sessionIdGenerator: randomUUID,
});
const mcpServer = createServer();
await mcpServer.connect(transport);

const httpServer = createHttpServer((request, response) => {
  if (request.url !== '/mcp') {
    response.writeHead(404).end();
    return;
  }
  if (!validateHost(request, response) || !validateOrigin(request, response)) {
    return;
  }
  void transport.handleRequest(request, response).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Conformance HTTP adapter error: ${message}\n`);
    if (!response.headersSent) {
      response.writeHead(500).end();
    }
  });
});

const close = (): void => {
  httpServer.close(() => {
    void mcpServer.close().finally(() => {
      process.exitCode = 0;
    });
  });
};
process.once('SIGINT', close);
process.once('SIGTERM', close);

httpServer.listen(0, '127.0.0.1', () => {
  const address = httpServer.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Conformance server did not receive a TCP address');
  }
  process.stdout.write(`CONFORMANCE_URL=http://127.0.0.1:${String(address.port)}/mcp\n`);
});
