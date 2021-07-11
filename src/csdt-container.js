import { CSDT } from '../CSDT/dist/CSDT';
import { createCustomMessages } from './utils';

AFRAME.registerComponent('csdt-container', {
  schema: {
    href: { default: '' },
    width: { default: 8 },
    height: { default: 8 },
    depth: { default: 8 },
    enableInstantInitialization: { default: true },
    enableExternalRendering: { default: true },
    enablePreview: { default: true },
    enableInteraction: { default: true },
    enableWireframe: { default: false },
    enableFrameSkips: { default: true },
  },

  init: function () {
    const el = this.el;
    const data = this.data;

    createCustomMessages();

    el.frames = 0;
    el.frameSkips = 1;
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

    //initlize iframe
    if (data.enableInstantInitialization === true) {
      this.initializeIframe();
    }

    this.syncCanvasSize = AFRAME.utils.throttle(this.syncCanvasSize, 1000, this);
  },

  initializeIframe: function () {
    const el = this.el;
    const data = this.data;

    el.conn = CSDT.openConnection(data.href, el.connectionId);

    const ydoc = el.conn.ydoc;
    el.ymap = ydoc.getMap(el.conn.hash);

    el.conn.onResponse(
      CSDT.messages.open,
      () => {
        ydoc.transact(() => {
          el.ymap.set('canvasWidth', 0);
          el.ymap.set('canvasHeight', 0);
        });
      },
      true
    );

    //load a preview
    if (data.enablePreview === true) {
      if (data.enableExternalRendering === false) {
        el.conn.sendMessageWithResponse(CSDT.messages.preview).then((res) => {
          const loader = new THREE.ObjectLoader();
          loader.parse(JSON.parse(String(res.detail)), (obj) => {
            obj.position.y -= data.height / 2;
            obj.position.add(el.object3D.getWorldPosition(new THREE.Vector3()));

            el.previewObj = obj;
          });
        });
      }
    }

    //receive pixel data
    el.conn.onMessage(CSDT.messages.pixel, (e) => {
      el.pixels = CSDT.messages.pixel.convertSent(e.detail);
    });
  },

  update: function () {
    const el = this.el;
    const data = this.data;

    el.containerRadius = Math.sqrt(data.width ** 2 + data.depth ** 2) / 2;
  },

  syncCanvasSize: function () {
    const el = this.el;
    const canvas = el.sceneEl.canvas;
    const ydoc = el.conn.ydoc;
    const ymap = el.ymap;

    if (ymap.get('canvasWidth') === canvas.width && ymap.get('canvasHeight') === canvas.height) return;

    const width = canvas.width;
    const height = canvas.height;

    ydoc.transact(() => {
      ymap.set('canvasWidth', width);
      ymap.set('canvasHeight', height);
    });
  },

  syncData: function () {
    const el = this.el;
    const data = this.data;
    const camera = el.sceneEl.camera;
    const ydoc = el.conn.ydoc;
    const ymap = el.ymap;

    //sync canvas size
    this.syncCanvasSize();

    //sync camera position
    el.camPos = camera.getWorldPosition(el.camPos);
    el.camQuat = camera.getWorldQuaternion(el.camQuat);

    el.containerPos = el.object3D.getWorldPosition(el.containerPos);
    el.containerPos.y -= data.height / 2;

    //change frameSkips based on distance to camera
    if (data.enableFrameSkips == true) {
      const distance = el.camPos.distanceTo(el.containerPos);

      const minFrameSkips = 1;
      const maxFrameSkips = 2;

      el.frameSkips = Math.min(Math.max(Math.floor(distance / (el.containerRadius * 2)), minFrameSkips), maxFrameSkips);
    }

    //center child on the container
    el.camPos.sub(el.containerPos);

    //send info to child site
    ydoc.transact(() => {
      ymap.set('cameraPosition', el.camPos.toArray());
      ymap.set('cameraQuaternion', el.camQuat.toArray());
    });

    //tell child to render
    el.conn.sendMessage(CSDT.messages.render);
  },
});
