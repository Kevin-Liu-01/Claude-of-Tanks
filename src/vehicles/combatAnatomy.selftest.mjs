import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTank } from './tankFactory.ts';
import { Vector3 } from 'three';
import { createCombatState, startReload } from '../sim/damage.ts';
import { traceTank } from '../sim/armor.ts';
import { CORE_MODULE_IDS, MODULE_IDS } from '../sim/moduleCatalog.ts';
import { ALL_TANK_IDS, getSpec } from './specs.ts';
import { COMBAT_ANATOMY_CALIBRATIONS } from './combatAnatomyCalibrations.ts';
import {
  INTERNAL_LAYOUT_BY_TANK,
  INTERNAL_LAYOUT_SOURCES,
} from './internalLayoutRegistry.ts';

const VEHICLE_SOURCE_ROOT = dirname(fileURLToPath(import.meta.url));
const DIRECT_ARMOR_ADD = /P\.add\(\s*['"](?:hull|turret)['"]/;
const ROOF_EQUIPMENT_LABEL = /\b(?:sight|sensor|optic|mast|radar|launcher|periscope|rws|crows|rcws|pano(?:ramic)?|doghouse|rangefinder|weapon|receiver|citv|gps|iff)\b|machine[ -]?gun|\bAA MG\b|\bMG (?:mount|pintle|receiver|shield|ammo|belt)\b/i;
const STRUCTURAL_LABEL = /\b(?:cupola|hatch(?:es)?)\b/i;

function vehicleSourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return vehicleSourceFiles(path);
    return entry.isFile() && entry.name.endsWith('.js') ? [path] : [];
  });
}

for (const path of vehicleSourceFiles(VEHICLE_SOURCE_ROOT)) {
  const lines = readFileSync(path, 'utf8').split('\n');
  lines.forEach((line, index) => {
    if (!DIRECT_ARMOR_ADD.test(line) || !ROOF_EQUIPMENT_LABEL.test(line) || STRUCTURAL_LABEL.test(line)) return;
    assert.fail(`${relative(VEHICLE_SOURCE_ROOT, path)}:${index + 1}: roof equipment must use P.addEquipment()`);
  });
}

assert.deepEqual(
  Object.keys(COMBAT_ANATOMY_CALIBRATIONS).sort(),
  [...ALL_TANK_IDS].sort(),
  'geometry-receipt calibration covers exactly the playable fleet',
);
assert.deepEqual(
  Object.keys(INTERNAL_LAYOUT_BY_TANK).sort(),
  [...ALL_TANK_IDS].sort(),
  'published/internal-layout registry covers exactly the playable fleet',
);

let autoloaders = 0;
let feedSystems = 0;
let missileRacks = 0;
let cupolaMeshes = 0;
let hatchMeshes = 0;
let segmentedModules = 0;
let collisionCells = 0;
let preciseVolumes = 0;
let seamAuditRays = 0;
let seamAuditInteriorRays = 0;

function auditClosedShell(id, spec) {
  const armor = spec.armor;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const [cells, offset] of [
    [armor.collisionShells.hull, [0, 0, 0]],
    [armor.collisionShells.turret, armor.turretPivot || [0, 0, 0]],
  ]) {
    for (const cell of cells) {
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis], cell.min[axis] + offset[axis]);
        max[axis] = Math.max(max[axis], cell.max[axis] + offset[axis]);
      }
    }
  }
  const pose = {
    pos: new Vector3(), yaw: 0, pitch: 0, roll: 0, turretYaw: 0, gunPitch: 0,
  };
  const samples = 7;
  for (let axis = 0; axis < 3; axis++) {
    const cross = [0, 1, 2].filter((value) => value !== axis);
    for (let row = 0; row < samples; row++) {
      for (let column = 0; column < samples; column++) {
        const from = new Vector3();
        const to = new Vector3();
        from.setComponent(axis, max[axis] + 1);
        to.setComponent(axis, min[axis] - 1);
        const u = (row + 0.5) / samples;
        const v = (column + 0.5) / samples;
        const a = min[cross[0]] + (max[cross[0]] - min[cross[0]]) * u;
        const b = min[cross[1]] + (max[cross[1]] - min[cross[1]]) * v;
        from.setComponent(cross[0], a);
        from.setComponent(cross[1], b);
        to.setComponent(cross[0], a);
        to.setComponent(cross[1], b);
        const hits = traceTank(from, to, pose, armor);
        seamAuditRays++;
        const reachesInterior = hits.some((hit) => hit.kind === 'crew'
          || (hit.kind === 'module' && hit.external !== true && !hit.barrel
            && hit.module !== 'gun' && hit.module !== 'trackL' && hit.module !== 'trackR'));
        if (!reachesInterior) continue;
        seamAuditInteriorRays++;
        assert(hits.some((hit) => hit.kind === 'plate' && hit.plate?.kind === 'main'),
          `${id}: interior ray on axis ${axis} grid ${row},${column} at ${a.toFixed(3)},${b.toFixed(3)} crosses exact main armor (${hits.map((hit) => `${hit.kind}:${hit.module || hit.crew || hit.plate?.name || ''}`).join(', ')})`);
      }
    }
  }
}

