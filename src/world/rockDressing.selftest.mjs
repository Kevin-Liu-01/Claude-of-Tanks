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
  BOULDER_KINDS, BOULDER_SEAT_Y, applyRockShaderHook, boulderKindFor, buildBoulderForm, makeRockDetail, paintBoulder, projectsInsideHull,
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

/** Closed: every edge between exactly two triangles once coincident points are welded (a fresh fracture's crisp arris
 * doubles its points: the face keeps the plane's normal, the weathered surface its own). */
function closedWelded(position, index) {
  const ids = new Map(), canon = new Int32Array(position.count);
  for (let i = 0; i < position.count; i++) {
    const key = `${Math.round(position.getX(i) * 1e5)},${Math.round(position.getY(i) * 1e5)},${Math.round(position.getZ(i) * 1e5)}`;
    if (!ids.has(key)) ids.set(key, ids.size);
    canon[i] = ids.get(key);
  }
  const edges = new Map();
  for (let t = 0; t < index.length; t += 3) for (const [i, j] of [[0, 1], [1, 2], [2, 0]]) {
    const a = canon[index[t + i]], b = canon[index[t + j]];
    if (a === b) continue;
    const key = a < b ? a * 1048576 + b : b * 1048576 + a;
    edges.set(key, (edges.get(key) ?? 0) + 1);
  }
  return [...edges.values()].every((c) => c === 2);
}

