import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTank } from './tankFactory.js';
import { createCombatState, startReload } from '../sim/damage.js';
import { CORE_MODULE_IDS, MODULE_IDS } from '../sim/moduleCatalog.js';
import { ALL_TANK_IDS, getSpec } from './specs.js';
import { COMBAT_ANATOMY_CALIBRATIONS } from './combatAnatomyCalibrations.js';

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

let autoloaders = 0;
let feedSystems = 0;
let missileRacks = 0;
let cupolaMeshes = 0;
let hatchMeshes = 0;
let segmentedModules = 0;
for (const id of ALL_TANK_IDS) {
  const spec = getSpec(id);
  const calibration = COMBAT_ANATOMY_CALIBRATIONS[id];
  assert(Array.isArray(calibration.hullStructures), `${id}: hull structure receipts`);
  assert(Array.isArray(calibration.turretStructures), `${id}: turret structure receipts`);
  assert(Array.isArray(calibration.moduleShapes), `${id}: module shape receipts`);
  const boxes = spec.armor.modules;
  const names = boxes.map((box) => box.module);
  assert.equal(new Set(names).size, names.length, `${id}: one damage volume per module`);
  for (const name of CORE_MODULE_IDS) assert(names.includes(name), `${id}: ${name} volume`);
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
  const loaderless = !crew.includes('loader');
  const missile = spec.gun.shells.some((shell) => (
    Number(shell.reloadS || spec.gun.reloadS) >= 8
    && (shell.guided || (spec.role === 'ifv' && shell.type === 'HEAT'))
  ));
  assert.equal(names.includes('autoloader'), loaderless && spec.role !== 'ifv', `${id}: autoloader applicability`);
  assert.equal(names.includes('feedSystem'), spec.role === 'ifv', `${id}: weapon-feed applicability`);
  assert.equal(names.includes('missileRack'), missile, `${id}: missile-rack applicability`);
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

console.log(`combatAnatomy.selftest: ${ALL_TANK_IDS.length} tanks, ${autoloaders} autoloaders, ${feedSystems} IFV feeds, ${missileRacks} missile racks, ${cupolaMeshes} cupola meshes, ${hatchMeshes} hatch meshes, ${segmentedModules} segmented modules`);
