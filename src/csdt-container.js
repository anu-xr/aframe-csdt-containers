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

    //create bounding box mesh
    const geometry1 = new THREE.BoxBufferGeometry(data.width, data.height, data.depth);
    const material1 = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry1, material1);
    mesh.visible = false;
    mesh.name = 'boundingBox';

    el.object3D.add(mesh);

    //create wireframe
    if (data.enableWireframe == true) {
      const geometry2 = new THREE.EdgesGeometry(geometry1);
      const material2 = new THREE.LineBasicMaterial({ color: '#ffffff' });
      const wireframe = new THREE.LineSegments(geometry2, material2);

      el.object3D.add(wireframe);
    }

    //create rendering plane
    const geometry3 = new THREE.PlaneGeometry(512, 512);
    const material3 = new THREE.MeshBasicMaterial({ transparent: true });
    el.renderingPlane = new THREE.Mesh(geometry3, material3);

    el.orthoCamera = new THREE.OrthographicCamera(-512, 512, 512, -512, 1, 1000);
    el.orthoCamera.position.z = 5;

    //create iframe
    const iframe = (el.iframe = document.createElement('iframe'));
    iframe.src = data.href;
    document.body.appendChild(iframe);

    const CSDT = (el.CSDT = new CSDTParent(iframe));

    //wait for iframe to fully load
    iframe.addEventListener('load', () => {
      //check for CSDT support
      CSDT.ping().then(() => {
        //open a connection
        CSDT.openConnection('container').then((d) => {
          if (d.connectionEstablished === true) {
            el.connection_established = true;
          }
        });
      });
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
    const ymap = ydoc.getMap('container');

    if (ymap.get('canvasWidth') === canvas.width && ymap.get('canvasHeight') === canvas.height) return;

    const width = canvas.width;
    const height = canvas.height;

    ydoc.transact(() => {
      ymap.set('canvasWidth', width);
      ymap.set('canvasHeight', height);
    });

    const geometry = new THREE.PlaneGeometry(width, height);
    const material = new THREE.MeshBasicMaterial({ transparent: true });
    el.renderingPlane = new THREE.Mesh(geometry, material);

    el.orthoCamera = new THREE.OrthographicCamera(width / -2, width / 2, height / 2, height / -2, 1, 1000);
    el.orthoCamera.position.z = 5;
  },

  syncData: function () {
    const el = this.el;
    const data = this.data;
    const camera = el.sceneEl.camera;

    const ydoc = el.CSDT.ydoc;
    const ymap = ydoc.getMap('container');

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

      const minFrameSkips = 1;
      const maxFrameSkips = 2;
      el.frameSkips = Math.min(Math.max(Math.floor(distance / el.containerRadius), minFrameSkips), maxFrameSkips);
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

  tock: function () {
    const el = this.el;
    const data = this.data;
    if (el.connection_established !== true) return;

    if (++el.frames % el.frameSkips === 0) {
      this.syncData();
    }

    const ydoc = el.CSDT.ydoc;
    const ymap = ydoc.getMap('container');

    const canvas = el.sceneEl.canvas;
    const width = canvas.width;
    const height = canvas.height;

    //read pixel data from child site
    const pixels = ymap.get('childPixels');
    const texture = new THREE.DataTexture(
      pixels,
      width,
      height,
      THREE.RGBAFormat,
      THREE.UnsignedByteType,
      THREE.UVMapping
    );

    el.renderingPlane.material.map = texture;

    const camera = el.sceneEl.camera;
    const renderer = el.sceneEl.renderer;
    const gl = renderer.getContext();

    renderer.autoClear = false;

    //render container into stencil buffer
    gl.enable(gl.STENCIL_TEST);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
    gl.stencilFunc(gl.ALWAYS, 1, 0xff);
    gl.stencilMask(0xff);

    const boundingBox = el.object3D.children.filter((c) => c.name === 'boundingBox')[0].clone();
    boundingBox.visible = true;
    renderer.render(boundingBox, camera);

    //render pixel data, using the stencil buffer as a mask
    renderer.clearDepth();
    gl.stencilFunc(gl.EQUAL, 1, 0xff);
    gl.stencilMask(0x00);

    renderer.render(el.renderingPlane, el.orthoCamera);

    gl.stencilMask(0xff);
    gl.disable(gl.STENCIL_TEST);

    texture.dispose();
  },
});
