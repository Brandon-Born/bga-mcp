// secret-scan:allow-file Seeded non-secret canaries that prove successful results are redacted.
import { createServer, type Server } from 'node:http';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { Client } from '@modelcontextprotocol/client';

import {
  callTool,
  installPackagedServer,
  withPackagedServer,
  type PackagedServer,
} from '../helpers/packaged.js';

/**
 * Proves that a result which *succeeded* is redacted.
 *
 * Failures were always published through one function that redacted them.
 * Successes were not, and the 2026-08-08 review found what that costs: a
 * password written into a SQL literal came back verbatim from
 * `audit_database_usage`, because nothing between the parser and the client
 * looked at what it was carrying. The canaries below are seeded into a real
 * project on disk and into a Studio page, and each one is required absent, byte
 * for byte, from every successful surface the installed server publishes.
 *
 * The second half of each case matters as much as the first: a boundary that
 * removes everything is not a redaction boundary, it is an off switch. So the
 * diagnostics a developer called the tool for are required present alongside.
 *
 * The connection is replaced by `doc-network-stub.ts` for the Studio case, so
 * nothing here is evidence about TLS, DNS, or the address guard.
 */

const stubModule = new URL('./doc-network-stub.ts', import.meta.url).href;

/** The exact value the server is launched with, which no pattern could recognise. */
const CONFIGURED_SESSION = 'PHPSESSID=canarySessionValue8f2a1c';

/**
 * Seeded values, each appearing nowhere else, so finding one in an output says
 * exactly which reader carried it there.
 */
const CANARIES = {
  sqlValue: 'canarySqlValue7Qp2',
  sqlToken: 'ghp_canaryGithubToken0123456789abcdef',
  unreadableValue: 'canaryUnreadableValue5Rt9',
  email: 'canaryDesigner@example.invalid',
  bearer: 'canaryBearerToken0123456789',
  session: 'canarySessionValue8f2a1c',
  studioBearer: 'canaryStudioBearer0123456789',
  studioPlayer: 'canaryPlayerName42',
  docEmail: 'canaryWikiEditor@example.invalid',
  docBearer: 'canaryWikiBearer0123456789',
} as const;

/** Content a developer called the tool for, which must survive the boundary. */
const KEPT = {
  table: 'card',
  column: 'card_location',
  stateName: 'playCard',
  description: 'Play a card from your hand',
  studioPath: '/bgamcplegacy/bgamcplegacy/playCardCanaryPath.html',
  docSentence: 'A state class lives under modules/php/States and declares its own arguments.',
} as const;

const OWN_ACCOUNT = 'mytest0';
const GAME = '1234567';

const STUDIO_LINES = [
  // Ordinary, and the developer's own: it comes back.
  `20/06 21:50:56 [info] [T403] [4/${OWN_ACCOUNT}] 0.26 GET ${KEPT.studioPath}`,
  // Own, and carrying a credential: no reading of this line is useful enough to
  // publish it, so the whole line goes.
  `20/06 21:50:57 [info] [T403] [4/${OWN_ACCOUNT}] Authorization: Bearer ${CANARIES.studioBearer}`,
  // Own, and carrying personal data: the line still says something worth
  // reading once the value is gone.
  `20/06 21:50:58 [info] [T403] [4/${OWN_ACCOUNT}] 0.11 UPDATE player SET player_name='${CANARIES.studioPlayer}' WHERE player_id=4`,
];

const PAGE = `<html><body><pre>${STUDIO_LINES.join('\n')}</pre></body></html>`;

/**
 * A documentation page carrying the same shapes.
 *
 * Retrieved text is somebody else's content, and it reaches an agent's context
 * the same way a project's does, so it goes through the same boundary.
 */
const DOC_PAGE = `<html><head><title>State classes</title></head><body><p>${KEPT.docSentence} Questions to ${CANARIES.docEmail}, or use Authorization: Bearer ${CANARIES.docBearer}</p></body></html>`;

let server: PackagedServer<'legacy'>;
let stub: Server;
let stubPort: number;

function environment(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    BGA_MCP_DOC_STUB_PORT: String(stubPort),
    BGA_STUDIO_SESSION: CONFIGURED_SESSION,
  };
}

async function connect<T>(
  use: (client: Client) => Promise<T>,
  extra: readonly string[] = [],
): Promise<{ result: T; stderr: string }> {
  return await withPackagedServer(
    server.cli,
    ['--project-root', server.projects.legacy, ...extra],
    use,
    { nodeArguments: ['--import', 'tsx', '--import', stubModule], env: environment() },
  );
}

