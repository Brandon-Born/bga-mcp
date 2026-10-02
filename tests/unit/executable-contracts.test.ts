import { readFile } from 'node:fs/promises';

import { parsePhpMethodNames, readPhpMethodNames } from '../../src/project/actions.js';
import { readJavaScript } from '../../src/project/javascript.js';
import {
  parseNotificationHandlers,
  parseSentNotifications,
  readPromiseRegistration,
} from '../../src/project/notifications.js';
import { maskComments, maskLiterals } from '../../src/project/php.js';
import { validateNotifications } from '../../src/rules/notifications.js';
import { registerDeadline } from '../../src/deadline.js';

const fixture = new URL('../fixtures/projects/comment-contract-controls/', import.meta.url);

it('does not invent notification handlers or PHP methods from the original comment reproducer', async () => {
  const root = new URL('../fixtures/projects/comment-contract-reproduction/', import.meta.url);
  const client = await readFile(new URL('modules/js/Game.js', root), 'utf8');
  const server = await readFile(new URL('modules/php/Game.php', root), 'utf8');
  expect(parseNotificationHandlers(client).value).toEqual([]);
  expect(parsePhpMethodNames(server)).toEqual(['changeMarker']);
  const trace = validateNotifications(
    [{ path: 'modules/php/Game.php', text: server }],
    [{ path: 'modules/js/Game.js', text: client }],
  );
  expect(trace.diagnostics.findings.map((entry) => entry.code)).toEqual([
    'notification.sent.not-handled',
  ]);
});

it('retains actual modern/legacy sends and executable template reads while excluding all inert examples', async () => {
  const client = await readFile(new URL('modules/js/Game.js', fixture), 'utf8');
  const server = await readFile(new URL('modules/php/Game.php', fixture), 'utf8');
  expect(parseNotificationHandlers(client)).toMatchObject({
    unsupported: [],
    duplicates: [],
    complete: true,
    registration: { prefix: 'notif_', ignored: [] },
    value: [
      { name: 'legacyChanged', bound: true, payloadKeys: ['value'] },
      { name: 'markerChanged', bound: true, payloadKeys: ['marker', 'note'] },
    ],
  });
  expect(parseSentNotifications(server)).toEqual({
    unsupported: [],
    value: [
      {
        name: 'markerChanged',
        payloadKeys: ['marker', 'note'],
        payloadShape: 'known',
        scope: 'all',
      },
      { name: 'legacyChanged', payloadKeys: ['value'], payloadShape: 'known', scope: 'all' },
    ],
  });
});

it('keeps unicode source offsets, PHP attributes, quoted content, heredoc/nowdoc and backticks distinct', () => {
  const source = `<?php
    /* 🦕 function commentOnly() {} */
    $text = "function stringOnly() {}";
    $quote = 'function singleOnly() {}';
    $command = \`function backtickOnly() {}\`;
    $document = <<<NOTE
function heredocOnly() {}
NOTE;
    $literal = <<<'LITERAL'
function nowdocOnly() {}
LITERAL;
    #[PossibleAction]
    public function realMethod(int $cardId): void {}
  `;
  const masked = maskLiterals(source);
  expect(masked.length).toBe(source.length);
  expect(masked.indexOf('function realMethod')).toBe(source.indexOf('function realMethod'));
  expect(parsePhpMethodNames(source)).toEqual(['realMethod']);
  expect(maskComments(source)).toContain('function stringOnly');
  expect(maskComments(source)).not.toContain('commentOnly');
});

it('reads legacy async object methods, class fields and manual bindings without treating static methods or calls as declarations', () => {
  const source = `const legacy = {
    notif_legacy: async function(notif) { return notif.args['value']; },
  };
  class Game {
    setup() {
      this.bga.notifications.setupPromiseNotifications();
      this.subscribeNotif('legacy', 'notif_legacy');
      dojo.subscribe('field', this, 'notif_field');
      this.notif_calledOnly({});
    }
    notif_field = (args) => args.value;
    static notif_staticOnly(args) { return args.fake; }
  }`;
  expect(parseNotificationHandlers(source)).toMatchObject({
    unsupported: [],
    duplicates: [],
    value: [
      { name: 'field', bound: true, binding: 'subscribe', payloadKeys: ['value'] },
      { name: 'legacy', bound: true, binding: 'subscribe', payloadKeys: ['value'] },
    ],
  });
});

it('does not let another method, dynamic brackets or literal examples supply payload keys', () => {
  const parsed = parseNotificationHandlers(`class Game {
    setup() { this.bga.notifications.setupPromiseNotifications(); }
    async notif_changed(args) {
      this.render(args['marker']);
      this.render(args[computed]);
      this.render(object[args].inert);
      const example = 'args.fake';
    }
    helper(args) { return args.otherMethod; }
  }`);
  expect(parsed.value[0]?.payloadKeys).toEqual(['marker']);
});

it('does not register a method using comment, regex, string or template setup examples', () => {
  const parsed = parseNotificationHandlers(`class Game {
    setup() {
      // this.bga.notifications.setupPromiseNotifications();
      const example = 'this.bga.notifications.setupPromiseNotifications()';
      const regex = /setupPromiseNotifications()/;
      const template = \`setupPromiseNotifications()\`;
    }
    async notif_changed() {}
  }`);
  expect(parsed.registration).toBeNull();
  expect(parsed.value).toEqual([
    { name: 'changed', binding: 'method', bound: false, payloadKeys: [] },
  ]);
});

