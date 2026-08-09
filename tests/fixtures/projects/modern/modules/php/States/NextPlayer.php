<?php

declare(strict_types=1);

namespace Bga\Games\BgaMcpModernFixture\States;

use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\Games\BgaMcpModernFixture\Game;
use Bga\Games\BgaMcpModernFixture\StateConstants;

final class NextPlayer extends GameState
{
    public function __construct(protected Game $game)
    {
        parent::__construct(
            $game,
            id: StateConstants::STATE_NEXT_PLAYER,
            type: StateType::GAME,
            description: '',
            transitions: [],
        );
    }

    // A handler redirects by returning a class name, a state identifier, or a
    // transition name. This one uses the first two forms; the identifier is
    // the framework's end-of-game state, which no class may declare.
    public function onEnteringState(int $activePlayerId): int|string
    {
        if ($this->game->isGameOver()) {
            return StateConstants::STATE_END_GAME;
        }

        return PlayerTurn::class;
    }
}
