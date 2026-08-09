<?php

declare(strict_types=1);

namespace Bga\Games\BgaMcpModernFixture\States;

use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\Games\BgaMcpModernFixture\Game;

// Deliberately defective: the framework reserves identifier 99 for the end of
// the game and documents that a state class cannot use it. This is the mistake
// a project makes when it carries its old states.inc.php end state into a class.
final class GameEnd extends GameState
{
    public function __construct(protected Game $game)
    {
        parent::__construct(
            $game,
            id: 99,
            type: StateType::GAME,
            description: clienttranslate('End of game'),
            transitions: [],
        );
    }
}
