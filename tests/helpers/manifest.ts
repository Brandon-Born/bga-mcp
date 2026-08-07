import { Ajv2020 } from 'ajv/dist/2020.js';

export interface RuntimeDiscovery {
  readonly server: { readonly name: string; readonly version: string };
  readonly tools: readonly string[];
  readonly resources: readonly string[];
  readonly prompts: readonly string[];
}

interface ManifestCapability {
  readonly name: string;
  readonly requiredScenarios: readonly string[];
}

interface Manifest {
  readonly server: { readonly name: string; readonly version: string };
  readonly capabilities: {
    readonly tools: readonly ManifestCapability[];
    readonly resources: readonly ManifestCapability[];
    readonly prompts: readonly ManifestCapability[];
  };
  readonly transports: readonly { readonly name: string }[];
  readonly adapters: readonly { readonly name: string }[];
}

export function validateManifestSchema(schema: object, manifest: unknown): void {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);
  if (!validate(manifest)) {
    throw new Error(`Invalid capability manifest: ${ajv.errorsText(validate.errors)}`);
  }
}

export function assertManifestMatchesRuntime(manifest: Manifest, runtime: RuntimeDiscovery): void {
  if (
    manifest.server.name !== runtime.server.name ||
    manifest.server.version !== runtime.server.version
  ) {
    throw new Error('Manifest server identity differs from runtime discovery');
  }

  for (const [kind, names] of [
    ['transports', manifest.transports.map((transport) => transport.name)],
    ['adapters', manifest.adapters.map((adapter) => adapter.name)],
  ] as const) {
    if (new Set(names).size !== names.length) {
      throw new Error(`Manifest has duplicate ${kind}`);
    }
  }

  for (const kind of ['tools', 'resources', 'prompts'] as const) {
    const manifestNames = manifest.capabilities[kind].map((capability) => capability.name).sort();
    if (new Set(manifestNames).size !== manifestNames.length) {
      throw new Error(`Manifest has duplicate ${kind}`);
    }
    // A templated resource is one manifest capability that discovery lists once
    // per instance, so every instance is folded back onto its template before
    // the sets are compared. Anything that matches no template is compared as
    // itself, so an unadvertised capability is still caught.
    const templates = manifestNames.filter((name) => name.includes('{'));
    const runtimeNames = [
      ...new Set(
        [...runtime[kind]].map((name) => {
          const template = templates.find((candidate) =>
            name.startsWith(candidate.slice(0, candidate.indexOf('{'))),
          );
          return template ?? name;
        }),
      ),
    ].sort();
    if (JSON.stringify(manifestNames) !== JSON.stringify(runtimeNames)) {
      throw new Error(
        `Manifest ${kind} differ from runtime discovery (manifest: ${manifestNames.join(', ')}; runtime: ${runtimeNames.join(', ')})`,
      );
    }
  }
}
