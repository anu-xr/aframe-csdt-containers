import { CSDTChild } from './lib/csdt/export';

AFRAME.registerComponent('csdt-container-receiver', {
  schema: {},

  init: function () {
    const el = this.el;
    const renderer = el.sceneEl.renderer;

    el.connection_opened = false;
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

    const cameraMatrixWorld = new THREE.Matrix4().fromArray(ymap.get('cameraMatrixWorld'));
    const cameraViewMatrix = new THREE.Matrix4().fromArray(ymap.get('cameraViewMatrix'));

    const camera = el.sceneEl.camera;
    //camera.matrixAutoUpdate = false;
    camera.matrixWorld = cameraMatrixWorld;
    camera.matrixWorldInverse = cameraMatrixWorld;
    //camera.matrixAutoUpdate = true;
  },

  tock: function () {
    const el = this.el;
    const renderer = el.sceneEl.renderer;
    if (el.connection_opened !== true) return;

    renderer.readRenderTargetPixels(el.renderTarget, 0, 0, el.renderWidth, el.renderHeight, el.pixels);
  },
});
