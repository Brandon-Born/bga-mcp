import { parseSchema } from '../../src/project/database.js';
import { auditDatabaseUsage } from '../../src/rules/database.js';

const SCHEMA =
  'CREATE TABLE card (card_id INT, card_spare INT) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 AUTO_INCREMENT=1;';
const source = (text: string) => ({ path: 'dbmodel.sql', text });
const queries = [
  { path: 'modules/php/Game.php', text: '<?php self::DbQuery("SELECT card_id FROM card");' },
];
const absence = [
  'database.table.undeclared',
  'database.column.undeclared',
  'database.column.unused',
];

it('[UNIT-DATABASE-SCHEMA-COVERAGE] preserves complete documented declarations and meaningful missing-reference controls', () => {
  expect(parseSchema(SCHEMA)).toEqual({
    value: [{ name: 'card', columns: ['card_id', 'card_spare'] }],
    unsupported: [],
  });
  const audit = auditDatabaseUsage(source(SCHEMA), [
    {
      path: 'Game.php',
      text: '<?php self::DbQuery("SELECT missing FROM card"); self::DbQuery("SELECT * FROM absent");',
    },
  ]);
  expect(audit.diagnostics.findings.map((f) => f.code)).toEqual(
    expect.arrayContaining(['database.table.undeclared', 'database.column.undeclared']),
  );
  expect(
    auditDatabaseUsage(source(SCHEMA), queries).diagnostics.findings.map((f) => f.code),
  ).toContain('database.column.unused');
});

it.each([
  'ALTER TABLE card ADD card_extra INT;',
  'CREATE VIEW alternate AS SELECT card_id FROM card;',
  'CREATE TABLE unread LIKE card;',
  'CREATE TABLE `bad-name` (id INT);',
  'CREATE TABLE unclosed (id INT;',
  'CREATE TABLE malformed (id INT, 123 INT);',
  'CREATE TABLE missing_type (id);',
  'CREATE TABLE constrained (PRIMARY KEY (id));',
  'CREATE TABLE extra (id INT) AS SELECT card_id FROM card;',
  'CREATE TABLE extra (id INT) PARTITION BY HASH(id);',
  'SET SQL_MODE="ANSI_QUOTES";',
  '--not-an-ordinary-comment',
])(
  '[UNIT-DATABASE-SCHEMA-COVERAGE] keeps mixed unexamined schema syntax unsupported: %s',
  (extra) => {
    const outcome = parseSchema(SCHEMA + '\n' + extra);
    expect(outcome.value[0]).toEqual({ name: 'card', columns: ['card_id', 'card_spare'] });
    expect(outcome.unsupported.length).toBeGreaterThan(0);
    const audit = auditDatabaseUsage(source(SCHEMA + '\n' + extra), [
      ...queries,
      {
        path: 'Other.php',
        text: '<?php self::DbQuery("SELECT card_extra FROM card"); self::DbQuery("SELECT * FROM alternate");',
      },
    ]);
    expect(audit.diagnostics.findings.some((f) => absence.includes(f.code))).toBe(false);
    expect(audit.diagnostics.summary.unsupported).toBeGreaterThan(0);
  },
);

it('[UNIT-DATABASE-SCHEMA-COVERAGE] retains duplicates and independent query warnings beside incomplete schema coverage', () => {
  const audit = auditDatabaseUsage(
    source(
      'CREATE TABLE card (card_id INT, card_id INT); CREATE TABLE card (card_id INT); ALTER TABLE card ADD card_extra INT;',
    ),
    [
      {
        path: 'Game.php',
        text: '<?php self::DbQuery("SELECT card_id FROM card WHERE card_id=$id");',
      },
    ],
  );
  expect(audit.diagnostics.findings.map((f) => f.code)).toEqual(
    expect.arrayContaining([
      'database.table.duplicate',
      'database.column.duplicate',
      'database.query.interpolated',
      'database.unsupported-syntax',
    ]),
  );
  expect(audit.diagnostics.findings.some((f) => absence.includes(f.code))).toBe(false);
});

