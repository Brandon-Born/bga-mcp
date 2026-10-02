<?php

namespace Bga\Games\OriginalCommentReproduction;

class Game extends \Bga\GameFramework\Table
{
    public function changeMarker(): void
    {
        $this->bga->notify->all('markerChanged', '', ['marker' => 1]);
    }

    /* Documentation example only; this class has no such method.
    public function exampleOnlyMethod(): void {}
    */
}
