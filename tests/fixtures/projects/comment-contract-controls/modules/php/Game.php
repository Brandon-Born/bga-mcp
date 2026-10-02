<?php
namespace Bga\Games\OriginalCommentControls;
class Game extends \Bga\GameFramework\Table
{
    public function changeMarker(): void
    {
        // 🦕 $this->notifyAllPlayers('lineExample', '', []);
        /* $this->bga->notify->all('blockExample', '', ['fake' => 1]); */
        $example = "$this->notifyAllPlayers('stringExample', '', [])";
        $this->bga->notify->all(
            /* , ) */ 'markerChanged', '', [
                'marker' => 1,
                /* 'commentOnly' => 3, */
                'note' => "'stringOnly' => 9 ...",
            ]
        );
        $this->notifyAllPlayers('legacyChanged', '', array('value' => 2));
    }
    /* public function blockOnlyMethod(): void {} */
    // public function lineOnlyMethod(): void {}
    # public function hashOnlyMethod(): void {}
    public function realHelper(): void {}
}
