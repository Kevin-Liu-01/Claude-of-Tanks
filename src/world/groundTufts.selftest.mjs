// garage-env-276: the battle's own ground tufts on a Garage yard's patch (vegetation.ts createGroundTufts). Desert scrub,
// Wadi Rum's dry stalks and Carpathian rimed stalks on a 96 x 84 m area round a cleared 24 m square: each map grows
// some, none in the square or off the area, the desert's tint is its map's tuft tone, a second build from the seed is
// byte-identical, the cards' hook binds its own reach and centre, and dispose releases everything it registered.
// CPU only (native Canvas for the cards): no GPU, frame or art claim.
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import * as THREE from 'three';
import { createGroundTufts } from './vegetation.ts';
import { getMapConfig } from './maps/index.ts';

const area = { minX: -48, maxX: 48, minZ: -42, maxZ: 42 };
const cleared = (x, z) => Math.abs(x) < 12 && Math.abs(z) < 12;
const blocked = (x, _y, z) => cleared(x, z);
const field = { getHeightAt: (x, z) => 0.3 * Math.sin(x * 0.07) * Math.cos(z * 0.05) };

function engine() {
  const registered = new Map();
  return {
    registered,
    setupShadowMaterial(material, hook) { registered.set(material, hook); },
    releaseShadowMaterial(material) { return registered.delete(material); },
  };
}
function build(mapId, seed = 4207) {
  const ctx = engine();
  const tufts = createGroundTufts(field, ctx, getMapConfig(mapId), { seed, mapId, area, blocked, tier: 'desktop' });
  return { ctx, tufts };
}
function roots(tufts) {
  const out = [];
  for (const mesh of tufts.group.children) {
    const m = mesh.instanceMatrix.array, c = mesh.instanceColor.array;
    for (let i = 0; i < mesh.count; i++) out.push({ x: m[i * 16 + 12], y: m[i * 16 + 13], z: m[i * 16 + 14], rgb: [c[i * 3], c[i * 3 + 1], c[i * 3 + 2]] });
  }
  return out;
}

