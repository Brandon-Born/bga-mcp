import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { appendFile, cp, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { frameworkReleaseGuard } from './framework-change.js';
import { runSecurityAudit } from './audit-security.js';
import { verifySecurityAudit } from './lib/security-audit.js';
import { verifyReportingLifecycle, type ReportingReceipt } from './lib/security-reporting.js';
import {
  SecurityReviewPlanSchema,
  SecurityReviewSchema,
  verifyReviewApproval,
} from './lib/security-review.js';
import {
  candidateFiles,
  readSigningCandidate,
  verifySignedCandidate,
  SIGNING_REPOSITORY,
} from './release-signing.js';
import {
  object,
  readPublicationConfig,
  readPublicationPlan,
  sha256,
  verifyPreparedFiles,
  verifyPublicationPrerequisites,
  type PublicationPlan,
} from './lib/publication.js';
import { scanText } from './lib/secret-scan.js';

const root = resolve(import.meta.dirname, '..');
const execute = promisify(execFile);
const load = async (path: string): Promise<unknown> =>
  JSON.parse(await readFile(resolve(root, path), 'utf8')) as unknown;
export async function publicationHolds(): Promise<string[]> {
  const config = readPublicationConfig(await load('config/publication.json'));
  const plan = SecurityReviewPlanSchema.parse(await load('config/security-review.json'));
  const review = SecurityReviewSchema.parse(await load(config.reviewReceipt));
  const failures = [...verifyReviewApproval(review, plan).failures];
  if (review.status !== 'approved') failures.push('BGA-405 approval is held');
  if (config.decision === null)
    failures.push('Package/registry/trusted-publisher decision and setup evidence are pending');
  else if ('channel' in config.decision) {
    const setup = object(await load(config.decision.publisherSetupEvidence));
    assert.equal(setup.repository, SIGNING_REPOSITORY);
    assert.equal(setup.channel, 'github-downloads');
    assert.equal(setup.visibility, 'public');
    assert.equal(setup.maintainerCanPush, true);
    assert.equal(setup.authorization, config.decision.authorization);
  }
  try {
    const prerequisites = {
      installation: await load(config.prerequisites.installation),
      client: await load(config.prerequisites.client),
      evidence: await load(config.prerequisites.evidence),
      usefulness: await load(config.prerequisites.usefulness),
    };
    verifyPublicationPrerequisites(
      prerequisites,
      review.candidate,
      sha256(await readFile(resolve(root, 'docs/INSTALL.md'))),
    );
  } catch {
    failures.push(
      'BGA-400/401/407/424 candidate-specific install, client, public evidence or usefulness prerequisites are incomplete',
    );
  }
  const reporting = object(await load('config/security-reporting.json'));
  assert(typeof reporting.liveReceipt === 'string');
  failures.push(
    ...verifyReportingLifecycle((await load(reporting.liveReceipt)) as ReportingReceipt).failures,
  );
  if (reporting.status !== 'verified') failures.push('BGA-406 is not verified');
  try {
    await frameworkReleaseGuard();
  } catch {
    failures.push('BGA-408 current framework release review is held');
  }
  return failures;
}
async function prepare(output: string): Promise<void> {
  const holds = await publicationHolds();
  assert.equal(holds.length, 0, `Publication held: ${holds.join('; ')}`);
  const config = readPublicationConfig(await load('config/publication.json'));
  assert(config.decision);
  const reviewPlan = SecurityReviewPlanSchema.parse(await load('config/security-review.json'));
  const reviewBytes = await readFile(resolve(root, config.reviewReceipt));
  const review = SecurityReviewSchema.parse(JSON.parse(reviewBytes.toString('utf8')));
  const receipt = await load(reviewPlan.candidateReceipt);
  const signing = object(await load(reviewPlan.signingReceipt));
  const workflow = object(signing.workflow),
    signer = object(signing.signer);
  assert(typeof signer.commit === 'string');
  assert(
    typeof workflow.artifactId === 'number' &&
      Number.isSafeInteger(workflow.artifactId) &&
      workflow.artifactId > 0,
  );
  const source = process.env.BGA_MCP_SECURITY_SOURCE;
  assert(source, 'Provide a clean exact candidate source checkout for a fresh audit');
  assert.equal(
    (await execute('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout.trim(),
    process.env.GITHUB_SHA,
  );
  assert.equal((await execute('git', ['status', '--porcelain'], { cwd: root })).stdout.trim(), '');
  assert.equal(process.env.GITHUB_REPOSITORY, SIGNING_REPOSITORY);
  assert.equal(process.env.GITHUB_REF, 'refs/heads/main');
  assert.equal(process.env.GITHUB_EVENT_NAME, 'workflow_dispatch');
  assert.equal(
    process.env.GITHUB_WORKFLOW_REF,
    `${SIGNING_REPOSITORY}/${config.decision.workflow}@refs/heads/main`,
  );
  assert.equal(
    (await execute('git', ['rev-parse', 'HEAD'], { cwd: source })).stdout.trim(),
    review.candidate.sourceCommit,
  );
  assert.equal(
    (await execute('git', ['status', '--porcelain'], { cwd: source })).stdout.trim(),
    '',
  );
  const scratch = await mkdtemp(resolve(tmpdir(), 'bga415-preflight-'));
  try {
    const { stdout: archive } = await execute(
      'gh',
      ['api', `repos/${SIGNING_REPOSITORY}/actions/artifacts/${String(workflow.artifactId)}/zip`],
      { encoding: 'buffer', timeout: 120_000, maxBuffer: 16 * 1024 * 1024 },
    );
    assert.equal(sha256(archive), workflow.archiveDigest);
    const zip = resolve(scratch, 'signed.zip');
    await writeFile(zip, archive);
    assert.deepEqual(
      (await execute('unzip', ['-Z1', zip])).stdout.trim().split('\n').sort(),
      [...candidateFiles(receipt), 'sigstore-bundle.json', 'release-provenance.json'].sort(),
    );
    const packet = resolve(scratch, 'signed');
    await execute('unzip', ['-q', zip, '-d', packet]);
    const candidate = await readSigningCandidate(packet, receipt);
    assert.equal(candidate.identity.artifactDigest, review.candidate.artifactDigest);
    const { stdout: roots } = await execute('gh', ['attestation', 'trusted-root'], {
      timeout: 120_000,
    });
    const trust = resolve(scratch, 'trusted-root.jsonl');
    await writeFile(trust, roots);
    await verifySignedCandidate(packet, signer.commit, trust);
    const fresh = await runSecurityAudit(resolve(source));
    const auditCheck = verifySecurityAudit(
      fresh.audit,
      fresh.policy,
      reviewPlan.reviewedCandidate.auditIdentity,
      new Date(),
      new Set(review.tests.passedScenarios),
    );
    assert.equal(auditCheck.failed, false, auditCheck.failures.join('; '));
    const artifact = resolve(packet, candidate.identity.artifactName);
    for (const guide of [
      'README.md',
      'AGENTS.md',
      'CONTRIBUTING.md',
      'SECURITY.md',
      'docs/INSTALL.md',
      'docs/VERSIONING.md',
    ]) {
      const { stdout } = await execute('tar', ['-xOf', artifact, `package/${guide}`], {
        encoding: 'buffer',
        maxBuffer: 2 * 1024 * 1024,
      });
      assert.deepEqual(
        stdout,
        await readFile(resolve(root, guide)),
        'Candidate packaged guidance changed since approval',
      );
    }
    // Recheck live framework and approval lifetime after network work, immediately before admission.
    await frameworkReleaseGuard();
    assert.equal(verifyReviewApproval(review, reviewPlan).failed, false);
    await mkdir(output);
    const files = new Map<string, Buffer>();
    for (const name of [
      ...candidateFiles(receipt),
      'sigstore-bundle.json',
      'release-provenance.json',
    ]) {
      const file = resolve(packet, name),
        stat = await lstat(file);
      assert(stat.isFile() && !stat.isSymbolicLink());
      files.set(name, await readFile(file));
      await cp(file, resolve(output, name));
    }
    files.set('approval.json', reviewBytes);
    files.set('fresh-audit.json', Buffer.from(`${JSON.stringify(fresh.audit, null, 2)}\n`));
    const additional = ['approval.json', 'fresh-audit.json'];
    if ('channel' in config.decision) {
      files.set(
        'GITHUB_DOWNLOADS.md',
        await readFile(resolve(root, 'docs/verification/GITHUB_DOWNLOADS.md')),
      );
      additional.push('GITHUB_DOWNLOADS.md');
    }
    for (const name of additional) {
      const bytes = files.get(name);
      assert(bytes);
      assert.equal(scanText(bytes.toString('utf8'), name).length, 0);
      await writeFile(resolve(output, name), bytes, { flag: 'wx' });
    }
    const publisherCommit = process.env.GITHUB_SHA,
      workflowRun = process.env.GITHUB_RUN_ID;
    assert(publisherCommit && workflowRun);
    const candidateMetadata = object(candidate.identity.candidate);
    assert(typeof candidateMetadata.packageVersion === 'string');
    const plan: PublicationPlan = {
      schemaVersion: 1,
      preparedAt: new Date().toISOString(),
      publisherCommit,
      workflowRun,
      decision: config.decision,
      candidate: {
        name: 'bga-mcp',
        version: candidateMetadata.packageVersion,
        tag: candidate.identity.sourceTag,
        sourceCommit: candidate.identity.sourceCommit,
        artifactDigest: candidate.identity.artifactDigest,
      },
      approvalDigest: sha256(reviewBytes),
      auditDigest: sha256(`${JSON.stringify(fresh.audit, null, 2)}\n`),
      auditGeneratedAt: fresh.audit.generatedAt,
      files: [...files]
        .map(([name, bytes]) => ({ name, digest: sha256(bytes) }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
    readPublicationPlan(plan);
    verifyPreparedFiles(plan, files);
    const planBytes = `${JSON.stringify(plan, null, 2)}\n`;
    assert.equal(scanText(planBytes, 'publication-plan').length, 0);
    await writeFile(resolve(output, 'plan.json'), planBytes, { flag: 'wx' });
    if (process.env.GITHUB_OUTPUT)
      await appendFile(process.env.GITHUB_OUTPUT, `plan-digest=${sha256(planBytes)}\n`);
    process.stdout.write(
      'Exact approved candidate admitted with fresh audit; no rebuild or publication.\n',
    );
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  try {
    const [mode, output] = process.argv.slice(2);
    if (mode === 'status') {
      const holds = await publicationHolds();
      process.stdout.write(
        `${JSON.stringify({ owner: 'BGA-415', status: holds.length ? 'held' : 'eligible for explicit workflow', holds, published: false }, null, 2)}\n`,
      );
    } else {
      assert(mode === 'prepare' && output);
      await prepare(resolve(output));
    }
  } catch {
    process.stderr.write(
      'Publication preflight failed; no registry write is permitted. Run release:status for owned holds.\n',
    );
    process.exitCode = 1;
  }
}
