# Modern notification verification

Recorded: 2026-08-09. Covers BGA-126, the correctness owner for the notification findings of the [2026-08-08 installed-package adversarial review](ADVERSARIAL_REVIEW_2026-08-08.md).

```verification-record
{
  "kind": "run",
  "capabilities": 16,
  "scenarios": 117,
  "claims": 76,
  "tests": 423
}
```

## What the installed package got wrong

| Observed                                                                | Why it was wrong                                                                              |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `notification.handled.not-sent` for a state class's `$this->notif->all` | The state-class shortcut is a documented spelling of the same send, and the reader skipped it |
| Every `notif_…` method treated as bound                                 | The framework only calls one that `setupPromiseNotifications` registered                      |

## What the documentation says

- [Game interface logic: Game.js](https://en.doc.boardgamearena.com/Game_interface_logic:_Game.js) — `setupPromiseNotifications` "auto-detect[s] all notifications declared on the game object (functions starting with `notif_`) and register[s] them with dojo.subscribe"; its parameters default to `{ prefix: 'notif_', … ignoreNotifications: [], … }`, and an ignored name means "You'll need to subscribe to it manually"; the pre-defined types are `tableWindow`, `message` — "You can call this on php side without doing anything on client side" — and `simplePause`.
- [BGA Studio Migration Guide](https://en.doc.boardgamearena.com/BGA_Studio_Migration_Guide) and [State classes: State directory](https://en.doc.boardgamearena.com/State_classes:_State_directory) — "The Game sub-objects are available on the State class too, so you can write `$this->notif->all` without needing to pass through the game variable."
- [Main game logic: Game.php](https://en.doc.boardgamearena.com/Main_game_logic:_Game.php) — `bga->notify->all` and `bga->notify->player`, with the payload that "will be transmitted to the game interface logic".

## What changed

- **Three spellings, one contract.** Legacy `notifyAllPlayers`/`notifyPlayer`, `$this->bga->notify->all`/`->player`, and the state-class `$this->notif->all`/`->player` all normalize to the same send.
- **A method is not a handler until something registers it.** The registration is read wherever it is in the client, because handlers may live in state classes while the call lives in `Game.js`. Its `prefix` decides what counts as a handler at all, and a name in `ignoreNotifications` is not registered — unless the client subscribes to it by hand, which is exactly what the documentation tells you to do.
- **A send that reaches an unregistered method is reported as unhandled**, and the evidence says why: the method exists, and nothing registers it.
- **The framework's own types are not the project's to handle.** `message`, `tableWindow`, and `simplePause` are never reported as unhandled.

## Fixtures and scenarios

`modern-state-classes` sends `tokenChosen` from a state class and `message` from the same handler, registers `notif_tokenChosen` with `setupPromiseNotifications`, and declares its notification contract as passing. `modern-broken` declares `notif_ignoredEvent` while its registration ignores the name, and the server sends it anyway.

| Scenario                                  | Proves                                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------ |
| E2E-VALIDATE-NOTIFICATIONS-STATE-CLASSES  | The state-class shortcut is read, and a predefined type needs no handler |
| E2E-VALIDATE-NOTIFICATIONS-MODERN-DEFECTS | A send whose only handler is unregistered is reported, with the reason   |
| E2E-VALIDATE-NOTIFICATIONS-CLEAN          | The legacy `dojo.subscribe` route is unchanged                           |

## Open questions

- **Which object a handler belongs to.** `handlers: [this, ...this.bga.states.getStateClasses()]` registers methods declared elsewhere, and the documentation warns that a name defined in several places will be called several times. This reader treats a registration anywhere in the client as registering every matching method, rather than resolving which object each belongs to.
- **`setIgnoreNotificationCheck`** suppresses a notification at run time by predicate. It is not read, and a notification suppressed that way still counts as handled here.
