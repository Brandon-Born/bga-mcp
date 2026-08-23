import {
  parseNotificationHandlers,
  parseSentNotifications,
} from '../../src/project/notifications.js';
import { NOTIFICATION_RULES, validateNotifications } from '../../src/rules/notifications.js';

const SERVER = `<?php
class Game extends Table
{
    function actPass($comment)
    {
        $this->notifyAllPlayers('playerPassed', clienttranslate('\${player_name} passes'), [
            'player_id' => 1,
            'player_name' => 'x',
            'comment' => $comment,
        ]);
    }

    function tellOne($playerId)
    {
        self::notifyPlayer($playerId, 'privateHand', '', ['cards' => []]);
    }
}`;

const CLIENT = `define(['dojo'], function (dojo) {
  return declare('bgagame.fixture', null, {
    setupNotifications: function () {
      dojo.subscribe('playerPassed', this, 'notif_playerPassed');
      dojo.subscribe('privateHand', this, 'notif_privateHand');
    },
    notif_playerPassed: function (notif) {
      this.showMessage(notif.args.comment);
    },
    notif_privateHand: function (notif) {
      this.render(notif.args.cards);
    },
  });
});`;

const server = [{ path: 'game.php', text: SERVER }];
const client = [{ path: 'game.js', text: CLIENT }];

describe('sent notification reading', () => {
  it('reads names, payload keys, and scope, ignoring framework keys', () => {
    const outcome = parseSentNotifications(SERVER);
    expect(outcome.unsupported).toEqual([]);
    expect(outcome.value).toEqual([
      { name: 'playerPassed', payloadKeys: ['comment'], payloadShape: 'known', scope: 'all' },
      { name: 'privateHand', payloadKeys: ['cards'], payloadShape: 'known', scope: 'player' },
    ]);
  });

  it('reads the legacy array() payload form', () => {
    const outcome = parseSentNotifications(
      `<?php $this->notifyAllPlayers('scored', '', array('points' => 3));`,
    );
    expect(outcome.value).toEqual([
      { name: 'scored', payloadKeys: ['points'], payloadShape: 'known', scope: 'all' },
    ]);
  });

  it('reports a name or payload it cannot read instead of guessing', () => {
    const computed = parseSentNotifications(`<?php
      $this->notifyAllPlayers($name, '', []);
      $this->notifyAllPlayers('built', '', $payload);
      $this->notifyAllPlayers('helper', '', buildPayload());
      $this->notifyAllPlayers('spread', '', ['known' => 1, ...$payload]);
      $this->notifyAllPlayers('malformed', '', ['known' => 1);`);
    expect(computed.unsupported).toEqual([
      'notification sent with a computed name: $name',
      "notification 'built' sent with a computed payload",
      "notification 'helper' sent with a computed payload",
      "notification 'spread' sent with a computed payload",
      "notification 'malformed' has malformed arguments",
    ]);
    expect(computed.value).toEqual([
      { name: 'built', payloadKeys: [], payloadShape: 'unknown', scope: 'all' },
      { name: 'helper', payloadKeys: [], payloadShape: 'unknown', scope: 'all' },
      { name: 'spread', payloadKeys: ['known'], payloadShape: 'unknown', scope: 'all' },
      { name: 'malformed', payloadKeys: [], payloadShape: 'unknown', scope: 'all' },
    ]);
  });
});

