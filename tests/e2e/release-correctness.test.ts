import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { Client } from '@modelcontextprotocol/client';

import {
  callTool,
  installPackagedServer,
  withPublicPackagedServer,
  type PackagedServer,
  type ToolResponse,
} from '../helpers/packaged.js';

interface Finding {
  readonly kind: string;
  readonly code: string;
  readonly message: string;
}

interface ValidatorResult {
  readonly trace?: {
    readonly clientCalls?: {
      readonly action: string;
      readonly argumentNames: string[];
      readonly argumentShape: string;
    }[];
    readonly entryPoints?: {
      readonly action: string;
      readonly argumentNames: string[];
      readonly scope: string;
      readonly scopeId: string;
    }[];
    readonly sent?: {
      readonly name: string;
      readonly payloadKeys: string[];
      readonly payloadShape: string;
    }[];
  };
  readonly queries?: { readonly tables: string[]; readonly columns: string[] }[];
  readonly diagnostics: {
    readonly status: string;
    readonly summary: Record<string, number>;
    readonly findings: Finding[];
  };
}

interface AggregateResult {
  readonly groups: {
    readonly id: string;
    readonly status: string;
    readonly summary: Record<string, number>;
  }[];
  readonly diagnostics: ValidatorResult['diagnostics'];
}

interface AuditResult {
  readonly counts: Record<string, number>;
  readonly checks: { readonly id: string; readonly outcome: string }[];
}

let server: PackagedServer<
  | 'unknownshapes'
  | 'scopedactions'
  | 'scopedequal'
  | 'scopedreverse'
  | 'scopedduplicate'
  | 'legacyvisibility'
  | 'walkthroughconflict'
  | 'sqlaliases'
  | 'sqlmissing'
  | 'sqlunsupported'
>;

function findings(response: ToolResponse<ValidatorResult | AggregateResult>): Finding[] {
  return response.structured?.diagnostics.findings ?? [];
}

function codes(response: ToolResponse<ValidatorResult | AggregateResult>): string[] {
  return findings(response).map((finding) => finding.code);
}

async function readJsonResource(client: Client, uri: string): Promise<AggregateResult> {
  const response = await client.readResource({ uri }, { timeout: 15_000 });
  const contents = response.contents as { text?: string }[];
  return JSON.parse(contents[0]?.text ?? '{}') as AggregateResult;
}

