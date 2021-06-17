AFRAME.registerPrimitive('a-container', {
  defaultComponents: {
    'csdt-container': {},
  },
  mappings: {
    href: 'csdt-container.href',
    width: 'csdt-container.width',
    height: 'csdt-container.height',
    depth: 'csdt-container.depth',
    wireframe: 'csdt-container.enableWireframe',
  },
});
