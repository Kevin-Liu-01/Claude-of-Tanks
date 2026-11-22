// Release 274 (lane t80-family-274, the owner 2026-11-20: "make unique versions of them now"): the T-80, T-80B and T-80BV
// build on the T-80U X hull (profiles/t80Marks.ts), each with its own photographed era kit, and take the T-80U X's combat
// frame (t80MarkFrames.ts); the Ukrainian T-80BV is the BV mark in its 2015-24 fit, and the T-80U Kursk the whole T-80U X
// build in its 2022 Ukrainian field fit (profiles/t80uKursk.ts) on the T-80U's armour record. Pins: the twin and each mark's identity (no two marks share their sights, searchlight side,
// smoke, flank boxes, side screens and stern), the commander's NSVT on the traversing turret, and the BV's Kontakt-1 drawn
// and in the spec both ways, at the fleet's Kontakt-1 values; the T-80 and T-80B carry no ERA. Per-tank pin (tanks suite).
import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.ts';
import { TANK_SPECS } from '../specs.ts';
import { KONTAKT1_ERA } from '../leopard2A4Kontakt1.ts';
import { T80BV_KONTAKT1_PLATES, UA_T80BV_KONTAKT1_PLATES, T80U_KURSK_ARMOR_FACTOR, T80U_KURSK_K1_PLATES, T84_ERA_PLATES, t80SternPitchByYawDeg } from '../t80MarkFrames.ts';
import { minimumMechanicalGunPitch } from '../../sim/gunPitchLimits.ts';
import { FLEET_GHILLIE_SUITS } from '../ghillieFleetSuits.ts';
import { tankSeedId } from '../tankIdAliases.ts';
import { eraPlateNames } from './eraAgreement.test-support.mjs';
import { rubberSkirtRun } from './rubberSkirt.ts';
import { skirtSections } from './rubberSkirtSheets.ts';
import { t80uXApronAt, t80uXApronX } from './t80uXApron.ts';

const MARKS = ['t80', 't80b', 't80bv', 'ua_t80bv'];
const receipts = {};
for (const id of MARKS) {
  const tank = createTank(id, null, { proceduralOnly: true, quality: 'high', camoSeed: 4242, geometryReceipt: true });
  try {
    const hull = tank.root.getObjectByName('rig_hull'), turret = tank.root.getObjectByName('rig_turret');
    assert.deepEqual(hull.userData.familyRebuild, { donor: 't80u', revision: 1, mark: id }, `${id}: built on the T-80U X hull`);
    const receipt = turret.userData.t80MarkReceipt;
    assert.ok(receipt, `${id}: publishes its mark receipt`);
    assert.equal(receipt.casting, 't80-early-cast-r1', `${id}: the early casting, not the T-80U's`);
    assert.equal(turret.userData.t80CastTurretReceipt, undefined, `${id}: the retired print-fitted dome is gone`);
    receipts[id] = receipt;

    // the commander's NSVT rides the traversing turret on a straight, cupola-mounted station
    const station = turret.getObjectByName('t80MarkCommanderNsvtStation');
    assert.ok(station && station.parent === turret, `${id}: the NSVT station is on the turret`);
    assert.equal(station.userData.supportAssembly, 'commander-cupola');
    assert.ok(station.position.x < 0, `${id}: the NSVT is on the commander's (right, -x) side`);
    for (const axis of ['x', 'y', 'z']) assert.equal(station.rotation[axis], 0, `${id}: station ${axis} rotation`);

    // drawn ERA against the spec, both directions
    const drawn = [...(tank.root.userData.eraClusterNames ?? [])].sort();
    assert.deepEqual(drawn, eraPlateNames(TANK_SPECS[id]), `${id}: drawn ERA equals its gameplay ERA plates`);
    assert.equal(tank.root.userData.eraFinishReceipt !== undefined, id.endsWith('t80bv'), `${id}: an ERA finish only where ERA is drawn`);
  } finally { tank.dispose(); }
}

