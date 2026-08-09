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

        return 'pass';
    }

    #[IntParam(min: 1, max: 5)]
    public function actPlay(int $cardId): string
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
