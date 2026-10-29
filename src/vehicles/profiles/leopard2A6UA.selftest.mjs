// Leopard 2A6 UA (264; the owner, 2026-10-28: rebuilt "off of our new current actual leopard 2a6"): the source-measured
// 2A6's armour, running gear and gun under the Ukrainian field kit of profiles/leopardA6Ua.ts, its combat spec unchanged.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { FLEET_GHILLIE_SUITS } from '../ghillieFleetSuits.ts';
import { getSpec } from '../specs.ts';
import { tankTier } from '../tier.ts';
import { tankSeedId } from '../tankIdAliases.ts'; // suit meshes keep the schema-1 spelling (ghillieSuit.ts)
import { LEOPARD_A6_X_DATUMS } from './leopardA6X.ts';
import { LEOPARD_A6_UA_KIT, LEOPARD_A6_UA_PIVOT } from '../leopardA6UaLayout.ts';
import { AUXILIARY_INVENTORY } from '../auxiliaryInventory.generated.ts';

const id = 'leo2a6_ua';
const spec = getSpec(id);
assert.equal(spec.name, 'Leopard 2A6 UA');
assert.equal(spec.nation, 'Ukraine');
assert.equal(spec.variantOf, 'leo2a4_otco', 'the combat donor is unchanged');
assert.equal(tankTier(id), 9, 'Leopard 2A6 UA is a Tier IX playable (258: the owner\'s 2A6 anchor)');
assert.equal(spec.role, 'mbt');
assert.deepEqual([spec.weightTons, spec.topSpeedKmh], [72.4, 64], 'the mobility the rebuild kept');
// 264 balance (fleetBalancePass.ts, Main's ruling): the 2A6's main plates, HP and loader cadence, as the shell it is drawn on
const a6 = getSpec('leo2a6');
assert.deepEqual([spec.hp, spec.gun.reloadS], [a6.hp, a6.gun.reloadS], 'the 2A6\'s HP and cadence');
for (const key of ['hullPlates', 'turretPlates']) for (const plate of spec.armor[key].filter((p) => p.kind === 'main')) {
  const shell = a6.armor[key].find((p) => p.kind === 'main' && p.name === plate.name);
  assert.deepEqual([plate.keMm, plate.ceMm], [shell.keMm, shell.ceMm], `${plate.name} is the 2A6's`);
}
assert.deepEqual({ ...spec.dims }, { hullLengthM: 7.72, overallLengthM: 10.97, widthM: 4.44, heightM: 3.28 },
  'the dimensions spotting and contact read are unchanged; the kit is sized to them');
const D = LEOPARD_A6_X_DATUMS.leo2a6;
assert.deepEqual([...LEOPARD_A6_UA_PIVOT], [...D.turretPivot], 'the kit\'s layout names the 2A6\'s ring');
assert.deepEqual(spec.armor.turretPivot, [...D.turretPivot], 'the ring is the source-measured 2A6\'s');
assert.ok(spec.armor.gunPivot.every((v, i) => Math.abs(v - (D.trunnion[i] - D.turretPivot[i])) < 1e-9),
  'the trunnion is the source-measured 2A6\'s');

const sectorNames = [
  'ua_turret_cheek_era_R', 'ua_turret_cheek_era_L',
  'ua_turret_side_era_R', 'ua_turret_side_era_L',
  'ua_skirt_era_R', 'ua_skirt_era_L',
];
const eraSectors = [...spec.armor.hullPlates, ...spec.armor.turretPlates]
  .filter((plate) => sectorNames.includes(plate.name));
assert.deepEqual([...new Set(eraSectors.map((plate) => plate.name))].sort(), [...sectorNames].sort(),
  'six named ERA banks back the Kontakt-1 courses');
// 264b: no 2A6M wedge pair floats over the 2A6 roof; the turret is the 2A6's main cells under the UA's Kontakt-1
assert.ok(spec.armor.turretPlates.every((plate) => plate.kind === 'main' || plate.kind === 'era'),
  'the turret carries the 2A6\'s main cells and its own Kontakt-1, no donor spaced plates');
for (const plate of eraSectors) {
  assert.equal(plate.kind, 'era', `${plate.name} is consumable ERA`);
  assert.ok(plate.era?.ceFlatMm >= 300, `${plate.name} has shaped-charge protection`);
  assert.ok(plate.era?.keReduction > 0 && plate.era.keReduction <= 0.22, `${plate.name} keeps a bounded kinetic effect`);
}

const build = (tankId) => createTank(tankId, null, { proceduralOnly: true, geometryReceipt: true, quality: 'high' });
const tank = build(id);
tank.root.updateMatrixWorld(true);
const turret = tank.root.getObjectByName('rig_turret');
const gun = tank.root.getObjectByName('rig_gun');
const muzzle = tank.root.getObjectByName('rig_muzzle');
assert.ok(tank.root.getObjectByName('rig_hull') && turret && gun && tank.root.getObjectByName('rig_recoil') && muzzle,
  'the 2A6 articulation hierarchy');

// the armour, the running gear's hull stock and the gun are the 2A6's own, byte for byte: the kit adds, it never edits
{
  const base = build('leo2a6');
  for (const name of ['hull', 'turret', 'gun', 'gunMount']) {
    const a = tank.root.getObjectByName(name)?.geometry.getAttribute('position');
    const b = base.root.getObjectByName(name)?.geometry.getAttribute('position');
    assert.ok(a && b && a.count === b.count && a.array.every((v, i) => v === b.array[i]),
      `${name}: the UA's ${name} stock is the source-measured 2A6's`);
  }
  base.dispose();
}

