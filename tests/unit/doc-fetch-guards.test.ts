import { Readable } from 'node:stream';

import {
  blockedAddressReason,
  createGuardedLookup,
  type ResolvedAddress,
} from '../../src/docs/addresses.js';
import {
  MAX_QUERY_LENGTH,
  describeRequestContentViolation,
  requestContentViolation,
} from '../../src/docs/request.js';
import { parseDocumentationCatalog, sourceForUrl } from '../../src/docs/catalog.js';
import { readBoundedUtf8 } from '../../src/docs/read.js';

function resolver(addresses: readonly ResolvedAddress[]) {
  return (
    _hostname: string,
    callback: (error: Error | null, resolved: readonly ResolvedAddress[]) => void,
  ) => {
    callback(null, addresses);
  };
}

function lookupOnce(
  addresses: readonly ResolvedAddress[],
): Promise<{ error: Error | null; address: string }> {
  const guarded = createGuardedLookup(
    resolver(addresses),
    (host, reason) => new Error(`${host}:${reason}`),
  );
  return new Promise((resolve) => {
    guarded('docs.example', (error, address) => {
      resolve({ error, address });
    });
  });
}

describe('documentation address guard', () => {
  it('[UNIT-DOC-ADDRESS-BLOCKED] refuses every address that is not on the public internet', () => {
    // A host allowlist does not prevent a request into the developer's own
    // network; this is what does.
    expect(blockedAddressReason('127.0.0.1')).toBe('loopback');
    expect(blockedAddressReason('127.99.1.2')).toBe('loopback');
    expect(blockedAddressReason('0.0.0.0')).toBe('unspecified');
    expect(blockedAddressReason('10.1.2.3')).toBe('private');
    expect(blockedAddressReason('172.16.0.1')).toBe('private');
    expect(blockedAddressReason('172.31.255.255')).toBe('private');
    expect(blockedAddressReason('192.168.1.1')).toBe('private');
    expect(blockedAddressReason('169.254.169.254')).toBe('link-local');
    expect(blockedAddressReason('100.64.0.1')).toBe('reserved');
    expect(blockedAddressReason('198.18.0.1')).toBe('reserved');
    expect(blockedAddressReason('224.0.0.1')).toBe('multicast');
    expect(blockedAddressReason('255.255.255.255')).toBe('reserved');

    expect(blockedAddressReason('::1')).toBe('loopback');
    expect(blockedAddressReason('::')).toBe('unspecified');
    expect(blockedAddressReason('fe80::1')).toBe('link-local');
    expect(blockedAddressReason('fd00::1')).toBe('unique-local');
    expect(blockedAddressReason('ff02::1')).toBe('multicast');
    // An IPv4-mapped address is an IPv4 address wearing a hat.
    expect(blockedAddressReason('::ffff:127.0.0.1')).toBe('loopback');
    expect(blockedAddressReason('::ffff:10.0.0.1')).toBe('private');
    // A zone index must not smuggle a link-local address past the check.
    expect(blockedAddressReason('fe80::1%eth0')).toBe('link-local');

    expect(blockedAddressReason('172.15.0.1')).toBeNull();
    expect(blockedAddressReason('172.32.0.1')).toBeNull();
    expect(blockedAddressReason('93.184.216.34')).toBeNull();
    expect(blockedAddressReason('2606:2800:220:1::1')).toBeNull();

    // Anything the guard cannot parse is not something it may connect to.
    expect(blockedAddressReason('not-an-address')).toBe('unparseable');
    expect(blockedAddressReason('')).toBe('unparseable');
  });

  it('[UNIT-DOC-ADDRESS-BLOCKED] pins the connection to an address it approved', async () => {
    const allowed = await lookupOnce([{ address: '93.184.216.34', family: 4 }]);
    expect(allowed.error).toBeNull();
    expect(allowed.address).toBe('93.184.216.34');

    const blocked = await lookupOnce([{ address: '127.0.0.1', family: 4 }]);
    expect(blocked.error?.message).toBe('docs.example:loopback');
    expect(blocked.address).toBe('');

    // One bad answer among good ones refuses the name: which address the socket
    // would have used is not ours to decide.
    const mixed = await lookupOnce([
      { address: '93.184.216.34', family: 4 },
      { address: '169.254.169.254', family: 4 },
    ]);
    expect(mixed.error?.message).toBe('docs.example:link-local');

    const empty = await lookupOnce([]);
    expect(empty.error?.message).toContain('resolved to no address');
  });
});