// --- the forms
assert.deepEqual([...BOULDER_KINDS], ['jointed block', 'corestone', 'bedded block', 'slab']);
const LITHOLOGIES = ['granite', 'gneiss', 'sandstone', 'limestone', 'slate', 'basalt', 'chalk'];
const tri = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
const meanLuma = {};
for (const lithology of LITHOLOGIES) {
  for (const seed of [2002, 77]) {
    for (const [detail, variant] of [[2, 0], [2, 1], [3, 2]]) {
      const legacy = legacyBoulder(detail, variant);
      const kind = boulderKindFor(lithology, variant);
      for (const subdiv of [6, 4]) {
        const label = `${lithology} seed ${seed}, ${BOULDER_KINDS[kind]}, ${subdiv === 6 ? 'desktop' : 'phone'}`;
        const form = buildBoulderForm(variant, noise, mulberry32(seed + 60 + variant), legacy.hull, subdiv, legacy.top, kind, lithology);
        const g = form.geometry, p = g.attributes.position, n = g.attributes.normal, index = g.index.array;
        assert.ok(form.edge.length === p.count && form.fresh.length === p.count && form.facet.length === p.count, `${label}: per-vertex facts`);
        assert.ok(index.length / 3 <= (subdiv === 6 ? 900 : 320), `${label}: within its budget (${index.length / 3} triangles)`);
        // closed: every block's every edge between exactly two triangles (coincident points welded)
        assert.ok(closedWelded(p, index), `${label}: closed`);
        let top = -Infinity, floor = Infinity;
        for (let i = 0; i < p.count; i++) {
          top = Math.max(top, p.getY(i)); floor = Math.min(floor, p.getY(i));
          assert.ok(Math.abs(Math.hypot(n.getX(i), n.getY(i), n.getZ(i)) - 1) < 1e-4, `${label}: unit normals`);
        }
        // the shading normals agree with the triangles they shade: none above the ground line flipped, and on the desktop
        // all but a couple of per cent within eighty-five degrees (a hidden groove under a ledge; a phone's arrises are one
        // segment across, coarse by design)
        let above = 0, loose = 0;
        for (let t = 0; t < index.length; t += 3) {
          const [a, b, c] = [index[t], index[t + 1], index[t + 2]];
          if ((p.getY(a) + p.getY(b) + p.getY(c)) / 3 < BOULDER_SEAT_Y) continue;
          e1.set(p.getX(b) - p.getX(a), p.getY(b) - p.getY(a), p.getZ(b) - p.getZ(a));
          e2.set(p.getX(c) - p.getX(a), p.getY(c) - p.getY(a), p.getZ(c) - p.getZ(a));
          tri.crossVectors(e1, e2);
          if (tri.length() < 1e-12) continue;
          tri.normalize();
          const dots = [a, b, c].map((v) => tri.x * n.getX(v) + tri.y * n.getY(v) + tri.z * n.getZ(v));
          above++;
          // (an edge-on sliver where three of a corner's points lie on one arc covers no pixel: it may sit at right angles)
          assert.ok(Math.max(...dots) > -0.15, `${label}: no triangle above the ground line faces against its normals`);
          if (Math.min(...dots) < 0.1) loose++;
        }
        if (subdiv === 6) assert.ok(loose <= Math.max(2, above * 0.02), `${label}: the normals agree with the triangles (${loose} of ${above} loose)`);
        assert.ok(Math.abs(top - legacy.top * 0.98) < 1e-5, `${label}: as tall as the legacy rock (its collider's cover)`);
        assert.ok(floor < -1.2, `${label}: the skirt runs deep under the ground (${floor.toFixed(2)}), so no slope bares its underside`);
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
        // flat joint faces and rounded arrises, both (a phone's arrises are one chamfer across, no point on their round)
        const faces = form.edge.filter((e) => e === 0).length / p.count, arrises = form.edge.filter((e) => e > 0.5).length / p.count;
        assert.ok(faces > 0.3, `${label}: joint faces (${faces.toFixed(2)})`);
        if (subdiv === 6) assert.ok(arrises > 0.1, `${label}: rounded arrises (${arrises.toFixed(2)})`);
        if (subdiv === 6) {
          // more than one block (a parted joint, a lobe, the beds) on the desktop kinds that have them
          const blocks = new Set(Array.from(form.facet, (t) => Math.round(t * 1e4))).size;
          if (BOULDER_KINDS[kind] !== 'slab') assert.ok(blocks >= 6, `${label}: its faces and blocks each a shade of their own (${blocks})`);
          const again = buildBoulderForm(variant, noise, mulberry32(seed + 60 + variant), legacy.hull, subdiv, legacy.top, kind, lithology);
          assert.equal(hashOf(again.geometry), hashOf(g), `${label}: a function of its seed`);
          const other = buildBoulderForm(variant, noise, mulberry32(seed + 61 + variant * 7), legacy.hull, subdiv, legacy.top, kind, lithology);
          assert.notEqual(hashOf(other.geometry), hashOf(g), `${label}: another seed, another rock`);
        }
        // the tone: a colour attribute in range; the chalk paler than the rest
        paintBoulder(form, null, lithology);
        const col = g.attributes.color;
        assert.ok(col && col.count === p.count, `${label}: a vertex tone`);
        let luma = 0;
        for (let i = 0; i < p.count; i++) {
          assert.ok(col.getX(i) >= 0 && col.getX(i) <= 1 && col.getY(i) >= 0 && col.getY(i) <= 1 && col.getZ(i) >= 0 && col.getZ(i) <= 1, `${label}: a bounded tone`);
          luma += col.getX(i) * 0.2126 + col.getY(i) * 0.7152 + col.getZ(i) * 0.0722;
        }
        meanLuma[lithology] = luma / p.count;
        const toned = buildBoulderForm(variant, noise, mulberry32(seed + 60 + variant), legacy.hull, subdiv, legacy.top, kind, lithology);
        paintBoulder(toned, (h, s, l) => [0.6, s, l], lithology);
        assert.notDeepEqual(Array.from(toned.geometry.attributes.color.array.slice(0, 9)), Array.from(col.array.slice(0, 9)), `${label}: the map's tone law reaches the stone`);
      }
    }
  }
}
// the forms the props build draws (its seed 2002 and its noise, its legacy rocks' three octaves and crease), every rock
// and tier: closed, no triangle above the ground line flipped, inside the hull, the skirt deep
{
  const propsNoise = new SimplexNoise({ random: mulberry32(2002 + 7) });
  for (let vi = 0; vi < 3; vi++) {
    const g = mergeVertices(new THREE.IcosahedronGeometry(1, vi === 2 ? 3 : 2));
    const p = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.set(p.getX(i), p.getY(i), p.getZ(i));
      const crease = Math.pow(1 - Math.abs(propsNoise.noise3d(v.x * 2.2 + vi * 31, v.y * 2.2 - 7, v.z * 2.2 + 13)), 5);
      const f = 1 + propsNoise.noise3d(v.x * 1.4 + vi * 9, v.y * 1.4, v.z * 1.4) * 0.30 + propsNoise.noise3d(v.x * 3.1 - vi * 17, v.y * 3.1 + 40, v.z * 3.1) * 0.13
        + propsNoise.noise3d(v.x * 6.8 + 91, v.y * 6.8 - vi * 5, v.z * 6.8) * 0.05 - crease * 0.115;
      v.multiplyScalar(f); v.y = Math.max(v.y, -0.55);
      p.setXYZ(i, v.x, v.y * 0.82, v.z);
    }
    const hull = convexHull2(Array.from({ length: p.count }, (_, i) => [p.getX(i), p.getZ(i)]));
    let legacyTop = 0;
    for (let i = 0; i < p.count; i++) legacyTop = Math.max(legacyTop, p.getY(i));
    for (const lithology of LITHOLOGIES) for (const subdiv of [6, 4]) {
      const label = `the props build's ${lithology} variant ${vi}, ${subdiv === 6 ? 'desktop' : 'phone'}`;
      const form = buildBoulderForm(vi, propsNoise, mulberry32(2002 + 60 + vi), hull, subdiv, legacyTop, boulderKindFor(lithology, vi), lithology);
      const fp = form.geometry.attributes.position, fn = form.geometry.attributes.normal, index = form.geometry.index.array;
      assert.ok(closedWelded(fp, index), `${label}: closed`);
      for (let t = 0; t < index.length; t += 3) {
        const [a, b, c] = [index[t], index[t + 1], index[t + 2]];
        if ((fp.getY(a) + fp.getY(b) + fp.getY(c)) / 3 < BOULDER_SEAT_Y) continue;
        e1.set(fp.getX(b) - fp.getX(a), fp.getY(b) - fp.getY(a), fp.getZ(b) - fp.getZ(a));
        e2.set(fp.getX(c) - fp.getX(a), fp.getY(c) - fp.getY(a), fp.getZ(c) - fp.getZ(a));
        tri.crossVectors(e1, e2);
        if (tri.length() < 1e-12) continue;
        tri.normalize();
        assert.ok(Math.max(...[a, b, c].map((w) => tri.x * fn.getX(w) + tri.y * fn.getY(w) + tri.z * fn.getZ(w))) > -0.15, `${label}: no triangle above the ground line flipped`);
      }
      const above = new THREE.BufferGeometry(), pts = [];
      let floor = Infinity;
      for (let i = 0; i < fp.count; i++) { floor = Math.min(floor, fp.getY(i)); if (fp.getY(i) >= BOULDER_SEAT_Y) pts.push(fp.getX(i), 0, fp.getZ(i)); }
      above.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
      assert.ok(projectsInsideHull(above, hull), `${label}: inside its legacy hull above the ground line`);
      assert.ok(floor < -1.2, `${label}: its skirt deep`);
      assert.ok(index.length / 3 <= (subdiv === 6 ? 900 : 320), `${label}: within its budget (${index.length / 3})`);
    }
  }
}
assert.ok(meanLuma.chalk > meanLuma.granite * 2.5, `the chalk is white (${meanLuma.chalk.toFixed(3)} against the granite's ${meanLuma.granite.toFixed(3)})`);
for (const lithology of LITHOLOGIES) for (let v = 0; v < 3; v++) assert.ok(BOULDER_KINDS[boulderKindFor(lithology, v)], `${lithology}: a kind for variant ${v}`);
assert.ok([0, 1, 2].every((v) => boulderKindFor('sandstone', v) !== 1), 'bedded rock breaks into blocks and slabs, never weathered corestones');
const outside = new THREE.BufferGeometry();
outside.setAttribute('position', new THREE.BufferAttribute(new Float32Array([5, 0, 5]), 3));
assert.equal(projectsInsideHull(outside, legacyBoulder(2, 0).hull), false, 'the hull test rejects a point outside');

