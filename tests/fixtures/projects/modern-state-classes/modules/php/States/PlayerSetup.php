<?php

declare(strict_types=1);

namespace Bga\Games\BgaMcpStateClassFixture\States;

use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\Games\BgaMcpStateClassFixture\Game;
use Bga\Games\BgaMcpStateClassFixture\StateConstants;

// The master multiactive state. initialPrivate names the private state each
// active player is transitioned into, and it accepts a class name.
final class PlayerSetup extends GameState
{
    public function __construct(protected Game $game)
    {
        parent::__construct(
            $game,
            id: StateConstants::STATE_PLAYER_SETUP,
            type: StateType::MULTIPLE_ACTIVE_PLAYER,
            description: clienttranslate('Other players must choose a token'),
            descriptionMyTurn: clienttranslate('${you} must choose a token'),
            transitions: ['startPlay' => StateConstants::STATE_PLAYER_TURN],
            initialPrivate: ChooseToken::class,
        );
    }

    public function onEnteringState(): void
    {
        $this->gamestate->setAllPlayersMultiactive();
        $this->gamestate->initializePrivateStateForAllActivePlayers();
    }

    public function zombie(int $playerId): void
    {
        $this->gamestate->setPlayerNonMultiactive($playerId, 'startPlay');
    }
}
