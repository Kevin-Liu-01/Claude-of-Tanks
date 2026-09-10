import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { createHeightField } from './terrain.ts';
import { createVegetation } from './vegetation.ts';
import { disposeObject3DResources } from '../engine/resourceLifetime.ts';
import { convexHull2 } from './collision.ts';
import { appendStructureCollisionBand, certifyStructureCollisionProfile, deriveRuntimeStructureCollisionProfile } from './structureCollision.ts';
import { certifyGroundedStructureParts, measureBoundsJoint } from './structureConnectivity.ts';
import { planRiverLanding } from './maps/riverLandings.ts';
import mangrove from './maps/mangrove.ts';

const propsSource = readFileSync(new URL('./props.ts', import.meta.url), 'utf8');
const releaseStart = propsSource.indexOf('  composeAuthoredFisheryWharf();');
const releaseEnd = propsSource.indexOf('  // Delta uses', releaseStart);
assert.ok(releaseStart > 0 && releaseEnd > releaseStart);
const releaseBlock = propsSource.slice(releaseStart, releaseEnd);
// Foundry and published 9b21e0a31b Autumn dressing consume vegetation before
// release. Allow only these exact, ordered blocks, not arbitrary code or a
// conditional release. The production hook below observes the released input.
const foundryConsumer = `  function composeAuthoredFoundryCourt(): void {
    if (!foundryDonors) return;
    const receipt = composeFoundryServiceCourt(mapId, P.foundryServiceCourt, heightField,
      foundryDonors, [...obstacles, ...colliders], vegetation);
    group.userData.foundryServiceCourt = receipt;
    if (receipt?.status === 'placed') reconformFoundryFoundations?.();
    foundryDonors.length = 0;
    reconformFoundryFoundations = null;
  }
  composeAuthoredFoundryCourt();\n`;
const autumnConsumer = `  if (autumnCropRows && autumnFieldContext) {
    composeAutumnHeadlandDressing(destructibleContext, autumnFieldContext,
      autumnCropRows, placedB, autumnFieldStart, autumnFieldEnd, vegetation?.treeObstacles ?? []);
    autumnCropRows.length = 0;
    autumnFieldContext = null;
  }\n`;
function assertConstructionRelease(block) {
  assert.equal(block.split(foundryConsumer).length, 2, 'exact Foundry consumer occurs once');
  assert.equal(block.split(autumnConsumer).length, 2, 'exact published Autumn consumer occurs once');
  assert.ok(block.indexOf(foundryConsumer) > block.indexOf('composeAuthoredFisheryWharf();')
    && block.indexOf(autumnConsumer) > block.indexOf(foundryConsumer)
    && block.indexOf(autumnConsumer) < block.indexOf('vegetation = null;'),
  'Foundry then Autumn execute after wharf construction and before release');
  assert.match(block.replace(foundryConsumer, '').replace(autumnConsumer, ''), /^\s*composeAuthoredFisheryWharf\(\);\s+vegetation = null;\s*$/,
    'construction input is cleared unconditionally after consumers and before runtime closures');
}
assertConstructionRelease(releaseBlock);
assert.throws(() => assertConstructionRelease(releaseBlock.replace('  vegetation = null;', '')));
assert.throws(() => assertConstructionRelease(releaseBlock.replace('  vegetation = null;', '  if (autumnCropRows) vegetation = null;')));
assert.throws(() => assertConstructionRelease(releaseBlock.replace('  vegetation = null;', '  vegetation = oldVegetation;')));
assert.throws(() => assertConstructionRelease(releaseBlock.replace(autumnConsumer, '') + autumnConsumer));
assert.throws(() => assertConstructionRelease(releaseBlock.replace(foundryConsumer, '')));
assert.throws(() => assertConstructionRelease(releaseBlock.replace(foundryConsumer, foundryConsumer + foundryConsumer)));
assert.throws(() => assertConstructionRelease(releaseBlock.replace(foundryConsumer, '') + foundryConsumer));
assert.throws(() => assertConstructionRelease(releaseBlock.replace(foundryConsumer + autumnConsumer, autumnConsumer + foundryConsumer)));
assert.throws(() => assertConstructionRelease(releaseBlock.replace('  composeAuthoredFoundryCourt();', '  if (foundryDonors) composeAuthoredFoundryCourt();')));
assert.throws(() => assertConstructionRelease(releaseBlock.replace('    foundryDonors.length = 0;\n', '')));
assert.throws(() => assertConstructionRelease(releaseBlock.replace('    reconformFoundryFoundations = null;\n', '')));
assert.throws(() => assertConstructionRelease(releaseBlock.replace('  vegetation = null;', '  retainedVegetation = vegetation;\n  vegetation = null;')));

