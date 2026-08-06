define(['dojo', 'dojo/_base/declare'], function (dojo, declare) {
  return declare('bgagame.bgamcplegacy', null, {
    setup: function () {},

    setupNotifications: function () {
      dojo.subscribe('playerPassed', this, 'notif_playerPassed');
    },

    notif_playerPassed: function (notif) {
      this.showMessage(notif.args.comment, 'info');
    },

    onPassClicked: function () {
      this.ajaxcall(
        '/bgamcplegacy/bgamcplegacy/actPass.html',
        { lock: true, comment: 'no play' },
        this,
        function (result) {},
      );
    },
  });
});