describe('notification handler reading', () => {
  it('reads subscriptions and the payload keys each handler consumes', () => {
    const outcome = parseNotificationHandlers(CLIENT);
    expect(outcome.unsupported).toEqual([]);
    expect(outcome.duplicates).toEqual([]);
    expect(outcome.value).toEqual([
      { name: 'playerPassed', binding: 'subscribe', bound: true, payloadKeys: ['comment'] },
      { name: 'privateHand', binding: 'subscribe', bound: true, payloadKeys: ['cards'] },
    ]);
  });

  it('binds a notif_ method only where setupPromiseNotifications registers it', () => {
    const method = `notif_cardPlayed: function (notif) { this.move(notif.args['cardId']); },`;

    // Regression: the method alone was treated as bound. Without the
    // registration it is a method, and the framework never calls it.
    expect(parseNotificationHandlers(method).value).toEqual([
      { name: 'cardPlayed', binding: 'method', bound: false, payloadKeys: ['cardId'] },
    ]);

    const registered = parseNotificationHandlers(
      `setupNotifications: function () { this.bga.notifications.setupPromiseNotifications(); },\n${method}`,
    );
    expect(registered.value).toEqual([
      { name: 'cardPlayed', binding: 'method', bound: true, payloadKeys: ['cardId'] },
    ]);
    expect(registered.registration).toEqual({ prefix: 'notif_', ignored: [] });
  });

  it('honours the prefix and ignore list the registration declares', () => {
    const outcome = parseNotificationHandlers(`
      setupNotifications: function () {
        this.bga.notifications.setupPromiseNotifications({
          prefix: 'on_',
          ignoreNotifications: ['updateAutoPlay'],
        });
      },
      on_cardPlayed: function (notif) {},
      on_updateAutoPlay: function (notif) {},
      notif_ignoredByPrefix: function (notif) {},`);

    expect(outcome.registration).toEqual({ prefix: 'on_', ignored: ['updateAutoPlay'] });
    expect(outcome.value.map((handler) => [handler.name, handler.bound])).toEqual([
      ['cardPlayed', true],
      // "You'll need to subscribe to it manually".
      ['updateAutoPlay', false],
    ]);
  });

  it('binds an ignored notification the client subscribes to by hand', () => {
    const outcome = parseNotificationHandlers(`
      setupNotifications: function () {
        this.bga.notifications.setupPromiseNotifications({ ignoreNotifications: ['updateAutoPlay'] });
        dojo.subscribe('updateAutoPlay', this, 'notif_updateAutoPlay');
      },
      notif_updateAutoPlay: function (notif) {},`);
    expect(outcome.value.map((handler) => [handler.name, handler.bound])).toEqual([
      ['updateAutoPlay', true],
    ]);
  });

  it('reports duplicate subscriptions and unreadable subscription names', () => {
    const outcome = parseNotificationHandlers(`
      dojo.subscribe('same', this, 'notif_same');
      dojo.subscribe('same', this, 'notif_same');
      dojo.subscribe(computedName, this, 'notif_other');`);
    expect(outcome.duplicates).toEqual(['same']);
    expect(outcome.unsupported).toEqual([
      'notification subscribed with a computed name: computedName',
    ]);
  });
});

