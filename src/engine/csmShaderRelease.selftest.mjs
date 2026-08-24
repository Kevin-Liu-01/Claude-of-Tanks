import assert from 'node:assert/strict';

globalThis.window = globalThis.window || {};

const { releaseCsmShaderMaterial } = await import('./lighting.js');

function registeredMaterial() {
  const material = {
    isMaterial: true,
    defines: { USE_CSM: 1, CSM_CASCADES: 4, CSM_FADE: '' },
    onBeforeCompile: () => {},
    needsUpdate: false,
  };
  return { material, csm: { shaders: new Map([[material, { uniforms: {} }]]) } };
}

{
  const { material, csm } = registeredMaterial();
  assert.equal(releaseCsmShaderMaterial(csm, material), true);
  assert.equal(csm.shaders.size, 0, 'registry releases its strong material reference');
  assert.equal(material.onBeforeCompile, undefined, 'dead CSM compile hook is removed');
  assert.equal(material.defines.USE_CSM, undefined);
  assert.equal(material.defines.CSM_CASCADES, undefined);
  assert.equal(material.defines.CSM_FADE, undefined);
  assert.equal(material.needsUpdate, true);
  assert.equal(releaseCsmShaderMaterial(csm, material), false, 'release is idempotent');
}

{
  const keep = registeredMaterial().material;
  const dead = registeredMaterial().material;
  const csm = { shaders: new Map([[keep, null], [dead, null]]) };
  releaseCsmShaderMaterial(csm, dead);
  assert.deepEqual([...csm.shaders.keys()], [keep], 'unrelated live registrations survive');
  assert.equal(typeof keep.onBeforeCompile, 'function');
}

assert.equal(releaseCsmShaderMaterial(null, null), false);
assert.equal(releaseCsmShaderMaterial({}, { isMaterial: true }), false);

console.log('csmShaderRelease.selftest: material registry release contract passed');
