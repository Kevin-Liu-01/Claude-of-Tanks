import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createHeightField } from './terrain.ts';
import { disposeObject3DResources, releaseObject3DGpuResources } from '../engine/resourceLifetime.ts';
import mangrove from './maps/mangrove.ts';
import { relocateTidalMangroves, shapeMangroveFarStem, tidalMangroveStations } from './tidalMangrove.ts';
import { createStructureClearances } from './vegetationClearance.ts';
import { DESTRUCTIBLE_BUILDING_TYPES } from './maps/structureKit.ts';
import { createProps, preloadPropModels } from './props.ts';
import { ensureTankBuilder } from '../vehicles/fleetFactory.ts';
import { wreckPool } from './wrecks.ts';

// Real production builders and buffers; Canvas2D pigment is a fixture, not
// pixel evidence. No WebGL, browser, extra rendering or image acceptance.
globalThis.ImageData = class { constructor(data) { this.data = data; } };
globalThis.Image = class { width = 8; height = 8; set src(_v) { queueMicrotask(() => this.onload?.()); } };
globalThis.document = { createElement() {
  const canvas = { width: 0, height: 0 }, context = new Proxy({
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    getImageData: (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4).fill(128) }),
    createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }),
  }, { get: (target, key) => target[key] ?? (() => {}) });
  canvas.getContext = () => context; return canvas;
} };

const url = new URL('./vegetation.ts', import.meta.url).href;
let capture;
globalThis.__tidalCapture = value => { capture = value; };
registerHooks({ load(href, context, next) {
  const result = next(href, context);
  if (href !== url) return result;
  let source = result.source.toString().replace('export function mulberry32(a: number): RandomSource',
    'function originalMulberry32(a: number): RandomSource');
  assert.notEqual(source, result.source.toString(), 'observe actual seeded RNG owner');
  const marker = '  const _whiteScratch = new THREE.Color(1, 1, 1);';
  assert.ok(source.includes(marker));
  source = source.replace(marker,
    `globalThis.__tidalCapture({ trees, treeGeo, treeGeoFar, treeObstacles, concealers, group });\n${marker}`);
  source += `\nexport function mulberry32(seed: number): RandomSource {
    const next = originalMulberry32(seed), row = { seed, count: 0, next };
    globalThis.__tidalRng.push(row); return () => { row.count++; return next(); };
  }\nexport { buildBroadleafTrunk, buildOakFarGeometry };`;
  return { ...result, source };
} });
const { createVegetation, buildBroadleafTrunk, buildOakFarGeometry, mulberry32 } = await import('./vegetation.ts');

function hash(g) {
  const h = createHash('sha256');
  for (const a of Object.values(g.attributes)) h.update(Buffer.from(a.array.buffer, a.array.byteOffset, a.array.byteLength));
  if (g.index) h.update(Buffer.from(g.index.array.buffer, g.index.array.byteOffset, g.index.array.byteLength));
  return h.digest('hex');
}
function budget(g) {
  return { vertices: g.attributes.position.count, indices: g.index?.count ?? 0,
    bytes: Object.values(g.attributes).reduce((n, a) => n + a.array.byteLength, g.index?.array.byteLength ?? 0) };
}

function insideStem(positions, p) {
  const ray = new THREE.Ray(p, new THREE.Vector3(.937, .173, .302).normalize());
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), hit = new THREE.Vector3();
  const distances = [];
  for (let i = 0; i < 360; i += 3) {
    if (!ray.intersectTriangle(a.fromBufferAttribute(positions, i), b.fromBufferAttribute(positions, i + 1),
      c.fromBufferAttribute(positions, i + 2), false, hit)) continue;
    const d = hit.distanceTo(p);
    if (!distances.some(old => Math.abs(old - d) < 1e-6)) distances.push(d);
  }
  return distances.length % 2 === 1;
}

function crownContains(canopy, point) {
  const p = canopy.attributes.position;
  const ray = new THREE.Ray(point, new THREE.Vector3(.937, .173, .302).normalize());
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), hit = new THREE.Vector3();
  for (let begin = 0; begin < p.count; begin += 60) {
    const distances = [];
    for (let i = begin; i < begin + 60; i += 3) {
      if (!ray.intersectTriangle(a.fromBufferAttribute(p, i), b.fromBufferAttribute(p, i + 1),
        c.fromBufferAttribute(p, i + 2), false, hit)) continue;
      const d = hit.distanceTo(point);
      if (!distances.some(old => Math.abs(old - d) < 1e-6)) distances.push(d);
    }
    if (distances.length % 2 === 1) return true;
  }
  return false;
}