describe('notification rules', () => {
  it('publishes unique codes, and every uncertain rule records its false positives', () => {
    const codes = NOTIFICATION_RULES.map((rule) => rule.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const rule of NOTIFICATION_RULES) {
      expect(rule.code).toMatch(/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u);
      if (rule.certainty !== 'certain') {
        expect(rule.falsePositives.length).toBeGreaterThan(0);
      }
    }
  });

  it('accepts a contract where both sides agree', () => {
    const trace = validateNotifications(server, client);
    expect(trace.diagnostics.status).toBe('passed');
    expect(trace.sent).toHaveLength(2);
    expect(trace.handlers).toHaveLength(2);
  });

  it('reports a notification nobody handles and a handler nothing sends', () => {
    const trace = validateNotifications(
      [{ path: 'game.php', text: `<?php $this->notifyAllPlayers('onlySent', '', []);` }],
      [{ path: 'game.js', text: `dojo.subscribe('onlyHandled', this, 'notif_onlyHandled');` }],
    );
    const codes = trace.diagnostics.findings.map((finding) => finding.code);
    expect(codes).toContain('notification.sent.not-handled');
    expect(codes).toContain('notification.handled.not-sent');

    const handled = trace.diagnostics.findings.find(
      (finding) => finding.code === 'notification.handled.not-sent',
    );
    expect(handled).toMatchObject({ kind: 'heuristic', certainty: 'possible' });
    const notHandled = trace.diagnostics.findings.find(
      (finding) => finding.code === 'notification.sent.not-handled',
    );
    expect(notHandled).toMatchObject({ kind: 'heuristic', certainty: 'likely' });
  });

  it('reports payload disagreement in both directions', () => {
    const trace = validateNotifications(
      [{ path: 'game.php', text: `<?php $this->notifyAllPlayers('moved', '', ['from' => 1]);` }],
      [
        {
          path: 'game.js',
          text: `dojo.subscribe('moved', this, 'notif_moved');
                 notif_moved: function (notif) { this.go(notif.args.to); },`,
        },
      ],
    );
    const mismatches = trace.diagnostics.findings.filter(
      (finding) => finding.code === 'notification.payload.mismatch',
    );
    expect(mismatches).toHaveLength(2);
    // Deterministic order is alphabetical by message.
    expect(mismatches[0]?.message).toContain("reads 'to'");
    expect(mismatches[1]?.message).toContain("sends 'from'");
  });

  it('never compares a computed payload as a known-empty payload', () => {
    const trace = validateNotifications(
      [{ path: 'game.php', text: `<?php $this->notifyAllPlayers('moved', '', $payload);` }],
      [
        {
          path: 'game.js',
          text: `dojo.subscribe('moved', this, 'notif_moved');
                 notif_moved: function (notif) { this.go(notif.args.to); },`,
        },
      ],
    );
    expect(
      trace.diagnostics.findings.filter(
        (finding) => finding.code === 'notification.payload.mismatch',
      ),
    ).toEqual([]);
    expect(trace.diagnostics.findings).toContainEqual(
      expect.objectContaining({
        kind: 'unsupported-syntax',
        code: 'notification.unsupported-syntax',
      }),
    );
  });

  it('reports a duplicate subscription as a fact', () => {
    const trace = validateNotifications(server, [
      {
        path: 'game.js',
        text: `${CLIENT}\ndojo.subscribe('playerPassed', this, 'notif_playerPassed');`,
      },
    ]);
    const duplicate = trace.diagnostics.findings.find(
      (finding) => finding.code === 'notification.subscription.duplicate',
    );
    expect(duplicate).toMatchObject({ kind: 'issue', certainty: 'certain', severity: 'warning' });
  });

  it('never returns a clean result when a side is missing or nothing was found', () => {
    const noClient = validateNotifications(server, []);
    expect(noClient.diagnostics.findings[0]).toMatchObject({
      code: 'notification.trace.unavailable',
      certainty: 'certain',
    });
    expect(noClient.diagnostics.findings[0]?.message).toContain('no readable client source');

    const nothingFound = validateNotifications(
      [{ path: 'game.php', text: '<?php class Game {}' }],
      [{ path: 'game.js', text: 'const x = 1;' }],
    );
    expect(nothingFound.diagnostics.status).toBe('findings');
    expect(nothingFound.diagnostics.findings[0]?.message).toContain(
      'No notification send or handler',
    );
  });

  it('carries unreadable sends through as unsupported syntax', () => {
    const trace = validateNotifications(
      [{ path: 'game.php', text: `<?php $this->notifyAllPlayers($name, '', []);` }],
      client,
    );
    const unsupported = trace.diagnostics.findings.filter(
      (finding) => finding.kind === 'unsupported-syntax',
    );
    expect(unsupported).toHaveLength(1);
    expect(unsupported[0]?.code).toBe('notification.unsupported-syntax');
  });

  it('orders findings deterministically', () => {
    const first = validateNotifications(server, [
      { path: 'game.js', text: `dojo.subscribe('zzz', this, 'notif_zzz');` },
    ]);
    const second = validateNotifications(server, [
      { path: 'game.js', text: `dojo.subscribe('zzz', this, 'notif_zzz');` },
    ]);
    expect(JSON.stringify(first.diagnostics)).toBe(JSON.stringify(second.diagnostics));
    const codes = first.diagnostics.findings.map((finding) => finding.code);
    expect(codes).toEqual([...codes].sort());
  });
});
