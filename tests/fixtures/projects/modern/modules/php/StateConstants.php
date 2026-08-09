<?php

declare(strict_types=1);

namespace Bga\Games\BgaMcpModernFixture;

// The state-class documentation shows this exact shape under "Using Named
// Constants for States": a plain class of integer constants shared between the
// state classes and Game.php.
class StateConstants
{
    const STATE_PLAYER_TURN = 2;
    const STATE_NEXT_PLAYER = 20;

    // Reserved by the framework; declared here only so the game logic can
    // redirect to it. No state class may take this identifier.
    const STATE_END_GAME = 99;
}