const seed = Number(process.argv.find(a => a.startsWith('--seed='))?.slice(7));
// V29 actual world-space bytes, captured before the two inner-pile change.
// All 55 other parts include the seated annex, both outer piles and full dock.
const v29Stable = {
  1337: '543960fc8a15c2f555cd11e84c9e066217eef18ba3ffb948852316f8a52b05ae',
  2025: '3d5d81bc3b24818705ca53fcd446d272b463e180827e44771625ccc7013e9ce8',
  7719: '069236f822110946aea72a28242640a4a839a0edbc22633b7c149cf85d33a347',
};
if (!seed) {
  for (const value of [1337, 2025, 7719]) {
    const run = spawnSync(process.execPath, [fileURLToPath(import.meta.url), `--seed=${value}`], { stdio: 'inherit' });
    assert.equal(run.status, 0, `Mangrove actual production seed ${value}`);
  }
  process.exit(0);
}

function canvasFixture() {
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
}
const bytes = a => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
function geometryHash(g) {
  const h = createHash('sha256');
  for (const a of Object.values(g.attributes)) h.update(bytes(a.array));
  if (g.index) h.update(bytes(g.index.array));
  return h.digest('hex');
}
function budget(parts) {
  return { parts: parts.length, vertices: parts.reduce((n, g) => n + g.attributes.position.count, 0),
    indices: parts.reduce((n, g) => n + (g.index?.count || g.attributes.position.count), 0),
    bytes: parts.reduce((n, g) => n + Object.values(g.attributes).reduce((s, a) => s + a.array.byteLength, 0)
      + (g.index?.array.byteLength || 0), 0) };
}
let control = true, last;
const propsUrl = new URL('./props.ts', import.meta.url).href;
const helperUrl = new URL('./mangroveFisheryWharf.ts', import.meta.url).href;
globalThis.__wharfCapture = (args, compose) => {
  const packet = args[2]; assert.ok(packet, 'an actual accepted first fishery exists');
  const all = Object.values(globalThis.__wharfBuckets).flat(), targets = Object.values(packet.buckets).flat();
  const targetSet = new Set(targets), before = new Map(all.map(g => [g, geometryHash(g)]));
  const oldBudget = budget(all), records = args[4], recordCopies = records.map(r => JSON.stringify(r));
  const targetRecords = new Set(packet.records), recordSlots = packet.records.map(r => records.indexOf(r));
  const targetArrays = targets.map(g => Object.values(g.attributes).map(a => a.array));
  const result = compose(control ? ['other', ...args.slice(1)] : args);
  assert.deepEqual(budget(all), oldBudget, 'exact source geometry/vertex/index/attribute capacity');
  targets.forEach((g, i) => assert.deepEqual(Object.values(g.attributes).map((a, j) => a.array === targetArrays[i][j]),
    Object.keys(g.attributes).map(() => true), 'reuse every original target buffer'));
  for (const g of all) if (control || !targetSet.has(g)) assert.equal(geometryHash(g), before.get(g), 'all non-target geometry bytes exact');
  records.forEach((r, i) => {
    if (control || !targetRecords.has(r)) assert.equal(JSON.stringify(r), recordCopies[i], 'all non-target collision records exact');
  });
  assert.deepEqual(packet.records.map(r => records.indexOf(r)), recordSlots, 'exact existing record slots/identities');
  if (!control) assert.equal(result.status, 'placed', JSON.stringify(result));
  last = { result, targetBudget: budget(targets), totalBudget: oldBudget,
    source: packet.source, packet, field: args[1], vegetation: args[5], dressing: args[6], args };
  return result;
};
registerHooks({ load(url, context, next) {
  const result = next(url, context);
  if (url === helperUrl) return { ...result, source: `${result.source.toString().replace(
    'export function composeMangroveFisheryWharf(', 'function originalCompose(')}
    export function composeMangroveFisheryWharf(...args: Parameters<typeof originalCompose>) {
      return globalThis.__wharfCapture(args, values => originalCompose(...values));
    }
    export { originalCompose };
  ` };
  if (url !== propsUrl) return result;
  let text = result.source.toString().replace('export function mulberry32(a: number): Rng',
    'function originalMulberry32(a: number): Rng');
  text = text.replace('group.userData.fisheryWharf =', 'globalThis.__wharfBuckets = buckets; group.userData.fisheryWharf =');
  // Observe the real builder's released reference through the existing
  // instrumentation hook; do not compile and execute an extracted statement.
  const releaseStatement = '  vegetation = null;';
  assert.ok(text.includes(releaseStatement), 'production release observation seam exists');
  text = text.replace(releaseStatement,
    `${releaseStatement}\n  globalThis.__wharfReleasedInput = vegetation;`);
  text += `\nexport function mulberry32(seed: number): Rng {
    const next = originalMulberry32(seed), row = { seed, count: 0, next };
    globalThis.__wharfRng.push(row); return () => { row.count++; return next(); };
  }`;
  return { ...result, source: text };
} });
const { createProps, preloadPropModels } = await import('./props.ts');
const { originalCompose } = await import('./mangroveFisheryWharf.ts');
const { ensureTankBuilder } = await import('../vehicles/fleetFactory.ts');
const { wreckPool } = await import('./wrecks.ts');
globalThis.fetch = async url => new Response(readFileSync(url));
await preloadPropModels(); await Promise.all(wreckPool('modern').map(id => ensureTankBuilder(id)));
canvasFixture();
const field = createHeightField(seed, mangrove);
// The actual normal-import builder includes authored relocation, all trees,
// bushes and their final concealment discs. Only canvas pixels are fixtures.
const vegetation = createVegetation(field, { setupShadowMaterial() {} }, 2001, mangrove);
const treeMesh = vegetation.group.children.find(mesh => mesh.userData.treeFoliage);
assert.ok(treeMesh, 'the production tree pool exists');
const treeCount = treeMesh.instanceMatrix.count;
async function build() {
  globalThis.__wharfRng = [];
  globalThis.__wharfReleasedInput = Symbol('not observed');
  const treeInput = vegetation.treeObstacles, concealmentInput = vegetation.concealers;
  const inputSnapshot = JSON.stringify({ treeInput, concealmentInput });
  const props = createProps(field, { anisotropy: 4, setupShadowMaterial() {} }, 2002, mangrove, vegetation);
  assert.equal(last.vegetation, vegetation, 'the actual wharf composer receives its canonical vegetation owner');
  assert.equal(globalThis.__wharfReleasedInput, null, 'the actual props builder releases its construction reference');
  assert.equal(vegetation.treeObstacles, treeInput);
  assert.equal(vegetation.concealers, concealmentInput);
  assert.equal(JSON.stringify({ treeInput, concealmentInput }), inputSnapshot,
    'release the reference without mutating the actual vegetation owner');
  await props.sourcedTexturesReady;
  const rng = globalThis.__wharfRng.map(r => ({ seed: r.seed, count: r.count, tail: [r.next(), r.next()] }));
  const meshes = [];
  props.group.traverse(mesh => {
    if (!mesh.isMesh) return;
    meshes.push({ name: mesh.name, material: mesh.material.customProgramCacheKey(),
      count: mesh.count ?? null, geometry: budget([mesh.geometry]),
      instances: mesh.instanceMatrix ? createHash('sha256').update(bytes(mesh.instanceMatrix.array)).digest('hex') : null });
  });
  return { props, rng, captured: last, meshes };
}
const before = await build();
control = false;
const after = await build();
assert.deepEqual(after.rng, before.rng, 'all production RNG call counts and tails exact');
assert.deepEqual(after.captured.totalBudget, before.captured.totalBudget);
assert.deepEqual(after.meshes, before.meshes, 'actual merged/instanced mesh counts, buffers, materials and every unrelated instance transform exact');
assert.notDeepEqual(after.props.features.buildings[0], before.props.features.buildings[0]);
assert.equal(originalCompose('polders', field, null, undefined, [], null, []), null, 'non-Mangrove no-op');

