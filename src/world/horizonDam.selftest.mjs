// The map-revival lane (2026-10-06, Skybridge round 2; gauntlet wave 107: "no drowned canyon, no dam"): Glen Canyon
// Dam in Skybridge's north ring (horizonDam.ts). Opt-in: only Skybridge carries one. The canyon only lowers the ring,
// on the gorge's axis past its mouth, within the tableland's 3.6:1 cliff bound; the tailwater's bed lies between the
// mouth and the dam and the reservoir behind the arch, as the ring's own water. The dam is one lit draw on the seated
// ring — the ring's foundation under the middle of its face, rock over the crest at both abutments — facing the map.
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';

globalThis.document = { createElement(tag) { assert.equal(tag, 'canvas'); return createCanvas(1, 1); } };
const { MAP_IDS, getMapConfig } = await import('./maps/index.ts');
const { HORIZON_SEGMENTS, buildHorizonRing, sampleHorizonGeometry } = await import('./maps/horizon.ts');
const { createHeightField } = await import('./terrain.ts');
const { SHADOW_CASTER_LAST_CASCADE, shadowCasterCascadesOf } = await import('../engine/renderLayers.ts');

for (const id of MAP_IDS) {
  assert.equal(Boolean(getMapConfig(id).horizon?.dam), id === 'skybridge', `${id}: only Skybridge's ring carries a dam`);
}

const cfg = getMapConfig('skybridge');
const dam = cfg.horizon.dam;
const reservoir = dam.crestM - (dam.freeboardM ?? 3);
const damR = Math.hypot(dam.x, dam.z), ux = dam.x / damR, uz = dam.z / damR;
const alongOf = (x, z) => x * ux + z * uz, acrossOf = (x, z) => Math.abs(-x * uz + z * ux);
const without = { ...cfg, horizon: { ...cfg.horizon, dam: undefined } };
const field = createHeightField(1337, cfg);

for (const [label, ground] of [['seated', field], ['bare', undefined]]) {
  const carved = sampleHorizonGeometry(cfg, 1337, ground), plain = sampleHorizonGeometry(without, 1337, ground);
  const P = carved.positions, n = HORIZON_SEGMENTS, rows = carved.rows.length;
  assert.equal(carved.heights.length, plain.heights.length, `${label}: the same ladder`);
  let lowered = 0;
  for (let i = 0; i < carved.heights.length; i++) {
    assert.ok(P[i * 3] === plain.positions[i * 3] && P[i * 3 + 2] === plain.positions[i * 3 + 2], `${label}: heights only`);
    assert.ok(carved.heights[i] <= plain.heights[i], `${label}: the canyon only lowers the ring`);
    if (carved.heights[i] === plain.heights[i]) continue;
    lowered++;
    const along = alongOf(P[i * 3], P[i * 3 + 2]), across = acrossOf(P[i * 3], P[i * 3 + 2]);
    // (seated, the plain at the mouth lies at the bed's level, so the cut starts there; the bare backdrop's first table
    // stands 229 m high at 700-855 m and the floor's rise inward of the mouth meets it nearer the square)
    assert.ok(along >= (ground ? dam.mouthM - 20 : 560) && across < 160,
      `${label}: the canyon keeps to the gorge's axis past its mouth (${along.toFixed(0)} m out, ${across.toFixed(0)} m across)`);
  }
  assert.ok(lowered > 60, `${label}: the canyon is cut (${lowered} vertices lowered)`);
  // the tableland stair's cliff bound, radially, wherever the canyon cut (where the plain ring already exceeded it there,
  // the canyon makes it no steeper)
  const radius = (i) => Math.hypot(P[i * 3], P[i * 3 + 2]);
  for (let c = 0; c < n; c++) {
    for (let r = 1; r < rows; r++) {
      const i = r * n + c, j = i - n;
      if (carved.heights[i] === plain.heights[i] && carved.heights[j] === plain.heights[j]) continue;
      const gap = radius(i) - radius(j);
      const slope = Math.abs(carved.heights[i] - carved.heights[j]) / gap;
      const before = Math.abs(plain.heights[i] - plain.heights[j]) / gap;
      assert.ok(slope <= Math.max(3.6, before) + 1e-3, `${label}: the canyon keeps the 3.6:1 cliff bound (${slope.toFixed(2)})`);
    }
  }
  // on the axis: the tailwater's bed from the mouth to the dam's toe, the reservoir behind the arch
  let bed = 0, water = 0;
  for (let i = 0; i < carved.heights.length; i++) {
    const x = P[i * 3], z = P[i * 3 + 2];
    if (acrossOf(x, z) > 12) continue;
    const along = alongOf(x, z);
    if (along > dam.mouthM + 100 && along < damR - 90 && plain.heights[i] > dam.floorM) {
      assert.equal(carved.heights[i], dam.floorM, `${label}: the tailwater's bed lies level (${along.toFixed(0)} m out)`);
      bed++;
    }
    if (along > damR + 25 && plain.heights[i] > reservoir) {
      assert.equal(carved.heights[i], reservoir, `${label}: the reservoir stands under the crest (${along.toFixed(0)} m out)`);
      water++;
    }
  }
  assert.ok(bed >= 3 && water >= 3, `${label}: the axis crosses the bed and the reservoir (${bed}, ${water})`);
}

