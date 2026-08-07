<?php

declare(strict_types=1);

namespace Bga\Games\BgaMcpModernFixture\States;

use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\Games\BgaMcpModernFixture\Game;

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
            transitions: ['play' => 2, 'pass' => 42],
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
