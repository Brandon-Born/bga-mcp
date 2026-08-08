import type { McpServer } from '@modelcontextprotocol/server';

/**
 * Asks the developer for a missing setting instead of refusing with homework.
 *
 * A capability that says "start the server with --studio-dev-account" is asking
 * someone to leave, edit a launcher configuration, and come back. When the
 * client can put a question in front of them, asking is better.
 *
 * Two rules keep this from becoming a nuisance. Declining is a real answer: the
 * capability refuses cleanly and nothing asks again for the rest of the
 * session. And a client that cannot ask is not a client that fails — it gets
 * the refusal it would have got anyway.
 *
 * Secrets are deliberately out of scope. An elicited value still crosses the
 * client, and whether it lands in a transcript is the client's property rather
 * than this server's, so the Studio session keeps coming from the environment
 * until that question is reviewed.
 */

export type AskOutcome =
  | { readonly kind: 'answered'; readonly values: readonly string[] }
  | { readonly kind: 'declined' }
  | { readonly kind: 'unsupported' };

/** Remembers a decline, so a developer who says no is not asked twice. */
export class SetupAsker {
  readonly #declined = new Set<string>();
  readonly #era: 'legacy' | 'modern';

  constructor(era: 'legacy' | 'modern' = 'legacy') {
    this.#era = era;
  }

  get declinedAnything(): boolean {
    return this.#declined.size > 0;
  }

  hasDeclined(question: string): boolean {
    return this.#declined.has(question);
  }

  /**
   * Asks for a list of names.
   *
   * Only the 2025 era can be asked this way: on 2026-07-28 elicitation moved
   * into the multi-round-trip input-required flow, which a capability has to
   * return rather than await, and the SDK throws if asked to push. That era
   * keeps the refusal until the flow is built.
   */
  async askForList(
    server: McpServer,
    question: string,
    message: string,
    field: string,
  ): Promise<AskOutcome> {
    if (this.#era !== 'legacy' || this.#declined.has(question)) {
      return { kind: 'unsupported' };
    }

    // eslint-disable-next-line @typescript-eslint/no-deprecated -- deprecated on the 2026 era only; this branch is legacy-only by construction
    const capabilities = server.server.getClientCapabilities();
    if (capabilities?.elicitation === undefined) {
      return { kind: 'unsupported' };
    }

    let result;
    try {
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- same: a wire request on the era this branch serves
      result = await server.server.elicitInput({
        message,
        requestedSchema: {
          type: 'object',
          properties: {
            [field]: {
              type: 'string',
              description: 'Separate several with commas.',
            },
          },
          required: [field],
        },
      });
    } catch {
      // A client that says it can ask and then cannot is a client that cannot.
      return { kind: 'unsupported' };
    }

    if (result.action !== 'accept') {
      // Declining is an answer, and it is remembered.
      this.#declined.add(question);
      return { kind: 'declined' };
    }

    const raw = (result.content as Record<string, unknown> | undefined)?.[field];
    const values = typeof raw === 'string' ? splitList(raw) : [];
    if (values.length === 0) {
      this.#declined.add(question);
      return { kind: 'declined' };
    }
    return { kind: 'answered', values };
  }
}

/** Splits a typed list, tolerating the separators people actually use. */
export function splitList(value: string): readonly string[] {
  return [
    ...new Set(
      value
        .split(/[,;\n]/u)
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    ),
  ];
}
