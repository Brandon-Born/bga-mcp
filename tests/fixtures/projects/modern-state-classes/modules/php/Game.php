<?php

declare(strict_types=1);

namespace Bga\Games\BgaMcpStateClassFixture;

use Bga\GameFramework\Actions\CheckAction;
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

    // A framework-wide action: no state lists it, and the framework checks
    // Game.php for actions that can be triggered at any state.
    #[CheckAction(false)]
    public function actSetAutopass(bool $autopass): void
    {
    }

    public function isRoundOver(): bool
    {
        return false;
    }
}
