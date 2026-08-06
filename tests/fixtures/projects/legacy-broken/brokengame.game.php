<?php

require_once APP_GAMEMODULE_PATH . 'module/table/table.game.php';

class BgaMcpBroken extends Table
{
    function stGameSetup()
    {
        // Names a table the schema does not declare.
        self::DbQuery("INSERT INTO deck (deck_id) VALUES (1)");

        // Names a column the card table does not declare.
        self::getObjectListFromDB("SELECT card_id, card_colour FROM card");

        // Interpolates a value into the query text instead of escaping it.
        $playerId = 1;
        self::DbQuery("UPDATE card SET card_location = 'hand' WHERE card_id = $playerId");
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
