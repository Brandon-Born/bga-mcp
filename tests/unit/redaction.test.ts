// secret-scan:allow-file Seeded non-secret sample credentials that prove redaction.
import { resolve, sep } from 'node:path';

import {
  containsCredential,
  REDACTED_CONNECTION,
  REDACTED_CREDENTIAL,
  REDACTED_EMAIL,
  REDACTED_PATH,
  REDACTED_PLAYER,
  REDACTED_PRIVATE_KEY,
  REDACTED_SESSION,
  redactPath,
  redactText,
  redactValue,
} from '../../src/redaction.js';

const projectRoot = resolve(sep, 'workspace', 'bgamcptest');
const options = { projectRoots: [projectRoot] };

const SEEDED = {
  privateKey:
    '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAABG5vbmU\n-----END OPENSSH PRIVATE KEY-----',
  awsKey: 'AKIAIOSFODNN7EXAMPLE',
  githubToken: 'ghp_abcdefghijklmnopqrstuvwxyz0123456789',
  connectionString: 'sftp://studio-user:hunter2@1.studio.boardgamearena.com',
  session: 'TournoiEnLigneid=8fa1c0de9b7a4e2f',
  password: 'password="correct horse battery staple"',
  bearer: 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
  email: 'designer@example.com',
  player: 'player_name=RealPersonName',
} as const;

/** The exact substring of each seeded value that must never survive redaction. */
const SENSITIVE_PART: Record<keyof typeof SEEDED, string> = {
  privateKey: 'b3BlbnNzaC1rZXktdjEAAAAABG5vbmU',
  awsKey: 'AKIAIOSFODNN7EXAMPLE',
  githubToken: 'ghp_abcdefghijklmnopqrstuvwxyz0123456789',
  connectionString: 'hunter2',
  session: '8fa1c0de9b7a4e2f',
  password: 'correct horse battery staple',
  bearer: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
  email: 'designer@example.com',
  player: 'RealPersonName',
};

describe('redaction', () => {
  it('[UNIT-REDACTION-CREDENTIALS] removes keys, tokens, sessions, and connection credentials', () => {
    for (const [name, secret] of Object.entries(SEEDED)) {
      const redacted = redactText(`context ${secret} trailing`);
      expect(redacted).not.toContain(SENSITIVE_PART[name as keyof typeof SEEDED]);
    }

    expect(redactText(SEEDED.privateKey)).toBe(REDACTED_PRIVATE_KEY);
    expect(redactText('-----BEGIN RSA PRIVATE KEY-----\ntruncated body')).toBe(
      REDACTED_PRIVATE_KEY,
    );
    expect(redactText(SEEDED.awsKey)).toBe(REDACTED_CREDENTIAL);
    expect(redactText(SEEDED.githubToken)).toBe(REDACTED_CREDENTIAL);
    // The whole header, name included: the scheme after `Authorization:` is
    // the caller's choice, so a rule that keeps the name has to know every
    // scheme to know where the value starts.
    expect(redactText(SEEDED.bearer)).toBe(REDACTED_CREDENTIAL);
    expect(redactText('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9')).toBe(REDACTED_CREDENTIAL);
    expect(redactText('Cookie: TournoiEnLigneid=8fa1c0de9b7a4e2f; other=1')).toBe(
      REDACTED_CREDENTIAL,
    );
    expect(redactText(SEEDED.password)).toBe(REDACTED_CREDENTIAL);
    expect(redactText(SEEDED.session)).toBe(REDACTED_SESSION);
    expect(redactText(SEEDED.connectionString)).toBe(
      `sftp://${REDACTED_CONNECTION}@1.studio.boardgamearena.com`,
    );
  });

  it('[UNIT-REDACTION-CREDENTIALS] separates what may be edited from what may not be published', () => {
    // A credential has no useful reading once leaked, so a line carrying one is
    // withheld whole; player data is removed from a line that still says
    // something worth reading.
    for (const secret of [
      SEEDED.privateKey,
      SEEDED.awsKey,
      SEEDED.githubToken,
      SEEDED.connectionString,
      SEEDED.session,
      SEEDED.password,
      SEEDED.bearer,
    ]) {
      expect(containsCredential(`context ${secret} trailing`)).toBe(true);
    }
    expect(containsCredential(SEEDED.player)).toBe(false);
    expect(containsCredential(SEEDED.email)).toBe(false);
    expect(containsCredential('SELECT card_id FROM card')).toBe(false);
    // The configured value itself, which no pattern could recognise.
    expect(
      containsCredential('cookie-value-abcdefgh', { secretValues: ['cookie-value-abcdefgh'] }),
    ).toBe(true);
  });

  it('[UNIT-REDACTION-PATHS] leaves a URL path alone when the text is not filesystem text', () => {
    const line = `GET /cinco/cinco/playCard.html from ${projectRoot}/modules/php/Game.php`;
    // The default reads anything path-shaped as a location on this machine.
    expect(redactText(line, options)).toContain(REDACTED_PATH);

    const published = redactText(line, { ...options, paths: 'known-locations' });
    // A request path is a URL, and a log full of placeholders is not a log.
    expect(published).toContain('/cinco/cinco/playCard.html');
    // The machine's own locations are still replaced, by value.
    expect(published).toContain('<project-root>/modules/php/Game.php');
    expect(published).not.toContain(projectRoot);
    expect(
      redactText(`read ${resolve(sep, 'home', 'developer')}/notes.md`, {
        homeDirectory: resolve(sep, 'home', 'developer'),
        paths: 'known-locations',
      }),
    ).toBe(`read ${REDACTED_PATH}/notes.md`);
  });

  it('[UNIT-REDACTION-PLAYER-DATA] removes player identifiers and email addresses', () => {
    expect(redactText(SEEDED.player)).toBe(REDACTED_PLAYER);
    expect(redactText('player_id: 12345678')).toBe(REDACTED_PLAYER);
    expect(redactText(`report from ${SEEDED.email}`)).toBe(`report from ${REDACTED_EMAIL}`);
  });

  it('[UNIT-REDACTION-PATHS] keeps in-root locations readable and hides everything else', () => {
    expect(redactPath(resolve(projectRoot, 'states.inc.php'), options)).toBe(
      '<project-root>/states.inc.php',
    );
    expect(redactPath(projectRoot, options)).toBe('<project-root>');
    expect(redactPath(resolve(sep, 'home', 'developer', '.ssh', 'id_ed25519'), options)).toBe(
      REDACTED_PATH,
    );
    expect(redactPath('anything', {})).toBe(REDACTED_PATH);

    const message = `failed to read ${resolve(projectRoot, 'modules/php/Game.php')} after reading /home/developer/.ssh/config`;
    const redacted = redactText(message, options);
    expect(redacted).toContain('<project-root>/modules/php/Game.php');
    expect(redacted).toContain(REDACTED_PATH);
    expect(redacted).not.toContain('.ssh/config');
  });

  it('redacts strings anywhere in a structured value and preserves shape', () => {
    const value = {
      findings: [{ message: `contact ${SEEDED.email}`, count: 2 }],
      credential: SEEDED.githubToken,
      enabled: true,
      missing: null,
    };
    expect(redactValue(value, options)).toEqual({
      findings: [{ message: `contact ${REDACTED_EMAIL}`, count: 2 }],
      credential: REDACTED_CREDENTIAL,
      enabled: true,
      missing: null,
    });
    expect(redactValue(7)).toBe(7);
  });
});
