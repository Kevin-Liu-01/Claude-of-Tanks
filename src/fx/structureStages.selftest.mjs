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
import { createStructureScars } from './structureScars.ts';

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
  // its rim and room belong to the standing building: they carry its run tag, so they fall with it
  const rims = debris.group.children.filter((m) => m.isMesh && /^fx-structure-(rim|room)/.test(m.name));
  assert.ok(rims.length > 0 && rims.every((m) => m.geometry.getAttribute('aDamage')?.array[0] === 32768 + 8),
    'the breach\'s rim and room fall with the building');
  // (b5: the room drew in the world's glossy 'dark' window material: the sky's reflection filled the hole) the room is
  // matte, in the builder's own interior tint, and folds with its building (the mask's patch)
  const rooms = debris.group.children.filter((m) => m.isMesh && /^fx-structure-room/.test(m.name));
  assert.ok(rooms.length > 0, 'a breach lays its room');
  for (const room of rooms) {
    const mat = room.material;
    assert.ok(mat.name === 'fx-structure-room' && mat.vertexColors === true && mat.roughness === 1 && mat.metalness === 0
      && mat.envMapIntensity === 0, 'the room is matte and takes its interior tint');
    assert.ok(typeof mat.customProgramCacheKey === 'function' && /struct/i.test(mat.customProgramCacheKey()),
      'the room material carries the mask patch (it falls and folds with the building)');
    const col = room.geometry.getAttribute('color');
    assert.ok(col && col.array[0] < 0.2 && col.array[1] < 0.2 && col.array[2] < 0.2, 'the room is dark');
  }
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
  assert.ok(runs.every((m) => !m.geometry.getAttribute('aDamage')), 'the stubs and the pile stay where they lie (untagged)');
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

// ---- P2 section falls (DESTRUCTION.md §3.4): a house built storey by storey and face by face, as the regional kits
// build it; a wall panel down to its 1 m stub, the roof, the upper storey once its faces are down; the clamp restored
{
  const T0 = 0.43;
  const faceBox = (name, k) => {
    const y = k * 3;
    if (name === 'front') return part('regionalPlaster', 10, 3, T0, 0, y, 4 - T0 / 2);
    if (name === 'back') return part('regionalPlaster', 10, 3, T0, 0, y, -4 + T0 / 2);
    if (name === 'right') return part('regionalPlaster', T0, 3, 8, 5 - T0 / 2, y, 0);
    return part('regionalPlaster', T0, 3, 8, -5 + T0 / 2, y, 0);
  };
  const names = ['front', 'right', 'back', 'left'];
  const boxes = [0, 1].flatMap((k) => names.map((n) => ({ k, n, g: faceBox(n, k) })));
  const roofG = part('regionalRoof', 10.6, 2.4, 8.6, 0, 6, 0);
  const sParts = { regionalPlaster: boxes.map((b) => b.g), regionalRoof: [roofG] };
  const sAnatomy = describeDefault({ structureIdx: 9, mapId: 'verdant', builder: 'cottage', style: null, parts: sParts, w: 10, d: 8,
    h: 8.4, placement, massClass: 'house', seed: damageSeed(2, 4000, -3000) });
  const sWall = merged('regionalPlaster', boxes.map((b) => b.g)), sRoof = merged('regionalRoof', [roofG]);
  const sSpans = [
    ...sWall.ranges.map(([first, count]) => ({ mesh: sWall.mesh, geometryId: null, instanceId: null,
      position: sWall.mesh.geometry.getAttribute('position'), bucket: 'regionalPlaster', partClass: 'wall', first, count })),
    ...sRoof.ranges.map(([first, count]) => ({ mesh: sRoof.mesh, geometryId: null, instanceId: null,
      position: sRoof.mesh.geometry.getAttribute('position'), bucket: 'regionalRoof', partClass: 'roof', first, count })),
  ];
  const seam = createStructureDamageSeam(9, 'cottage', null, sAnatomy, sSpans);
  const wallBefore = Float32Array.from(sWall.mesh.geometry.getAttribute('position').array);
  const roofBefore = Float32Array.from(sRoof.mesh.geometry.getAttribute('position').array);
  const bodyY = (arr, i) => arr[i * 3 + 1] - placement.y;
  const rangeOf = (k, n) => sWall.ranges[boxes.findIndex((b) => b.k === k && b.n === n)];
  const sBase = { ...base, structureId: 9, hole: 255, radiusM: 0, sectionDown: true, munition: 'he', nx: 0, ny: 0, nz: 1 };
  const fall = (k, n, extra = {}) => {
    const at = { front: [0, 4], right: [5, 0], back: [0, -4], left: [-5, 0] }[n];
    const [wx, wy, wz] = toWorld(at[0], k * 3 + 1.5, at[1]);
    return { ...sBase, section: k * 4 + names.indexOf(n), sectionKind: 'wall', x: wx, y: wy, z: wz,
      y0: placement.y + k * 3, y1: placement.y + k * 3 + 3, ...extra };
  };
  const e0 = epoch(sWall.mesh);
  // 1. the ground storey's front panel: down to its stub, a metre over the base; nothing else moves
  stages.breach(fall(0, 'front'), seam);
  let w = sWall.mesh.geometry.getAttribute('position').array;
  const [f0, c0] = rangeOf(0, 'front');
  for (let i = f0; i < f0 + c0; i++) assert.ok(bodyY(w, i) <= 1 + 1e-4, 'the fallen panel stands no higher than its 1 m stub');
  assert.ok([...Array(c0).keys()].some((j) => Math.abs(bodyY(w, f0 + j) - 1) < 1e-4), 'its top is the stub\'s');
  for (const [k, n] of [[0, 'right'], [0, 'back'], [1, 'front'], [1, 'left']]) {
    const [f, cnt] = rangeOf(k, n);
    for (let i = f * 3; i < (f + cnt) * 3; i++) assert.equal(w[i], wallBefore[i], `${k}/${n} stands`);
  }
  assert.ok(epoch(sWall.mesh) > e0, 'the fall touches the casters');
  // 2. the roof: the kit's hide (its covering's pieces thrown)
  stages.breach({ ...sBase, section: 8, sectionKind: 'roof', x: placement.x, y: placement.y + 7, z: placement.z,
    y0: placement.y + 6, y1: placement.y + 8.4 }, seam);
  const r = sRoof.mesh.geometry.getAttribute('position').array;
  for (let i = 0; i < r.length; i += 3) assert.deepEqual([r[i], r[i + 1], r[i + 2]], [r[0], r[1], r[2]], 'the roof is gone');
  // 3. the upper storey's last face falls with storeyDown: the whole band down to its floor line; the ground storey stands
  for (const n of ['front', 'right', 'back']) stages.breach(fall(1, n), seam);
  stages.breach(fall(1, 'left', { storeyDown: true }), seam);
  w = sWall.mesh.geometry.getAttribute('position').array;
  for (const n of names) {
    const [f, cnt] = rangeOf(1, n);
    for (let i = f; i < f + cnt; i++) assert.ok(bodyY(w, i) <= 3 + 1e-4, `the upper storey's ${n} is down to its floor line`);
  }
  const [fr, cr] = rangeOf(0, 'right');
  assert.ok([...Array(cr).keys()].some((j) => Math.abs(bodyY(w, fr + j) - 3) < 1e-4), 'the ground storey\'s walls keep their height');
  // 4. a real hole: a P1 'breached' stage cuts no synthetic one on that structure, nor with sections on
  const slot = 9 * T;
  const holesBefore = data[slot + 7];
  stages.stage({ ...base, structureId: 9, stage: 'breached', previous: 'damaged', x: placement.x, y: 4, z: placement.z + 4,
    dirX: 0, dirZ: -1 }, seam);
  assert.equal(data[slot + 7], holesBefore, 'a structure with real holes gets no synthetic one');
  // 5. reset stands it all up again, bit for bit
  stages.reset();
  assert.deepEqual(Array.from(sWall.mesh.geometry.getAttribute('position').array), Array.from(wallBefore), 'the walls come back whole');
  assert.deepEqual(Array.from(sRoof.mesh.geometry.getAttribute('position').array), Array.from(roofBefore), 'the roof comes back');
  // with sections on, a fresh structure's 'breached' stage cuts no synthetic hole either
  const seamB = createStructureDamageSeam(9, 'cottage', null, sAnatomy, sSpans);
  mask.reset();
  stages.stage({ ...base, structureId: 9, stage: 'breached', previous: 'damaged', sections: true, x: placement.x, y: 4,
    z: placement.z + 4, dirX: 0, dirZ: -1 }, seamB);
  assert.equal(data[slot + 7], 0, 'sections on: the section holes are the breach');
  stages.reset();
  mask.reset();
}

