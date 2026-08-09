import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

import { htmlToText } from '../docs/excerpt.js';
import { BgaMcpError, ERROR_CODES } from '../errors.js';
import type { PolicyBoundary } from '../policy.js';
import { parseStudioLog } from '../studio/logline.js';
import { publishStudioText, screenStudioLog, withheldAny } from '../studio/privacy.js';
import { SetupAsker } from '../setup/ask.js';
import { publishFailure } from './project-context.js';

export const READ_STUDIO_LOGS_TOOL = 'read_studio_logs';

const MAX_LINES = 200;
const DEFAULT_LINES = 50;

export const ReadStudioLogsInputSchema = z.strictObject({
  gameId: z
    .string()
    .regex(/^[0-9]+$/u, 'gameId must be the numeric Studio game identifier')
    .describe('Your Studio game identifier, as it appears in the studiogame URL.'),
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

          const parsed = parseStudioLog(htmlToText(page.body));
          const forTable =
            tableId === undefined ? parsed : parsed.filter((line) => line.tableId === tableId);
          const screened = screenStudioLog(forTable, ownAccounts);
          withheldValues = screened.withheldValues;
          const publish = (text: string): string => publishStudioText(text, withheldValues);

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

        const parsed = ReadStudioLogsOutputSchema.parse(structuredContent);
        const text = publishStudioText(summarizeStudioLogs(parsed), withheldValues);
        policy.assertOutputWithinLimit(READ_STUDIO_LOGS_TOOL, `${JSON.stringify(parsed)}${text}`);
        return { content: [{ type: 'text', text }], structuredContent: parsed };
      } catch (error) {
        return publishFailure(policy, error);
      }
    },
  );
}