function matrix(p) { return new THREE.Matrix4().makeRotationY(p.yaw).setPosition(p.x, p.y, p.z); }
function localPacket(packet, pose) {
  const inverse = matrix(pose).invert();
  return Object.fromEntries(Object.entries(packet.buckets).map(([key, values]) =>
    [key, values.map(g => { const c = g.clone().applyMatrix4(inverse); c.computeBoundingBox(); return c; })]));
}
function expectedY(originalY, g, change, annexBottom) {
  if (change.inner) return originalY > -.6 ? .39 : g.boundingBox.min.y;
  return change.annex && originalY < .001 ? annexBottom : originalY;
}

function expectedUvDelta(normalY, originalY, y, change, annexBottom) {
  if (Math.abs(normalY) >= .5) return 0;
  if (change.inner) return (y - originalY) * .55;
  return change.annex && originalY < .001 ? annexBottom * .55 : 0;
}

function checkPartAttributes(g, original, change, annexBottom) {
  const a = g.attributes.position, b = original.attributes.position;
  const dx = change.inner ? Math.sign(change.oldX) * 4.85 - change.oldX : 0;
  const dz = change.inner ? (change.oldX < 0 ? 3.8 : -5.5) - 9.75 : 0;
  for (let j = 0; j < a.count; j++) {
    assert.ok(Math.abs(a.getX(j) - b.getX(j) - dx) < 4e-5 && Math.abs(a.getZ(j) - b.getZ(j) - dz) < 4e-5,
      'all original façade/roof widths, depths and relative layout unchanged');
    const y = expectedY(b.getY(j), g, change, annexBottom);
    assert.ok(Math.abs(a.getY(j) - y) < 4e-5, 'only two inner supports and the seated annex toe change');
    assert.ok(Math.abs(g.attributes.normal.getX(j) - original.attributes.normal.getX(j)) < 4e-6);
    assert.ok(Math.abs(g.attributes.normal.getY(j) - original.attributes.normal.getY(j)) < 4e-6);
    assert.ok(Math.abs(g.attributes.normal.getZ(j) - original.attributes.normal.getZ(j)) < 4e-6);
    const uvDelta = expectedUvDelta(original.attributes.normal.getY(j), b.getY(j), y, change, annexBottom);
    assert.ok(Math.abs(g.attributes.uv.getY(j) - original.attributes.uv.getY(j) - uvDelta) < 2e-6,
      'same UV jitter, with truthful existing-density foundation V extension only');
  }
  for (const a of Object.values(g.attributes)) assert.ok(a.array.every(Number.isFinite));
  assert.deepEqual(g.index?.array, original.index?.array);
}