const priorDocument = globalThis.document;
globalThis.document = { createElement(tag) { assert.equal(tag, 'canvas'); return createCanvas(1, 1); } };
const counts = {};
try {
  for (const mapId of ['desert', 'badlands', 'winter']) {
    const { ctx, tufts } = build(mapId);
    const total = tufts.counts.lush + tufts.counts.dry;
    counts[mapId] = { ...tufts.counts };
    assert.ok(total > 0, `${mapId}: the patch grows tufts`);
    assert.equal(tufts.group.children.length, 2, `${mapId}: one mesh per card`);
    assert.deepEqual(tufts.group.children.map((m) => m.count), [tufts.counts.lush, tufts.counts.dry], `${mapId}: the counts are the meshes'`);
    const all = roots(tufts);
    for (const t of all) {
      assert.ok(!cleared(t.x, t.z), `${mapId}: no tuft in the cleared square (${t.x.toFixed(2)}, ${t.z.toFixed(2)})`);
      assert.ok(t.x >= area.minX && t.x <= area.maxX && t.z >= area.minZ && t.z <= area.maxZ, `${mapId}: no tuft off the area`);
      assert.ok(Math.abs(t.y - (field.getHeightAt(t.x, t.z) - 0.03)) < 1e-5, `${mapId}: rooted on the yard's ground`);
      assert.ok(t.rgb.every((v) => v >= 0 && v <= 1), `${mapId}: a tint, no crop's negated albedo`);
    }
    // the desert's tufts wear the desert's tuft tone (maps/desert.ts tuftTone: hue 0.115)
    if (mapId === 'desert') {
      const hsl = {}, colour = new THREE.Color();
      let worst = 0;
      for (const t of all) {
        colour.setRGB(t.rgb[0], t.rgb[1], t.rgb[2]).getHSL(hsl);
        worst = Math.max(worst, Math.abs(hsl.h - 0.115));
      }
      assert.ok(worst < 0.03, `desert: every tuft at the map's tuft hue (worst ${worst.toFixed(4)} off 0.115)`);
      counts.desert.worstHueOff = worst.toFixed(4);
    }
    // the cards' material: its own program key, the carpet's alpha card, a hook that binds the patch's reach and centre
    const materials = [...ctx.registered.keys()];
    assert.equal(materials.length, 2, `${mapId}: two materials registered`);
    for (const mat of materials) {
      assert.ok(mat instanceof THREE.MeshLambertMaterial && mat.alphaTest === 0.44 && mat.alphaToCoverage && mat.side === THREE.DoubleSide);
      assert.equal(mat.customProgramCacheKey(), 'garage-ground-tufts-v1', `${mapId}: not the carpet's key (its reach differs)`);
      const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
      ctx.registered.get(mat)(shader);
      assert.equal(shader.uniforms.uGrassFar.value, 150, `${mapId}: the patch whole from 20 m off its centre ((63.8 + 20) / 0.56)`);
      assert.equal(shader.uniforms.uWindTime.value, 0, `${mapId}: windless`);
      const cam = shader.uniforms.uCamPos.value;
      assert.deepEqual([cam.x, cam.y, cam.z], [0, field.getHeightAt(0, 0), 0], `${mapId}: the centre at ground height`);
    }
    tufts.update(1 / 60, new THREE.Vector3(30, 2, 30));
    for (const mat of materials) assert.equal(ctx.registered.get(mat) !== undefined, true);
    // deterministic: a second build from the seed writes the same bytes
    const again = build(mapId);
    for (let v = 0; v < 2; v++) {
      const a = tufts.group.children[v], b = again.tufts.group.children[v];
      // the bytes of each attribute's array, compared as a boolean (object3d-assert-lint: no graph objects inside an assert)
      const bytes = (attribute) => Buffer.from(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength);
      assert.ok(bytes(b.instanceMatrix).equals(bytes(a.instanceMatrix)), `${mapId}: byte-equal matrices`);
      assert.ok(bytes(b.instanceColor).equals(bytes(a.instanceColor)), `${mapId}: byte-equal colours`);
    }
    again.tufts.dispose();
    assert.equal(again.ctx.registered.size, 0);
    // dispose: every geometry, material and card texture released, nothing left registered or parented
    const parent = new THREE.Group().add(tufts.group);
    const owned = new Set(tufts.group.children.flatMap((m) => [m.geometry, m.material, m.material.map]));
    assert.equal(owned.size, 6, `${mapId}: two geometries, two materials, two cards`);
    const released = new Set();
    for (const r of owned) r.addEventListener('dispose', () => released.add(r));
    tufts.dispose();
    assert.equal(released.size, owned.size, `${mapId}: every resource disposed`);
    assert.equal(ctx.registered.size, 0, `${mapId}: nothing left registered`);
    assert.equal(parent.children.length, 0, `${mapId}: off its parent`);
  }
  // a different seed deals a different patch
  const a = build('desert', 1), b = build('desert', 2);
  assert.notDeepEqual(roots(a.tufts).slice(0, 8), roots(b.tufts).slice(0, 8), 'the seed deals the patch');
  a.tufts.dispose(); b.tufts.dispose();
} finally {
  if (priorDocument === undefined) delete globalThis.document;
  else globalThis.document = priorDocument;
}
console.log(`groundTufts: the battle's tufts on a 96 x 84 m yard (lush/dry ${Object.entries(counts).map(([id, c]) => `${id} ${c.lush}/${c.dry}`).join(', ')}; `
  + `desert hue within ${counts.desert.worstHueOff} of its tone), none in the cleared square or off the area, byte-identical from the seed, `
  + 'own program key and reach, dispose releases all PASS; no GPU/art claim');
