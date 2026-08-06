<?php

require_once APP_GAMEMODULE_PATH . 'module/table/table.game.php';

class BgaMcpLegacy extends Table
{
    function stGameSetup()
    {
    }

    function stGameEnd()
    {
    }

    function actPass($comment)
    {
        $this->notifyAllPlayers('playerPassed', clienttranslate('${player_name} passes'), [
            'player_id' => 1,
            'player_name' => 'fixture',
            'comment' => $comment,
        ]);
    }
}