function checkStableParts(old, local, packet, result) {
  let changed = 0, innerCount = 0;
  const stable = createHash('sha256');
  for (const [key, values] of Object.entries(local)) {
    stable.update(key);
    values.forEach((g, i) => {
      const original = old[key][i];
      const annex = key === 'stone' && Math.abs(g.boundingBox.min.x + 8.7) < .001;
      const oldX = (original.boundingBox.min.x + original.boundingBox.max.x) / 2;
      const inner = key === 'wood' && Math.abs(original.boundingBox.min.y + 1.7) < .001
        && Math.abs(original.boundingBox.max.y - .5) < .001 && Math.abs(Math.abs(oldX) - 4.8) < .001;
      if (annex) changed++;
      if (inner) innerCount++;
      else stable.update(geometryHash(packet.buckets[key][i]));
      checkPartAttributes(g, original, { annex, inner, oldX }, result.annexBottom);
    });
  }
  assert.equal(changed, 1);
  assert.equal(innerCount, 2);
  assert.equal(stable.digest('hex'), v29Stable[seed], 'every V29 non-inner-pile position/normal/UV/index byte stays exact');
}

function checkGroundSurfaces(pose, result, groundPoint) {
  let floorGap = Infinity, annexGap = -Infinity;
  for (let x = -5.1; x <= 5.10001; x += .1) for (let z = -7.75; z <= 7.75001; z += .1) {
    const p = groundPoint(x, z); floorGap = Math.min(floorGap, pose.y + .35 - field.getHeightAt(p.x, p.z));
    assert.equal(field.getWaterMaskAt(p.x, p.z), 0); assert.ok(field._roadDist(p.x, p.z) > 8);
  }
  assert.ok(floorGap >= .019, `main floor clear of bank, actual dense min ${floorGap}`);
  for (let x = -8.7; x <= -4.4999; x += .1) for (let z = -4.9; z <= .1001; z += .1) {
    const p = groundPoint(x, z), ground = field.getHeightAt(p.x, p.z);
    annexGap = Math.max(annexGap, pose.y + result.annexBottom - ground);
  }
  assert.ok(annexGap <= -.059, 'full foundation underside is buried shallowly at its lowest ground, never floating');
  assert.ok(result.annexBottom >= -.9 && result.annexBottom <= 0);
  return { floorGap, annexGap };
}

