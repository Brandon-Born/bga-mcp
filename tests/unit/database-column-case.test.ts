import { auditDatabaseUsage } from '../../src/rules/database.js';

function audit(schema: string, php: string) {
  return auditDatabaseUsage({ path: 'dbmodel.sql', text: schema }, [
    { path: 'Game.php', text: php },
  ]);
}

it('[UNIT-DATABASE-COLUMN-CASE] compares column references without changing their recorded spelling', () => {
  const result = audit(
    'CREATE TABLE card (Card_ID INT, Label VARCHAR(20), spare INT);',
    '<?php self::DbQuery("SELECT CARD_id, lAbEl FROM card");',
  );
  expect(result.tables[0]?.columns).toEqual(['Card_ID', 'Label', 'spare']);
  expect(result.queries[0]?.columns).toEqual(['card.CARD_id', 'card.lAbEl']);
  expect(result.diagnostics.findings.map((finding) => finding.code)).toEqual([
    'database.column.unused',
  ]);
  expect(result.diagnostics.findings[0]?.message).toContain('card.spare');
});

it('[UNIT-DATABASE-TABLE-CASE] refuses a runtime-dependent custom or framework table spelling', () => {
  for (const [schema, query, table] of [
    ['CREATE TABLE Card (ID INT);', 'SELECT id FROM card', 'card'],
    ['CREATE TABLE card (ID INT);', 'SELECT id FROM CARD', 'CARD'],
    ['-- framework tables', 'SELECT player_id FROM Player', 'Player'],
  ] as const) {
    const result = audit(schema, `<?php self::DbQuery("${query}");`);
    expect(result.queries[0]?.tables).toEqual([table]);
    expect(result.diagnostics.findings.map((finding) => finding.code)).toEqual([
      'database.unsupported-syntax',
    ]);
    expect(result.diagnostics.findings[0]?.suggestions[0]?.message).toContain('spelling');
  }
});

it('[UNIT-DATABASE-TABLE-CASE] keeps case-only schema collisions unknown without merging definitions', () => {
  for (const second of ['CREATE TABLE', 'CREATE TABLE IF NOT EXISTS']) {
    const result = audit(
      `CREATE TABLE Card (ID INT); ${second} card (extra INT);`,
      '<?php self::DbQuery("SELECT missing FROM card");',
    );
    expect(result.tables).toEqual([
      { name: 'Card', columns: ['ID'] },
      { name: 'card', columns: ['extra'] },
    ]);
    expect(result.diagnostics.findings.map((finding) => finding.code)).toEqual([
      'database.unsupported-syntax',
    ]);
  }
  const frameworkCollision = audit(
    'CREATE TABLE Player (custom_id INT);',
    '<?php self::DbQuery("SELECT player_id FROM player");',
  );
  expect(frameworkCollision.tables).toEqual([{ name: 'Player', columns: ['custom_id'] }]);
  expect(frameworkCollision.diagnostics.findings.map((finding) => finding.code)).toEqual([
    'database.unsupported-syntax',
  ]);
});

it('[UNIT-DATABASE-TABLE-CASE] retains genuine missing tables and independent duplicate defects', () => {
  const missing = audit(
    'CREATE TABLE Card (ID INT);',
    '<?php self::DbQuery("SELECT id FROM absent");',
  );
  expect(
    missing.diagnostics.findings.some((finding) => finding.code === 'database.table.undeclared'),
  ).toBe(true);
  const collision = audit(
    'CREATE TABLE Card (ID INT, id INT); CREATE TABLE card (extra INT);',
    '<?php self::DbQuery("SELECT extra FROM card");',
  );
  expect(
    collision.diagnostics.findings.find((finding) => finding.code === 'database.column.duplicate')
      ?.certainty,
  ).toBe('certain');
  expect(collision.diagnostics.summary.unsupported).toBeGreaterThan(0);
  const exactDuplicate = audit(
    'CREATE TABLE Card (ID INT); CREATE TABLE Card (ID INT);',
    '<?php self::DbQuery("SELECT id FROM Card");',
  );
  expect(
    exactDuplicate.diagnostics.findings.some(
      (finding) => finding.code === 'database.table.duplicate',
    ),
  ).toBe(true);
});

it('[UNIT-DATABASE-TABLE-CASE] preserves exact table comparisons, column folding and partial VALUES', () => {
  expect(
    audit('CREATE TABLE Card (ID INT);', '<?php self::DbQuery("SELECT id FROM Card");').diagnostics
      .findings,
  ).toEqual([]);
  const partial = audit(
    'CREATE TABLE Card (ID INT);',
    '<?php self::DbQuery(sprintf("INSERT INTO card (ID) VALUES %s", rows()));',
  );
  expect(
    partial.diagnostics.findings.filter(
      (finding) => finding.code !== 'database.unsupported-syntax',
    ),
  ).toEqual([]);
  expect(partial.diagnostics.summary.unsupported).toBeGreaterThan(0);
});

it('[UNIT-DATABASE-COLUMN-CASE] detects case-only duplicate columns beside unknown query tails and partial schema', () => {
  const result = audit(
    'CREATE TABLE card (Card_ID INT, CARD_id INT); ALTER TABLE card ADD extra INT;',
    '<?php self::DbQuery(sprintf("INSERT INTO card (card_id) VALUES %s", makeRows()));',
  );
  const duplicate = result.diagnostics.findings.find(
    (finding) => finding.code === 'database.column.duplicate',
  );
  expect(duplicate?.certainty).toBe('certain');
  expect(duplicate?.message).toContain("'CARD_id'");
  expect(result.diagnostics.summary.unsupported).toBeGreaterThan(0);
  expect(
    result.diagnostics.findings.some((finding) => finding.code === 'database.column.unused'),
  ).toBe(false);
});

it('[UNIT-DATABASE-COLUMN-CASE] keeps unknown VALUES held while recognizing invariant column targets', () => {
  for (const query of [
    'sprintf("INSERT INTO card (CARD_id) VALUES %s", makeRows())',
    '"INSERT INTO card (CARD_id) VALUES " . $rows',
  ]) {
    const result = audit('CREATE TABLE card (Card_ID INT);', `<?php self::DbQuery(${query});`);
    expect(result.diagnostics.findings.map((finding) => finding.code)).toEqual([
      'database.unsupported-syntax',
    ]);
    expect(result.queries[0]?.columns).toEqual(['card.CARD_id']);
  }
});

it('[UNIT-DATABASE-COLUMN-CASE] isolates columns by exact table name and retains genuinely absent columns', () => {
  const result = audit(
    'CREATE TABLE card (ID INT); CREATE TABLE token (id INT);',
    '<?php self::DbQuery("SELECT id FROM card"); self::DbQuery("SELECT ID, missing FROM token");',
  );
  expect(result.diagnostics.findings.map((finding) => finding.code)).toEqual([
    'database.column.undeclared',
  ]);
  expect(result.diagnostics.findings[0]?.message).toContain("'missing'");
  const differentTable = audit(
    'CREATE TABLE Card (ID INT);',
    '<?php self::DbQuery("SELECT id FROM card");',
  );
  expect(
    differentTable.diagnostics.findings.some(
      (finding) => finding.code === 'database.table.undeclared',
    ),
  ).toBe(false);
  expect(differentTable.queries[0]?.tables).toEqual(['card']);
  expect(differentTable.tables[0]?.name).toBe('Card');
  expect(differentTable.diagnostics.findings.map((finding) => finding.code)).toEqual([
    'database.unsupported-syntax',
  ]);
});
