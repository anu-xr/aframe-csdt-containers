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
  },

  update: function () {
    const el = this.el;
    const data = this.data;

    el.containerRadius = Math.sqrt(data.width ** 2 + data.depth ** 2) / 2;
    el.frameSkips = data.minFrameSkips;
  },

  syncData: function () {
    const el = this.el;
    const data = this.data;

    const camera = el.sceneEl.camera;
    const canvas = el.sceneEl.canvas;

    const ydoc = el.CSDT.ydoc;
    const ymap = ydoc.getMap('container');

    //sync canvas size
    if (ymap.get('canvasWidth') !== canvas.width || ymap.get('canvasHeight') !== canvas.height) {
      ydoc.transact(() => {
        ymap.set('canvasWidth', canvas.width);
        ymap.set('canvasHeight', canvas.height);
      });

      const geometry = new THREE.PlaneGeometry(canvas.width, canvas.height);
      const material = new THREE.MeshBasicMaterial({ transparent: true });
      el.renderingPlane = new THREE.Mesh(geometry, material);
    }

    //sync camera position
    const camPos = camera.getWorldPosition(new THREE.Vector3());
    const camQuat = camera.getWorldQuaternion(new THREE.Quaternion());

    const containerPos = el.object3D.getWorldPosition(new THREE.Vector3());
    containerPos.y -= data.height / 2;

    //change frameSkips based on distance to camera
    if (data.enableDynamicFrameSkips == true) {
      const distance = camPos.distanceTo(containerPos);

      const minFrameSkips = 1;
      const maxFrameSkips = 2;
      el.frameSkips = Math.min(Math.max(Math.floor(distance / el.containerRadius), minFrameSkips), maxFrameSkips);
    }

    //center child on the container
    camPos.sub(containerPos);

    //send info to child site
    ydoc.transact(() => {
      ymap.set('cameraPosition', camPos.toArray());
      ymap.set('cameraQuaternion', camQuat.toArray());
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

    const orthoCamera = new THREE.OrthographicCamera(width / -2, width / 2, height / 2, height / -2, 1, 1000);
    orthoCamera.position.z = 5;

    renderer.render(el.renderingPlane, orthoCamera);

    gl.stencilMask(0xff);
    gl.disable(gl.STENCIL_TEST);

    texture.dispose();
  },
});
