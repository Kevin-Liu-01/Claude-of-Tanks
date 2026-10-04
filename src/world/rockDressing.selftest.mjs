// The boulders (round 75 item 6, rebuilt by the scenery lane 2026-10-04 after gauntlet wave 52): a boulder is a block
// its joints cut and the weather rounded — a closed, welded, star-shaped surface with no folded or flipped triangle,
// its normals the surface's own (no triangle above the ground line spans more than a right angle of them), fitted
// inside the legacy hull the shards carry above the ground line and as tall as the legacy rock, with joint faces and
// arrises both present, and a function of its seed; its tone reads face, fracture and arris; every battlefield resolves
// a dressing (its lithology, beds, lichen, varnish); the detail tile is its lithology's and bounded, the lichen tile's
// coverage rank is exact; the hook patches the grime hook's anchors, keeps the beds, the varnish, the lichen and the
// contact darkening to the instanced boulders, and the producer keeps the legacy hull as the collision proxy.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SimplexNoise } from '../engine/simplexFast.ts';
import { convexHull2 } from './collision.ts';
import { MAP_IDS } from './maps/index.ts';
import {
  BOULDER_KINDS, BOULDER_SEAT_Y, applyRockShaderHook, buildBoulderForm, makeRockDetail, paintBoulder, projectsInsideHull,
  rockDressingFor, rockLithologyFor,
} from './rockDressing.ts';

function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const noise = new SimplexNoise({ random: mulberry32(1337 + 7) });

/** The legacy boulder: a welded icosphere with the props displacement law (a simplified twin of props.ts). */
function legacyBoulder(detail, variant) {
  const g = mergeVertices(new THREE.IcosahedronGeometry(1, detail));
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i), p.getZ(i));
    const f = 1 + noise.noise3d(v.x * 1.4 + variant * 9, v.y * 1.4, v.z * 1.4) * 0.3 + noise.noise3d(v.x * 3.1, v.y * 3.1 + 40, v.z * 3.1) * 0.13;
    v.multiplyScalar(f); v.y = Math.max(v.y, -0.55);
    p.setXYZ(i, v.x, v.y * 0.82, v.z);
  }
  const projected = [];
  let top = 0;
  for (let i = 0; i < p.count; i++) { projected.push([p.getX(i), p.getZ(i)]); top = Math.max(top, p.getY(i)); }
  return { hull: convexHull2(projected), top };
}

const hashOf = (g) => {
  const h = [];
  for (const [name, a] of Object.entries(g.attributes)) h.push(name, Buffer.from(a.array.buffer, a.array.byteOffset, a.array.byteLength).toString('base64'));
  h.push(Buffer.from(new Uint32Array(g.index.array).buffer).toString('base64'));
  return h.join('|');
};

