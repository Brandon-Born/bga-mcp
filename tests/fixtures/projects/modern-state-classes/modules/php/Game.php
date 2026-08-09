<?php

declare(strict_types=1);

namespace Bga\Games\BgaMcpStateClassFixture;

use Bga\Games\BgaMcpStateClassFixture\States\PlayerSetup;

final class Game extends \Bga\GameFramework\Table
{
    // "To indicate your initial state, add return PlayerTurn::class; to the
    // code of setupNewGame function in Game.php". There is no state 1 here,
    // and its absence is not a defect.
    protected function setupNewGame($players, $options = [])
    {
        return PlayerSetup::class;
    }

    public function getAllDatas(): array
    {
        return $this->getObjectListFromDB('SELECT token_id, token_owner FROM token');
    }

    public function isRoundOver(): bool
    {
        return false;
    }
}