// Exact published1db mapping, retained only as a negative/preservation control.
function legacyFarStem(geometry, variant) {
  const p = geometry.attributes.position;
  const height = Math.max(...Array.from({ length: p.count }, (_, i) => p.getY(i)));
  const angle = variant === 0 ? 0 : 2.2, crownHeight = variant === 0 ? 2.86 : height;
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) / height;
    p.setXYZ(i, p.getX(i) * .5 + Math.cos(angle) * .24 * t, crownHeight * t,
      p.getZ(i) * .5 + Math.sin(angle) * .24 * t);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function checkFarAttachment(legacy, actual, canopy) {
  assert.deepEqual(budget(actual), budget(legacy));
  assert.deepEqual(actual.index?.array, legacy.index?.array);
  assert.deepEqual(actual.groups, legacy.groups); assert.deepEqual(actual.drawRange, legacy.drawRange);
  for (const [name, attr] of Object.entries(actual.attributes)) {
    assert.ok(attr.array.every(Number.isFinite), name + ': finite');
    if (name !== 'position' && name !== 'normal') assert.deepEqual(attr.array, legacy.attributes[name].array, name);
  }
  const p = legacy.attributes.position, q = actual.attributes.position, normal = actual.attributes.normal;
  const height = Math.max(...Array.from({ length: p.count }, (_, i) => p.getY(i)));
  const cap = Array.from({ length: p.count }, (_, i) => i).filter(i => p.getY(i) === height);
  assert.equal(cap.length, 30, 'the pre-existing top ring/cap owns exactly 30 packed vertices');
  assert.equal(new Set(Array.from({ length: p.count }, (_, i) => p.getY(i))).size, 2);
  const offset = new THREE.Vector3().fromBufferAttribute(q, cap[0]).sub(new THREE.Vector3().fromBufferAttribute(p, cap[0]));
  const center = cap.reduce((v, i) => v.add(new THREE.Vector3().fromBufferAttribute(p, i)), new THREE.Vector3()).multiplyScalar(1 / cap.length);
  const radius = Math.max(...cap.map(i => Math.hypot(p.getX(i) - center.x, p.getZ(i) - center.z)));
  assert.ok(Math.hypot(offset.x, offset.z) <= radius * 2 + 1e-6, 'fallback moves at most one existing cap diameter');
  let connection = 0;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) !== height) {
      assert.deepEqual([q.getX(i), q.getY(i), q.getZ(i)], [p.getX(i), p.getY(i), p.getZ(i)],
        'actual ground ring stays byte exact; only pre-existing cap vertices may move');
    } else {
      const delta = new THREE.Vector3().fromBufferAttribute(q, i).sub(new THREE.Vector3().fromBufferAttribute(p, i));
      assert.ok(delta.distanceTo(offset) < 1e-6, 'cap translates rigidly; no narrowing to hide a point-contact defect');
      assert.equal(q.getY(i), q.getY(cap[0]), 'the existing cap stays horizontal');
      if (crownContains(canopy, new THREE.Vector3().fromBufferAttribute(q, i))) connection++;
    }
  }
  assert.ok(connection > 0, 'the actual reshaped stem cap still intersects an actual closed crown lobe');
  assert.equal(connection, cap.length, 'every packed cap vertex lies inside an actual closed crown lobe');
  const av = new THREE.Vector3(), bv = new THREE.Vector3(), cv = new THREE.Vector3();
  for (let i = 0; i < q.count; i += 3) {
    av.fromBufferAttribute(q, i); bv.fromBufferAttribute(q, i + 1); cv.fromBufferAttribute(q, i + 2);
    if ([i, i + 1, i + 2].every(j => p.getY(j) === height)) {
      assert.ok(crownContains(canopy, av.clone().add(bv).add(cv).multiplyScalar(1 / 3)),
        'actual cap triangle interiors attach too, not just isolated ring points');
    }
    const face = bv.sub(av).cross(cv.sub(av));
    assert.ok(face.lengthSq() > 1e-12);
    assert.ok(face.normalize().dot(av.fromBufferAttribute(normal, i)) > .5, 'finite outward far stem normals');
  }
  return offset;
}

function checkFarStems(before, after) {
  for (let variant = 0; variant < 2; variant++) {
    const a = before.treeGeoFar.willow[variant], b = after.treeGeoFar.willow[variant];
    assert.equal(hash(b.canopy), hash(a.canopy), 'all distant crown bytes/RNG exact');
    const legacy = legacyFarStem(a.trunk.clone(), variant);
    checkFarAttachment(legacy, b.trunk, b.canopy);
    legacy.dispose();
  }
}