// --- dressing per battlefield
for (const mapId of MAP_IDS) {
  const d = rockDressingFor(mapId, null);
  assert.ok(d.moss >= 0 && d.moss <= 1 && d.dust >= 0 && d.dust <= 1, `${mapId}: bounded weights`);
  assert.ok(d.soil.every((c) => c >= 0 && c <= 1), `${mapId}: a soil colour`);
  assert.ok(LITHOLOGIES.includes(d.lithology) && rockLithologyFor(mapId) === d.lithology, `${mapId}: a lithology`);
  assert.ok(d.lichen[0] >= 0 && d.lichen[0] <= 0.5 && d.lichen[1] >= 0 && d.lichen[1] <= 1 && d.lichen[2] === 0, `${mapId}: bounded lichen`);
  assert.ok([...d.lichenA, ...d.lichenB].every((c) => c >= 0 && c <= 1), `${mapId}: lichen colours`);
  assert.ok(d.varnish >= 0 && d.varnish <= 0.4, `${mapId}: bounded varnish`);
}
assert.ok(rockDressingFor('verdant', null).moss > 0.5 && rockDressingFor('desert', null).dust > 0.5, 'wet maps moss, arid maps dust');
assert.deepEqual([rockDressingFor('winter', null).moss, rockDressingFor('whiteout', null).dust], [0, 0], 'snow maps take neither');
assert.equal(rockDressingFor('winter', null, true).lichen[2], 1, 'a snow-capped map keeps its lichen to the steep faces');
assert.ok(rockDressingFor('desert', null).varnish > 0.2 && rockDressingFor('verdant', null).varnish === 0, 'arid maps varnish');
assert.deepEqual([rockDressingFor('mars', null).lichen[0], rockDressingFor('moon', null).lichen[0]], [0, 0], 'no lichen off the earth');
assert.equal(rockDressingFor('desert', null).lithology, 'sandstone');
assert.equal(rockDressingFor('verdant', null).lithology, 'chalk', 'Prokhorovka\'s exposed rock is chalk (wave 57: no erratics south of the glacial limit)');
assert.ok(['bedded block', 'slab'].includes(BOULDER_KINDS[boulderKindFor('sandstone', 0)]), 'sandstone beds');
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
assert.deepEqual(Object.keys(shader.uniforms).sort(), ['uRockDust', 'uRockLichen', 'uRockLichenA', 'uRockLichenB', 'uRockLichenTile', 'uRockMoss', 'uRockSoil', 'uRockVarnish']);
assert.equal(shader.uniforms.uRockLichenTile.value, tile);
assert.ok(shader.uniforms.uRockLichen.value.x > 0.1, 'the climate\'s lichen cover');
assert.match(shader.vertexShader, /attribute float aRockGround;[\s\S]*vRockAbove = vGrimeW\.y - aRockGround;/);
assert.match(shader.vertexShader, /#ifdef USE_INSTANCING\nattribute vec2 aRockSlope;\n#endif/, 'a boulder carries the slope of its ground');
assert.match(shader.vertexShader, /vRockAbove -= dot\(aRockSlope, vGrimeW\.xz - \(modelMatrix \* instanceMatrix\[3\]\)\.xz\);/, 'its ground line is a plane through its centre along that slope');
assert.match(shader.vertexShader, /vRockSeed = -1\.0;[\s\S]*#ifdef USE_INSTANCING[\s\S]*vRockSeed = fract\(sin\(dot\(instanceMatrix\[3\]\.xz/, 'the merged meshes are not boulders; an instance hashes its place');
assert.ok(!/uRockBeds|vRockBed|bedTint|rockParting/.test(shader.vertexShader + shader.fragmentShader), 'no painted strata (wave 57: the beds are the forms\' relief)');
assert.ok(!shader.fragmentShader.includes('#include <map_fragment>') && shader.fragmentShader.includes('texture2D(map, rockPw.yz)'), 'the map slot samples triplanar');
const frag = shader.fragmentShader;
assert.ok(frag.indexOf('#include <color_fragment>') < frag.indexOf('mossMask'), 'the dressing mixes after the vertex tone');
assert.ok(frag.indexOf('rockDetail') < frag.indexOf('{ grime }'), 'the detail multiplies before the grime block');
assert.ok(frag.indexOf('if (vRockSeed >= 0.0) {') < frag.indexOf('float lichen ='), 'the lichen on the boulders only');
assert.match(frag, /float cluster = smoothstep\(0\.5, 0\.68, texture2D\(uGrime, vGrimeW\.xz \* 0\.09/, 'the lichen grows in clusters, a few patches to a rock (wave 57: "confetti")');
assert.match(frag, /float exposed = smoothstep\(0\.15, 0\.75, vGrimeN\.y \+ 0\.45 \* weather\)/, 'on the tops and the weather side, never under');
assert.ok(frag.indexOf('float lichen =') < frag.indexOf('float mossMask'), 'the moss grows over the lichen');
assert.ok(frag.indexOf('#include <color_fragment>') < frag.indexOf('float rockSnow') && frag.includes('if (vRockSeed >= 0.0 && uRockLichen.z > 0.5)'), 'a snow map\'s boulders take their snow after their tone');
assert.match(frag, /float soilTop = \(texture2D\(uGrime, vGrimeW\.xz \* 0\.47 \+ vGrimeW\.y \* 0\.11\)\.g - 0\.5\) \* 0\.3;/, 'the soil band\'s top wanders (wave 57: "a ruler-straight base line")');
assert.ok(frag.indexOf('float soilMask') < frag.indexOf('if (vRockSeed >= 0.0) diffuseColor.rgb *= 0.55 + 0.45 * smoothstep('), 'the contact darkening over the soil band, boulders only');
assert.ok(!frag.includes('#include <normal_fragment_maps>') && frag.includes('texture2D(normalMap, rockPw.yz)'), 'the tangent-frame chunk is replaced by the triplanar perturbation');
const untiled = { uniforms: {}, vertexShader: grimed.vertexShader, fragmentShader: grimed.fragmentShader };
applyRockShaderHook(untiled, rockDressingFor('verdant', null));
assert.equal(untiled.uniforms.uRockLichen.value.x, 0, 'no tile, no lichen');
assert.throws(() => applyRockShaderHook({ uniforms: {}, vertexShader: '#include <common>', fragmentShader: '' }, rockDressingFor('verdant', null)), /anchor missing/);

// --- the producer
const source = readFileSync(new URL('./props.ts', import.meta.url), 'utf8');
const hullAt = source.indexOf('rockHulls.push(hull); // the collision proxy');
assert.ok(hullAt > 0 && hullAt < source.indexOf('const form = buildBoulderForm(vi, noi, mulberry32(seed + 60 + vi), hull, mobileProps ? 4 : 6, legacyTop, boulderKindFor(lithology, vi), lithology);'), 'the legacy hull is taken before the form is fitted inside it, as the map\'s rock breaks');
assert.match(source, /paintBoulder\(form, P\.rockTone, lithology\);\n\s*rockGeos\.push\(form\.geometry\);/);
assert.match(source, /rockGeos\[vi\]\.setAttribute\('aRockGround', new THREE\.InstancedBufferAttribute\(ground, 1\)\)/);
assert.match(source, /rockGeos\[vi\]\.setAttribute\('aRockSlope', new THREE\.InstancedBufferAttribute\(slope, 2\)\)/, 'every boulder the slope of its ground');
assert.match(source, /const rockContact = !snowCap && rockDressing\.dust < 0\.5;/, 'a contact patch round every boulder, but on snow and sand');
assert.match(source, /for \(const spot of rockSpots\) \{\n\s*dirtDiscs\.push\(conformedDisc\(spot\.x, spot\.z, spot\.r, [^\n]*\n\s*yield \{ fine: true, progress: false, stage: 'ground-foundation-instances' \};/,
  'the contact patches go to the ground decals, one private input and checkpoint each');
assert.match(source, /heightM: \(box\.max\.y - Math\.max\(box\.min\.y, -0\.6\)\) \* maxScale/, 'the shadow height is what can show, not the buried skirt');
assert.match(source, /materialKind === 'rock' \? rockHook\s*:/); // (the field print's own hook follows: the scenery lane, wave 48)
assert.match(source, /rock: new THREE\.MeshStandardMaterial\(\{\n\s*map: rockDetail\.albedo, normalMap: rockDetail\.normal/);
assert.match(source, /const rockDetail = yield\* makeRockDetail\(noi, aniso, rockLithologyFor\(mapId\)\);/);
assert.match(source, /textures: \[grimeTex, rockDetail\.lichen\]/, 'the shader-only lichen tile is declared on its world');
assert.match(source, /rockDressingFor\(mapId, P\.rockSoilTone \?\? null, snowCap\)[\s\S]{0,200}applyRockShaderHook\(shader, rockDressing, rockDetail\.lichen\)/);
console.log('rockDressing self-test passed: four boulder kinds over seven rocks closed, unflipped, flat-faced and round-arrissed, deep-skirted and inside their hulls, every map dressed, seven lithology tiles bounded, the lichen rank exact, the hook anchored');
