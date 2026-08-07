/**
 * Decides whether a resolved address may be connected to.
 *
 * A host allowlist alone does not prevent a request into the developer's own
 * network: an allowlisted name can resolve to `127.0.0.1` or to a private
 * range, whether by accident, by a hostile DNS answer, or by an attacker who
 * controls a record. The check therefore happens on the address, after
 * resolution, and the connection is pinned to the address that was checked.
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

function ipv4Octets(address: string): readonly number[] | null {
  const parts = address.split('.');
  if (parts.length !== 4) {
    return null;
  }
  const octets = parts.map((part) => (/^\d{1,3}$/u.test(part) ? Number(part) : Number.NaN));
  return octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255)
    ? octets
    : null;
}

function ipv4Reason(octets: readonly number[]): BlockedAddressReason | null {
  const [first = 0, second = 0] = octets;
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
  if (first >= 224 && first <= 239) {
    return 'multicast';
  }
  if (first >= 240) {
    return 'reserved';
  }
  return null;
}

function normalizeIpv6(address: string): string {
  // Strip a zone index (`%eth0`) and lowercase, so textual comparison is stable.
  return address.split('%')[0]?.toLowerCase() ?? '';
}

function ipv6Reason(address: string): BlockedAddressReason | null {
  const value = normalizeIpv6(address);
  if (value === '::1') {
    return 'loopback';
  }
  if (value === '::' || value === '') {
    return 'unspecified';
  }
  // An IPv4-mapped address is an IPv4 address wearing a hat; judge it as one.
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/u.exec(value);
  if (mapped?.[1] !== undefined) {
    const octets = ipv4Octets(mapped[1]);
    return octets === null ? 'unparseable' : ipv4Reason(octets);
  }
  if (
    value.startsWith('fe8') ||
    value.startsWith('fe9') ||
    value.startsWith('fea') ||
    value.startsWith('feb')
  ) {
    return 'link-local';
  }
  if (value.startsWith('fc') || value.startsWith('fd')) {
    return 'unique-local';
  }
  if (value.startsWith('ff')) {
    return 'multicast';
  }
  return null;
}

/** Returns why an address is refused, or `null` when it may be connected to. */
export function blockedAddressReason(
  address: string,
  family?: number,
): BlockedAddressReason | null {
  const trimmed = address.trim();
  if (trimmed.length === 0) {
    return 'unparseable';
  }
  const octets = ipv4Octets(trimmed);
  if (octets !== null) {
    return ipv4Reason(octets);
  }
  if (trimmed.includes(':')) {
    return ipv6Reason(trimmed);
  }
  // Anything that is neither is not an address this code understands, and an
  // address it does not understand is not one it may connect to.
  return family === undefined ? 'unparseable' : 'unparseable';
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
