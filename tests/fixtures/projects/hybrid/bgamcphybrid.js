define(['dojo', 'dojo/_base/declare'], function (dojo, declare) {
  return declare('bgagame.bgamcphybrid', null, {
    setup: function () {},

    setupNotifications: function () {
      dojo.subscribe('playerPassed', this, 'notif_playerPassed');
    },

    notif_playerPassed: function (notif) {
      this.showMessage(notif.args.comment, 'info');
    },

    onPassClicked: function () {
      this.bgaPerformAction('actPass', { comment: 'no play' });
    },
  });
});