function checkPiles(local, old, pose, groundPoint) {
  const piles = local.wood.filter(g => {
    const b = g.boundingBox, x = Math.abs((b.min.x + b.max.x) / 2);
    return Math.abs(b.max.x - b.min.x - .25) < .001 && Math.abs(b.max.z - b.min.z - .25) < .001
      && (Math.abs(x - 4.85) < .001 || Math.abs(x - 7.1) < .001);
  });
  assert.equal(piles.length, 4);
  const mainFloor = local.wood.find(g => Math.abs(g.boundingBox.min.x + 5.1) < .001
    && Math.abs(g.boundingBox.max.z - 7.75) < .001 && Math.abs(g.boundingBox.min.y - .35) < .001);
  assert.ok(mainFloor, 'actual closed main-body floor exists');
  const bodySupports = [];
  for (const g of piles) {
    const b = g.boundingBox;
    const { min, max } = b;
    const bodyPost = Math.abs((min.x + max.x) / 2) < 6;
    if (bodyPost) {
      const joint = measureBoundsJoint(b, mainFloor.boundingBox);
      assert.equal(joint.gap, 0); assert.equal(joint.contactAxes, 3);
      assert.ok(joint.overlaps[0] > .2499 && joint.overlaps[2] > .2499 && joint.overlaps[1] > .0399,
        'full actual support cap penetrates existing floor, not a neighboring AABB');
      assert.ok(max.y - min.y >= .12 && max.y - min.y <= 2.2);
      bodySupports.push({ x: (min.x + max.x) / 2, z: (min.z + max.z) / 2,
        bottom: min.y, top: max.y, floorContact: joint.overlaps[1] });
    }
    for (let x = min.x; x <= max.x + 1e-6; x += (max.x - min.x) / 4)
      for (let z = min.z; z <= max.z + 1e-6; z += (max.z - min.z) / 4) {
        const p = groundPoint(x, z), ground = field.getHeightAt(p.x, p.z);
        assert.ok(pose.y + min.y < ground - (bodyPost ? .079 : .05)
          && pose.y + max.y > ground + .05);
      }
  }
  assert.equal(bodySupports.length, 2);
  const loadPath = checkLoadPath(piles, old);
  return { bodySupports, loadPath };
}

