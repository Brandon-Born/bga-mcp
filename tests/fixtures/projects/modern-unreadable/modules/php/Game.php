<?php

declare(strict_types=1);

namespace Bga\Games\BgaMcpUnreadableFixture;

use Bga\Games\BgaMcpUnreadableFixture\States\PlayerTurn;

final class Game extends \Bga\GameFramework\Table
{
    protected function setupNewGame($players, $options = [])
    {
        return PlayerTurn::class;
    }

    public function stateIdFor(string $class): int
    {
        return 40;
    }

    public function chooseNextState(int $playerId): string
    {
        return 'pass';
    }
}
