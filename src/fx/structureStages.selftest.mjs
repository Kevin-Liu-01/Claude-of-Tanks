// structureStages.selftest.mjs — a structure's stages laid into the world's own geometry through the real seam
// (destruction-fx lane, 2026-10-07): the default kit's builders write through the debris writers in the building's
// buckets, their cuts land in the mask in world space, a damaged building's glass is flattened (and stood up again on
// reset), a jumped stage lays the one it skipped, a collapse touches its casters every frame it falls and once more,
// and a settled stage lays its final state at once.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { damageSeed } from '../world/destructionKit.ts';
import { describeDefault } from '../world/destructionDefaultKit.ts';
import { createStructureDamageSeam } from '../world/structureDamageSeam.ts';
import { createStructureMask, COLLAPSE_S, MAX_HOLES } from './structureMask.ts';
import { createStructureDebris } from './structureDebris.ts';
import { createStructureStages } from './structureStages.ts';

// ---- a two-storey plastered house with a tiled roof and windows (the kit selftest's), placed and merged
function part(bucket, w, h, d, x, y, z, color) {
  const g = new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
  if (color) g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(g.getAttribute('position').count * 3).fill(0).map((_, i) => color[i % 3]), 3));
  g.userData.bucket = bucket;
  return g;
}
const parts = {
  regionalPlaster: [part('regionalPlaster', 10, 6, 8, 0, 0, 0, [0.8, 0.75, 0.6])],
  regionalRoof: [part('regionalRoof', 10.6, 2.4, 8.6, 0, 6, 0, [0.6, 0.3, 0.2])],
  glass: [part('glass', 1, 1.2, 0.05, -2, 1, 4), part('glass', 1, 1.2, 0.05, 2, 1, 4), part('glass', 0.05, 1.2, 1, 5, 1, 0)],
};
const placement = { x: 40, y: 2, z: -30, yaw: 0.6 };
const anatomy = describeDefault({ structureIdx: 7, mapId: 'verdant', builder: 'cottage', style: null, parts, w: 10, d: 8, h: 8.4,
  placement, massClass: 'house', seed: damageSeed(1, 4000, -3000) });
anatomy.mound = { cx: 40, cz: -30, hw: 4, hd: 5, yaw: 0.6, heightM: 1.5 };
const c = Math.cos(placement.yaw), s = Math.sin(placement.yaw);
const toWorld = (bx, by, bz) => [placement.x + bx * c + bz * s, placement.y + by, placement.z - bx * s + bz * c];

// the merged buckets: plaster and glass, de-indexed, in the world (identity meshes, as the world keeps them)
function merged(bucket, list) {
  const flat = list.map((g) => g.toNonIndexed());
  const n = flat.reduce((acc, g) => acc + g.getAttribute('position').count, 0);
  const arr = new Float32Array(n * 3);
  let at = 0;
  const ranges = [];
  for (const g of flat) {
    const p = g.getAttribute('position');
    ranges.push([at, p.count]);
    for (let i = 0; i < p.count; i++) arr.set(toWorld(p.getX(i), p.getY(i), p.getZ(i)), (at + i) * 3);
    at += p.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ name: bucket }));
  mesh.castShadow = true;
  return { mesh, ranges };
}
const wall = merged('regionalPlaster', parts.regionalPlaster), glass = merged('glass', parts.glass);
const spans = [
  ...wall.ranges.map(([first, count]) => ({ mesh: wall.mesh, geometryId: null, instanceId: null, position: wall.mesh.geometry.getAttribute('position'),
    bucket: 'regionalPlaster', partClass: 'wall', first, count })),
  ...glass.ranges.map(([first, count]) => ({ mesh: glass.mesh, geometryId: null, instanceId: null, position: glass.mesh.geometry.getAttribute('position'),
    bucket: 'glass', partClass: 'glass', first, count })),
];
const fresh = () => createStructureDamageSeam(7, 'cottage', null, anatomy, spans);
const epoch = (mesh) => mesh.userData.cotShadowEpoch ?? 0;

