export class Game {
  setup() {}

  onPassClicked() {
    this.bga.actions.performAction('actPass', { cardId: 3 });
  }

  onPlayClicked() {
    this.bga.actions.performAction('actPlay', { cardId: 3 });
  }

  setupNotifications() {
    this.bga.notifications.setupPromiseNotifications();
  }

  async notif_playerPassed(notif) {
    this.showMessage(notif.args.cardId, 'info');
  }
}