it('[UNIT-DATABASE-SCHEMA-COVERAGE] does not manufacture declarations, columns or comments from quoted values', () => {
  const outcome = parseSchema(`CREATE TABLE card (
    card_id INT,
    label VARCHAR(100) DEFAULT 'CREATE TABLE phantom (fake INT); -- text',
    choice ENUM('one, two)', 'three''s') DEFAULT 'one, two)',
    "primary" INT, \`key\` INT, PRIMARY KEY (card_id)
  );`);
  expect(outcome).toEqual({
    value: [{ name: 'card', columns: ['card_id', 'label', 'choice', 'primary', 'key'] }],
    unsupported: [],
  });
});

it('[UNIT-DATABASE-SCHEMA-COVERAGE] keeps UTF-16 boundaries and all ordinary line-comment endings', () => {
  for (const ending of ['\n', '\r', '\r\n']) {
    expect(
      parseSchema(
        '-- 🌻 CREATE TABLE phantom (id INT);' +
          ending +
          '# CREATE TABLE another (id INT);' +
          ending +
          'CREATE TABLE "real" (id INT);',
      ),
    ).toEqual({ value: [{ name: 'real', columns: ['id'] }], unsupported: [] });
  }
  expect(parseSchema('--')).toEqual({ value: [], unsupported: [] });
  expect(parseSchema(' \n\r; ;')).toEqual({ value: [], unsupported: [] });
});

it.each([
  '/* CREATE TABLE phantom (id INT); */',
  '/*!80000 CREATE TABLE phantom (id INT); */',
  '/*+ CREATE TABLE phantom (id INT); */',
])(
  '[UNIT-DATABASE-SCHEMA-COVERAGE] preserves unexamined block semantics and unaffected following declarations: %s',
  (comment) => {
    const outcome = parseSchema(comment + '\n' + SCHEMA);
    expect(outcome.value).toEqual([{ name: 'card', columns: ['card_id', 'card_spare'] }]);
    expect(outcome.unsupported.length).toBeGreaterThan(0);
    expect(JSON.stringify(outcome)).not.toContain('phantom');
  },
);

it.each([
  'CREATE TABLE card (card_id INT, -- affected Studio column\n label INT);',
  'CREATE TABLE card (card_id INT); -- entire line uncertain',
  'CREATE TABLE card (card_id INT, # uncertain preprocessing\n label INT);',
  'CREATE TABLE card (card_id INT /* ordinary but unexamined */);',
  'CREATE TABLE card (card_id INT /*!80000, extra INT */);',
  'CREATE TABLE card (card_id INT /* unterminated',
  "CREATE TABLE card (label TEXT DEFAULT 'unterminated",
  String.raw`CREATE TABLE card (label TEXT DEFAULT 'private\'value'); CREATE TABLE phantom (id INT);`,
])(
  '[UNIT-DATABASE-SCHEMA-COVERAGE] excludes declarations affected by lexical or Studio uncertainty: %s',
  (sql) => {
    const outcome = parseSchema(sql);
    expect(outcome.value).toEqual([]);
    expect(outcome.unsupported.length).toBeGreaterThan(0);
    expect(JSON.stringify(outcome)).not.toContain('private');
  },
);

it('[UNIT-DATABASE-SCHEMA-COVERAGE] preserves declarations before ambiguous quoting without trusting subsequent context', () => {
  const outcome = parseSchema(
    SCHEMA +
      String.raw` CREATE TABLE ambiguous (x TEXT DEFAULT 'value\'text'); CREATE TABLE later (x INT);`,
  );
  expect(outcome.value).toEqual([{ name: 'card', columns: ['card_id', 'card_spare'] }]);
  expect(outcome.unsupported.length).toBeGreaterThan(0);
});

it('[UNIT-DATABASE-SCHEMA-COVERAGE] advances across many unknown regions and honors cancellation', () => {
  const text = '/* unexamined */; CREATE TABLE card (id INT);\n'.repeat(2000);
  expect(parseSchema(text).value).toHaveLength(2000);
  const controller = new AbortController();
  controller.abort();
  expect(() => parseSchema(text, controller.signal)).toThrow();
});
