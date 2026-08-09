import { parseClientActionCalls, parseServerActionEntries } from '../../src/project/actions.js';
import { parseQueries, parseSchema } from '../../src/project/database.js';
import {
  parseNotificationHandlers,
  parseSentNotifications,
} from '../../src/project/notifications.js';
import { parseLegacyStates, parseModernMetadata } from '../../src/project/parse.js';
import { ACTION_CONTRACT_RULES } from '../../src/rules/action-contracts.js';
import { DATABASE_RULES } from '../../src/rules/database.js';
import { NOTIFICATION_RULES } from '../../src/rules/notifications.js';
import { STATE_MACHINE_RULES } from '../../src/rules/state-machine.js';
import {
  certainFinding,
  heuristicFinding,
  summarizeFindings,
  unsupportedSyntaxFinding,
  type RuleDefinition,
} from '../../src/rules/uncertainty.js';

const RULE: RuleDefinition = {
  code: 'test.rule',
  severity: 'warning',
  certainty: 'likely',
  summary: 'A rule used to check the shared builders.',
  falsePositives: ['It can be wrong when the source is generated.'],
};

describe('shared uncertainty handling', () => {
  it('reports a proven claim as a fact', () => {
    const finding = certainFinding(
      { ...RULE, certainty: 'certain' },
      {
        code: 'test.rule',
        message: 'it happened',
        evidence: 'proven from the source',
        uri: 'states.inc.php',
        suggestion: 'fix it',
      },
    );
    expect(finding).toMatchObject({ kind: 'issue', certainty: 'certain' });
    expect(finding.evidence.every((entry) => entry.kind !== 'heuristic')).toBe(true);
  });

  it('carries a rule’s limitations with every heuristic it produces', () => {
    const finding = heuristicFinding(RULE, {
      code: 'test.rule',
      message: 'it might have happened',
      evidence: 'not visible to a textual reader',
      uri: 'game.php',
      suggestion: 'check it by hand',
    });
    expect(finding).toMatchObject({ kind: 'heuristic', certainty: 'likely' });
    expect(finding.evidence.some((entry) => entry.kind === 'heuristic')).toBe(true);
    expect(finding.evidence.some((entry) => entry.message.includes('generated'))).toBe(true);
  });

  it('reports an uninterpretable construct with its location and reason', () => {
    const finding = unsupportedSyntaxFinding({
      code: 'test.unsupported-syntax',
      construct: 'a computed name',
      language: 'php',
      uri: 'game.php',
    });
    expect(finding).toMatchObject({ kind: 'unsupported-syntax', certainty: 'certain' });
    expect(finding.locations[0]?.uri).toBe('game.php');
    expect(finding.evidence[0]?.message).toContain('a computed name');
    if (finding.kind === 'unsupported-syntax') {
      expect(finding.syntax).toEqual({ language: 'php', construct: 'a computed name' });
    }
  });

  it('never reports a result made only of unsupported syntax as passed', () => {
    const unsupported = unsupportedSyntaxFinding({
      code: 'test.unsupported-syntax',
      construct: 'a computed name',
      language: 'php',
      uri: 'game.php',
    });
    expect(summarizeFindings([unsupported]).status).toBe('unsupported');
    expect(summarizeFindings([]).status).toBe('passed');
  });

  it('every rule that is not certain records how it can be wrong', () => {
    const everyRule = [
      ...STATE_MACHINE_RULES,
      ...ACTION_CONTRACT_RULES,
      ...NOTIFICATION_RULES,
      ...DATABASE_RULES,
    ];
    expect(everyRule.length).toBeGreaterThan(30);
    for (const rule of everyRule) {
      if (rule.certainty !== 'certain') {
        expect(
          rule.falsePositives.length,
          `${rule.code} records no false positives`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it('every parser reports a construct it cannot read, rather than dropping it', () => {
    const outcomes = {
      'legacy states': parseLegacyStates('<?php\n$machinestates = $imported;'),
      'modern metadata': parseModernMetadata('not json at all'),
      'client actions': parseClientActionCalls(`this.bgaPerformAction(name, {});`),
      'server entries': parseServerActionEntries(
        `<?php class a { function actPlay() { self::getArg($n, 1, true); } }`,
      ),
      'sent notifications': parseSentNotifications(`<?php $this->notifyAllPlayers($name, '', []);`),
      'notification handlers': parseNotificationHandlers(
        `dojo.subscribe(computed, this, 'notif_x');`,
      ),
      queries: parseQueries(`<?php self::DbQuery("SELECT * FROM card WHERE " . $filter);`),
    };

    for (const [name, outcome] of Object.entries(outcomes)) {
      expect(outcome.unsupported.length, `${name} reported nothing unsupported`).toBeGreaterThan(0);
      for (const entry of outcome.unsupported) {
        // The state readers say what an unreadable construct leaves
        // incomplete; the others report the construct alone.
        const construct = typeof entry === 'string' ? entry : entry.construct;
        expect(construct.length, `${name} reported an empty reason`).toBeGreaterThan(5);
      }
    }

    // A schema with no readable CREATE TABLE reports nothing rather than inventing tables.
    expect(parseSchema('-- framework tables only').value).toEqual([]);
  });
});