it.each([
  'settings',
  '{ prefix: variable }',
  '{ ignoreNotifications: variable }',
  '{ ignoreNotifications: [variable] }',
  '{ ...settings }',
  '{ [key]: "value" }',
])('carries unreadable promise options through without binding guesses: %s', (options) => {
  const source = `class Game {
    setup() { this.bga.notifications.setupPromiseNotifications(${options}); }
    async notif_changed() {}
  }`;
  expect(readPromiseRegistration(source).unsupported.length).toBeGreaterThan(0);
  expect(parseNotificationHandlers(source)).toMatchObject({ complete: false, registration: null });
  const trace = validateNotifications(
    [{ path: 'Game.php', text: `<?php $this->notifyAllPlayers('changed', '', []);` }],
    [{ path: 'Game.js', text: source }],
  );
  expect(trace.diagnostics.findings.some((finding) => finding.kind === 'heuristic')).toBe(false);
});

it('refuses conflicting registrations and keeps independently matching ones', () => {
  expect(
    readPromiseRegistration(`
    this.bga.notifications.setupPromiseNotifications({prefix: 'a_'});
    this.bga.notifications.setupPromiseNotifications({prefix: 'b_'});
  `),
  ).toMatchObject({ value: null, unsupported: [expect.stringContaining('disagree')] });
  expect(
    readPromiseRegistration(`
    this.bga.notifications.setupPromiseNotifications(undefined);
    this.bga.notifications.setupPromiseNotifications();
  `),
  ).toEqual({ value: { prefix: 'notif_', ignored: [] }, unsupported: [] });
});

it.each([
  'class Game { async notif_fake( }',
  'class Game { notif_fake(args: string) {} }',
  '@unsupported class Game { notif_fake() {} }',
  '/* unterminated notif_fake() {}',
])('reports unknown client grammar without raw-text handlers or absence claims: %s', (source) => {
  const parsed = parseNotificationHandlers(source);
  expect(parsed).toMatchObject({ value: [], complete: false });
  expect(parsed.unsupported.length).toBeGreaterThan(0);
  const trace = validateNotifications(
    [{ path: 'Game.php', text: `<?php $this->notifyAllPlayers('changed', '', []);` }],
    [{ path: 'Game.js', text: source }],
  );
  expect(trace.diagnostics.findings.some((finding) => finding.kind === 'heuristic')).toBe(false);
  expect(trace.handlers).toEqual([]);
});

it('retains non-strict legacy scripts and interrupts syntax reading at a monotonic deadline', () => {
  expect(
    readJavaScript('with (game) { dojo.subscribe("changed", game, "notif_changed"); }').unsupported,
  ).toEqual([]);
  const controller = new AbortController();
  const unregister = registerDeadline(controller.signal, 1, () => controller.abort());
  try {
    expect(() => readJavaScript('void 1;\n'.repeat(100_000), controller.signal)).toThrow();
    expect(controller.signal.aborted).toBe(true);
  } finally {
    unregister();
  }
});

it('does not choose one registration when independently readable client files disagree', () => {
  const trace = validateNotifications(
    [{ path: 'Game.php', text: "<?php $this->notifyAllPlayers('changed', '', []);" }],
    [
      {
        path: 'Game.js',
        text: "this.bga.notifications.setupPromiseNotifications({prefix:'a_'}); class Game { a_changed() {} }",
      },
      {
        path: 'Other.js',
        text: "this.bga.notifications.setupPromiseNotifications({prefix:'b_'}); class Other { b_changed() {} }",
      },
    ],
  );
  expect(trace.handlers.every((handler) => !handler.bound)).toBe(true);
  expect(trace.diagnostics.findings.some((finding) => finding.kind === 'heuristic')).toBe(false);
  expect(trace.diagnostics.summary.unsupported).toBeGreaterThan(0);
});

it.each([
  '<?php function live() {} /* unfinished function fake() {}',
  "<?php function live() {} $text = 'unfinished function fake() {}",
  '<?php function live() {} $text = <<<NOTE\nfunction fake() {}',
  '<?php function live() {} // ?> function htmlExample() {}',
  '<?php function live() {} ?> function htmlExample() {}',
])(
  'keeps unreadable PHP lexical contexts explicit rather than supplying methods or sends: %s',
  (source) => {
    expect(readPhpMethodNames(source).unsupported.length).toBeGreaterThan(0);
    expect(parsePhpMethodNames(source)).toEqual([]);
    expect(parseSentNotifications(source).value).toEqual([]);
    expect(parseSentNotifications(source).unsupported.length).toBeGreaterThan(0);
  },
);

it.each([
  'class Game { [name]() {} }',
  'class Game { get notif_changed() { return handler; } }',
  'class Game { notif_changed = handler; }',
  'dojo.subscribe(computed, this, handler);',
])('reports dynamic bindings and declarations without missing-handler guesses: %s', (source) => {
  expect(parseNotificationHandlers(source).complete).toBe(false);
  expect(
    validateNotifications(
      [{ path: 'Game.php', text: "<?php $this->notifyAllPlayers('changed', '', []);" }],
      [{ path: 'Game.js', text: source }],
    ).diagnostics.findings.some((finding) => finding.kind === 'heuristic'),
  ).toBe(false);
});
