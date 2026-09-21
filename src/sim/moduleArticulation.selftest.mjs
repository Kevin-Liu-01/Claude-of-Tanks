import assert from 'node:assert/strict';
import { Euler, Quaternion, Vector3 } from 'three';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import '../vehicles/tankFactory.ts';
import { getSpec } from '../vehicles/specs.ts';
import { finalizeCombatAnatomy } from '../vehicles/combatAnatomy.ts';
import { TOS1A_TAGIL_LAUNCHER_MUZZLES } from '../vehicles/tos1aTagilLayout.ts';
import { blastTargets, traceTank } from './armor.ts';

const spec = getSpec('tos1a_tagil');
const rack = spec.armor.modules.find(box => box.module === 'missileRack');
assert.equal(rack.gunFollow, true, 'the actual TOS rack declares its pitching owner');
const pose = { pos: new Vector3(4, 2, -3), yaw: .4, pitch: .07, roll: -.05,
  turretYaw: -.3, gunPitch: 0 };
const model = { turretPivot: spec.armor.turretPivot, gunPivot: spec.armor.gunPivot,
  modules: [rack] };
assert.equal(spec.armor.gunBarrel.collision, false, 'the rack has no centered cannon collision');

// Independent point composition in turret-rest coordinates, including hull attitude.
function world(point, p, frame = 'gun') {
  const v = new Vector3(...point);
  if (frame === 'gun') {
    const pivot = new Vector3(...model.gunPivot);
    v.sub(pivot).applyAxisAngle(new Vector3(1, 0, 0), -p.gunPitch).add(pivot);
  }
  if (frame !== 'hull') v.applyAxisAngle(new Vector3(0, 1, 0), p.turretYaw)
    .add(new Vector3(...model.turretPivot));
  return v.applyQuaternion(new Quaternion().setFromEuler(new Euler(-p.pitch, p.yaw, p.roll, 'YXZ'))).add(p.pos);
}
function ray(m, p, point, frame = 'gun') {
  const a = [...point], b = [...point]; a[0] = -4; b[0] = 4;
  return traceTank(world(a, p, frame), world(b, p, frame), p, m).filter(hit => hit.kind === 'module');
}
function close(a, b, message) { assert.ok(a.distanceTo(b) < 1e-8, `${message}: ${a.distanceTo(b)}`); }
const center = rack.min.map((v, i) => (v + rack.max[i]) / 2);
const restEntry = ray(model, pose, center)[0];
assert.ok(restEntry, 'neutral actual calibrated rack supplies a finite stock witness');
const entryX = -4 + 8 * restEntry.t;
const volumes = rack.shapes?.length ? rack.shapes : rack.parts?.length ? rack.parts : [rack];
const volumeCenters = volumes.map(volume => volume.center ?? (volume.a
  ? volume.a.map((v, i) => (v + volume.b[i]) / 2)
  : volume.min.map((v, i) => (v + volume.max[i]) / 2)));
for (const degrees of [-spec.gunDepressionDeg, 0, 15, spec.gunElevationDeg]) {
  const p = { ...pose, gunPitch: degrees * Math.PI / 180 };
  const hits = ray(model, p, center);
  assert.equal(hits.length, 1, `${degrees}: actual pitching rack receives the shot`);
  close(hits[0].point, world([entryX, center[1], center[2]], p), 'actual calibrated neutral entry follows the posed finite stock');
  assert.ok(hits[0].tExit > hits[0].t, 'penetration retains finite stock thickness');
  const blast = blastTargets(p, model);
  assert.equal(blast.length, volumeCenters.length);
  for (let i = 0; i < blast.length; i++) close(blast[i].point, world(volumeCenters[i], p), 'blast receiver follows the same physical rack');
}
const elevated = { ...pose, gunPitch: spec.gunElevationDeg * Math.PI / 180 };
const forwardStock = [0, center[1], rack.max[2] - .06];
assert.equal(ray(model, elevated, forwardStock).length, 1, 'raised forward rack stock is hittable');
assert.equal(ray(model, elevated, forwardStock, 'turret').length, 0, 'old unpitched forward position is now empty');
const stale = { ...model, modules: [{ ...rack, gunFollow: false }] };
assert.equal(ray(stale, elevated, forwardStock).length, 0, 'historical stale-frame mutation misses actual raised stock');
assert.equal(ray(stale, elevated, forwardStock, 'turret').length, 1, 'negative control reproduces phantom low rack');
assert.ok(blastTargets(elevated, stale)[0].point.distanceTo(world(center, elevated)) > .1,
  'negative control also exposes stale blast location');

