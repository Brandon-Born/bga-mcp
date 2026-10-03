import { GateReport } from './gate.js';

export function verifyPublicationWorkflow(source: string): GateReport {
  const report = new GateReport();
  report.require(
    !/persist-credentials: true|write-all/u.test(source),
    'Retained checkout credentials or unrestricted permissions are forbidden',
  );
  const header = source.slice(0, source.indexOf('\njobs:'));
  report.require(
    header.includes('\non:\n  workflow_dispatch:') &&
      !/\n {2}(?:push|pull_request|schedule|workflow_call):/u.test(header),
    'Publication must be manually dispatched only',
  );
  report.require(
    header.includes('options: [dry-run, publish]') && header.includes('default: dry-run'),
    'Dry run must be the default explicit mode',
  );
  report.require(
    header.includes('\npermissions:\n  contents: read\n') &&
      !/id-token:|contents: write|packages: write/u.test(header),
    'Global publication permission is forbidden',
  );
  report.require(
    source.includes('cancel-in-progress: false'),
    'Concurrent publication must not interrupt an immutable write',
  );
  report.require(
    !/NODE_AUTH_TOKEN|NPM_TOKEN|secrets\.|npm\s+(?:pack|stage|unpublish)|(?:pnpm|yarn)\s+publish/iu.test(
      source,
    ),
    'Publication workflow contains token fallback, rebuild or destructive recovery',
  );
  const starts = [...source.matchAll(/^ {2}([a-z]+):$/gmu)].filter(
    (match) => match.index > source.indexOf('\njobs:'),
  );
  report.require(
    starts.map((match) => match[1]).join(',') === 'prepare,publish,verify,promote',
    'Publication job graph differs',
  );
  for (const [index, match] of starts.entries()) {
    const name = match[1] ?? '',
      body = source.slice(match.index, starts[index + 1]?.index);
    report.require(
      body.includes("github.repository == 'Brandon-Born/bga-mcp'") &&
        body.includes("github.ref == 'refs/heads/main'"),
      `${name} must use trusted main`,
    );
    report.require(
      body.includes('ref: ${{ github.sha }}') && body.includes('persist-credentials: false'),
      `${name} checkout must bind workflow source without credentials`,
    );
    const privileged = name === 'publish' || name === 'promote';
    report.require(
      (body.match(/id-token: write/gu)?.length ?? 0) === (privileged ? 1 : 0),
      `${name} has incorrect identity permission`,
    );
    report.require(
      !/contents: write|packages: write|attestations: write/u.test(body),
      `${name} has unrelated write permission`,
    );
    if (privileged) {
      report.require(
        body.includes("inputs.mode == 'publish'") && body.includes('environment: npm-publication'),
        `${name} cannot mint identity in dry-run mode`,
      );
      report.require(
        !/pnpm install|npm ci|pnpm (?:build|check)|npm run|prepack/u.test(body),
        `${name} must not execute repository dependencies or rebuild`,
      );
      report.require(
        body.includes('npm@12.2.0') && body.includes('--ignore-scripts'),
        `${name} publisher tool/lifecycle policy differs`,
      );
      report.require(
        body.includes('EXPECTED_PLAN_DIGEST: ${{ needs.prepare.outputs.plan-digest }}'),
        `${name} lacks cross-job admission binding`,
      );
    }
    if (name === 'prepare')
      report.require(
        body.includes('pnpm check') &&
          body.includes('pnpm release:prepare') &&
          body.includes('BGA_MCP_SECURITY_SOURCE'),
        'Prepare lacks source audit/admission',
      );
    if (name === 'publish')
      report.require(
        body.includes('needs: prepare') && body.includes('scripts/publish-release.ts publish'),
        'Publish bypasses preparation',
      );
    if (name === 'verify')
      report.require(
        body.includes('needs: [prepare, publish]') && body.includes('pnpm release:consumer'),
        'Consumer bypasses successful publication',
      );
    if (name === 'promote')
      report.require(
        body.includes('needs: [prepare, verify]') &&
          body.includes('EXPECTED_CONSUMER_DIGEST: ${{ needs.verify.outputs.consumer-digest }}') &&
          body.includes('scripts/publish-release.ts promote'),
        'Promotion bypasses successful consumer verification',
      );
  }
  for (const match of source.matchAll(/uses: ([^\s#]+)/gu))
    report.require(
      /^[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+@[0-9a-f]{40}$/u.test(match[1] ?? ''),
      'Publication action must be SHA pinned',
    );
  return report;
}

export function verifyGitHubPublicationWorkflow(source: string): GateReport {
  const report = new GateReport(),
    header = source.slice(0, source.indexOf('\njobs:'));
  report.require(
    header.includes('\non:\n  workflow_dispatch:') &&
      !/\n {2}(?:push|pull_request|schedule|workflow_call):/u.test(header),
    'GitHub package publication must be manual',
  );
  report.require(
    header.includes('options: [dry-run, publish]') && header.includes('default: dry-run'),
    'GitHub dry run must be default',
  );
  report.require(
    header.includes('\npermissions:\n  contents: read\n') && !/write|id-token:/u.test(header),
    'No global writer permission',
  );
  report.require(
    source.includes('cancel-in-progress: false'),
    'Do not cancel an active publication',
  );
  report.require(
    !/persist-credentials: true|write-all|id-token:|packages: write|attestations: write|NODE_AUTH_TOKEN|NPM_TOKEN|secrets\.|--clobber|npm\s+(?:pack|publish|stage|unpublish)/iu.test(
      source,
    ),
    'GitHub publication forbids credential fallback, overwrite, rebuild and unrelated identity',
  );
  const starts = [...source.matchAll(/^ {2}([a-z]+):$/gmu)].filter(
    (match) => match.index > source.indexOf('\njobs:'),
  );
  report.require(
    starts.map((match) => match[1]).join(',') === 'prepare,publish,verify,retain',
    'GitHub job graph differs',
  );
  for (const [index, match] of starts.entries()) {
    const name = match[1] ?? '',
      body = source.slice(match.index, starts[index + 1]?.index);
    const writer = name === 'publish' || name === 'retain';
    report.require(
      body.includes("github.repository == 'Brandon-Born/bga-mcp'") &&
        body.includes("github.ref == 'refs/heads/main'"),
      `${name} must bind trusted main`,
    );
    report.require(
      body.includes('ref: ${{ github.sha }}') && body.includes('persist-credentials: false'),
      `${name} must bind source without checkout credentials`,
    );
    report.require(
      (body.match(/contents: write/gu)?.length ?? 0) === (writer ? 1 : 0),
      `${name} writer permission differs`,
    );
    if (writer) {
      report.require(
        body.includes("inputs.mode == 'publish'") && body.includes('GH_TOKEN: ${{ github.token }}'),
        `${name} must isolate the ephemeral write token from dry runs`,
      );
      report.require(
        !/pnpm install|npm (?:install|ci)|pnpm (?:check|build)|npm run|prepack/u.test(body),
        `${name} cannot execute dependencies or rebuild`,
      );
      report.require(
        body.includes('EXPECTED_PLAN_DIGEST: ${{ needs.prepare.outputs.plan-digest }}'),
        `${name} must bind admission output`,
      );
    } else if (name === 'verify') {
      report.require(
        !/GH_TOKEN|GITHUB_TOKEN/u.test(body) &&
          body.includes('needs: [prepare, publish]') &&
          body.includes('node --import tsx scripts/verify-github-consumer.ts'),
        'Consumer must follow publication without tokens',
      );
    } else if (name === 'prepare') {
      report.require(
        body.includes('pnpm check') &&
          body.includes('pnpm release:prepare') &&
          body.includes('BGA_MCP_SECURITY_SOURCE'),
        'Read-only preparation requires source audit/admission',
      );
    }
    if (name === 'publish')
      report.require(
        body.includes('needs: prepare') &&
          body.includes('scripts/publish-github-release.ts publish'),
        'Writer cannot bypass preparation',
      );
    if (name === 'retain')
      report.require(
        body.includes('needs: [prepare, verify]') &&
          body.includes('EXPECTED_CONSUMER_DIGEST: ${{ needs.verify.outputs.consumer-digest }}') &&
          body.includes('scripts/publish-github-release.ts retain'),
        'Success receipt retention requires verified consumer output',
      );
  }
  for (const match of source.matchAll(/uses: ([^\s#]+)/gu))
    report.require(
      /^[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+@[0-9a-f]{40}$/u.test(match[1] ?? ''),
      'GitHub publication actions must be pinned',
    );
  return report;
}
