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
      { action: 'actPass', argumentNames: ['comment'], style: 'ajaxcall' },
    ]);
  });

  it('reads modern bgaPerformAction calls', () => {
    const outcome = parseClientActionCalls(
      `this.bgaPerformAction('actPlay', { cardId: 3, "slot": 1 });\nthis.bgaPerformAction('actPass');`,
    );
    expect(outcome.value).toEqual([
      { action: 'actPlay', argumentNames: ['cardId', 'slot'], style: 'performAction' },
      { action: 'actPass', argumentNames: [], style: 'performAction' },
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