describe('documentation request content', () => {
  it('[UNIT-DOC-REQUEST-CONTENT] refuses a query that was not typed by a developer', () => {
    expect(requestContentViolation('how do state classes declare transitions')).toBeNull();
    expect(requestContentViolation('states.inc.php possibleactions')).toBeNull();
    expect(requestContentViolation('bga->notify->all payload')).toBeNull();

    expect(requestContentViolation('   ')).toBe('empty');
    expect(requestContentViolation('a'.repeat(MAX_QUERY_LENGTH + 1))).toBe('too-long');
    expect(requestContentViolation('two\nlines')).toBe('control-characters');

    // The leak that matters: a path names local work to a third party.
    expect(requestContentViolation('why does /Users/dev/secretgame/states.inc.php fail')).toBe(
      'project-path',
    );
    expect(requestContentViolation('error in C:\\games\\secretgame')).toBe('project-path');
    expect(requestContentViolation('check /home/me/game', ['/home/me/game'])).toBe('project-path');

    // Source syntax means the text was copied out of a file.
    expect(requestContentViolation('<?php class Game extends Table')).toBe('source-code');
    expect(requestContentViolation("$this->notifyAllPlayers('x')")).toBe('source-code');
    expect(requestContentViolation("['pass' => 99]")).toBe('source-code');
  });

  it('[UNIT-DOC-REQUEST-CONTENT] explains each refusal in terms a developer can act on', () => {
    expect(describeRequestContentViolation('project-path')).toContain('filesystem path');
    expect(describeRequestContentViolation('source-code')).toContain('copied out of a file');
    expect(describeRequestContentViolation('too-long')).toContain(String(MAX_QUERY_LENGTH));
  });
});

describe('documentation source allowlist', () => {
  const catalog = parseDocumentationCatalog(
    JSON.stringify({
      reviewedAt: '2026-08-07',
      sources: [
        {
          id: 'wiki',
          title: 'Wiki',
          canonicalUrl: 'https://docs.example/',
          host: 'docs.example',
          authority: 'official-maintained',
          retrieval: { mode: 'on-demand-single-page', respectRobots: true, userAgent: 'test' },
        },
      ],
    }),
  );

  it('[UNIT-DOC-HOST-ALLOWLIST] matches only an HTTPS URL inside an allowlisted source', () => {
    expect(sourceForUrl(catalog, new URL('https://docs.example/Studio'))?.id).toBe('wiki');
    expect(sourceForUrl(catalog, new URL('http://docs.example/Studio'))).toBeNull();
    expect(sourceForUrl(catalog, new URL('https://evil.example/Studio'))).toBeNull();
    // A host that merely ends with an allowlisted name is a different host.
    expect(sourceForUrl(catalog, new URL('https://notdocs.example/Studio'))).toBeNull();
    expect(sourceForUrl(catalog, new URL('https://docs.example.evil.test/Studio'))).toBeNull();
  });

  it('[UNIT-DOC-HOST-ALLOWLIST] refuses a catalog that is empty or incomplete', () => {
    expect(() => parseDocumentationCatalog('{"sources":[]}')).toThrow(/lists no sources/u);
    expect(() =>
      parseDocumentationCatalog('{"sources":[{"id":"x","host":"docs.example"}]}'),
    ).toThrow(/incomplete source/u);
  });
});

describe('documentation response budget', () => {
  it('[UNIT-DOC-RESPONSE-BUDGET] stops reading a response that passes its limit', async () => {
    const oversized = Readable.from([Buffer.alloc(64, 0x61), Buffer.alloc(64, 0x62)]);
    const failure = readBoundedUtf8(oversized, 100, (bytes, maxBytes) =>
      Object.assign(new Error('too large'), { bytes, maxBytes }),
    );

    await expect(failure).rejects.toThrow('too large');
    // Stopping matters more than rejecting: an oversized page must not be held.
    expect(oversized.destroyed).toBe(true);
  });

  it('[UNIT-DOC-RESPONSE-BUDGET] returns a body that fits, and its exact bytes', async () => {
    const body = await readBoundedUtf8(
      Readable.from(['half ', 'a page']),
      100,
      () => new Error('x'),
    );
    expect(body).toBe('half a page');

    // A body exactly at the limit is within it; only passing the limit fails.
    const exact = await readBoundedUtf8(
      Readable.from([Buffer.alloc(100, 0x61)]),
      100,
      () => new Error('x'),
    );
    expect(exact).toHaveLength(100);
  });

  it('[UNIT-DOC-RESPONSE-BUDGET] reports a stream failure rather than a partial body', async () => {
    const broken = new Readable({
      read() {
        this.destroy(new Error('connection reset'));
      },
    });
    await expect(readBoundedUtf8(broken, 100, () => new Error('x'))).rejects.toThrow(
      'connection reset',
    );
  });
});
