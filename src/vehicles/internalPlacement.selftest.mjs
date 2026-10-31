// 266 internal placement: the crew side convention (vehicleSide.ts: forward +Z, so +X is the vehicle's LEFT) and the one
// placement pass (tools/crew-seat-fit.mjs fitCrewSeats + placeModules, published as each calibration row's crewSeats and
// moduleSeats), held on the finalized fleet every client and authority reads:
//   - unit: Left -> +1, Right -> -1, centre -> 0;
//   - sides: every side-named station's seated body on its own side of its frame's axis (5 cm dead band), the known
//     layouts of five families as built (Abrams, Leopard 2, T-72, Merkava, Challenger 2), turret crew beside the drawn
//     sight their role uses;
//   - ring: turret crew under the deck inside the turret ring's radius about the axis the turret turns on (or inside the
//     turret's own armour where it hangs below the deck), hull crew under the deck outside it where a basket turns (2 cm
//     tolerance); trimmed stations (no posture fits; pinned in crewSeats.selftest) are held there, not here;
//   - overlap: no crew hit shape inside a module's hit shapes, no module's inside another's (2 cm tolerance), except the
//     carousel autoloader inside the ammunition it carries and a crew member at the drawn sight he uses;
//   - negative controls: the checks flag a mirrored M1A2 crew (3 of 3), a module shape planted in a gunner, a turret
//     crew member slid out past the ring and a module planted in another; a sketch drawn left-at--x comes out of
//     finalizeCombatAnatomy mirrored back (crew and sketched modules; tracks and the gun stay), one drawn the right way
//     round is left alone.
import assert from 'node:assert/strict';
import '../vehicles/tankFactory.ts';
import { ALL_TANK_IDS, getSpec } from './specs.ts';
import { finalizeCombatAnatomy } from './combatAnatomy.ts';
import { combatAnatomyCalibration } from './combatAnatomyCalibrationRegistry.ts';
import { INTERNAL_LAYOUT_BY_TANK } from './internalLayoutRegistry.ts';
import { stationSideSign } from './vehicleSide.ts';
import { crewShell, shapeSurfaceSamples, shapesIntersect } from '../../tools/crew-seat-fit.mjs';
import { COMBAT_ANATOMY_CALIBRATIONS } from './combatAnatomyCalibrations.ts';

assert.equal(stationSideSign('frontLeft'), 1);
assert.equal(stationSideSign('rearRight'), -1);
assert.equal(stationSideSign('midCenter'), 0);
assert.equal(stationSideSign(undefined), 0);

const DEADBAND_M = 0.05;
const TOL_M = 0.02;
/** Modules whose volumes are measured or pass through the crew by construction (the ring is a slab across the race). */
const UNCHECKED = new Set(['trackL', 'trackR', 'turretRing', 'gun', 'gunMount', 'roofGun']);
const NESTED = new Set(['ammoRack|autoloader', 'autoloader|ammoRack']);
/** Overlaps the placement pass could not resolve because the authored sketch has no room: data fixes, pinned. */
const DATA_FIXES = Object.freeze({
  'aft10: missileRack ∩ radio': 'the 2.5 L radio is sketched 95 % inside the eight-canister launcher',
});

const add = (p, d) => p.map((value, axis) => value + d[axis]);
const shift = (shape, d) => (shape.kind === 'capsule'
  ? { ...shape, a: add(shape.a, d), b: add(shape.b, d) }
  : { ...shape, center: add(shape.center, d) });
/** A volume's hit shapes in the hull frame (turret at rest). */
const hullShapes = (armor, volume) => (volume.shapes || [])
  .filter((shape) => shape.kind === 'capsule' || shape.kind === 'ellipsoid')
  .map((shape) => shift(shape, volume.turretLocal ? armor.turretPivot : [0, 0, 0]));
