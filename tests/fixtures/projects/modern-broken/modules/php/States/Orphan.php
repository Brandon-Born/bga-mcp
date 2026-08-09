<?php

declare(strict_types=1);

namespace Bga\Games\BgaMcpModernFixture\States;

use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\Games\BgaMcpModernFixture\Game;

// Deliberately defective: shares a name with PlayerTurn, declares a type the
// framework does not document, has no transitions, and nothing reaches it.
final class Orphan extends GameState
{
    public function __construct(protected Game $game)
    {
        parent::__construct(
            $game,
            id: 3,
            name: 'playerTurn',
            type: StateType::MYSTERY,
            description: '',
            transitions: [],
        );
    }
}