// each mark's photographed identity (evidence photos/IDENTITY.md)
assert.deepEqual(receipts.t80.sights, ['tpd-2-49', 'rangefinder-housing', 'tpn-1-49-23']);
assert.deepEqual(receipts.t80b.sights, ['1g42', 'kobra-guidance']);
assert.equal(receipts.t80.lunaSide, 'left');
assert.equal(receipts.t80b.lunaSide, 'right');
assert.equal(receipts.ua_t80bv.lunaSide, 'none', 'the Ukrainian 2019 upgrade retired the IR searchlight');
assert.deepEqual(MARKS.map((id) => receipts[id].smokeTubes), [0, 9, 8, 8], 'no smoke on the 1976 tank; 5+4 on the B; 4+4 on the BV flanks');
assert.deepEqual(MARKS.map((id) => receipts[id].flankBoxes), [3, 2, 2, 0]);
assert.deepEqual(MARKS.map((id) => receipts[id].sideScreens), ['steel-screen', 'rubber-skirt', 'rubber-skirt', 'rubber-skirt']);
assert.deepEqual(MARKS.map((id) => receipts[id].sternDrums), [true, true, true, true], 'the owner, 2026-11-20: drums on every mark, as on the T-90 marks');
assert.deepEqual(MARKS.map((id) => receipts[id].fenderTail), [['zip-box', 'zip-box'], ['zip-box', 'zip-box'], ['zip-box', 'zip-box'], ['zip-box', 'jerry-cans']]);
// the gun's depression over each stern, measured with its drums, boxes and cans on (tools/gun-depression-sweep.mjs): the
// gun rides over the drums at the rear quarters, where the T-80U's drumless curve let it pass through them
for (const id of [...MARKS, 't80u_kursk']) {
  assert.deepEqual(TANK_SPECS[id].gunPitchByYawDeg, t80SternPitchByYawDeg(id), `${id}: its own measured stern curve`);
  for (const yaw of [150, 155, 160, 165]) assert.ok(minimumMechanicalGunPitch(TANK_SPECS[id], yaw * Math.PI / 180) * 180 / Math.PI >= 6, `${id}: the gun clears the drums at ${yaw} deg`);
}
assert.deepEqual(MARKS.map((id) => receipts[id].commanderShield), [false, false, true, false], 'the NSVT shield is Russian');
assert.deepEqual(MARKS.map((id) => receipts[id].meshBaskets), [false, false, false, true], 'the Ukrainian 2018 mesh baskets');
assert.deepEqual(MARKS.map((id) => receipts[id].overheadScreen), [false, false, false, true], 'the Ukrainian 2022-24 overhead screen');
for (const id of ['t80', 't80b']) assert.deepEqual(receipts[id].kontakt1, {}, `${id}: no Kontakt-1`);

// the BV's Kontakt-1: every cluster populated (eight wedge columns left of the gun's line on the casting's +x cheek, five
// on the -x, two deep; the 4x4 roof grid on the -x front; the tapering glacis field; bare skirts), and the spec's plates
// at the fleet's Kontakt-1 values
const k1 = receipts.t80bv.kontakt1;
assert.deepEqual(Object.keys(k1).sort(), [...T80BV_KONTAKT1_PLATES]);
assert.equal(k1.turret_era_R, 16, 'eight double-stacked columns on the +x cheek');
assert.equal(k1.turret_era_L, 10 + 16, 'five double-stacked columns and the 4x4 roof grid on the -x side');
assert.equal(k1.skirt_era_L, undefined, 'no Kontakt-1 on the T-80BV\'s skirts (274, Kevin: "remove the goofy squares")');
assert.ok(k1.glacis_era_L + k1.glacis_era_R >= 30, 'the glacis field (11-10-8-6-4 less the lamp and hook clearances)');
// the Ukrainian BV: the same field, the skirt row the full length (15 a side) and the extra 3x4 box on the +x flank
const ua = receipts.ua_t80bv.kontakt1;
assert.deepEqual(Object.keys(ua).sort(), [...UA_T80BV_KONTAKT1_PLATES]);
assert.equal(ua.skirt_era_L, 15);
assert.equal(ua.skirt_era_R, 15);
assert.equal(ua.turret_era_R, k1.turret_era_R + 12, 'the flank box adds three columns of four');
assert.equal(ua.glacis_era_L + ua.glacis_era_R, k1.glacis_era_L + k1.glacis_era_R);
for (const id of ['t80bv', 'ua_t80bv']) for (const plate of [...TANK_SPECS[id].armor.hullPlates, ...TANK_SPECS[id].armor.turretPlates].filter((p) => p.kind === 'era'))
  assert.deepEqual(plate.era, { ...KONTAKT1_ERA }, `${id} ${plate.name}: Kontakt-1, not the T-80UK's Kontakt-5`);

