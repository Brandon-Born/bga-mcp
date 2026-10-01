<?php

declare(strict_types=1);

namespace Bga\Games\BgaMcpModernFixture;

use Bga\GameFramework\Actions\Types\IntParam;
use Bga\Games\BgaMcpModernFixture\States\PlayerTurn;

final class Game extends \Bga\GameFramework\Table
{
    // The documented way a state-class project names its first state: there is
    // no state 1 to declare, so setupNewGame returns the class instead.
    protected function setupNewGame($players, $options = [])
    {
        return PlayerTurn::class;
    }

    public function isGameOver(): bool
    {
        return false;
    }

    public function actPass(int $cardId): string
    {
        $this->bga->notify->all('playerPassed', clienttranslate('${player_name} passes'), [
            'player_id' => 1,
            'cardId' => $cardId,
        ]);

        return 'pass';
    }

    #[IntParam(min: 1, max: 5)]
    public function actPlay(int $cardId): string
    {
        $this->DbQuery("UPDATE card SET card_location = 'table' WHERE card_id = 1");

        return 'play';
    }

    public function getAllDatas(): array
    {
        return $this->getObjectListFromDB(
            'SELECT card_id, card_location, card_owner FROM card'
        );
    }
}
