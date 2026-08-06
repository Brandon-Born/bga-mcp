define(['dojo', 'dojo/_base/declare'], function (dojo, declare) {
  return declare('bgagame.brokengame', null, {
    setup: function () {},

    onPassClicked: function () {
      // Sends an argument the entry point never reads.
      this.ajaxcall(
        '/brokengame/brokengame/actPass.html',
        { lock: true, cardId: 3 },
        this,
        function (result) {},
      );
    },

    onGhostClicked: function () {
      // Calls an action no state allows and no entry point receives.
      this.ajaxcall('/brokengame/brokengame/actGhost.html', { lock: true }, this, function () {});
    },

    onLegacyClicked: function () {
      // Breaks the act… naming convention.
      this.ajaxcall('/brokengame/brokengame/passTurn.html', { lock: true }, this, function () {});
    },
  });
});
