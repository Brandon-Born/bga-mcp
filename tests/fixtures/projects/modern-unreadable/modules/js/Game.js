export class Game {
  setup() {}

  onActionClicked(name) {
    // Deliberately unreadable: the action name is decided at run time, so the
    // reader cannot know which contract this call belongs to.
    this.bga.actions.performAction(name, {});
  }

  setupNotifications() {
    this.bga.notifications.setupPromiseNotifications();
  }

  async notif_stateChanged(args) {
    this.showMessage(args.detail, 'info');
  }
}