// --- the forms
assert.deepEqual(BOULDER_KINDS.map((k) => k.name), ['jointed block', 'rounded boulder', 'bedded slab']);
const tri = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), centroid = new THREE.Vector3();
for (const seed of [2002, 77, 9001]) {
  for (const [detail, variant] of [[2, 0], [2, 1], [3, 2]]) {
    const legacy = legacyBoulder(detail, variant);
    for (const subdiv of [6, 4]) {
      const label = `seed ${seed}, ${BOULDER_KINDS[variant].name}, ${subdiv} a face`;
      const form = buildBoulderForm(variant, noise, mulberry32(seed + 60 + variant), legacy.hull, subdiv, legacy.top);
      const g = form.geometry, p = g.attributes.position, n = g.attributes.normal, index = g.index.array;
      assert.equal(index.length / 3, 10 * subdiv * subdiv + 4 * subdiv, `${label}: a cube-sphere's triangles, the buried floor a fan`);
      assert.equal(p.count, 6 * subdiv * subdiv + 2 - (subdiv - 1) ** 2 + 1, `${label}: welded (one vertex per grid point, shared normals)`);
      assert.ok(form.edge.length === p.count && form.fresh.length === p.count && form.facet.length === p.count, `${label}: per-vertex facts`);
      // closed: every edge between exactly two triangles
      const edges = new Map();
      for (let t = 0; t < index.length; t += 3) for (const [i, j] of [[0, 1], [1, 2], [2, 0]]) {
        const a = index[t + i], b = index[t + j], key = a < b ? a * 65536 + b : b * 65536 + a;
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
      assert.ok([...edges.values()].every((c) => c === 2), `${label}: closed`);
      let top = -Infinity, worstAbove = 1;
      for (let i = 0; i < p.count; i++) {
        top = Math.max(top, p.getY(i));
        assert.ok(Math.abs(Math.hypot(n.getX(i), n.getY(i), n.getZ(i)) - 1) < 1e-4, `${label}: unit normals`);
        assert.ok(n.getX(i) * p.getX(i) + n.getY(i) * p.getY(i) + n.getZ(i) * p.getZ(i) > 0, `${label}: normals face out`);
      }
      for (let t = 0; t < index.length; t += 3) {
        const [a, b, c] = [index[t], index[t + 1], index[t + 2]];
        e1.set(p.getX(b) - p.getX(a), p.getY(b) - p.getY(a), p.getZ(b) - p.getZ(a));
        e2.set(p.getX(c) - p.getX(a), p.getY(c) - p.getY(a), p.getZ(c) - p.getZ(a));
        tri.crossVectors(e1, e2).normalize();
        centroid.set(p.getX(a) + p.getX(b) + p.getX(c), p.getY(a) + p.getY(b) + p.getY(c), p.getZ(a) + p.getZ(b) + p.getZ(c)).divideScalar(3);
        assert.ok(tri.dot(centroid) > 0, `${label}: no triangle folds inward (star-shaped, unfolded)`);
        for (const v of [a, b, c]) assert.ok(tri.x * n.getX(v) + tri.y * n.getY(v) + tri.z * n.getZ(v) > 0.1, `${label}: the shading normals agree with every triangle`);
        if (centroid.y > BOULDER_SEAT_Y) {
          let spread = 1;
          for (const [u, w] of [[a, b], [b, c], [a, c]]) spread = Math.min(spread, n.getX(u) * n.getX(w) + n.getY(u) * n.getY(w) + n.getZ(u) * n.getZ(w));
          worstAbove = Math.min(worstAbove, spread);
        }
      }
      assert.ok(worstAbove > 0, `${label}: no triangle above the ground line spans more than a right angle of normal (${worstAbove.toFixed(3)})`);
      assert.ok(Math.abs(top - legacy.top * 0.98) < 1e-5, `${label}: as tall as the legacy rock (its collider's cover)`);
      // inside the legacy hull above the ground line; under it, where a slope's downhill side can bare the stone, within
      // a few per cent of it (a hull stopped by the collider never sinks into a rock it can see), more only deeper down
      const band = (lo, hi) => {
        const g2 = new THREE.BufferGeometry(), out = [];
        for (let i = 0; i < p.count; i++) if (p.getY(i) >= lo && p.getY(i) < hi) out.push(p.getX(i), 0, p.getZ(i));
        g2.setAttribute('position', new THREE.BufferAttribute(new Float32Array(out), 3));
        return g2;
      };
      assert.ok(projectsInsideHull(band(BOULDER_SEAT_Y, Infinity), legacy.hull), `${label}: inside the legacy hull above the ground line`);
      assert.ok(projectsInsideHull(band(BOULDER_SEAT_Y - 0.4, BOULDER_SEAT_Y), legacy.hull.map((c) => c * 1.04)), `${label}: within 4 % of it to 0.4 under the ground line`);
      assert.ok(projectsInsideHull(band(-Infinity, BOULDER_SEAT_Y - 0.4), legacy.hull.map((c) => c * 1.16)), `${label}: within 16 % of it deeper down`);
      // joint faces and arrises, both
      const faces = form.edge.filter((e) => e < 0.1).length / p.count, arrises = form.edge.filter((e) => e > 0.3).length / p.count;
      if (variant !== 1) assert.ok(faces > 0.3, `${label}: joint faces (${faces.toFixed(2)})`);
      assert.ok(arrises > 0.05, `${label}: rounded arrises (${arrises.toFixed(2)})`);
      if (subdiv === 6) {
        const again = buildBoulderForm(variant, noise, mulberry32(seed + 60 + variant), legacy.hull, subdiv, legacy.top);
        assert.equal(hashOf(again.geometry), hashOf(g), `${label}: a function of its seed`);
        const other = buildBoulderForm(variant, noise, mulberry32(seed + 61 + variant * 7), legacy.hull, subdiv, legacy.top);
        assert.notEqual(hashOf(other.geometry), hashOf(g), `${label}: another seed, another rock`);
      }
      // the tone: a colour attribute, the fresh fractures paler than the weathered faces
      paintBoulder(form, null);
      const col = g.attributes.color;
      assert.ok(col && col.count === p.count, `${label}: a vertex tone`);
      let freshL = 0, freshN = 0, oldL = 0, oldN = 0;
      for (let i = 0; i < p.count; i++) {
        const l = col.getX(i) + col.getY(i) + col.getZ(i);
        assert.ok(col.getX(i) >= 0 && col.getX(i) <= 1 && col.getZ(i) >= 0 && col.getZ(i) <= 1, `${label}: a bounded tone`);
        if (Math.abs(n.getY(i)) > 0.5) continue; // compare the sides (the tops take the cap tone)
        if (form.fresh[i] > 0.8) { freshL += l; freshN++; } else if (form.fresh[i] < 0.05) { oldL += l; oldN++; }
      }
      if (freshN > 3 && oldN > 3) assert.ok(freshL / freshN > oldL / oldN, `${label}: fresh fractures paler`);
      const toned = buildBoulderForm(variant, noise, mulberry32(seed + 60 + variant), legacy.hull, subdiv, legacy.top);
      paintBoulder(toned, (h, s, l) => [0.6, s, l]);
      assert.notDeepEqual(Array.from(toned.geometry.attributes.color.array.slice(0, 9)), Array.from(col.array.slice(0, 9)), `${label}: the map's tone law reaches the stone`);
    }
  }
}
const outside = new THREE.BufferGeometry();
outside.setAttribute('position', new THREE.BufferAttribute(new Float32Array([5, 0, 5]), 3));
assert.equal(projectsInsideHull(outside, legacyBoulder(2, 0).hull), false, 'the hull test rejects a point outside');

// --- dressing per battlefield
const LITHOLOGIES = ['granite', 'gneiss', 'sandstone', 'limestone', 'slate', 'basalt'];
for (const mapId of MAP_IDS) {
  const d = rockDressingFor(mapId, null);
  assert.ok(d.moss >= 0 && d.moss <= 1 && d.dust >= 0 && d.dust <= 1, `${mapId}: bounded weights`);
  assert.ok(d.soil.every((c) => c >= 0 && c <= 1), `${mapId}: a soil colour`);
  assert.ok(LITHOLOGIES.includes(d.lithology) && rockLithologyFor(mapId) === d.lithology, `${mapId}: a lithology`);
  assert.ok(d.beds[0] >= 0 && d.beds[0] <= 1 && d.beds[1] > 0.02 && d.beds[2] >= 0 && d.beds[2] < 1.4, `${mapId}: bounded beds`);
  assert.ok(d.lichen[0] >= 0 && d.lichen[0] <= 0.5 && d.lichen[1] >= 0 && d.lichen[1] <= 1 && d.lichen[2] === 0, `${mapId}: bounded lichen`);
  assert.ok([...d.lichenA, ...d.lichenB].every((c) => c >= 0 && c <= 1), `${mapId}: lichen colours`);
  assert.ok(d.varnish >= 0 && d.varnish <= 0.6, `${mapId}: bounded varnish`);
}
assert.ok(rockDressingFor('verdant', null).moss > 0.5 && rockDressingFor('desert', null).dust > 0.5, 'wet maps moss, arid maps dust');
assert.deepEqual([rockDressingFor('winter', null).moss, rockDressingFor('whiteout', null).dust], [0, 0], 'snow maps take neither');
assert.equal(rockDressingFor('winter', null, true).lichen[2], 1, 'a snow-capped map keeps its lichen to the steep faces');
assert.ok(rockDressingFor('desert', null).varnish > 0.3 && rockDressingFor('verdant', null).varnish === 0, 'arid maps varnish');
assert.deepEqual([rockDressingFor('mars', null).lichen[0], rockDressingFor('moon', null).lichen[0]], [0, 0], 'no lichen off the earth');
assert.equal(rockDressingFor('desert', null).lithology, 'sandstone');
assert.ok(rockDressingFor('desert', null).beds[0] > 0.5 && rockDressingFor('verdant', null).beds[0] === 0, 'sandstone beds, massive granite');
assert.notDeepEqual(rockDressingFor('coastal', null).lichenA, rockDressingFor('verdant', null).lichenA, 'the climate picks the lichen');
assert.notDeepEqual(rockDressingFor('railyard', (h, s, l) => [0.6, s, l]).soil, rockDressingFor('railyard', null).soil, 'the dirt tone law reaches the soil');

// --- the tiles
globalThis.ImageData = class { constructor(data, w, h) { this.data = data; this.width = w; this.height = h; } };
globalThis.document = { createElement() { const canvas = { width: 0, height: 0 }; canvas.getContext = () => ({ putImageData(image) { canvas.pixels = image.data; } }); return canvas; } };
try {
  const albedoHashes = new Set();
  for (const lithology of LITHOLOGIES) {
    const g = makeRockDetail(noise, 4, lithology);
    let steps = 0, r;
    do { r = g.next(); if (!r.done) { steps++; assert.deepEqual(r.value, { fine: true, stage: `rock-rows-${steps * 16}` }); } } while (!r.done);
    assert.equal(steps, 16, `${lithology}: sixteen row checkpoints`);
    assert.deepEqual(Object.keys(r.value).sort(), ['albedo', 'lichen', 'normal', 'surface']);
    for (const t of Object.values(r.value)) { assert.equal(t.image.width, 256); assert.equal(t.image.pixels.byteLength, 256 * 256 * 4); }
    assert.equal(r.value.albedo.colorSpace, THREE.SRGBColorSpace);
    assert.notEqual(r.value.lichen.colorSpace, THREE.SRGBColorSpace, `${lithology}: the lichen tile is data`);
    const nrm = r.value.normal.image.pixels; let minZ = 1, sumZ = 0;
    for (let i = 0; i < nrm.length; i += 4) { const z = nrm[i + 2] / 127.5 - 1; minZ = Math.min(minZ, z); sumZ += z; }
    assert.ok(minZ > 0.45 && sumZ / (256 * 256) > 0.9, `${lithology}: restrained relief (${minZ.toFixed(2)}, ${(sumZ / 65536).toFixed(3)})`);
    const alb = r.value.albedo.image.pixels; let dark = 0, sum = 0, sq = 0;
    for (let i = 0; i < alb.length; i += 4) { if (alb[i] < 140) dark++; sum += alb[i]; sq += alb[i] * alb[i]; }
    const mean = sum / 65536, sd = Math.sqrt(sq / 65536 - mean * mean);
    assert.ok(sd > 12 && mean > 175 && dark < 65536 * 0.35, `${lithology}: its grain present but the tile near-white (sd ${sd.toFixed(1)}, mean ${mean.toFixed(1)}, dark ${dark})`);
    albedoHashes.add(Buffer.from(alb.buffer).toString('base64'));
    const orm = r.value.surface.image.pixels;
    for (let i = 2; i < orm.length; i += 4) assert.equal(orm[i], 0, `${lithology}: no rust mask on the rock (the grime hook reads the blue)`);
    // the lichen rank: a cover c takes the top c of the tile
    const lich = r.value.lichen.image.pixels;
    for (const cover of [0.1, 0.25, 0.45]) {
      let taken = 0;
      for (let i = 0; i < lich.length; i += 4) if (lich[i] / 255 > 1 - cover) taken++;
      assert.ok(Math.abs(taken / 65536 - cover) < 0.02, `${lithology}: a cover of ${cover} takes ${(taken / 65536).toFixed(3)} of the tile`);
    }
    const species = new Set();
    for (let i = 1; i < lich.length; i += 4) if (lich[i - 1] > 0) species.add(lich[i] >> 4);
    assert.ok(species.size >= 12, `${lithology}: every colony rolls its own species`);
    for (const t of Object.values(r.value)) t.dispose();
  }
  assert.equal(albedoHashes.size, LITHOLOGIES.length, 'every lithology draws its own tile');
} finally { delete globalThis.ImageData; delete globalThis.document; }

// --- the hook
const grimed = {
  uniforms: {},
  vertexShader: '#include <common>\nvarying vec3 vGrimeW;\nvarying vec3 vGrimeN;\n#include <worldpos_vertex>\n{\n  vGrimeW = vec3(0.0);\n  vGrimeN = normalize(mat3(modelMatrix) * gn);\n}',
  fragmentShader: '#include <common>\nvarying vec3 vGrimeW;\nvarying vec3 vGrimeN;\nuniform sampler2D uGrime;\n#include <map_fragment>\n{ grime }\n#include <color_fragment>\n#include <normal_fragment_begin>\n#include <normal_fragment_maps>\n',
};
const tile = new THREE.DataTexture(new Uint8Array(4), 1, 1);
const shader = { uniforms: {}, vertexShader: grimed.vertexShader, fragmentShader: grimed.fragmentShader };
applyRockShaderHook(shader, rockDressingFor('verdant', null), tile);
assert.deepEqual(Object.keys(shader.uniforms).sort(), ['uRockBeds', 'uRockDust', 'uRockLichen', 'uRockLichenA', 'uRockLichenB', 'uRockLichenTile', 'uRockMoss', 'uRockSoil', 'uRockVarnish']);
assert.equal(shader.uniforms.uRockLichenTile.value, tile);
assert.ok(shader.uniforms.uRockLichen.value.x > 0.2, 'the climate\'s lichen cover');
assert.match(shader.vertexShader, /attribute float aRockGround;[\s\S]*vRockAbove = vGrimeW\.y - aRockGround;/);
assert.match(shader.vertexShader, /vRockSeed = -1\.0;[\s\S]*#ifdef USE_INSTANCING[\s\S]*vRockSeed = fract\(sin\(dot\(instanceMatrix\[3\]\.xz/, 'the merged meshes are not boulders; an instance hashes its place');
assert.match(shader.vertexShader, /vRockBed = dot\(transformed \* rockScale, rockBedN\) \/ uRockBeds\.y/, 'the beds lie in the boulder\'s own frame, in metres');
assert.ok(!shader.fragmentShader.includes('#include <map_fragment>') && shader.fragmentShader.includes('texture2D(map, rockPw.yz)'), 'the map slot samples triplanar');
const frag = shader.fragmentShader;
assert.ok(frag.indexOf('#include <color_fragment>') < frag.indexOf('mossMask'), 'the dressing mixes after the vertex tone');
assert.ok(frag.indexOf('rockDetail') < frag.indexOf('{ grime }'), 'the detail multiplies before the grime block');
assert.ok(frag.indexOf('if (vRockSeed >= 0.0) {') < frag.indexOf('float bedC') && frag.indexOf('float bedC') < frag.indexOf('float lichen ='), 'the beds and the lichen on the boulders only');
assert.ok(frag.indexOf('float lichen =') < frag.indexOf('float mossMask'), 'the moss grows over the lichen');
assert.match(frag, /float bedFade = 1\.0 - smoothstep\(0\.3, 0\.7, bedW\);/, 'beds finer than a pixel or two fade to their mean');
assert.ok(frag.indexOf('float soilMask') < frag.indexOf('if (vRockSeed >= 0.0) diffuseColor.rgb *= 0.6 + 0.4 * smoothstep(-0.04, 0.3, vRockAbove);'), 'the contact darkening on the soil skirt, boulders only');
assert.ok(!frag.includes('#include <normal_fragment_maps>') && frag.includes('texture2D(normalMap, rockPw.yz)'), 'the tangent-frame chunk is replaced by the triplanar perturbation');
const untiled = { uniforms: {}, vertexShader: grimed.vertexShader, fragmentShader: grimed.fragmentShader };
applyRockShaderHook(untiled, rockDressingFor('verdant', null));
assert.equal(untiled.uniforms.uRockLichen.value.x, 0, 'no tile, no lichen');
assert.throws(() => applyRockShaderHook({ uniforms: {}, vertexShader: '#include <common>', fragmentShader: '' }, rockDressingFor('verdant', null)), /anchor missing/);

// --- the producer
const source = readFileSync(new URL('./props.ts', import.meta.url), 'utf8');
const hullAt = source.indexOf('rockHulls.push(hull); // the collision proxy');
assert.ok(hullAt > 0 && hullAt < source.indexOf('const form = buildBoulderForm(vi, noi, mulberry32(seed + 60 + vi), hull, mobileProps ? 4 : 6, legacyTop);'), 'the legacy hull is taken before the form is fitted inside it');
assert.match(source, /paintBoulder\(form, P\.rockTone\);\n\s*rockGeos\.push\(form\.geometry\);/);
assert.match(source, /rockGeos\[vi\]\.setAttribute\('aRockGround', new THREE\.InstancedBufferAttribute\(ground, 1\)\)/);
assert.match(source, /materialKind === 'rock' \? rockHook\s*:/); // (the field print's own hook follows: the scenery lane, wave 48)
assert.match(source, /rock: new THREE\.MeshStandardMaterial\(\{\n\s*map: rockDetail\.albedo, normalMap: rockDetail\.normal/);
assert.match(source, /const rockDetail = yield\* makeRockDetail\(noi, aniso, rockLithologyFor\(mapId\)\);/);
assert.match(source, /textures: \[grimeTex, rockDetail\.lichen\]/, 'the shader-only lichen tile is declared on its world');
assert.match(source, /rockDressingFor\(mapId, P\.rockSoilTone \?\? null, snowCap\)[\s\S]{0,200}applyRockShaderHook\(shader, rockDressing, rockDetail\.lichen\)/);
console.log('rockDressing self-test passed: three boulder kinds closed, unfolded, smooth-shaded and inside their hulls, every map dressed, six lithology tiles bounded, the lichen rank exact, the hook anchored');