beforeAll(async () => {
  server = await installPackagedServer('release-correctness', {
    unknownshapes: 'modern',
    scopedactions: 'modern',
    scopedequal: 'modern',
    scopedreverse: 'modern',
    scopedduplicate: 'modern',
    legacyvisibility: 'legacy',
    walkthroughconflict: 'modern',
    sqlaliases: 'legacy',
    sqlmissing: 'legacy',
    sqlunsupported: 'legacy',
  });

  await writeFile(
    resolve(server.projects.unknownshapes, 'modules/js/Game.js'),
    `export class Game {
  setup() { this.bga.notifications.setupPromiseNotifications(); }
  omitted() { this.bga.actions.performAction('actOmitted'); }
  empty() { this.bga.actions.performAction('actEmpty', {}); }
  shaped() { this.bga.actions.performAction('actShaped', { cardId: 1 }); }
  variable(args) { this.bga.actions.performAction('actVariable', args); }
  helper() { this.bga.actions.performAction('actHelper', this.buildArgs()); }
  spread(args) { this.bga.actions.performAction('actSpread', { cardId: 1, ...args }); }
  mismatch() { this.bga.actions.performAction('actKnownMismatch', { sent: 1 }); }
  async notif_empty() {}
  async notif_shaped(notif) { this.showMessage(notif.args.cardId, 'info'); }
  async notif_variable(notif) { this.showMessage(notif.args.required, 'info'); }
  async notif_helper(notif) { this.showMessage(notif.args.required, 'info'); }
  async notif_spread(notif) { this.showMessage(notif.args.required, 'info'); }
  async notif_knownMismatch(notif) { this.showMessage(notif.args.read, 'info'); }
  async notif_malformed(notif) { this.showMessage(notif.args.required, 'info'); }
  malformed() { this.bga.actions.performAction('actMalformed', { cardId: 1); }
}
`,
  );
  await writeFile(
    resolve(server.projects.unknownshapes, 'modules/php/Game.php'),
    `<?php
namespace Bga\\Games\\BgaMcpModernFixture;
final class Game extends \\Bga\\GameFramework\\Table {
  public function actOmitted(): string { return 'pass'; }
  public function actEmpty(): string { return 'pass'; }
  public function actShaped(int $cardId): string { return 'pass'; }
  public function actVariable(int $cardId): string { return 'pass'; }
  public function actHelper(int $cardId): string { return 'pass'; }
  public function actSpread(int $cardId, int $other): string { return 'pass'; }
  public function actMalformed(int $cardId): string { return 'pass'; }
  public function actKnownMismatch(int $required): string { return 'pass'; }
  public function sends($payload): void {
    $this->bga->notify->all('empty', 'message');
    $this->bga->notify->all('shaped', 'message', ['cardId' => 1]);
    $this->bga->notify->all('variable', 'message', $payload);
    $this->bga->notify->all('helper', 'message', $this->buildPayload());
    $this->bga->notify->all('spread', 'message', ['cardId' => 1, ...$payload]);
    $this->bga->notify->all('knownMismatch', 'message', ['sent' => 1]);
    $this->bga->notify->all('malformed', 'message', ['cardId' => 1);
  }
}
`,
  );

  const scopedClient = `export class Game {
  play() { this.bga.actions.performAction('actScoped', { cardId: 1 }); }
}
`;
  for (const [root, parameters] of [
    [server.projects.scopedactions, ['cardId', 'tokenId']],
    [server.projects.scopedequal, ['cardId', 'cardId']],
    [server.projects.scopedreverse, ['tokenId', 'cardId']],
  ] as const) {
    await writeFile(resolve(root, 'modules/js/Game.js'), scopedClient);
    for (const [index, argument] of parameters.entries()) {
      const name = index === 0 ? 'FirstState' : 'SecondState';
      await writeFile(
        resolve(root, `modules/php/States/${name}.php`),
        `<?php
namespace Bga\\Games\\BgaMcpModernFixture\\States;
use Bga\\GameFramework\\Attributes\\PossibleAction;
final class ${name} {
  #[PossibleAction]
  public function actScoped(int $${argument}): string { return 'pass'; }
}
`,
      );
    }
  }
  await writeFile(resolve(server.projects.scopedduplicate, 'modules/js/Game.js'), scopedClient);
  await writeFile(
    resolve(server.projects.scopedduplicate, 'modules/php/States/DuplicateState.php'),
    `<?php
namespace Bga\\Games\\BgaMcpModernFixture\\States;
use Bga\\GameFramework\\Attributes\\PossibleAction;
final class DuplicateState {
  #[PossibleAction]
  public function actScoped(int $cardId): string { return 'pass'; }
  #[PossibleAction]
  public function actScoped(int $cardId): string { return 'pass'; }
}
`,
  );
  await writeFile(
    resolve(server.projects.legacyvisibility, 'bgamcplegacy.action.php'),
    `<?php
class action_bgamcplegacy extends APP_GameAction {
  private function privateHelper() { self::getArg('privateValue', AT_int, false); }
  protected function protectedHelper() { self::getArg('protectedValue', AT_int, false); }
  public function actPass() {
    $comment = self::getArg('comment', AT_alphanum, false);
    $this->game->actPass($comment);
  }
}
`,
  );

  await writeFile(
    resolve(server.projects.walkthroughconflict, 'modules/js/Game.js'),
    `export class Game {
  pass() { this.bga.actions.performAction('action_pass'); }
}
`,
  );
  await writeFile(
    resolve(server.projects.walkthroughconflict, 'modules/php/States/PlayerTurn.php'),
    `<?php
namespace Bga\\Games\\BgaMcpModernFixture\\States;
use Bga\\GameFramework\\Attributes\\PossibleAction;
use Bga\\GameFramework\\StateType;
use Bga\\GameFramework\\States\\GameState;
use Bga\\Games\\BgaMcpModernFixture\\Game;
use Bga\\Games\\BgaMcpModernFixture\\StateConstants;
final class PlayerTurn extends GameState {
  public function __construct(protected Game $game) {
    parent::__construct(
      $game,
      id: StateConstants::STATE_PLAYER_TURN,
      type: StateType::ACTIVE_PLAYER,
      description: clienttranslate('A player must act'),
      descriptionMyTurn: clienttranslate('You must act'),
    );
  }
  #[PossibleAction]
  public function action_pass(): void {
    $this->game->gamestate->nextState('pass');
  }
}
`,
  );

  const aliasedGame = `<?php
require_once APP_GAMEMODULE_PATH . 'module/table/table.game.php';
class BgaMcpLegacy extends Table {
  public function loadRows(): void {
    self::getObjectListFromDB('SELECT player_id id, player_name name FROM player');
    self::getObjectListFromDB('SELECT c.card_id AS id, c.card_location location FROM card c');
    self::getObjectListFromDB('SELECT c.card_id id, c.card_owner owner FROM card AS c');
    self::getObjectListFromDB('SELECT \`renamed\`.\`card_id\` AS \`id\`, renamed.card_id repeated FROM \`card\` AS \`renamed\`');
    self::getObjectListFromDB('SELECT c.card_id, p.player_id FROM card c JOIN player p ON p.player_id = c.card_owner');
  }
  public function actPass($comment): void {}
}
`;
  await writeFile(resolve(server.projects.sqlaliases, 'bgamcplegacy.game.php'), aliasedGame);
  await writeFile(
    resolve(server.projects.sqlmissing, 'bgamcplegacy.game.php'),
    aliasedGame.replace(
      "self::getObjectListFromDB('SELECT c.card_id AS id, c.card_location location FROM card c');",
      "self::getObjectListFromDB('SELECT c.missing_column AS id FROM card c');",
    ),
  );
  await writeFile(
    resolve(server.projects.sqlunsupported, 'bgamcplegacy.game.php'),
    `<?php
require_once APP_GAMEMODULE_PATH . 'module/table/table.game.php';
class BgaMcpLegacy extends Table {
  public function loadRows(): void {
    self::getObjectListFromDB('SELECT CONCAT(c.card_location, c.card_owner) label FROM card c');
    self::getObjectListFromDB('SELECT c.card_id FROM card c WHERE c.card_owner IN (SELECT player_id FROM player)');
    self::getObjectListFromDB('WITH owned AS (SELECT card_id FROM card) SELECT card_id FROM owned');
  }
  public function actPass($comment): void {}
}
`,
  );
}, 240_000);

