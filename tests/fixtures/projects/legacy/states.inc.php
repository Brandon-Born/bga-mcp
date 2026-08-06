<?php

$machinestates = [
    1 => ['name' => 'gameSetup', 'type' => 'manager', 'action' => 'stGameSetup', 'transitions' => ['' => 2]],
    2 => ['name' => 'playerTurn', 'type' => 'activeplayer', 'possibleactions' => ['actPass'], 'transitions' => ['pass' => 99]],
    99 => ['name' => 'gameEnd', 'type' => 'manager', 'action' => 'stGameEnd'],
];