function checkFarSeedVariation() {
  const seeds = [0, 1, 1337, 2001, 2049, 7719, 0xffffffff,
    ...Array.from({ length: 16 }, (_, i) => Math.imul(i + 1, 2654435761) >>> 0)];
  globalThis.__tidalRng = [];
  const buildFar = (seed, variant) => {
    const rng = mulberry32(seed + 261 + variant * 101), row = globalThis.__tidalRng.at(-1);
    const pair = buildOakFarGeometry(rng, {}, variant);
    pair.trunk.scale(1.45, .82, 1.45); pair.canopy.scale(1.45, .82, 1.45);
    return { ...pair, row };
  };
  let shiftedColumns = 0, maxCapShift = 0, maxCapHeight = 0, maxCapLeanRadians = 0;
  for (const seed of seeds) for (let variant = 0; variant < 2; variant++) {
    const pair = buildFar(seed, variant), repeat = buildFar(seed, variant);
    const legacy = legacyFarStem(pair.trunk.clone(), variant), crownHash = hash(pair.canopy);
    const buffers = Object.values(pair.trunk.attributes).map(a => a.array);
    shapeMangroveFarStem(pair.trunk, variant, pair.canopy);
    shapeMangroveFarStem(repeat.trunk, variant, repeat.canopy);
    assert.equal(hash(pair.canopy), crownHash, 'attachment never writes to its crown');
    assert.equal(hash(pair.trunk), hash(repeat.trunk), 'same actual seeded crown produces the same attachment');
    assert.deepEqual([pair.row.count, pair.row.next(), pair.row.next()], [repeat.row.count, repeat.row.next(), repeat.row.next()]);
    Object.values(pair.trunk.attributes).forEach((a, i) => assert.equal(a.array, buffers[i], 'all existing backing stores reused'));
    const offset = checkFarAttachment(legacy, pair.trunk, pair.canopy);
    const shift = Math.hypot(offset.x, offset.z), p = pair.trunk.attributes.position;
    if (shift > 1e-6) shiftedColumns++;
    maxCapShift = Math.max(maxCapShift, shift);
    const top = Math.max(...Array.from({ length: p.count }, (_, i) => p.getY(i)));
    const cap = Array.from({ length: p.count }, (_, i) => i).filter(i => p.getY(i) === top);
    const center = cap.reduce((v, i) => v.add(new THREE.Vector3().fromBufferAttribute(p, i)), new THREE.Vector3()).multiplyScalar(1 / cap.length);
    maxCapHeight = Math.max(maxCapHeight, top);
    maxCapLeanRadians = Math.max(maxCapLeanRadians, Math.atan2(Math.hypot(center.x, center.z), top));
    if (seed === 2001 && variant === 0) {
      const p = legacy.attributes.position, height = Math.max(...Array.from({ length: p.count }, (_, i) => p.getY(i)));
      assert.equal(Array.from({ length: p.count }, (_, i) => i).filter(i => p.getY(i) === height
        && crownContains(pair.canopy, new THREE.Vector3().fromBufferAttribute(p, i))).length, 0,
      'published production-seed short stem is genuinely detached from the current closed crown');
      assert.throws(() => checkFarAttachment(legacy, legacy, pair.canopy), /actual reshaped stem cap/);
      const movedGround = pair.trunk.clone();
      const ground = Array.from({ length: p.count }, (_, i) => i).find(i => p.getY(i) !== height);
      movedGround.attributes.position.setY(ground, p.getY(ground) + .01);
      assert.throws(() => checkFarAttachment(legacy, movedGround, pair.canopy), /actual ground ring/);
      movedGround.dispose();
    }
    for (const g of [legacy, pair.trunk, pair.canopy, repeat.trunk, repeat.canopy]) g.dispose();
  }
  // Deliberately missing primary column: a real closed lobe still provides a
  // bounded centroid-column attachment, without narrowing the original cap.
  const raw = buildFar(2001, 0), legacy = legacyFarStem(raw.trunk.clone(), 0);
  const lobe = new THREE.IcosahedronGeometry(.95, 0); lobe.translate(1.2, 3, 0);
  const positions = new Float32Array(360 * 3);
  for (let i = 0; i < 6; i++) positions.set(lobe.attributes.position.array, i * 60 * 3);
  const crown = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const attached = raw.trunk.clone(); shapeMangroveFarStem(attached, 0, crown);
  assert.ok(checkFarAttachment(legacy, attached, crown).x > .4, 'missing fixed column takes the bounded real-lobe fallback');
  for (const mode of ['nonfinite', 'degenerate', 'out-of-reach', 'unsupported']) {
    const invalid = crown.clone(), candidate = raw.trunk.clone();
    if (mode === 'nonfinite') invalid.attributes.position.array.fill(NaN);
    else if (mode === 'degenerate') invalid.attributes.position.array.fill(0);
    else if (mode === 'out-of-reach') invalid.translate(100, 0, 0);
    else invalid.setAttribute('position', new THREE.BufferAttribute(new Float32Array(60 * 3), 3));
    assert.doesNotThrow(() => shapeMangroveFarStem(candidate, 0, invalid));
    assert.equal(hash(candidate), hash(legacy), mode + ': preserve the finite legacy form, never crash map load');
    if (mode === 'out-of-reach') assert.throws(() => checkFarAttachment(legacy, candidate, invalid), /actual reshaped stem cap/,
      'safe runtime fallback does not certify a detached attachment');
    candidate.dispose(); invalid.dispose();
  }
  for (const g of [raw.trunk, raw.canopy, legacy, lobe, crown, attached]) g.dispose();
  console.log(JSON.stringify({ protocol: 'tidal-far-attachment-v1', variants: seeds.length * 2,
    shiftedColumns, maxCapShift, maxCapHeight, maxCapLeanRadians, malformedFallbackCases: 4,
    acceptance: 'geometry-only; malformed safe retention is not attachment or art acceptance' }));
}

