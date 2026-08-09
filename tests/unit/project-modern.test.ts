import { parseModernStates, readInitialState } from '../../src/project/modern.js';
import {
  collectIntConstants,
  maskLiterals,
  readMethods,
  readStringLiteral,
  resolveIntExpression,
  returnExpressions,
} from '../../src/project/php.js';

const CONSTANTS = {
  path: 'modules/php/StateConstants.php',
  text: `<?php
namespace Bga\\Games\\demo;

class StateConstants {
    const STATE_PLAYER_TURN = 2;
    const STATE_NEXT_PLAYER = 27;
    const STATE_END_GAME = 99;
}`,
};

/** The class the state-class documentation gives as its worked example. */
const PLAYER_TURN = {
  path: 'modules/php/States/PlayerTurn.php',
  text: `<?php
declare(strict_types=1);

namespace Bga\\Games\\demo\\States;

use Bga\\GameFramework\\StateType;
use Bga\\GameFramework\\States\\GameState;
use Bga\\GameFramework\\States\\PossibleAction;
use Bga\\Games\\demo\\Game;

class PlayerTurn extends GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: StateConstants::STATE_PLAYER_TURN,
            type: StateType::ACTIVE_PLAYER,

            // optional
            description: clienttranslate('\${actplayer} must play a card (or pass)'),
            descriptionMyTurn: clienttranslate('\${you} must play a card (or pass)'),
            transitions: ['nextPlayer' => StateConstants::STATE_NEXT_PLAYER],
            updateGameProgression: false,
            initialPrivate: null,
        );
    }

    public function getArgs(): array
    {
        return ['playableCards' => []];
    }

    function onEnteringState(int $activePlayerId) {
        // No redirect: the state waits for the player.
        return;
    }

    #[PossibleAction]
    public function actPlayCard(int $cardId, int $activePlayerId, array $args): string
    {
        return NextPlayer::class;
    }

    /** Not advertised to the client: no #[PossibleAction] attribute. */
    public function actInternal(): void
    {
    }

    function zombie(int $playerId): string {
        return 'nextPlayer';
    }
}`,
};

const NEXT_PLAYER = {
  path: 'modules/php/States/NextPlayer.php',
  text: `<?php
namespace Bga\\Games\\demo\\States;

use Bga\\GameFramework\\StateType;

final class NextPlayer extends \\Bga\\GameFramework\\States\\GameState
{
    public function __construct(protected Game $game)
    {
        parent::__construct($game, id: StateConstants::STATE_NEXT_PLAYER, type: StateType::GAME);
    }

    public function onEnteringState(int $active_player_id)
    {
        return StateConstants::STATE_END_GAME;
    }
}`,
};

