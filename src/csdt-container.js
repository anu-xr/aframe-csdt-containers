import CSDT from '../CSDT/dist/csdt';
import { customMessages } from './constants';

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
    enableText: { default: false },
    enableWireframe: { default: false },
    enableDynamicFrameSkips: { default: true },
    minFrameSkips: { default: 1 },
    maxFrameSkips: { default: 2 },
  },

  init: function () {
    const el = this.el;
    const data = this.data;

    el.frames = 0;
    el.frameSkips = 1;
    el.has_iframe_loaded = false;
    el.connection_established = false;
    el.camPos = new THREE.Vector3();
    el.camQuat = new THREE.Quaternion();
    el.containerPos = new THREE.Vector3();
    el.connectionId = Math.random();

    //initialize CSDT if needed
    if (!window.CSDT) window.CSDT = new CSDT();

    //if there is not already a csdt-container-renderer entity, create one
    if (
      Array.from(el.sceneEl.children).reduce((acc, c) => acc || c.hasAttribute('csdt-container-renderer'), false) ===
      false
    ) {
      const entity = document.createElement('a-entity');
      entity.setAttribute('csdt-container-renderer', {});
      el.sceneEl.appendChild(entity);
    }

    //use sceneEl to store state
    if (!el.sceneEl.containers) {
      el.sceneEl.containers = [];
    }

    el.sceneEl.containers.push({ el: el, data: data });

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

    //create text
    if (data.enableText === true) {
      const text = document.createElement('a-text');
      text.setAttribute('value', data.href);
      text.setAttribute('position', { x: data.width / 2, y: data.height / 2 - 0.15, z: data.depth / 2 });
      text.setAttribute('rotation', '0 90 0');
      text.setAttribute('side', 'double');
      el.appendChild(text);
    }

    //initlize iframe
    if (data.enableInstantInitialization === true) {
      this.initializeIframe();
    }

    el.initializeIframe = () => this.initializeIframe();

    this.syncCanvasSize = AFRAME.utils.throttle(this.syncCanvasSize, 3000, this);
  },

  initializeIframe: function () {
    const el = this.el;
    const data = this.data;

    const CSDT = window.CSDT;
    customMessages.forEach((msg) => CSDT.createMessage(...msg));
    el.conn = CSDT.openConnection(data.href, el.connectionId);

    const ydoc = el.CSDT.ydoc;
    el.ymap = ydoc.getMap(CSDT.hash);

    //load a preview
    if (data.enablePreview === true) {
      if (data.enableExternalRendering === true) return;

      document.addEventListener(
        CSDT.messages.preview.getResponseTextFromChild(el.conn.hash),
        (res) => {
          const loader = new THREE.ObjectLoader();
          loader.parse(JSON.parse(String(res.detail)), (obj) => {
            obj.position.y -= data.height / 2;
            obj.position.add(el.object3D.getWorldPosition(new THREE.Vector3()));

            el.previewObj = obj;
          });
        },
        { once: true }
      );

      el.conn.sendMessage(CSDT.messages.preview);
    }

    //receive pixel data
    document.addEventListener(CSDT.messages.pixel.getText(), (e) => {
      el.pixels = new Uint8Array(e.detail);
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
    const ydoc = el.CSDT.ydoc;
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
    const ydoc = el.CSDT.ydoc;
    const ymap = el.ymap;

    //sync canvas size
    this.syncCanvasSize();

    //sync camera position
    el.camPos = camera.getWorldPosition(el.camPos);
    el.camQuat = camera.getWorldQuaternion(el.camQuat);

    el.containerPos = el.object3D.getWorldPosition(el.containerPos);
    el.containerPos.y -= data.height / 2;

    //change frameSkips based on distance to camera
    if (data.enableDynamicFrameSkips == true) {
      const distance = el.camPos.distanceTo(el.containerPos);

      el.frameSkips = Math.min(
        Math.max(Math.floor(distance / (el.containerRadius * 2)), data.minFrameSkips),
        data.maxFrameSkips
      );
    }

    //center child on the container
    el.camPos.sub(el.containerPos);

    //send info to child site
    ydoc.transact(() => {
      ymap.set('cameraPosition', el.camPos.toArray());
      ymap.set('cameraQuaternion', el.camQuat.toArray());
    });

    //tell child to render
    el.conn.sendMessage(window.CSDT.messages.render);
  },
});
