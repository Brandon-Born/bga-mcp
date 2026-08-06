<?php

class action_brokengame extends APP_GameAction
{
    public function actPass()
    {
        self::setAjaxMode();
        // Reads an argument the client never sends.
        $comment = self::getArg('comment', AT_alphanum, false);
        $this->game->actPass($comment);
        self::ajaxResponse();
    }
}