function checkRootGeometry(g) {
  const p = g.attributes.position, normal = g.attributes.normal;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), cross = new THREE.Vector3();
  for (let root = 0; root < 5; root++) {
    const center = new THREE.Vector3(); let n = 0;
    for (let i = 576 + root * 72; i < 576 + (root + 1) * 72; i++) {
      if (p.getY(i) > 1) { center.add(a.fromBufferAttribute(p, i)); n++; }
    }
    center.multiplyScalar(1 / n);
    assert.ok(insideStem(p, center), 'each actual upper collar is embedded in the actual crooked stem, not hovering beside it');
  }
  for (let i = 576; i < 936; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    cross.crossVectors(b.sub(a), c.sub(a));
    assert.ok(cross.lengthSq() > 1e-12, 'existing root topology retains non-degenerate triangles');
    assert.ok(cross.normalize().dot(a.fromBufferAttribute(normal, i)) > .5, 'smoothed indexed root normals face the correctly wound triangle hemisphere');
  }
}
function geometryRows(c) {
  return Object.entries({ near: c.treeGeo, far: c.treeGeoFar }).flatMap(([lod, species]) =>
    Object.entries(species).flatMap(([sp, variants]) => variants.flatMap((variant, k) =>
      Object.entries(variant).map(([part, g]) => ({ id: `${lod}/${sp}/${k}/${part}`, budget: budget(g), hash: hash(g) })))));
}
function build(field, config) {
  globalThis.__tidalRng = [];
  const runtime = createVegetation(field, { setupShadowMaterial() {} }, 2001, config);
  const result = { runtime, ...capture, geometry: geometryRows(capture),
    rng: globalThis.__tidalRng.map(r => ({ seed: r.seed, count: r.count, tail: [r.next(), r.next()] })) };
  return result;
}

function treeEnvelope(tree) {
  const m = tree.mat.elements;
  const scale = Math.max(Math.hypot(m[0], m[1], m[2]), Math.hypot(m[8], m[9], m[10]));
  return { root: scale * 1.2 + Math.abs(m[4]) + Math.abs(m[6]), crown: tree.cr + Math.sin(.07) * tree.fallH };
}

