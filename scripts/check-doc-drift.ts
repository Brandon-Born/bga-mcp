import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  compareToBaseline,
  requiresReview,
  type BaselineEntry,
  type ObservedPage,
} from '../src/docs/drift.js';
import { htmlToText } from '../src/docs/excerpt.js';
import { DOCUMENTATION_TOPICS } from '../src/docs/topics.js';
import { createPolicyBoundary } from '../src/policy.js';

const repositoryRoot = resolve(import.meta.dirname, '..');
const baselinePath = resolve(repositoryRoot, 'config/doc-baseline.json');

interface Baseline {
  readonly schemaVersion: 1;
  readonly reviewedAt: string;
  readonly pages: readonly BaselineEntry[];
}

/**
 * Detects documentation drift and refuses to resolve it.
 *
 * Non-mutating by design: it retrieves the tracked pages, compares them with
 * the baseline they were reviewed at, and reports. Writing a new baseline is
 * `--record`, which a person runs after reading what changed. Nothing here
 * decides that new text is correct, because that is a judgement and this is a
 * comparison.
 *
 * Needs the network, so it is not part of `pnpm check`. It is meant for a
 * schedule, and for the moment before a documentation release.
 */
async function main(): Promise<void> {
  const record = process.argv.includes('--record');
  const policy = await createPolicyBoundary({ networkEnabled: true });

  let baseline: Baseline = { schemaVersion: 1, reviewedAt: '', pages: [] };
  try {
    baseline = JSON.parse(await readFile(baselinePath, 'utf8')) as Baseline;
  } catch {
    if (!record) {
      process.stderr.write(
        `No baseline at ${baselinePath}. Run \`pnpm docs:drift --record\` to create one, after reading the pages it will record.\n`,
      );
      process.exitCode = 1;
      return;
    }
  }

  const observed: ObservedPage[] = [];
  const unreachable: { topic: string; reason: string }[] = [];

  for (const topic of DOCUMENTATION_TOPICS) {
    try {
      const page = await policy.fetchDocumentation({ sourceId: topic.sourceId, path: topic.path });
      observed.push({
        topic: topic.topic,
        url: page.url,
        lastEdited: page.lastModified,
        // The digest covers the extracted text, so a change in markup that a
        // reader would never see is not reported as a change in guidance.
        digest: createHash('sha256').update(htmlToText(page.body)).digest('hex'),
      });
    } catch (error) {
      unreachable.push({
        topic: topic.topic,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const findings = compareToBaseline(baseline.pages, observed, unreachable);
  for (const finding of findings) {
    process.stdout.write(`${finding.kind.toUpperCase()} ${finding.topic}: ${finding.detail}\n`);
  }

  if (record) {
    const now = new Date().toISOString().slice(0, 10);
    const recorded: Baseline = {
      schemaVersion: 1,
      reviewedAt: now,
      pages: observed.map((page) => ({
        topic: page.topic,
        url: page.url,
        lastEdited: page.lastEdited,
        digest: page.digest,
        reviewedAt: now,
      })),
    };
    await writeFile(baselinePath, `${JSON.stringify(recorded, null, 2)}\n`);
    process.stdout.write(
      `Recorded ${String(recorded.pages.length)} page(s) as reviewed on ${now}. Commit this only if you have read what changed.\n`,
    );
    return;
  }

  if (findings.length === 0) {
    process.stdout.write(
      `Documentation is unchanged since it was reviewed on ${baseline.reviewedAt}: ${String(observed.length)} page(s) checked.\n`,
    );
    return;
  }

  if (requiresReview(findings)) {
    process.stderr.write(
      '\nDocumentation has changed. Re-read the affected pages, re-run `pnpm test:docs-eval`, and only then record a new baseline. Until that happens, treat guidance derived from these pages as stale.\n',
    );
    process.exitCode = 1;
  }
}

await main();
