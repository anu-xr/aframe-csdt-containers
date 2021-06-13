import { CSDTParent } from './lib/csdt/export';

AFRAME.registerComponent('csdt-container', {
  schema: {
    href: { default: '' },
    width: { default: 8 },
    height: { default: 8 },
    depth: { default: 8 },
  },

  init: function () {
    const el = this.el;
    const data = this.data;

    el.has_iframe_loaded = false;
    el.connection_established = false;

    //create container mesh
    const geometry = new THREE.BoxBufferGeometry(data.width, data.height, data.depth);
    const material = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material);

    el.object3D.add(mesh);

    //create iframe
    const iframe = (el.iframe = document.createElement('iframe'));
    iframe.src = data.href;
    document.body.appendChild(iframe);

    const CSDT = (el.CSDT = new CSDTParent(iframe));

    //wait for iframe to fully load
    el.addEventListener('iframe loaded', () => {
      iframe.addEventListener('load', () => {
        //check for CSDT support
        CSDT.ping().then(() => {
          const ydoc = CSDT.ydoc;
          const ymap = ydoc.getMap('container');

          //open a connection
          CSDT.openConnection('container').then((d) => {
            if (d.connectionEstablished === true) {
              el.connection_established = true;
            }
          });
        });
      });
    });
  },

  tick: function () {
    const el = this.el;
    const data = this.data;

    if (el.has_iframe_loaded === false) {
      if (el.iframe?.contentDocument) {
        el.has_iframe_loaded = true;
        el.emit('iframe loaded');
      }
    }

    if (el.connection_established === true) {
      const camera = el.sceneEl.camera;
      const canvas = el.sceneEl.canvas;

      const ydoc = el.CSDT.ydoc;
      const ymap = ydoc.getMap('container');

      if (ymap.get('renderWidth') !== canvas.width) ymap.set('renderWidth', canvas.width);
      if (ymap.get('renderHeight') !== canvas.height) ymap.set('renderHeight', canvas.height);

      const camPos = camera.getWorldPosition(new THREE.Vector3());
      const camQuat = camera.getWorldQuaternion(new THREE.Quaternion());

      const containerPos = el.object3D.getWorldPosition(new THREE.Vector3());
      containerPos.y -= data.height / 2;

      camPos.sub(containerPos);

      //send info to child site
      ydoc.transact(() => {
        ymap.set('cameraPosition', camPos.toArray());
        ymap.set('cameraQuaternion', camQuat.toArray());
      });

      //tell child site rendering is starting
      el.CSDT.dispatchEvent('CSDT-tick');
    }
  },

  tock: function () {
    const el = this.el;
    if (el.connection_established !== true) return;
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

    const geometry = new THREE.PlaneGeometry(width, height);
    const material = new THREE.MeshBasicMaterial({ transparent: true, map: texture });
    const plane = new THREE.Mesh(geometry, material);

    const camera = el.sceneEl.camera;
    const renderer = el.sceneEl.renderer;
    const gl = renderer.getContext('webgl2', { preserveDrawingBuffer: true });

    renderer.autoClear = false;

    //render container into stencil buffer
    gl.enable(gl.STENCIL_TEST);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
    gl.stencilFunc(gl.ALWAYS, 1, 0xff);
    gl.stencilMask(0xff);

    renderer.render(new THREE.Scene().add(el.object3D), camera);

    //render pixel data, using the stencil buffer as a mask
    renderer.clearDepth();
    gl.stencilFunc(gl.EQUAL, 1, 0xff);
    gl.stencilMask(0x00);

    const orthoCamera = new THREE.OrthographicCamera(width / -2, width / 2, height / 2, height / -2, 1, 1000);
    orthoCamera.position.z = 5;
    const tmpScene = new THREE.Scene();
    tmpScene.add(plane);
    tmpScene.add(orthoCamera);
    renderer.render(tmpScene, orthoCamera);

    gl.stencilMask(0xff);
    gl.disable(gl.STENCIL_TEST);
  },
});
