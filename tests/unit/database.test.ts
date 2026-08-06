import { parseQueries, parseSchema } from '../../src/project/database.js';
import { DATABASE_RULES, FRAMEWORK_TABLES, auditDatabaseUsage } from '../../src/rules/database.js';

const SCHEMA = `-- fixture schema
CREATE TABLE IF NOT EXISTS \`card\` (
  \`card_id\` int(10) unsigned NOT NULL AUTO_INCREMENT,
  \`card_location\` varchar(16) NOT NULL,
  \`card_owner\` int(10) unsigned DEFAULT NULL,
  PRIMARY KEY (\`card_id\`),
  KEY \`by_owner\` (\`card_owner\`)
) ENGINE=InnoDB;`;

const QUERIES = `<?php
class Game extends Table
{
    function draw()
    {
        self::getObjectListFromDB("SELECT card_id, card_location FROM card WHERE card_owner IS NULL");
        self::DbQuery("UPDATE card SET card_location = 'hand' WHERE card_id = 1");
    }
}`;

const schemaSource = { path: 'dbmodel.sql', text: SCHEMA };
const phpSources = [{ path: 'game.php', text: QUERIES }];

describe('schema reading', () => {
  it('reads tables and columns, skipping constraints and comments', () => {
    const outcome = parseSchema(SCHEMA);
    expect(outcome.unsupported).toEqual([]);
    expect(outcome.value).toEqual([
      { name: 'card', columns: ['card_id', 'card_location', 'card_owner'] },
    ]);
  });

  it('reads several tables and the unquoted form', () => {
    const outcome = parseSchema(
      `CREATE TABLE deck (deck_id INT NOT NULL); CREATE TABLE token (token_id INT, token_x INT);`,
    );
    expect(outcome.value).toEqual([
      { name: 'deck', columns: ['deck_id'] },
      { name: 'token', columns: ['token_id', 'token_x'] },
    ]);
  });

  it('returns nothing for a schema that declares no table', () => {
    expect(parseSchema('-- framework tables only\n').value).toEqual([]);
  });
});

describe('query reading', () => {
  it('reads tables and attributes bare columns to a single-table query', () => {
    const outcome = parseQueries(QUERIES);
    expect(outcome.unsupported).toEqual([]);
    expect(outcome.value).toEqual([
      {
        tables: ['card'],
        columns: ['card.card_id', 'card.card_location', 'card.card_owner'],
        interpolated: false,
        text: 'SELECT card_id, card_location FROM card WHERE card_owner IS NULL',
      },
      {
        tables: ['card'],
        columns: ['card.card_id', 'card.card_location'],
        interpolated: false,
        text: "UPDATE card SET card_location = 'hand' WHERE card_id = 1",
      },
    ]);
  });

  it('never mistakes a SQL string value or a PHP variable for a column', () => {
    const outcome = parseQueries(
      `<?php self::DbQuery("UPDATE card SET card_location = 'discard' WHERE card_owner = $playerId");`,
    );
    expect(outcome.value[0]?.columns).toEqual(['card.card_location', 'card.card_owner']);
    expect(outcome.value[0]?.interpolated).toBe(true);
  });

  it('keeps qualified columns and refuses to attribute a multi-table query', () => {
    const outcome = parseQueries(
      `<?php self::DbQuery("SELECT card.card_id, deck.deck_id FROM card JOIN deck ON card.card_id = deck.deck_id");`,
    );
    expect(outcome.value[0]?.tables).toEqual(['card', 'deck']);
    expect(outcome.value[0]?.columns).toEqual(['card.card_id', 'deck.deck_id']);
    expect(outcome.unsupported[0]).toContain('multi-table query');
  });

  it('reports a query assembled from several expressions', () => {
    const outcome = parseQueries(`<?php self::DbQuery("SELECT * FROM card WHERE " . $filter);`);
    expect(outcome.unsupported[0]).toContain('concatenated');
  });
});

