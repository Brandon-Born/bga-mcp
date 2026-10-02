import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

// Builtins only in the write-bearing job. The read-only preflight verifies signatures,
// schema, coverage and secrets before handing off a digest through job outputs.
const execute = promisify(execFile);
const repository = 'Brandon-Born/bga-mcp';
const assets = [
  'SHA256SUMS',
  'release-candidate.json',
  'release-candidate.schema.json',
  'verification-evidence.json',
  'security-audit.json',
  'security-audit-policy.json',
  'sigstore-bundle.json',
  'capabilities.json',
  'release-inventory.json',
  'evidence.schema.json',
  'release-evidence.json',
  'release-evidence.schema.json',
].sort();
const digest = (bytes: Buffer | string): string =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
export interface PublicationPlan {
  tag: string;
  sourceCommit: string;
  title: string;
  notes: string;
  assets: { name: string; digest: string }[];
}
export interface RemoteRelease {
  id: number;
  tag_name: string;
  name: string;
  body: string;
  draft: boolean;
  prerelease: boolean;
  assets: { name: string; digest: string; state: string }[];
}
export async function validatePublicationPlan(
  directory: string,
  expectedDigest: string,
): Promise<PublicationPlan> {
  assert(/^sha256:[0-9a-f]{64}$/u.test(expectedDigest));
  assert.deepEqual((await readdir(directory)).sort(), ['packet', 'plan.json']);
  const planFile = resolve(directory, 'plan.json');
  const info = await lstat(planFile);
  assert(info.isFile() && !info.isSymbolicLink() && info.size <= 32_768);
  const bytes = await readFile(planFile);
  assert.equal(digest(bytes), expectedDigest, 'Prepared plan was substituted');
  const plan = JSON.parse(bytes.toString('utf8')) as PublicationPlan;
  const receipt = JSON.parse(
    await readFile(
      resolve(import.meta.dirname, '../docs/verification/release-candidate-v1.0.0-rc.5.json'),
      'utf8',
    ),
  ) as { candidate: { sourceTag: string; sourceCommit: string } };
  assert.equal(plan.tag, receipt.candidate.sourceTag);
  assert.equal(plan.sourceCommit, receipt.candidate.sourceCommit);
  assert.equal(plan.title, `${plan.tag} verification evidence (candidate)`);
  assert(
    typeof plan.notes === 'string' &&
      plan.notes.length <= 12_000 &&
      plan.notes.includes('Live Studio: not run.'),
  );
  assert.deepEqual(plan.assets.map((a) => a.name).sort(), assets);
  const packet = resolve(directory, 'packet');
  const stat = await lstat(packet);
  assert(stat.isDirectory() && !stat.isSymbolicLink());
  assert.deepEqual((await readdir(packet)).sort(), assets);
  for (const asset of plan.assets) {
    const file = resolve(packet, asset.name);
    const fileInfo = await lstat(file);
    assert(fileInfo.isFile() && !fileInfo.isSymbolicLink() && fileInfo.size <= 16 * 1024 * 1024);
    assert.equal(digest(await readFile(file)), asset.digest, 'Prepared asset was substituted');
  }
  return plan;
}
export function reconcileRelease(release: RemoteRelease, plan: PublicationPlan): string[] {
  assert(Number.isSafeInteger(release.id) && release.id > 0);
  assert.equal(release.tag_name, plan.tag);
  assert.equal(release.name, plan.title);
  assert.equal(release.body, plan.notes);
  assert(release.prerelease, 'Evidence must remain a prerelease');
  const names = new Set<string>();
  for (const asset of release.assets) {
    const expected = plan.assets.find((a) => a.name === asset.name);
    assert(expected && !names.has(asset.name) && asset.state === 'uploaded');
    names.add(asset.name);
    assert.equal(
      asset.digest,
      expected.digest,
      'Existing release asset conflicts; never overwrite',
    );
  }
  const missing = plan.assets.filter((a) => !names.has(a.name)).map((a) => a.name);
  assert(
    release.draft || missing.length === 0,
    'Published evidence is incomplete; refuse mutation',
  );
  return missing;
}
export function findRelease(pages: RemoteRelease[][], tag: string): RemoteRelease | undefined {
  const matches = pages.flat().filter((release) => release.tag_name === tag);
  assert(
    matches.length <= 1,
    'Ambiguous release identity; refuse creating or modifying duplicates',
  );
  return matches[0];
}
async function remote(tag: string): Promise<RemoteRelease | undefined> {
  // GitHub's by-tag endpoint omits unpublished drafts. The authenticated list
  // includes drafts and prevents a retry from creating a duplicate after interruption.
  // https://docs.github.com/en/rest/releases/releases#list-releases
  const { stdout } = await execute(
    'gh',
    ['api', `repos/${repository}/releases`, '--paginate', '--slurp'],
    { timeout: 120_000, maxBuffer: 8 * 1024 * 1024 },
  );
  return findRelease(JSON.parse(stdout) as RemoteRelease[][], tag);
}
async function publish(directory: string, expectedDigest: string): Promise<void> {
  const plan = await validatePublicationPlan(directory, expectedDigest);
  const { stdout: tag } = await execute('gh', ['api', `repos/${repository}/commits/${plan.tag}`]);
  assert.equal((JSON.parse(tag) as { sha: string }).sha, plan.sourceCommit);
  let release = await remote(plan.tag);
  const scratch = await mkdtemp(resolve(tmpdir(), 'bga-evidence-publish-'));
  try {
    if (release === undefined) {
      const notes = resolve(scratch, 'notes.md');
      await writeFile(notes, plan.notes);
      await execute(
        'gh',
        [
          'release',
          'create',
          plan.tag,
          '--repo',
          repository,
          '--verify-tag',
          '--draft',
          '--prerelease',
          '--latest=false',
          '--title',
          plan.title,
          '--notes-file',
          notes,
        ],
        { timeout: 120_000, maxBuffer: 1_000_000 },
      );
      release = await remote(plan.tag);
      assert(release);
    }
    const missing = reconcileRelease(release, plan);
    if (missing.length > 0)
      await execute(
        'gh',
        [
          'release',
          'upload',
          plan.tag,
          ...missing.map((name) => resolve(directory, 'packet', name)),
          '--repo',
          repository,
        ],
        { timeout: 120_000, maxBuffer: 1_000_000 },
      );
    release = await remote(plan.tag);
    assert(release);
    assert.equal(reconcileRelease(release, plan).length, 0);
    if (release.draft)
      await execute(
        'gh',
        [
          'release',
          'edit',
          plan.tag,
          '--repo',
          repository,
          '--draft=false',
          '--prerelease',
          '--latest=false',
        ],
        { timeout: 120_000, maxBuffer: 1_000_000 },
      );
    release = await remote(plan.tag);
    assert(release && !release.draft);
    reconcileRelease(release, plan);
    process.stdout.write(
      'Evidence-only prerelease assets published or already identical; no package rebuilt or published.\n',
    );
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  try {
    const [directory, expectedDigest] = process.argv.slice(2);
    assert(directory && expectedDigest);
    await publish(resolve(directory), expectedDigest);
  } catch {
    process.stderr.write(
      'Evidence publication failed; existing assets were not overwritten. Reconcile the same draft before retrying.\n',
    );
    process.exitCode = 1;
  }
}
