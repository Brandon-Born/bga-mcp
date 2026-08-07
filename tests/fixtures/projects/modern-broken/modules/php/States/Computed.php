<?php

declare(strict_types=1);

namespace Bga\Games\BgaMcpModernFixture\States;

use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\Games\BgaMcpModernFixture\Game;

// Deliberately unreadable: the identifier is computed, so no reader can know
// which state this is without executing the project.
final class Computed extends GameState
{
    public const STATE_ID = 40;

    public function __construct(protected Game $game)
    {
        parent::__construct(
            $game,
            id: self::STATE_ID,
            type: StateType::GAME,
            description: '',
            transitions: [],
        );
    }
}