// the T-80U X combat frame
for (const id of MARKS) {
  const spec = TANK_SPECS[id], twin = TANK_SPECS.t80u;
  // the combat frame is the one the gun-barrel census measures on the build (combatGunRigs.generated.ts): the twin's yaw
  // pivot exactly, the trunnion within 1.5 cm of the twin's (the marks' gun sits on the casting's own mantlet collar)
  assert.deepEqual(spec.armor.turretPivot, twin.armor.turretPivot, `${id}: the twin's yaw pivot`);
  spec.armor.gunPivot.forEach((v, k) => assert.ok(Math.abs(v - twin.armor.gunPivot[k]) <= 0.015, `${id}: trunnion ${k} within 1.5 cm of the twin's`));
  assert.equal(spec.dims.hullLengthM, twin.dims.hullLengthM, `${id}: the twin's hull length`);
}

// the T-80U Kursk (the owner, 2026-11-20: "a ton of era at front of turret, on top of turret, on sideskirts and upper
// glacis and different machine guns and 2 machine guns"): the T-80U X build whole under its field Kontakt-1, an M2 and an
// M240-class gun, on the T-80U's armour record at its 1.04 factor plus the Kontakt-1's six plates
const eraSectors = (tank) => [...(tank.root.userData.eraFinishReceipt?.sectors ?? [])].sort();
const twinTank = createTank('t80u', null, { proceduralOnly: true, quality: 'high', camoSeed: 4242, geometryReceipt: true });
const twinSectors = eraSectors(twinTank);
twinTank.dispose();
{
  const id = 't80u_kursk';
  const tank = createTank(id, null, { proceduralOnly: true, quality: 'high', camoSeed: 4242, geometryReceipt: true });
  try {
    const hull = tank.root.getObjectByName('rig_hull'), turret = tank.root.getObjectByName('rig_turret');
    assert.deepEqual(hull.userData.familyRebuild, { donor: 't80u', revision: 1, variant: 'ua-service' });
    const receipt = turret.userData.t80uKurskReceipt;
    assert.deepEqual({ ...receipt, kontakt1: undefined }, { base: 't80u-x', fit: 'ua-2022-captured', kontakt1: undefined,
      roofGuns: ['m2', 'm240'], rearKit: ['unditching-log', 'stern-drums', 'flank-crates'], ghillie: ['turret-rear-roof'], fenderIdPaint: 2, flag: 'ua', barrelBands: 2 });
    for (const key of ['uaT80ChevronEraReceipt', 'turretEraSurfaceSeatReceipt', 't80CastTurretReceipt'])
      assert.equal(turret.userData[key], undefined, `${id}: the retired suite's ${key} is gone`);
    // the field Kontakt-1 in every cluster: over the glacis Kontakt-5, two rows the length of each skirt, the roof's front
    // half and the free cheek blocks
    const k1 = receipt.kontakt1;
    assert.deepEqual(Object.keys(k1).sort(), [...T80U_KURSK_K1_PLATES].sort());
    assert.ok(k1.glacis_k1_L + k1.glacis_k1_R >= 30, `${id}: the glacis field (${k1.glacis_k1_L + k1.glacis_k1_R})`);
    assert.equal(k1.skirt_era_L, 33); assert.equal(k1.skirt_era_R, 33);
    assert.ok(k1.turret_k1_L + k1.turret_k1_R >= 18, `${id}: the roof and cheek containers (${k1.turret_k1_L + k1.turret_k1_R})`);
    // two working roof guns, neither an NSVT nor a Kord: the commander's M2 on the NSVT's pintle and riser, the gunner's
    // M240-class gun on its post
    assert.equal(turret.getObjectByName('t80uCommanderNsvtStation'), undefined, `${id}: no NSVT`);
    const m2 = turret.getObjectByName('t80uKurskCommanderM2Station'), m240 = turret.getObjectByName('t80uKurskGunnerM240');
    assert.ok(m2 && m2.parent === turret && m240 && m240.parent === turret, `${id}: both roof guns ride the turret`);
    // drawn ERA = spec both ways: the T-80U's Kontakt-5 sectors and the field Kontakt-1's
    assert.deepEqual([...(tank.root.userData.eraClusterNames ?? [])].sort(), eraPlateNames(TANK_SPECS[id]), `${id}: drawn ERA = spec`);
    const sectors = eraSectors(tank);
    for (const sector of twinSectors) assert.ok(sectors.includes(sector), `${id}: keeps the T-80U's ${sector}`);
    // the field net on the turret roof's rear half only
    const ghillie = FLEET_GHILLIE_SUITS[id];
    assert.ok(ghillie?.fieldClearanceM > 0 && !ghillie.hull && !ghillie.turret.side, `${id}: the rear roof net only`);
    for (const layer of ['net', 'leaves']) {
      const mesh = tank.root.getObjectByName(`${tankSeedId(id)}_ghillie_turret_${layer}`);
      assert.ok(mesh?.isMesh && mesh.geometry.getAttribute('position').count > 120, `${id}: turret ghillie ${layer} drawn`);
    }
    // the identification paint on both fender noses and the flag's two faces
    const flags = [];
    tank.root.traverse((o) => { if (o.name === 'vehicleMarking_flag') flags.push(o); });
    assert.equal(flags.filter((o) => o.userData.surfaceOwner === 'hull').length, 2, `${id}: ID paint on both fender noses`);
    assert.equal(flags.filter((o) => o.userData.surfaceOwner === 'turret').length, 2, `${id}: the flag's two faces`);
  } finally { tank.dispose(); }
  const spec = TANK_SPECS[id], twin = TANK_SPECS.t80u;
  assert.deepEqual(spec.armor.turretPivot, twin.armor.turretPivot);
  assert.equal(spec.dims.hullLengthM, twin.dims.hullLengthM);
  const plates = (s) => [...s.armor.hullPlates, ...s.armor.turretPlates];
  const own = plates(spec).filter((p) => !T80U_KURSK_K1_PLATES.includes(p.name));
  assert.deepEqual(own.map((p) => p.name), plates(twin).map((p) => p.name), `${id}: the T-80U's plates`);
  own.forEach((p, k) => {
    const t = plates(twin)[k];
    assert.equal(p.keMm, p.kind === 'external' ? t.keMm : Math.round(t.keMm * T80U_KURSK_ARMOR_FACTOR), `${id} ${p.name}: KE`);
  });
  for (const p of plates(spec).filter((p) => T80U_KURSK_K1_PLATES.includes(p.name)))
    assert.deepEqual(p.era, { ...KONTAKT1_ERA }, `${id} ${p.name}: Kontakt-1`);
  // the T-80U's modules, but for the roof-gun module, which follows the station the Kursk draws (the M2, not the NSVT)
  const notRoofGun = (m) => m.module !== 'roofGun';
  assert.deepEqual(spec.armor.modules.filter(notRoofGun), twin.armor.modules.filter(notRoofGun), `${id}: the T-80U's modules`);
  const roofGun = spec.armor.modules.find((m) => m.module === 'roofGun');
  assert.ok(roofGun && roofGun.max[2] > 1.2, `${id}: the roof-gun module spans the M2's 1.21 m reach`);
}