afterAll(async () => {
  await server.cleanup();
});

describe('release-blocking correctness through the installed public command', () => {
  it('[E2E-VALIDATE-UNKNOWN-CROSS-FILE-SHAPES] distinguishes known empty, known shaped, and unknown shapes everywhere they are consumed', async () => {
    const root = server.projects.unknownshapes;
    await withPublicPackagedServer(server, ['--project-root', root], async (client) => {
      const actions = await callTool<ValidatorResult>(client, 'validate_action_contracts', {
        projectRoot: root,
      });
      const notifications = await callTool<ValidatorResult>(client, 'validate_notifications', {
        projectRoot: root,
      });

      const shapeByAction = Object.fromEntries(
        (actions.structured?.trace?.clientCalls ?? []).map((call) => [
          call.action,
          call.argumentShape,
        ]),
      );
      expect(shapeByAction).toMatchObject({
        actOmitted: 'known',
        actEmpty: 'known',
        actShaped: 'known',
        actVariable: 'unknown',
        actHelper: 'unknown',
        actSpread: 'unknown',
        actMalformed: 'unknown',
      });
      const actionMismatches = findings(actions).filter(
        (finding) => finding.code === 'action.argument.mismatch',
      );
      expect(actionMismatches).toHaveLength(2);
      expect(
        actionMismatches.every((finding) => finding.message.includes('actKnownMismatch')),
      ).toBe(true);
      expect(actions.structured?.diagnostics.summary.unsupported).toBeGreaterThan(0);

      const shapeByNotification = Object.fromEntries(
        (notifications.structured?.trace?.sent ?? []).map((entry) => [
          entry.name,
          entry.payloadShape,
        ]),
      );
      expect(shapeByNotification).toMatchObject({
        empty: 'known',
        shaped: 'known',
        variable: 'unknown',
        helper: 'unknown',
        spread: 'unknown',
        knownMismatch: 'known',
        malformed: 'unknown',
      });
      const notificationMismatches = findings(notifications).filter(
        (finding) => finding.code === 'notification.payload.mismatch',
      );
      expect(notificationMismatches).toHaveLength(2);
      expect(
        notificationMismatches.every((finding) => finding.message.includes('knownMismatch')),
      ).toBe(true);
      expect(notifications.structured?.diagnostics.summary.unsupported).toBeGreaterThan(0);

      const aggregate = await callTool<AggregateResult>(client, 'validate_project', {
        projectRoot: root,
        groups: ['action-contracts', 'notifications'],
      });
      expect(aggregate.structured?.diagnostics.summary.unsupported).toBeGreaterThan(0);
      expect(codes(aggregate)).toContain('action.argument.mismatch');
      expect(codes(aggregate)).toContain('notification.payload.mismatch');

      const audit = await callTool<AuditResult>(client, 'run_pre_release_audit', {
        projectRoot: root,
      });
      expect(audit.structured?.counts.unsupported).toBeGreaterThan(0);
      expect(
        audit.structured?.checks.find((check) => check.id === 'action.argument.mismatch')?.outcome,
      ).toBe('failed');

      const resource = await readJsonResource(client, 'bga://project/diagnostics');
      expect(resource.diagnostics.summary.unsupported).toBeGreaterThan(0);
      expect(resource.diagnostics.findings.map((finding) => finding.code)).toContain(
        'notification.payload.mismatch',
      );
    });
  });

  it('[E2E-VALIDATE-ACTION-SCOPES] applies legacy visibility and modern state-local resolution deterministically', async () => {
    const modernRoot = server.projects.scopedactions;
    await withPublicPackagedServer(server, ['--project-root', modernRoot], async (client) => {
      const first = await callTool<ValidatorResult>(client, 'validate_action_contracts', {
        projectRoot: modernRoot,
      });
      const second = await callTool<ValidatorResult>(client, 'validate_action_contracts', {
        projectRoot: modernRoot,
      });
      expect(second.structured).toEqual(first.structured);
      expect(codes(first)).not.toContain('action.entry-point.duplicate');
      expect(codes(first)).not.toContain('action.argument.mismatch');
      expect(first.structured?.diagnostics.summary.unsupported).toBeGreaterThan(0);

      const scoped = (first.structured?.trace?.entryPoints ?? []).filter(
        (entry) => entry.action === 'actScoped' && entry.scope === 'state-class',
      );
      expect(scoped).toHaveLength(2);
      expect(new Set(scoped.map((entry) => entry.scopeId)).size).toBe(2);
    });

    const equalRoot = server.projects.scopedequal;
    await withPublicPackagedServer(server, ['--project-root', equalRoot], async (client) => {
      const response = await callTool<ValidatorResult>(client, 'validate_action_contracts', {
        projectRoot: equalRoot,
      });
      expect(codes(response)).not.toContain('action.entry-point.duplicate');
      expect(codes(response)).not.toContain('action.argument.mismatch');
      expect(response.structured?.diagnostics.summary.unsupported).toBe(0);
    });

    const reverseRoot = server.projects.scopedreverse;
    await withPublicPackagedServer(server, ['--project-root', reverseRoot], async (client) => {
      const response = await callTool<ValidatorResult>(client, 'validate_action_contracts', {
        projectRoot: reverseRoot,
      });
      expect(codes(response)).not.toContain('action.entry-point.duplicate');
      expect(codes(response)).not.toContain('action.argument.mismatch');
      expect(response.structured?.diagnostics.summary.unsupported).toBeGreaterThan(0);
    });

    const duplicateRoot = server.projects.scopedduplicate;
    await withPublicPackagedServer(server, ['--project-root', duplicateRoot], async (client) => {
      const response = await callTool<ValidatorResult>(client, 'validate_action_contracts', {
        projectRoot: duplicateRoot,
      });
      expect(codes(response)).toContain('action.entry-point.duplicate');
    });

    const legacyRoot = server.projects.legacyvisibility;
    await withPublicPackagedServer(server, ['--project-root', legacyRoot], async (client) => {
      const response = await callTool<ValidatorResult>(client, 'validate_action_contracts', {
        projectRoot: legacyRoot,
      });
      const actions = response.structured?.trace?.entryPoints?.map((entry) => entry.action) ?? [];
      expect(actions).toContain('actPass');
      expect(actions).not.toContain('privateHelper');
      expect(actions).not.toContain('protectedHelper');
      expect(
        response.structured?.trace?.entryPoints?.filter((entry) => entry.action === 'actPass'),
      ).toEqual([
        expect.objectContaining({
          argumentNames: ['comment'],
          scope: 'legacy-dispatcher',
        }),
      ]);
    });
  });

  it('[E2E-VALIDATE-MODERN-DOCUMENTATION-CONFLICT] preserves the contradictory walkthrough form as unsupported without dependent false defects', async () => {
    const root = server.projects.walkthroughconflict;
    await withPublicPackagedServer(server, ['--project-root', root], async (client) => {
      const actions = await callTool<ValidatorResult>(client, 'validate_action_contracts', {
        projectRoot: root,
      });
      const states = await callTool<ValidatorResult>(client, 'validate_state_machine', {
        projectRoot: root,
      });

      expect(actions.structured?.diagnostics.summary.unsupported).toBeGreaterThan(0);
      expect(codes(actions)).not.toContain('action.name.convention');
      expect(codes(actions)).not.toContain('action.entry-point.missing');
      expect(codes(actions)).not.toContain('action.call.not-declared');
      expect(states.structured?.diagnostics.summary.unsupported).toBeGreaterThan(0);
      expect(codes(states)).not.toContain('state.dead-end');
      expect(codes(states)).not.toContain('state.unreachable');

      const aggregate = await callTool<AggregateResult>(client, 'validate_project', {
        projectRoot: root,
        groups: ['state-machine', 'action-contracts'],
      });
      expect(aggregate.structured?.diagnostics.summary.unsupported).toBeGreaterThan(0);

      const audit = await callTool<AuditResult>(client, 'run_pre_release_audit', {
        projectRoot: root,
      });
      expect(audit.structured?.counts.unsupported).toBeGreaterThan(0);
    });
  });

  it('[E2E-AUDIT-DATABASE-ALIASES] resolves BGA output aliases and table aliases while keeping unreadable SQL unsupported', async () => {
    const cleanRoot = server.projects.sqlaliases;
    await withPublicPackagedServer(server, ['--project-root', cleanRoot], async (client) => {
      const response = await callTool<ValidatorResult>(client, 'audit_database_usage', {
        projectRoot: cleanRoot,
      });
      expect(response.structured?.diagnostics).toMatchObject({
        status: 'passed',
        summary: { errors: 0, warnings: 0, information: 0, unsupported: 0 },
      });
      expect(response.structured?.queries).toContainEqual(
        expect.objectContaining({
          tables: ['card'],
          columns: ['card.card_id', 'card.card_location'],
        }),
      );
    });

    const missingRoot = server.projects.sqlmissing;
    await withPublicPackagedServer(server, ['--project-root', missingRoot], async (client) => {
      const response = await callTool<ValidatorResult>(client, 'audit_database_usage', {
        projectRoot: missingRoot,
      });
      expect(codes(response)).toContain('database.column.undeclared');
      expect(findings(response).some((finding) => finding.message.includes('missing_column'))).toBe(
        true,
      );
    });

    const unsupportedRoot = server.projects.sqlunsupported;
    await withPublicPackagedServer(server, ['--project-root', unsupportedRoot], async (client) => {
      const response = await callTool<ValidatorResult>(client, 'audit_database_usage', {
        projectRoot: unsupportedRoot,
      });
      expect(response.structured?.diagnostics.summary.unsupported).toBeGreaterThan(0);
      expect(codes(response)).not.toContain('database.table.undeclared');
      expect(codes(response)).not.toContain('database.column.undeclared');
      expect(codes(response)).not.toContain('database.column.unused');
    });
  });
});
