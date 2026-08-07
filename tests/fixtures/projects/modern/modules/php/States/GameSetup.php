<?php

declare(strict_types=1);

namespace Bga\Games\BgaMcpModernFixture\States;

use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\Games\BgaMcpModernFixture\Game;

final class GameSetup extends GameState
{
    public function __construct(protected Game $game)
    {
        parent::__construct(
            $game,
            id: 1,
            type: StateType::MANAGER,
            description: '',
            transitions: ['' => 2],
        );
    }

    public function onEnteringState(): void
    {
    }
}
