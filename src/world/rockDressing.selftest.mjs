// The boulders (round 75 item 6, rebuilt by the scenery lane 2026-10-04 after gauntlet waves 52, 57 and 66; b14 after
// wave 97's "smooth, round, fracture-less blobs"): a boulder is a weathered mass — a welded cube-sphere cast at the
// smooth maximum of its joints, lumped at three scales — broken by fresh fractures and stepped by notches (on a bedded
// rock at its partings): closed, unfolded, its normals the surface's own and facing out (no triangle above the ground
// line spans more than a right angle of them), fitted inside the legacy hull the shards carry above the ground line and
// as tall as the legacy rock, its skirt deep, hollowed and knobbed, and a function of its seed; its tone reads face,
// fracture, arris and hollow (the chalk a warm off-white, grey only in its hollows); every battlefield resolves a
// dressing (its lithology, the photographed stone's treatment, lichen, varnish); the stand-in tile is its lithology's,
// a mid grey on average, the lichen tile's coverage rank is exact; the hook patches the grime hook's anchors, multiplies
// the photographed stone's structure into the vertex tone, keeps the varnish, the lichen and the contact darkening to
// the instanced boulders, and the producer keeps the legacy hull as the collision proxy.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SimplexNoise } from '../engine/simplexFast.ts';
import { convexHull2 } from './collision.ts';
import { MAP_IDS } from './maps/index.ts';
import { acquireTerrainChunkIndex, terrainNearMeshHeightAt } from './terrain.ts';
import {
  BED_SECTION_BINS, BED_SECTION_LEVELS, BOULDER_KINDS, BOULDER_SEAT_Y, ROCK_SHADOW_INSET_M, applyRockShaderHook, bedHash, beddingParting,
  boulderKindFor, boulderSectionRadius, boulderSections, buildBoulderForm, createRockDepthMaterial, makeRockDetail, paintBoulder,
  projectsInsideHull, rockDressingFor, rockLithologyFor,
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
  // more than the arris's turn; b14: and a fresh break's crisp arris, or a notch's, turns a little past a right angle
  // across a desktop cell — a crisp edge a cell wide, no diagonal seam: the quad splits along its like-shaded diagonal)
  assert.ok(worstAbove > (subdiv >= 6 ? -0.25 : -0.35), `${label}: no triangle above the ground line spans much more than a right angle of normal (${worstAbove.toFixed(3)})`);
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
  // the breaks (b14, wave 97: "no fracture planes to give it form"): every stone shows one above the ground — a vertex on
  // a break's face — and its breaks and notches take a share of its skin
  assert.ok(form.fresh.every((f) => f >= 0 && f <= 1), `${label}: a bounded break share`);
  let above = 0, broken = 0, onFace = 0;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) <= BOULDER_SEAT_Y) continue;
    above++;
    if (form.fresh[i] > 0.3) broken++;
    onFace = Math.max(onFace, form.fresh[i]);
  }
  // (a phone's coarser rows blend a break into the mass over a wider arris)
  assert.ok(onFace > (subdiv >= 6 ? 0.8 : 0.6) && broken / above >= 0.1, `${label}: a break above the ground (${(broken / above * 100).toFixed(0)} % of the skin, ${onFace.toFixed(2)} on its face)`);
  // the material's facts per vertex (aRockFace): the bed coordinate, the height on the stone, the break, the hollow
  const face = g.getAttribute('aRockFace');
  assert.ok(face && face.itemSize === 4 && face.count === p.count, `${label}: a face fact for every vertex`);
  let topFrac = -Infinity;
  for (let i = 0; i < p.count; i++) {
    topFrac = Math.max(topFrac, face.getY(i));
    assert.ok(face.getY(i) >= -1 && face.getY(i) <= 1 && Math.abs(face.getZ(i) - form.fresh[i]) < 1e-6 && Math.abs(face.getW(i) - form.hollow[i]) < 1e-6,
      `${label}: the height's share, the break and the hollow as the tone reads them`);
  }
  assert.ok(Math.abs(topFrac - 1) < 1e-3, `${label}: the height's share reaches 1 at the stone's top (${topFrac.toFixed(4)})`);
  return { p, n, face };
}
for (const lithology of LITHOLOGIES) {
  for (const seed of [2002, 77, 9001]) {
    for (const [detail, variant] of [[2, 0], [2, 1], [3, 2]]) {
      const legacy = legacyBoulder(detail, variant);
      const kind = boulderKindFor(lithology, variant);
      for (const subdiv of [6, 4]) {
        const label = `${lithology} seed ${seed}, ${BOULDER_KINDS[kind]}, ${subdiv === 6 ? 'desktop' : 'phone'}`;
        const form = buildBoulderForm(variant, noise, mulberry32(seed + 60 + variant), legacy.hull, subdiv, legacy.top, kind, lithology);
        const { p, n, face } = checkForm(form, label, legacy.hull, legacy.top, subdiv);
        // (b14) the bedding rides the sedimentary rocks only: several beds up a stone, none on the rest
        let bedLo = Infinity, bedHi = -Infinity;
        for (let i = 0; i < p.count; i++) if (p.getY(i) > BOULDER_SEAT_Y) { bedLo = Math.min(bedLo, face.getX(i)); bedHi = Math.max(bedHi, face.getX(i)); }
        if (['sandstone', 'limestone'].includes(lithology)) assert.ok(bedHi - bedLo > 2, `${label}: beds up the stone (${(bedHi - bedLo).toFixed(2)})`);
        else assert.ok(bedLo === 0 && bedHi === 0, `${label}: no bedding on ${lithology}`);
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
assert.ok(meanLuma.chalk > meanLuma.granite * 2.5, `the chalk is pale (${meanLuma.chalk.toFixed(3)} against the granite's ${meanLuma.granite.toFixed(3)})`);
// (b12, wave 74: "a white marshmallow, a fleece or a snow heap") an albedo of 0.6 to 0.7, not snow's
assert.ok(meanLuma.chalk < 0.42, `the chalk is no snow (linear luma ${meanLuma.chalk.toFixed(3)})`);
for (const lithology of LITHOLOGIES) for (let v = 0; v < 3; v++) assert.ok(BOULDER_KINDS[boulderKindFor(lithology, v)], `${lithology}: a kind for variant ${v}`);
assert.ok([0, 1, 2].every((v) => boulderKindFor('sandstone', v) !== 1), 'bedded rock breaks into blocks and slabs, never weathered corestones');
const outside = new THREE.BufferGeometry();
outside.setAttribute('position', new THREE.BufferAttribute(new Float32Array([5, 0, 5]), 3));
assert.equal(projectsInsideHull(outside, legacyBoulder(2, 0).hull), false, 'the hull test rejects a point outside');

// --- the bedding's law (b14): the partings' places by a hash the material shares, about one a bed and irregular (wave 57:
// "evenly spaced painted strata lines"), the same bits in the shader
{
  for (let k = -40; k < 400; k++) {
    const h = bedHash(k, 0);
    assert.ok(h >= 0 && h <= 1 && h === bedHash(k, 0), 'a hash to [0, 1], a function of its index');
  }
  const gaps = [];
  for (let k = 0; k < 300; k++) gaps.push(beddingParting(k + 1) - beddingParting(k));
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length, sd = Math.sqrt(gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length);
  assert.ok(gaps.every((d) => d > 0.27 && d < 1.73) && Math.abs(mean - 1) < 0.02 && sd > 0.2,
    `the partings in order, a bed apart on average, irregular (sd ${sd.toFixed(3)} of a bed)`);
  const glsl = readFileSync(new URL('./rockDressing.ts', import.meta.url), 'utf8');
  assert.match(glsl, /uint h = uint\(int\(k\) \+ 1024\) \* 747796405u \+ uint\(int\(salt\)\) \* 2891336453u \+ 1u;\n\s*h = \(\(h >> \(\(h >> 28u\) \+ 4u\)\) \^ h\) \* 277803737u;\n\s*h = \(h >> 22u\) \^ h;/,
    'the shader hashes the same bits');
  assert.match(glsl, /let h = \(Math\.imul\(\(k \+ 1024\) \| 0, 747796405\) \+ Math\.imul\(salt \| 0, 2891336453\) \+ 1\) >>> 0;/, 'as the form does');
  assert.match(glsl, /float cotParting\(float k\) \{ return k \+ 0\.5 \+ 0\.36 \* \(2\.0 \* cotBedHash\(k, 0\.0\) - 1\.0\); \}/, 'the shader\'s parting law');
  assert.match(glsl, /return k \+ 0\.5 \+ 0\.36 \* \(2 \* bedHash\(k, 0\) - 1\);/, 'the form\'s parting law');
  // the ledges step at partings: the notch's bed plane is a parting's place (boulderCuts), as the shader draws it
  assert.match(glsl, /const at = beddingParting\(k\);[\s\S]{0,300}target = \(best - bedding\.salt\) \* bedding\.thickness;/, 'a ledge at a parting');
}

// --- the stone's sections (b14, the beds): the radius of its section round the vertical at the heights its ground meets
{
  const legacy = legacyBoulder(2, 0);
  const form = buildBoulderForm(0, noise, mulberry32(2002 + 60), legacy.hull, 6, legacy.top, boulderKindFor('granite', 0), 'granite');
  const sections = boulderSections(form.geometry);
  assert.equal(sections.length, BED_SECTION_LEVELS.length * BED_SECTION_BINS);
  assert.ok(sections.every((r) => r > 0.2 && r < 1.6), 'every bin of every level filled with a radius');
  const p = form.geometry.attributes.position;
  // (at the heights a stone's ground meets it: a fifth to a third of the form up, where its sides stand steep)
  for (const y of [0.1, 0.2, 0.3]) {
    // the section's radius against the mesh's vertices about that height in its direction
    let worst = 0;
    for (let a = 0; a < 16; a++) {
      const angle = (a / 16) * Math.PI * 2, r = boulderSectionRadius(sections, y, angle);
      let reach = 0;
      for (let i = 0; i < p.count; i++) {
        if (Math.abs(p.getY(i) - y) > 0.06) continue;
        const d = Math.abs(Math.atan2(Math.sin(Math.atan2(p.getZ(i), p.getX(i)) - angle), Math.cos(Math.atan2(p.getZ(i), p.getX(i)) - angle)));
        if (d < 0.12) reach = Math.max(reach, Math.hypot(p.getX(i), p.getZ(i)));
      }
      if (reach > 0) worst = Math.max(worst, Math.abs(r - reach) / reach);
    }
    assert.ok(worst < 0.15, `the section at ${y} follows the stone (worst ${(worst * 100).toFixed(1)} %)`);
  }
}

// --- the shadow pass (b14; wave 96: "an 8-16 px seam of lit sand" at a stone's shaded foot): each stone drawn inside
// itself along its normals, ROCK_SHADOW_INSET_M at most 8 % of it
{
  const depth = createRockDepthMaterial();
  assert.equal(depth.depthPacking, THREE.RGBADepthPacking);
  const ds = { uniforms: {}, vertexShader: THREE.ShaderLib.depth.vertexShader, fragmentShader: THREE.ShaderLib.depth.fragmentShader };
  depth.onBeforeCompile(ds);
  assert.ok(ROCK_SHADOW_INSET_M > 0.05 && ROCK_SHADOW_INSET_M <= 0.15, `the inset (${ROCK_SHADOW_INSET_M} m)`);
  assert.ok(ds.vertexShader.includes(`transformed -= normalize(normal) * min(${ROCK_SHADOW_INSET_M.toFixed(3)} / cotScale, 0.08);`) && ds.vertexShader.includes('#ifdef USE_INSTANCING'),
    'the instanced stones inset in the depth pass, the world\'s metres over their scale, at most 8 % of them');
  assert.equal(depth.customProgramCacheKey(), 'world-props-rock-depth-v1');
}

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
assert.equal([0, 1, 2].filter((v) => BOULDER_KINDS[boulderKindFor('chalk', v)] === 'rounded').length, 1,
  'the chalk breaks into blocks and slabs, one of three weathered round (b12: no marshmallow)');
for (const mapId of MAP_IDS) {
  const [contrast, colour, relief] = rockDressingFor(mapId, null).photo;
  assert.ok(contrast > 0.3 && contrast <= 1.3 && colour >= 0 && colour <= 1 && relief > 0.3 && relief <= 1, `${mapId}: the photographed stone's treatment bounded`);
}
assert.ok(rockDressingFor('verdant', null).photo[0] < rockDressingFor('coastal', null).photo[0], 'the chalk takes the photo more softly than the granite');
assert.ok(rockDressingFor('verdant', null).photo[2] >= rockDressingFor('saltwind', null).photo[2], 'but its relief as strongly as the limestone (b12: pitted and fractured)');
// the lithologies' own surfaces (b12): the chalk's flints, rind and stain; the limestone's rind and stain; none on the rest
assert.deepEqual([...rockDressingFor('verdant', null).surface], [1, 0.45, 1], 'the chalk: flints, a grey rind (b18: a lighter one), the soil\'s stain');
assert.ok(rockDressingFor('saltwind', null).surface[0] === 0 && rockDressingFor('saltwind', null).surface[1] > 0, 'the limestone: a rind, no flints');
for (const mapId of MAP_IDS) {
  const d = rockDressingFor(mapId, null);
  assert.ok(d.surface.every((v) => v >= 0 && v <= 1), `${mapId}: a bounded surface`);
  if (!['chalk', 'limestone'].includes(d.lithology)) assert.deepEqual([...d.surface], [0, 0, 0], `${mapId}: no carbonate surface on ${d.lithology}`);
}
assert.notDeepEqual(rockDressingFor('coastal', null).lichenA, rockDressingFor('verdant', null).lichenA, 'the climate picks the lichen');
// (b14) the bedding and the honeycomb: the sedimentary stone's partings and beds, the arid sandstone's tafoni
for (const mapId of MAP_IDS) {
  const d = rockDressingFor(mapId, null), [partings, tones, tafoni, depth] = d.beds;
  const bedded = ['sandstone', 'limestone'].includes(d.lithology);
  assert.ok(bedded ? partings > 0 && tones > 0 : partings === 0 && tones === 0, `${mapId}: partings and beds on bedded stone only (${d.lithology})`);
  assert.ok(tafoni >= 0 && tafoni <= 1 && (d.lithology === 'sandstone' || tafoni === 0), `${mapId}: a honeycomb in sandstone only`);
  assert.ok(depth > 0 && depth <= 0.03, `${mapId}: a parting a couple of centimetres deep`);
}
assert.ok(['desert', 'badlands', 'oasis'].every((m) => rockDressingFor(m, null).beds[2] === 1), 'the arid sandstone honeycombed');
assert.equal(rockDressingFor('longleaf', null).beds[2], 0, 'the wet sandstone not');
assert.notDeepEqual(rockDressingFor('railyard', (h, s, l) => [0.6, s, l]).soil, rockDressingFor('railyard', null).soil, 'the dirt tone law reaches the soil');
// (b18; wave 121: Dahar's boulders "none of the horizontal bedding planes, cross-bedded laminae or coarse sand grain",
// Fjord's "no gneiss foliation, quartz veining") the stone's fabric: the sandstone's laminae inside its beds and its
// grain, the gneiss's foliation and its quartz veins, the chalk's grain; nothing new on the rest
for (const mapId of MAP_IDS) {
  const d = rockDressingFor(mapId, null), [laminae, foliation, veins] = d.fabric;
  assert.ok(d.fabric.length === 4 && d.fabric.every((v) => v >= 0 && v <= 1), `${mapId}: a bounded fabric`);
  assert.ok(!(laminae > 0) || (d.lithology === 'sandstone' && d.beds[0] > 0), `${mapId}: laminae inside a sandstone's beds only`);
  assert.equal(foliation > 0 || veins > 0, d.lithology === 'gneiss', `${mapId}: the foliation and its veins the gneiss's`);
  if (!['sandstone', 'gneiss', 'chalk'].includes(d.lithology)) assert.deepEqual([...d.fabric], [0, 0, 0, 0], `${mapId}: no new fabric on ${d.lithology}`);
}
assert.deepEqual([...rockDressingFor('desert', null).fabric], [1, 0, 0, 1], 'Dahar\'s sandstone: its laminae and its grain');
assert.deepEqual([...rockDressingFor('fjord', null).fabric], [0, 1, 1, 0], 'Fjord\'s gneiss: its foliation and its quartz veins');
assert.ok(rockDressingFor('verdant', null).fabric[3] > 0, 'the chalk\'s grain');
assert.ok(rockDressingFor('desert', null).photo[0] < 0.6 && rockDressingFor('desert', null).photo[2] < 0.5,
  'the sandstone takes the photographed stone softly (wave 121: "a continuous wrinkled skin wrapped over a smooth dome")');

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
    // (b14) the honeycomb in the tile's blue: cells hollow to their walls, each its own depth
    let walls = 0, deep = 0;
    for (let i = 2; i < lich.length; i += 4) { if (lich[i] === 0) walls++; if (lich[i] > 128) deep++; }
    assert.ok(walls / 65536 > 0.03 && deep / 65536 > 0.1, `${lithology}: honeycomb cells between walls (${(walls / 655.36).toFixed(1)} % walls, ${(deep / 655.36).toFixed(1)} % deep)`);
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
assert.deepEqual(Object.keys(shader.uniforms).sort(), ['uRockBeds', 'uRockDust', 'uRockFabric', 'uRockLichen', 'uRockLichenA', 'uRockLichenB', 'uRockLichenTile', 'uRockMoss', 'uRockPhoto', 'uRockSoil', 'uRockStoneMean', 'uRockSurface', 'uRockVarnish']);
assert.deepEqual(shader.uniforms.uRockFabric.value.toArray(), [...rockDressingFor('verdant', null).fabric], 'the lithology\'s fabric (b18)');
assert.deepEqual(shader.uniforms.uRockBeds.value.toArray(), [...rockDressingFor('verdant', null).beds], 'the lithology\'s bedding and honeycomb');
assert.deepEqual(shader.uniforms.uRockSurface.value.toArray(), [...rockDressingFor('verdant', null).surface], 'the lithology\'s own surface');
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
assert.ok(!shader.fragmentShader.includes('#include <map_fragment>') && shader.fragmentShader.includes('texture2D(map, rockPw.yz).rgb'), 'the map slot samples the stone triplanar, its colour too');
assert.match(shader.fragmentShader, /vec3 rockF = rockPhoto \/ max\(uRockStoneMean, vec3\(0\.01\)\);[\s\S]*mix\(vec3\(1\.0\), mix\(vec3\(rockFL\), rockF, uRockPhoto\.y\), uRockPhoto\.x\)/,
  'the photo multiplies its structure about its own mean, its contrast and colour the lithology\'s');
assert.match(shader.fragmentShader, /rockPert \* uRockPhoto\.z/, 'its relief at the lithology\'s strength');
const frag = shader.fragmentShader;
// (b14; wave 57: "evenly spaced painted strata lines"; wave 97: "no bedding planes") the bedding in the stone's own frame
// — the bed coordinate the vertex carries — at the irregular partings the forms step at: a groove the light finds (its
// slope by the chain rule, never a derivative of the narrow groove, which steps with the pixel quads), a shade darker
// below the parting than above, faded where a bed spans too few pixels; each bed a faint tone; no ruling
assert.match(shader.vertexShader, /attribute vec4 aRockFace;\nvarying vec4 vRockFace;/, 'the face facts ride the vertex');
assert.match(shader.vertexShader, /vRockFace = aRockFace;/);
{
  const beds = frag.slice(frag.indexOf('if (uRockBeds.x > 0.0) {'), frag.indexOf('if (uRockBeds.z > 0.0) {'));
  assert.ok(beds.length > 400, 'the partings\' block');
  assert.match(beds, /float p0 = cotParting\(k0 - 1\.0\), p1 = cotParting\(k0\), p2 = cotParting\(k0 \+ 1\.0\);/, 'the nearest of the irregular partings');
  assert.match(beds, /rockBedDh -= strength \* uRockBeds\.w \* sign\(dn\) \* 6\.0 \* across \* \(1\.0 - across\) \/ halfWidth \* bedDu;/, 'the groove\'s slope by the chain rule');
  assert.match(beds, /\* \(1\.0 - smoothstep\(0\.1, 0\.25, bedPx\)\)/, 'faded where a bed spans too few pixels');
  assert.match(beds, /diffuseColor\.rgb \*= 1\.0 - groove \* \(dn < 0\.0 \? 0\.55 : 0\.3\) \* uRockBeds\.x;/, 'darker under the parting\'s lip');
  assert.ok(!/fract\(bu|fract\(vRockFace\.x/.test(beds), 'no periodic ruling of the bed coordinate');
  assert.match(frag, /vec2 rockDh = \(vec2\(dFdx\(rockBump\), dFdy\(rockBump\)\) \+ rockBedDh\) \* rockBumpFade;/, 'the relief near the eye');
  const tafoni = frag.slice(frag.indexOf('if (uRockBeds.z > 0.0) {'), frag.indexOf('if (uRockBeds.z > 0.0) {') + 900);
  assert.match(tafoni, /texture2D\(uRockLichenTile, cavP\.yz\)\.b \* rockTp\.x/, 'the honeycomb from the tile\'s blue, in the stone\'s frame');
  assert.match(tafoni, /float low = 1\.0 - smoothstep\(0\.3, 0\.75, vRockFace\.y\);/, 'low on the stone');
  assert.match(tafoni, /vRockFace\.w \* 0\.9/, 'where the weather hollowed it');
  // (b18) the laminae inside the bed, in the beds' block: each bed its own set from its own parting to the next, the odd
  // bed laid flat, the rest cross-bedded; the fine laminae and their bundles gone where they crowd under the pixels
  const lam = beds.slice(beds.indexOf('if (uRockFabric.x > 0.0) {'));
  assert.ok(beds.includes('if (uRockFabric.x > 0.0) {') && lam.length > 600, 'the laminae inside the beds\' block');
  assert.match(lam, /float pb = cotParting\(kb\), pt = cotParting\(kb \+ 1\.0\);\n\s*float within = clamp\(\(bu - pb\) \/ max\(1e-3, pt - pb\), 0\.0, 1\.0\);/,
    'each bed its own set, cut off at the parting above');
  assert.match(lam, /float laidFlat = step\(cotBedHash\(kb, 3\.0\), 0\.15\);/, 'the odd bed laid flat, the rest cross-bedded');
  assert.match(lam, /\* \(1\.0 - smoothstep\(0\.3, 0\.6, lamW\)\)/, 'the fine laminae gone where they crowd');
  assert.match(lam, /\* \(1\.0 - smoothstep\(0\.3, 0\.6, lamCW\)\)/, 'and their bundles');
}
// (b18) the fabric: the grain near the eye from the stone's own picture; the foliation at each stone's own attitude, its
// fine bands gone where they crowd; a vein gone where it is thinner than a pixel; under the varnish and the lichen
{
  const fabric = frag.slice(frag.indexOf('if (uRockFabric.w > 0.0) {'), frag.indexOf('// desert varnish'));
  assert.ok(fabric.length > 1500, 'the fabric\'s block');
  assert.ok(frag.includes('#ifdef USE_MAP\n    if (uRockFabric.w > 0.0) {'), 'the grain from the stone\'s own picture, when it has one');
  assert.match(fabric, /float grainNear = 1\.0 - smoothstep\(4\.0, 14\.0, length\(vViewPosition\)\);/, 'the grain near the eye only');
  assert.match(fabric, /vec3 folN = vec3\(sin\(folB\) \* cos\(folA\), cos\(folB\), sin\(folB\) \* sin\(folA\)\);/, 'the foliation at each stone\'s own attitude');
  assert.match(fabric, /mix\(texture2D\(uGrime, vec2\(folS \* 4\.1 \+ 0\.61, 0\.71 \+ vRockSeed \* 0\.3\)\)\.g, 0\.5, smoothstep\(0\.2, 0\.5, folFineW\)\)/,
    'its fine bands gone where they crowd');
  assert.match(fabric, /\* \(1\.0 - smoothstep\(veinHalf \* 0\.8, veinHalf \* 2\.5, veinW\)\)/, 'a vein gone where it is thinner than a pixel');
  assert.ok(frag.indexOf('if (uRockBeds.x > 0.0) {') < frag.indexOf('if (uRockFabric.w > 0.0) {')
    && frag.indexOf('if (uRockFabric.w > 0.0) {') < frag.indexOf('float varnish =') && frag.indexOf('if (uRockFabric.w > 0.0) {') < frag.indexOf('float lichen ='),
    'after the beds, under the varnish and the lichen');
}
// (b14; wave 97: "no … varnish streaks") the varnish hung from the crown in streaks, darkest high, none on a break
assert.match(frag, /float hang = smoothstep\(0\.05, 0\.75, vRockFace\.y\);/, 'the streaks darkest high');
assert.match(frag, /\(1\.0 - 0\.85 \* vRockFace\.z\)\n\s*\* smoothstep\(0\.15, 0\.7, vRockAbove\);/, 'no varnish on a fresh break');
assert.match(frag, /\* \(1\.0 - 0\.85 \* vRockFace\.z\);\n/, 'nor lichen');
assert.match(frag, /float lichenRim = lichen \* \(1\.0 - smoothstep\(1\.0 - cover \+ edge, 1\.0 - cover \+ edge \+ cover \* 0\.3, lc\.x\)\);/,
  'a colony\'s rim a shade darker than its heart (Sonnet, wave 97: "airbrushed")');
assert.ok(frag.indexOf('#include <color_fragment>') < frag.indexOf('mossMask'), 'the dressing mixes after the vertex tone');
assert.ok(frag.indexOf('rockDetail') < frag.indexOf('{ grime }'), 'the detail multiplies before the grime block');
assert.ok(frag.indexOf('if (vRockSeed >= 0.0) {') < frag.indexOf('float lichen ='), 'the lichen on the boulders only');
assert.match(frag, /float cluster = smoothstep\(0\.5, 0\.68, texture2D\(uGrime, vGrimeW\.xz \* 0\.09/, 'the lichen grows in clusters, a few patches to a rock (wave 57: "confetti")');
assert.match(frag, /float exposed = smoothstep\(0\.15, 0\.75, vGrimeN\.y \+ 0\.45 \* weather\)/, 'on the tops and the weather side, never under');
assert.ok(frag.indexOf('float lichen =') < frag.indexOf('float mossMask'), 'the moss grows over the lichen');
assert.ok(frag.indexOf('#include <color_fragment>') < frag.indexOf('float rockSnow') && frag.includes('if (vRockSeed >= 0.0 && uRockLichen.z > 0.5)'), 'a snow map\'s boulders take their snow after their tone');
assert.match(frag, /float soilTop = \(texture2D\(uGrime, vGrimeW\.xz \* 0\.47 \+ vGrimeW\.y \* 0\.11\)\.g - 0\.5\) \* 0\.3;/, 'the soil band\'s top wanders (wave 57: "a ruler-straight base line")');
assert.ok(frag.indexOf('float soilMask') < frag.indexOf('float contactK = 0.45 * (1.0 - 0.6 * uRockDust);'), 'the contact darkening over the soil band, boulders only');
// (b19) the soil a band at the foot with a ragged top a hand up and the rain's splashes over it, thinning out over a
// third of a metre — no ramp up the lower third
assert.match(frag, /float soilBand = 1\.0 - smoothstep\(soilEdge - 0\.03, soilEdge \+ 0\.02, vRockAbove\);/, 'the soil a band with a sharp, ragged top');
assert.match(frag, /float splashH = 1\.0 - smoothstep\(soilEdge, soilEdge \+ 0\.32, vRockAbove\);/, 'its splashes thinning out over a third of a metre');
assert.match(frag, /float soilMask = max\(soilBand, splash \* 0\.75\)/, 'the band and its splashes, nothing else');
assert.ok(!/smoothstep\(-0\.12 \+ soilTop, 0\.34 \+ soilTop, vRockAbove\)/.test(frag), 'no ramp up the lower third');
assert.match(frag, /diffuseColor\.rgb \*= \(1\.0 - contactK\) \+ contactK \* smoothstep\(-0\.04 \+ soilTop \* 0\.5, 0\.3 \+ 0\.25 \* uRockDust \+ soilTop \* 0\.5, vRockAbove\);/,
  'softer and wider on a dusty map (b12, wave 72: Redrock\'s "uniformly dark crisp ring")');
// (b12, Sonnet, wave 74: "identical banding recognisable") each boulder its own cut of the stone: its frame turned and
// tipped, its scale and phase its own, the weights and the relief in that frame; a merged formation keeps the world's
assert.match(frag, /mat3 rockR = mat3\(1\.0\);\nvec3 rockPw = vGrimeW \* 0\.55;\nif \(vRockSeed >= 0\.0\) \{/, 'the world frame unless a boulder');
assert.match(frag, /rockPw = rockR \* vGrimeW \* \(0\.44 \+ 0\.25 \* fract\(vRockSeed \* 3\.71\)\) \+ vRockSeed \* vec3\(31\.7, 7\.3, 19\.1\);/, 'its scale and phase');
assert.match(frag, /vec3 rockTp = abs\(rockR \* vGrimeN\);/, 'the photo\'s weights in its frame');
assert.ok(frag.includes('texture2D(map, rockPw.yz).rgb * rockTp.x') && frag.includes('rockPert = transpose(rockR) * rockPert;'), 'the stone and its relief drawn in that frame, the relief turned back');
assert.ok(frag.includes('texture2D(uRockLichenTile, lPw.yz).rg * rockTw.x'), 'the lichen keeps the world frame');
// the carbonate surface (b12): the rind on the tops and the weather side, the flints in bands, the stain up the foot
assert.match(frag, /float rind = uRockSurface\.y \* smoothstep\(0\.25, 0\.95, 0\.5 \+ 0\.45 \* vGrimeN\.y/, 'the rind');
assert.match(frag, /float flint = uRockSurface\.x \* \(1\.0 - smoothstep\(0\.07, 0\.17, flintBand\)\)/, 'the flints in their bands');
// (b19; wave 121, Verdant: "an even pink-brown gradient painted up its lower third ... a colour ramp rather than soil")
// the stain a tide line, its edge ragged and soft over a tenth of a metre, patchy below it — no ramp from the foot
assert.match(frag, /float stain = uRockSurface\.z \* \(1\.0 - smoothstep\(stainTop - 0\.07, stainTop \+ 0\.03, vRockAbove\)\)/, 'the stain a tide line, not a ramp');
assert.match(frag, /float stainTop = 0\.28 \+ /, 'a fifth to two fifths of a metre up');
assert.ok(frag.indexOf('float rind') < frag.indexOf('float lichen ='), 'the lichen over the rind');
assert.ok(!frag.includes('#include <normal_fragment_maps>') && frag.includes('texture2D(normalMap, rockPw.yz)'), 'the tangent-frame chunk is replaced by the triplanar perturbation');
const untiled = { uniforms: {}, vertexShader: grimed.vertexShader, fragmentShader: grimed.fragmentShader };
applyRockShaderHook(untiled, rockDressingFor('verdant', null));
assert.equal(untiled.uniforms.uRockLichen.value.x, 0, 'no tile, no lichen');
assert.throws(() => applyRockShaderHook({ uniforms: {}, vertexShader: '#include <common>', fragmentShader: '' }, rockDressingFor('verdant', null)), /anchor missing/);

// --- the producer
const source = readFileSync(new URL('./props.ts', import.meta.url), 'utf8');
const hullAt = source.indexOf('rockHulls.push(hull); // the collision proxy');
// (the Redrock lane, round 10: the form takes the map's angularity too, RockClimate.angular)
assert.ok(hullAt > 0 && hullAt < source.indexOf('const form = buildBoulderForm(vi, noi, mulberry32(seed + 60 + vi), hull, mobileProps ? 4 : 6, legacyTop, boulderKindFor(lithology, vi), lithology, angular);'), 'the legacy hull is taken before the form is fitted inside it, as the map\'s rock breaks');
assert.match(source, /paintBoulder\(form, P\.rockTone, lithology\);\n\s*rockGeos\.push\(form\.geometry\);/);
assert.match(source, /rockGeos\[vi\]\.setAttribute\('aRockGround', new THREE\.InstancedBufferAttribute\(ground, 1\)\)/);
assert.match(source, /rockGeos\[vi\]\.setAttribute\('aRockSlope', new THREE\.InstancedBufferAttribute\(slope, 2\)\)/, 'every boulder the slope of its ground');
assert.match(source, /const rockContact = !snowCap && rockDressing\.dust < 0\.5;/, 'a contact patch round every boulder, but on snow and sand');
assert.match(source, /for \(const spot of rockSpots\) \{\n\s*dirtDiscs\.push\(conformedDisc\(spot\.x, spot\.z, spot\.r, \[[^\]]*\], true, ROCK_PATCH, CONTACT_STRENGTH\.rock\)\);\n\s*yield \{ fine: true, progress: false, stage: 'ground-foundation-instances' \};/,
  'the contact patches go to the ground decals, conformed to the drawn mesh, one private input and checkpoint each');
// (b44; wave 272: the boulders' "flat tan disc … like a cookie-cutter decal") the contact layer darkens the ground it lies
// on: each kind's strength in its patch's vertex RGB, the material a multiplicative darkening, unlit, no fog of its own,
// gone by 160 m, no shadow — and its output law: the target × mix(1, the grey, a)
{
  const strength = /const CONTACT_STRENGTH = Object\.freeze\(\{ rock: ([\d.]+), prop: ([\d.]+), stack: ([\d.]+), foundation: ([\d.]+) \}\);/.exec(source);
  assert.ok(strength, 'a strength for every kind of contact');
  const [rock, prop, stack, foundation] = strength.slice(1).map(Number);
  assert.ok(rock === 1 && prop < rock && stack < rock && foundation < prop, `a boulder's foot full, a prop's and a stack's less, a foundation's least (${rock}, ${prop}, ${stack}, ${foundation})`);
  for (const [who, call] of [['a foundation', /Math\.max\(building\.w, building\.d\) \* 1\.2, \[[^\]]*\], false, FULL_PATCH, CONTACT_STRENGTH\.foundation\)\);/],
    ['a crushable prop', /conformedDisc\(prop\.x, prop\.z, 1\.15, \[[^\]]*\], false, FULL_PATCH, CONTACT_STRENGTH\.prop\)\);/],
    ['a field stack', /conformedDisc\(stack\.x, stack\.z, stack\.r, \[[^\]]*\], false, FULL_PATCH, CONTACT_STRENGTH\.stack\)\);/]]) {
    assert.match(source, call, `${who}'s patch at its strength`);
  }
  assert.match(source, /const tint = shares \? new Float32Array\(nv \* 4\)\.fill\(strength\) : null;/, 'the strength in the vertex RGB, the shares in its alpha');
  assert.match(source, /const mat: THREE\.Material = groundContact \? contactDarkeningMaterial\(tex\) : new THREE\.MeshStandardMaterial\(\{/, 'the contact layer on its own material');
  const at = source.indexOf('function contactDarkeningMaterial(tex: THREE.Texture): THREE.MeshBasicMaterial {');
  assert.ok(at > 0, 'the contact material');
  const body = source.slice(at, source.indexOf('\n}\n', at));
  for (const want of ['transparent: true', 'depthWrite: false', 'fog: false', 'toneMapped: false', 'blending: THREE.MultiplyBlending', 'premultipliedAlpha: true', 'vertexColors: true']) {
    assert.ok(body.includes(want), `the contact material: ${want}`);
  }
  const law = /float cotContactA = clamp\(diffuseColor\.a \* ([\d.]+) \* vColor\.r, 0\.0, ([\d.]+)\) \* \(1\.0 - smoothstep\(([\d.]+), ([\d.]+), vCotContactDist\)\);\n  gl_FragColor = vec4\(([\d.]+), ([\d.]+), ([\d.]+), cotContactA\);/.exec(body);
  assert.ok(law, 'the darkening law in the shader');
  const [gain, cap, fade0, fade1, gr, gg, gb] = law.slice(1).map(Number);
  assert.ok(cap <= 0.85 && fade1 <= 200 && fade0 < fade1, `a cap (${cap}) and a fade by ${fade1} m`);
  assert.ok(gr < 0.7 && gr >= gg && gg >= gb && gb > 0.4, `a faintly warm grey (${gr}, ${gg}, ${gb})`);
  // the blend three runs for MultiplyBlending with premultiplied alpha (WebGLState: DST_COLOR, ONE_MINUS_SRC_ALPHA):
  // target × (rgb·a) + target × (1 − a) = target × mix(1, rgb, a): the ground keeps its own colour, darker by a
  const ground = [0.31, 0.12, 0.06];
  for (const a of [0, 0.25, 0.8]) {
    const out = ground.map((t, i) => t * [gr, gg, gb][i] * a + t * (1 - a));
    const want = ground.map((t, i) => t * (1 + ([gr, gg, gb][i] - 1) * a));
    assert.ok(out.every((v, i) => Math.abs(v - want[i]) < 1e-12), 'the target times mix(1, the grey, a)');
    assert.ok(Math.abs(out[0] / out[1] - (ground[0] / ground[1]) * (1 + (gr - 1) * a) / (1 + (gg - 1) * a)) < 1e-12, 'its hue the ground\'s, a breath warmer');
  }
  // (the patch's densest texel is 0.94 opaque; a boulder's outer ring carries the full share there)
  assert.ok(gain * 0.94 * rock >= cap, `a boulder's patch reaches the cap where it is densest (gain ${gain})`);
  assert.ok(gain * 0.3 * 0.94 * rock < cap, 'its inner ring (share 0.3) stays under it');
  // the rim: the texture's ragged alpha falls to nothing there whatever the share, so the patch has no edge
  assert.match(source, /gradient\.addColorStop\(1, 'rgba\(82,68,45,0\)'\);/, 'the contact texture clear at its rim');
}
// (b12, after the Coastal re-shoot: a 2-3 px crease at a stone's foot where the patch's inner ring showed past a bank's
// lip) a boulder's patch lightens toward the stone, its outer shadow whole; the contact layer carries the shares in its
// vertex alpha, the other decals keep their geometry
{
  // (b16: the profile lives beside the stones as ROCK_PATCH_SHARES, the beds' shades take it too; the disc's ROCK_PATCH is it)
  assert.match(source, /const ROCK_PATCH = ROCK_PATCH_SHARES;/, 'the disc\'s shares are the shared profile');
  const shares = /const ROCK_PATCH_SHARES: readonly number\[\] = \[([^\]]+)\];/.exec(source)[1].split(',').map(Number);
  assert.equal(shares.length, 4, 'a share for every ring');
  assert.ok(shares.every((v, i) => i === 0 || v >= shares[i - 1]) && shares[3] === 1 && shares[2] <= 0.6,
    `the inner rings lightened, the outer one whole (${shares})`);
  assert.match(source, /const FULL_PATCH: readonly number\[\] = \[1, 1, 1, 1\];/, 'the other contact patches whole');
  assert.match(source, /if \(tint\) geo\.setAttribute\('color', new THREE\.BufferAttribute\(tint, 4\)\);/, 'the shares in a vertex alpha, only when passed');
  assert.match(source, /if \(geos\[0\]\.getAttribute\('color'\)\) mat\.vertexColors = true;/, 'the contact layer reads them');
}
// (wave 74, Coastal boulder-a: a patch conformed to the analytic height floated over a bank's drawn lip): the patch lies
// on the nearest terrain mesh — its grid and its diagonal those terrain.ts draws
{
  const terrainSource = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
  assert.match(terrainSource, /const MAP_SIZE = 1024;/);
  assert.match(terrainSource, /const CHUNKS = 8, CHUNK_SIZE = MAP_SIZE \/ CHUNKS;\nconst LOD_SEGS = \[96, 48, 24\];/);
  assert.match(terrainSource, /idx\[ii\+\+\] = a; idx\[ii\+\+\] = c; idx\[ii\+\+\] = b;\n\s*idx\[ii\+\+\] = b; idx\[ii\+\+\] = c; idx\[ii\+\+\] = d;/,
    'the terrain splits a cell along the diagonal from its +x corner to its +z corner');
  // (the time-to-battle lane, 2026-10-08: through the props build's memo of the field's own heights, nearMeshVertexHeight)
  assert.match(source, /const meshHeightAt = \(px: number, pz: number\): number => terrainNearMeshHeightAt\(nearMeshVertexHeight, px, pz\);/,
    'the patch reads the terrain\'s own export, no copied grid');
  // the export against the terrain's own chunk index: the grid it samples (read from the corners it asks for) and the
  // diagonal its cells split on (read from acquireTerrainChunkIndex), so the two can never diverge
  const asked = [];
  const corner = (x, z) => { asked.push([x, z]); return 0; };
  terrainNearMeshHeightAt(corner, 0.1, 0.1);
  const xs = [...new Set(asked.map((p) => p[0]))].sort((a, b) => a - b), zs = [...new Set(asked.map((p) => p[1]))].sort((a, b) => a - b);
  const cell = xs[1] - xs[0];
  assert.ok(xs.length === 2 && zs.length === 2 && Math.abs(zs[1] - zs[0] - cell) < 1e-9 && Math.abs((xs[0] + 512) / cell - Math.round((xs[0] + 512) / cell)) < 1e-6,
    `the export samples a square cell of the near grid from -512 (${cell})`);
  const terrainSource2 = terrainSource;
  const segs = Number(/const LOD_SEGS = \[(\d+),/.exec(terrainSource2)[1]);
  assert.ok(Math.abs(cell - 1024 / 8 / segs) < 1e-9, 'the cell is the finest chunk grid\'s');
  const index = acquireTerrainChunkIndex(new Map(), 4).array, n = 5;
  const tri0 = [index[0], index[1], index[2]], tri1 = [index[3], index[4], index[5]];
  const shared = tri0.filter((v) => tri1.includes(v)).sort((a, b) => a - b);
  assert.deepEqual(shared, [1, n], 'the chunk index splits a cell along its +x corner to its +z corner');
  // and the export interpolates on that triangle pair: corner heights a=0, b=1, c=2, d=4
  const heights = (x, z) => { const i = Math.round((x - xs[0]) / cell), k = Math.round((z - zs[0]) / cell); return [[0, 2], [1, 4]][i][k]; };
  const at = (fx, fz) => terrainNearMeshHeightAt(heights, xs[0] + fx * cell, zs[0] + fz * cell);
  assert.ok(Math.abs(at(0.3, 0.2) - (0 + 1 * 0.3 + 2 * 0.2)) < 1e-9, 'under the diagonal: the a b c triangle');
  assert.ok(Math.abs(at(0.8, 0.7) - (4 + (2 - 4) * 0.2 + (1 - 4) * 0.3)) < 1e-9, 'over it: the b c d triangle');
}
assert.match(source, /const heightM = \(box\.max\.y - Math\.max\(box\.min\.y, -0\.6\)\) \* maxScale;/, 'the shadow height is what can show, not the buried skirt');
// the cascade trim (wave 74: 672-triangle rocks in every cascade): on the desktop the phone form beside the desktop one;
// the desktop form near the camera and the phone form past ROCK_FAR_M, both into the near cascades; the far cascades
// the phone form of every loose rock from a shadow-only pool; the crushable rocks pinned to the first near slots;
// the pools whole from the build, repartitioned with hysteresis when the camera has moved 8 m
assert.match(source, /if \(!mobileProps\) \{\n\s*const far = buildBoulderForm\(vi, noi, mulberry32\(seed \+ 60 \+ vi\), hull, 4, legacyTop, boulderKindFor\(lithology, vi\), lithology, angular\);/,
  'the far form is the same rock at the phone\'s tier');
assert.match(source, /const ROCK_FAR_M = 60;/);
assert.match(source, /const ROCK_NEAR_CASCADES = 0b0011, ROCK_FAR_CASCADES = 0b1100;/);
assert.match(source, /markShadowOnly\(shadow\);\n\s*setShadowCasterCascades\(shadow, ROCK_FAR_CASCADES\);\n\s*setShadowCasterCascades\(near, ROCK_NEAR_CASCADES\);\n\s*setShadowCasterCascades\(far, ROCK_NEAR_CASCADES\);/,
  'the near and far pools cast into the near cascades, the shadow-only pool into the far ones');
assert.match(source, /'rock-variant-' \+ vi \+ '-far'[\s\S]{0,1500}'rock-variant-' \+ vi \+ '-shadow'/, 'the probes find every pool by name');
assert.match(source, /rockClutter\.get\(rockPlacements\[vi\]\[i\]\)!\.bindInstance\(near, k\);/, 'a crushable rock keeps its near slot for its clutter');
assert.match(source, /high: new Uint8Array\(n\)\.fill\(1\),\n\s*\};\n\s*writeRockLod\(lod\);/, 'the pools are whole from the build');
assert.match(source, /const wasHigh = high\[i\] !== 0, isHigh = wasHigh \? d <= ROCK_FAR_M \+ 10 : d < ROCK_FAR_M;/, 'the repartition holds a 10 m hysteresis');
assert.match(source, /loose: Int32Array\.from\(loose\)/, 'the repartition walks the build\'s typed arrays');
{
  // (a pass allocates nothing: no array literal, no new matrix, no closure in the repartition or its writer)
  const body = source.slice(source.indexOf('function updateRockLod('), source.indexOf('function updatePoleLod('));
  assert.ok(body.length > 500 && !/\bnew (?!THREE\.Vector3\(Number\.NaN|Float64Array\(64\)|Float32Array\(64\))\w|\[[a-z][^\]]*,[^\]]*\]\)|=>|\.map\(|\.forEach\(|\.filter\(|of \[/.test(body.slice(body.indexOf('function updateRockLod('))),
    'the rocks\' repartition allocates nothing per pass');
}
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
// (b14) the shadow pass inset on every pool; one horizontal axis drawn in by the place's hash (no draw: every later
// placement keeps its seat), the stone inside its collider's hull
assert.match(source, /const mesh = new THREE\.InstancedMesh\(geometry, mats\.rock, count\);[\s\S]{0,400}mesh\.customDepthMaterial = rockDepth;/, 'every rock pool casts through the inset pass');
assert.match(source, /const rockDepth = createRockDepthMaterial\(\);\n\s*retainedSurfaceMaterials\.push\(rockDepth\);/, 'the inset pass retained with the props');
{
  const at = source.indexOf('const stretchRoll = ');
  const stretch = source.slice(at, source.indexOf('const placement = _mat4.clone();', at));
  assert.ok(at > 0 && !/rng\(\)/.test(stretch), 'the stretch draws nothing');
  assert.match(stretch, /const stretch = 0\.74 \+ 0\.26 \* \(\(stretchRoll \* 7\.31\) % 1\);/, 'to three quarters at most');
  assert.match(stretch, /_scalev\.set\(stretchRoll < 0\.5 \? sc \* stretch : sc, scaleY, stretchRoll < 0\.5 \? sc : sc \* stretch\)/, 'one horizontal axis, never up');
}
// (b14; wave 97: "no burial, soil lip …", "a clean seam instead of in drifted sand") the beds: run the props' own builder
// (sliced from props.ts) over a stone on flat ground and on a sandy map
{
  const at = source.indexOf('  function* buildRockBeds(): Generator<PropsBuildSlice, THREE.BufferGeometry[], void> {');
  const end = source.indexOf('  // the scenery lane (wave 57, "a ruler-straight base line on the grass with no soil collar")', at);
  assert.ok(at > 0 && end > at, 'the beds\' builder');
  // (b16) the contact patch's share profile, sliced from props.ts as the beds' builder reads it
  const shareAt = source.indexOf('  function contactShare(rho: number): number {');
  assert.ok(shareAt > 0, 'the contact share');
  const ringsSrc = /const CONTACT_PATCH_RINGS: readonly number\[\] = (\[[^\]]*\]);/.exec(source)[1];
  const sharesSrc = /const ROCK_PATCH_SHARES: readonly number\[\] = (\[[^\]]*\]);/.exec(source)[1];
  const contactShare = new Function(`const CONTACT_PATCH_RINGS = ${ringsSrc}, ROCK_PATCH_SHARES = ${sharesSrc};\n${stripTypeScriptTypes(source.slice(shareAt, source.indexOf('\n  }\n', shareAt) + 4))}\nreturn contactShare;`)();
  const SPOT_R = 2.6;
  // (b37) the beds' cells (512 m, one geometry a cell with the wall turf), declared beside the builder
  const cellSrc = stripTypeScriptTypes(/  const BED_CELL_M = \d+;\n  const bedCellKey = [^\n]*\n/.exec(source)[0]);
  const build = (dust, snowCap, crushable, foldAt = undefined) => {
    // (a straight-sided stone, a metre in radius: its section the same at every height, so no lip is held down by a
    // stone drawing in above its foot)
    const form = { geometry: new THREE.CylinderGeometry(1, 1, 2, 48, 12) };
    const placement = new THREE.Matrix4().compose(new THREE.Vector3(10, -0.22 * 1.6, 20), new THREE.Quaternion(), new THREE.Vector3(1.6, 1.6, 1.6));
    const rockPlacements = [[placement], [], []], rockGeos = [form.geometry, form.geometry, form.geometry];
    const rockClutter = new Map(crushable ? [[placement, {}]] : []);
    const rockContact = !snowCap && dust < 0.5, rockSpotOf = new Map(rockContact ? [[placement, { x: 10, z: 20, r: SPOT_R }]] : []);
    const rockBedShades = [];
    // (2026-10-08) props.ts's near-mesh vertex memo, as the plain field query it memoizes (nearMeshVertexMemo.selftest)
    const fixtureField = { getHeightAt: () => 0, ...(foldAt ? { _foldAt: foldAt } : {}) };
    const fn = new Function('THREE', 'terrainNearMeshHeightAt', 'heightField', 'nearMeshVertexHeight', 'cfg', 'rockDressing', 'snowCap', 'rockGeos', 'rockPlacements',
      'rockClutter', 'boulderSections', 'boulderSectionRadius', 'rockContact', 'rockSpotOf', 'rockBedShades', 'contactShare',
      `${cellSrc}\n${stripTypeScriptTypes(source.slice(at, end))}\nreturn buildRockBeds;`)(THREE, terrainNearMeshHeightAt, fixtureField,
      (px, pz) => fixtureField.getHeightAt(px, pz),
      { splat: { rippleDir: [1, 0] } }, { dust }, snowCap, rockGeos, rockPlacements, rockClutter, boulderSections, boulderSectionRadius,
      rockContact, rockSpotOf, rockBedShades, contactShare);
    const it = fn();
    let r = it.next();
    while (!r.done) r = it.next();
    return { beds: r.value, form, placement, shades: rockBedShades };
  };
  assert.equal(build(0, false, true).beds.length, 0, 'no bed under a crushable stone (a tank flattens it)');
  const soil = build(0, false, false), sand = build(0.8, false, false);
  for (const [label, { beds, form }] of [['a soil lip', soil], ['a sand drift', sand]]) {
    assert.equal(beds.length, 1, `${label}: one cell's geometry`);
    const g = beds[0], p = g.attributes.position, idx = g.index.array, sections = boulderSections(form.geometry);
    assert.equal(p.count, 24 * 5, `${label}: 24 directions, five rings`);
    assert.ok(!g.getAttribute('uv') && g.getAttribute('normal') && g.getAttribute('fold'), `${label}: world space, the terrain material\'s attributes`);
    for (let k = 0; k < 24; k++) {
      const v = (j) => [p.getX(k * 5 + j) - 10, p.getY(k * 5 + j), p.getZ(k * 5 + j) - 20];
      const [x0, y0, z0] = v(0), [x4, y4, z4] = v(4), [x1, y1, z1] = v(1);
      const angle = Math.atan2(z0, x0), inner = boulderSectionRadius(sections, (y0 + 0.22 * 1.6) / 1.6, angle) * 1.6;
      assert.ok(Math.hypot(x0, z0) < inner, `${label}: the inner ring inside the stone`);
      assert.ok(Math.abs(y4 + 0.05) < 1e-4, `${label}: the outer ring 5 cm under the ground`);
      assert.ok(y1 > 0.01 && y1 < 0.35, `${label}: a lip at the stone's face (${y1.toFixed(3)} m)`);
      assert.ok(Math.hypot(x4, z4) > Math.hypot(x1, z1) + 0.2, `${label}: a lip's width out`);
    }
    for (let t = 0; t < idx.length; t += 3) {
      const a = new THREE.Vector3().fromBufferAttribute(p, idx[t]), b = new THREE.Vector3().fromBufferAttribute(p, idx[t + 1]), c = new THREE.Vector3().fromBufferAttribute(p, idx[t + 2]);
      assert.ok(b.sub(a).cross(c.sub(a)).y > 0, `${label}: every triangle faces up`);
    }
  }
  // the drift: the sand piled up the windward side (the wind blows along +x: its windward face looks along -x)
  const lipAt = (beds, dirX) => {
    const p = beds[0].attributes.position;
    let best = -Infinity, y = 0;
    for (let k = 0; k < 24; k++) { const dx = p.getX(k * 5 + 1) - 10, dz = p.getZ(k * 5 + 1) - 20, d = (dx * dirX) / Math.hypot(dx, dz); if (d > best) { best = d; y = p.getY(k * 5 + 1); } }
    return y;
  };
  assert.ok(lipAt(sand.beds, -1) > lipAt(sand.beds, 1) * 2 && lipAt(sand.beds, -1) > 0.12, `the drift up the windward side (${lipAt(sand.beds, -1).toFixed(3)} m against ${lipAt(sand.beds, 1).toFixed(3)} m in the lee)`);
  // (b16; wave 121: "pale halos") the contact patch carried over the bed: the disc's soil at the same place, from the face
  // out, gone where the bed has sunk under the ground; none on sand (no disc there) — and the ground's fold on the bed
  assert.equal(sand.shades.length, 0, 'no patch over a sand drift (sand maps lay no disc)');
  assert.equal(soil.shades.length, 1, 'a soil bed carries its stone\'s patch');
  {
    const shade = soil.shades[0], sp = shade.attributes.position, uv = shade.attributes.uv, tint = shade.attributes.color, bed = soil.beds[0].attributes.position;
    assert.equal(sp.count, 24 * 4, 'the bed\'s rings from the face out');
    for (let k = 0; k < 24; k++) for (let j = 1; j < 5; j++) {
      const s = k * 4 + (j - 1), b = k * 5 + j;
      assert.ok(Math.abs(sp.getX(s) - bed.getX(b)) < 1e-5 && Math.abs(sp.getZ(s) - bed.getZ(b)) < 1e-5 && Math.abs(sp.getY(s) - bed.getY(b) - 0.03) < 1e-5,
        'over the bed\'s own vertex, 3 cm up');
      const dx = sp.getX(s) - 10, dz = sp.getZ(s) - 20, rho = Math.hypot(dx, dz) / SPOT_R;
      if (rho <= 1) assert.ok(Math.abs(uv.getX(s) - (0.5 + 0.5 * dx / SPOT_R)) < 1e-5 && Math.abs(uv.getY(s) - (0.5 + 0.5 * dz / SPOT_R)) < 1e-5, 'the disc\'s uv at the same place');
      const want = j === 4 ? 0 : contactShare(rho);
      assert.ok(Math.abs(tint.getW(s) - want) < 1e-5, `the disc's share at the same distance (${tint.getW(s).toFixed(3)} for ${want.toFixed(3)})`);
    }
    // the disc's own profile: its rings' shares, linear between them, none past its rim
    assert.ok(Math.abs(contactShare(0) - 0.3) < 1e-9 && Math.abs(contactShare(0.55) - 0.425) < 1e-9 && Math.abs(contactShare(0.99) - (0.5 + 0.5 * (0.29 / 0.3))) < 1e-9 && contactShare(1.01) === 0, 'the share profile');
    assert.match(source, /for \(const shade of rockBedShades\) dirtDiscs\.push\(shade\);/, 'the shades join the contact layer');
    assert.match(source, /const ROCK_PATCH = ROCK_PATCH_SHARES;/, 'the disc and the shades share one profile');
    assert.match(source, /const rings = CONTACT_PATCH_RINGS, segs = 18;/, 'and one set of rings');
  }
  {
    const flat = soil.beds[0].getAttribute('fold');
    assert.ok(flat && flat.normalized && flat.array instanceof Int8Array && flat.array.every((v) => v === 0), 'the fold byte, zero where the ground has no fold sampler');
    const hollow = build(0, false, false, () => 0.5).beds[0].getAttribute('fold');
    assert.ok(hollow.array.every((v) => v === 64), 'the ground\'s fold under every vertex, as the terrain\'s chunks carry it');
  }
  assert.match(source, /if \(!mobileProps\) group\.userData\.rockBeds = yield\* buildRockBeds\(\);\n\s*rockClutter\.clear\(\);/, 'the beds built while the crushables are known, not on the phones');
  const map = readFileSync(new URL('./map.ts', import.meta.url), 'utf8');
  assert.match(map, /group\.add\(terrain, vegetation\.group, props\.group\);\n\s*bindRockBeds\(terrain, props\.group\);/, 'the world binds the beds');
  assert.match(map, /material\.userData\.layerMeans && material\.userData\.groundClock\) ground = material;/, 'to the terrain\'s own material');
  assert.match(map, /mesh\.castShadow = false;\n\s*mesh\.receiveShadow = true;/, 'the beds cast nothing');
}
console.log('rockDressing self-test passed: three weathered kinds over seven rocks closed, unfolded, hollowed and knobbed, deep-skirted and inside their hulls, every map dressed, seven stand-in tiles about a mid grey, the lichen rank exact, the photographed stone in the hook');
