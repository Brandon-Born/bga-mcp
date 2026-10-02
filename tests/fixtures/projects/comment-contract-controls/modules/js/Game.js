export class Game {
  setup() {
    // 🦕 this.bga.notifications.setupPromiseNotifications({ prefix: 'wrong_' });
    /* dojo.subscribe('markerChanged', this, 'notif_markerChanged'); */
    const example = "dojo.subscribe('markerChanged', this, 'notif_markerChanged')";
    const pattern = /dojo.subscribe('markerChanged')/;
    const template = `async notif_templateOnly(args) { args.fake; }`;
    this.bga.notifications.setupPromiseNotifications({
      /* prefix: 'wrong_', */
      prefix: 'notif_',
      ignoreNotifications: [/* 'markerChanged', */],
    });
  }
  /* async notif_commentOnly(args) { return args.fake; } */
  async notif_markerChanged(args) {
    /* args.commentOnly; */
    const example = 'args.stringOnly';
    const pattern = /args.regexOnly/;
    const template = `args.templateOnly ${args.marker}`;
    this.render(args.note);
  }
  async notif_legacyChanged(notif) {
    this.render(notif.args.value);
  }
}
