AFRAME.registerComponent('csdt-container-renderer', {
  init: function () {
    const el = this.el;

    el.camPos = new THREE.Vector3();
    el.tmpVector = new THREE.Vector3();

    //create rendering plane
    const geometry = new THREE.PlaneGeometry(512, 512);
    const material = new THREE.MeshBasicMaterial({ transparent: true });
    el.renderingPlane = new THREE.Mesh(geometry, material);

    //create frustrum
    el.frustum = new THREE.Frustum();
    el.frustumMatrix = new THREE.Matrix4();
  },

  tock: function () {
    const el = this.el;
    const canvas = el.sceneEl.canvas;
    const width = canvas.width;
    const height = canvas.height;
    const camera = el.sceneEl.camera;
    const renderer = el.sceneEl.renderer;
    const gl = renderer.getContext();
    const containers = el.sceneEl.containers;
    renderer.autoClear = false;

    //update things for rendering
    el.renderingPlane.geometry.dispose();
    el.renderingPlane.geometry = new THREE.PlaneGeometry(width, height);

    const orthoCamera = new THREE.OrthographicCamera(width / -2, width / 2, height / 2, height / -2, 1, 1000);
    orthoCamera.position.z = 5;

    el.frustumMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    el.frustum.setFromProjectionMatrix(el.frustumMatrix);

    //sort containers by distance to camera
    el.camPos = camera.getWorldPosition(el.camPos);
    containers.forEach((obj) => {
      obj.distance = obj.el.object3D.getWorldPosition(el.tmpVector).distanceTo(el.camPos);
    });
    containers.sort((a, b) => b.distance - a.distance);

    const containerMeshes = new THREE.Group();
    const textures = [];

    containers.forEach((obj) => {
      if (!obj.el) return;
      if (obj.el.connection_established !== true) return;
      if (el.frustum.intersectsObject(obj.el.containerMesh) === false) return;

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

    textures.forEach((texture) => {
      el.renderingPlane.material.map = texture;
      renderer.render(el.renderingPlane, orthoCamera);
      texture.dispose();
    });

    gl.stencilMask(0xff);
    gl.disable(gl.STENCIL_TEST);
  },
});
