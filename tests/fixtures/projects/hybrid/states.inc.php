<?php

// The migration guide describes moving states to classes one at a time, keeping
// the ones that are not migrated yet here, and replacing the array form with
// GameStateBuilder in the meantime. State 2 has already moved to
// modules/php/States/PlayerTurn.php, so this file's transition target lives in
// a class and the class's target lives here.
//
// States 1 and 99 are no longer declared: "States 1 and 99, that must not be
// changed, are now optional", and with no state 1 the framework starts at 2.

use Bga\GameFramework\GameStateBuilder;
use Bga\GameFramework\StateType;

if (!defined('STATE_END_GAME')) {
    define('STATE_PLAYER_TURN', 2);
    define('STATE_GAME_TURN', 3);
    define('STATE_END_GAME', 99);
}

$machinestates = [
    STATE_GAME_TURN => GameStateBuilder::create()
        ->name('gameTurn')
        ->description('')
        ->type(StateType::GAME)
        ->action('stGameTurn')
        ->updateGameProgression(true)
        ->transitions([
            'next' => STATE_PLAYER_TURN,
            'endGame' => STATE_END_GAME,
        ])
        ->build(),
];
