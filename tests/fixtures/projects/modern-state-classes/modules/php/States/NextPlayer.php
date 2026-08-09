<?php

declare(strict_types=1);

namespace Bga\Games\BgaMcpStateClassFixture\States;

use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\Games\BgaMcpStateClassFixture\Game;
use Bga\Games\BgaMcpStateClassFixture\StateConstants;

final class NextPlayer extends GameState
{
    public function __construct(protected Game $game)
    {
        parent::__construct(
            $game,
            id: StateConstants::STATE_NEXT_PLAYER,
            type: StateType::GAME,
            description: '',
            transitions: ['nextTurn' => StateConstants::STATE_PLAYER_TURN],
        );
    }

    // Redirecting by state identifier: "a state id will redirect to the state
    // of that id. It must be typed as int".
    public function onEnteringState(int $active_player_id): int|string
    {
        if ($this->game->isRoundOver()) {
            return StateConstants::STATE_END_GAME;
        }

        return 'nextTurn';
    }
}