function checkTrees(before, after, field) {
  const moved = new Set(after.group.userData.tidalMangroves.flatMap(r => r.treeIndices));
  const point = new THREE.Vector3();
  let supportedFeet = 0, worstFoot = -Infinity;
  after.trees.forEach((tree, i) => {
    const old = before.trees[i];
    if (!moved.has(i)) assert.deepEqual(tree, old, 'every non-target record/transform/variant/tint/topple field exact');
    else {
      const { x, z, cy, mat, dr, ...stable } = tree;
      const { x: ox, z: oz, cy: ocy, mat: omat, dr: odr, ...oldStable } = old;
      assert.deepEqual(stable, oldStable);
      assert.equal(dr, 0);
      for (let j = 0; j < 12; j++) assert.equal(mat.elements[j], omat.elements[j], 'rotation/scale and lean unchanged');
      assert.ok(Math.abs(cy - ocy - mat.elements[13] + omat.elements[13]) < 1e-12);
      assert.ok(treeEnvelope(tree).root < 3 && treeEnvelope(tree).crown < 8, 'actual donor fits reserved full envelope');
      assert.equal(field.getWaterMaskAt(x, z), 1);
      for (const other of after.trees) if (other !== tree) assert.ok(Math.hypot(x - other.x, z - other.z) >= 2.5);
      for (const p of [field._layout.spawns.player, ...field._layout.spawns.enemies]) assert.ok(Math.hypot(x - p.x, z - p.z) >= 40);
    }
    if (tree.species !== 'willow') return;
    const positions = after.treeGeo.willow[tree.variant].trunk.attributes.position;
    // Existing closed stem = 360 vertices, flare = 216. Five existing
    // six-sided, two-segment root cones each retain 72 merged vertices.
    for (let root = 0; root < 5; root++) {
      let minY = Infinity, foot;
      for (let j = 576 + root * 72; j < 576 + (root + 1) * 72; j++) {
        if (positions.getY(j) < minY) { minY = positions.getY(j); foot = j; }
      }
      assert.ok(Math.abs(minY + .75) < 1e-6, 'each arch ends at its authored toe, not a disconnected flare');
      point.fromBufferAttribute(positions, foot).applyMatrix4(tree.mat);
      const gap = point.y - field.getHeightAt(point.x, point.z);
      worstFoot = Math.max(worstFoot, gap);
      assert.ok(gap <= 1e-5, `actual root toe seated for ${i}/${root}: ${gap} m`);
      supportedFeet++;
      if (moved.has(i)) {
        assert.equal(field.getWaterMaskAt(point.x, point.z), 1);
        assert.ok(field._roadDist(point.x, point.z) >= 31);
      }
    }
  });
  after.treeObstacles.forEach((record, slot) => {
    const old = before.treeObstacles[slot], tree = after.trees[record.treeIdx];
    assert.equal(record.treeIdx, old.treeIdx, 'stable destruction index');
    if (!moved.has(record.treeIdx)) { assert.deepEqual(record, old); return; }
    const { min, max, shape2, ...stable } = record;
    const { min: omin, max: omax, shape2: oshape, ...oldStable } = old;
    assert.deepEqual(stable, oldStable);
    assert.equal(shape2.kind, 'circle'); assert.equal(shape2.r, oshape.r, 'roots remain decorative: no collider expansion');
    assert.equal(shape2.cx, tree.x); assert.equal(shape2.cz, tree.z);
    for (let axis = 0; axis < 3; axis++) assert.ok(Math.abs(max[axis] - min[axis] - omax[axis] + omin[axis]) < 1e-12);
    assert.equal(record.crushable, true); assert.equal(record.crushMin, 0); assert.equal(record.crushKeep, 1);
    assert.deepEqual(after.concealers[slot], { ...before.concealers[slot], x: tree.x, z: tree.z });
  });
  assert.deepEqual(after.concealers.slice(after.treeObstacles.length), before.concealers.slice(before.treeObstacles.length),
    'all later bush concealment records remain exact');
  console.log(`actual root contact: ${supportedFeet} feet, highest toe gap ${worstFoot} m`);
}

function assertUploaded(after, tree) {
  const expected = new Float32Array(tree.mat.elements);
  let slots = 0;
  for (const [key, geometry] of [['slot', after.treeGeo.willow[tree.variant]], ['fslot', after.treeGeoFar.willow[tree.fv]]]) {
    if (tree[key] < 0) continue;
    for (const g of Object.values(geometry)) {
      const mesh = after.group.children.find(m => m.geometry === g);
      assert.ok(mesh && mesh.count > tree[key]);
      const begin = tree[key] * 16;
      assert.deepEqual(mesh.instanceMatrix.array.slice(begin, begin + 16), expected,
        'actual active trunk/foliage near/far instance payload matches the animated tree');
      assert.ok(mesh.instanceMatrix.updateRanges.some(r => r.start <= begin && r.start + r.count >= begin + 16),
        'the actual upload range covers this tree slot');
      slots++;
    }
  }
  assert.ok(slots >= 2);
  return slots;
}