function actualBudgetAndSupport() {
  const { packet, result, dressing } = after.captured, pose = result.pose;
  const old = localPacket(before.captured.packet, before.captured.source), local = localPacket(packet, pose);
  const all = Object.values(local).flat(), world = matrix(pose);
  const groundPoint = (u, v, y = 0) => new THREE.Vector3(u, y, v).applyMatrix4(world);
  checkStableParts(old, local, packet, result);
  const { floorGap, annexGap } = checkGroundSurfaces(pose, result, groundPoint);
  const { bodySupports, loadPath } = checkPiles(local, old, pose, groundPoint);
  const connection = certifyGroundedStructureParts('mangrove-wharf', all, {
    groundMinY: result.annexBottom - .01, groundMaxY: result.annexBottom + .01,
  });
  assert.equal(connection.connected, 57, 'roof, hoist, façade and dock retain connected structural support');
  const landing = planRiverLanding(field, field._layout.lakes, mangrove.props.riverLandings[0]);
  const deck = dressing.find(g => {
    g.computeBoundingBox(); const center = g.boundingBox.getCenter(new THREE.Vector3());
    return Math.abs(g.boundingBox.max.y - g.boundingBox.min.y - .09) < .001
      && Math.hypot(center.x - landing.x, center.z - landing.z) < 1.5;
  });
  assert.ok(deck);
  // Two square-decimetre surface stations along the actual edge joint lie
  // inside both footprints; this is not merely intersecting rotated AABBs.
  const deckInverse = new THREE.Matrix4().makeRotationY(-pose.yaw);
  const verticalOverlap = Math.min(pose.y + .45, deck.boundingBox.max.y)
    - Math.max(pose.y + .15, deck.boundingBox.min.y);
  assert.ok(verticalOverlap > .04 && result.step <= .275);
  for (const t of [.25, 1.5]) {
    const p = new THREE.Vector3(landing.x + Math.cos(landing.angle) * t - Math.sin(landing.angle) * .65,
      0, landing.z + Math.sin(landing.angle) * t + Math.cos(landing.angle) * .65);
    p.x -= pose.x; p.z -= pose.z; p.applyMatrix4(deckInverse);
    assert.ok(p.x < 8.2 && p.x > 7.9 && p.z > 7.75 && p.z < 11.75, 'actual usable edge contact');
  }
  const profile = deriveRuntimeStructureCollisionProfile(local);
  // Score the ACTUAL committed runtime polygons against the actual emitted
  // triangles. A second float32 world/local round trip can change how nearly
  // welded detail solids are partitioned, so polygon-count equality would not
  // establish (or refute) occupancy correctness.
  const committedBands = packet.records.map(record => ({
    minY: record.min[1] - pose.y, maxY: record.max[1] - pose.y,
    parts: record.shape2.parts.map(part => {
      assert.equal(part.kind, 'convex');
      const points = [];
      for (let i = 0; i < part.points.length; i += 2) {
        const x = part.points[i] - pose.x, z = part.points[i + 1] - pose.z;
        points.push(x * Math.cos(pose.yaw) - z * Math.sin(pose.yaw),
          x * Math.sin(pose.yaw) + z * Math.cos(pose.yaw));
      }
      return { ...part, points };
    }),
  }));
  const certification = certifyStructureCollisionProfile(local, { contact: committedBands[0], shell: committedBands.slice(1) });
  assert.ok(certification.minimumScore > 90, `unchanged strict production collision certification: ${certification.minimumScore}`);
  const expected = [];
  for (const band of [profile.contact, ...profile.shell]) appendStructureCollisionBand(expected, band, pose.x, pose.y, pose.z, pose.yaw);
  assert.equal(expected.length, packet.records.length);
  for (let i = 0; i < expected.length; i++) {
    const actual = packet.records[i];
    for (let j = 0; j < 3; j++) {
      assert.ok(Math.abs(actual.min[j] - expected[i].min[j]) < .0001);
      assert.ok(Math.abs(actual.max[j] - expected[i].max[j]) < .0001);
    }
  }
  for (const bucket of [old, local]) for (const values of Object.values(bucket)) for (const g of values) g.dispose();
  return { floorGap, annexGap, verticalOverlap, bodySupports, loadPath, collisionScore: certification.minimumScore };
}

function checkLoadPath(piles, old) {
  const footing = [[-8.7, -4.9], [-4.5, -4.9], [-4.5, .1], [-8.7, .1]];
  function overhang(supports) {
    const polygon = convexHull2([...footing, ...supports.map(g => {
      const b = g.boundingBox; return [(b.min.x + b.max.x) / 2, (b.min.z + b.max.z) / 2];
    })]);
    let worst = 0;
    for (const x of [-5.1, 5.1]) for (const z of [-7.75, 7.75]) {
      let nearest = Infinity, inside = true;
      for (let i = 0; i < polygon.length; i += 2) {
        const j = (i + 2) % polygon.length, dx = polygon[j] - polygon[i], dz = polygon[j + 1] - polygon[i + 1];
        const px = x - polygon[i], pz = z - polygon[i + 1];
        if (dx * pz - dz * px < 0) inside = false;
        const t = Math.max(0, Math.min(1, (px * dx + pz * dz) / (dx * dx + dz * dz)));
        nearest = Math.min(nearest, Math.hypot(px - t * dx, pz - t * dz));
      }
      worst = Math.max(worst, inside ? 0 : nearest);
    }
    return worst;
  }
  const oldPiles = old.wood.filter(g => Math.abs(g.boundingBox.min.y + 1.7) < .001 && Math.abs(g.boundingBox.max.y - .5) < .001);
  const before = overhang(oldPiles), after = overhang(piles);
  assert.ok(before > 7 && after < 3, 'actual ground support polygon reaches beneath the body, not just the dock');
  return { before, after };
}