// ---- the phone tier: no hole is cut; each cut is drawn on its wall (a breach still reads as damage), and goes with
// the building when it falls
{
  const phoneMask = createStructureMask(64, { holes: false });
  const scars = createStructureScars();
  const phone = createStructureStages({ mask: phoneMask, debris, now: () => now, scars });
  const seam = fresh();
  const [fx, , fz] = toWorld(1, 0, 4.3);
  phone.stage({ ...base, stage: 'breached', previous: 'intact', x: fx, y: 3, z: fz, dirX: -s, dirZ: -c }, seam);
  assert.equal(scars.count, 4, 'the spalls, the render ring and the hole, drawn on the wall');
  const C = scars.mesh.geometry.getAttribute('aC').array, N = scars.mesh.geometry.getAttribute('aN').array;
  assert.equal(N[3 * 4 + 2], 1, 'the hole reads as a breach (deep)');
  assert.equal(N[0 * 4 + 2], 0, 'a spall reads as a patch of the core');
  assert.ok(Math.abs(N[3 * 4] - s) < 1e-3 && Math.abs(N[3 * 4 + 1] - c) < 1e-3, 'facing out of the front wall');
  // (b5: the scar quads faced into the wall and the phone culled them all) the quad's front looks out of the wall, and
  // the material draws both sides
  assert.equal(scars.mesh.material.side, THREE.DoubleSide, 'a scar is drawn whichever way its quad winds');
  assert.match(scars.mesh.material.vertexShader, /vec3 right = vec3\( n\.z, 0\.0, -n\.x \);/,
    'right x up = n: the quad faces out of the wall');
  phone.stage({ ...base, stage: 'collapsed', previous: 'breached', x: 40, y: 4, z: -30, dirX: 0, dirZ: 1 }, seam);
  assert.ok([0, 1, 2, 3].every((i) => C[i * 4 + 3] === 0), 'a collapse takes its scars with it');
  phone.reset();
  assert.equal(scars.count, 0);
}

// ---- a world without the seam: the mask alone (the fall still happens)
{
  mask.reset();
  stages.stage({ ...base, stage: 'collapsed', previous: 'intact', x: 40, y: 4, z: -30, dirX: 0, dirZ: 1 }, null);
  assert.ok(data[o] > 0, 'the mask falls without a seam');
  assert.equal(stages.stats().falling, 0, 'nothing to touch');
}

console.log('structureStages selftest: damaged glass hidden and restored, breach cut on the struck face, a collapse touched every frame it falls, settled and jumped stages, holes kept to the ring — ok');
