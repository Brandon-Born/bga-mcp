/**
 * Tolerant readers for the metadata and state formats BGA projects use.
 *
 * Every reader here is textual: it recognizes the documented shapes and
 * reports what it could not understand instead of guessing. A caller must
 * treat an empty result as "not proven", never as "not present".
 */

export interface ParseOutcome<T> {
  readonly value: T;
  /** Constructs the reader recognized but could not interpret. */
  readonly unsupported: readonly string[];
}

/** Strips comments and trailing commas so BGA's JSONC metadata can be parsed. */
export function parseJsonc(source: string): unknown {
  let result = '';
  let index = 0;
  let inString = false;
  let escaped = false;

  while (index < source.length) {
    const character = source[index] ?? '';
    const next = source[index + 1] ?? '';

    if (inString) {
      result += character;
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      index += 1;
      continue;
    }

    if (character === '"') {
      inString = true;
      result += character;
      index += 1;
      continue;
    }

    if (character === '/' && next === '/') {
      while (index < source.length && source[index] !== '\n') {
        index += 1;
      }
      continue;
    }

    if (character === '/' && next === '*') {
      index += 2;
      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) {
        index += 1;
      }
      index += 2;
      continue;
    }

    result += character;
    index += 1;
  }

  return JSON.parse(result.replace(/,(\s*[}\]])/gu, '$1')) as unknown;
}

export interface GameMetadata {
  readonly gameName: string | null;
  readonly playerCounts: readonly number[];
}

/** Reads `gameinfos.json` or `gameinfos.jsonc`. */
export function parseModernMetadata(source: string): ParseOutcome<GameMetadata> {
  let parsed: unknown;
  try {
    parsed = parseJsonc(source);
  } catch {
    return { value: { gameName: null, playerCounts: [] }, unsupported: ['unparsable JSON object'] };
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { value: { gameName: null, playerCounts: [] }, unsupported: ['non-object metadata'] };
  }

  const record = parsed as { game_name?: unknown; player_numbers?: unknown; players?: unknown };
  const gameName = typeof record.game_name === 'string' ? record.game_name : null;
  const counts = record.player_numbers ?? record.players;
  const playerCounts = Array.isArray(counts)
    ? counts.filter(
        (entry): entry is number => typeof entry === 'number' && Number.isInteger(entry),
      )
    : [];
  const unsupported: string[] = [];
  if (gameName === null) {
    unsupported.push('missing or non-string game_name');
  }
  if (counts !== undefined && playerCounts.length === 0) {
    unsupported.push('unreadable player count list');
  }
  return { value: { gameName, playerCounts }, unsupported };
}

/** Reads `gameinfos.inc.php`, which is PHP source rather than data. */
export function parseLegacyMetadata(source: string): ParseOutcome<GameMetadata> {
  const unsupported: string[] = [];
  const name = /'game_name'\s*=>\s*'([^']*)'/u.exec(source)?.[1] ?? null;
  if (name === null) {
    unsupported.push("no literal 'game_name' assignment");
  }

  const playersBlock = /'players'\s*=>\s*(?:array\s*\(|\[)([^)\]]*)/u.exec(source)?.[1] ?? '';
  const playerCounts = [...playersBlock.matchAll(/\d+/gu)].map((match) => Number(match[0]));
  if (playersBlock === '') {
    unsupported.push("no literal 'players' list");
  }

  return { value: { gameName: name, playerCounts }, unsupported };
}

export interface StateDefinition {
  readonly id: number;
  readonly name: string | null;
  readonly type: string | null;
  readonly action: string | null;
  readonly possibleActions: readonly string[];
  readonly transitions: Readonly<Record<string, number>>;
}

function splitTopLevelEntries(body: string): string[] {
  const entries: string[] = [];
  let depth = 0;
  let current = '';
  let inString: string | null = null;

  for (let index = 0; index < body.length; index += 1) {
    const character = body[index] ?? '';
    if (inString !== null) {
      current += character;
      if (character === inString && body[index - 1] !== '\\') {
        inString = null;
      }
      continue;
    }
    if (character === "'" || character === '"') {
      inString = character;
      current += character;
      continue;
    }
    if (character === '[' || character === '(') {
      depth += 1;
    } else if (character === ']' || character === ')') {
      depth -= 1;
      if (depth < 0) {
        break;
      }
    }
    if (character === ',' && depth === 0) {
      entries.push(current);
      current = '';
      continue;
    }
    current += character;
  }

  if (current.trim() !== '') {
    entries.push(current);
  }
  return entries;
}

/**
 * Reads the `$machinestates` array from `states.inc.php`.
 *
 * The array is PHP source, so this reader recognizes literal declarations and
 * reports every entry it cannot interpret. Computed keys, constants, and
 * included states are surfaced as unsupported rather than dropped.
 */
export function parseLegacyStates(source: string): ParseOutcome<readonly StateDefinition[]> {
  const unsupported: string[] = [];
  const start = /\$machinestates\s*=\s*(?:array\s*\(|\[)/u.exec(source);
  if (start === null) {
    return { value: [], unsupported: ['no literal $machinestates assignment'] };
  }

  const body = source.slice(start.index + start[0].length);
  const states: StateDefinition[] = [];

  for (const entry of splitTopLevelEntries(body)) {
    if (entry.trim() === '') {
      continue;
    }
    const key = /^\s*([^=\s]+)\s*=>/u.exec(entry)?.[1];
    if (key === undefined) {
      continue;
    }
    if (!/^\d+$/u.test(key)) {
      unsupported.push(`non-literal state key ${key.trim()}`);
      continue;
    }

    const transitions: Record<string, number> = {};
    const transitionBlock =
      /'transitions'\s*=>\s*(?:array\s*\(|\[)([\s\S]*?)(?:\]|\))/u.exec(entry)?.[1] ?? '';
    for (const match of transitionBlock.matchAll(/'([^']*)'\s*=>\s*(\d+)/gu)) {
      transitions[match[1] ?? ''] = Number(match[2]);
    }
    if (transitionBlock !== '' && /=>\s*[A-Za-z_]/u.test(transitionBlock)) {
      unsupported.push(`non-literal transition target in state ${key}`);
    }

    const possibleBlock =
      /'possibleactions'\s*=>\s*(?:array\s*\(|\[)([\s\S]*?)(?:\]|\))/u.exec(entry)?.[1] ?? '';

    states.push({
      id: Number(key),
      name: /'name'\s*=>\s*'([^']*)'/u.exec(entry)?.[1] ?? null,
      type: /'type'\s*=>\s*'([^']*)'/u.exec(entry)?.[1] ?? null,
      action: /'action'\s*=>\s*'([^']*)'/u.exec(entry)?.[1] ?? null,
      possibleActions: [...possibleBlock.matchAll(/'([^']+)'/gu)].map((match) => match[1] ?? ''),
      transitions,
    });
  }

  if (states.length === 0 && unsupported.length === 0) {
    unsupported.push('no literal state entries');
  }
  return { value: states, unsupported };
}