function rejectAtomically() {
  const args = before.captured.args, target = args[2], pose = after.captured.result.pose;
  const parts = Object.values(target.buckets).flat(), hashes = parts.map(geometryHash);
  const records = target.records.map(r => JSON.stringify(r)), feature = JSON.stringify(target.feature);
  const obstacle = { min: [pose.x - 1, pose.y, pose.z - 1], max: [pose.x + 1, pose.y + 4, pose.z + 1], kind: 'sentinel' };
  const bodyFooting = new THREE.Vector3(-4.85, 0, 3.8).applyMatrix4(matrix(pose));
  const landing = planRiverLanding(field, field._layout.lakes, args[3]);
  const intrudingBoat = new THREE.BoxGeometry(30, 2, 2).translate(landing.boatX, pose.y + 1, landing.boatZ);
  const badBoat = args[6].slice(); badBoat[0] = intrudingBoat;
  const cases = [
    ['prop', [...args.slice(0, 4), [...args[4], obstacle], ...args.slice(5)], /occupied by sentinel/],
    ['tree', [...args.slice(0, 5), { ...args[5], treeObstacles: [...args[5].treeObstacles, obstacle] }, args[6]], /occupied by sentinel/],
    ['crown', [...args.slice(0, 5), { ...args[5], concealers: [{ x: pose.x, z: pose.z, r: 3 }] }, args[6]], /vegetation crown/],
    ['boat', [...args.slice(0, 6), badBoat], /intersects creek boat/],
    ['route', [args[0], { ...field, _roadDist: () => 0 }, ...args.slice(2)], /landing is unavailable/],
    ['foundation', [args[0], { ...field, getHeightAt: (x, z) => field.getHeightAt(x, z)
      + (Math.hypot(x - pose.x, z - pose.z) < 3 ? 10 : 0) }, ...args.slice(2)], /adaptation exceeds/],
    ['body footing', [args[0], { ...field, getHeightAt: (x, z) => field.getHeightAt(x, z)
      - (Math.hypot(x - bodyFooting.x, z - bodyFooting.z) < .35 ? 3 : 0) }, ...args.slice(2)],
    /body support exceeds original pile length/],
    ['spawn', [args[0], { ...field, _layout: { ...field._layout,
      spawns: { ...field._layout.spawns, player: { x: pose.x, z: pose.z } } } }, ...args.slice(2)], /deployment clearance/],
  ];
  for (const [name, altered, reason] of cases) {
    const result = originalCompose(...altered);
    assert.equal(result.status, 'blocked', `${name}: must reject actual unsafe site`);
    assert.match(result.reason, reason, `${name}: intended owning safety check, not an unrelated early rejection`);
    assert.deepEqual(parts.map(geometryHash), hashes, `${name}: zero partial geometry mutation`);
    assert.deepEqual(target.records.map(r => JSON.stringify(r)), records, `${name}: zero partial collider mutation`);
    assert.equal(JSON.stringify(target.feature), feature);
  }
  assert.equal(originalCompose(...[...args.slice(0, 5), null, args[6]]).status, 'unavailable',
    'missing canonical vegetation input is visible in receipt, never counted as placed');
  intrudingBoat.dispose();
}
const supportReceipt = actualBudgetAndSupport();
rejectAtomically();
console.log(JSON.stringify({ seed, ...after.captured.result, targetBudget: after.captured.targetBudget,
  totalBudget: after.captured.totalBudget, treeCount, supportReceipt }));
before.props.dispose?.(); after.props.dispose?.();
disposeObject3DResources(vegetation.group);