const centreX = (shapes) => {
  const xs = shapes.map((shape) => (shape.kind === 'capsule' ? (shape.a[0] + shape.b[0]) / 2 : shape.center[0]));
  return xs.reduce((sum, x) => sum + x, 0) / xs.length;
};
/** Whether a sample of `a` lies more than TOL_M inside one of `b`'s shapes, or of `b` inside `a`'s. */
const intersects = (a, b) => shapesIntersect(a, b, TOL_M);

/** Side-named stations whose body sits across the axis from the side the station names. */
function wrongSides(id, crew) {
  const out = [];
  for (const station of INTERNAL_LAYOUT_BY_TANK[id]?.crew || []) {
    const want = stationSideSign(station.station);
    const volume = crew.find((entry) => entry.crew === station.role);
    if (!want || !volume?.shapes?.length) continue;
    const x = centreX(volume.shapes);
    if (Math.abs(x) < DEADBAND_M || Math.sign(x) !== want) out.push(`${id}/${station.role} ${station.station} x ${x.toFixed(3)}`);
  }
  return out;
}

/** Crew bodies crossing the turret ring's cylinder (about the turret's yaw axis) under the deck. */
function ringCrossings(id, armor, crew, ring, trimmed = new Set()) {
  if (!ring || !(armor.collisionShells?.turret || []).length) return [];
  const basket = crew.some((volume) => volume.turretLocal);
  const pivot = armor.turretPivot;
  const turret = crewShell({ ...armor, collisionShells: { hull: [], turret: armor.collisionShells.turret } }, 'turret');
  const inTurret = (p) => turret.inside([p[0] - pivot[0], p[1] - pivot[1], p[2] - pivot[2]], -TOL_M);
  const out = [];
  for (const volume of crew) {
    if (trimmed.has(volume.crew)) continue;
    const samples = hullShapes(armor, volume).flatMap(shapeSurfaceSamples).filter((p) => p[1] < ring.deckY - TOL_M);
    const r = (p) => Math.hypot(p[0] - pivot[0], p[2] - pivot[2]);
    const crossing = volume.turretLocal
      ? samples.filter((p) => r(p) > ring.rimR + TOL_M && !inTurret(p)).length
      : basket ? samples.filter((p) => r(p) < ring.rimR - TOL_M).length : 0;
    if (crossing) out.push(`${id}/${volume.crew} ${volume.turretLocal ? 'turret crew past' : 'hull crew inside'} the ring (${crossing} samples)`);
  }
  return out;
}

/** Crew∩module and module∩module hit-shape intersections. */
function overlaps(id, armor) {
  const modules = (armor.modules || []).filter((box) => !UNCHECKED.has(box.module) && box.external !== true && !box.gunFollow)
    .map((box) => ({ name: box.module, shapes: hullShapes(armor, box) })).filter((entry) => entry.shapes.length);
  const crew = (armor.crew || []).map((volume) => ({ name: volume.crew, shapes: hullShapes(armor, volume) }));
  const out = [];
  // a crew member's head at the drawn sight he looks through is not an overlap (optics are measured from the model)
  for (const person of crew) for (const module of modules) {
    if (module.name === 'optics') continue;
    if (intersects(person.shapes, module.shapes)) out.push(`${id}: ${person.name} ∩ ${module.name}`);
  }
  for (let i = 0; i < modules.length; i++) for (let j = i + 1; j < modules.length; j++) {
    if (NESTED.has(`${modules[i].name}|${modules[j].name}`)) continue;
    if (intersects(modules[i].shapes, modules[j].shapes)) out.push(`${id}: ${modules[i].name} ∩ ${modules[j].name}`);
  }
  return out;
}

