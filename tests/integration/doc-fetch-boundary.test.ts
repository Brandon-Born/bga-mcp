import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ERROR_CODES } from '../../src/errors.js';
import { createPolicyBoundary, type PolicyBoundary } from '../../src/policy.js';

const SOURCE_ID = 'bga-studio-framework-reference';

async function boundary(
  overrides: Parameters<typeof createPolicyBoundary>[0] = {},
): Promise<PolicyBoundary> {
  return await createPolicyBoundary({ networkEnabled: true, ...overrides });
}

async function refusal(
  policy: PolicyBoundary,
  request: Parameters<PolicyBoundary['fetchDocumentation']>[0],
): Promise<{ code: string; message: string }> {
  try {
    await policy.fetchDocumentation(request);
  } catch (error) {
    const failure = error as { code?: string; message?: string };
    return { code: failure.code ?? 'none', message: failure.message ?? '' };
  }
  throw new Error('The documentation fetch was expected to be refused');
}

describe('guarded documentation fetch', () => {
  it('[INT-DOC-NETWORK-OFF] refuses before resolving anything when the network is off', async () => {
    // The default. Nothing about a documentation request may weaken it.
    const policy = await createPolicyBoundary({});
    const result = await refusal(policy, { sourceId: SOURCE_ID, path: 'Studio' });

    expect(result.code).toBe(ERROR_CODES.policyNetworkDisabled);
    expect(result.message).toContain('--allow-network');
  });

  it('[INT-DOC-HOST-ALLOWLIST] refuses a source that is not in the reviewed catalog', async () => {
    const policy = await boundary();

    const unknown = await refusal(policy, { sourceId: 'some-blog', path: 'post' });
    expect(unknown.code).toBe(ERROR_CODES.policyDocSourceNotAllowed);

    // The caller names a source and a page, never a host, so there is no input
    // that can point the request somewhere else.
    const escaped = await refusal(policy, {
      sourceId: SOURCE_ID,
      path: '//evil.example/Studio',
    });
    expect(escaped.code).toBe(ERROR_CODES.policyDocSourceNotAllowed);

    const traversal = await refusal(policy, { sourceId: SOURCE_ID, path: '../../etc/passwd' });
    expect(traversal.code).toBe(ERROR_CODES.policyDocSourceNotAllowed);

    const injected = await refusal(policy, { sourceId: SOURCE_ID, path: 'Studio\nHost: evil' });
    expect(injected.code).toBe(ERROR_CODES.policyDocSourceNotAllowed);
  });

  it('[INT-DOC-REQUEST-CONTENT] refuses a query built from the developer project', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'bga-mcp-doc-'));
    try {
      await writeFile(join(projectRoot, 'gameinfos.inc.php'), '<?php\n$gameinfos = [];\n');
      const policy = await boundary({ projectRoots: [projectRoot] });

      const pasted = await refusal(policy, {
        sourceId: SOURCE_ID,
        path: 'index.php',
        query: '<?php class Game extends Table {',
      });
      expect(pasted.code).toBe(ERROR_CODES.policyDocRequestContent);
      expect(pasted.message).toContain('copied out of a file');

      const leaked = await refusal(policy, {
        sourceId: SOURCE_ID,
        path: 'index.php',
        query: `why does ${projectRoot} fail`,
      });
      expect(leaked.code).toBe(ERROR_CODES.policyDocRequestContent);
      expect(leaked.message).toContain('filesystem path');
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('[INT-DOC-REQUEST-CONTENT] refuses an oversized or unreadable query', async () => {
    const policy = await boundary();

    const long = await refusal(policy, {
      sourceId: SOURCE_ID,
      path: 'index.php',
      query: 'a'.repeat(500),
    });
    expect(long.code).toBe(ERROR_CODES.policyDocRequestContent);

    const control = await refusal(policy, {
      sourceId: SOURCE_ID,
      path: 'index.php',
      query: 'line one\nline two',
    });
    expect(control.code).toBe(ERROR_CODES.policyDocRequestContent);
  });

  it('[INT-DOC-HOST-ALLOWLIST] reads its allowlist from the reviewed catalog', async () => {
    const policy = await boundary();
    const catalog = JSON.parse(await policy.readPackagedConfig('doc-sources.json')) as {
      sources: { id: string; host: string; canonicalUrl: string }[];
    };

    // The boundary has no hosts of its own: every one it will reach is a
    // reviewed entry, and every entry is HTTPS.
    expect(catalog.sources.length).toBeGreaterThan(0);
    expect(catalog.sources.some((source) => source.id === SOURCE_ID)).toBe(true);
    for (const source of catalog.sources) {
      expect(source.canonicalUrl.startsWith('https://')).toBe(true);
      expect(new URL(source.canonicalUrl).hostname).toBe(source.host);
    }
  });
});