// The frame applies identically to compound finite boxes and curved volume shapes.
const base = { module: 'missileRack', turretLocal: true, gunFollow: true,
  min: [-.4, 1.0, .25], max: [.4, 1.6, .85] };
const target = [0, 1.3, .55];
const forms = [base,
  { ...base, parts: [{ min: [-.3, 1.1, .35], max: [.3, 1.5, .75] }] },
  { ...base, shapes: [{ kind: 'ellipsoid', center: target, radii: [.3, .2, .2] }] },
  { ...base, shapes: [{ kind: 'ellipticCylinder', center: target, radii: [.2, .2], axis: 0, halfLength: .3 }] },
  { ...base, shapes: [{ kind: 'capsule', a: [-.15, 1.3, .55], b: [.15, 1.3, .55], radius: .15 }] }];
for (const form of forms) {
  const m = { ...model, modules: [form] };
  assert.equal(ray(m, elevated, target).length, 1);
  assert.equal(ray(m, elevated, target, 'turret').length, 0);
  close(blastTargets(elevated, m)[0].point, world(target, elevated), 'shape blast center pitches');
}
for (const frame of ['hull', 'turret']) {
  const stationary = { ...model, modules: [{ ...base, gunFollow: false, turretLocal: frame === 'turret' }] };
  const atRest = ray(stationary, pose, target, frame);
  assert.deepEqual(ray(stationary, elevated, target, frame), atRest, `${frame} modules preserve exact ray results through gun elevation`);
  assert.deepEqual(blastTargets(elevated, stationary), blastTargets(pose, stationary));
}

// The barrel dimensions remain usable pose datums, but the rack's center gap
// must not acquire a phantom cannon hit. The real rack hit above remains live.
const pivot = spec.armor.gunPivot;
const barrelOnly = { ...model, modules: [], gunBarrel: spec.armor.gunBarrel };
const acrossCenter = [world([-1, pivot[1], pivot[2] + 1.5], elevated),
  world([1, pivot[1], pivot[2] + 1.5], elevated)];
assert.equal(traceTank(...acrossCenter, elevated, barrelOnly).length, 0);
const phantom = { ...barrelOnly, gunBarrel: { ...spec.armor.gunBarrel, collision: true } };
assert.equal(traceTank(...acrossCenter, elevated, phantom).filter(hit => hit.barrel).length, 1,
  'negative control restores the historical nonexistent center barrel');
delete phantom.gunBarrel.collision;
assert.equal(traceTank(...acrossCenter, elevated, phantom).filter(hit => hit.barrel).length, 1,
  'ordinary cannon collision remains enabled by default');
console.log('moduleArticulation: actual TOS legal elevation, finite entry/exit, stale-frame negatives, compound shapes, blast and legacy frames PASS');

// Exercise the real receipt producer without starting its fleet-generation CLI.
const generatorPath = new URL('../../tools/gen-combat-anatomy.mjs', import.meta.url);
const generatorSource = readFileSync(generatorPath, 'utf8');
const generatorTree = ts.createSourceFile(generatorPath.pathname, generatorSource, ts.ScriptTarget.Latest, true);
function producerFunction(name, dependencies) {
  const declarations = generatorTree.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.equal(declarations.length, 1, `actual producer ${name} remains unique`);
  return new Function(...Object.keys(dependencies), `${declarations[0].getText(generatorTree)}; return ${name};`)(...Object.values(dependencies));
}
const receiptBoxes = producerFunction('receiptBoxes', { THREE });
const boxGap = producerFunction('boxGap', {});
const clusterBoxes = producerFunction('clusterBoxes', { boxGap, round: value => Number(value.toFixed(4)) });
const moduleShapeReceipts = producerFunction('moduleShapeReceipts', { receiptBoxes, clusterBoxes, createHash });
const native = new THREE.Group(), hull = new THREE.Group(), turret = new THREE.Group(), gun = new THREE.Group();
native.add(hull); hull.add(turret); turret.add(gun);
turret.position.set(...spec.armor.turretPivot); gun.position.set(...spec.armor.gunPivot);
const mesh = new THREE.Mesh(new THREE.BufferGeometry()); mesh.name = 'gunMount'; gun.add(mesh);
native.userData.combatGeometryParts = TOS1A_TAGIL_LAUNCHER_MUZZLES.map(({ x, y }) => ({
  module: 'missileRack', parent: 'gunG', bucket: 'gunMount',
  min: [x - .17, y - .17, -.985], max: [x + .17, y + .17, 2.60],
}));
const produced = moduleShapeReceipts(native, hull, turret, [rack]);
assert.equal(produced.length, 1); assert.equal(produced[0].gunFollow, true);
assert.equal(produced[0].turretLocal, true); assert.equal(produced[0].parts.length, 24,
  'separated tube stock produces24 measured parts, not a solid enclosing box');