const receipt = turret.userData.leopard2A6UAKitReceipt;
assert.equal(receipt?.base, 'leo2a6');
assert.equal(receipt.equipmentIsNonArmor, true);
assert.deepEqual(Object.keys(receipt.cassettes).sort(), [...sectorNames].sort(), 'every ERA sector has its cassettes');
for (const side of ['L', 'R']) {
  // the owner, 2026-10-28: "a ton of extra era": the skirts' whole length, three flank courses, the wedges' tops
  assert.equal(receipt.cassettes[`ua_skirt_era_${side}`], 51,
    `the ${side} skirt carries a standing and a lying course its length (none behind a plate seam)`);
  assert.equal(receipt.cassettes[`ua_turret_side_era_${side}`], 15, `the ${side} turret flank carries three courses`);
  assert.ok(receipt.cassettes[`ua_turret_cheek_era_${side}`] >= 12, `the ${side} wedge carries its side courses and roof rows`);
}
assert.ok(receipt.turretBrackets >= 12 && receipt.hullBrackets >= 20, 'the screens are bolted to the armour');

// the kit is open lattice and equipment, never the armour shell (the OTCO lesson of 2026-10-28)
for (const name of ['turretOpenLattice', 'turretOpenLatticeDark', 'hullOpenLattice', 'hullOpenLatticeDark']) {
  const mesh = tank.root.getObjectByName(name);
  assert.ok(mesh?.isMesh, `${name}: the kit's lattice is drawn`);
  assert.equal(mesh.userData.combatHitboxRole, 'nonArmor', `${name} is not armour`);
  assert.equal(mesh.userData.continuityRole, 'open-lattice', `${name} is open lattice`);
}
{
  // compared by walking up, never with assert.equal on scene objects (a failure would inspect the whole scene graph)
  let up = tank.root.getObjectByName('turretOpenLattice');
  while (up && up !== turret) up = up.parent;
  assert.ok(up === turret, 'the screens and cage turn with the turret');
}

// the kit's envelope is the vehicle's published one: 4.44 m wide over the hull boxes, 3.28 m over the cage's ridge
{
  const width = new THREE.Box3().setFromObject(tank.root.getObjectByName('hullOpenLattice'));
  assert.ok(Math.abs(width.max.x - 2.22) < 0.005 && Math.abs(width.min.x + 2.22) < 0.005, 'the hull boxes span 4.44 m');
  const cage = new THREE.Box3().setFromObject(tank.root.getObjectByName('turretOpenLattice'));
  assert.ok(Math.abs(cage.max.y - 3.28) < 0.01, `the cage's ridge stands at 3.28 m (${cage.max.y.toFixed(3)})`);
  assert.ok(cage.min.y > LEOPARD_A6_UA_KIT.chainBottomY - 0.02, 'the turret kit stays above the engine deck');
}

// one working roof gun, the 2A6's loader MG3, 7.62 mm as before
assert.deepEqual(AUXILIARY_INVENTORY[id].guns.map((g) => [g.name, g.caliberMm]), [['leopardA6XLoaderMg', 7.62]]);
assert.ok(turret.getObjectByName('turretMissionReceiver'), 'the roof dock receiver is seated on the cage rail');

const eraFinish = tank.root.userData.eraFinishReceipt;
assert.deepEqual([...eraFinish.gameplaySectors].sort(), [...sectorNames].sort(),
  'all six gameplay sectors participate in the merged visual finish');
assert.equal(eraFinish.layeredCassettes, Object.values(receipt.cassettes).reduce((a, b) => a + b, 0),
  'every cassette is a layered visual cassette');

// the field net (ghillieFleetSuits.ts): laid on the turret roof under the cage and on the cage roof, down the bustle, on the
// front deck and down the rear hull walls; the wedges bare
const ghillie = FLEET_GHILLIE_SUITS[id];
assert.ok(ghillie?.fieldClearanceM > 0, 'a field net, held clear of the turret traverse and the gun by the builder');
for (const owner of ['hull', 'turret']) {
  for (const layer of ['net', 'leaves']) {
    const mesh = tank.root.getObjectByName(`${tankSeedId(id)}_ghillie_${owner}_${layer}`);
    assert.ok(mesh?.isMesh && mesh.geometry.getAttribute('position').count > 120, `${owner} ghillie ${layer} is drawn`);
  }
}
{
  const toTurret = new THREE.Matrix4().copy(turret.matrixWorld).invert();
  const net = tank.root.getObjectByName(`${tankSeedId(id)}_ghillie_turret_net`), at = net.geometry.getAttribute('position');
  const local = Array.from({ length: at.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(at, i)
    .applyMatrix4(net.matrixWorld).applyMatrix4(toTurret));
  const eave = LEOPARD_A6_UA_KIT.eaveY - LEOPARD_A6_UA_PIVOT[1];
  assert.ok(local.some((v) => v.y > eave - 0.01), 'a net lies over the cage roof');
  assert.ok(local.some((v) => v.y < 0.45 && Math.abs(v.x) < 1.0), 'a net lies on the turret roof itself');
  assert.ok(local.every((v) => v.z < LEOPARD_A6_UA_KIT.roofFrontZ - LEOPARD_A6_UA_PIVOT[2] + 0.08),
    'the wedges and their Kontakt-1 carry no net');
}

const markings = [];
tank.root.traverse((object) => { if (object.userData.vehicleMarking) markings.push(object); });
assert.ok(markings.some((object) => object.userData.markingCode?.includes(':ua-trident:')),
  'Ukrainian trident is present on a final supported surface');
assert.ok(markings.every((object) => object.userData.surfaceSupported), 'every UA marking is physically seated');

tank.dispose();
console.log('leopard2A6UA.selftest: the source-measured 2A6 with its Ukrainian kit, combat spec unchanged');
