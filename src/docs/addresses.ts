/**
 * Decides whether a resolved address may be connected to.
 *
 * A host allowlist alone does not prevent a request into the developer's own
 * network: an allowlisted name can resolve to `127.0.0.1` or to a private
 * range, whether by accident, by a hostile DNS answer, or by an attacker who
 * controls a record. The check therefore happens on the address, after
 * resolution, and the connection is pinned to the address that was checked.
 *
 * The decision is made on the parsed address, never on how it was written.
 * `127.0.0.1` has many spellings — `::ffff:7f00:1`, `::ffff:127.0.0.1`,
 * `0:0:0:0:0:ffff:7f00:0001`, `::7f00:1`, `2002:7f00:1::` — and a reader that
 * matched text let three of them through. So every form is parsed into its
 * bytes first, an address that carries an IPv4 address inside it is judged as
 * that IPv4 address, and anything this code cannot parse is refused rather
 * than assumed to be somewhere safe.
 *
 * Pure functions, no I/O, so every rule is testable without a network.
 */

export type BlockedAddressReason =
  | 'loopback'
  | 'private'
  | 'link-local'
  | 'unspecified'
  | 'multicast'
  | 'reserved'
  | 'unique-local'
  | 'unparseable';

/**
 * Parses dotted-quad IPv4, strictly.
 *
 * Leading zeros are refused rather than interpreted: `0177.0.0.1` is loopback
 * to a resolver that reads octal and something else to one that does not, and
 * an address whose meaning depends on who is reading is not one to connect to.
 */
function parseIpv4(address: string): readonly number[] | null {
  const parts = address.split('.');
  if (parts.length !== 4) {
    return null;
  }
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^(?:0|[1-9]\d{0,2})$/u.test(part)) {
      return null;
    }
    const value = Number(part);
    if (value > 255) {
      return null;
    }
    octets.push(value);
  }
  return octets;
}

/**
 * Parses every textual IPv6 form into its sixteen bytes.
 *
 * Compression, mixed notation with a trailing IPv4 address, uppercase, and a
 * zone index are all the same address written differently, so they all end up
 * as the same bytes and are classified once.
 */
function parseIpv6(address: string): Uint8Array | null {
  // A zone index names a local interface; it says nothing about which address
  // this is, and an address that needs one is not on the public internet.
  const value = (address.split('%')[0] ?? '').toLowerCase();
  if (value.length === 0 || !/^[0-9a-f:.]+$/u.test(value)) {
    return null;
  }

  const halves = value.split('::');
  if (halves.length > 2) {
    return null;
  }

  const readGroups = (text: string): number[][] | null => {
    if (text.length === 0) {
      return [];
    }
    const groups: number[][] = [];
    const parts = text.split(':');
    for (const [index, part] of parts.entries()) {
      if (part.includes('.')) {
        // Mixed notation is only legal as the last two groups.
        const octets = index === parts.length - 1 ? parseIpv4(part) : null;
        if (octets === null) {
          return null;
        }
        groups.push([octets[0] ?? 0, octets[1] ?? 0], [octets[2] ?? 0, octets[3] ?? 0]);
        continue;
      }
      if (!/^[0-9a-f]{1,4}$/u.test(part)) {
        return null;
      }
      const word = Number.parseInt(part, 16);
      groups.push([word >> 8, word & 0xff]);
    }
    return groups;
  };

  const head = readGroups(halves[0] ?? '');
  const tail = halves.length === 2 ? readGroups(halves[1] ?? '') : [];
  if (head === null || tail === null) {
    return null;
  }
  const filled = head.length + tail.length;
  if (halves.length === 2 ? filled > 7 : filled !== 8) {
    return null;
  }

  const bytes = new Uint8Array(16);
  const groups = [...head, ...new Array<number[]>(8 - filled).fill([0, 0]), ...tail];
  for (const [index, group] of groups.entries()) {
    bytes[index * 2] = group[0] ?? 0;
    bytes[index * 2 + 1] = group[1] ?? 0;
  }
  return bytes;
}

