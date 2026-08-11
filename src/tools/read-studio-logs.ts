import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

import { htmlToText } from '../docs/excerpt.js';
import { BgaMcpError, ERROR_CODES } from '../errors.js';
import type { PolicyBoundary } from '../policy.js';
import { publishFailure, publishResult } from '../publish.js';
import { parseStudioLog } from '../studio/logline.js';
import { publishStudioText, screenStudioLog, withheldAny } from '../studio/privacy.js';
import { SetupAsker } from '../setup/ask.js';

export const READ_STUDIO_LOGS_TOOL = 'read_studio_logs';

const MAX_LINES = 200;
const DEFAULT_LINES = 50;

/**
 * The Studio project identifier, as Studio itself defines it.
 *
 * Not a number. The 2026-08-08 review found this schema demanding digits and
 * refusing the real thing, and a live run on 2026-08-10 confirmed both halves:
 * `/studiogame?game=mcpverification` is the project, and `/studiogame?game=15414`
 * — that project's numeric Play ID — answers "The project doesn't exist or you
 * don't have access to it".
 *
 * The shape comes from Studio's own creation form rather than from a guess:
 * "your project name should be written in CamelCase, without numbers, spaces or
 * special characters (example: RaceForTheGalaxy). Max length of 32 characters."
 * Digits are accepted after the first character anyway, because that note says
 * *should* and an older project is not this server's to refuse; what is refused
 * is everything that could not be a project name at all — spaces, punctuation,
 * query delimiters, traversal — and a purely numeric value, which the live run
 * proved is a different identifier rather than this one.
 */
const STUDIO_PROJECT_NAME = /^[A-Za-z][A-Za-z0-9]{0,31}$/u;

export const ReadStudioLogsInputSchema = z.strictObject({
  gameId: z
    .string()
    .regex(
      STUDIO_PROJECT_NAME,
      'gameId must be the Studio project name shown in Manage Games, for example mcpverification — not the numeric Play ID from the game URL',
    )
    .describe(
      'Your Studio project identifier: the name in Manage Games, which is the `game` parameter of your /studiogame URL. Letters, then letters or digits, up to 32 characters. Not the numeric Play ID.',
    ),
  maxLines: z
    .number()
    .int()
    .min(1)
    .max(MAX_LINES)
    .optional()
    .describe(`How many of your own log lines to return. Defaults to ${String(DEFAULT_LINES)}.`),
  tableId: z
    .string()
    .regex(/^[0-9]+$/u, 'tableId must be numeric')
    .optional()
    .describe('Restrict to one table identifier.'),
});

export const ReadStudioLogsOutputSchema = z.strictObject({
  schemaVersion: z.literal(1),
  gameId: z.string(),
  url: z.string(),
  retrievedAt: z.string(),
  lines: z.array(
    z.strictObject({
      timestamp: z.string().nullable(),
      level: z.string().nullable(),
      tableId: z.string().nullable(),
      actor: z.string().nullable(),
      message: z.string(),
    }),
  ),
  withheld: z.strictObject({
    foreign: z.number().int().nonnegative(),
    unattributable: z.number().int().nonnegative(),
    sensitive: z.number().int().nonnegative(),
  }),
  ownAccounts: z.array(z.string()),
  stability: z.literal('experimental'),
  notice: z.string(),
});

export type ReadStudioLogsResult = z.infer<typeof ReadStudioLogsOutputSchema>;

const NOTICE =
  'Experimental. This reads an undocumented Studio page, so it can break without warning when BGA changes it. Only log lines about your own declared dev accounts are returned; everything else is withheld, not redacted.';

const DESCRIPTION = `Read your own BGA Studio request and SQL logs for one game.

Experimental and off by default. It scrapes the Studio game page, which BGA does
not document or version, so it can stop working at any time — treat a failure as
a page change rather than a bug in your game.

Only lines about the dev accounts you declared with --studio-dev-account are
returned. A line about anyone else is withheld entirely rather than redacted,
and so is a line whose owner cannot be determined. Production error logs and
Sentry are never read: those are about real players.

Requires --allow-network, --experimental-studio-logs, and a BGA_STUDIO_SESSION
environment variable holding your own session cookie. The session is never
accepted as a tool argument. If no dev accounts were configured, the server asks
your client for them the first time you use this; declining refuses the call and
is not asked again.`;

/** Renders the result as the short text an agent or a human reads first. */
export function summarizeStudioLogs(result: ReadStudioLogsResult): string {
  const withheld = Object.entries(result.withheld)
    .filter(([, count]) => count > 0)
    .map(([reason, count]) => `${String(count)} ${reason}`)
    .join(', ');
  const lines = [
    `${String(result.lines.length)} log line(s) for game ${result.gameId}, limited to ${result.ownAccounts.join(', ')}.`,
  ];
  if (withheld.length > 0) {
    // Saying what was withheld, without showing any of it.
    lines.push(`Withheld: ${withheld}.`);
  }
  lines.push(NOTICE);
  return lines.join('\n');
}

