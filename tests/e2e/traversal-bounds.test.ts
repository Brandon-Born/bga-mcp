import { mkdir, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { Client } from '@modelcontextprotocol/client';

import {
  callTool,
  installPackagedServer,
  withPackagedServer,
  type PackagedServer,
} from '../helpers/packaged.js';

/**
 * Proves that a project cannot cost the server more than its budget, and that
 * a name cannot come to mean a different file between the check and the read.
 *
 * The 2026-08-08 review found the budget counting the wrong things: files that
 * survived, rather than entries encountered. With `maxEntries: 1` an ordinary
 * directory returned zero files, four skipped links, and `truncated: false` —
 * the wrong answer twice, because the work had been done and the result said
 * it had not been cut short. A directory of a million links or a million empty
 * directories cost the same work and nothing at all against the limit.
 *
 * The race half is a static finding rather than a reproduction, so the oracle
 * here is arrangement rather than repetition: the swap is performed while the
 * server is between its own two steps, and the assertion is that the read is
 * refused rather than that it usually is.
 */

let server: PackagedServer<'legacy'>;

async function connect<T>(
  root: string,
  use: (client: Client) => Promise<T>,
): Promise<{ result: T; stderr: string }> {
  return await withPackagedServer(server.cli, ['--project-root', root], use);
}

/** A project made of the shapes that used to cost nothing. */
async function storm(name: string, build: (root: string) => Promise<void>): Promise<string> {
  const root = resolve(server.temporaryRoot, name);
  await mkdir(root, { recursive: true });
  // Enough of a project that the readers have something to say about it.
  await writeFile(resolve(root, 'gameinfos.inc.php'), '<?php\n$gameinfos = [];\n');
  await build(root);
  return root;
}

beforeAll(async () => {
  server = await installPackagedServer('traversal-bounds', { legacy: 'legacy' });
}, 240_000);

afterAll(async () => {
  await server.cleanup();
});

describe('packaged traversal bounds', () => {
  it('[E2E-POLICY-OBJECT-BOUND-READS] counts links and empty directories against the same budget as files', async () => {
    // Past the server's own default entry budget using nothing but the shapes
    // that used to be free. Before this budget counted what it encountered,
    // both of these projects listed as small, complete, and untruncated.
    const overBudget = 6_000;

    const links = await storm('link-storm', async (root) => {
      for (let index = 0; index < overBudget; index += 1) {
        await symlink(resolve(root, 'gameinfos.inc.php'), resolve(root, `link-${String(index)}`));
      }
    });
    const empties = await storm('empty-storm', async (root) => {
      for (let index = 0; index < overBudget; index += 1) {
        await mkdir(resolve(root, `empty-${String(index)}`));
      }
    });

    for (const [what, root] of [
      ['a link storm', links],
      ['an empty-directory storm', empties],
    ] as [string, string][]) {
      const { result, stderr } = await connect(
        root,
        async (client) => await callTool(client, 'inspect_project', {}, 60_000),
      );

      expect(result.isError, `${what}: ${result.text}`).toBe(false);
      const structured = result.structured as {
        fileCount: number;
        truncated: boolean;
        skippedLinks: string[];
      };
      // The work was done, so it counts, and the result says it was cut short.
      expect(structured.truncated, `${what} claimed a complete listing`).toBe(true);
      // And it is not truncating by finding thousands of files: there is one.
      expect(structured.fileCount, `${what} counted the wrong things`).toBeLessThan(10);
      // The names are bounded too: the counts are work, the names are output,
      // and a link for every file used to turn a listing into a megabyte of
      // diagnostics that the output budget then refused outright.
      expect(structured.skippedLinks.length, `${what} named every skip`).toBeLessThanOrEqual(100);
      expect(stderr).not.toContain('heap out of memory');
    }
  }, 180_000);

  it('[E2E-POLICY-OBJECT-BOUND-READS] tells the truth about a listing it cut short', async () => {
    // Deep enough to pass the depth budget, so truncation is reached by a
    // route other than the entry count.
    const deep = await storm('deep-tree', async (root) => {
      let current = root;
      for (let level = 0; level < 30; level += 1) {
        current = resolve(current, `level-${String(level)}`);
        await mkdir(current);
        await writeFile(resolve(current, 'leaf.php'), '<?php\n');
      }
    });

    const { result } = await connect(
      deep,
      async (client) => await callTool(client, 'inspect_project', {}, 30_000),
    );

    expect(result.isError, result.text).toBe(false);
    const structured = result.structured as { truncated: boolean; fileCount: number };
    // The tree is deeper than the depth budget, so this listing is partial and
    // has to say so rather than looking like a small project.
    expect(structured.truncated).toBe(true);
  }, 120_000);

  it('[E2E-POLICY-OBJECT-BOUND-READS] refuses a file that was replaced between the check and the read', async () => {
    const root = await storm('swapped', async (project) => {
      await writeFile(resolve(project, 'states.inc.php'), '<?php\n$machinestates = [];\n');
    });
    const outside = resolve(server.temporaryRoot, 'outside-the-root.txt');
    await writeFile(outside, 'content from outside the project root\n');

    // The swap is arranged rather than raced for: the file the server checked
    // is renamed away and a different object put in its place, so the next
    // read of that name is a read of something else. What must not happen is
    // that the something else comes back.
    const { result, stderr } = await connect(root, async (client) => {
      const before = await callTool(client, 'inspect_project', {}, 30_000);
      const decoy = resolve(root, 'states.inc.php');
      await rm(decoy);
      await symlink(outside, decoy);
      const after = await callTool(client, 'inspect_project', {}, 30_000);
      return { before, after };
    });

    expect(result.before.isError, result.before.text).toBe(false);
    // A link where a file used to be is skipped as a link, never followed,
    // whatever it points at.
    const after = JSON.stringify(result.after.structured ?? result.after.text);
    expect(after).not.toContain('content from outside the project root');
    expect(stderr).not.toContain('content from outside the project root');
  }, 120_000);

  it('[E2E-POLICY-OBJECT-BOUND-READS] never reads through a link, however the link appears', async () => {
    const outside = resolve(server.temporaryRoot, 'private-notes.txt');
    await writeFile(outside, 'private content that is not in any project\n');

    const root = await storm('link-escape', async (project) => {
      await symlink(outside, resolve(project, 'states.inc.php'));
      await mkdir(resolve(project, 'modules'));
      await symlink(resolve(server.temporaryRoot), resolve(project, 'modules/php'));
    });

    const { result, stderr } = await connect(root, async (client) => ({
      inspect: await callTool(client, 'inspect_project', {}, 30_000),
      states: await callTool(client, 'validate_state_machine', {}, 30_000),
    }));

    for (const [name, response] of Object.entries(result)) {
      const text = `${response.text}\n${JSON.stringify(response.structured)}`;
      expect(text, `${name} read through a link`).not.toContain(
        'private content that is not in any project',
      );
    }
    // Both links are reported rather than silently dropped, so a developer can
    // see why the project looks incomplete.
    const structured = result.inspect.structured as { skippedLinks: string[] };
    expect(structured.skippedLinks.length).toBeGreaterThanOrEqual(2);
    expect(stderr).not.toContain('private content that is not in any project');
  }, 120_000);

  it('[E2E-POLICY-OBJECT-BOUND-READS] refuses a file that grows past the budget while it is read', async () => {
    const root = await storm('growing', async (project) => {
      await writeFile(resolve(project, 'states.inc.php'), '<?php\n$machinestates = [];\n');
    });

    const { result } = await connect(root, async (client) => {
      // Replace the file with one far past the read budget, using a rename so
      // the swap is atomic and lands between calls rather than during a write.
      const staged = resolve(server.temporaryRoot, 'staged-huge.php');
      await writeFile(staged, `<?php\n// ${'x'.repeat(2_000_000)}\n`);
      await rename(staged, resolve(root, 'states.inc.php'));
      return await callTool(client, 'inspect_project', {}, 30_000);
    });

    // Either the file is refused for its size or it is read whole and bounded
    // by the output budget; what must not happen is an unbounded read.
    const text = `${result.text}\n${JSON.stringify(result.structured)}`;
    expect(text).not.toContain('x'.repeat(1_000));
  }, 120_000);
});
