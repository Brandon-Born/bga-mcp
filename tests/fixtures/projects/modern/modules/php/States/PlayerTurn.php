<?php

declare(strict_types=1);

namespace Bga\Games\BgaMcpModernFixture\States;

use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\Games\BgaMcpModernFixture\Game;
use Bga\Games\BgaMcpModernFixture\StateConstants;

final class PlayerTurn extends GameState
{
    public function __construct(protected Game $game)
    {
        parent::__construct(
            $game,
            id: StateConstants::STATE_PLAYER_TURN,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} must play a card, or pass'),
            descriptionMyTurn: clienttranslate('${you} must play a card, or pass'),
            transitions: [
                'play' => StateConstants::STATE_PLAYER_TURN,
                'pass' => StateConstants::STATE_NEXT_PLAYER,
            ],
            updateGameProgression: true,
        );
    }

    public function getArgs(): array
    {
        return ['playableCards' => []];
    }

    public function zombie(int $playerId): string
    {
        return 'pass';
    }
}
