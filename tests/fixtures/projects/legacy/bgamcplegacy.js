define(['dojo', 'dojo/_base/declare'], function (dojo, declare) {
  return declare('bgagame.bgamcplegacy', null, {
    setup: function () {},

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