let now = 100;
const mask = createStructureMask(64);
const debris = createStructureDebris({ now: () => now, groundY: () => 2 });
const worldStone = new THREE.MeshStandardMaterial({ name: 'stone' });
const stages = createStructureStages({ mask, debris, now: () => now, materialFor: (bucket) => (bucket === 'stone' ? worldStone : null) });
const data = mask.texture.image.data;
const T = 10 * 4, o = 7 * T;
const base = { structureId: 7, massClass: 'house', cx: 40, cz: -30, hw: 5, hd: 4, yaw: 0.6, baseY: 2, topY: 10.4, cause: 'blast',
  munition: 'he', points: 30, integrity: 0.5 };
const glassBefore = Float32Array.from(glass.mesh.geometry.getAttribute('position').array);

// ---- damaged: the builder's spalls and chips, its glass hidden (flattened in the bucket), one shadow touch
{
  const seam = fresh();
  const e0 = epoch(glass.mesh);
  const [fx, , fz] = toWorld(1, 2, 4.2);
  stages.stage({ ...base, stage: 'damaged', previous: 'intact', x: fx, y: 4, z: fz, dirX: 0, dirZ: 1 }, seam);
  const g = glass.mesh.geometry.getAttribute('position').array;
  for (const [first, count] of glass.ranges) {
    for (let i = first; i < first + count; i++) {
      assert.deepEqual([g[i * 3], g[i * 3 + 1], g[i * 3 + 2]], [g[first * 3], g[first * 3 + 1], g[first * 3 + 2]], 'a damaged building\'s glass is gone');
    }
  }
  assert.ok(glass.mesh.geometry.getAttribute('position').version > 0, 'the flattened range uploads');
  assert.ok(epoch(glass.mesh) > e0 && epoch(wall.mesh) > 0, 'its casters are touched once');
  assert.equal(stages.stats().flattened, glass.ranges.length);
  assert.ok(debris.stats().pieces > 0, 'the damaged builder threw its spalls and shards through the writers');
  // its spalled patches: shallow cuts through the render only (outside 0.01 m: what stands proud of the wall survives)
  assert.equal(data[o + 7], 2, 'two spalled patches cut');
  for (let h = 0; h < 2; h++) {
    const n = o + 8 + h * 8 + 4;
    assert.ok(Math.abs(data[n + 3] - 0.01) < 1e-4 && data[n + 2] < 0.2, `spall ${h}: through the render, not the wall`);
  }
  assert.ok(debris.stats().meshes > 0, 'the patches\' units and lips in the wall\'s own buckets');
}

// ---- breached: the hole the blow opens on the face nearest it, cut into the mask in world space
{
  const seam = fresh();
  const [fx, , fz] = toWorld(1, 0, 4.3); // a burst at the foot of the front wall
  stages.stage({ ...base, stage: 'breached', previous: 'damaged', x: fx, y: 2.2, z: fz, dirX: -s, dirZ: -c }, seam);
  // a rendered wall's breach: a shallow ring through the render (the render broken back round the hole), then the
  // hole itself, newest; with the two spalls the ring of four is full
  assert.equal(data[o + 7], 4, 'the spalls, the render ring and the hole');
  const R = o + 8 + 2 * 8, H = o + 8 + 3 * 8;
  assert.ok(Math.abs(data[R + 7] - 0.01) < 1e-4 && data[R + 6] < 0.2 && data[R + 3] > data[H + 3],
    'the ring: wider than the hole, through the render only');
  const hx = data[H], hy = data[H + 1], hz = data[H + 2], hr = data[H + 3];
  const nx = data[H + 4], nz = data[H + 5];
  // the front face's outward normal is body +z: world (sin yaw, cos yaw)
  assert.ok(Math.abs(nx - s) < 1e-3 && Math.abs(nz - c) < 1e-3, `the cut faces out of the front wall (${nx}, ${nz})`);
  assert.ok(Math.abs(hr - 1.3) < 1e-3, 'an HE shell\'s hole: 1.3 m');
  assert.ok(hy >= base.baseY + 1.3 * 0.85 - 1e-3, 'off the ground');
  // on the front plane: the centre's body z is the face's (4)
  const bz = (hx - placement.x) * s + (hz - placement.z) * c;
  assert.ok(Math.abs(bz - 4) < 0.35, `on the front wall (body z ${bz.toFixed(3)})`);
  assert.ok(data[H + 6] > 0.1 && Math.abs(data[H + 7] - 0.3) < 1e-4, 'it cuts through the wall (0.3 m outside)');
}

