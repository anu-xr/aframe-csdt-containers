import { CSDTChild } from './lib/csdt/export';

AFRAME.registerComponent('csdt-container-receiver', {
  schema: {
    player: { default: '#player' },
  },

  init: function () {
    const el = this.el;
    const data = this.data;
    const renderer = el.sceneEl.renderer;

    el.connection_opened = false;
    el.player = document.querySelector(data.player).object3D;
    const CSDT = (el.CSDT = new CSDTChild());

    document.addEventListener('CSDT-connection-open', (e) => {
      el.connection_opened = true;
      CSDT.responseConnectionOpen(true);

      const ydoc = CSDT.ydoc;
      const ymap = ydoc.getMap('container');

      el.renderWidth = ymap.get('renderWidth') || 512;
      el.renderHeight = ymap.get('renderHeight') || 512;

      //set render target
      //the scene will now render to renderTarget, rather than the canvas
      el.renderTarget = new THREE.WebGLRenderTarget(el.renderWidth, el.renderHeight);
      renderer.setRenderTarget(el.renderTarget);

      el.pixels = new Uint8Array(el.renderWidth * el.renderHeight * 4);

      document.addEventListener('CSDT-tick', () => {
        ydoc.transact(() => {
          ymap.set('childPixels', el.pixels);
        });
      });
    });
  },

  tick: function () {
    const el = this.el;
    if (el.connection_opened !== true) return;

    const ydoc = el.CSDT.ydoc;
    const ymap = ydoc.getMap('container');

    const pos = new THREE.Vector3().fromArray(ymap.get('cameraPosition'));
    const quat = new THREE.Quaternion().fromArray(ymap.get('cameraQuaternion'));

    const camera = el.sceneEl.camera;
    const player = el.player;

    player.position.set(pos.x, pos.y, pos.z);
    camera.quaternion.set(quat.x, quat.y, quat.z, quat.w);
  },

  tock: function () {
    const el = this.el;
    const renderer = el.sceneEl.renderer;
    if (el.connection_opened !== true) return;

    renderer.readRenderTargetPixels(el.renderTarget, 0, 0, el.renderWidth, el.renderHeight, el.pixels);
  },
});
