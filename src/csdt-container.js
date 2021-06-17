import { CSDTParent } from './lib/csdt/export';

AFRAME.registerComponent('csdt-container', {
  schema: {
    href: { default: '' },
    width: { default: 8 },
    height: { default: 8 },
    depth: { default: 8 },
    enableWireframe: { default: false },
    enableDynamicFrameSkips: { default: true },
    minFrameSkips: { default: 1 },
    maxFrameSkips: { default: 2 },
  },

  init: function () {
    const el = this.el;
    const data = this.data;

    el.frames = 0;
    el.has_iframe_loaded = false;
    el.connection_established = false;
    el.camPos = new THREE.Vector3();
    el.camQuat = new THREE.Quaternion();
    el.containerPos = new THREE.Vector3();

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

    el.sceneEl.containers.push({ el: el });

    //create container mesh
    const geometry1 = new THREE.BoxBufferGeometry(data.width, data.height, data.depth);
    const material1 = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
    el.containerMesh = new THREE.Mesh(geometry1, material1);
    el.containerMesh.visible = false;
    el.containerMesh.geometry.computeBoundingSphere();

    el.object3D.add(el.containerMesh);

    //create wireframe
    if (data.enableWireframe == true) {
      const geometry2 = new THREE.EdgesGeometry(geometry1);
      const material2 = new THREE.LineBasicMaterial({ color: '#ffffff' });
      const wireframe = new THREE.LineSegments(geometry2, material2);

      el.object3D.add(wireframe);
    }

    //create iframe
    const iframe = (el.iframe = document.createElement('iframe'));
    iframe.src = data.href;
    document.body.appendChild(iframe);

    const CSDT = (el.CSDT = new CSDTParent(iframe));
    const ydoc = el.CSDT.ydoc;
    el.ymap = ydoc.getMap(CSDT.hash);

    //wait for iframe to fully load
    iframe.addEventListener('load', () => {
      //open a CSDT connection
      CSDT.openConnection('container').then((res) => {
        if (res === true) {
          el.connection_established = true;
        }
      });
    });

    document.addEventListener(`${CSDT.hash}-pixel-data`, (e) => {
      el.pixels = new Uint8Array(e.detail);
    });

    this.syncCanvasSize = AFRAME.utils.throttle(this.syncCanvasSize, 3000, this);
  },

  update: function () {
    const el = this.el;
    const data = this.data;

    el.containerRadius = Math.sqrt(data.width ** 2 + data.depth ** 2) / 2;
    el.frameSkips = data.minFrameSkips;
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
    el.CSDT.dispatchEvent('CSDT-render');
  },
});
