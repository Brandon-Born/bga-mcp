import { access, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

import { Ajv2020 } from 'ajv/dist/2020.js';

import { GateReport } from './gate.js';
import { collectDeclarations } from './scenarios.js';

export interface ClientMatrix {
  clients: {
    id: string;
    name: string;
    version: string | null;
    status: 'supported' | 'evaluated' | 'candidate';
    compatibilityClaim?: string;
    platforms: string[];
    nodeMajors: number[];
    protocolVersions: string[];
    fixtures: string[];
    scenarios: string[];
    receipt?: string;
    scope: string;
  }[];
}

export async function verifyClientMatrix(
  matrix: ClientMatrix,
  repository: string,
  controlledReceipts: Record<string, Record<string, unknown>> = {},
): Promise<GateReport> {
  const report = new GateReport();
  const read = async <T>(path: string): Promise<T> =>
    JSON.parse(await readFile(resolve(repository, path), 'utf8')) as T;
  const schema = await read<object>('config/client-smoke.schema.json');
  const validate = new Ajv2020({ strict: true, allErrors: true }).compile(schema);
  report.require(validate(matrix), 'Client matrix schema failed');
  if (!validate(matrix)) return report;
  const compatibility = await read<{
    claims: {
      id: string;
      dimension: string;
      support: string;
      value: string;
      scenarios?: string[];
    }[];
  }>('config/compatibility.json');
  const manifest = await read<{ transports: { requiredScenarios: string[] }[] }>(
    'config/capabilities.json',
  );
  const metadata = await read<{ devDependencies: Record<string, string> }>('package.json');
  const workflow = await readFile(resolve(repository, '.github/workflows/ci.yml'), 'utf8');
  const declarations = await collectDeclarations(resolve(repository, 'tests'));
  const required = new Set(manifest.transports.flatMap((entry) => entry.requiredScenarios));
  const docs = await readFile(resolve(repository, 'docs/CLIENTS.md'), 'utf8');
  const ids = new Set<string>();
  for (const client of matrix.clients) {
    report.require(!ids.has(client.id), 'Duplicate client matrix row');
    ids.add(client.id);
    report.require(docs.includes(client.id), `${client.id} missing from client documentation`);
    for (const fixture of client.fixtures) {
      try {
        await access(resolve(repository, fixture));
      } catch {
        report.require(false, `${client.id} fixture missing`);
      }
    }
    if (client.status === 'supported') {
      const release = await read<{ protocolVersions: string[] }>('config/release.json');
      report.require(
        JSON.stringify(client.protocolVersions) === JSON.stringify(release.protocolVersions),
        'Maintained protocol claim differs from frozen release',
      );
      const claim = compatibility.claims.find(
        (entry) =>
          entry.id === client.compatibilityClaim &&
          entry.dimension === 'client' &&
          entry.support === 'supported',
      );
      report.require(
        claim?.value === `${client.name} ${String(client.version)}`,
        'Supported client identity differs from compatibility claim',
      );
      report.require(
        metadata.devDependencies[client.name] === client.version,
        'Maintained client dependency is not pinned to matrix version',
      );
      const platforms = /os:\s*\[([^\]]+)\]/u
        .exec(workflow)?.[1]
        ?.split(',')
        .map((entry) => entry.trim());
      const nodes = /node:\s*\[([^\]]+)\]/u.exec(workflow)?.[1]?.split(',').map(Number);
      report.require(
        JSON.stringify([...client.platforms].sort()) === JSON.stringify(platforms?.sort()),
        'Client platforms differ from CI',
      );
      report.require(
        JSON.stringify([...client.nodeMajors].sort()) === JSON.stringify(nodes?.sort()),
        'Client runtimes differ from CI',
      );
      for (const scenario of client.scenarios) {
        report.require(
          required.has(scenario) && claim?.scenarios?.includes(scenario) === true,
          'Client scenario not required by transport and compatibility claim',
        );
        report.require(
          declarations.some(
            (entry) => entry.id === scenario && entry.runnable && entry.file.startsWith('e2e/'),
          ),
          'Client scenario has no runnable packaged test',
        );
      }
    } else if (client.status === 'evaluated') {
      try {
        const receipt =
          controlledReceipts[client.id] ??
          (await read<Record<string, unknown>>(client.receipt ?? ''));
        const candidate = await read<{
          candidate: { sourceTag: string; sourceCommit: string; digests: { artifact: string } };
        }>('docs/verification/release-candidate-v1.0.0-rc.1.json');
        report.require(
          typeof receipt.clientBinaryDigest === 'string' &&
            /^sha256:[0-9a-f]{64}$/u.test(receipt.clientBinaryDigest) &&
            typeof receipt.runnerCommit === 'string' &&
            /^[0-9a-f]{40}$/u.test(receipt.runnerCommit),
          'Controlled binary/source identities missing',
        );
        report.require(
          receipt.client === `codex-cli ${String(client.version)}` &&
            client.name === 'Codex app-server',
          'Controlled client identity differs',
        );
        report.require(
          client.platforms.length === 1 &&
            receipt.platform === client.platforms[0] &&
            receipt.architecture === 'arm64' &&
            client.nodeMajors.length === 1 &&
            typeof receipt.node === 'string' &&
            receipt.node.startsWith(`v${String(client.nodeMajors[0])}.`),
          'Controlled environment differs',
        );
        report.require(
          receipt.artifactDigest === candidate.candidate.digests.artifact &&
            receipt.candidateCommit === candidate.candidate.sourceCommit &&
            receipt.candidateTag === candidate.candidate.sourceTag,
          'Controlled smoke used another candidate',
        );
        for (const key of [
          'schemaRefusal',
          'outsideRootRefusal',
          'excludedToolRefusal',
          'appServerExited',
          'serverProcessesExited',
          'projectUnchanged',
          'userConfigurationUnchanged',
        ])
          report.require(receipt[key] === true, `Controlled smoke missing ${key}`);
        report.require(
          receipt.restart === 'passed' &&
            receipt.removal === 'passed' &&
            receipt.inferenceTurns === 0,
          'Controlled lifecycle or scope differs',
        );
        report.require(
          receipt.discovery === 'matched installed inventory',
          'Controlled discovery unverified',
        );
        const inventory = await read<{
          capabilities: { tools: string[]; resources: string[] };
          protocolVersions: string[];
        }>('config/release.json');
        report.require(
          JSON.stringify(receipt.calls) === JSON.stringify(inventory.capabilities.tools) &&
            JSON.stringify(receipt.resources) === JSON.stringify(inventory.capabilities.resources),
          'Controlled calls do not cover inventory',
        );
        report.require(
          JSON.stringify(client.protocolVersions) === JSON.stringify(inventory.protocolVersions),
          'Controlled protocol claim differs',
        );
        const digests = receipt.runnerDigests as Record<string, unknown> | undefined;
        for (const path of [
          'scripts/test-codex-client.ts',
          'scripts/lib/codex-smoke.ts',
          'scripts/lib/client-flow.ts',
          'scripts/lib/install-guide.ts',
        ]) {
          const expected = `sha256:${createHash('sha256')
            .update(await readFile(resolve(repository, path)))
            .digest('hex')}`;
          report.require(
            digests?.[path] === expected,
            'Controlled runner changed without re-execution',
          );
        }
      } catch {
        report.require(false, 'Controlled receipt missing or malformed');
      }
    }
  }
  for (const claim of compatibility.claims.filter(
    (entry) => entry.dimension === 'client' && entry.support === 'supported',
  ))
    report.require(
      matrix.clients.some(
        (entry) => entry.status === 'supported' && entry.compatibilityClaim === claim.id,
      ),
      'Supported client omitted from smoke matrix',
    );
  return report;
}
