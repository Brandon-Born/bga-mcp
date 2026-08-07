<?php

// The migration guide describes moving states to classes one at a time, keeping
// the ones that are not migrated yet here. State 2 has already moved to
// modules/php/States/PlayerTurn.php, so its transition target lives in the
// other file and this file's target lives in a class.
$machinestates = [
    1 => ['name' => 'gameSetup', 'type' => 'manager', 'action' => 'stGameSetup', 'transitions' => ['' => 2]],
    99 => ['name' => 'gameEnd', 'type' => 'manager', 'action' => 'stGameEnd'],
];
