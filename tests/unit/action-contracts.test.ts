import {
  parseClientActionCalls,
  parsePhpMethodNames,
  parseServerActionEntries,
} from '../../src/project/actions.js';
import type { ProjectModel } from '../../src/project/model.js';
import type { StateDefinition } from '../../src/project/parse.js';
import {
  ACTION_CONTRACT_RULES,
  validateActionContracts,
} from '../../src/rules/action-contracts.js';

function state(overrides: Partial<StateDefinition> = {}): StateDefinition {
  return {
    id: 2,
    name: 'playerTurn',
    type: 'activeplayer',
    action: null,
    args: null,
    possibleActions: [],
    transitions: {},
    origin: 'array',
    description: null,
    descriptionMyTurn: null,
    zombie: null,
    redirects: [],
    edgesResolved: true,
    ...overrides,
  };
}

function model(definitions: readonly StateDefinition[], parsed = true): ProjectModel {
  return {
    schemaVersion: 1,
    layout: 'legacy',
    gameKey: 'fixture',
    detection: {
      layout: 'legacy',
      gameKey: 'fixture',
      certainty: 'certain',
      reason: 'test model',
      components: [],
      signals: [],
    },
    metadata: { gameName: 'Fixture', playerCounts: [2], source: 'gameinfos.inc.php' },
    components: [],
    states: {
      parsed,
      definitions,
      unsupported: [],
      source: 'states.inc.php',
      sources: ['states.inc.php'],
      complete: { declarations: true, edges: true },
      duplicateIds: [],
      initial: { ids: [2], origin: 'state-1', evidence: 'test model' },
    },
    fileCount: 1,
    truncated: false,
    skippedLinks: [],
    diagnostics: {
      schemaVersion: 1,
      status: 'passed',
      summary: { errors: 0, warnings: 0, information: 0, unsupported: 0 },
      findings: [],
    },
  };
}

const CLIENT = `define(['dojo'], function (dojo) {
  return declare('bgagame.fixture', null, {
    onPass: function () {
      this.ajaxcall('/fixture/fixture/actPass.html', { lock: true, comment: 'x' }, this, function () {});
    },
  });
});`;

const ACTION_CLASS = `<?php
class action_fixture extends APP_GameAction
{
    public function actPass()
    {
        $comment = self::getArg('comment', AT_alphanum, false);
        $this->game->actPass($comment);
    }
}`;

const GAME_CLASS = `<?php
class Fixture extends Table
{
    function actPass($comment) {}
}`;

describe('client action call reading', () => {
  it('reads legacy ajaxcall names and arguments, ignoring framework keys', () => {
    const outcome = parseClientActionCalls(CLIENT);
    expect(outcome.unsupported).toEqual([]);
    expect(outcome.value).toEqual([
      {
        action: 'actPass',
        argumentNames: ['comment'],
        argumentValues: { comment: "'x'" },
        style: 'ajaxcall',
      },
    ]);
  });

  it('reads modern bgaPerformAction calls', () => {
    const outcome = parseClientActionCalls(
      `this.bgaPerformAction('actPlay', { cardId: 3, "slot": 1 });\nthis.bgaPerformAction('actPass');`,
    );
    expect(outcome.value).toEqual([
      {
        action: 'actPlay',
        argumentNames: ['cardId', 'slot'],
        argumentValues: { cardId: '3', slot: '1' },
        style: 'performAction',
      },
      { action: 'actPass', argumentNames: [], argumentValues: {}, style: 'performAction' },
    ]);
  });

  it('reports a call it cannot read instead of guessing', () => {
    const computed = parseClientActionCalls(
      `this.ajaxcall('/g/g/' + name + '.html', {}, this, function () {});
       this.bgaPerformAction(actionName, {});
       this.ajaxcall('/g/g/actPlay.html', buildArguments(), this, function () {});`,
    );
    expect(computed.unsupported).toEqual([
      "ajaxcall with a computed URL: '/g/g/' + name + '.html'",
      'ajaxcall to actPlay with computed arguments',
      'bgaPerformAction with a computed name: actionName',
    ]);
    expect(computed.value.map((call) => call.action)).toEqual(['actPlay']);
  });

  it('ignores an ajaxcall URL that names no action', () => {
    const outcome = parseClientActionCalls(`this.ajaxcall('/g/g/notanaction', {}, this, fn);`);
    expect(outcome.value).toEqual([]);
    expect(outcome.unsupported[0]).toContain('does not name an action');
  });
});