// fleet
let sided = 0;
const wrong = [], rings = [], overlapping = [];
for (const id of ALL_TANK_IDS) {
  const armor = getSpec(id).armor;
  const crew = armor?.crew || [];
  sided += (INTERNAL_LAYOUT_BY_TANK[id]?.crew || []).filter((station) => stationSideSign(station.station)).length;
  wrong.push(...wrongSides(id, crew));
  const trimmed = new Set((COMBAT_ANATOMY_CALIBRATIONS[id]?.crewSeats || []).filter((seat) => seat.trimmed !== undefined).map((seat) => seat.crew));
  rings.push(...ringCrossings(id, armor, crew, combatAnatomyCalibration(id)?.turretRing, trimmed));
  overlapping.push(...overlaps(id, armor));
}
assert.ok(sided > 600, `the fleet names a side for most stations (${sided})`);
assert.deepEqual(wrong, [], 'every side-named crew station sits on its own side');
assert.deepEqual(rings, [], 'turret crew stay inside the ring under the deck; hull crew outside it');
assert.deepEqual(overlapping.filter((line) => !DATA_FIXES[line]), [], 'no crew or module hit shape inside another module');
assert.deepEqual(Object.keys(DATA_FIXES).filter((line) => !overlapping.includes(line)), [], 'every pinned data fix still overlaps (unpin it once fixed)');

// families, as built
const side = (id, role) => Math.sign(centreX(getSpec(id).armor.crew.find((entry) => entry.crew === role).shapes));
const KNOWN = {
  m1a2_abrams: { gunner: -1, commander: -1, loader: 1 },
  leo2a6: { driver: -1, gunner: -1, commander: -1, loader: 1 },
  t72b3: { gunner: 1, commander: -1 },
  merkava4: { driver: 1, gunner: -1, commander: -1, loader: 1 },
  challenger2: { gunner: -1, commander: -1, loader: 1 },
};
for (const [id, roles] of Object.entries(KNOWN)) {
  for (const [role, want] of Object.entries(roles)) assert.equal(side(id, role), want, `${id}/${role}: ${want > 0 ? 'left (+x)' : 'right (-x)'}`);
}
// the Merkava's powerpack is front right, beside the driver's left-hand station
const engine = getSpec('merkava4').armor.modules.find((box) => box.module === 'engine');
assert.ok((engine.min[0] + engine.max[0]) / 2 < -DEADBAND_M, 'merkava4: engine front right (-x)');
// drawn optics receipts are measured from the model: the Leopard 2A6's gunner sits under the EMES-15 (right), the
// T-72B3's beside his sight (left)
function drawnOpticsXs(id) {
  const optics = getSpec(id).armor.modules.find((box) => box.module === 'optics');
  return (optics.parts || [optics]).map((part) => (part.min[0] + part.max[0]) / 2);
}
assert.ok(Math.min(...drawnOpticsXs('leo2a6')) < -0.5 && side('leo2a6', 'gunner') === -1, 'leo2a6: gunner under the EMES-15 (right)');
assert.ok(Math.max(...drawnOpticsXs('t72b3')) > 0.5 && side('t72b3', 'gunner') === 1, 't72b3: gunner beside his sight (left)');

// negative controls: each check flags a planted fault
const m1 = getSpec('m1a2_abrams').armor;
const mirror = (shape) => (shape.kind === 'capsule'
  ? { ...shape, a: [-shape.a[0], shape.a[1], shape.a[2]], b: [-shape.b[0], shape.b[1], shape.b[2]] }
  : { ...shape, center: [-shape.center[0], shape.center[1], shape.center[2]] });
assert.equal(wrongSides('m1a2_abrams', m1.crew.map((volume) => ({ ...volume, shapes: volume.shapes.map(mirror) }))).length, 3,
  'control: a mirrored M1A2 crew fails 3 of 3 sided stations');
const gunner = m1.crew.find((volume) => volume.crew === 'gunner');
const torso = gunner.shapes[1];
const planted = { ...m1, modules: [...m1.modules, { module: 'fuelTank', turretLocal: gunner.turretLocal, shapes: [
  { kind: 'ellipsoid', center: torso.kind === 'capsule' ? torso.a.slice() : torso.center.slice(), radii: [0.12, 0.12, 0.12] }] }] };
