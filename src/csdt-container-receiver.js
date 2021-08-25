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
        renderer.setAnimationLoop(null);

        const ydoc = conn.ydoc;
        const ymap = ydoc.getMap(conn.hash);

        ymap.observe((e) => {
          const changed = e.transaction.changed;
          //update things based on ymap data changes
          changed.forEach((c) => {
            if (c.has('cameraPosition')) el.camPos.fromArray(ymap.get('cameraPosition'));
            if (c.has('cameraQuaternion')) el.camQuat.fromArray(ymap.get('cameraQuaternion'));

            if (c.has('isInContainer')) {
              el.isInContainer = ymap.get('isInContainer');
              el.player.visible = el.isInContainer;
            }
          });
        });

        //when the parent site requests a render
        conn.onMessage(CSDT.messages.render, () => {
          const pos = el.camPos;
          const quat = el.camQuat;

          if (el.isInContainer === true) {
            el.player.position.set(pos.x, el.player.position.y, pos.z);
            const group = el.sceneEl.camera.el.object3D;
            group.children.forEach((child) => {
              child.quaternion.set(quat.x, quat.y, quat.z, quat.w);
            });
          } else {
            el.secondCam.position.set(pos.x, pos.y, pos.z);
            el.secondCam.quaternion.set(quat.x, quat.y, quat.z, quat.w);
          }

          this.renderScene();

          const ctx = renderer.getContext();
          conn.sendMessage(CSDT.messages.context, ctx);
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
