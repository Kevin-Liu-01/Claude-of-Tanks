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
import { createStructureMask, COLLAPSE_S, MAX_HOLES, STRUCT_STRIDE, FRONT_T0, FRONT_T, collapseFront, collapseFrontTime } from './structureMask.ts';
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
const T = STRUCT_STRIDE * 4, o = 7 * T;
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
  // (the texel's w packs the outline's phase index over the outside distance: the kit's rim and the cut share the
  // breach seed's phase; the ring and the hole of one breach carry the same one)
  const frac = (v) => v - Math.floor(v);
  assert.ok(Math.floor(data[R + 7]) > 0 && Math.floor(data[R + 7]) === Math.floor(data[H + 7]), 'one breach, one outline phase');
  assert.ok(Math.abs(frac(data[R + 7]) - 0.01) < 1e-4 && data[R + 6] < 0.2 && data[R + 3] > data[H + 3],
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
  assert.ok(data[H + 6] > 0.1 && Math.abs(frac(data[H + 7]) - 0.3) < 1e-4, 'it cuts through the wall (0.3 m outside)');
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
  const piecesBefore = debris.stats().pieces;
  stages.stage({ ...base, stage: 'collapsed', previous: 'breached', x: 40, y: 4, z: -30, dirX: 1, dirZ: 0 }, seam);
  assert.equal(data[o], now, 'the fall starts now');
  // round 7 (wave 277): the mask has the fall's footprint (the roof drops from the eaves and rides the front), and the
  // walls' own pieces leave the crumble front band by band (the kit's own collapse pieces besides)
  const F = o + 10 * 4;
  assert.ok(Math.abs(data[F] - (placement.y + anatomy.roof.eaveY - base.baseY)) < 1e-4 && data[F + 1] === anatomy.w / 2
    && data[F + 2] === anatomy.d / 2 && Math.abs(data[F + 3] - placement.yaw) < 1e-6, 'the fall\'s eaves and footprint');
  const thrown = debris.stats().pieces - piecesBefore;
  // the kit's own collapse pieces alone (crumble off), and the phone's few
  const piecesWith = (share) => {
    const d = createStructureDebris({ now: () => now, groundY: () => 2 });
    const st = createStructureStages({ mask: createStructureMask(64, { holes: share >= 1 }), debris: d, now: () => now,
      materialFor: (bucket) => (bucket === 'stone' ? worldStone : null), crumble: share });
    st.stage({ ...base, stage: 'collapsed', previous: 'breached', x: 40, y: 4, z: -30, dirX: 1, dirZ: 0 }, fresh());
    const n = d.stats().pieces;
    st.reset();
    return n;
  };
  const kitOnly = piecesWith(0);
  const crumbled = thrown - kitOnly;
  assert.ok(crumbled >= 60, `the walls' pieces leave the front (${crumbled}, the kit's own ${kitOnly})`);
  const phoneCrumble = piecesWith(0.15) - kitOnly;
  assert.ok(phoneCrumble > 0 && phoneCrumble <= crumbled * 0.25, `the phone throws a few (${phoneCrumble} of ${crumbled})`);
  // the core (2026-10-08): after the P2 cascade ('collapsed' with sections on) the storeys threw their own pieces: the
  // kit lays its pile at once and throws none, nothing crumbles, and what stands folds within a quarter second
  {
    const d = createStructureDebris({ now: () => now, groundY: () => 2 });
    const m = createStructureMask(64);
    const st = createStructureStages({ mask: m, debris: d, now: () => now, materialFor: (bucket) => (bucket === 'stone' ? worldStone : null) });
    st.stage({ ...base, stage: 'collapsed', previous: 'breached', sections: true, x: 40, y: 4, z: -30, dirX: 1, dirZ: 0 }, fresh());
    assert.equal(d.stats().pieces, 0, 'no pieces thrown again from the full height');
    assert.ok(d.stats().meshes > 0 && d.group.children.some((q) => q.isMesh && q.visible), 'the pile and stubs laid at once');
    assert.ok(Math.abs((now - m.texture.image.data[7 * T]) - (COLLAPSE_S - 0.25)) < 1e-4, 'what stands folds within 0.25 s');
    st.reset();
  }
  // facades (2026-10-08): the pile and the stubs are seated per vertex on the undeformed ground (a slope's uphill side
  // no longer buries them); a standing stage's runs are not
  {
    const pile = (baseGroundY) => {
      const d = createStructureDebris({ now: () => now, groundY: () => 2, baseGroundY });
      const st = createStructureStages({ mask: createStructureMask(64), debris: d, now: () => now,
        materialFor: (bucket) => (bucket === 'stone' ? worldStone : null), crumble: 0 });
      st.stage({ ...base, stage: 'collapsed', previous: 'breached', x: 40, y: 4, z: -30, dirX: 1, dirZ: 0 }, fresh());
      const runs = d.group.children.filter((m) => m.isMesh && /^fx-structure-(remnant|rubble)/.test(m.name));
      const ys = runs.flatMap((m) => Array.from(m.geometry.getAttribute('position').array));
      st.reset();
      return ys;
    };
    const slope = (x, z) => 2 + 0.1 * (x - 40) - 0.05 * (z + 30);
    const flatPile = pile(undefined), seatedPile = pile(slope);
    assert.ok(flatPile.length > 0 && seatedPile.length === flatPile.length, 'the same pile');
    for (let i = 0; i < flatPile.length; i += 3) {
      assert.ok(Math.abs(seatedPile[i + 1] - (flatPile[i + 1] - placement.y + slope(flatPile[i], flatPile[i + 2]))) < 1e-4,
        'each vertex over the ground under it');
    }
  }
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
// build it; a wall panel down to its 1 m stub with the dressing proud of it, the upper storey once its faces are down
// (its band down to the floor line, what stood on it lowered, the roof riding down whole), then the roof; the clamp
// restored
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
  // the dressing (facades 2026-10-08): a door canopy and a window box proud of the ground front, a door jamb from the
  // ground up, the storey above's sill beam proud at the band's top; a ceiling under the upper storey's top, a buttress
  // up both storeys in one part, a chimney through the roof
  const dress = {
    canopy: part('regionalTrim', 1.6, 0.25, 0.5, 1.5, 2.2, 4.25),
    windowBox: part('regionalTrim', 1.0, 0.3, 0.3, -2, 1.3, 4.15),
    jamb: part('regionalTrim', 0.25, 2.2, 0.15, 0.6, 0, 4.075),
    sill: part('regionalTrim', 10.4, 0.2, 0.4, 0, 2.95, 4.2),
    ceiling: part('regionalTrim', 9.0, 0.1, 7.0, 0, 5.8, 0),
    buttress: part('regionalTrim', 0.5, 6, 1.2, -5.25, 0, -2),
    chimney: part('regionalTrim', 0.6, 9.5, 0.6, 3, 0, -2),
  };
  const dressNames = Object.keys(dress);
  const sParts = { regionalPlaster: boxes.map((b) => b.g), regionalRoof: [roofG], regionalTrim: dressNames.map((n) => dress[n]) };
  const sAnatomy = describeDefault({ structureIdx: 9, mapId: 'verdant', builder: 'cottage', style: null, parts: sParts, w: 10, d: 8,
    h: 8.4, placement, massClass: 'house', seed: damageSeed(2, 4000, -3000) });
  const sWall = merged('regionalPlaster', boxes.map((b) => b.g)), sRoof = merged('regionalRoof', [roofG]);
  const sTrim = merged('regionalTrim', dressNames.map((n) => dress[n]));
  const sSpans = [
    ...sWall.ranges.map(([first, count]) => ({ mesh: sWall.mesh, geometryId: null, instanceId: null,
      position: sWall.mesh.geometry.getAttribute('position'), bucket: 'regionalPlaster', partClass: 'wall', first, count })),
    ...sRoof.ranges.map(([first, count]) => ({ mesh: sRoof.mesh, geometryId: null, instanceId: null,
      position: sRoof.mesh.geometry.getAttribute('position'), bucket: 'regionalRoof', partClass: 'roof', first, count })),
    ...sTrim.ranges.map(([first, count]) => ({ mesh: sTrim.mesh, geometryId: null, instanceId: null,
      position: sTrim.mesh.geometry.getAttribute('position'), bucket: 'regionalTrim', partClass: 'trim', first, count })),
  ];
  const seam = createStructureDamageSeam(9, 'cottage', null, sAnatomy, sSpans);
  // the kit's storeyDown (facades' heap on the floor line), stood in for: one mound in the band, laid as the fall's run;
  // the runs standing when it is called are not the heap (a kit's own panel fall may lay its stub and room first)
  let heapBefore = new Set();
  const layHeap = (storeyIdx, out) => {
    const m = out.mesh, y0 = sAnatomy.storeys[storeyIdx].y0;
    if (m.begin('regionalPlaster', 'rubble')) {
      const ring = [[-4, -3], [4, -3], [4, 3], [-4, 3]].map(([x, z]) => m.vertex(x, y0 + 0.05, z, 0, 1, 0, 0, 0, 0.6, 0.55, 0.5));
      const apex = m.vertex(0, y0 + 1.2, 0, 0, 1, 0, 0.5, 0.5, 0.6, 0.55, 0.5);
      for (let i = 0; i < 4; i++) m.triangle(ring[i], ring[(i + 1) % 4], apex);
      m.end();
    }
    return { cuts: [], hides: [] };
  };
  seam.storeyDown = (storeyIdx, seed, out) => {
    heapBefore = new Set(debris.group.children);
    return layHeap(storeyIdx, out);
  };
  const wallBefore = Float32Array.from(sWall.mesh.geometry.getAttribute('position').array);
  const roofBefore = Float32Array.from(sRoof.mesh.geometry.getAttribute('position').array);
  const trimBefore = Float32Array.from(sTrim.mesh.geometry.getAttribute('position').array);
  const bodyY = (arr, i) => arr[i * 3 + 1] - placement.y;
  const rangeOf = (k, n) => sWall.ranges[boxes.findIndex((b) => b.k === k && b.n === n)];
  const trimRange = (n) => sTrim.ranges[dressNames.indexOf(n)];
  const trimYs = (n) => { const [f, cnt] = trimRange(n); const t = sTrim.mesh.geometry.getAttribute('position').array;
    return [...Array(cnt).keys()].map((j) => bodyY(t, f + j)); };
  const trimFlat = (n) => { const [f, cnt] = trimRange(n); const t = sTrim.mesh.geometry.getAttribute('position').array;
    return [...Array(cnt).keys()].every((j) => t[(f + j) * 3] === t[f * 3] && t[(f + j) * 3 + 1] === t[f * 3 + 1] && t[(f + j) * 3 + 2] === t[f * 3 + 2]); };
  const trimStands = (n) => { const [f, cnt] = trimRange(n); const t = sTrim.mesh.geometry.getAttribute('position').array;
    for (let i = f * 3; i < (f + cnt) * 3; i++) if (t[i] !== trimBefore[i]) return false; return true; };
  const sBase = { ...base, structureId: 9, hole: 255, radiusM: 0, sectionDown: true, munition: 'he', nx: 0, ny: 0, nz: 1 };
  const fall = (k, n, extra = {}) => {
    const at = { front: [0, 4], right: [5, 0], back: [0, -4], left: [-5, 0] }[n];
    const [wx, wy, wz] = toWorld(at[0], k * 3 + 1.5, at[1]);
    return { ...sBase, section: k * 4 + names.indexOf(n), sectionKind: 'wall', x: wx, y: wy, z: wz,
      y0: placement.y + k * 3, y1: placement.y + k * 3 + 3, ...extra };
  };
  const e0 = epoch(sWall.mesh);
  // 0. real holes first: a fallen section takes its standing runs with it (facades, 2026-10-08: the room behind an
  // upper hole stood on after its storey dropped). A hole in a panel that falls, or in a storey that drops, hides its
  // rim and room; a hole in a wall that stands keeps them
  const tagged = () => debris.group.children.filter((m) => m.isMesh && m.geometry.getAttribute('aDamage')?.array[0] === 32768 + 10);
  const holeRuns = (k, n, hole) => {
    const before = new Set(tagged());
    const [bx, bz, nx, nz] = { front: [1.5, 4, s, c], right: [5, -1.5, c, -s] }[n];
    const [wx, wy, wz] = toWorld(bx, k * 3 + 1.8, bz);
    stages.breach({ ...sBase, section: k * 4 + names.indexOf(n), sectionKind: 'wall', hole, radiusM: 0.6, sectionDown: false,
      x: wx, y: wy, z: wz, nx, ny: 0, nz, y0: placement.y + k * 3, y1: placement.y + k * 3 + 3 }, seam);
    const runs = tagged().filter((m) => !before.has(m));
    assert.ok(runs.length > 0 && runs.every((m) => m.visible), `the ${k}/${n} hole lays its rim and room`);
    return runs;
  };
  const groundFront = holeRuns(0, 'front', 0), groundRight = holeRuns(0, 'right', 1), upperFront = holeRuns(1, 'front', 2);
  const slot = 9 * T;
  const holeR = () => [0, 1, 2, 3].map((k) => data[slot + 8 + k * 8 + 3]);
  const holeY = () => [0, 1, 2, 3].map((k) => data[slot + 8 + k * 8 + 1]);
  // 1. the ground storey's front panel: down to its stub, a metre over the base; nothing else of the walls moves
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
  // the dressing proud of it goes with it (facades: the canopy and window boxes stood in front of the stub): a part
  // above the stub whole is flattened, the jamb comes down to the stub; the storey above's sill beam stands
  assert.ok(trimFlat('canopy') && trimFlat('windowBox'), 'the canopy and the window box fall with their panel');
  assert.ok(trimYs('jamb').every((y) => y <= 1 + 1e-4) && trimYs('jamb').some((y) => Math.abs(y - 1) < 1e-4), 'the jamb down to the stub');
  assert.ok(trimStands('sill'), 'the jetty\'s sill beam over the panel stands');
  assert.ok(groundFront.every((m) => !m.visible), 'the fallen panel\'s hole goes with it: its rim and room');
  assert.ok(groundRight.every((m) => m.visible) && upperFront.every((m) => m.visible), 'the standing walls keep their holes');
  // 2. the upper storey's last face falls with storeyDown, the roof still on it: every vertex of the band down to the
  // floor line whatever its part (the buttress up both storeys in one part), a part wholly in the band flattened (no
  // ceiling lid over the storey below), what stood on it lowered by the storey's height (the chimney's top), the roof
  // riding down whole; the ground storey stands, the kit's heap on the floor line stands
  for (const n of ['front', 'right', 'back']) stages.breach(fall(1, n), seam);
  const rubbleN = () => debris.group.children.filter((m) => m.isMesh && /^fx-structure-rubble-/.test(m.name)).length;
  const rubbleBefore = rubbleN();
  stages.breach(fall(1, 'left', { storeyDown: true }), seam);
  // (the core 2026-10-08: the cascade's storeys come down on gravity's clock, the next sqrt(2 h / g) after) the drop
  // falls over that time instead of in one frame: at its start nothing has moved; half way, what stood on the band has
  // come down g t^2 / 2 — a quarter of the storey's height — the roof whole and the chimney's top with it, and the heap
  // is not laid yet; at its end, the instant drop's exact state (below)
  const dropT = Math.sqrt(2 * 3 / 9.81);
  assert.equal(stages.stats().dropping, 1, 'the storey is in flight');
  let rMid = sRoof.mesh.geometry.getAttribute('position').array;
  for (let i = 0; i < rMid.length; i += 3) assert.ok(Math.abs(rMid[i + 1] - roofBefore[i + 1]) < 1e-6, 'at its start the roof stands');
  now += dropT / 2;
  stages.update();
  rMid = sRoof.mesh.geometry.getAttribute('position').array;
  for (let i = 0; i < rMid.length; i += 3) {
    assert.ok(Math.abs(rMid[i + 1] - (roofBefore[i + 1] - 0.75)) < 1e-3 && Math.abs(rMid[i] - roofBefore[i]) < 1e-4,
      `half way the roof has come down a quarter of the storey whole (${(roofBefore[i + 1] - rMid[i + 1]).toFixed(3)} m)`);
  }
  assert.ok(Math.abs(Math.max(...trimYs('chimney')) - (9.5 - 0.75)) < 1e-3, `the chimney's top with it (${Math.max(...trimYs('chimney')).toFixed(3)})`);
  assert.ok(Math.min(...trimYs('chimney')) === 0, 'the chimney\'s foot stands');
  assert.equal(rubbleN(), rubbleBefore, 'the heap is laid when the storey lands');
  assert.equal(stages.stats().dropping, 1, 'still in flight half way');
  now += dropT / 2 + 0.01;
  stages.update();
  assert.equal(stages.stats().dropping, 0, 'landed');
  const heapRuns = tagged().filter((m) => !heapBefore.has(m));
  w = sWall.mesh.geometry.getAttribute('position').array;
  for (const n of names) {
    const [f, cnt] = rangeOf(1, n);
    for (let i = f; i < f + cnt; i++) assert.ok(bodyY(w, i) <= 3 + 1e-4, `the upper storey's ${n} is down to its floor line`);
  }
  const [fr, cr] = rangeOf(0, 'right');
  assert.ok([...Array(cr).keys()].some((j) => Math.abs(bodyY(w, fr + j) - 3) < 1e-4), 'the ground storey\'s walls keep their height');
  assert.ok(trimFlat('ceiling'), 'the storey\'s ceiling goes with it, no lid on the floor line');
  const bY = trimYs('buttress');
  assert.ok(Math.max(...bY) <= 3 + 1e-4 && Math.min(...bY) === 0, `the buttress up both storeys keeps its ground storey (${Math.min(...bY)}..${Math.max(...bY)})`);
  const cY = trimYs('chimney');
  assert.ok(Math.abs(Math.max(...cY) - 6.5) < 1e-4 && Math.min(...cY) === 0, `the chimney comes down by the storey's height (${Math.max(...cY)})`);
  assert.ok(trimStands('sill') || trimYs('sill').every((y) => y <= 3.15 + 1e-4), 'the sill beam at the floor line stays on it');
  let r = sRoof.mesh.geometry.getAttribute('position').array;
  for (let i = 0; i < r.length; i += 3) {
    assert.ok(Math.abs(r[i + 1] - (roofBefore[i + 1] - 3)) < 1e-4 && r[i] === roofBefore[i] && r[i + 2] === roofBefore[i + 2],
      'the roof rides the dropped storey down whole');
  }
  assert.ok(upperFront.every((m) => !m.visible), 'the dropped storey takes its holes\' rims and room');
  assert.ok(groundRight.every((m) => m.visible), 'the ground storey\'s hole stands with its wall');
  assert.ok(heapRuns.length > 0 && heapRuns.every((m) => m.visible), 'the kit\'s heap on the floor line stands (laid after the drop)');
  // (each rendered-wall hole is two cuts, the render's ring and the hole: the ring of four holds the ground right's
  // and the upper front's)
  const radii = holeR(), ys = holeY();
  for (let k = 0; k < 4; k++) {
    if (ys[k] > placement.y + 3) assert.equal(radii[k], 0, `the dropped storey's cut ${k} goes with it`);
    else assert.ok(radii[k] > 0, `the ground storey's cut ${k} stays`);
  }
  assert.ok(radii.some((v) => v === 0) && radii.some((v) => v > 0), `both kinds in the ring (${radii})`);
  // a dropped run stays down when the debris shows its delayed runs
  now += 5;
  debris.update();
  assert.ok(groundFront.every((m) => !m.visible) && upperFront.every((m) => !m.visible), 'a dropped run is never shown again');
  // 3. the roof falls: the kit's hide (its covering's pieces thrown)
  stages.breach({ ...sBase, section: 8, sectionKind: 'roof', x: placement.x, y: placement.y + 4, z: placement.z,
    y0: placement.y + 3, y1: placement.y + 5.4 }, seam);
  r = sRoof.mesh.geometry.getAttribute('position').array;
  for (let i = 0; i < r.length; i += 3) assert.deepEqual([r[i], r[i + 1], r[i + 2]], [r[0], r[1], r[2]], 'the roof is gone');
  // 4. a real hole: a P1 'breached' stage cuts no synthetic one on that structure, nor with sections on
  const holesBefore = data[slot + 7];
  stages.stage({ ...base, structureId: 9, stage: 'breached', previous: 'damaged', x: placement.x, y: 4, z: placement.z + 4,
    dirX: 0, dirZ: -1 }, seam);
  assert.equal(data[slot + 7], holesBefore, 'a structure with real holes gets no synthetic one');
  // 5. reset stands it all up again, bit for bit
  stages.reset();
  assert.deepEqual(Array.from(sWall.mesh.geometry.getAttribute('position').array), Array.from(wallBefore), 'the walls come back whole');
  assert.deepEqual(Array.from(sRoof.mesh.geometry.getAttribute('position').array), Array.from(roofBefore), 'the roof comes back');
  assert.deepEqual(Array.from(sTrim.mesh.geometry.getAttribute('position').array), Array.from(trimBefore), 'the dressing comes back');
  // 6. the roof falls first, its wreckage laid (an eave band on the plate, a rafter hanging to the top storey's floor),
  // then the top storey drops under it: the wreckage is no storey's, so it rides down by the clamp's law (over the band
  // down by the storey's height, in it onto the floor line), nothing of it below the line; each panel before the last
  // lays its stub, the last, falling with its storey, throws its pieces only, and the storey takes the earlier stubs
  {
    const seamC = createStructureDamageSeam(9, 'cottage', null, sAnatomy, sSpans);
    const kitSectionDown = seamC.sectionDown;
    const box = (m, x0, y0, z0, x1, y1, z1) => {
      const v = [];
      for (const y of [y0, y1]) for (const z of [z0, z1]) for (const x of [x0, x1]) v.push(m.vertex(x, y, z, 0, 1, 0, 0, 0, 0.4, 0.3, 0.2));
      for (const [a, b, cc] of [[0, 1, 3], [0, 3, 2], [4, 6, 7], [4, 7, 5], [0, 4, 5], [0, 5, 1], [2, 3, 7], [2, 7, 6], [0, 2, 6], [0, 6, 4],
        [1, 5, 7], [1, 7, 3]]) m.triangle(v[a], v[b], v[cc]);
    };
    seamC.sectionDown = (section, seed, out) => {
      const result = kitSectionDown.call(seamC, section, seed, out);
      if (section === 8) {
        if (out.mesh.begin('regionalTrim', 'remnant')) {
          box(out.mesh, -5, 5.9, 3.6, 5, 6.1, 4);       // the eave band on the front plate
          box(out.mesh, 2, 3.2, 3.5, 2.2, 6.0, 3.7);    // a rafter hanging from the plate to near the top storey's floor
          out.mesh.end();
        }
      } else if (out.mesh.begin('regionalPlaster', 'remnant')) {
        box(out.mesh, -0.5, 3, 3.6, 0.5, 4, 4);          // a stand-in stub (only its run counts)
        out.mesh.end();
      }
      return result;
    };
    seamC.storeyDown = (storeyIdx, seed, out) => layHeap(storeyIdx, out);
    const newRuns = (act) => { const b = new Set(tagged()); act(); return tagged().filter((m) => !b.has(m)); };
    const wreck = newRuns(() => stages.breach({ ...sBase, section: 8, sectionKind: 'roof', x: placement.x, y: placement.y + 7,
      z: placement.z, y0: placement.y + 6, y1: placement.y + 8.4 }, seamC)).find((m) => m.name === 'fx-structure-remnant-regionalTrim');
    assert.ok(wreck && wreck.visible, 'the roof\'s wreckage laid');
    // a building whose roof has its own bucket keeps its walls' tops when the roof goes (no hollow box): the roof-face
    // pass is for a roof sharing the walls' bucket
    assert.deepEqual(Array.from(sWall.mesh.geometry.getAttribute('position').array), Array.from(wallBefore), 'the walls untouched by the roof\'s fall');
    const stubRuns = [];
    for (const n of ['front', 'right', 'back']) stubRuns.push(...newRuns(() => stages.breach(fall(1, n), seamC)));
    // facades (2026-10-08): a section falls once — a second event on the same kit section lays nothing again
    assert.equal(newRuns(() => stages.breach(fall(1, 'front'), seamC)).length, 0, 'the second event on a fallen section lays nothing');
    assert.ok(stubRuns.every((m) => m.visible), 'and takes nothing of the first fall');
    assert.ok(stubRuns.filter((m) => m.name === 'fx-structure-remnant-regionalPlaster').length === 3, 'each panel before the last lays its stub');
    // (a new event on the structure lands the drop in flight first: here a blow that opens nothing)
    const last = newRuns(() => {
      stages.breach(fall(1, 'left', { storeyDown: true }), seamC);
      assert.equal(stages.stats().dropping, 1, 'the top storey in flight');
      stages.breach({ ...sBase, sectionDown: false, radiusM: 0, hole: 0, section: 0, sectionKind: 'wall', x: placement.x,
        y: placement.y + 1, z: placement.z, y0: placement.y, y1: placement.y + 3 }, seamC);
      assert.equal(stages.stats().dropping, 0, 'a new event on the structure lands it');
    });
    assert.ok(last.length === 1 && /^fx-structure-rubble-/.test(last[0].name) && last[0].visible,
      `the panel falling with its storey lays no runs (pieces only); the storey's heap stands (${last.map((m) => m.name)})`);
    assert.ok(stubRuns.every((m) => !m.visible), 'the storey takes its panels\' stubs');
    assert.ok(wreck.visible, 'the roof\'s wreckage stands (it is no storey\'s)');
    const wp = wreck.geometry.getAttribute('position');
    const ys = [...Array(wp.count).keys()].map((i) => wp.getY(i) - placement.y);
    assert.ok(Math.min(...ys) >= 3 - 1e-4, `nothing of it below the floor line (${Math.min(...ys).toFixed(3)})`);
    assert.ok(Math.abs(Math.max(...ys) - 3.1) < 1e-4, `the eave band's top rides down by the storey's height (${Math.max(...ys).toFixed(3)})`);
    // the rafter (its vertices at body x 2..2.2) lies on the line
    const onLine = [...Array(wp.count).keys()].filter((i) => {
      const wx = wp.getX(i) - placement.x, wz = wp.getZ(i) - placement.z;
      const bx = wx * c - wz * s;
      return bx > 1.9 && bx < 2.3 && Math.abs(wp.getY(i) - placement.y - 3) < 1e-4;
    });
    assert.equal(onLine.length, 8, 'the hanging rafter lies on the floor line');
    stages.reset();
    mask.reset();
  }
  // with sections on, a fresh structure's 'breached' stage cuts no synthetic hole either
  const seamB = createStructureDamageSeam(9, 'cottage', null, sAnatomy, sSpans);
  mask.reset();
  stages.stage({ ...base, structureId: 9, stage: 'breached', previous: 'damaged', sections: true, x: placement.x, y: 4,
    z: placement.z + 4, dirX: 0, dirZ: -1 }, seamB);
  assert.equal(data[slot + 7], 0, 'sections on: the section holes are the breach');
  stages.reset();
  mask.reset();
}