/**
 * Registers the experimental Studio log reader.
 *
 * This is the one capability built on a page BGA does not document, and it
 * exists because a developer reading their own logs is a reasonable thing to
 * want. The trade is stated rather than hidden: it is experimental, it is off
 * unless asked for, and its privacy rule is an allowlist that fails closed.
 */
export function registerReadStudioLogs(
  server: McpServer,
  policy: PolicyBoundary,
  asker: SetupAsker = new SetupAsker(),
): void {
  server.registerTool(
    READ_STUDIO_LOGS_TOOL,
    {
      title: 'Read your own Studio logs (experimental)',
      description: DESCRIPTION,
      inputSchema: ReadStudioLogsInputSchema,
      outputSchema: ReadStudioLogsOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ gameId, maxLines, tableId }) => {
      // Held outside the timed body so the text published afterwards passes
      // through the same screen the structured result did.
      let withheldValues: readonly string[] = [];
      try {
        const structuredContent = await policy.runWithTimeout(READ_STUDIO_LOGS_TOOL, async () => {
          // The gates first: being asked for dev accounts by a capability that
          // is switched off would be a question with no useful answer.
          await policy.assertStudioAvailable();

          let ownAccounts = policy.studioDevAccounts;
          if (ownAccounts.length === 0) {
            // Nothing could ever be returned without this, so it is worth
            // asking rather than refusing and hoping the developer reads why.
            const asked = await asker.askForList(
              server,
              'studio-dev-accounts',
              'Which BGA Studio dev accounts do you own? Only log lines about these accounts will be returned; everything else is withheld.',
              'accounts',
            );
            if (asked.kind === 'answered') {
              policy.rememberStudioAccounts(asked.values);
              ownAccounts = policy.studioDevAccounts;
            }
          }
          if (ownAccounts.length === 0) {
            throw new BgaMcpError(
              ERROR_CODES.policyStudioNotAllowed,
              'No Studio dev accounts are known, so no log line could be returned. Start the server with --studio-dev-account <name>, or answer the question when your client asks.',
            );
          }
          const page = await policy.fetchStudioPage({
            path: 'studiogame',
            params: { game: gameId },
          });

          const text = htmlToText(page.body);
          if (/The project doesn't exist or you don't have access to it/iu.test(text)) {
            // Studio answers 200 with this sentence for a project that is not
            // yours or not there, including for a numeric Play ID. Returning an
            // empty log would say the project is quiet; this says it is absent.
            throw new BgaMcpError(
              ERROR_CODES.policyStudioNotAllowed,
              'Studio says that project does not exist, or is not one this account may read. Check the name in Manage Games — it is the `game` parameter of the studiogame URL, not the numeric Play ID.',
            );
          }

          const parsed = parseStudioLog(text);
          const forTable =
            tableId === undefined ? parsed : parsed.filter((line) => line.tableId === tableId);
          const screened = screenStudioLog(forTable, ownAccounts, policy.redactionOptions);
          withheldValues = screened.withheldValues;
          const publish = (text: string): string =>
            publishStudioText(text, withheldValues, policy.redactionOptions);

          return {
            schemaVersion: 1 as const,
            gameId,
            url: page.url,
            retrievedAt: page.retrievedAt,
            lines: screened.kept.slice(-(maxLines ?? DEFAULT_LINES)).map((line) => ({
              timestamp: line.timestamp,
              level: line.level,
              tableId: line.tableId,
              actor: line.actorName,
              message: publish(line.message),
            })),
            withheld: screened.withheld,
            ownAccounts: [...ownAccounts],
            stability: 'experimental' as const,
            notice: withheldAny(screened)
              ? `${NOTICE} Some lines were withheld because they are not about your accounts.`
              : NOTICE,
          };
        });

        return publishResult(
          policy,
          READ_STUDIO_LOGS_TOOL,
          ReadStudioLogsOutputSchema,
          structuredContent,
          (published) =>
            publishStudioText(
              summarizeStudioLogs(published),
              withheldValues,
              policy.redactionOptions,
            ),
          // A Studio log line is a web server's request log: `/game/game/act.html`
          // is a URL, not a location on this machine, and treating it as one
          // would return a column of placeholders instead of the log. The
          // machine's own locations are still replaced, by value.
          { paths: 'known-locations' },
        );
      } catch (error) {
        return publishFailure(policy, error);
      }
    },
  );
}
