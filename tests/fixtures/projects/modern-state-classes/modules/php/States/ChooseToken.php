<?php

declare(strict_types=1);

namespace Bga\Games\BgaMcpStateClassFixture\States;

use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\GameFramework\States\PossibleAction;
use Bga\Games\BgaMcpStateClassFixture\Game;
use Bga\Games\BgaMcpStateClassFixture\StateConstants;

// A private parallel state. Players leave it when the master state deactivates
// them, not through a transition of its own.
final class ChooseToken extends GameState
{
    public function __construct(protected Game $game)
    {
        parent::__construct(
            $game,
            id: StateConstants::STATE_CHOOSE_TOKEN,
            type: StateType::PRIVATE,
            descriptionMyTurn: clienttranslate('${you} must choose a token to keep'),
            transitions: [],
        );
    }

    public function getArgs(int $playerId): array
    {
        return ['availableTokens' => []];
    }

    #[PossibleAction]
    public function actChooseToken(int $tokenId, int $currentPlayerId): void
    {
        $this->gamestate->setPlayerNonMultiactive($currentPlayerId, 'startPlay');
    }

    public function zombie(int $playerId): void
    {
        $this->gamestate->setPlayerNonMultiactive($playerId, 'startPlay');
    }
}