async function readResource(client: Client, uri: string): Promise<string> {
  const result = await client.readResource({ uri }, { timeout: 15_000 });
  return (result.contents as { text?: string }[]).map((entry) => entry.text ?? '').join('\n');
}

function expectClean(surface: string, text: string, canaries = Object.values(CANARIES)): void {
  for (const canary of canaries) {
    expect(text.includes(canary), `${canary} reached ${surface}`).toBe(false);
  }
  expect(text.includes(CONFIGURED_SESSION), `the configured session reached ${surface}`).toBe(
    false,
  );
}

beforeAll(async () => {
  server = await installPackagedServer('success-redaction', { legacy: 'legacy' });
  const project = server.projects.legacy;

  // A query whose values are a password and a token, and one this reader cannot
  // interpret at all — the message for that one quotes the source.
  await writeFile(
    resolve(project, 'seeded.game.php'),
    `<?php
class SeededQueries extends Table
{
    function seed($name)
    {
        self::DbQuery("UPDATE card SET card_location = '${CANARIES.sqlValue}' WHERE card_owner = '$name'");
        self::DbQuery("INSERT INTO card (card_id, card_location) VALUES (1, '${CANARIES.sqlToken}')");
        self::DbQuery("SHOW TABLES LIKE '${CANARIES.unreadableValue}'");
    }
}
`,
  );

  // Free text a developer wrote into the project, which the model publishes as
  // it found it. Every rule the shared boundary has, in one string.
  const states = resolve(project, 'states.inc.php');
  const original = await readFile(states, 'utf8');
  await writeFile(
    states,
    original.replace(
      '    99 =>',
      `    3 => ['name' => '${KEPT.stateName}', 'type' => 'activeplayer', 'description' => '${KEPT.description}. Session ${CONFIGURED_SESSION} is nobody\\'s. Ask ${CANARIES.email}, or use Authorization: Bearer ${CANARIES.bearer}', 'transitions' => ['done' => 99]],
    99 =>`,
    ),
  );
  await appendFile(states, '\n');

  stub = createServer((request, response) => {
    const url = request.url ?? '';
    if (url.includes('api.php')) {
      // The wiki's own search API, answering with one hit that resolves to the
      // page below.
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          query: {
            search: [
              { title: 'State classes', snippet: 'state class', timestamp: '2026-05-01T00:00:00Z' },
            ],
          },
        }),
      );
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(url.includes('studiogame') ? PAGE : DOC_PAGE);
  });
  await new Promise<void>((ready) => {
    stub.listen(0, '127.0.0.1', ready);
  });
  const address = stub.address();
  stubPort = typeof address === 'object' && address !== null ? address.port : 0;
}, 240_000);

afterAll(async () => {
  await new Promise<void>((closed) => {
    stub.close(() => {
      closed();
    });
  });
  await server.cleanup();
});

