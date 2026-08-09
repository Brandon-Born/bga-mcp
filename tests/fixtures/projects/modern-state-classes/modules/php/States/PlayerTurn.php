<?php

declare(strict_types=1);

namespace Bga\Games\BgaMcpStateClassFixture\States;

use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\GameFramework\States\PossibleAction;
use Bga\Games\BgaMcpStateClassFixture\Game;
use Bga\Games\BgaMcpStateClassFixture\StateConstants;

final class PlayerTurn extends GameState
{
    public function __construct(protected Game $game)
    {
        parent::__construct(
            $game,
            id: StateConstants::STATE_PLAYER_TURN,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} must play a token (or pass)'),
            descriptionMyTurn: clienttranslate('${you} must play a token (or pass)'),
            transitions: ['pass' => StateConstants::STATE_NEXT_PLAYER],
            updateGameProgression: true,
        );
    }

    public function getArgs(): array
    {
        return ['playableTokens' => []];
    }

    // The active and current player identifiers are filled by the framework,
    // and the handler redirects by returning a class name.
    #[PossibleAction]
    public function actPlayToken(int $tokenId, int $activePlayerId, array $args): string
    {
        return NextPlayer::class;
    }

    #[PossibleAction]
    public function actPass(int $currentPlayerId): string
    {
        return 'pass';
    }

    public function zombie(int $playerId): string
    {
        return 'pass';
    }
}
