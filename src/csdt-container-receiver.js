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
    el.camPos = new THREE.Vector3();
    el.camQuat = new THREE.Quaternion();

    document.addEventListener('CSDT-connection-open', (e) => {
      el.connection_opened = true;
      CSDT.responseConnectionOpen(true);

      //disable aframe's render loop
      //we sync our render with the parent site, rather than using a separate clock
      el.sceneEl.renderer.setAnimationLoop(null);

      const ydoc = CSDT.ydoc;
      const ymap = ydoc.getMap('container');

      el.canvasWidth = ymap.get('canvasWidth') || 512;
      el.canvasHeight = ymap.get('canvasHeight') || 512;

      el.pixels = new Uint8Array(el.canvasWidth * el.canvasHeight * 4);

      el.renderTarget = new THREE.WebGLRenderTarget(el.canvasWidth, el.canvasHeight);
      renderer.setRenderTarget(el.renderTarget);

      ymap.observe((e) => {
        const changed = e.transaction.changed;
        //update things based on ymap data changes
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

          if (c.has('cameraPosition')) el.camPos.fromArray(ymap.get('cameraPosition'));
          if (c.has('cameraQuaternion')) el.camQuat.fromArray(ymap.get('cameraQuaternion'));
        });
      });

      //when the parent site tells us to render
      document.addEventListener('CSDT-render', () => {
        const el = this.el;
        const sceneEl = el.sceneEl;
        const renderer = sceneEl.renderer;
        const camera = sceneEl.camera;

        const pos = el.camPos;
        const quat = el.camQuat;
        const player = el.player;

        player.position.set(pos.x, pos.y, pos.z);
        camera.quaternion.set(quat.x, quat.y, quat.z, quat.w);

        this.renderScene();

        //get pixel data
        renderer.readRenderTargetPixels(el.renderTarget, 0, 0, el.canvasWidth, el.canvasHeight, el.pixels);

        //send pixel data to parent
        //use an event rather than yjs to transfer data for performance reasons, el.pixels is very large
        const response = new CustomEvent('CSDT-pixel-data', { detail: el.pixels });
        parent.document.dispatchEvent(response);
      });
    });
  },

  //modified from https://github.com/aframevr/aframe/blob/b164623dfa0d2548158f4b7da06157497cd4ea29/src/core/scene/a-scene.js#L782
  renderScene: function () {
    const el = this.el;
    const sceneEl = el.sceneEl;
    const renderer = sceneEl.renderer;

    const delta = sceneEl.clock.getDelta() * 1000;
    const time = sceneEl.clock.elapsedTime * 1000;

    if (sceneEl.isPlaying) sceneEl.tick(time, delta);

    var savedBackground = null;
    if (sceneEl.is('ar-mode')) {
      // In AR mode, don't render the default background. Hide it, then
      // restore it again after rendering.
      savedBackground = sceneEl.object3D.background;
      sceneEl.object3D.background = null;
    }

    renderer.render(sceneEl.object3D, sceneEl.camera);

    if (savedBackground) sceneEl.object3D.background = savedBackground;
  },
});
