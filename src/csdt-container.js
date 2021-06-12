import { CSDTParent } from './lib/csdt/export';
import { deepRemoveTypes } from './utils';

AFRAME.registerComponent('csdt-container', {
  schema: {
    href: { default: '' },
    width: { default: 10 },
    height: { default: 10 },
    depth: { default: 10 },
  },

  init: function () {
    const el = this.el;
    const data = this.data;

    el.has_iframe_loaded = false;
    el.connection_established = false;

    //create iframe
    const iframe = document.createElement('iframe');
    iframe.src = data.href;
    iframe.style.display = 'none';
    document.body.appendChild(iframe);
    el.iframe = iframe;

    const CSDT = (el.CSDT = new CSDTParent(iframe));

    //wait for iframe to fully load
    el.addEventListener('iframe loaded', () => {
      iframe.addEventListener('load', () => {
        //check for CSDT support
        CSDT.ping().then(() => {
          //open a connection
          CSDT.openConnection().then((d) => {
            if (d.connectionEstablished === true) {
              el.connection_established = true;
            }
          });
        });
      });
    });
  },

  tick: function () {
    const el = this.el;
    const data = this.data;
    const sceneEl = el.sceneEl;

    if (el.has_iframe_loaded === false) {
      if (el.iframe?.contentDocument) {
        el.has_iframe_loaded = true;
        el.emit('iframe loaded');
      }
    }

    if (el.connection_established === true) {
      //calculate container area
      const renderer = sceneEl.renderer;
    }
  },
});

function log(msg, probability = 0.97) {
  if (Math.random() > probability) console.log(msg);
}