assert.ok(overlaps('m1a2_abrams', planted).some((line) => /gunner ∩ fuelTank/.test(line)), 'control: a module planted in the gunner is flagged');
const radio = m1.modules.find((box) => box.module === 'radio');
const twin = { ...m1, crew: [], modules: [radio, { ...radio, module: 'fuelTank' }] };
assert.ok(overlaps('m1a2_abrams', twin).some((line) => /radio ∩ fuelTank/.test(line)), 'control: a module planted in another is flagged');
const ring = combatAnatomyCalibration('m1a2_abrams').turretRing;
const slid = m1.crew.map((volume) => (volume.crew === 'loader'
  ? { ...volume, shapes: volume.shapes.map((shape) => shift(shape, [ring.rimR, 0, 0])) } : volume));
assert.ok(ringCrossings('m1a2_abrams', m1, slid, ring).some((line) => /loader turret crew past/.test(line)), 'control: a loader slid past the ring is flagged');

// the handedness mechanism: a sketch on the M1A2's layout drawn left-at--x is mirrored (crew and the sketched fuel cell);
// the same sketch drawn the right way round is left as it is; tracks and the gun stay where they are
const box = (min, max, extra = {}) => ({ min, max, ...extra });
function sketch(sign) {
  return {
    id: 'm1a2_abrams',
    role: 'mbt',
    armor: {
      turretPivot: [0, 1.5, 0],
      hullPlates: [],
      turretPlates: [],
      modules: [
        box([sign * 0.45, 0.5, 2.4], [sign * 1.15, 1.4, 3.6], { module: 'fuelTank' }),
        box([-1.83, 0, -3.9], [-1.19, 0.8, 3.9], { module: 'trackL' }),
        box([1.19, 0, -3.9], [1.83, 0.8, 3.9], { module: 'trackR' }),
        box([-0.18, 0.05, -0.5], [0.18, 0.55, 0.75], { module: 'gun', turretLocal: true }),
      ].map((volume) => ({ ...volume, min: volume.min.map((v, i) => Math.min(v, volume.max[i])), max: volume.max.map((v, i) => Math.max(v, volume.min[i])) })),
      crew: [
        box([-0.35, 0.55, 2.3], [0.35, 1.15, 3.4], { crew: 'driver' }),
        box([sign * 0.25, 0, -0.1], [sign * 0.85, 0.7, 0.6], { crew: 'gunner', turretLocal: true }),
        box([sign * 0.25, 0.05, -0.85], [sign * 0.9, 0.78, -0.2], { crew: 'commander', turretLocal: true }),
        box([sign * -0.9, 0, -0.55], [sign * -0.25, 0.75, 0.4], { crew: 'loader', turretLocal: true }),
      ].map((volume) => ({ ...volume, min: volume.min.map((v, i) => Math.min(v, volume.max[i])), max: volume.max.map((v, i) => Math.max(v, volume.min[i])) })),
    },
  };
}
const boxX = (volume) => (volume.min[0] + volume.max[0]) / 2;
for (const [sign, label] of [[1, 'mirrored sketch'], [-1, 'right-way sketch']]) {
  const spec = finalizeCombatAnatomy(sketch(sign), null);
  const crewX = Object.fromEntries(spec.armor.crew.map((volume) => [volume.crew, Math.sign(boxX(volume))]));
  assert.deepEqual(crewX, { driver: 0, gunner: -1, commander: -1, loader: 1 }, `${label}: crew on their stations' sides`);
  const moduleX = Object.fromEntries(spec.armor.modules.map((volume) => [volume.module, boxX(volume)]));
  assert.ok(moduleX.fuelTank < 0, `${label}: the fuel cell moves with its sketch (front right)`);
  assert.ok(moduleX.trackL < -1 && moduleX.trackR > 1 && Math.abs(moduleX.gun) < 1e-9, `${label}: tracks and gun stay`);
}

console.log(`internalPlacement: ${sided} side-named stations on their sides, no ring crossings or hit-shape overlaps across ${ALL_TANK_IDS.length} vehicles; 5 families as built; 5 controls PASS`);