// the dam on the seated ring
const ring = buildHorizonRing(null, cfg, 1337, field);
const dams = ring.children.filter((child) => child.name === 'horizon-dam');
assert.equal(dams.length, 1, 'the seated ring carries one dam');
const mesh = dams[0];
assert.ok(mesh.isMesh && mesh.material.isMeshStandardMaterial && mesh.material.vertexColors, 'one lit, vertex-coloured draw');
const info = mesh.userData.horizonDam;
assert.ok(info.triangles >= 300 && info.triangles <= 2000, `about a thousand triangles (${info.triangles})`);
assert.ok(mesh.castShadow && !mesh.receiveShadow, 'it casts and receives no cascade');
assert.equal(shadowCasterCascadesOf(mesh), SHADOW_CASTER_LAST_CASCADE, 'its shadow in the far cascade only');
assert.ok(info.proudM <= -5, `the ring's foundation stays inside the dam under the middle of its face (${info.proudM} m)`);
assert.ok(info.abutmentM >= 1, `rock stands over the crest at both abutments (${info.abutmentM} m)`);
assert.ok(info.chordM > 120 && info.chordM < 320, `the crest spans the canyon (${info.chordM} m)`);
const pos = mesh.geometry.attributes.position, nor = mesh.geometry.attributes.normal;
let top = -Infinity, nearest = Infinity, facing = 0, faceVertices = 0;
for (let i = 0; i < pos.count; i++) {
  const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
  assert.ok(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z), 'finite');
  top = Math.max(top, y);
  nearest = Math.min(nearest, Math.hypot(x, z));
  // the battered downstream face (its normals lean up by its batter) looks back toward the map
  const ny = nor.getY(i);
  if (ny > 0.15 && ny < 0.6 && y > dam.floorM + 25) {
    faceVertices++;
    facing += -(nor.getX(i) * ux + nor.getZ(i) * uz) / Math.hypot(nor.getX(i), nor.getZ(i));
  }
}
assert.equal(top, dam.crestM, 'the deck is the crest');
assert.ok(nearest > 700, `the dam stands far past the playable edge (${nearest.toFixed(0)} m)`);
assert.ok(faceVertices > 20 && facing / faceVertices > 0.8, `the downstream face looks back at the map (${(facing / faceVertices).toFixed(2)})`);
// the reservoir is the ring's water: its marine flag (uv.y < 0) only behind the arch, at the reservoir's level (or on
// the plateau's ground behind the dam that already lay under it)
const uv = ring.geometry.attributes.uv, rp = ring.geometry.attributes.position;
let marine = 0, level = 0;
for (let i = 0; i < uv.count; i++) {
  if (uv.getY(i) >= 0) continue;
  marine++;
  assert.ok(rp.getY(i) <= reservoir + 0.02, `the water never climbs over the reservoir's level (${rp.getY(i).toFixed(2)})`);
  if (Math.abs(rp.getY(i) - reservoir) < 0.02) level++;
  assert.ok(alongOf(rp.getX(i), rp.getZ(i)) > damR - 60, 'and only behind the arch');
}
assert.ok(marine > 20 && level > marine * 0.6, `the reservoir carries the ring's water, most of it the carved lake (${level} of ${marine} vertices)`);
// the receipts' bare backdrop (no ground) keeps the canyon and stands no dam
assert.equal(buildHorizonRing(null, cfg, 1337).getObjectByName('horizon-dam'), undefined, 'no dam on the bare backdrop');
console.log(`horizonDam: Skybridge's dam ${info.chordM} m across, ${info.heightM} m tall, ${info.triangles} triangles; ring ${info.proudM} m under its face, rock ${info.abutmentM} m over its crest; ${marine} reservoir vertices (${level} at its level)`);
