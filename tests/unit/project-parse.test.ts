import {
  parseJsonc,
  parseLegacyMetadata,
  parseLegacyStates,
  parseModernMetadata,
} from '../../src/project/parse.js';

describe('JSONC reading', () => {
  it('ignores comments and trailing commas but keeps string content intact', () => {
    expect(
      parseJsonc(`{
        // line comment
        "game_name": "Has // slashes and /* stars */",
        /* block
           comment */
        "player_numbers": [2, 3,],
      }`),
    ).toEqual({ game_name: 'Has // slashes and /* stars */', player_numbers: [2, 3] });
    expect(parseJsonc('{"escaped": "quote \\" then // not a comment"}')).toEqual({
      escaped: 'quote " then // not a comment',
    });
    expect(() => parseJsonc('{ not json')).toThrow();
  });
});

describe('metadata reading', () => {
  it('reads modern metadata and reports what it could not read', () => {
    expect(parseModernMetadata('{"game_name":"Fixture","player_numbers":[2,4]}')).toEqual({
      value: { gameName: 'Fixture', playerCounts: [2, 4] },
      unsupported: [],
    });

    const partial = parseModernMetadata('{"player_numbers":"two to four"}');
    expect(partial.value).toEqual({ gameName: null, playerCounts: [] });
    expect(partial.unsupported).toContain('missing or non-string game_name');

    expect(parseModernMetadata('nonsense').unsupported).toEqual(['unparsable JSON object']);
    expect(parseModernMetadata('[1,2]').unsupported).toEqual(['non-object metadata']);
  });

  it('reads legacy PHP metadata literals and flags computed values', () => {
    expect(
      parseLegacyMetadata("<?php\n$gameinfos = ['game_name' => 'Fixture', 'players' => [2, 3]];"),
    ).toEqual({ value: { gameName: 'Fixture', playerCounts: [2, 3] }, unsupported: [] });

    expect(
      parseLegacyMetadata(
        "<?php\n$gameinfos = array('game_name' => 'Old', 'players' => array(2));",
      ),
    ).toEqual({ value: { gameName: 'Old', playerCounts: [2] }, unsupported: [] });

    const computed = parseLegacyMetadata('<?php\n$gameinfos = $shared;');
    expect(computed.value.gameName).toBeNull();
    expect(computed.unsupported).toEqual([
      "no literal 'game_name' assignment",
      "no literal 'players' list",
    ]);
  });
});

describe('legacy state machine reading', () => {
  const states = `<?php
$machinestates = [
    1 => ['name' => 'gameSetup', 'type' => 'manager', 'action' => 'stGameSetup', 'transitions' => ['' => 2]],
    2 => ['name' => 'playerTurn', 'type' => 'activeplayer', 'possibleactions' => ['actPass', 'actPlay'], 'transitions' => ['pass' => 99, 'play' => 2]],
    99 => ['name' => 'gameEnd', 'type' => 'manager', 'action' => 'stGameEnd'],
];`;

  it('reads identifiers, types, actions, possible actions, and transitions', () => {
    const outcome = parseLegacyStates(states);
    expect(outcome.unsupported).toEqual([]);
    expect(outcome.value).toHaveLength(3);
    expect(outcome.value[1]).toEqual({
      id: 2,
      name: 'playerTurn',
      type: 'activeplayer',
      action: null,
      args: null,
      possibleActions: ['actPass', 'actPlay'],
      transitions: { pass: 99, play: 2 },
    });
    expect(outcome.value[2]?.transitions).toEqual({});
  });

  it('reports constructs it cannot interpret instead of dropping them', () => {
    expect(parseLegacyStates('<?php\n$machinestates = [];').unsupported).toEqual([
      'no literal state entries',
    ]);
    for (const source of ['<?php\n$machinestates = $imported;', '<?php\n// nothing here']) {
      expect(parseLegacyStates(source).unsupported).toEqual([
        'no literal $machinestates assignment',
      ]);
    }

    const computed = parseLegacyStates(`<?php
$machinestates = [
    STATE_SETUP => ['name' => 'gameSetup'],
    2 => ['name' => 'playerTurn', 'transitions' => ['pass' => STATE_END]],
];`);
    expect(computed.unsupported).toEqual([
      'non-literal state key STATE_SETUP',
      'non-literal transition target in state 2',
    ]);
    expect(computed.value.map((state) => state.id)).toEqual([2]);
  });
});
