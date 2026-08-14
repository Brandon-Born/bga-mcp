import { z } from 'zod';

export const RELEASE_PROFILE = 'first-local-only' as const;

const releaseInventorySchema = z.strictObject({
  $schema: z.literal('./release.schema.json'),
  schemaVersion: z.literal(1),
  id: z.literal(RELEASE_PROFILE),
  status: z.enum(['implemented', 'verified']),
  environment: z.literal('local'),
  entrypoint: z.literal('dist/release-cli.js'),
  protocolVersions: z.array(z.literal('2025-11-25')).min(1),
  transports: z.array(z.literal('stdio')).min(1),
  capabilities: z.strictObject({
    tools: z.array(z.string().min(1)),
    resources: z.array(z.string().min(1)),
    prompts: z.array(z.string().min(1)),
  }),
  adapters: z.array(z.string().min(1)),
  consumers: z.array(
    z.enum([
      'candidate-manifest',
      'mcp-discovery',
      'public-documentation',
      'security-review',
      'verification-evidence',
    ]),
  ),
  requiredScenarios: z.array(z.string().min(1)).min(1),
});

export type ReleaseInventory = z.infer<typeof releaseInventorySchema>;
export type ServerProfile = 'development' | typeof RELEASE_PROFILE;
export type ReleaseCapabilityKind = keyof ReleaseInventory['capabilities'];
interface ReleaseSelection {
  readonly capabilities: Readonly<Record<ReleaseCapabilityKind, readonly string[]>>;
}

/** Parses the packaged inventory before it is allowed to control discovery. */
export function parseReleaseInventory(value: unknown): ReleaseInventory {
  return releaseInventorySchema.parse(value);
}

/** The inventory is the allowlist: a release capability exists only when it is named here. */
export function releaseIncludes(
  inventory: ReleaseSelection | undefined,
  kind: ReleaseCapabilityKind,
  name: string,
): boolean {
  return inventory === undefined || inventory.capabilities[kind].includes(name);
}
