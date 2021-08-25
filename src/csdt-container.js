import { CSDT } from '../CSDT/dist/CSDT';
import { createCustomMessages } from './utils';

AFRAME.registerComponent('csdt-container', {
  schema: {
    href: { default: '' },
    width: { default: 8 },
    height: { default: 8 },
    depth: { default: 8 },
    enableExternalRendering: { default: true },
    enableInteraction: { default: true },
    enableWireframe: { default: true },
  },

  init: function () {
    const el = this.el;
    const data = this.data;

    createCustomMessages();

    el.frames = 0;
    el.has_iframe_loaded = false;
    el.camPos = new THREE.Vector3();
    el.camQuat = new THREE.Quaternion();
    el.containerPos = new THREE.Vector3();
    el.connectionId = `container-${Math.random()}`;

    el.sceneEl.systems['csdt-container-manager'].containers.push({ el: el, data: data });

    //create container mesh
    const geometry1 = new THREE.BoxBufferGeometry(data.width, data.height, data.depth);
    const material1 = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
    el.containerMesh = new THREE.Mesh(geometry1, material1);
    el.containerMesh.visible = false;
    el.containerMesh.geometry.computeBoundingSphere();

    el.object3D.add(el.containerMesh);

    //create wireframe
    if (data.enableWireframe === true) {
      const geometry2 = new THREE.EdgesGeometry(geometry1);
      const material2 = new THREE.LineBasicMaterial({ color: '#ffffff' });
      const wireframe = new THREE.LineSegments(geometry2, material2);

      el.object3D.add(wireframe);
    }

    this.initializeIframe();
  },

  initializeIframe: function () {
    const el = this.el;
    const data = this.data;
    const canvas = el.sceneEl.canvas;

    el.conn = CSDT.openConnection(data.href, el.connectionId);

    el.conn.onResponse(
      CSDT.messages.open,
      () => {
        //not entirely sure why this setTimeout is needed, this is a scuffed fix but it works
        setTimeout(() => {
          const ydoc = el.conn.ydoc;
          el.ymap = ydoc.getMap(el.conn.hash);

          el.conn.onMessage(
            CSDT.messages.context,
            (data) => {
              if (!el.renderingPlane) {
                el.texture = new THREE.CanvasTexture(data.canvas);
                const geometry = new THREE.PlaneGeometry(canvas.width, canvas.height);
                const material = new THREE.MeshBasicMaterial({ transparent: true, map: el.texture });
                el.renderingPlane = new THREE.Mesh(geometry, material);
              } else {
                el.texture.needsUpdate = true;
              }
            },
            false,
            false
          );
        });
      },
      true
    );
  },

  update: function () {
    const el = this.el;
    const data = this.data;

    el.containerRadius = Math.sqrt(data.width ** 2 + data.depth ** 2) / 2;
  },

  syncData: function () {
    const el = this.el;
    const data = this.data;
    const camera = el.sceneEl.camera;
    const ydoc = el.conn.ydoc;
    const ymap = el.ymap;

    if (!ymap) return;

    //sync camera position
    el.camPos = camera.getWorldPosition(el.camPos);
    el.camQuat = camera.getWorldQuaternion(el.camQuat);

    el.containerPos = el.object3D.getWorldPosition(el.containerPos);
    el.containerPos.y -= data.height / 2;

    const isInContainer = el.sceneEl.systems['csdt-container-manager'].isInContainer({ el });
    if (ymap.get('isInContainer') !== isInContainer) {
      ymap.set('isInContainer', isInContainer);
    }

    //center child on the container
    el.camPos.sub(el.containerPos);

    //send camera position to child site
    ydoc.transact(() => {
      ymap.set('cameraPosition', el.camPos.toArray());
      ymap.set('cameraQuaternion', el.camQuat.toArray());
    });

    //tell child to render
    el.conn.sendMessage(CSDT.messages.render);
  },
});
