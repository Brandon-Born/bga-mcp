import { createHash } from 'node:crypto';
import {
  access,
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';

import { integrityDigest, type Evidence } from './evidence.js';
import { GateReport } from './gate.js';
import {
  buildReleaseCandidateManifest,
  type CapabilityManifest,
  type ReleaseCandidateManifest,
  type ReleaseInventory,
  type ReleasePackageIdentity,
  releaseDigest,
  verifyReleaseInventory,
} from './release.js';
import { formatFindings, scanDirectory } from './secret-scan.js';

export interface VersionPolicySummary {
  readonly package: {
    readonly firstStableVersion: string;
    readonly prereleaseIdentifier: string;
  };
}

export interface CandidateSource {
  readonly tag: string;
  readonly commit: string;
  readonly tagCommit: string;
  readonly clean: boolean;
  readonly packageName: string;
  readonly packageVersion: string;
  readonly manifestVersion: string;
  readonly metadataVersion: string;
  readonly lockDigest: string;
}

export interface CandidateBundleInput {
  readonly source: CandidateSource;
  readonly policy: VersionPolicySummary;
  readonly inventory: ReleaseInventory;
  readonly inventoryText: string;
  readonly capabilityManifest: CapabilityManifest;
  readonly capabilityManifestText: string;
  readonly evidence: Evidence;
  readonly evidenceText: string;
  readonly schemaText: string;
  readonly artifactPath: string;
  readonly reconstructionPath: string;
  /** Parsed from package/package.json inside the original tarball. */
  readonly artifactPackage: ReleasePackageIdentity;
  /** Parsed independently from the reconstructed tarball. */
  readonly reconstructionPackage: ReleasePackageIdentity;
  readonly outputDirectory: string;
}

export interface CandidateBundle {
  readonly directory: string;
  readonly artifact: string;
  readonly manifest: string;
  readonly evidence: string;
  readonly schema: string;
  readonly checksums: string;
  readonly manifestDocument: ReleaseCandidateManifest;
}

function escaped(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

/** Validates the immutable identity before an expensive candidate gate starts. */
export function verifyCandidateSource(
  source: CandidateSource,
  policy: VersionPolicySummary,
): GateReport {
  const report = new GateReport();
  const candidatePattern = new RegExp(
    `^${escaped(policy.package.firstStableVersion)}-${escaped(policy.package.prereleaseIdentifier)}\\.[1-9]\\d*$`,
    'u',
  );
  report.require(source.clean, 'Release candidates require a clean source tree');
  report.require(/^[0-9a-f]{40}$/u.test(source.commit), 'Candidate commit is not a full Git SHA');
  report.require(source.tagCommit === source.commit, 'Candidate tag does not resolve to HEAD');
  report.require(
    candidatePattern.test(source.packageVersion),
    `${source.packageVersion} is not a first-release candidate version`,
  );
  report.require(
    source.tag === `v${source.packageVersion}`,
    `Candidate tag ${source.tag} does not match package ${source.packageVersion}`,
  );
  report.require(
    source.manifestVersion === source.packageVersion,
    'Capability manifest version differs from the candidate package',
  );
  report.require(
    source.metadataVersion === source.packageVersion,
    'Runtime metadata version differs from the candidate package',
  );
  report.require(/^sha256:[0-9a-f]{64}$/u.test(source.lockDigest), 'Lockfile digest is invalid');
  return report;
}

/** The candidate workflow is intentionally incapable of publishing or minting an identity token. */
export function verifyCandidateWorkflow(source: string): GateReport {
  const report = new GateReport();
  report.require(/\bworkflow_dispatch\s*:/u.test(source), 'Candidate workflow is not manual');
  report.require(
    !/^\s*(?:push|pull_request|pull_request_target)\s*:/mu.test(source),
    'Candidate workflow has an automatic trigger',
  );
  report.require(
    /^permissions:\s*\n\s{2}contents:\s*read\s*$/mu.test(source),
    'Candidate workflow does not have the single contents:read permission',
  );
  report.require(
    !/^\s+(?:id-token|packages|actions|attestations):/mu.test(source),
    'Candidate workflow grants a publishing or identity permission',
  );
  report.require(
    !/\b(?:npm|pnpm|yarn)\s+publish\b|\bnpm\s+stage\b|NODE_AUTH_TOKEN|NPM_TOKEN|registry-url/iu.test(
      source,
    ),
    'Candidate workflow contains a registry publication path or credential',
  );
  report.require(
    /persist-credentials:\s*false/u.test(source),
    'Checkout credentials are persisted',
  );
  report.require(
    source.includes('pnpm release:candidate'),
    'Candidate workflow does not run the candidate builder',
  );
  report.require(
    /actions\/upload-artifact@[0-9a-f]{40}/u.test(source),
    'Candidate workflow does not retain the immutable output with a pinned action',
  );
  return report;
}

function evidenceReport(
  source: CandidateSource,
  evidence: Evidence,
  artifactDigest: string,
): GateReport {
  const report = new GateReport();
  report.require(evidence.source.clean, 'Verification evidence records a dirty source tree');
  report.require(
    evidence.source.commit === source.commit,
    'Verification evidence belongs to another commit',
  );
  report.require(
    evidence.package.name === source.packageName,
    'Verification evidence names another package',
  );
  report.require(
    evidence.package.version === source.packageVersion,
    'Verification evidence names another package version',
  );
  report.require(
    evidence.package.lockDigest === source.lockDigest,
    'Verification evidence names another lockfile',
  );
  report.require(
    evidence.package.artifactDigest === artifactDigest,
    'Verification evidence names another artifact',
  );
  report.require(evidence.tests.failed === 0, 'Verification evidence records failed tests');
  report.require(evidence.scenarios.failed === 0, 'Verification evidence records failed scenarios');
  report.require(
    evidence.scenarios.missing === 0,
    'Verification evidence records missing scenarios',
  );
  report.require(
    evidence.integrity?.algorithm === 'sha256' &&
      evidence.integrity.value === integrityDigest(evidence),
    'Verification evidence integrity does not match its content',
  );
  return report;
}

function sameJsonText(value: unknown, text: string): boolean {
  try {
    return JSON.stringify(value) === JSON.stringify(JSON.parse(text));
  } catch {
    return false;
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function requireEmptyDestination(path: string): Promise<void> {
  if (!(await pathExists(path))) return;
  const entries = await readdir(path);
  if (entries.length > 0) {
    throw new Error(`Refusing to replace immutable candidate output at ${path}`);
  }
  await rm(path, { recursive: true });
}

function checksumLine(path: string, content: Buffer | string): string {
  const digest = createHash('sha256').update(content).digest('hex');
  return `${digest}  ${basename(path)}`;
}

/**
 * Writes one candidate bundle atomically.
 *
 * `artifactPath` is the only candidate. `reconstructionPath` is compared and
 * discarded; downstream jobs receive the original bytes and the manifest that
 * binds them, never a rebuild.
 */
export async function writeCandidateBundle(input: CandidateBundleInput): Promise<CandidateBundle> {
  const sourceReport = verifyCandidateSource(input.source, input.policy);
  if (sourceReport.failed) {
    throw new Error(
      `Release candidate source is ineligible:\n- ${sourceReport.failures.join('\n- ')}`,
    );
  }

  const artifact = await readFile(input.artifactPath);
  const reconstruction = await readFile(input.reconstructionPath);
  const artifactDigest = releaseDigest(artifact);
  const reconstructedDigest = releaseDigest(reconstruction);
  if (artifactDigest !== reconstructedDigest || !artifact.equals(reconstruction)) {
    throw new Error(
      `Release candidate is not reproducible (candidate ${artifactDigest}, reconstruction ${reconstructedDigest})`,
    );
  }

  const artifactProfile = verifyReleaseInventory(
    input.inventory,
    input.capabilityManifest,
    undefined,
    input.artifactPackage,
  );
  const reconstructionProfile = verifyReleaseInventory(
    input.inventory,
    input.capabilityManifest,
    undefined,
    input.reconstructionPackage,
  );
  if (artifactProfile.failed || reconstructionProfile.failed) {
    throw new Error(
      `Release candidate public executable is ineligible:\n- ${[
        ...artifactProfile.failures,
        ...reconstructionProfile.failures,
      ].join('\n- ')}`,
    );
  }

  const retainedReport = evidenceReport(input.source, input.evidence, artifactDigest);
  retainedReport.require(
    input.capabilityManifest.server.name === input.source.packageName &&
      input.capabilityManifest.server.version === input.source.manifestVersion,
    'Capability manifest content differs from the candidate source identity',
  );
  retainedReport.require(
    sameJsonText(input.inventory, input.inventoryText),
    'Release inventory content differs from the retained inventory bytes',
  );
  retainedReport.require(
    sameJsonText(input.capabilityManifest, input.capabilityManifestText),
    'Capability manifest content differs from the retained manifest bytes',
  );
  retainedReport.require(
    sameJsonText(input.evidence, input.evidenceText),
    'Verification evidence content differs from the retained evidence bytes',
  );
  if (retainedReport.failed) {
    throw new Error(
      `Release candidate evidence is ineligible:\n- ${retainedReport.failures.join('\n- ')}`,
    );
  }

  const artifactName = basename(input.artifactPath);
  const expectedArtifactName = `${input.source.packageName}-${input.source.packageVersion}.tgz`;
  if (artifactName !== expectedArtifactName) {
    throw new Error(
      `Candidate artifact ${artifactName} does not match expected npm artifact ${expectedArtifactName}`,
    );
  }
  const manifestDocument = buildReleaseCandidateManifest(
    input.inventory,
    input.capabilityManifest,
    input.evidence,
    input.source.tag,
    input.source.commit,
    artifactName,
    artifactDigest,
    {
      inventory: releaseDigest(input.inventoryText),
      capabilityManifest: releaseDigest(input.capabilityManifestText),
      verificationEvidence: releaseDigest(input.evidenceText),
    },
  );

  await requireEmptyDestination(input.outputDirectory);
  const parent = dirname(input.outputDirectory);
  await mkdir(parent, { recursive: true });
  const staging = resolve(
    parent,
    `.${basename(input.outputDirectory)}-${input.source.commit.slice(0, 12)}.staging`,
  );
  await rm(staging, { recursive: true, force: true });
  await mkdir(staging);

  const artifactOutput = resolve(staging, artifactName);
  const manifestOutput = resolve(staging, 'release-candidate.json');
  const evidenceOutput = resolve(staging, 'verification-evidence.json');
  const schemaOutput = resolve(staging, 'release-candidate.schema.json');
  const checksumsOutput = resolve(staging, 'SHA256SUMS');
  const manifestText = `${JSON.stringify(manifestDocument, null, 2)}\n`;

  try {
    await copyFile(input.artifactPath, artifactOutput);
    await writeFile(manifestOutput, manifestText);
    await writeFile(evidenceOutput, input.evidenceText);
    await writeFile(schemaOutput, input.schemaText);
    const checksums = [
      checksumLine(artifactOutput, artifact),
      checksumLine(manifestOutput, manifestText),
      checksumLine(schemaOutput, input.schemaText),
      checksumLine(evidenceOutput, input.evidenceText),
    ]
      .sort()
      .join('\n');
    await writeFile(checksumsOutput, `${checksums}\n`);

    const findings = await scanDirectory(staging);
    if (findings.length > 0) {
      throw new Error(`Candidate output contains a secret:\n${formatFindings(findings)}`);
    }
    await rename(staging, input.outputDirectory);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }

  return {
    directory: input.outputDirectory,
    artifact: resolve(input.outputDirectory, artifactName),
    manifest: resolve(input.outputDirectory, 'release-candidate.json'),
    evidence: resolve(input.outputDirectory, 'verification-evidence.json'),
    schema: resolve(input.outputDirectory, 'release-candidate.schema.json'),
    checksums: resolve(input.outputDirectory, 'SHA256SUMS'),
    manifestDocument,
  };
}
