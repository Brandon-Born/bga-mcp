<?php

require_once APP_GAMEMODULE_PATH . 'module/table/table.game.php';

class BgaMcpBroken extends Table
{
    function stGameSetup()
    {
    }

    function stGameEnd()
    {
        // Sent with a payload key no handler reads, and missing one it does read.
        $this->notifyAllPlayers('playerPassed', clienttranslate('done'), [
            'player_id' => 1,
            'score' => 0,
        ]);

        // Nothing on the client handles this one.
        $this->notifyAllPlayers('ghostEvent', clienttranslate('unseen'), []);
    }
}
