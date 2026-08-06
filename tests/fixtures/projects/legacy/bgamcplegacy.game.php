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
        $cards = self::getObjectListFromDB(
            "SELECT card_id, card_location, card_owner FROM card WHERE card_location = 'hand'"
        );
        self::DbQuery("UPDATE card SET card_location = 'discard' WHERE card_owner IS NULL");

        $this->notifyAllPlayers('playerPassed', clienttranslate('${player_name} passes'), [
            'player_id' => 1,
            'player_name' => 'fixture',
            'comment' => $comment,
        ]);
    }
}