describe('modern state class reading', () => {
  it('reads the documented example without guessing at anything', () => {
    const outcome = parseModernStates([PLAYER_TURN, NEXT_PLAYER], [CONSTANTS]);
    expect(outcome.unsupported).toEqual([]);

    expect(outcome.value[0]).toEqual({
      // The identifier is a StateConstants member, resolved from the source
      // that declares it rather than by running the project.
      id: 2,
      // "Parameter name can be specified, by default it will be the class name".
      name: 'PlayerTurn',
      type: 'activeplayer',
      action: 'onEnteringState',
      args: 'getArgs',
      zombie: 'zombie',
      // "The possible actions for this states don't need to be declared as an
      // array, they will be found with the tag #[PossibleAction]".
      possibleActions: ['actPlayCard'],
      transitions: { nextPlayer: 27 },
      origin: 'class',
      // The description survives clienttranslate, and the brackets inside it
      // do not throw the reader off the end of the call.
      description: '${actplayer} must play a card (or pass)',
      descriptionMyTurn: '${you} must play a card (or pass)',
      // actPlayCard returns a class name and zombie returns a transition name.
      redirects: [27],
      edgesResolved: true,
    });

    // A handler that returns a state identifier reaches that state.
    expect(outcome.value[1]).toMatchObject({ id: 27, type: 'game', redirects: [99] });
    expect([...outcome.classIds]).toEqual([
      ['PlayerTurn', 2],
      ['NextPlayer', 27],
    ]);
  });

  it('accepts every documented state type, including PRIVATE', () => {
    const source = (name: string, id: number, type: string) => ({
      path: `modules/php/States/${name}.php`,
      text: `<?php
final class ${name} extends GameState {
  public function __construct(protected Game $game) {
    parent::__construct($game, id: ${String(id)}, type: StateType::${type}, transitions: []);
  }
}`,
    });

    const outcome = parseModernStates([
      source('Master', 10, 'MULTIPLE_ACTIVE_PLAYER'),
      source('Choose', 11, 'PRIVATE'),
      source('Turn', 12, 'ACTIVE_PLAYER'),
      source('Between', 13, 'GAME'),
    ]);
    expect(outcome.unsupported).toEqual([]);
    expect(outcome.value.map((state) => state.type)).toEqual([
      'multipleactiveplayer',
      'private',
      'activeplayer',
      'game',
    ]);
  });

  it('treats initialPrivate as the way into a private state', () => {
    const outcome = parseModernStates([
      {
        path: 'modules/php/States/Master.php',
        text: `<?php
final class Master extends GameState {
  public function __construct(protected Game $game) {
    parent::__construct($game, id: 10, type: StateType::MULTIPLE_ACTIVE_PLAYER, initialPrivate: Choose::class, transitions: ['done' => 12]);
  }
}`,
      },
      {
        path: 'modules/php/States/Choose.php',
        text: `<?php
final class Choose extends GameState {
  public function __construct(protected Game $game) {
    parent::__construct($game, id: 11, type: StateType::PRIVATE);
  }
}`,
      },
    ]);
    expect(outcome.unsupported).toEqual([]);
    expect(outcome.value[0]?.redirects).toEqual([11]);
  });

  it('reports what it cannot read, with the file it is in and what it leaves incomplete', () => {
    const outcome = parseModernStates([
      {
        path: 'modules/php/States/Computed.php',
        text: `<?php
final class Computed extends GameState {
  public function __construct(protected Game $game) {
    parent::__construct($game, id: $game->stateIdFor(self::class), type: StateType::GAME);
  }
}`,
      },
      {
        path: 'modules/php/States/Positional.php',
        text: `<?php
final class Positional extends GameState {
  public function __construct(protected Game $game) {
    parent::__construct($game, 12, StateType::GAME);
  }
}`,
      },
      {
        path: 'modules/php/States/Turn.php',
        text: `<?php
final class Turn extends GameState {
  public function __construct(protected Game $game) {
    parent::__construct($game, id: 2, type: StateType::ACTIVE_PLAYER, transitions: [], surprise: true);
  }
  public function zombie(int $playerId) { return $this->game->wherever(); }
}`,
      },
    ]);

    expect(outcome.value.map((state) => state.id)).toEqual([2]);
    expect(outcome.unsupported).toEqual([
      {
        path: 'modules/php/States/Computed.php',
        construct: 'state class Computed with a non-literal id: $game->stateIdFor(self::class)',
        scope: 'declaration',
      },
      {
        path: 'modules/php/States/Positional.php',
        construct: 'state class Positional passes constructor arguments positionally',
        scope: 'declaration',
      },
      {
        path: 'modules/php/States/Turn.php',
        construct: 'state class Turn declares unknown argument surprise:',
        scope: 'detail',
      },
      {
        path: 'modules/php/States/Turn.php',
        construct:
          'state class Turn names a state this reader cannot resolve: return $this->game->wherever()',
        scope: 'edge',
      },
    ]);
    expect(outcome.value[0]?.edgesResolved).toBe(false);
  });

  it('resolves an identifier a class declares as its own constant', () => {
    const outcome = parseModernStates([
      {
        path: 'modules/php/States/Turn.php',
        text: `<?php
final class Turn extends GameState {
  public const STATE_ID = 40;
  public function __construct(protected Game $game) {
    parent::__construct($game, id: self::STATE_ID, type: StateType::GAME);
  }
}`,
      },
    ]);
    expect(outcome.unsupported).toEqual([]);
    expect(outcome.value[0]?.id).toBe(40);
  });

  it('ignores a class that is not a state class', () => {
    const outcome = parseModernStates([
      { path: 'modules/php/States/Helper.php', text: '<?php final class Helper extends Deck {}' },
    ]);
    expect(outcome.value).toEqual([]);
    expect(outcome.unsupported).toEqual([]);
  });
});