function animatePass(after, records, camera) {
  const upright = records.map(r => after.trees[r.treeIdx].mat.elements.slice());
  const activeMeshes = after.group.children.filter(m => m.isInstancedMesh && m.userData.treeTrunk);
  const versions = activeMeshes.map(m => m.instanceMatrix.version);
  for (const mesh of activeMeshes) mesh.instanceMatrix.clearUpdateRanges();
  for (const record of records) assert.equal(after.runtime.crushTree(record, 1, 0), true);
  after.runtime.update(1 / 60, camera);
  let both = 0;
  records.forEach((record, i) => {
    const tree = after.trees[record.treeIdx];
    assert.equal(record.dead, true); assert.equal(tree.crushed, true);
    assert.deepEqual(tree.uprightMat.elements, upright[i]);
    assert.notDeepEqual(tree.mat.elements, upright[i], 'a positive production update tick actually animates the hinge');
    if (assertUploaded(after, tree) === 4) both++;
  });
  assert.ok(activeMeshes.some((m, i) => m.instanceMatrix.version > versions[i]), 'actual instance attributes were marked dirty');
  for (let tick = 1; tick < 90; tick++) after.runtime.update(1 / 60, camera);
  const settled = records.map(r => after.trees[r.treeIdx].mat.elements.slice());
  for (let tick = 0; tick < 5; tick++) after.runtime.update(1 / 60, camera);
  assert.deepEqual(records.map(r => after.trees[r.treeIdx].mat.elements), settled, 'completed actual fall persists without drift');
  after.runtime.resetToppled();
  records.forEach((record, i) => {
    const tree = after.trees[record.treeIdx];
    assert.deepEqual(tree.mat.elements, upright[i]); assert.equal(record.dead, false);
    assertUploaded(after, tree);
  });
  return both;
}

function checkLifecycle(after) {
  const moved = new Set(after.group.userData.tidalMangroves.flatMap(r => r.treeIndices));
  const records = after.treeObstacles.filter(r => moved.has(r.treeIdx));
  const near = new THREE.Vector3(118, 5, -10), far = new THREE.Vector3(800, 5, -10);
  // The real cache first recentres grass, then repartitions on the next tick.
  after.runtime.update(1 / 60, near); after.runtime.update(1 / 60, near);
  assert.ok(records.some(r => after.trees[r.treeIdx].slot >= 0));
  animatePass(after, records, near);
  after.runtime.update(1 / 60, far); after.runtime.update(1 / 60, far);
  assert.ok(animatePass(after, records, far) > 0, 'during real LOD transition both near and far upload payloads are animated');
}

function checkWholePools(before, after) {
  const rows = group => group.children.filter(m => m.isInstancedMesh).map(m => ({
    matrix: m.instanceMatrix.array.byteLength, color: m.instanceColor?.array.byteLength ?? 0,
    capacity: m.instanceMatrix.count, geometry: budget(m.geometry),
  }));
  assert.deepEqual(rows(after.group), rows(before.group), 'all actual tree, grass and bush pool allocations are unchanged');
  for (let k = 0; k < 3; k++) {
    const a = before.treeGeo.willow[k].trunk, b = after.treeGeo.willow[k].trunk;
    for (const [name, attribute] of Object.entries(a.attributes)) {
      if (name === 'aFadeI' || name === 'aLodF') continue;
      const size = attribute.itemSize;
      assert.deepEqual(b.attributes[name].array.slice(0, 360 * size), attribute.array.slice(0, 360 * size));
      assert.deepEqual(b.attributes[name].array.slice(936 * size), attribute.array.slice(936 * size),
        'all main-stem/branch attributes outside the approved flare/five roots remain byte exact');
    }
    const pa = a.attributes.position, pb = b.attributes.position;
    for (let i = 360; i < 576; i++) {
      const y = pa.getY(i), t = (y + .035) / .55;
      const ratio = (.34 + (.30 - .34) * t) / (.55 + (.30 - .55) * t);
      assert.equal(pb.getY(i), y, 'flare height/center/ground overlap unchanged');
      assert.ok(Math.abs(pb.getX(i) - pa.getX(i) * ratio) < 2e-6 && Math.abs(pb.getZ(i) - pa.getZ(i) * ratio) < 2e-6,
        'only approved lower flare taper narrows; existing radial rib deformation retained');
    }
  }
  checkFarStems(before, after);
}

function checkThicketPlan() {
  for (const feature of mangrove.vegetation.tidalTrees) {
    const points = tidalMangroveStations(feature);
    assert.equal(points.length, feature.count);
    assert.deepEqual(points, tidalMangroveStations(feature));
    let offset = 0, previous = null, minGap = Infinity;
    for (const count of feature.clumps) {
      const group = points.slice(offset, offset + count); offset += count;
      const width = Math.max(...group.map(p => p.x)) - Math.min(...group.map(p => p.x));
      const depth = Math.max(...group.map(p => p.z)) - Math.min(...group.map(p => p.z));
      assert.ok(width > 3 && depth > 3, 'each thicket occupies genuine 2D ground, not a jittered line');
      if (previous) minGap = Math.min(minGap, ...group.flatMap(p => previous.map(q => Math.hypot(p.x - q.x, p.z - q.z))));
      previous = group;
    }
    assert.ok(minGap > 5, 'real open trunk gaps separate the 3–5-tree groups');
    console.log(`${feature.id}: ${feature.clumps.length} irregular groups, minimum inter-group trunk gap ${minGap.toFixed(3)} m`);
  }
  assert.throws(() => tidalMangroveStations({ ...mangrove.vegetation.tidalTrees[0], clumps: [128] }));
  assert.throws(() => tidalMangroveStations({ ...mangrove.vegetation.tidalTrees[0], count: 31 }));
}

