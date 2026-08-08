import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { assertManifestMatchesRuntime, validateManifestSchema } from '../helpers/manifest.js';

const configRoot = fileURLToPath(new URL('../../config/', import.meta.url));

async function loadJson(name: string): Promise<unknown> {
  return JSON.parse(await readFile(`${configRoot}${name}`, 'utf8')) as unknown;
}

describe('capability manifest gate', () => {
  it('accepts the current manifest and the exact advertised capability set', async () => {
    const schema = (await loadJson('capabilities.schema.json')) as object;
    const manifest = await loadJson('capabilities.json');
    validateManifestSchema(schema, manifest);
    assertManifestMatchesRuntime(manifest as never, {
      server: { name: 'bga-mcp', version: '0.0.0-development' },
      tools: [
        'audit_database_usage',
        'inspect_project',
        'read_studio_logs',
        'run_pre_release_audit',
        'search_bga_docs',
        'validate_action_contracts',
        'validate_notifications',
        'validate_project',
        'validate_state_machine',
      ],
      resources: [
        'bga://docs/{topic}',
        'bga://framework/version',
        'bga://project/diagnostics',
        'bga://project/states',
        'bga://project/summary',
      ],
      prompts: [],
    });
  });

  it('detects unsupported stability and missing scenarios', async () => {
    const schema = (await loadJson('capabilities.schema.json')) as object;
    const manifest = (await loadJson('capabilities.json')) as {
      transports: Record<string, unknown>[];
    };
    const invalid = structuredClone(manifest);
    invalid.transports[0] = {
      ...invalid.transports[0],
      stability: 'certainly-ready',
      requiredScenarios: [],
    };
    expect(() => validateManifestSchema(schema, invalid)).toThrow('Invalid capability manifest');
  });

  it('detects duplicate and stale runtime entries', async () => {
    const manifest = (await loadJson('capabilities.json')) as {
      server: { name: string; version: string };
      capabilities: {
        tools: {
          name: string;
          requiredScenarios: string[];
        }[];
        resources: [];
        prompts: [];
      };
    };
    const stale = structuredClone(manifest);
    stale.capabilities.tools = [{ name: 'stale_tool', requiredScenarios: ['E2E-STALE-TOOL'] }];
    expect(() =>
      assertManifestMatchesRuntime(stale as never, {
        server: manifest.server,
        tools: [
          'audit_database_usage',
          'inspect_project',
          'read_studio_logs',
          'run_pre_release_audit',
          'search_bga_docs',
          'validate_action_contracts',
          'validate_notifications',
          'validate_project',
          'validate_state_machine',
        ],
        resources: [],
        prompts: [],
      }),
    ).toThrow('Manifest tools differ');

    const firstTool = stale.capabilities.tools[0];
    if (firstTool === undefined) {
      throw new Error('Seeded stale tool was not created');
    }
    stale.capabilities.tools.push(firstTool);
    expect(() =>
      assertManifestMatchesRuntime(stale as never, {
        server: manifest.server,
        tools: [
          'audit_database_usage',
          'inspect_project',
          'read_studio_logs',
          'run_pre_release_audit',
          'search_bga_docs',
          'validate_action_contracts',
          'validate_notifications',
          'validate_project',
          'validate_state_machine',
        ],
        resources: [],
        prompts: [],
      }),
    ).toThrow('duplicate tools');
  });
});
