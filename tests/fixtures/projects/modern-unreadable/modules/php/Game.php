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

    public function announce(string $type): void
    {
        // Readable, so the two sides have something to compare and the
        // unreadable ones below are the only thing left to report.
        $this->bga->notify->all('stateChanged', clienttranslate('the state changed'), [
            'detail' => 'moved',
        ]);
        $this->getObjectListFromDB('SELECT card_id FROM card');

        // Deliberately unreadable: the notification type is decided at run
        // time, so no handler can be matched to it.
        $this->bga->notify->all($type, clienttranslate('something happened'), []);

        // Deliberately outside what the reader recognizes as a statement. The
        // documentation warns against TRUNCATE in a game: the point here is
        // that the limit is stated rather than silently parsed.
        $this->DbQuery('TRUNCATE TABLE card');
    }
}
