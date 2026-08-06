import { McpServer } from '@modelcontextprotocol/server';

import type { ServerConfig } from './config.js';
import { SERVER_NAME, SERVER_VERSION } from './metadata.js';

export function createServer(config: ServerConfig = { projectRoots: [] }): McpServer {
  void config;
  return new McpServer({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: {} });
}
