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
  ).toBe(true);
});