// ---- a roof drawn in another bucket (facades 2026-10-08: a sheet hall's roof in structureMetal is 'wall' by bucket):
// the roof's hide takes its upward faces over the eaves; the walls and a vertical gable stay
{
  // a sheet hall: thin walls (their tops are strips), a sheet roof over the eaves and a vertical gable end, one bucket
  const walls = [part('structureMetal', 10, 6, 0.2, 0, 0, 3.9), part('structureMetal', 10, 6, 0.2, 0, 0, -3.9),
    part('structureMetal', 0.2, 6, 8, 4.9, 0, 0), part('structureMetal', 0.2, 6, 8, -4.9, 0, 0)];
  const sheet = part('structureMetal', 10.6, 0.05, 8.6, 0, 6.0, 0);
  const gable = part('structureMetal', 0.05, 1.2, 8, -5, 6.0, 0);
  const hall = merged('structureMetal', [...walls, sheet, gable]);
  const hallSpans = hall.ranges.map(([first, count]) => ({ mesh: hall.mesh, geometryId: null, instanceId: null,
    position: hall.mesh.geometry.getAttribute('position'), bucket: 'structureMetal', partClass: 'wall', first, count }));
  const hallAnatomy = describeDefault({ structureIdx: 11, mapId: 'verdant', builder: 'hall', style: null,
    parts: { structureMetal: [...walls, sheet, gable], regionalRoof: [part('regionalRoof', 10.6, 0.1, 8.6, 0, 6.05, 0)] },
    w: 10, d: 8, h: 6.6, placement, massClass: 'house', seed: damageSeed(5, 1, 2) });
  const hallSeam = createStructureDamageSeam(11, 'hall', null, hallAnatomy, hallSpans);
  const before = Float32Array.from(hall.mesh.geometry.getAttribute('position').array);
  hallSeam.sectionDown = () => ({ cuts: [], hides: [{ section: null, partClass: 'roof' }] });
  const roofSection = hallAnatomy.roof ? hallAnatomy.roof.section : 0;
  stages.breach({ ...base, structureId: 11, section: roofSection, sectionKind: 'roof', hole: 255, radiusM: 0, sectionDown: true,
    x: placement.x, y: placement.y + 6.3, z: placement.z, nx: 0, ny: 1, nz: 0, y0: placement.y + 6, y1: placement.y + 6.6,
    munition: 'he' }, hallSeam);
  const after = hall.mesh.geometry.getAttribute('position').array;
  // the area of a range's triangles, upright ones (|n.y| <= 0.3) or the rest
  const area = (arr, [f, n], upright) => {
    let sum = 0;
    for (let i = f; i + 2 < f + n; i += 3) {
      const ax = arr[i * 3], ay = arr[i * 3 + 1], az = arr[i * 3 + 2];
      const ux = arr[i * 3 + 3] - ax, uy = arr[i * 3 + 4] - ay, uz = arr[i * 3 + 5] - az;
      const vx = arr[i * 3 + 6] - ax, vy = arr[i * 3 + 7] - ay, vz = arr[i * 3 + 8] - az;
      const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
      const l = Math.hypot(cx, cy, cz);
      if (l < 1e-9 || (Math.abs(cy) / l <= 0.3) !== upright) continue;
      sum += l / 2;
    }
    return sum;
  };
  const rs = hall.ranges[4], rg = hall.ranges[5];
  assert.ok(area(after, rs, false) < area(before, rs, false) * 0.05, 'the sheet roof\'s upward faces are gone');
  for (const rw of hall.ranges.slice(0, 4)) {
    assert.ok(Math.abs(area(after, rw, true) - area(before, rw, true)) < 1e-3, 'the walls stand (their faces; a strip of top goes)');
  }
  assert.ok(Math.abs(area(after, rg, true) - area(before, rg, true)) < 1e-3, 'a vertical gable stays');
  stages.reset();
  assert.deepEqual(Array.from(hall.mesh.geometry.getAttribute('position').array), Array.from(before), 'reset stands the roof back up');
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

// ---- the combat warm (dcore 2026-10-09, the collapse spike: the first collapse compiled its programs mid-battle): every
// program a building's first damage, breach, strike hole and collapse draw with — a material on an object kind, as three
// keys its programs — is one the warm drew before reveal
{
  const m2 = createStructureMask(64);
  let t2 = 500;
  const d2 = createStructureDebris({ now: () => t2, groundY: () => 2 });
  const plaster = new THREE.MeshStandardMaterial({ name: 'regionalPlaster', vertexColors: true });
  const glassM = new THREE.MeshPhysicalMaterial({ name: 'glass', transmission: 0.2 });
  const roofM = new THREE.MeshStandardMaterial({ name: 'regionalRoof', vertexColors: true, map: new THREE.Texture() });
  const stoneM = new THREE.MeshStandardMaterial({ name: 'stone', map: new THREE.Texture() });
  const world = { regionalPlaster: plaster, glass: glassM, regionalRoof: roofM, stone: stoneM };
  for (const m of Object.values(world)) m2.patch(m);
  const wallMesh = new THREE.Mesh(wall.mesh.geometry, plaster), glassMesh = new THREE.Mesh(glass.mesh.geometry, glassM);
  const spans2 = spans.map((sp) => ({ ...sp, mesh: sp.bucket === 'glass' ? glassMesh : wallMesh }));
  const st2 = createStructureStages({ mask: m2, debris: d2, now: () => t2, materialFor: (bucket) => world[bucket] ?? null });
  const programKey = (o) => {
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    const kind = o.isBatchedMesh ? 'batch' : o.isInstancedMesh ? 'instanced' : o.geometry?.isInstancedBufferGeometry ? 'instancedGeometry' : 'mesh';
    const shader = m.isShaderMaterial ? `${m.vertexShader.length}:${m.fragmentShader.length}` : '';
    return [kind, m.type, m.vertexColors, !!m.map, m.transparent, m.side, m.customProgramCacheKey?.() ?? '', shader].join('|');
  };
  const drawn = () => { const keys = new Set(); d2.group.traverse((o) => { if (o.isMesh) keys.add(programKey(o)); }); return keys; };
  const laid = st2.warm({ x: 40, y: 2, z: -30 }, Object.keys(world));
  assert.ok(laid >= 1, `the warm lays the room (${laid})`);
  // the world draws every bucket material on its own plain meshes already (its programs compile with the world): the
  // warm adds what only a stage draws
  const warmKeys = drawn();
  for (const m of Object.values(world)) warmKeys.add(programKey(new THREE.Mesh(new THREE.BufferGeometry(), m)));
  d2.group.traverse((o) => { if (o.isMesh && !o.geometry?.isInstancedBufferGeometry) assert.equal(o.frustumCulled, false, 'a warm run is never culled from the warm\'s render'); });
  st2.reset(); d2.reset(); m2.reset();
  const seam2 = createStructureDamageSeam(7, 'cottage', null, anatomy, spans2);
  const [fx2, , fz2] = toWorld(1, 2, 4.2);
  const seen = new Set();
  const note = (label) => { for (const k of drawn()) { seen.add(k); assert.ok(warmKeys.has(k), `${label} draws a program the warm did not: ${k}`); } };
  st2.stage({ ...base, stage: 'damaged', previous: 'intact', x: fx2, y: 4, z: fz2, dirX: 0, dirZ: 1 }, seam2); note('a damaged stage');
  st2.strike(7, seam2, fx2, 4, fz2, 0, 1, 'he', 4); t2 += 0.2; st2.update(); note('a strike hole');
  st2.stage({ ...base, stage: 'breached', previous: 'damaged', x: fx2, y: 2.2, z: fz2, dirX: -s, dirZ: -c }, seam2); note('a breach');
  st2.stage({ ...base, stage: 'collapsed', previous: 'breached', x: fx2, y: 2.2, z: fz2, dirX: -s, dirZ: -c }, seam2); note('a collapse');
  assert.ok(seen.size >= 3, `the stages drew runs, pieces and the room (${seen.size} programs)`);
}

console.log('structureStages selftest: damaged glass hidden and restored, breach cut on the struck face, a collapse touched every frame it falls, settled and jumped stages, holes kept to the ring, the combat warm draws every program a first collapse asks for — ok');