describe('packaged successful-result publication', () => {
  it('[E2E-SUCCESS-OUTPUT-REDACTION] reports a query shape without the values in it', async () => {
    const { result, stderr } = await connect(
      async (client) => await callTool(client, 'audit_database_usage', {}),
    );

    expect(result.isError, result.text).toBe(false);
    const structured = JSON.stringify(result.structured);
    expectClean('the audit text', result.text);
    expectClean('the audit structured content', structured);
    expectClean('the server stderr', stderr);

    // The query is still there, and still fixable: which table, which column,
    // and that a value was compared against.
    expect(structured).toContain("UPDATE card SET card_location = '?'");
    expect(structured).toContain(KEPT.table);
    expect(structured).toContain(KEPT.column);
    // The statement it could not read is still reported, without quoting the
    // value that was in it.
    expect(structured).toContain("SHOW TABLES LIKE '?'");
  });

  it('[E2E-SUCCESS-OUTPUT-REDACTION] removes credentials and personal data from project text', async () => {
    const { result, stderr } = await connect(
      async (client) => await callTool(client, 'inspect_project', {}),
    );

    expect(result.isError, result.text).toBe(false);
    const structured = JSON.stringify(result.structured);
    expectClean('the inspect text', result.text);
    expectClean('the inspect structured content', structured);
    expectClean('the server stderr', stderr);

    // Each rule fired where the value was, rather than the field being dropped.
    expect(structured).toContain('[redacted-email]');
    expect(structured).toContain('[redacted-credential]');
    expect(structured).toContain('[redacted-secret]');
    // And the sentence the developer wrote is still readable.
    expect(structured).toContain(KEPT.description);
    expect(structured).toContain(KEPT.stateName);
  });

  it('[E2E-SUCCESS-OUTPUT-REDACTION] publishes nothing seeded through any other capability', async () => {
    const { result, stderr } = await connect(async (client) => {
      const tools = {
        validate_state_machine: await callTool(client, 'validate_state_machine', {}),
        validate_action_contracts: await callTool(client, 'validate_action_contracts', {}),
        validate_notifications: await callTool(client, 'validate_notifications', {}),
        validate_project: await callTool(client, 'validate_project', {}),
        run_pre_release_audit: await callTool(client, 'run_pre_release_audit', {}),
        check_setup: await callTool(client, 'check_setup', {}),
      };
      const resources = {
        summary: await readResource(client, 'bga://project/summary'),
        states: await readResource(client, 'bga://project/states'),
        diagnostics: await readResource(client, 'bga://project/diagnostics'),
      };
      return { tools, resources };
    }, []);

    for (const [name, response] of Object.entries(result.tools)) {
      expect(response.isError, `${name}: ${response.text}`).toBe(false);
      expectClean(`${name} text`, response.text);
      expectClean(`${name} structured content`, JSON.stringify(response.structured));
    }
    for (const [name, text] of Object.entries(result.resources)) {
      // A resource is one JSON document: it has no separate structured half to
      // hide a value in, and no separate half that could be checked instead.
      expectClean(`the ${name} resource`, text);
      expect(text).toContain(KEPT.table);
    }
    expectClean('the server stderr', stderr);
  });

  it('[E2E-SUCCESS-OUTPUT-REDACTION] keeps a summary from saying what the fields no longer do', async () => {
    // The interpolated-query finding quotes the query it is about, and the text
    // summary repeats the first findings. Both are rendered from the redacted
    // structure rather than from what the parser read.
    const { result } = await connect(
      async (client) => await callTool(client, 'audit_database_usage', {}),
    );

    expect(result.isError, result.text).toBe(false);
    expect(result.text).toContain('database.query.interpolated');
    // The summary quotes the masked query, not the one the parser read.
    expect(result.text).toContain("UPDATE card SET card_location = '?'");
    // The variable survives the mask, because which variable reaches a query is
    // the whole content of that finding.
    expect(JSON.stringify(result.structured)).toContain("WHERE card_owner = '$name'");
    expectClean('the audit summary', result.text);
  });

  it('[E2E-SUCCESS-OUTPUT-REDACTION] redacts retrieved documentation before it reaches the client', async () => {
    const { result, stderr } = await connect(
      async (client) => await readResource(client, 'bga://docs/states'),
      ['--allow-network'],
    );

    expectClean('the documentation resource', result);
    expectClean('the server stderr', stderr);
    // The documentation that was asked for is still there to read.
    expect(result).toContain('state class');
    expect(result).toContain('[redacted-email]');
    expect(result).toContain('[redacted-credential]');
  });

  it('[E2E-SUCCESS-OUTPUT-REDACTION] redacts a documentation excerpt a search returns', async () => {
    const { result, stderr } = await connect(
      async (client) => await callTool(client, 'search_bga_docs', { query: 'state classes' }),
      ['--allow-network'],
    );

    expect(result.isError, result.text).toBe(false);
    expectClean('the search text', result.text);
    expectClean('the search structured content', JSON.stringify(result.structured));
    expectClean('the server stderr', stderr);
    expect(JSON.stringify(result.structured)).toContain('[redacted-email]');
  });

  it('[E2E-STUDIO-SUCCESS-REDACTION] withholds a credential-bearing own line and edits a personal one', async () => {
    const { result, stderr } = await connect(
      async (client) => await callTool(client, 'read_studio_logs', { gameId: GAME }, 20_000),
      ['--allow-network', '--experimental-studio-logs', '--studio-dev-account', OWN_ACCOUNT],
    );

    expect(result.isError, result.text).toBe(false);
    const structured = JSON.stringify(result.structured);
    expectClean('the Studio tool text', result.text);
    expectClean('the Studio structured content', structured);
    expectClean('the server stderr', stderr);

    // The whole credential-bearing line is gone, counted rather than shown.
    expect(result.structured?.withheld).toMatchObject({ sensitive: 1 });
    // The personal one came back with the value removed and the rest intact.
    expect(structured).toContain('[redacted-player]');
    expect(structured).toContain('UPDATE player SET');
    // A Studio request path is a URL, not a location on this machine: reading
    // it as one would return a column of placeholders instead of a log.
    expect(structured).toContain(KEPT.studioPath);
    expect(structured).not.toContain('[redacted-path]');
  });
});
