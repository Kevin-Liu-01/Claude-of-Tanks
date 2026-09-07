/** Opt-in, intentionally slow browser diagnostics; never a performance sample. */
export function installGlBufferProbe() {
  const receipt = { errors: [], draws: 0, activeObject: null, hookedRenderer: false };
  globalThis.__COT_GL_BUFFER_PROBE = receipt;
  const seen = new Set();
  const glProto = globalThis.WebGL2RenderingContext?.prototype;
  if (!glProto) return;
  const maxAttribsByGl = new WeakMap();

  function snapshotAttributes(gl) {
    const priorBuffer = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
    const program = gl.getParameter(gl.CURRENT_PROGRAM);
    const names = new Map();
    for (let index = 0; index < gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES); index++) {
      const attribute = gl.getActiveAttrib(program, index);
      if (attribute) names.set(gl.getAttribLocation(program, attribute.name), attribute.name);
    }
    let maxAttribs = maxAttribsByGl.get(gl);
    if (maxAttribs == null) {
      maxAttribs = gl.getParameter(gl.MAX_VERTEX_ATTRIBS);
      maxAttribsByGl.set(gl, maxAttribs);
    }
    const attributes = [];
    try {
      for (let index = 0; index < maxAttribs; index++) {
        if (!gl.getVertexAttrib(index, gl.VERTEX_ATTRIB_ARRAY_ENABLED)) continue;
        const buffer = gl.getVertexAttrib(index, gl.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        attributes.push({
          location: index,
          name: names.get(index) || null,
          bytes: gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE),
          size: gl.getVertexAttrib(index, gl.VERTEX_ATTRIB_ARRAY_SIZE),
          type: gl.getVertexAttrib(index, gl.VERTEX_ATTRIB_ARRAY_TYPE),
          stride: gl.getVertexAttrib(index, gl.VERTEX_ATTRIB_ARRAY_STRIDE),
          divisor: gl.getVertexAttrib(index, gl.VERTEX_ATTRIB_ARRAY_DIVISOR),
          offset: gl.getVertexAttribOffset(index, gl.VERTEX_ATTRIB_ARRAY_POINTER),
        });
      }
    } finally {
      gl.bindBuffer(gl.ARRAY_BUFFER, priorBuffer);
    }
    return attributes;
  }

  function describeObject() {
    const active = receipt.activeObject;
    if (!active) return null;
    const { object, geometry, material, camera } = active;
    const ancestors = [];
    for (let parent = object; parent; parent = parent.parent) {
      ancestors.push(parent.name || `${parent.type}#${parent.id}`);
    }
    const describe = (attribute) => attribute ? {
      count: attribute.count, itemSize: attribute.itemSize,
      bytes: attribute.array?.byteLength ?? attribute.data?.array?.byteLength,
      divisor: attribute.meshPerAttribute ?? attribute.data?.meshPerAttribute ?? 0,
      version: attribute.version ?? attribute.data?.version,
    } : null;
    return {
      ancestors, name: object.name, type: object.type, id: object.id,
      count: object.count, instanceCount: geometry.instanceCount,
      material: material.name, materialType: material.type,
      camera: camera.type, geometryId: geometry.id,
      drawRange: { ...geometry.drawRange },
      index: describe(geometry.index),
      instanceMatrix: describe(object.instanceMatrix),
      instanceColor: describe(object.instanceColor),
      attributes: Object.fromEntries(Object.entries(geometry.attributes).map(
        ([name, attribute]) => [name, describe(attribute)],
      )),
    };
  }

  for (const name of ['drawArraysInstanced', 'drawElementsInstanced']) {
    const original = glProto[name];
    glProto[name] = function (...args) {
      const result = original.apply(this, args);
      receipt.draws++;
      // This consumes native error flags. Every consumed failure is retained
      // in the receipt and must also fail the normal certification gate.
      const error = this.getError();
      if (error !== 0 && receipt.errors.length < 32) {
        const object = describeObject();
        const attributes = snapshotAttributes(this);
        const key = JSON.stringify([name, error, object?.id, attributes]);
        if (!seen.has(key)) {
          seen.add(key);
          const entry = {
            error, draw: name, args, object, attributes,
            phase: globalThis.__DEBUG?.game?.phase ?? 'boot',
            atMs: performance.now(), stack: new Error().stack,
          };
          receipt.errors.push(entry);
          console.warn(`[cot-gl-buffer] ${JSON.stringify(entry)}`);
        }
      }
      return result;
    };
  }

  // The native hooks start before boot; the renderer seam adds exact object
  // attribution as soon as the existing debug surface becomes available.
  const attach = () => {
    const renderer = globalThis.__DEBUG?.renderer;
    if (!renderer) {
      setTimeout(attach, 10);
      return;
    }
    const original = renderer.renderBufferDirect;
    renderer.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
      const previous = receipt.activeObject;
      receipt.activeObject = { camera, geometry, material, object };
      try {
        return original.call(this, camera, scene, geometry, material, object, group);
      } finally {
        receipt.activeObject = previous;
      }
    };
    receipt.hookedRenderer = true;
  };
  attach();
}
