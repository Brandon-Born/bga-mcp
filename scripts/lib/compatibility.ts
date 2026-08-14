export type CapabilityKind = 'tools' | 'resources' | 'prompts';

export type CompatibilityDimension =
  | 'layout'
  | 'environment'
  | 'file-generation'
  | 'runtime'
  | 'platform'
  | 'protocol'
  | 'transport'
  | 'client';

export interface CompatibilityClaim {
  readonly id: string;
  readonly dimension: CompatibilityDimension;
  readonly value: string;
  readonly support: 'supported' | 'unsupported' | 'unknown';
  readonly notes: string;
  readonly fixtures?: readonly string[];
  readonly scenarios?: readonly string[];
  readonly capabilities?: readonly {
    readonly reference: string;
    readonly scenarios: readonly string[];
  }[];
}

export interface CompatibilityMatrix {
  readonly claims: readonly CompatibilityClaim[];
}

export interface ManifestCapabilityCompatibility {
  readonly name: string;
  readonly supportedLayouts: readonly string[];
  readonly environments: readonly string[];
  readonly protocolVersions: readonly string[];
  readonly requiredScenarios: readonly string[];
}

export interface CapabilityCompatibilityManifest {
  readonly capabilities: Record<CapabilityKind, readonly ManifestCapabilityCompatibility[]>;
}

const capabilityKinds: readonly CapabilityKind[] = ['tools', 'resources', 'prompts'];

const comparedDimensions = [
  ['layout', 'supportedLayouts'],
  ['environment', 'environments'],
  ['protocol', 'protocolVersions'],
] as const;

function singular(kind: CapabilityKind): 'tool' | 'resource' | 'prompt' {
  if (kind === 'tools') return 'tool';
  if (kind === 'resources') return 'resource';
  return 'prompt';
}

export function capabilityReference(kind: CapabilityKind, name: string): string {
  return `${singular(kind)}:${name}`;
}

function sorted(values: Iterable<string>): string[] {
  return [...values].sort();
}

/**
 * Compares each public capability with the compatibility claims that explicitly
 * apply to it. The applicability list is independent of the manifest field, so
 * deleting support from the manifest cannot redefine the expected answer.
 */
export function capabilityCompatibilityFailures(
  matrix: CompatibilityMatrix,
  manifest: CapabilityCompatibilityManifest,
): string[] {
  const failures: string[] = [];
  const entries = new Map<string, ManifestCapabilityCompatibility>();

  for (const kind of capabilityKinds) {
    for (const capability of manifest.capabilities[kind]) {
      const reference = capabilityReference(kind, capability.name);
      if (entries.has(reference)) {
        failures.push(`Capability reference ${reference} is declared more than once`);
      }
      entries.set(reference, capability);
    }
  }

  for (const claim of matrix.claims) {
    const seen = new Set<string>();
    for (const applicability of claim.capabilities ?? []) {
      const { reference } = applicability;
      if (seen.has(reference)) {
        failures.push(`${claim.id} maps ${reference} more than once`);
      }
      seen.add(reference);
      if (!entries.has(reference)) {
        failures.push(`${claim.id} references unknown capability ${reference}`);
        continue;
      }
      const capability = entries.get(reference);
      for (const scenario of applicability.scenarios) {
        if (!(claim.scenarios ?? []).includes(scenario)) {
          failures.push(
            `${claim.id} maps ${reference} to ${scenario}, but the claim does not require it`,
          );
        }
        if (!(capability?.requiredScenarios ?? []).includes(scenario)) {
          failures.push(
            `${claim.id} maps ${reference} to ${scenario}, but the capability does not require it`,
          );
        }
      }
      if (!applicability.scenarios.some((scenario) => scenario.startsWith('E2E-'))) {
        failures.push(`${claim.id} has no packaged E2E evidence for ${reference}`);
      }
    }
    if (claim.support !== 'supported' && (claim.capabilities?.length ?? 0) > 0) {
      failures.push(`${claim.id} is ${claim.support} and may not apply to public capabilities`);
    }

    if (
      claim.support === 'supported' &&
      comparedDimensions.some(([dimension]) => dimension === claim.dimension)
    ) {
      const claimScenarios = new Set(claim.scenarios ?? []);
      for (const [reference, capability] of entries) {
        const sharedEvidence = sorted(
          capability.requiredScenarios.filter((scenario) => claimScenarios.has(scenario)),
        );
        const mappedEvidence = sorted(
          claim.capabilities?.find((entry) => entry.reference === reference)?.scenarios ?? [],
        );
        if (JSON.stringify(sharedEvidence) !== JSON.stringify(mappedEvidence)) {
          failures.push(
            `${claim.id} mapping for ${reference} disagrees with their shared required scenarios ` +
              `(mapped: ${mappedEvidence.join(', ') || 'none'}; shared: ${sharedEvidence.join(', ') || 'none'})`,
          );
        }
      }
    }
  }

  for (const [reference, capability] of entries) {
    for (const [dimension, field] of comparedDimensions) {
      const expected = sorted(
        matrix.claims
          .filter(
            (claim) =>
              claim.dimension === dimension &&
              claim.support === 'supported' &&
              (claim.capabilities ?? []).some(
                (applicability) => applicability.reference === reference,
              ),
          )
          .map((claim) => claim.value),
      );
      const actual = sorted(capability[field]);
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        failures.push(
          `${reference} ${field} disagree with applicable supported ${dimension} claims ` +
            `(manifest: ${actual.join(', ') || 'none'}; compatibility: ${expected.join(', ') || 'none'})`,
        );
      }
    }
  }

  return failures;
}
