import { CSDTChild } from './lib/csdt/export';
import { deepRemoveIds } from './utils';

AFRAME.registerComponent('csdt-container-receiver', {
  schema: {},

  init: function () {
    const el = this.el;
    const data = this.data;

    el.connection_opened = false;
    const CSDT = (el.CSDT = new CSDTChild());

    document.addEventListener('CSDT-connection-open', (e) => {
      el.connection_opened = true;
      CSDT.responseConnectionOpen(true);
    });
  },

  tock: function () {
    const el = this.el;

    if (el.connection_opened === true) {
    }
  },
});