describe('server entry point reading', () => {
  it('reads entry points and the arguments they consume', () => {
    const outcome = parseServerActionEntries(ACTION_CLASS);
    expect(outcome.value).toEqual([{ action: 'actPass', argumentNames: ['comment'] }]);
  });

  it('reads arguments taken straight from the request', () => {
    const outcome = parseServerActionEntries(`<?php
class action_fixture {
    public function actPlay()
    {
        $card = $_POST['cardId'];
        $slot = $args['slot'];
    }
}`);
    expect(outcome.value).toEqual([{ action: 'actPlay', argumentNames: ['cardId', 'slot'] }]);
  });

  it('reports an argument name it cannot read', () => {
    const outcome = parseServerActionEntries(`<?php
class action_fixture {
    public function actPlay() { $value = self::getArg($name, AT_posint, true); }
}`);
    expect(outcome.unsupported).toEqual(['entry point actPlay reads a computed argument name']);
  });

  it('lists declared PHP method names', () => {
    expect(parsePhpMethodNames(GAME_CLASS)).toEqual(['actPass']);
  });
});

describe('action contract rules', () => {
  const client = [{ path: 'fixture.js', text: CLIENT }];
  const php = [
    { path: 'fixture.action.php', text: ACTION_CLASS },
    { path: 'fixture.game.php', text: GAME_CLASS },
  ];

  it('publishes unique codes, and every uncertain rule records its false positives', () => {
    const codes = ACTION_CONTRACT_RULES.map((rule) => rule.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const rule of ACTION_CONTRACT_RULES) {
      expect(rule.code).toMatch(/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u);
      if (rule.certainty !== 'certain') {
        expect(rule.falsePositives.length).toBeGreaterThan(0);
      }
    }
  });

  it('accepts a contract where client, entry point, and game method agree', () => {
    const trace = validateActionContracts(
      model([state({ possibleActions: ['actPass'] })]),
      client,
      php,
    );
    expect(trace.diagnostics.status).toBe('passed');
    expect(trace.clientCalls).toHaveLength(1);
    expect(trace.entryPoints).toHaveLength(1);
    expect(trace.declaredActions).toEqual(['actPass']);
    expect(trace.gameMethods).toEqual(['actPass']);
  });

  it('reports an argument the client sends but the entry point never reads', () => {
    const trace = validateActionContracts(
      model([state({ possibleActions: ['actPass'] })]),
      [
        {
          path: 'fixture.js',
          text: `this.ajaxcall('/f/f/actPass.html', { lock: true, cardId: 3 }, this, fn);`,
        },
      ],
      php,
    );
    const mismatches = trace.diagnostics.findings.filter(
      (finding) => finding.code === 'action.argument.mismatch',
    );
    expect(mismatches).toHaveLength(2);
    expect(mismatches.map((finding) => finding.kind)).toEqual(['heuristic', 'heuristic']);
    expect(mismatches[0]?.message).toContain("'cardId'");
    expect(mismatches[1]?.message).toContain("'comment'");
  });

  it('reports a call no state allows and a declaration nothing calls', () => {
    const trace = validateActionContracts(
      model([state({ possibleActions: ['actPlay'] })]),
      client,
      php,
    );
    const codes = trace.diagnostics.findings.map((finding) => finding.code);
    expect(codes).toContain('action.call.not-declared');
    expect(codes).toContain('action.declared.not-called');
    const notCalled = trace.diagnostics.findings.find(
      (finding) => finding.code === 'action.declared.not-called',
    );
    expect(notCalled).toMatchObject({ kind: 'heuristic', certainty: 'possible' });
  });

  it('reports a missing entry point, a missing game method, and a broken name', () => {
    const trace = validateActionContracts(
      model([state({ possibleActions: ['passTurn'] })]),
      [
        {
          path: 'fixture.js',
          text: `this.ajaxcall('/f/f/passTurn.html', { lock: true }, this, fn);`,
        },
      ],
      [
        {
          path: 'fixture.action.php',
          text: '<?php class action_fixture { function actOther() {} }',
        },
        { path: 'fixture.game.php', text: '<?php class Fixture {}' },
      ],
    );
    const codes = trace.diagnostics.findings.map((finding) => finding.code);
    expect(codes).toContain('action.entry-point.missing');
    expect(codes).toContain('action.name.convention');
    const convention = trace.diagnostics.findings.find(
      (finding) => finding.code === 'action.name.convention',
    );
    expect(convention).toMatchObject({ kind: 'issue', certainty: 'certain' });
    expect(convention?.suggestions[0]?.message).toContain('actPassTurn');
  });

  it('reports a duplicated entry point as a fact', () => {
    const trace = validateActionContracts(
      model([state({ possibleActions: ['actPass'] })]),
      client,
      [
        {
          path: 'fixture.action.php',
          text: '<?php class action_fixture { function actPass() {} function actPass() {} }',
        },
        { path: 'fixture.game.php', text: GAME_CLASS },
      ],
    );
    const duplicate = trace.diagnostics.findings.find(
      (finding) => finding.code === 'action.entry-point.duplicate',
    );
    expect(duplicate).toMatchObject({ kind: 'issue', severity: 'error', certainty: 'certain' });
  });

  it('never returns a clean result when a side of the contract cannot be read', () => {
    const noClient = validateActionContracts(
      model([state({ possibleActions: ['actPass'] })]),
      [],
      php,
    );
    expect(noClient.diagnostics.status).toBe('findings');
    expect(noClient.diagnostics.findings[0]).toMatchObject({
      code: 'action.trace.unavailable',
      certainty: 'certain',
    });
    expect(noClient.diagnostics.findings[0]?.message).toContain('no readable client source');

    const noStates = validateActionContracts(model([], false), client, php);
    expect(noStates.diagnostics.findings[0]?.message).toContain('no readable state machine');
  });

  it('carries unreadable calls through as unsupported syntax', () => {
    const trace = validateActionContracts(
      model([state({ possibleActions: ['actPass'] })]),
      [{ path: 'fixture.js', text: `this.bgaPerformAction(name, {});` }],
      php,
    );
    const unsupported = trace.diagnostics.findings.filter(
      (finding) => finding.kind === 'unsupported-syntax',
    );
    expect(unsupported).toHaveLength(1);
    expect(unsupported[0]?.code).toBe('action.unsupported-syntax');
  });

  it('orders findings deterministically', () => {
    const inputs = [model([state({ possibleActions: ['actPlay'] })]), client, php] as const;
    const first = validateActionContracts(...inputs);
    const second = validateActionContracts(...inputs);
    expect(JSON.stringify(first.diagnostics)).toBe(JSON.stringify(second.diagnostics));
    const codes = first.diagnostics.findings.map((finding) => finding.code);
    expect(codes).toEqual([...codes].sort());
  });
});

