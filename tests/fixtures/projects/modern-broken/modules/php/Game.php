<?php

declare(strict_types=1);

namespace Bga\Games\BgaMcpModernFixture;

use Bga\GameFramework\Actions\Types\IntParam;
use Bga\Games\BgaMcpModernFixture\States\PlayerTurn;

final class Game extends \Bga\GameFramework\Table
{
    protected function setupNewGame($players, $options = [])
    {
        return PlayerTurn::class;
    }

    public function actPass(int $cardId): string
    {
        $this->bga->notify->all('playerPassed', clienttranslate('${player_name} passes'), [
            'player_id' => 1,
            'cardId' => $cardId,
        ]);

        // Nothing on the client handles this one.
        $this->bga->notify->all('ghostEvent', clienttranslate('unseen'), []);

        // The client declares notif_ignoredEvent, but its registration ignores
        // the name, so the method is a method and this send lands nowhere.
        $this->bga->notify->all('ignoredEvent', clienttranslate('also unseen'), []);

        return 'pass';
    }

    // Deliberately defective on the client side: the attribute accepts 1 to 5
    // and the client sends 9, which the framework rejects before this runs.
    public function actPlay(#[IntParam(min: 1, max: 5)] int $cardId): string
    {
        // Names a table the schema does not declare.
        $this->DbQuery("INSERT INTO deck (deck_id) VALUES (1)");

        return 'play';
    }

    public function getAllDatas(): array
    {
        return $this->getObjectListFromDB(
            'SELECT card_id, card_location, card_owner FROM card'
        );
    }
}
