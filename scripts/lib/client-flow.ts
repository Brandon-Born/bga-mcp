import assert from 'node:assert/strict';

export interface SmokeClient {
  listTools(): Promise<string[]>;
  listResources(): Promise<string[]>;
  callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ isError?: boolean | null | undefined; structuredContent?: unknown }>;
  readResource(uri: string): Promise<{ contents: unknown[] }>;
}

/** The same observable flow for reference and native clients; no model-generated assertion counts as evidence. */
export async function exerciseClientFlow(
  client: SmokeClient,
  inventory: { tools: string[]; resources: string[] },
  project: string,
  outside: string,
  layout: string,
) {
  assert.deepEqual((await client.listTools()).sort(), [...inventory.tools].sort());
  assert.deepEqual((await client.listResources()).sort(), [...inventory.resources].sort());
  const calls: string[] = [];
  for (const tool of inventory.tools) {
    const response = await client.callTool(tool, { projectRoot: project });
    assert.notEqual(response.isError, true, `${tool} failed`);
    assert.equal((response.structuredContent as { schemaVersion?: unknown }).schemaVersion, 1);
    if (tool === 'inspect_project')
      assert.equal((response.structuredContent as { layout: string }).layout, layout);
    calls.push(tool);
  }
  for (const uri of inventory.resources)
    assert((await client.readResource(uri)).contents.length > 0);
  const refused = async (name: string, args: Record<string, unknown>, pattern?: RegExp) => {
    let result: unknown;
    try {
      result = await client.callTool(name, args);
    } catch (error) {
      result = error instanceof Error ? { isError: true, message: error.message } : error;
    }
    assert.equal((result as { isError?: unknown }).isError, true, `${name} accepted refused input`);
    if (pattern) assert.match(JSON.stringify(result), pattern);
  };
  await refused('inspect_project', { projectRoot: 42 });
  await refused('inspect_project', { projectRoot: outside }, /policy\.root\.not-allowed/u);
  await refused('check_setup', {});
  return {
    discovery: 'matched installed inventory',
    calls,
    resources: [...inventory.resources],
    schemaRefusal: true,
    outsideRootRefusal: true,
    excludedToolRefusal: true,
  };
}
