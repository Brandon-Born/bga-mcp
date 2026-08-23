import { DATABASE_HELPERS, parseQueries, parseSchema } from '../../src/project/database.js';
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
        // The value is masked: what a query compares is its shape, and the
        // constant it compares against is data.
        text: "UPDATE card SET card_location = '?' WHERE card_id = 1",
      },
    ]);
  });

  it('publishes the shape of a query without the values in it', () => {
    const outcome = parseQueries(
      `<?php self::DbQuery("UPDATE player SET player_secret = 'hunter2-not-a-real-password' WHERE player_name = '$name'");`,
    );
    const query = outcome.value[0];
    expect(query?.text).not.toContain('hunter2-not-a-real-password');
    // Which variable reaches the query is the whole content of the
    // interpolation finding, so the variable survives the mask.
    expect(query?.text).toBe("UPDATE player SET player_secret = '?' WHERE player_name = '$name'");
    expect(query?.interpolated).toBe(true);
    expect(query?.columns).toEqual(['player.player_name', 'player.player_secret']);
  });

  it('masks a value inside an unreadable statement before quoting it', () => {
    const outcome = parseQueries(
      `<?php self::DbQuery("SHOW TABLES LIKE 'hunter2-not-a-real-password'");`,
    );
    expect(outcome.value).toEqual([]);
    expect(outcome.unsupported.join(' ')).not.toContain('hunter2-not-a-real-password');
    expect(outcome.unsupported.join(' ')).toContain("SHOW TABLES LIKE '?'");
  });

  it('never mistakes a SQL string value or a PHP variable for a column', () => {
    const outcome = parseQueries(
      `<?php self::DbQuery("UPDATE card SET card_location = 'discard' WHERE card_owner = $playerId");`,
    );
    expect(outcome.value[0]?.columns).toEqual(['card.card_location', 'card.card_owner']);
    expect(outcome.value[0]?.interpolated).toBe(true);
  });

  it('resolves qualified columns across a multi-table query', () => {
    const outcome = parseQueries(
      `<?php self::DbQuery("SELECT card.card_id, deck.deck_id FROM card JOIN deck ON card.card_id = deck.deck_id");`,
    );
    expect(outcome.value[0]?.tables).toEqual(['card', 'deck']);
    expect(outcome.value[0]?.columns).toEqual(['card.card_id', 'deck.deck_id']);
    expect(outcome.unsupported).toEqual([]);
  });

  it('resolves documented output aliases and explicit or implicit table aliases', () => {
    const outcome = parseQueries(`<?php
      self::getCollectionFromDB("SELECT player_id id, player_name name FROM player");
      self::getCollectionFromDB("SELECT c.card_id AS id, c.card_location location FROM card c");
      self::getCollectionFromDB("SELECT c.card_id, d.deck_id FROM card AS c JOIN deck d ON c.card_id = d.deck_id");
    `);
    expect(outcome.unsupported).toEqual([]);
    expect(outcome.value.map((query) => query.tables)).toEqual([
      ['player'],
      ['card'],
      ['card', 'deck'],
    ]);
    expect(outcome.value.map((query) => query.columns)).toEqual([
      ['player.player_id', 'player.player_name'],
      ['card.card_id', 'card.card_location'],
      ['card.card_id', 'deck.deck_id'],
    ]);
  });

  it('resolves quoted aliases, repeated columns, and alias renaming to the same schema references', () => {
    const outcome = parseQueries(`<?php
      self::getCollectionFromDB("SELECT \`c\`.\`card_id\` AS \`id\`, c.card_id repeated FROM \`card\` AS \`c\`");
      self::getCollectionFromDB("SELECT renamed.card_id id FROM card renamed");
    `);
    expect(outcome.unsupported).toEqual([]);
    expect(outcome.value.map((query) => query.tables)).toEqual([['card'], ['card']]);
    expect(outcome.value.map((query) => query.columns)).toEqual([
      ['card.card_id'],
      ['card.card_id'],
    ]);
  });

  it('keeps unsupported expressions, subqueries, and CTEs out of schema references', () => {
    const expressions = parseQueries(
      `<?php self::getCollectionFromDB("SELECT c.card_id + 1 AS next_id FROM card c");`,
    );
    expect(expressions.value[0]?.columns).toEqual([]);
    expect(expressions.unsupported[0]).toContain('provenance is unclear');

    for (const query of [
      'SELECT card_id FROM (SELECT card_id FROM card) nested',
      'WITH chosen AS (SELECT card_id FROM card) SELECT card_id FROM chosen',
    ]) {
      const outcome = parseQueries(`<?php self::getCollectionFromDB("${query}");`);
      expect(outcome.value[0]).toMatchObject({ tables: [], columns: [] });
      expect(outcome.unsupported[0]).toContain('CTE or subquery');
    }
  });

  it('reports a query assembled from several expressions', () => {
    const outcome = parseQueries(`<?php self::DbQuery("SELECT * FROM card WHERE " . $filter);`);
    expect(outcome.value).toEqual([]);
    expect(outcome.unsupported[0]).toContain('cannot follow');
  });

  it('reads a string only where data flow puts it in a database method', () => {
    // Regression: adding this one line to a clean project made the installed
    // tool count a third query and report a certain undeclared table.
    const outcome = parseQueries(`<?php
class Game extends Table {
  // An example in a comment: SELECT imaginary_id FROM ghost
  public function explain(): void {
    $example = 'SELECT imaginary_id FROM ghost';
    throw new BgaUserException("SELECT is not allowed here: $example");
  }
}`);
    expect(outcome.value).toEqual([]);
    expect(outcome.unsupported).toEqual([]);
  });

  it('follows a query assigned before the call that runs it', () => {
    const outcome = parseQueries(`<?php
$sql = "SELECT player_id FROM player";
self::getCollectionFromDB($sql);`);
    expect(outcome.value.map((query) => query.tables)).toEqual([['player']]);
    expect(outcome.unsupported).toEqual([]);
  });

  it('reads every documented helper, and nothing else', () => {
    for (const helper of DATABASE_HELPERS) {
      const outcome = parseQueries(`<?php $this->${helper}('SELECT card_id FROM card');`);
      expect(
        outcome.value.map((query) => query.tables),
        helper,
      ).toEqual([['card']]);
    }
    // A method of the project's own is not a database call.
    expect(parseQueries(`<?php $this->runMyQuery('SELECT card_id FROM card');`).value).toEqual([]);
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

  it('does not derive undeclared or unused findings from SQL aliases', () => {
    const audit = auditDatabaseUsage(schemaSource, [
      {
        path: 'game.php',
        text: `<?php self::getCollectionFromDB(
          "SELECT c.card_id AS id, c.card_location location, c.card_owner owner FROM card AS c"
        );`,
      },
    ]);
    expect(audit.diagnostics.status).toBe('passed');
    expect(audit.queries[0]?.columns).toEqual([
      'card.card_id',
      'card.card_location',
      'card.card_owner',
    ]);

    const missing = auditDatabaseUsage(schemaSource, [
      {
        path: 'game.php',
        text: `<?php self::getCollectionFromDB("SELECT c.missing AS id FROM card c");`,
      },
    ]);
    expect(
      missing.diagnostics.findings.find((finding) => finding.code === 'database.column.undeclared')
        ?.message,
    ).toContain("'missing'");
  });

  it('does not claim columns are unused when an unsupported expression may reference them', () => {
    const audit = auditDatabaseUsage(schemaSource, [
      {
        path: 'game.php',
        text: `<?php self::getCollectionFromDB("SELECT card_id + card_owner AS total FROM card");`,
      },
    ]);
    expect(
      audit.diagnostics.findings.filter((finding) => finding.code === 'database.column.unused'),
    ).toEqual([]);
    expect(audit.diagnostics.findings).toContainEqual(
      expect.objectContaining({ kind: 'unsupported-syntax', code: 'database.unsupported-syntax' }),
    );
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