function ipv4Reason(octets: readonly number[]): BlockedAddressReason | null {
  const [first = 0, second = 0, third = 0] = octets;
  if (first === 127) {
    return 'loopback';
  }
  if (first === 0) {
    return 'unspecified';
  }
  if (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  ) {
    return 'private';
  }
  if (first === 169 && second === 254) {
    return 'link-local';
  }
  // Carrier-grade NAT, benchmarking, and TEST-NET ranges are not the public
  // internet either, so a documentation host has no business resolving there.
  if (first === 100 && second >= 64 && second <= 127) {
    return 'reserved';
  }
  if (first === 198 && (second === 18 || second === 19)) {
    return 'reserved';
  }
  if (first === 192 && second === 0 && (third === 0 || third === 2)) {
    return 'reserved';
  }
  if (
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113)
  ) {
    return 'reserved';
  }
  if (first >= 224 && first <= 239) {
    return 'multicast';
  }
  if (first >= 240) {
    return 'reserved';
  }
  return null;
}

function startsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
  return prefix.every((value, index) => bytes[index] === value);
}

interface EmbeddedIpv4 {
  readonly octets: readonly number[];
  /**
   * Whether reaching the embedded address this way is itself ordinary.
   *
   * A mapped address is what a dual-stack resolver returns for an IPv4 host,
   * and a NAT64 address is what an IPv6-only network returns for one, so both
   * are as good as their embedded address. The compatible and 6to4 forms are
   * deprecated: nothing a documentation host publishes resolves there, so they
   * are refused even when what they carry is public.
   */
  readonly ordinary: boolean;
}

/** The IPv4 address an IPv6 address carries, when it carries one. */
function embeddedIpv4(bytes: Uint8Array): EmbeddedIpv4 | null {
  const at = (offset: number): number[] => [
    bytes[offset] ?? 0,
    bytes[offset + 1] ?? 0,
    bytes[offset + 2] ?? 0,
    bytes[offset + 3] ?? 0,
  ];
  const leading = bytes.slice(0, 10).every((byte) => byte === 0);

  // ::ffff:0:0/96, the mapped form every dual-stack socket produces.
  if (leading && bytes[10] === 0xff && bytes[11] === 0xff) {
    return { octets: at(12), ordinary: true };
  }
  // ::/96, the deprecated compatible form. `::` and `::1` are handled before
  // this, so anything else here is an IPv4 address in disguise.
  if (leading && bytes[10] === 0 && bytes[11] === 0) {
    return { octets: at(12), ordinary: false };
  }
  // 64:ff9b::/96, the well-known NAT64 prefix: on an IPv6-only network this is
  // how an IPv4 host resolves, so it is as good as what it carries.
  if (startsWith(bytes, [0x00, 0x64, 0xff, 0x9b, 0, 0, 0, 0, 0, 0, 0, 0])) {
    return { octets: at(12), ordinary: true };
  }
  // 2002::/16, 6to4: the IPv4 address of the relay sits in the next four bytes.
  if (startsWith(bytes, [0x20, 0x02])) {
    return { octets: at(2), ordinary: false };
  }
  return null;
}

