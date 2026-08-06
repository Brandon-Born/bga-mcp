<?php

class action_bgamcplegacy extends APP_GameAction
{
    public function actPass()
    {
        self::setAjaxMode();
        $comment = self::getArg('comment', AT_alphanum, false);
        $this->game->actPass($comment);
        self::ajaxResponse();
    }
}
