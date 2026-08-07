<?php

declare(strict_types=1);

namespace Bga\Games\BgaMcpModernFixture\States;

use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\Games\BgaMcpModernFixture\Game;

final class GameEnd extends GameState
{
    public function __construct(protected Game $game)
    {
        parent::__construct(
            $game,
            id: 99,
            type: StateType::MANAGER,
            description: clienttranslate('End of game'),
            transitions: [],
        );
    }
}