function ipv6Reason(bytes: Uint8Array): BlockedAddressReason | null {
  if (bytes.every((byte) => byte === 0)) {
    return 'unspecified';
  }
  if (bytes.slice(0, 15).every((byte) => byte === 0) && bytes[15] === 1) {
    return 'loopback';
  }

  const embedded = embeddedIpv4(bytes);
  if (embedded !== null) {
    // An address that carries an IPv4 address is judged as that address:
    // ::ffff:7f00:1 reaches the same service as 127.0.0.1.
    const reason = ipv4Reason(embedded.octets);
    return reason ?? (embedded.ordinary ? null : 'reserved');
  }

  const [first = 0, second = 0] = bytes;
  if ((first & 0xfe) === 0xfc) {
    return 'unique-local';
  }
  if (first === 0xfe && (second & 0xc0) === 0x80) {
    return 'link-local';
  }
  if (first === 0xfe && (second & 0xc0) === 0xc0) {
    // Site-local was deprecated, not made routable.
    return 'reserved';
  }
  if (first === 0xff) {
    return 'multicast';
  }
  // Documentation, discard, and the IETF protocol block that holds Teredo,
  // benchmarking, and ORCHID are all inside global unicast, and none of them
  // is somewhere a documentation host publishes an address.
  const third = bytes[2] ?? 0;
  if (
    startsWith(bytes, [0x20, 0x01, 0x0d, 0xb8]) ||
    // 2001::/23, the IETF protocol assignments.
    (first === 0x20 && second === 0x01 && (third & 0xfe) === 0x00) ||
    // 3fff::/20, documentation. Read as 3fff::/16: what it widens to is
    // unassigned, and unassigned is not somewhere to connect either.
    startsWith(bytes, [0x3f, 0xff]) ||
    // 100::/64, the discard-only prefix.
    startsWith(bytes, [0x01, 0x00, 0, 0, 0, 0, 0, 0])
  ) {
    return 'reserved';
  }
  // Only global unicast is left. Everything outside 2000::/3 is unassigned or
  // special-purpose, and an unassigned address is not one to connect to.
  return (first & 0xe0) === 0x20 ? null : 'reserved';
}

/**
 * Returns why an address is refused, or `null` when it may be connected to.
 *
 * The family is what the resolver said the address is. It is used to refuse a
 * mismatch rather than to decide the reading: a resolver that reports an IPv6
 * family for something this code reads as IPv4 disagrees with itself, and a
 * disagreement is refused.
 */
export function blockedAddressReason(
  address: string,
  family?: number,
): BlockedAddressReason | null {
  const trimmed = address.trim();
  if (trimmed.length === 0) {
    return 'unparseable';
  }

  const octets = parseIpv4(trimmed);
  if (octets !== null) {
    return family === 6 ? 'unparseable' : ipv4Reason(octets);
  }
  if (trimmed.includes(':')) {
    const bytes = parseIpv6(trimmed);
    if (bytes === null) {
      return 'unparseable';
    }
    return family === 4 ? 'unparseable' : ipv6Reason(bytes);
  }
  // Anything that is neither is not an address this code understands, and an
  // address it does not understand is not one it may connect to.
  return 'unparseable';
}

export interface ResolvedAddress {
  readonly address: string;
  readonly family: number;
}

/** Resolves a hostname to every address it answers with. */
export type AddressResolver = (
  hostname: string,
  callback: (error: Error | null, addresses: readonly ResolvedAddress[]) => void,
) => void;

export type GuardedLookupCallback = (error: Error | null, address: string, family: number) => void;

/**
 * Wraps a resolver so a refused address can never be connected to.
 *
 * The guard both checks and pins. Checking alone would leave the gap between
 * the check and the connection open to a second DNS answer, so the address the
 * guard approved is the one handed back to the socket. Every address the name
 * answers with must pass: a name that answers with one public and one private
 * address is refused, because which one is used is not ours to decide.
 *
 * The resolver is a parameter so this can be exercised without a network.
 */
export function createGuardedLookup(
  resolve: AddressResolver,
  onBlocked: (hostname: string, reason: BlockedAddressReason) => Error,
): (hostname: string, callback: GuardedLookupCallback) => void {
  return (hostname, callback) => {
    resolve(hostname, (error, addresses) => {
      if (error !== null) {
        callback(error, '', 0);
        return;
      }
      if (addresses.length === 0) {
        callback(new Error(`${hostname} resolved to no address`), '', 0);
        return;
      }
      for (const entry of addresses) {
        const reason = blockedAddressReason(entry.address, entry.family);
        if (reason !== null) {
          callback(onBlocked(hostname, reason), '', 0);
          return;
        }
      }
      const first = addresses[0];
      if (first === undefined) {
        callback(new Error(`${hostname} resolved to no address`), '', 0);
        return;
      }
      callback(null, first.address, first.family);
    });
  };
}
