export class Game {
  setup() {}

  onTokenClicked(tokenId) {
    this.bga.actions.performAction('actChooseToken', { tokenId });
  }

  onPlayClicked(tokenId) {
    this.bga.actions.performAction('actPlayToken', { tokenId });
  }

  onPassClicked() {
    this.bga.actions.performAction('actPass', {});
  }

  onAutopassToggled(autopass) {
    // Declared by the game class rather than by a state, so it is allowed in
    // any state and no state lists it.
    this.bga.actions.performAction('actSetAutopass', { autopass });
  }
}