function checkDecals(before, after) {
  const a = before.group.children.find(m => m.userData.treeRootDecal);
  const b = after.group.children.find(m => m.userData.treeRootDecal);
  assert.equal(b.userData.decalCount, a.userData.decalCount - 128);
  assert.equal(budget(a.geometry).bytes - budget(b.geometry).bytes, 128 * 336);
  let row = 0;
  after.trees.forEach((t, i) => {
    if (t.dr === 0) return;
    for (const name of ['position', 'normal', 'uv']) {
      const aa = a.geometry.attributes[name], bb = b.geometry.attributes[name], size = aa.itemSize;
      assert.deepEqual(bb.array.slice(row * 9 * size, (row + 1) * 9 * size), aa.array.slice(i * 9 * size, (i + 1) * 9 * size),
        `every retained dry decal ${name} byte/RNG is exact`);
    }
    row++;
  });
}

function negativeControls(before, field) {
  const target = mangrove.vegetation.tidalTrees[0];
  const features = [{ ...target, count: 6, clumps: [3, 3] }];
  const donors = new Set(before.trees);
  const structures = createStructureClearances(mangrove.props.tacticalBeats, DESTRUCTIBLE_BUILDING_TYPES);
  const initial = JSON.stringify([before.trees, before.treeObstacles, before.concealers]);
  const reject = (terrain, keepouts = [], available = donors) => {
    const result = relocateTidalMangroves(before.trees, before.treeObstacles,
      before.concealers.slice(0, before.treeObstacles.length), available, features, [], terrain, structures, [], keepouts);
    assert.equal(result[0].accepted, 0);
    assert.equal(result[0].unsafe + result[0].noDonor, 6);
    assert.equal(JSON.stringify([before.trees, before.treeObstacles, before.concealers]), initial, 'rejection is atomic/no fallback');
  };
  reject({ ...field, getWaterMaskAt: () => 0 });
  reject({ ...field, getHeightAt: (x, z) => field.getHeightAt(x, z) + x * .1 });
  reject({ ...field, _roadDist: () => 0 });
  reject(field, [{ x: 94, z: -250, r: 200 }]);
  reject(field, [], new Set());
  reject({ ...field, _layout: { ...field._layout, village: { x0: -200, x1: 200, z0: -400, z1: 0 } } });
  reject({ ...field, _layout: { ...field._layout,
    spawns: { player: { x: 94, z: -315 }, enemies: [{ x: 94, z: -200 }] } } });
}

async function checkActualProps(after, field) {
  const props = createProps(field, { anisotropy: 4, setupShadowMaterial() {} }, 2002, mangrove, after.runtime);
  await props.sourcedTexturesReady;
  assert.equal(props.group.userData.fisheryWharf.status, 'placed', 'the actual complete supported fishery still places');
  const indices = after.group.userData.tidalMangroves.flatMap(r => r.treeIndices);
  let nearest = Infinity;
  for (const index of indices) {
    const tree = after.trees[index], envelope = treeEnvelope(tree).root;
    for (const record of props.obstacles) {
      const dx = Math.max(record.min[0] - tree.x, 0, tree.x - record.max[0]);
      const dz = Math.max(record.min[2] - tree.z, 0, tree.z - record.max[2]);
      const gap = Math.hypot(dx, dz) - envelope;
      nearest = Math.min(nearest, gap);
      assert.ok(gap >= 0, `actual root footprint must clear ${record.kind}: tree ${index}, gap ${gap}`);
    }
  }
  console.log(`actual ${props.obstacles.length} prop collision records: closest tidal-root clearance ${nearest} m`);
  disposeObject3DResources(props.group);
}

