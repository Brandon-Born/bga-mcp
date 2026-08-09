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
}