describe('initial state reading', () => {
  const states = parseModernStates([PLAYER_TURN, NEXT_PLAYER], [CONSTANTS]);

  const game = (body: string) => [
    CONSTANTS,
    {
      path: 'modules/php/Game.php',
      text: `<?php
final class Game extends \\Bga\\GameFramework\\Table {
  protected function setupNewGame($players, $options = []) {
    ${body}
  }
}`,
    },
  ];

  it('reads the class setupNewGame returns', () => {
    const outcome = readInitialState(
      game('// create your game stuff\n    return PlayerTurn::class;'),
      states.value,
      states.classIds,
    );
    expect(outcome.ids).toEqual([2]);
    expect(outcome.evidence).toContain('PlayerTurn::class');
    expect(outcome.unreadable).toBeNull();
  });

  it('reads an identifier or a constant it returns', () => {
    for (const expression of ['return 27;', 'return StateConstants::STATE_NEXT_PLAYER;']) {
      expect(readInitialState(game(expression), states.value, states.classIds).ids).toEqual([27]);
    }
  });

  it('reports a return value it cannot resolve rather than falling back', () => {
    const outcome = readInitialState(
      game('return $this->firstState();'),
      states.value,
      states.classIds,
    );
    expect(outcome.ids).toEqual([]);
    expect(outcome.unreadable).toMatchObject({
      path: 'modules/php/Game.php',
      scope: 'edge',
    });
  });

  it('says nothing when setupNewGame returns nothing', () => {
    const outcome = readInitialState(game('$this->setup();'), states.value, states.classIds);
    expect(outcome).toEqual({ ids: [], evidence: null, unreadable: null });
  });
});

describe('PHP source reading', () => {
  it('blanks string and comment content while keeping every offset', () => {
    const source = `<?php // a ] comment\n$x = 'a ) string';\n/* ] */ $y = "b } string";`;
    const masked = maskLiterals(source);
    expect(masked.length).toBe(source.length);
    expect(masked).not.toContain(']');
    expect(masked).not.toContain('}');
    expect(masked).toContain("$x = '");
    expect(masked.split('\n')).toHaveLength(source.split('\n').length);
  });

  it('reads a literal string, including the translated form descriptions use', () => {
    expect(readStringLiteral("clienttranslate('${you} play')")).toBe('${you} play');
    expect(readStringLiteral('  "quoted"  ')).toBe('quoted');
    expect(readStringLiteral("''")).toBe('');
    expect(readStringLiteral("'a' . $suffix")).toBeNull();
    expect(readStringLiteral('$computed')).toBeNull();
  });

  it('collects the integer constants a project declares, keyed by their class', () => {
    const constants = collectIntConstants([
      { path: 'states.inc.php', text: "<?php define('STATE_END_GAME', 99);" },
      CONSTANTS,
    ]);
    expect(resolveIntExpression('STATE_END_GAME', constants)).toBe(99);
    expect(resolveIntExpression('StateConstants::STATE_PLAYER_TURN', constants)).toBe(2);
    expect(
      resolveIntExpression('\\Bga\\Games\\demo\\StateConstants::STATE_END_GAME', constants),
    ).toBe(99);
    expect(resolveIntExpression('self::STATE_END_GAME', constants, 'StateConstants')).toBe(99);
    expect(resolveIntExpression('$computed', constants)).toBeNull();
    expect(resolveIntExpression('Elsewhere::STATE', constants)).toBeNull();
  });

  it('reads methods with their attributes and bodies, and the values they return', () => {
    const methods = readMethods(PLAYER_TURN.text);
    const action = methods.find((method) => method.name === 'actPlayCard');
    expect(action?.attributes).toContain('#[PossibleAction]');
    expect(action?.parameters).toContain('int $cardId');
    expect(returnExpressions(action?.body ?? '')).toEqual(['NextPlayer::class']);

    // `return;` redirects nowhere, which is how a state stays where it is.
    const entering = methods.find((method) => method.name === 'onEnteringState');
    expect(returnExpressions(entering?.body ?? '')).toEqual([]);

    // An abstract declaration has no body to read, and is not confused with one.
    expect(readMethods('<?php abstract class A { abstract function later(): int; }')).toEqual([
      { name: 'later', attributes: '', parameters: '', body: '' },
    ]);
  });
});
