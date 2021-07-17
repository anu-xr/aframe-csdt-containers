AFRAME.registerSystem('csdt-container-manager', {
  init: function () {
    const el = this.el;

    this.containers = [];

    el.camPos = new THREE.Vector3();
    el.tmpVector = new THREE.Vector3();
    el.raycaster = new THREE.Raycaster();
    el.raycastCoords = new THREE.Vector2(0, 0);

    const width = 0;
    const height = 0;

    const geometry = new THREE.PlaneGeometry(width, height);
    const material = new THREE.MeshBasicMaterial({ transparent: true });
    el.renderingPlane = new THREE.Mesh(geometry, material);

    el.orthoCamera = new THREE.OrthographicCamera(width / -2, width / 2, height / 2, height / -2, 1, 1000);
    el.orthoCamera.position.z = 5;

    el.frustum = new THREE.Frustum();
    el.frustumMatrix = new THREE.Matrix4();
  },

  isInContainer: function (containerObj) {
    const el = this.el;
    const camera = el.sceneEl.camera;
    const mesh = containerObj.el.containerMesh;

    el.raycaster.setFromCamera(el.raycastCoords, camera);
    const intersects = el.raycaster.intersectObject(mesh);

    if (intersects.length % 2 === 1) return true;
    return false;
  },

  handleInputEvent: function (e, target) {
    const containers = this.containers;

    containers.forEach((obj) => {
      const iframe = obj.el.conn?.iframe;
      if (!iframe) return;

      const isInContainer = this.isInContainer(obj);
      if (isInContainer !== true) return;

      //send input to child site
      switch (target) {
        case 'document':
          iframe.contentDocument.dispatchEvent(e);
          break;
        case 'canvas':
          const hash = obj.el.conn.hash;
          const reciever = iframe.contentDocument.getElementsByClassName(hash)[0];
          if (!reciever) return;
          reciever.sceneEl.canvas.dispatchEvent(e);
          break;
        case 'leftHand':
          {
            const player = iframe.contentDocument.querySelector('a-player');
            if (!player) break;
            const hand = player.components['grabbing']?._left.hand;
            if (!hand) break;
            hand.dispatchEvent(e);
          }
          break;
        case 'rightHand':
          {
            const player = iframe.contentDocument.querySelector('a-player');
            if (!player) break;
            const hand = player.components['grabbing']?._right.hand;
            if (!hand) break;
            hand.dispatchEvent(e);
          }
          break;
      }
    });
  },

  tick: function () {
    this.el.sceneEl.renderer.clear(true, true, true);
  },

  tock: function () {
    const containers = this.containers;
    if (containers.length === 0) return;

    const el = this.el;
    const canvas = el.sceneEl.canvas;
    const width = canvas.width;
    const height = canvas.height;
    const camera = el.sceneEl.camera;
    const renderer = el.sceneEl.renderer;
    const gl = renderer.getContext();
    renderer.autoClear = false;

    el.emit('tock');

    if (el.renderingPlane.geometry.width !== width || el.renderingPlane.geometry.height !== height) {
      el.renderingPlane.geometry.dispose();
      el.renderingPlane.geometry = new THREE.PlaneGeometry(width, height);

      el.orthoCamera = new THREE.OrthographicCamera(width / -2, width / 2, height / 2, height / -2, 1, 1000);
      el.orthoCamera.position.z = 5;
    }

    el.frustumMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    el.frustum.setFromProjectionMatrix(el.frustumMatrix);

    //sort containers by distance to camera
    //render farthest first
    el.camPos = camera.getWorldPosition(el.camPos);
    containers.forEach((obj) => {
      obj.distance = obj.el.object3D.getWorldPosition(el.tmpVector).distanceTo(el.camPos);
    });
    containers.sort((a, b) => b.distance - a.distance);

    const containerMeshes = new THREE.Group();
    const textures = [];
    const previews = [];

    containers.forEach((obj) => {
      if (!obj.el) return;
      if (el.frustum.intersectsObject(obj.el.containerMesh) === false) return;
      if (obj.el.conn?.connectionOpened !== true) return;

      if (obj.data.enableExternalRendering === false) {
        const isInContainer = this.isInContainer(obj);

        if (isInContainer === false) {
          if (!obj.el.previewObj) return;

          previews.push(obj.el.previewObj);
          containerMeshes.add(obj.el.containerMesh);
          return;
        }

        if (!obj.el.iframe) obj.el.initializeIframe();
      }

      if (++obj.el.frames % obj.el.frameSkips === 0) {
        obj.el.components['csdt-container'].syncData();
      }

      //read pixel data from child site
      const texture = new THREE.DataTexture(
        obj.el.pixels,
        width,
        height,
        THREE.RGBAFormat,
        THREE.UnsignedByteType,
        THREE.UVMapping
      );

      textures.push(texture);
      containerMeshes.add(obj.el.containerMesh);
    });

    //render containers into stencil buffer
    gl.enable(gl.STENCIL_TEST);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
    gl.stencilFunc(gl.ALWAYS, 1, 0xff);
    gl.stencilMask(0xff);

    containerMeshes.children.forEach((obj) => (obj.visible = true));
    renderer.render(containerMeshes, camera);
    containerMeshes.children.forEach((obj) => (obj.visible = false));

    //render pixel data, using the stencil buffer as a mask
    renderer.clearDepth();
    gl.stencilFunc(gl.EQUAL, 1, 0xff);
    gl.stencilMask(0x00);

    previews.forEach((obj) => {
      renderer.render(obj, camera);
    });

    textures.forEach((texture) => {
      el.renderingPlane.material.map = texture;
      renderer.render(el.renderingPlane, el.orthoCamera);
      texture.dispose();
    });

    gl.stencilMask(0xff);
    gl.disable(gl.STENCIL_TEST);
  },
});