// the T-84 (Object 478DU2; lane t80-family-274 step 3, the owner signed off its look 2026-11-20): the T-80U X hull, ring and
// gun under its own welded turret, the 6TD-2 deck, Kontakt-5 drawn = spec, the T-80U's frame at the T-84's own protection
{
  const id = 't84', tank = createTank(id, null, { proceduralOnly: true, quality: 'high', camoSeed: 4242, geometryReceipt: true });
  try {
    assert.deepEqual(tank.root.getObjectByName('rig_hull').userData.familyRebuild, { donor: 't80u', revision: 1, variant: 't84-478du2' });
    assert.deepEqual({ ...tank.root.getObjectByName('rig_turret').userData.t84Receipt }, { turret: 'welded-478du2', deck: '6td-2',
      era: 'kontakt-5', shtora: true, smokeTubes: 12, roofGun: 'kt-12.7', rearRack: true, sternDrums: true });
    assert.ok(tank.root.getObjectByName('t84CommanderKt127'), `${id}: the KT-12.7 station`);
    assert.equal(tank.root.getObjectByName('t80uCommanderNsvtStation'), undefined, `${id}: not the T-80U's NSVT`);
    assert.deepEqual([...(tank.root.userData.eraClusterNames ?? [])].sort(), eraPlateNames(TANK_SPECS[id]), `${id}: drawn ERA = spec`);
  } finally { tank.dispose(); }
  const spec = TANK_SPECS[id], twin = TANK_SPECS.t80u;
  assert.deepEqual(eraPlateNames(spec), [...T84_ERA_PLATES].sort(), `${id}: Kontakt-5 on the glacis, cheeks and skirt fronts`);
  assert.deepEqual(spec.armor.turretPivot, twin.armor.turretPivot, `${id}: the twin's yaw pivot`);
  assert.equal(spec.dims.hullLengthM, twin.dims.hullLengthM, `${id}: the twin's hull length`);
  assert.deepEqual(spec.gunPitchByYawDeg, t80SternPitchByYawDeg(id), `${id}: its own measured stern curve`);
  const plate = (name) => [...spec.armor.hullPlates, ...spec.armor.turretPlates].find((p) => p.name === name);
  assert.deepEqual([plate('upper_glacis').keMm, plate('turret_cheek_L').keMm], [480, 550], `${id}: its own glacis and cheeks`);
  assert.deepEqual(plate('glacis_era_L').era, { keReduction: 0.2, ceFlatMm: 450 }, `${id}: its glacis Kontakt-5`);
  assert.equal(spec.hp, 2250, `${id}: its own hp`);
}


