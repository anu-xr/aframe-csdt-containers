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

      el.canvasWidth = ymap.get('canvasWidth') || 512;
      el.canvasHeight = ymap.get('canvasHeight') || 512;

      el.renderTarget = new THREE.WebGLRenderTarget(el.canvasWidth, el.canvasHeight);
      renderer.setRenderTarget(el.renderTarget);
      el.pixels = new Uint8Array(el.canvasWidth * el.canvasHeight * 4);

      ymap.observe((e) => {
        const changed = e.transaction.changed;
        changed.forEach((c) => {
          if (c.has('canvasWidth') || c.has('canvasHeight')) {
            el.canvasWidth = ymap.get('canvasWidth');
            el.canvasHeight = ymap.get('canvasHeight');

            el.renderTarget.setSize(el.canvasWidth, el.canvasHeight);
            el.pixels = new Uint8Array(el.canvasWidth * el.canvasHeight * 4);

            const camera = el.sceneEl.camera;
            camera.aspect = el.canvasWidth / el.canvasHeight;
            camera.updateProjectionMatrix();
          }
        });
      });

      document.addEventListener('CSDT-tock', () => {
        const el = this.el;
        const renderer = el.sceneEl.renderer;

        const ydoc = el.CSDT.ydoc;
        const ymap = ydoc.getMap('container');

        //get camera data from parent
        const pos = new THREE.Vector3().fromArray(ymap.get('cameraPosition'));
        const quat = new THREE.Quaternion().fromArray(ymap.get('cameraQuaternion'));

        const camera = el.sceneEl.camera;
        const player = el.player;

        player.position.set(pos.x, pos.y, pos.z);
        camera.quaternion.set(quat.x, quat.y, quat.z, quat.w);

        //render the scene
        renderer.render(el.sceneEl.object3D, camera);

        //send pixel data to parent
        renderer.readRenderTargetPixels(el.renderTarget, 0, 0, el.canvasWidth, el.canvasHeight, el.pixels);

        ydoc.transact(() => {
          ymap.set('childPixels', el.pixels);
        });
      });
    });
  },
});