const expectedParts = native.userData.combatGeometryParts.map(part => ({
  min: part.min.map((v, i) => Number((v + spec.armor.gunPivot[i]).toFixed(4))),
  max: part.max.map((v, i) => Number((v + spec.armor.gunPivot[i]).toFixed(4))),
}));
const sortedParts = rows => rows.map(row => JSON.stringify(row)).sort();
assert.deepEqual(sortedParts(produced[0].parts), sortedParts(expectedParts),
  'producer measures gun-owned geometry in turret-rest coordinates');
assert.equal(moduleShapeReceipts(native, hull, turret, [{ ...rack, gunFollow: false }]).length, 0,
  'wrong-owner mutation cannot certify gun-mounted stock as static turret stock');
mesh.geometry.dispose(); mesh.material.dispose();

function calibratedFixture(turretReceipt, moduleShapes) {
  const specimen = structuredClone(spec);
  specimen.armor.modules = [structuredClone(rack)]; specimen.armor.crew = [];
  // Distinct static shell and target envelopes would visibly move the rack if
  // it accidentally re-entered the hull/turret normalization paths.
  specimen.armor.turretPlates = [{ name: 'synthetic_base', kind: 'main', physicalMm: 30,
    keMm: 30, ceMm: 30, verts: [[-1,.2,-1], [1,.2,-1], [1,1.2,1], [-1,1.2,1]] }];
  const calibration = { hull: { min: [-1.5,0,-3], max: [1.5,1.8,3] }, turret: turretReceipt,
    tracks: { left: { min: [-1.8,0,-3], max: [-1.4,.8,3] }, right: { min: [1.4,0,-3], max: [1.8,.8,3] } },
    moduleShapes, hullStructures: [], turretStructures: [], hullCollision: [], turretCollision: [] };
  finalizeCombatAnatomy(specimen, calibration);
  return specimen.armor.modules.find(box => box.module === 'missileRack');
}
for (const turretReceipt of [null, { min: [-.5,0,-.7], max: [.5,.6,.7] }]) {
  const unchanged = calibratedFixture(turretReceipt, []);
  assert.equal(unchanged.gunFollow, true); assert.equal(unchanged.turretLocal, true);
  assert.equal(unchanged.external, true);
  assert.deepEqual([unchanged.min, unchanged.max], [rack.min, rack.max],
    'static shell fitting does not convert, clamp or rescale an external pitching rack');
  const fitted = calibratedFixture(turretReceipt, produced);
  assert.deepEqual(fitted.parts, produced[0].parts);
  assert.equal(fitted.shapes.length, 24, 'all24 measured tube volumes survive finalization');
  assert.equal(fitted.gunFollow, true); assert.equal(fitted.turretLocal, true);
  const wrongFrame = calibratedFixture(turretReceipt, [{ ...produced[0], gunFollow: false,
    parts: produced[0].parts.map(part => ({ min: part.min.map(v => v + 17), max: part.max.map(v => v + 17) })) }]);
  assert.deepEqual([wrongFrame.min, wrongFrame.max], [rack.min, rack.max],
    'mismatched static receipt cannot replace a pitching damage volume');
}
console.log('moduleArticulation: actual producer24-part/frame receipts and turret/fixed-mount finalization negatives PASS');