// the segmented rubber skirts (profiles/rubberSkirt.ts, 274 t80-skirts-274; Kevin: "fix these rubber sideskirts they look so
// bad"): separate sheets with gaps, each hung on the apron line under its own clamp strip and bolts, its foot kicked out
// and its lower corners curled, each sheet unlike its neighbours, and the same build twice
{
  const runOf = (clamp) => {
    const sheets = [], fittings = [];
    const port = { addMudguard: (label, bucket, geo) => sheets.push({ label, bucket, geo }), addEquipment: (bucket, geo) => fittings.push({ bucket, geo }) };
    rubberSkirtRun(port, { label: 't80b-rubber-skirt', bucket: 'hullRubber', side: 1, sections: skirtSections(-2.86, 2.88, 7),
      top: (z) => t80uXApronAt(z).top, foot: (z) => t80uXApronAt(z).foot, x: t80uXApronX, clamp });
    return { sheets, fittings };
  };
  const { sheets, fittings } = runOf();
  assert.equal(sheets.length, 7, 'seven sheets a side');
  const boxes = sheets.map(({ geo }) => { geo.computeBoundingBox(); return geo.boundingBox; });
  for (let i = 1; i < boxes.length; i++) {
    const gap = boxes[i].min.z - boxes[i - 1].max.z;
    assert.ok(gap > .024 && gap < .034, `sheet ${i}: a ${gap.toFixed(4)} m open joint to its neighbour`);
  }
  for (const [i, b] of boxes.entries()) {
    const z = (b.min.z + b.max.z) / 2, { top, foot } = t80uXApronAt(z);
    assert.ok(Math.abs(b.max.y - top) < .03, `sheet ${i}: hangs from the apron line`);
    assert.ok(b.min.y > foot - .04 && b.min.y < foot + .03, `sheet ${i}: reaches the apron's foot, its hem its own`);
    assert.ok(b.max.x - t80uXApronX(z, foot) > .03, `sheet ${i}: its foot kicked out, flared and beaded`);
  }
  const kicks = boxes.map((b) => b.max.x.toFixed(4));
  assert.ok(new Set(kicks).size >= 5, `the sheets differ (${kicks.join(', ')})`);
  assert.ok(fittings.length >= 7 * 3 && fittings.every(({ bucket }) => bucket === 'hullDetail'), 'a clamp strip and at least two bolts on every sheet');
  const again = runOf();
  assert.deepEqual(again.sheets.map(({ geo }) => [...geo.getAttribute('position').array]), sheets.map(({ geo }) => [...geo.getAttribute('position').array]),
    'the same skirts every build');
  assert.equal(runOf(() => false).fittings.length, 0, 'a sheet under an ERA row carries no clamp of its own');
}

console.log('t80Marks.selftest: T-80, T-80B, T-80BV, the Ukrainian T-80BV, the T-80U Kursk and the T-84 on the T-80U X hull, each with its own kit; ERA drawn = spec; segmented rubber skirts');
