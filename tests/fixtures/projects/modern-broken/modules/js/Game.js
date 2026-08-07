export class Game {
  setup() {}

  onPassClicked() {
    this.bga.actions.performAction('actPass', { cardId: 3 });
  }

  onPlayClicked() {
    this.bga.actions.performAction('actPlay', { cardId: 3 });
  }

  onGhostClicked() {
    // Calls an action no state allows and the game class does not declare.
    this.bga.actions.performAction('actGhost', {});
  }

  setupNotifications() {
    this.bga.notifications.setupPromiseNotifications();
  }

  async notif_playerPassed(notif) {
    // Reads a key the server does not send.
    this.showMessage(notif.args.comment, 'info');
  }

  async notif_phantomEvent(notif) {}
}