// ---- collapsed: the fall, the pile, the touches (every frame it moves, and the frame it is discarded)
{
  const seam = fresh();
  const before = epoch(wall.mesh);
  stages.stage({ ...base, stage: 'collapsed', previous: 'breached', x: 40, y: 4, z: -30, dirX: 1, dirZ: 0 }, seam);
  assert.equal(data[o], now, 'the fall starts now');
  assert.equal(stages.stats().falling, 1);
  const frames = Math.ceil(COLLAPSE_S * 60) + 3;
  let touches = 0;
  for (let f = 0; f < frames; f++) {
    const e0 = epoch(wall.mesh);
    now += 1 / 60;
    stages.update();
    if (epoch(wall.mesh) > e0) touches++;
  }
  assert.ok(touches >= Math.floor(COLLAPSE_S * 60) && touches <= Math.ceil(COLLAPSE_S * 60) + 1, `touched every frame of the fall (${touches})`);
  assert.equal(stages.stats().falling, 0, 'and not after it');
  assert.ok(epoch(wall.mesh) > before);
  assert.ok(debris.stats().meshes > 2, 'the stubs and the pile in the building\'s buckets');
  const runs = debris.group.children.filter((m) => m.isMesh && /^fx-structure-(remnant|rubble)/.test(m.name));
  assert.ok(runs.some((m) => m.material === worldStone), 'its stone core in the world\'s own stone material (not among its spans)');
  assert.ok(runs.some((m) => m.material === wall.mesh.material), 'its render in its own plaster bucket');
  assert.ok(runs.every((m) => !/fallback/.test(m.material.name) || m.material.vertexColors), 'a bucket the world lacks: tinted fallback');
}

// ---- reset: every building stands up again (the glass back where it was)
{
  stages.reset();
  mask.reset();
  assert.deepEqual(Array.from(glass.mesh.geometry.getAttribute('position').array), Array.from(glassBefore), 'the glass is back');
  assert.equal(stages.stats().flattened, 0);
}

// ---- a jump (intact -> breached) lays the damaged stage too; a settled collapse lays its state at once
{
  const seam = fresh();
  const [fx, , fz] = toWorld(-3, 0, 4.3);
  stages.stage({ ...base, stage: 'breached', previous: 'intact', x: fx, y: 3, z: fz, dirX: -s, dirZ: -c, munition: 'howitzer' }, seam);
  assert.equal(stages.stats().flattened, glass.ranges.length, 'the skipped damaged stage hid the glass');
  assert.equal(data[o + 7], 4, 'its spalls, the render ring and the hole');
  assert.ok(Math.abs(data[o + 8 + 3 * 8 + 3] - 2.1) < 1e-3, 'a howitzer shell\'s hole');
  const e0 = epoch(wall.mesh);
  const piecesBefore = debris.stats().pieces;
  stages.stage({ ...base, stage: 'collapsed', previous: 'intact', x: 40, y: 4, z: -30, dirX: 0, dirZ: 1, settled: true }, seam);
  assert.equal(stages.stats().falling, 0, 'a settled collapse does not fall');
  assert.ok(data[o] > 0 && now - data[o] > COLLAPSE_S, 'it is down already');
  assert.ok(epoch(wall.mesh) === e0 + 1 || epoch(wall.mesh) === e0 + 2, 'touched once (and once more for its cut, if any)');
  assert.equal(debris.stats().pieces, piecesBefore, 'nothing falls from a settled stage');
  // holes: the ring never grows past MAX_HOLES
  for (let i = 0; i < MAX_HOLES + 2; i++) stages.breach({ structureId: 7, section: 0, sectionKind: 'wall', y0: 2, y1: 5, hole: i,
    x: fx, y: 3.5, z: fz, nx: s, ny: 0, nz: c, radiusM: 0.6, munition: 'atgm', sectionDown: false }, seam);
  assert.equal(data[o + 7], MAX_HOLES, 'four holes kept');
  stages.reset();
}

// ---- a world without the seam: the mask alone (the fall still happens)
{
  mask.reset();
  stages.stage({ ...base, stage: 'collapsed', previous: 'intact', x: 40, y: 4, z: -30, dirX: 0, dirZ: 1 }, null);
  assert.ok(data[o] > 0, 'the mask falls without a seam');
  assert.equal(stages.stats().falling, 0, 'nothing to touch');
}

console.log('structureStages selftest: damaged glass hidden and restored, breach cut on the struck face, a collapse touched every frame it falls, settled and jumped stages, holes kept to the ring — ok');
