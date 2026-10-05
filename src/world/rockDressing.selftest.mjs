// The boulders (round 75 item 6, rebuilt by the scenery lane 2026-10-04 after gauntlet waves 52, 57 and 66): a boulder
// is a weathered mass — a welded cube-sphere cast at the smooth maximum of its joints, lumped at three scales, at most
// one blended fracture: closed, unfolded, its normals the surface's own and facing out (no triangle above the ground
// line spans more than a right angle of them), fitted inside the legacy hull the shards carry above the ground line and
// as tall as the legacy rock, its skirt deep, hollowed and knobbed, and a function of its seed; its tone reads face,
// fracture, arris and hollow (the chalk a warm off-white, grey only in its hollows); every battlefield resolves a
// dressing (its lithology, the photographed stone's treatment, lichen, varnish); the stand-in tile is its lithology's,
// a mid grey on average, the lichen tile's coverage rank is exact; the hook patches the grime hook's anchors, multiplies
// the photographed stone's structure into the vertex tone, keeps the varnish, the lichen and the contact darkening to
// the instanced boulders, and the producer keeps the legacy hull as the collision proxy.
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
assert.deepEqual([...BOULDER_KINDS], ['block', 'rounded', 'slab']);
const LITHOLOGIES = ['granite', 'gneiss', 'sandstone', 'limestone', 'slate', 'basalt', 'chalk'];
const tri = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), centroid = new THREE.Vector3();
const meanLuma = {};
/** The weathered mass, every rock and tier: a welded cube-sphere (closed, unfolded, its normals the surface's own and
 * facing out, none above the ground line apart from the triangles it shades), as tall as the legacy rock and inside its
 * hull above the ground line, its skirt deep; broken up by the weather (hollows), its faces and arrises both present. */