const shapes = [
  { cy: 3.55, rx: 3.55, ry: 1.30, rz: 3.55, trunkH: 2.4, n: 72 },
  { cy: 3.85, rx: 3.20, ry: 1.55, rz: 3.55, trunkH: 2.7, n: 72 },
  { cy: 3.30, rx: 3.85, ry: 1.15, rz: 3.45, trunkH: 2.2, n: 76 },
];
// Reviewed woody-root orientation/seating only; old→new provenance is retained
// in docs/WOODY-ROOT-ORIENTATION-CANDIDATE.md. Tidal geometry remains current.
const ordinaryWoody = [
  '0fc02117cfbf74e33ddd3d04e223abc726440f353e06afeab574525cac5cdd08',
  '7eb7c8a96e48d99d0936f55e6c9bed80a06b70519be21034fcd3fdf56b6554a2',
  'c18bf2827f158293076fceabfa77025c3ee299c9273c1d384e39ced0d0b4ff7f',
];
globalThis.__tidalRng = [];
for (let k = 0; k < 3; k++) {
  const oldRng = mulberry32(2242 + k * 7), newRng = mulberry32(2242 + k * 7);
  const old = buildBroadleafTrunk(oldRng, shapes[k]), actual = buildBroadleafTrunk(newRng, shapes[k], true);
  assert.equal(hash(old), ordinaryWoody[k], 'ordinary trunks retain reviewed outward/downward woody-root geometry');
  assert.deepEqual(budget(actual), budget(old));
  assert.equal(newRng(), oldRng(), 'five existing roots consume exactly the same seeded stream');
  for (const a of Object.values(actual.attributes)) assert.ok(a.array.every(Number.isFinite));
  checkRootGeometry(actual);
  old.dispose(); actual.dispose();
}

checkFarSeedVariation();
globalThis.fetch = async url => new Response(readFileSync(url));
await preloadPropModels(); await Promise.all(wreckPool('modern').map(id => ensureTankBuilder(id)));
checkThicketPlan();

assert.equal(mangrove.splat.fieldPatch, 0, 'tidal islands must not inherit the agricultural plot/mowing shader');
assert.equal(mangrove.splat.sourcedPalette, 'monsoon', 'reuse existing humid sourced grass/dirt layers');
for (const tone of [mangrove.vegetation.grassTexTone, mangrove.vegetation.tuftTone]) {
  assert.deepEqual(tone(.2, .6, .5), [.21500000000000002, .42, .425]);
  assert.ok(tone(.2, .6, .5).every(Number.isFinite));
}

for (const seed of [1337, 2025, 7719]) {
  const field = createHeightField(seed, mangrove);
  const control = { ...mangrove, vegetation: { ...mangrove.vegetation, willowForm: undefined, tidalTrees: undefined } };
  const before = build(field, control), after = build(field, mangrove);
  console.log(seed, JSON.stringify(after.group.userData.tidalMangroves.map(({ treeIndices, ...r }) => r)));
  assert.equal(after.trees.length, before.trees.length);
  assert.equal(after.trees.length, 4649);
  assert.equal(after.treeObstacles.length, before.treeObstacles.length);
  assert.equal(after.treeObstacles.length, 4364);
  assert.equal(after.concealers.length, before.concealers.length);
  assert.deepEqual(after.rng, before.rng, 'actual entire production RNG call counts and tails unchanged');
  assert.deepEqual(after.geometry.map(r => [r.id, r.budget]), before.geometry.map(r => [r.id, r.budget]));
  after.geometry.forEach((r, i) => {
    if (!r.id.includes('/willow/') || !r.id.endsWith('/trunk')) assert.equal(r.hash, before.geometry[i].hash);
  });
  const receipts = after.group.userData.tidalMangroves;
  assert.equal(receipts.reduce((n, r) => n + r.accepted, 0), 128, 'all 128 explicitly authored tidal sites must actually place');
  assert.equal(createHash('sha256').update(JSON.stringify(receipts.flatMap(r => r.treeIndices))).digest('hex'),
    'bf92040dbd968a0b49401e37bdf8a07826f7dd06aba60dd86bf9b7c58b2b8c94',
    'reuse the exact V31 donor identities/order; thicket composition does not take another set of dry trees');
  for (const r of receipts) { assert.equal(r.unsafe, 0); assert.equal(r.noDonor, 0); }
  checkTrees(before, after, field);
  checkWholePools(before, after);
  checkDecals(before, after);
  negativeControls(before, field);
  await checkActualProps(after, field);
  checkLifecycle(after);
  assert.deepEqual(releaseObject3DGpuResources(after.group), releaseObject3DGpuResources(before.group),
    'actual material, texture, geometry and object owner counts do not grow');
  disposeObject3DResources(before.runtime.group);
  disposeObject3DResources(after.runtime.group);
}
console.log('tidalMangrove: actual library/placement budget and deterministic three-seed baseline passed');
