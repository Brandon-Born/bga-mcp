export class Game {
  setup() {}

  onPassClicked() {
    this.bga.actions.performAction('actPass', { cardId: 3 });
  }

  onPlayClicked() {
    // Outside the range the server's parameter attribute accepts.
    this.bga.actions.performAction('actPlay', { cardId: 9 });
  }

  onGhostClicked() {
    // Calls an action no state allows and the game class does not declare.
    this.bga.actions.performAction('actGhost', {});
  }

  setupNotifications() {
    this.bga.notifications.setupPromiseNotifications({
      // Deliberately defective: the registration is told to skip this one and
      // nothing subscribes to it manually, so the method below never runs.
      ignoreNotifications: ['ignoredEvent'],
    });
  }

  async notif_ignoredEvent(notif) {}

  async notif_playerPassed(notif) {
    // Reads a key the server does not send.
    this.showMessage(notif.args.comment, 'info');
  }

  async notif_phantomEvent(notif) {}
}