describe('database rules', () => {
  it('publishes unique codes, and every uncertain rule records its false positives', () => {
    const codes = DATABASE_RULES.map((rule) => rule.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const rule of DATABASE_RULES) {
      expect(rule.code).toMatch(/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u);
      if (rule.certainty !== 'certain') {
        expect(rule.falsePositives.length).toBeGreaterThan(0);
      }
    }
  });

  it('accepts a schema whose every column is used', () => {
    const audit = auditDatabaseUsage(schemaSource, phpSources);
    expect(audit.diagnostics.status).toBe('passed');
    expect(audit.tables).toHaveLength(1);
    expect(audit.queries).toHaveLength(2);
  });

  it('reports an undeclared table as a fact and an undeclared column as a heuristic', () => {
    const audit = auditDatabaseUsage(schemaSource, [
      {
        path: 'game.php',
        text: `<?php self::DbQuery("SELECT card_colour FROM card");
               self::DbQuery("SELECT deck_id FROM deck");`,
      },
    ]);
    const table = audit.diagnostics.findings.find(
      (finding) => finding.code === 'database.table.undeclared',
    );
    expect(table).toMatchObject({ kind: 'issue', severity: 'error', certainty: 'certain' });

    const column = audit.diagnostics.findings.find(
      (finding) => finding.code === 'database.column.undeclared',
    );
    expect(column).toMatchObject({ kind: 'heuristic', certainty: 'likely' });
    expect(column?.message).toContain('card_colour');
  });

  it('does not report framework-owned tables as undeclared', () => {
    const audit = auditDatabaseUsage(schemaSource, [
      { path: 'game.php', text: `<?php self::DbQuery("SELECT player_id FROM player");` },
    ]);
    expect(
      audit.diagnostics.findings.filter((finding) => finding.code === 'database.table.undeclared'),
    ).toEqual([]);
    expect(FRAMEWORK_TABLES.has('player')).toBe(true);
  });

  it('reports an interpolated query as a heuristic with its limitation', () => {
    const audit = auditDatabaseUsage(schemaSource, [
      {
        path: 'game.php',
        text: `<?php self::DbQuery("SELECT card_id, card_location, card_owner FROM card WHERE card_id = $id");`,
      },
    ]);
    const interpolated = audit.diagnostics.findings.find(
      (finding) => finding.code === 'database.query.interpolated',
    );
    expect(interpolated).toMatchObject({ kind: 'heuristic', certainty: 'likely' });
    expect(interpolated?.evidence.some((entry) => entry.kind === 'heuristic')).toBe(true);
  });

  it('reports an unused column, unless a query selects everything', () => {
    const unused = auditDatabaseUsage(schemaSource, [
      { path: 'game.php', text: `<?php self::DbQuery("SELECT card_id FROM card");` },
    ]);
    expect(
      unused.diagnostics.findings.filter((finding) => finding.code === 'database.column.unused'),
    ).toHaveLength(2);

    const wildcard = auditDatabaseUsage(schemaSource, [
      { path: 'game.php', text: `<?php self::DbQuery("SELECT * FROM card");` },
    ]);
    expect(
      wildcard.diagnostics.findings.filter((finding) => finding.code === 'database.column.unused'),
    ).toEqual([]);
  });

  it('reports duplicate declarations as facts', () => {
    const audit = auditDatabaseUsage(
      {
        path: 'dbmodel.sql',
        text: `CREATE TABLE card (card_id INT, card_id INT); CREATE TABLE card (card_id INT);`,
      },
      phpSources,
    );
    const codes = audit.diagnostics.findings.map((finding) => finding.code);
    expect(codes).toContain('database.table.duplicate');
    expect(codes).toContain('database.column.duplicate');
  });

  it('never returns a clean result when the audit could not run', () => {
    const noSchema = auditDatabaseUsage(null, phpSources);
    expect(noSchema.diagnostics.findings[0]).toMatchObject({
      code: 'database.audit.unavailable',
      certainty: 'certain',
    });
    expect(noSchema.diagnostics.findings[0]?.message).toContain('no readable dbmodel.sql');

    const noQueries = auditDatabaseUsage(schemaSource, [
      { path: 'game.php', text: '<?php class Game {}' },
    ]);
    expect(noQueries.diagnostics.findings[0]?.message).toContain('no readable query');
  });

  it('orders findings deterministically', () => {
    const first = auditDatabaseUsage(schemaSource, [
      { path: 'game.php', text: `<?php self::DbQuery("SELECT zzz FROM deck");` },
    ]);
    const second = auditDatabaseUsage(schemaSource, [
      { path: 'game.php', text: `<?php self::DbQuery("SELECT zzz FROM deck");` },
    ]);
    expect(JSON.stringify(first.diagnostics)).toBe(JSON.stringify(second.diagnostics));
    const codes = first.diagnostics.findings.map((finding) => finding.code);
    expect(codes).toEqual([...codes].sort());
  });
});