function checkForm(form, label, hull, legacyTop, subdiv) {
  const g = form.geometry, p = g.attributes.position, n = g.attributes.normal, index = g.index.array;
  const cells = subdiv >= 6 ? 8 : 5;
  assert.equal(index.length / 3, 10 * cells * cells + 4 * cells, `${label}: a cube-sphere's triangles, the buried floor a fan`);
  assert.ok(index.length / 3 <= (subdiv >= 6 ? 900 : 320), `${label}: within its budget (${index.length / 3})`);
  assert.equal(p.count, 6 * cells * cells + 2 - (cells - 1) ** 2 + 1, `${label}: welded (one vertex per grid point, shared normals)`);
  assert.ok([form.edge, form.fresh, form.facet, form.hollow].every((a) => a.length === p.count), `${label}: per-vertex facts`);
  assert.ok(closedWelded(p, index), `${label}: closed`);
  let top = -Infinity, floor = Infinity, worstAbove = 1;
  for (let i = 0; i < p.count; i++) {
    top = Math.max(top, p.getY(i)); floor = Math.min(floor, p.getY(i));
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
    // (the buried floor's fan meets the flanks at a right angle: its rim shades as the flank does, and nothing sees it)
    if (centroid.y > BOULDER_SEAT_Y - 0.4) for (const v of [a, b, c]) assert.ok(tri.x * n.getX(v) + tri.y * n.getY(v) + tri.z * n.getZ(v) > 0.05, `${label}: the shading normals agree with every triangle a slope can bare`);
    if (centroid.y > BOULDER_SEAT_Y) {
      let spread = 1;
      for (const [u, w] of [[a, b], [b, c], [a, c]]) spread = Math.min(spread, n.getX(u) * n.getX(w) + n.getY(u) * n.getY(w) + n.getZ(u) * n.getZ(w));
      worstAbove = Math.min(worstAbove, spread);
    }
  }
  // (a phone's five cells a face cannot follow an arris its joints set at any azimuth: there a cell may straddle a little
  // more than the arris's turn)
  assert.ok(worstAbove > (subdiv >= 6 ? 0 : -0.35), `${label}: no triangle above the ground line spans more than a right angle of normal (${worstAbove.toFixed(3)})`);
  assert.ok(Math.abs(top - legacyTop * 0.98) < 1e-5, `${label}: as tall as the legacy rock (its collider's cover)`);
  assert.ok(floor < -1.2, `${label}: the skirt runs deep under the ground (${floor.toFixed(2)}), so no slope bares its underside`);
  // inside the legacy hull above the ground line; under it, where a slope's downhill side can bare the stone, within
  // a few per cent of it (a hull stopped by the collider never sinks into a rock it can see), more only deeper down
  const band = (lo, hi) => {
    const g2 = new THREE.BufferGeometry(), out = [];
    for (let i = 0; i < p.count; i++) if (p.getY(i) >= lo && p.getY(i) < hi) out.push(p.getX(i), 0, p.getZ(i));
    g2.setAttribute('position', new THREE.BufferAttribute(new Float32Array(out), 3));
    return g2;
  };
  assert.ok(projectsInsideHull(band(BOULDER_SEAT_Y, Infinity), hull), `${label}: inside the legacy hull above the ground line`);
  assert.ok(projectsInsideHull(band(BOULDER_SEAT_Y - 0.4, BOULDER_SEAT_Y), hull.map((c) => c * 1.04)), `${label}: within 4 % of it to 0.4 under the ground line`);
  assert.ok(projectsInsideHull(band(-Infinity, BOULDER_SEAT_Y - 0.4), hull.map((c) => c * 1.16)), `${label}: within 16 % of it deeper down`);
  // the weather's hollows (wave 57: "a bar-of-soap form"): a share of the stone hollowed, a share not
  const hollowed = form.hollow.filter((h) => h > 0.3).length / p.count, proud = form.hollow.filter((h) => h === 0).length / p.count;
  assert.ok(hollowed > 0.08 && proud > 0.3, `${label}: hollows and knobs (${hollowed.toFixed(2)} hollowed, ${proud.toFixed(2)} proud)`);
  // at most one fracture, blended: its share never a hard face's alone over a whole ring
  assert.ok(form.fresh.every((f) => f >= 0 && f <= 1), `${label}: a bounded fracture share`);
  return { p, n };
}
for (const lithology of LITHOLOGIES) {
  for (const seed of [2002, 77, 9001]) {
    for (const [detail, variant] of [[2, 0], [2, 1], [3, 2]]) {
      const legacy = legacyBoulder(detail, variant);
      const kind = boulderKindFor(lithology, variant);
      for (const subdiv of [6, 4]) {
        const label = `${lithology} seed ${seed}, ${BOULDER_KINDS[kind]}, ${subdiv === 6 ? 'desktop' : 'phone'}`;
        const form = buildBoulderForm(variant, noise, mulberry32(seed + 60 + variant), legacy.hull, subdiv, legacy.top, kind, lithology);
        const { p, n } = checkForm(form, label, legacy.hull, legacy.top, subdiv);
        const g = form.geometry;
        // broad faces and rounded arrises, both (the corestone is all arris)
        const faces = form.edge.filter((e) => e < 0.1).length / p.count, arrises = form.edge.filter((e) => e > 0.3).length / p.count;
        if (BOULDER_KINDS[kind] !== 'rounded') assert.ok(faces > (subdiv === 6 ? 0.1 : 0.05), `${label}: joint faces (${faces.toFixed(2)})`);
        assert.ok(arrises > 0.05, `${label}: rounded arrises (${arrises.toFixed(2)})`);
        if (subdiv === 6) {
          const again = buildBoulderForm(variant, noise, mulberry32(seed + 60 + variant), legacy.hull, subdiv, legacy.top, kind, lithology);
          assert.equal(hashOf(again.geometry), hashOf(g), `${label}: a function of its seed`);
          const other = buildBoulderForm(variant, noise, mulberry32(seed + 61 + variant * 7), legacy.hull, subdiv, legacy.top, kind, lithology);
          assert.notEqual(hashOf(other.geometry), hashOf(g), `${label}: another seed, another rock`);
        }
        // the tone: a colour attribute in range; the fracture paler than the weathered faces; the chalk paler than the
        // rest, its hollows greyer
        paintBoulder(form, null, lithology);
        const col = g.attributes.color;
        assert.ok(col && col.count === p.count, `${label}: a vertex tone`);
        let luma = 0, freshL = 0, freshN = 0, oldL = 0, oldN = 0, hollowS = 0, hollowN = 0, proudS = 0, proudN = 0;
        const hsl = { h: 0, s: 0, l: 0 }, c3 = new THREE.Color();
        for (let i = 0; i < p.count; i++) {
          assert.ok(col.getX(i) >= 0 && col.getX(i) <= 1 && col.getY(i) >= 0 && col.getY(i) <= 1 && col.getZ(i) >= 0 && col.getZ(i) <= 1, `${label}: a bounded tone`);
          const l = col.getX(i) * 0.2126 + col.getY(i) * 0.7152 + col.getZ(i) * 0.0722;
          luma += l;
          c3.setRGB(col.getX(i), col.getY(i), col.getZ(i)).getHSL(hsl, THREE.SRGBColorSpace);
          if (form.hollow[i] > 0.5) { hollowS += hsl.s; hollowN++; } else if (form.hollow[i] === 0) { proudS += hsl.s; proudN++; }
          if (Math.abs(n.getY(i)) > 0.5) continue; // compare the sides (the tops take the cap tone)
          if (form.fresh[i] > 0.8) { freshL += l; freshN++; } else if (form.fresh[i] < 0.05) { oldL += l; oldN++; }
        }
        meanLuma[lithology] = luma / p.count;
        if (freshN > 3 && oldN > 3) assert.ok(freshL / freshN > oldL / oldN, `${label}: the fracture paler`);
        if (lithology === 'chalk' && hollowN > 3 && proudN > 3) assert.ok(hollowS / hollowN < proudS / proudN * 0.6, `${label}: the chalk grey only in its hollows`);
        const toned = buildBoulderForm(variant, noise, mulberry32(seed + 60 + variant), legacy.hull, subdiv, legacy.top, kind, lithology);
        paintBoulder(toned, (h, s, l) => [0.6, s, l], lithology);
        assert.notDeepEqual(Array.from(toned.geometry.attributes.color.array.slice(0, 9)), Array.from(col.array.slice(0, 9)), `${label}: the map's tone law reaches the stone`);
      }
    }
  }
}
// the forms the props build draws (its seed 2002 and its noise, its legacy rocks' three octaves and crease), every rock
// and tier
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
      checkForm(buildBoulderForm(vi, propsNoise, mulberry32(2002 + 60 + vi), hull, subdiv, legacyTop, boulderKindFor(lithology, vi), lithology), label, hull, legacyTop, subdiv);
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
assert.ok([0, 1, 2].some((v) => BOULDER_KINDS[boulderKindFor('sandstone', v)] === 'slab'), 'sandstone parts in slabs');
assert.ok([0, 1, 2].filter((v) => BOULDER_KINDS[boulderKindFor('chalk', v)] === 'rounded').length >= 2, 'the chalk weathers round');
for (const mapId of MAP_IDS) {
  const [contrast, colour, relief] = rockDressingFor(mapId, null).photo;
  assert.ok(contrast > 0.3 && contrast <= 1.3 && colour >= 0 && colour <= 1 && relief > 0.3 && relief <= 1, `${mapId}: the photographed stone's treatment bounded`);
}
assert.ok(rockDressingFor('verdant', null).photo[0] < rockDressingFor('coastal', null).photo[0] * 0.5, 'the chalk takes the photo softly, the granite whole');
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
    // (the photographed stone's stand-in: a mid grey on average, as the photo is composed — the hook divides it out)
    assert.ok(sd > 5 && Math.abs(mean - 127.5) < 3, `${lithology}: its grain present about a mid grey (sd ${sd.toFixed(1)}, mean ${mean.toFixed(1)})`);
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
assert.deepEqual(Object.keys(shader.uniforms).sort(), ['uRockDust', 'uRockLichen', 'uRockLichenA', 'uRockLichenB', 'uRockLichenTile', 'uRockMoss', 'uRockPhoto', 'uRockSoil', 'uRockStoneMean', 'uRockVarnish']);
assert.deepEqual(shader.uniforms.uRockStoneMean.value.toArray(), [0.214, 0.214, 0.214], 'the stand-in\'s mid grey until the stone lands');
{
  const mean = new THREE.Vector3(0.1, 0.12, 0.14);
  const owned = { uniforms: {}, vertexShader: grimed.vertexShader, fragmentShader: grimed.fragmentShader };
  applyRockShaderHook(owned, rockDressingFor('verdant', null), tile, mean);
  assert.equal(owned.uniforms.uRockStoneMean.value, mean, 'the owner\'s vector, updated in place when the stone lands');
}
assert.deepEqual(shader.uniforms.uRockPhoto.value.toArray(), [...rockDressingFor('verdant', null).photo], 'the lithology\'s photo treatment');
assert.equal(shader.uniforms.uRockLichenTile.value, tile);
assert.ok(shader.uniforms.uRockLichen.value.x > 0.1, 'the climate\'s lichen cover');
assert.match(shader.vertexShader, /attribute float aRockGround;[\s\S]*vRockAbove = vGrimeW\.y - aRockGround;/);
assert.match(shader.vertexShader, /#ifdef USE_INSTANCING\nattribute vec2 aRockSlope;\n#endif/, 'a boulder carries the slope of its ground');
assert.match(shader.vertexShader, /vRockAbove -= dot\(aRockSlope, vGrimeW\.xz - \(modelMatrix \* instanceMatrix\[3\]\)\.xz\);/, 'its ground line is a plane through its centre along that slope');
assert.match(shader.vertexShader, /vRockSeed = -1\.0;[\s\S]*#ifdef USE_INSTANCING[\s\S]*vRockSeed = fract\(sin\(dot\(instanceMatrix\[3\]\.xz/, 'the merged meshes are not boulders; an instance hashes its place');
assert.ok(!/uRockBeds|vRockBed|bedTint|rockParting/.test(shader.vertexShader + shader.fragmentShader), 'no painted strata (wave 57: the beds are the forms\' relief)');
assert.ok(!shader.fragmentShader.includes('#include <map_fragment>') && shader.fragmentShader.includes('texture2D(map, rockPw.yz).rgb'), 'the map slot samples the stone triplanar, its colour too');
assert.match(shader.fragmentShader, /vec3 rockF = rockPhoto \/ max\(uRockStoneMean, vec3\(0\.01\)\);[\s\S]*mix\(vec3\(1\.0\), mix\(vec3\(rockFL\), rockF, uRockPhoto\.y\), uRockPhoto\.x\)/,
  'the photo multiplies its structure about its own mean, its contrast and colour the lithology\'s');
assert.match(shader.fragmentShader, /rockPert \* uRockPhoto\.z/, 'its relief at the lithology\'s strength');
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
assert.match(source, /for \(const spot of rockSpots\) \{\n\s*dirtDiscs\.push\(conformedDisc\(spot\.x, spot\.z, spot\.r, \[[^\]]*\], true\)\);\n\s*yield \{ fine: true, progress: false, stage: 'ground-foundation-instances' \};/,
  'the contact patches go to the ground decals, conformed to the drawn mesh, one private input and checkpoint each');
// (wave 74, Coastal boulder-a: a patch conformed to the analytic height floated over a bank's drawn lip): the patch lies
// on the nearest terrain mesh — its grid and its diagonal those terrain.ts draws
{
  const terrainSource = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
  assert.match(terrainSource, /const MAP_SIZE = 1024;/);
  assert.match(terrainSource, /const CHUNKS = 8, CHUNK_SIZE = MAP_SIZE \/ CHUNKS;\nconst LOD_SEGS = \[96, 48, 24\];/);
  assert.match(terrainSource, /idx\[ii\+\+\] = a; idx\[ii\+\+\] = c; idx\[ii\+\+\] = b;\n\s*idx\[ii\+\+\] = b; idx\[ii\+\+\] = c; idx\[ii\+\+\] = d;/,
    'the terrain splits a cell along the diagonal from its +x corner to its +z corner');
  assert.match(source, /const TERRAIN_NEAR_STEP = 1024 \/ 8 \/ 96;/);
  assert.match(source, /if \(fx \+ fz <= 1\) \{[\s\S]{0,140}return ha \+ \(at\(gx \+ 1, gz\) - ha\) \* fx \+ \(at\(gx, gz \+ 1\) - ha\) \* fz;/,
    'the patch reads the mesh\'s own triangle under it');
}
assert.match(source, /const heightM = \(box\.max\.y - Math\.max\(box\.min\.y, -0\.6\)\) \* maxScale;/, 'the shadow height is what can show, not the buried skirt');
// the cascade trim (wave 74: 672-triangle rocks in every cascade): on the desktop the phone form beside the desktop one;
// the desktop form near the camera and the phone form past ROCK_FAR_M, both into the near cascades; the far cascades
// the phone form of every loose rock from a shadow-only pool; the crushable rocks pinned to the first near slots;
// the pools whole from the build, repartitioned with hysteresis when the camera has moved 8 m
assert.match(source, /if \(!mobileProps\) \{\n\s*const far = buildBoulderForm\(vi, noi, mulberry32\(seed \+ 60 \+ vi\), hull, 4, legacyTop, boulderKindFor\(lithology, vi\), lithology\);/,
  'the far form is the same rock at the phone\'s tier');
assert.match(source, /const ROCK_FAR_M = 60;/);
assert.match(source, /const ROCK_NEAR_CASCADES = 0b0011, ROCK_FAR_CASCADES = 0b1100;/);
assert.match(source, /markShadowOnly\(shadow\);\n\s*setShadowCasterCascades\(shadow, ROCK_FAR_CASCADES\);\n\s*setShadowCasterCascades\(near, ROCK_NEAR_CASCADES\);\n\s*setShadowCasterCascades\(far, ROCK_NEAR_CASCADES\);/,
  'the near and far pools cast into the near cascades, the shadow-only pool into the far ones');
assert.match(source, /'rock-variant-' \+ vi \+ '-far'[\s\S]{0,1500}'rock-variant-' \+ vi \+ '-shadow'/, 'the probes find every pool by name');
assert.match(source, /rockClutter\.get\(rockPlacements\[vi\]\[i\]\)!\.bindInstance\(near, k\);/, 'a crushable rock keeps its near slot for its clutter');
assert.match(source, /high: new Uint8Array\(n\)\.fill\(1\) \};\n\s*writeRockLod\(lod\);/, 'the pools are whole from the build');
assert.match(source, /const wasHigh = lod\.high\[i\] !== 0, high = wasHigh \? d <= ROCK_FAR_M \+ 10 : d < ROCK_FAR_M;/, 'the repartition holds a 10 m hysteresis');
assert.match(source, /lastRockCamera\.distanceToSquared\(cameraPos\) <= 64\) return;/, 'and runs when the camera has moved 8 m');
assert.match(source, /updatePoleLod\(cameraPos\);\n\s*updateRockLod\(cameraPos\);/, 'the props update runs it');
assert.match(source, /materialKind === 'rock' \? rockHook\s*:/); // (the field print's own hook follows: the scenery lane, wave 48)
assert.match(source, /rock: new THREE\.MeshStandardMaterial\(\{\n\s*map: rockDetail\.albedo, normalMap: rockDetail\.normal/);
assert.match(source, /const rockDetail = yield\* makeRockDetail\(noi, aniso, rockLithologyFor\(mapId\)\);/);
assert.match(source, /textures: \[grimeTex, rockDetail\.lichen\]/, 'the shader-only lichen tile is declared on its world');
assert.match(source, /rockDressingFor\(mapId, P\.rockSoilTone \?\? null, snowCap\)[\s\S]{0,200}applyRockShaderHook\(shader, rockDressing, rockDetail\.lichen, rockStoneMean\)/);
// the stone: the map's terrain rock layer, swapped into the stand-in's textures; its mean to the hook's vector; the
// map's texture readiness waits for it
assert.match(source, /applySourcedRock\(\{ albedo: rockDetail\.albedo, normal: rockDetail\.normal \}, mapId,\s*\(cfg as \{ splat\?: SourcedTerrainSettings \} \| null\)\?\.splat \?\? \{\}, sourceApplication,\s*\(mean\) => rockStoneMean\.set\(mean\[0\], mean\[1\], mean\[2\]\)\)/,
  'the boulders wear the map\'s terrain rock layer (its splat settings), its mean to the material');
assert.match(source, /const sourcedTexturesReady = Promise\.all\(\[[\s\S]{0,600}applySourcedRock\(/, 'the map\'s texture readiness waits for the stone');
console.log('rockDressing self-test passed: three weathered kinds over seven rocks closed, unfolded, hollowed and knobbed, deep-skirted and inside their hulls, every map dressed, seven stand-in tiles about a mid grey, the lichen rank exact, the photographed stone in the hook');
