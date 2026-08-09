<?php

declare(strict_types=1);

namespace Bga\Games\BgaMcpUnreadableFixture\States;

use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\Games\BgaMcpUnreadableFixture\Game;

final class PlayerTurn extends GameState
{
    public function __construct(protected Game $game)
    {
        parent::__construct(
            $game,
            id: 2,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} must play a card or pass'),
            descriptionMyTurn: clienttranslate('${you} must play a card or pass'),
            // State 40 is the identifier the computed class means to declare.
            // It is not a dangling target; it is a target this reader cannot
            // see, which is a different thing and must be reported as one.
            transitions: ['pass' => 40],
        );
    }

    // The redirect is computed too, so where this state hands control is
    // unknown rather than absent.
    public function zombie(int $playerId): string
    {
        return $this->game->chooseNextState($playerId);
    }
}
