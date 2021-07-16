import { CSDT } from '../CSDT/dist/CSDT';
import { createCustomMessages } from './utils';

AFRAME.registerComponent('csdt-container-receiver', {
  schema: {
    player: { default: '' },
  },

  init: function () {
    const el = this.el;
    const data = this.data;

    const renderer = el.sceneEl.renderer;
    const conn = CSDT.connections.parent;

    createCustomMessages();

    el.isInContainer = false;
    el.camPos = new THREE.Vector3();
    el.camQuat = new THREE.Quaternion();

    el.sceneEl.addEventListener('loaded', () => {
      el.secondCam = el.sceneEl.camera.clone();
    });

    if (document.querySelector(data.player)) el.player = document.querySelector(data.player).object3D;
    else el.player = el.sceneEl.camera.el.object3D;

    conn.onMessage(
      CSDT.messages.open,
      () => {
        el.classList.add(conn.hash);

        //disable aframe's render loop
        //we sync our render with the parent site, rather than using a separate clock
        el.sceneEl.renderer.setAnimationLoop(null);

        const ydoc = conn.ydoc;
        const ymap = ydoc.getMap(conn.hash);

        el.canvasWidth = ymap.get('canvasWidth') ?? 0;
        el.canvasHeight = ymap.get('canvasHeight') ?? 0;
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

              const cameras = [el.sceneEl.camera, el.secondCam];
              cameras.forEach((camera) => {
                camera.aspect = el.canvasWidth / el.canvasHeight;
                camera.updateProjectionMatrix();
              });
            }

            if (c.has('cameraPosition')) el.camPos.fromArray(ymap.get('cameraPosition'));
            if (c.has('cameraQuaternion')) el.camQuat.fromArray(ymap.get('cameraQuaternion'));

            if (c.has('isInContainer')) el.isInContainer = ymap.get('isInContainer');
          });
        });

        //when the parent site requests a render
        conn.onMessage(CSDT.messages.render, () => {
          const el = this.el;
          const sceneEl = el.sceneEl;
          const renderer = sceneEl.renderer;
          const camera = el.isInContainer === true ? sceneEl.camera : el.secondCam;

          const pos = el.camPos;
          const quat = el.camQuat;

          if (el.isInContainer === true) {
            const player = el.player;
            player.position.set(pos.x, player.position.y, pos.z);
          } else {
            const player = el.secondCam;
            player.position.set(pos.x, pos.y, pos.z);
          }

          camera.quaternion.set(quat.x, quat.y, quat.z, quat.w);

          this.renderScene();

          //get pixel data
          renderer.readRenderTargetPixels(el.renderTarget, 0, 0, el.canvasWidth, el.canvasHeight, el.pixels);

          //send pixel data to parent
          //use an event rather than yjs to transfer data for performance reasons, el.pixels is very large
          conn.sendMessage(CSDT.messages.pixel, el.pixels);
        });

        //when the parent requests a preview
        conn.onMessage(CSDT.messages.preview, () => {
          const scene = el.sceneEl.object3D;
          conn.sendResponse(CSDT.messages.preview, JSON.stringify(scene.toJSON()));
        });
      },
      true
    );
  },

  //modified from https://github.com/aframevr/aframe/blob/b164623dfa0d2548158f4b7da06157497cd4ea29/src/core/scene/a-scene.js#L782
  renderScene: function () {
    const el = this.el;
    const sceneEl = el.sceneEl;
    const renderer = sceneEl.renderer;
    const camera = el.isInContainer === true ? sceneEl.camera : el.secondCam;

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

    renderer.render(sceneEl.object3D, camera);

    if (savedBackground) sceneEl.object3D.background = savedBackground;
  },
});
