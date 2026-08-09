<?php

declare(strict_types=1);

namespace Bga\Games\BgaMcpUnreadableFixture\States;

use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\Games\BgaMcpUnreadableFixture\Game;

// Deliberately unreadable: the identifier is computed at run time, so no
// reader can know which state this is without executing the project. Nothing
// downstream may pretend the machine is complete without it.
final class Computed extends GameState
{
    public function __construct(protected Game $game)
    {
        parent::__construct(
            $game,
            id: $game->stateIdFor(self::class),
            type: StateType::GAME,
            description: '',
            transitions: [],
        );
    }
}
