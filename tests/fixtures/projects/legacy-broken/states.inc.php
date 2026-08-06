<?php

// Deliberately defective fixture. Every defect below is asserted by a test.
$machinestates = [
    1 => ['name' => 'gameSetup', 'type' => 'manager', 'action' => 'stGameSetup', 'transitions' => ['' => 2]],
    2 => ['name' => 'playerTurn', 'type' => 'activeplayer', 'args' => 'argPlayerTurn', 'possibleactions' => ['actPass'], 'transitions' => ['pass' => 42]],
    3 => ['name' => 'playerTurn', 'type' => 'mystery', 'action' => 'stOrphan', 'transitions' => []],
    99 => ['name' => 'gameEnd', 'type' => 'manager', 'action' => 'stGameEnd'],
];