describe('modern action wiring', () => {
  const STATE_CLASS = `<?php
namespace Bga\\Games\\demo\\States;

final class PlayerTurn extends GameState
{
    #[PossibleAction]
    public function actPlay(int $cardId, int $active_player_id, int $currentPlayerId): string
    {
        return 'next';
    }

    public function actInternal(int $secret): void {}
}`;

  const MODERN_GAME_CLASS = `<?php
namespace Bga\\Games\\demo;

final class Game extends Table
{
    public function actPass(): string { return 'pass'; }

    public function actSpendGold(#[IntParam(min: 1)] int $gold) {}

    public function actChooseAction(#[StringParam(enum: ['move', 'pass'])] string $action) {}

    public function actPlayCard(#[IntParam(name: 'id')] int $cardId) {}
}`;

  const modernPhp = [
    { path: 'modules/php/Game.php', text: MODERN_GAME_CLASS },
    { path: 'modules/php/States/PlayerTurn.php', text: STATE_CLASS },
  ];

  function trace(clientText: string, states = [state({ possibleActions: ['actPlay'] })]) {
    return validateActionContracts(
      model(states),
      [{ path: 'modules/js/Game.js', text: clientText }],
      modernPhp,
    );
  }

  it('treats a #[PossibleAction] state method as an entry point, and an unattributed one as not', () => {
    // Regression: this exact signature produced action.entry-point.missing.
    const result = trace(`this.bga.actions.performAction('actPlay', { cardId: 3 });`);
    expect(result.diagnostics.findings.map((finding) => finding.code)).not.toContain(
      'action.entry-point.missing',
    );
    expect(result.entryPoints.map((entry) => entry.action).sort()).toEqual([
      'actChooseAction',
      'actPass',
      'actPlay',
      'actPlayCard',
      'actSpendGold',
    ]);
  });

  it('does not treat a framework-injected parameter as a client argument', () => {
    const result = trace(`this.bga.actions.performAction('actPlay', { cardId: 3 });`);
    expect(result.entryPoints.find((entry) => entry.action === 'actPlay')?.argumentNames).toEqual([
      'cardId',
    ]);
    expect(result.diagnostics.findings.map((finding) => finding.code)).not.toContain(
      'action.argument.mismatch',
    );
  });

  it('lets the game class answer for an action no state lists', () => {
    // "the framework will check if the function exists in the Game.php file
    // (for actions that can be triggered at any state)".
    const result = trace(`this.bga.actions.performAction('actPass', {});`);
    expect(result.diagnostics.findings.map((finding) => finding.code)).not.toContain(
      'action.call.not-declared',
    );
  });

  it('expects the name the parameter attribute declares, not the variable name', () => {
    const named = trace(`this.bga.actions.performAction('actPlayCard', { id: 3 });`);
    expect(named.diagnostics.findings.map((finding) => finding.code)).not.toContain(
      'action.argument.mismatch',
    );

    const wrong = trace(`this.bga.actions.performAction('actPlayCard', { cardId: 3 });`);
    expect(wrong.diagnostics.findings.map((finding) => finding.code)).toContain(
      'action.argument.mismatch',
    );
  });

  it('compares a literal argument with the check its attribute declares', () => {
    const belowMinimum = trace(`this.bga.actions.performAction('actSpendGold', { gold: 0 });`);
    const invalid = belowMinimum.diagnostics.findings.find(
      (finding) => finding.code === 'action.argument.invalid',
    );
    expect(invalid).toMatchObject({ kind: 'issue', severity: 'error', certainty: 'certain' });
    expect(invalid?.message).toContain('below the declared minimum of 1');

    const outsideEnum = trace(
      `this.bga.actions.performAction('actChooseAction', { action: 'sleep' });`,
    );
    expect(
      outsideEnum.diagnostics.findings.find((finding) => finding.code === 'action.argument.invalid')
        ?.message,
    ).toContain('enum');

    for (const accepted of [
      `this.bga.actions.performAction('actSpendGold', { gold: 4 });`,
      `this.bga.actions.performAction('actChooseAction', { action: 'move' });`,
      // A value the client computes states nothing, so nothing is claimed.
      `this.bga.actions.performAction('actSpendGold', { gold: this.chosen });`,
    ]) {
      expect(trace(accepted).diagnostics.findings.map((finding) => finding.code)).not.toContain(
        'action.argument.invalid',
      );
    }
  });

  it('lets the legacy dispatcher win where a project still has one', () => {
    // "if you also declare the function in the action.php, it will be used
    // instead of the autowiring".
    const result = validateActionContracts(
      model([state({ possibleActions: ['actPass'] })]),
      [{ path: 'modules/js/Game.js', text: `this.bga.actions.performAction('actPass', {});` }],
      [
        ...modernPhp,
        {
          path: 'fixture.action.php',
          text: `<?php class action_fixture { public function actPass() { $c = self::getArg('comment', AT_alphanum, false); } }`,
        },
      ],
    );
    const entries = result.entryPoints.filter((entry) => entry.action === 'actPass');
    expect(entries).toHaveLength(1);
    expect(entries[0]?.source).toBe('fixture.action.php');
  });
});
