<?php

declare(strict_types=1);

namespace Bga\Games\BgaMcpHybridFixture;

// The game logic has moved to modules/php with autowired actions, while the
// notification calls are still in the legacy form the framework continues to
// support, and the client is still the flat dojo file.
final class Game extends \Bga\GameFramework\Table
{
    public function stGameSetup(): void
    {
    }

    public function stGameEnd(): void
    {
    }

    public function actPass(string $comment): void
    {
        $this->getObjectListFromDB(
            "SELECT card_id, card_location, card_owner FROM card WHERE card_location = 'hand'"
        );
        $this->DbQuery("UPDATE card SET card_location = 'discard' WHERE card_owner IS NULL");

        $this->notifyAllPlayers('playerPassed', clienttranslate('${player_name} passes'), [
            'player_id' => 1,
            'player_name' => 'fixture',
            'comment' => $comment,
        ]);
    }
}
