const mode = process.argv[2];

if (mode === 'invalid-json') {
  process.stdout.write('this is not json\n');
} else if (mode === 'hang') {
  process.stdin.resume();
} else {
  process.stderr.write('unknown fixture mode\n');
  process.exitCode = 2;
}