function shapeCenter(shape) {
  return shape.kind === 'capsule'
    ? shape.a.map((value, axis) => (value + shape.b[axis]) * 0.5)
    : shape.center;
}

function shapeSupport(shape, normal) {
  if (shape.kind === 'ellipsoid') {
    return Math.hypot(...normal.map((value, axis) => value * shape.radii[axis]));
  }
  if (shape.kind === 'capsule') {
    const half = shape.a.map((value, axis) => (shape.b[axis] - value) * 0.5);
    return Math.abs(normal.reduce((sum, value, axis) => sum + value * half[axis], 0))
      + shape.radius;
  }
  const radial = [0, 1, 2].filter((axis) => axis !== shape.axis);
  return Math.abs(normal[shape.axis]) * shape.halfLength + Math.hypot(
    normal[radial[0]] * shape.radii[0],
    normal[radial[1]] * shape.radii[1],
  );
}

function shapeInsideCell(shape, cell) {
  const center = shapeCenter(shape);
  return cell.faces.every((face) => (
    face.normal.reduce((sum, value, axis) => sum + value * center[axis], face.constant)
      + shapeSupport(shape, face.normal) <= 1e-5
  ));
}

for (const id of ALL_TANK_IDS) {
  const spec = getSpec(id);
  const calibration = COMBAT_ANATOMY_CALIBRATIONS[id];
  const layout = INTERNAL_LAYOUT_BY_TANK[id];
  assert(layout, `${id}: researched internal layout`);
  assert(['documented', 'platform-inferred', 'published-demonstrator', 'owner-directed'].includes(layout.confidence),
    `${id}: explicit evidence confidence`);
  if (layout.confidence !== 'owner-directed') assert(layout.sources.length > 0, `${id}: source trail`);
  for (const sourceId of layout.sources) {
    const source = INTERNAL_LAYOUT_SOURCES[sourceId];
    assert(source, `${id}: known anatomy source ${sourceId}`);
    assert(/^https:\/\//.test(source.url), `${id}: stable source URL ${sourceId}`);
  }
  assert(Array.isArray(calibration.hullStructures), `${id}: hull structure receipts`);
  assert(Array.isArray(calibration.turretStructures), `${id}: turret structure receipts`);
  assert.equal(calibration.hullStructureCollision?.length, calibration.hullStructures.length,
    `${id}: every hull roof structure has an exact convex collision cell`);
  assert.equal(calibration.turretStructureCollision?.length, calibration.turretStructures.length,
    `${id}: every turret roof structure has an exact convex collision cell`);
  assert(Array.isArray(calibration.moduleShapes), `${id}: module shape receipts`);
  assert(Array.isArray(calibration.hullCollision) && calibration.hullCollision.length >= 5,
    `${id}: closed geometry-derived hull collision cells`);
  assert(Array.isArray(calibration.turretCollision), `${id}: turret collision receipt`);
  const shell = spec.armor.collisionShells;
  assert(shell && Array.isArray(shell.hull) && shell.hull.length >= 5,
    `${id}: finalized hull collision shell`);
  assert(Array.isArray(shell.turret), `${id}: finalized turret collision shell`);
  if (calibration.turret) assert(shell.turret.length >= 5, `${id}: finalized turret cells`);
  const contactPoints = spec.armor.bodyContactPoints;
  assert(contactPoints && Array.isArray(contactPoints.hull) && contactPoints.hull.length >= 12,
    `${id}: rollover contact derives from the finalized hull shell`);
  assert(contactPoints.hull.length % 3 === 0,
    `${id}: hull rollover contact is xyz triples`);
  assert(Array.isArray(contactPoints.turret) && contactPoints.turret.length % 3 === 0,
    `${id}: turret rollover contact is xyz triples`);
  if (calibration.turret) assert(contactPoints.turret.length >= 12,
    `${id}: rollover contact includes the finalized turret shell`);
  for (const value of [...contactPoints.hull, ...contactPoints.turret]) {
    assert(Number.isFinite(value), `${id}: finite rollover contact coordinate`);
  }
  for (const cell of [...shell.hull, ...shell.turret]) {
    assert(Array.isArray(cell.vertices) && cell.vertices.length >= 4, `${id}: collision vertices`);
    assert(Array.isArray(cell.faces) && cell.faces.length >= 4, `${id}: collision faces`);
    for (const face of cell.faces) {
      assert(face.plate && (face.plate.kind || 'main') === 'main', `${id}: collision face owns main armor`);
      assert.equal(face.normal.length, 3, `${id}: collision face normal`);
      assert(Number.isFinite(face.constant), `${id}: collision face plane`);
    }
    collisionCells++;
  }
  auditClosedShell(id, spec);
  const boxes = spec.armor.modules;
  const names = boxes.map((box) => box.module);
  assert.equal(new Set(names).size, names.length, `${id}: one damage volume per module`);
  for (const name of CORE_MODULE_IDS) assert(names.includes(name), `${id}: ${name} volume`);
  const optics = boxes.find((box) => box.module === 'optics');
  const opticsReceipts = calibration.moduleShapes.filter((receipt) => (
    receipt.module === 'optics'
  ));
  assert.equal(opticsReceipts.length, 1, `${id}: one owner-canonical optics receipt`);
  const opticsReceipt = opticsReceipts.find((receipt) => (
    receipt.module === 'optics' && receipt.turretLocal === !!optics?.turretLocal
  ));
  assert(opticsReceipt?.parts?.length > 0, `${id}: optics use owner-correct visible-geometry receipts`);
  assert(optics?.parts?.length > 0, `${id}: optics volume follows visible sight stations`);
  const fixedMount = COMBAT_ANATOMY_CALIBRATIONS[id].turret === null;
  assert.equal(names.includes('gunMount'), fixedMount, `${id}: fixed gun-mount applicability`);
  assert.equal(names.includes('turretRing'), !fixedMount, `${id}: turret-ring applicability`);
  if (fixedMount) {
    const calibration = COMBAT_ANATOMY_CALIBRATIONS[id];
    for (const crewBox of spec.armor.crew) {
      assert.equal(crewBox.turretLocal, false, `${id}/${crewBox.crew}: fixed-mount crew uses hull coordinates`);
      assert(crewBox.min[1] >= calibration.hull.min[1]
        && crewBox.max[1] <= calibration.hull.max[1], `${id}/${crewBox.crew}: crew below casemate roof`);
    }
  }
  for (const name of names) assert(MODULE_IDS.includes(name), `${id}: supported module ${name}`);
  for (const box of [...boxes, ...spec.armor.crew]) {
    assert(Array.isArray(box.min) && Array.isArray(box.max), `${id}: box coordinates`);
    for (let axis = 0; axis < 3; axis++) {
      assert(Number.isFinite(box.min[axis]) && box.min[axis] < box.max[axis],
        `${id}/${box.module || box.crew}: positive axis ${axis} depth`);
    }
    assert(Array.isArray(box.shapes) && box.shapes.length > 0,
      `${id}/${box.module || box.crew}: precise non-AABB shapes`);
    for (const shape of box.shapes) {
      assert(['ellipsoid', 'capsule', 'ellipticCylinder'].includes(shape.kind),
        `${id}/${box.module || box.crew}: supported precise shape ${shape.kind}`);
      preciseVolumes++;
      if (box.external !== true && box.module !== 'trackL' && box.module !== 'trackR'
          && box.module !== 'gun' && box.module !== 'optics') {
        const cells = box.turretLocal ? shell.turret : shell.hull;
        assert(cells.some((cell) => shapeInsideCell(shape, cell)),
          `${id}/${box.module || box.crew}: precise internal shape stays inside closed armor`);
      }
    }
    if (!Array.isArray(box.parts)) continue;
    assert(box.parts.length > 0, `${id}/${box.module || box.crew}: segmented volume has parts`);
    const unionMin = [Infinity, Infinity, Infinity];
    const unionMax = [-Infinity, -Infinity, -Infinity];
    for (const part of box.parts) {
      for (let axis = 0; axis < 3; axis++) {
        assert(Number.isFinite(part.min[axis]) && part.min[axis] < part.max[axis],
          `${id}/${box.module || box.crew}: positive part ${axis} depth`);
        unionMin[axis] = Math.min(unionMin[axis], part.min[axis]);
        unionMax[axis] = Math.max(unionMax[axis], part.max[axis]);
      }
    }
    assert.deepEqual(unionMin, box.min, `${id}/${box.module || box.crew}: part union minimum`);
    assert.deepEqual(unionMax, box.max, `${id}/${box.module || box.crew}: part union maximum`);
    segmentedModules++;
  }

  const crew = spec.armor.crew.map((box) => box.crew);
  assert.equal(new Set(crew).size, crew.length, `${id}: one volume per crew member`);
  assert.deepEqual(crew, layout.crew.map((station) => station.role), `${id}: researched crew roster`);
  for (const station of layout.crew) {
    const box = spec.armor.crew.find((entry) => entry.crew === station.role);
    assert.equal(box.turretLocal, station.frame === 'turret', `${id}/${station.role}: researched owner frame`);
    assert.equal(box.station, station.station, `${id}/${station.role}: researched station`);
    assert.equal(box.visualForm, 'seatedCrew', `${id}/${station.role}: human visual form`);
  }
  const missile = spec.gun.shells.some((shell) => (
    Number(shell.reloadS || spec.gun.reloadS) >= 8
    && (shell.guided || (spec.role === 'ifv' && shell.type === 'HEAT'))
  ));
  assert.equal(names.includes('autoloader'), !!layout.systems.autoloader, `${id}: researched autoloader applicability`);
  assert.equal(names.includes('feedSystem'), !!layout.systems.feedSystem, `${id}: researched weapon-feed applicability`);
  assert.equal(names.includes('missileRack'), !!layout.systems.missileRack || missile,
    `${id}: researched missile-rack applicability`);
  for (const [module, system] of Object.entries(layout.systems)) {
    if (!system) continue;
    const box = boxes.find((entry) => entry.module === module);
    assert(box, `${id}: researched ${module} volume`);
    assert.equal(box.visualForm, system.form, `${id}/${module}: source-aware 3D form`);
    assert.equal(box.layoutPlacement, system.placement, `${id}/${module}: researched placement tag`);
    if (system.placement === 'turret') assert.equal(box.turretLocal, true, `${id}/${module}: turret ownership`);
    if ((module === 'engine' || module === 'transmission')
        && (system.placement === 'front' || system.placement === 'rear')) {
      const centerZ = (box.min[2] + box.max[2]) * 0.5;
      const hullCenterZ = (calibration.hull.min[2] + calibration.hull.max[2]) * 0.5;
      assert(system.placement === 'front' ? centerZ > hullCenterZ : centerZ < hullCenterZ,
        `${id}/${module}: ${system.placement} compartment`);
    }
  }
  if (names.includes('autoloader')) autoloaders++;
  if (names.includes('feedSystem')) feedSystems++;
  if (names.includes('missileRack')) missileRacks++;

  const combat = createCombatState(spec);
  assert.deepEqual(Object.keys(combat.modules), MODULE_IDS.filter((name) => names.includes(name)),
    `${id}: combat state follows authored anatomy`);

  // Fleet construction owns the visual-to-hitbox boundary. Camouflaged
  // equipment may share the armor material, but never the armor role or a
  // calibration-source name. Cupolas are the deliberate exception.
  const visual = createTank(id, null, { proceduralOnly: true, geometryReceipt: true });
  try {
    const opticsParent = optics.turretLocal ? 'turretG' : 'hullG';
    assert((visual.root.userData.combatGeometryParts || []).some((part) => (
      part.module === 'optics' && part.parent === opticsParent
    )), `${id}: procedural sight geometry publishes an optics receipt in its owning frame`);
    let hullArmor = 0;
    visual.root.traverse((object) => {
      if (!object.geometry) return;
      const role = object.userData?.combatHitboxRole;
      if (object.name === 'hull' || object.name === 'turret'
          || object.name === 'hullCupola' || object.name === 'turretCupola'
          || object.name === 'hullHatch' || object.name === 'turretHatch') {
        assert.equal(role, 'armor', `${id}/${object.name}: structural calibration role`);
        if (object.name === 'hull') hullArmor++;
      }
      if (object.name === 'hullExternalArmor' || object.name === 'turretExternalArmor') {
        assert.equal(role, 'externalArmor', `${id}/${object.name}: add-on armor excluded from base shell`);
      }
      if (object.name === 'hullEquipment' || object.name === 'turretEquipment') {
        assert.equal(role, 'equipment', `${id}/${object.name}: roof equipment excluded`);
      }
      if (object.name === 'hullCupola' || object.name === 'turretCupola') {
        assert.equal(object.userData.combatHitboxPart, 'cupola', `${id}: cupola remains a hit surface`);
        cupolaMeshes++;
      }
      if (object.name === 'hullHatch' || object.name === 'turretHatch') {
        assert.equal(object.userData.combatHitboxPart, 'hatch', `${id}: hatch remains a hit surface`);
        hatchMeshes++;
      }
      for (let parent = object; parent && parent !== visual.root; parent = parent.parent) {
        if (parent.userData?.fittingRoot) {
          assert.notEqual(role, 'armor', `${id}/${parent.userData.fitting}: fitting excluded from hitbox`);
          break;
        }
      }
    });
    assert(hullArmor > 0, `${id}: main hull calibration source exists`);
  } finally {
    visual.dispose();
  }
}

assert(cupolaMeshes > 0, 'shared structural cupolas are represented in fleet hitboxes');
assert(hatchMeshes > 0, 'authored structural hatches are represented separately from broad roof armor');
assert(segmentedModules > 0, 'visible module geometry publishes segmented hit volumes');

const sepv2Calibration = COMBAT_ANATOMY_CALIBRATIONS.m1a2_sepv2;
const sepv2Spec = getSpec('m1a2_sepv2');
const sepv2Optics = sepv2Spec.armor.modules.find((box) => box.module === 'optics');
assert(sepv2Calibration.turret.max[1] <= 0.8,
  'SEPv2 broad turret roof stops at the actual welded shell instead of the roof weapon');
assert(sepv2Calibration.turretStructures.filter((entry) => entry.kind === 'hatch').length >= 2,
  'SEPv2 commander and loader hatches retain independent structural armor');
assert(sepv2Optics.parts.length >= 4,
  'SEPv2 CROWS and gunner sights retain separate close-fitting optic volumes');
const sepv2RoofOptics = sepv2Optics.parts.filter(
  (part) => part.min[1] > sepv2Calibration.turret.max[1]);
assert(sepv2RoofOptics.length >= 1,
  'SEPv2 roof optics remain damageable without stretching the turret armor into empty air');
assert(sepv2Optics.max[1] - sepv2Calibration.turret.max[1] <= 0.6,
  'SEPv2 roof optics follow the compact CROWS pedestal instead of the retired tall tower');
let sepv2BaseRoofY = -Infinity;
for (const plate of sepv2Spec.armor.turretPlates) {
  if (/^turret_(?:hatch|cupola)_\d+_/.test(plate.name)) continue;
  for (const point of plate.verts) sepv2BaseRoofY = Math.max(sepv2BaseRoofY, point[1]);
}
assert(sepv2BaseRoofY <= sepv2Calibration.turret.max[1] + 1e-6,
  'SEPv2 base turret plates do not climb roof decorations');

const autoSpec = getSpec('t90m');
const autoCombat = createCombatState(autoSpec);
autoCombat.modules.autoloader.state = 'yellow';
startReload(autoCombat, autoSpec);
assert(autoCombat.reload.totalS > autoSpec.gun.reloadS, 'damaged autoloader slows reload');

const ifvSpec = getSpec('m2a2_bradley');
const ifvCombat = createCombatState(ifvSpec);
const missileSlot = ifvSpec.gun.shells.findIndex((shell) => shell.type === 'HEAT');
ifvCombat.shellSlot = missileSlot;
ifvCombat.modules.feedSystem.state = 'yellow';
ifvCombat.modules.missileRack.state = 'yellow';
startReload(ifvCombat, ifvSpec);
assert(ifvCombat.reload.totalS > ifvSpec.gun.shells[missileSlot].reloadS * 1.8,
  'damaged feed and missile rack stack for guided rounds');

console.log(`combatAnatomy.selftest: ${ALL_TANK_IDS.length} tanks, ${collisionCells} closed collision cells, ${preciseVolumes} non-AABB volumes, ${seamAuditInteriorRays}/${seamAuditRays} interior rays armored, ${autoloaders} autoloaders, ${feedSystems} IFV feeds, ${missileRacks} missile racks, ${cupolaMeshes} cupola meshes, ${hatchMeshes} hatch meshes, ${segmentedModules} segmented modules`);
