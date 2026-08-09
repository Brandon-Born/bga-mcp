<?php

declare(strict_types=1);

namespace Bga\Games\BgaMcpStateClassFixture;

class StateConstants
{
    const STATE_PLAYER_SETUP = 10;
    const STATE_CHOOSE_TOKEN = 11;
    const STATE_PLAYER_TURN = 20;
    const STATE_NEXT_PLAYER = 30;

    // The framework's own end state. No state class may declare it.
    const STATE_END_GAME = 99;
}
