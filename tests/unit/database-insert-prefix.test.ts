import { parseQueries } from '../../src/project/database.js';
import { auditDatabaseUsage } from '../../src/rules/database.js';

const PREFIX = 'INSERT INTO `piece` (`piece_id`, `piece_label`) VALUES ';

it.each([
  `'${PREFIX}' . implode(',', buildRows('private-tail-canary'))`,
  `"${PREFIX}".\\implode(',', $rows)`,
  `'${PREFIX}' . $rows`,
  `'${PREFIX}' . buildRows($choice ? nested([1, 2]) : otherRows())`,
])('[UNIT-DATABASE-INSERT-PREFIX] preserves only invariant names from %s', (expression) => {
  const result = parseQueries(`<?php self::DbQuery(${expression});`);
  expect(result.value).toEqual([
    {
      tables: ['piece'],
      columns: ['piece.piece_id', 'piece.piece_label'],
      interpolated: false,
      text: 'INSERT INTO `piece` (`piece_id`, `piece_label`) VALUES [unresolved]',
    },
  ]);
  expect(result.unsupported).toHaveLength(1);
  expect(result.unsupported[0]).toContain('unresolved VALUES and possible SQL suffix');
  expect(result.unsupported[0]).toContain('escaping were not analyzed');
  expect(JSON.stringify(result)).not.toMatch(/private-tail-canary|buildRows|nested/);
});

it('follows one local assignment without treating the incomplete query as fully read', () => {
  const result = auditDatabaseUsage(
    { path: 'dbmodel.sql', text: 'CREATE TABLE piece (piece_id INT);' },
    [
      {
        path: 'modules/php/Game.php',
        text: `<?php $sql = '${PREFIX}' . $rows; self::DbQuery($sql);`,
      },
    ],
  );
  expect(result.queries[0]?.columns).toEqual(['piece.piece_id', 'piece.piece_label']);
  expect(result.diagnostics.findings.map((finding) => finding.code)).toEqual(
    expect.arrayContaining(['database.unsupported-syntax', 'database.column.undeclared']),
  );
  expect(result.diagnostics.findings.map((finding) => finding.code)).not.toContain(
    'database.column.unused',
  );
  expect(result.diagnostics.findings.map((finding) => finding.code)).not.toContain(
    'database.audit.unavailable',
  );
  expect(result.diagnostics.status).not.toBe('passed');
});

it.each([
  `'${PREFIX}' . $rows ? 'DELETE FROM piece' : 'UPDATE piece SET piece_id=1'`,
  `'${PREFIX}' . $rows ?? 'DELETE FROM piece'`,
  `'${PREFIX}' . $rows or otherQuery()`,
  `'${PREFIX}' . $rows + 1`,
  `'${PREFIX}' . $rows == 'other'`,
  `'${PREFIX}' . $rows . ' ON DUPLICATE KEY UPDATE piece_id=1'`,
  `'${PREFIX}' . implode(',', $rows) . $suffix`,
  `'${PREFIX}' . ($rows)`,
  `'${PREFIX}' . $object->rows()`,
  `'${PREFIX}' . $rows[0]`,
  `'${PREFIX}' . ...$rows`,
  `'${PREFIX}' .`,
  `'${PREFIX}' . buildRows([1, 2))`,
  `'${PREFIX}' . buildRows(1])`,
  `"INSERT INTO $table (piece_id) VALUES " . $rows`,
  `'INSERT INTO ' . $table . ' (piece_id) VALUES ' . $rows`,
  `'INSERT INTO piece (' . $columns . ') VALUES ' . $rows`,
  `'INSERT INTO piece VALUES ' . $rows`,
  `'INSERT IGNORE INTO piece (piece_id) VALUES ' . $rows`,
  `'INSERT INTO piece (piece_id) VALUE ' . $rows`,
  `'INSERT INTO piece (piece_id) VALUES' . $rows`,
  `'INSERT INTO piece (piece_id) VALUES (1)' . $rows`,
  `'INSERT INTO piece (piece_id) SELECT ' . $rows`,
  `'INSERT INTO piece SET piece_id=' . $rows`,
  `'INSERT INTO db.piece (piece_id) VALUES ' . $rows`,
  `'INSERT INTO piece (piece_id,) VALUES ' . $rows`,
  `'INSERT INTO "piece" (piece_id) VALUES ' . $rows`,
  String.raw`"INSERT INTO piece (piece_id) VALUES \n" . $rows`,
])('refuses ambiguous or unsupported concatenation: %s', (expression) => {
  const result = parseQueries(`<?php self::DbQuery(${expression});`);
  expect(result.value).toEqual([]);
  // An incomplete enclosing call may itself be unreadable; it still yields no facts.
});

it('ignores examples and superseded/appending assignments', () => {
  expect(parseQueries(`<?php $example = '${PREFIX}' . $rows;`).value).toEqual([]);
  for (const change of ['$sql = otherQuery();', "$sql .= ' suffix';"]) {
    const result = parseQueries(`<?php $sql = '${PREFIX}' . $rows; ${change} self::DbQuery($sql);`);
    expect(result.value).toEqual([]);
    expect(result.unsupported).toHaveLength(1);
  }
});
