<?php

declare(strict_types=1);

namespace Bga\Games\BgaMcpHybridFixture\States;

use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\Games\BgaMcpHybridFixture\Game;

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
            // The target is still declared in states.inc.php.
            transitions: ['pass' => 3],
        );
    }

    public function getArgs(): array
    {
        return ['playableCards' => []];
    }
}
