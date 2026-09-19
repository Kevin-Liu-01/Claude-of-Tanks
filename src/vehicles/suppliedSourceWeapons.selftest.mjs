import assert from 'node:assert/strict';
import './tankFactory.ts';
import { TANK_SPECS } from './specs.ts';
import { SUPPLIED_SOURCE_IDS, synchronizeSuppliedSourceCombatMetadata } from './suppliedSourceFleetSpecs.ts';
import { sustainedPrimaryDpm } from './balanceAudit.ts';
import { guidedMissileSlot, specialActionKind } from '../sim/specialActionPolicy.ts';
import { createCombatState, selectShell, startReload } from '../sim/damage.ts';

const spec = TANK_SPECS.k21_x;
const cannon = TANK_SPECS.cv90;
const missilePeer = TANK_SPECS.type89.gun.shells.find(round => round.guided);
const donorSnapshots = new Map(['cv90', 'type89', 'spz_puma', 'spz_puma_s1'].map(id => [id, JSON.stringify(TANK_SPECS[id])]));
const gunBefore = structuredClone(spec.gun);
const suppliedGunsBefore = new Map(SUPPLIED_SOURCE_IDS.map(id => [id, structuredClone(TANK_SPECS[id].gun)]));
const armorBefore = new Map(SUPPLIED_SOURCE_IDS.map(id => [id, structuredClone(TANK_SPECS[id].armor)]));
const sourceFrame = { turret: [...spec.armor.turretPivot], gun: [...spec.armor.gunPivot], barrel: structuredClone(spec.armor.gunBarrel) };

function checkLoadout() {
  assert.equal(spec.gun.caliberMm, 40, 'K21 keeps its source main cannon');
  assert.equal(spec.gun.shells.length, 3, 'the numbered selector retains three usable channels');
  assert.deepEqual(spec.gun.shells.slice(0, 2).map(round => [round.type, round.caliberMm, round.dmg, round.reloadS, round.count]),
    cannon.gun.shells.slice(0, 2).map(round => [round.type, round.caliberMm, round.dmg, round.reloadS, round.count]),
    'conventional cannon tuning and capacity remain unchanged');
  assert.equal(guidedMissileSlot(spec), 2, 'the actual auxiliary launcher is selectable');
  assert.equal(specialActionKind(spec), 'guided_missile', 'the launcher is exposed by the battle special action');
  const missile = spec.gun.shells[2];
  assert.deepEqual(missile, { ...missilePeer, name: 'Guided missile', count: 2, launcherTubes: 2 },
    'the label, two ready rounds and two source launchers retain the declared gameplay peer');
  assert.notStrictEqual(missile, missilePeer, 'a per-vehicle loadout cannot mutate the peer');
  assert.notEqual(spec.gun.primaryGuided, true, 'the 40 mm cannon remains primary');
  assert.equal(spec.balancePeerOf, 'cv90', 'the unchanged primary-performance cohort keeps its existing peer hint');
  const primaryMetrics = vehicle => [vehicle.hp, sustainedPrimaryDpm(vehicle), vehicle.gun.shells[0].pen100Mm,
    vehicle.enginePowerHp / vehicle.weightTons, 1 / (vehicle.gun.baseAccuracy * vehicle.gun.aimTimeS)];
  assert.deepEqual(primaryMetrics(spec), primaryMetrics(cannon), 'all five independently audited cohort metrics remain unchanged');
  assert.deepEqual(spec.armor.turretPivot, sourceFrame.turret, 'source turret frame retained');
  assert.deepEqual(spec.armor.gunPivot, sourceFrame.gun, 'source gun frame retained');
  assert.deepEqual(spec.armor.gunBarrel, sourceFrame.barrel, 'source barrel retained');
}

function checkSourceConfigurations() {
  const configurations = {
    object695_x: [57, [4, 8]], kurganets25_x: [57, [4, 8]], ztz100_x: [105, []], fv510_milan_x: [30, [1]],
    griffin50_x: [50, []], ajax_x: [40, []], aft10_x: [170, [8]],
    bmp3m_dragun125_x: [125, []], k21_x: [40, [2]], type96b_x: [125, []],
    kf41_lynx_x: [35, []], cv90_mkiv_x: [50, [2]], cv90105_tml_x: [105, []], sabra_mk2_x: [120, []],
  };
  for (const [id, [caliber, launcherTubes]] of Object.entries(configurations)) {
    const gun = TANK_SPECS[id].gun;
    assert.equal(gun.caliberMm, caliber, `${id}: the supplied weapon configuration owns the caliber`);
    const guided = gun.shells.filter(round => round.guided);
    assert.deepEqual(guided.map(round => round.launcherTubes), launcherTubes,
      `${id}: each guided channel declares its source-authored launchers, never its balance peer's`);
    for (const round of guided) assert.ok(round.count >= round.launcherTubes,
      `${id}/${round.name}: authored inventory stocks every actual tube`);
    for (const round of gun.shells.filter(round => !round.guided)) {
      assert.equal(round.caliberMm, caliber, `${id}: every main-cannon round has the source caliber`);
    }
  }
}

function checkObject695Loadout() {
  const vehicle=TANK_SPECS.object695_x, state=createCombatState(vehicle);
  assert.deepEqual(state.ammo,[500,8,8], 'retained strong cannon/Kornet reserve plus all eight actual Bulat tubes');
  assert.equal(new Set(state.reloadChannels).size,3, 'each Epokha weapon owns its reload channel');
  for (const slot of [1,2]) {
    const others=state.reloadChannels.filter((_,i)=>i!==slot).map(c=>({...c}));
    assert.equal(selectShell(state,slot,vehicle),true); startReload(state,vehicle);
    assert.equal(state.reload.totalS,2.6);
    assert.deepEqual(state.reloadChannels.filter((_,i)=>i!==slot),others);
    state.ammo[slot]=0;assert.equal(selectShell(state,slot,vehicle),false);
  }
  assert.equal(selectShell(state,0,vehicle),true,'the primary cannon remains usable after both launchers deplete');
}

function checkKurganetsLoadout() {
  const kurganets = TANK_SPECS.kurganets25_x;
  const [primary, kornet, bulat] = kurganets.gun.shells;
  assert.equal(kurganets.balancePeerOf,'spz_puma_s1','tier-X gameplay peer does not replace the source turret/frame');
  const peer = TANK_SPECS.spz_puma_s1.gun;
  assert.deepEqual(primary, { ...peer.shells[0], name: '57 mm APFSDS', caliberMm: 57 },
    'the short 57 mm main gun preserves declared primary gameplay tuning');
  assert.deepEqual(kornet, { ...peer.shells[1], name: 'Kornet guided missile', count: 4, launcherTubes: 4 },
    'four source-visible Kornet tubes retain the declared guided balance channel');
  assert.deepEqual(bulat, { ...peer.shells[2], name: 'Bulat guided missile', caliberMm: 70, guided: true,
    count: 8, launcherTubes: 8, velocityMps: peer.shells[1].velocityMps, reloadS: peer.shells[1].reloadS,
    soundProfile: peer.shells[1].soundProfile }, 'Bulat uses documented HE effect and guided-motion tuning');
  assert.equal(guidedMissileSlot(kurganets), 1, 'special action selects the first actual launcher');
  const state = createCombatState(kurganets);
  assert.deepEqual(state.ammo, [peer.shells[0].count, 4, 8], 'source-visible launcher counts do not invent hidden reserves');
  assert.equal(new Set(state.reloadChannels).size, 3, 'cannon, Kornet and Bulat cycles are distinct');
  for (const slot of [1, 2]) {
    const untouched = state.ammo.filter((_, i) => i !== slot);
    const otherCycles = state.reloadChannels.filter((_, i) => i !== slot).map(channel => ({ ...channel }));
    assert.equal(selectShell(state, slot, kurganets), true, `launcher ${slot}: numbered selector works`);
    startReload(state, kurganets);
    assert(state.reloadChannels[slot].t > 0, `launcher ${slot}: its own cycle starts`);
    assert.deepEqual(state.reloadChannels.filter((_, i) => i !== slot), otherCycles,
      `launcher ${slot}: selecting and cycling it cannot reset the other two weapons`);
    assert.deepEqual(state.ammo.filter((_, i) => i !== slot), untouched, `launcher ${slot}: other inventories preserved`);
    state.ammo[slot] = 0;
    assert.equal(selectShell(state, slot, kurganets), false, `launcher ${slot}: exhausted channel rejected`);
  }
  assert.equal(selectShell(state, 0, kurganets), true, '57 mm cannon remains selectable after both launchers exhaust');
}
checkLoadout();
checkObject695Loadout();
checkSourceConfigurations();
checkKurganetsLoadout();
const combat = createCombatState(spec);
assert.equal(combat.ammo[2], 2, 'two actual ready missiles initialize');
assert.equal(selectShell(combat, 2, spec), true, 'guided channel can be selected');
assert.notEqual(combat.reloadChannels[0], combat.reloadChannels[2], 'auxiliary launcher has an independent reload channel');
combat.ammo[2] = 0;
assert.equal(selectShell(combat, 2, spec), false, 'exhausted launcher is not selectable');
assert.equal(selectShell(combat, 0, spec), true, 'cannon remains available after missiles are exhausted');
assert(spec.armor.modules.some(module => module.module === 'missileRack'), 'the real launcher has a damageable missile module');
assert(!TANK_SPECS.ajax_x.armor.modules.some(module => module.module === 'missileRack'), 'gun-only Ajax remains without phantom missile storage');
for (const id of ['ajax_x', 'griffin50_x', 'kf41_lynx_x']) assert.equal(guidedMissileSlot(TANK_SPECS[id]), -1, `${id}: no ghost launcher`);
try {
  for (let pass = 0; pass < 2; pass++) {
    synchronizeSuppliedSourceCombatMetadata();
    checkLoadout();
    checkSourceConfigurations();
    checkKurganetsLoadout();
    assert.deepEqual(spec.gun, gunBefore, 'post-balance synchronization does not duplicate/lose the launcher');
    for (const [id, before] of suppliedGunsBefore) assert.deepEqual(TANK_SPECS[id].gun, before, `${id}: repeated sync preserves the complete weapon configuration`);
    for (const [id, before] of donorSnapshots) assert.equal(JSON.stringify(TANK_SPECS[id]), before, `${id}: source balance peer unchanged`);
  }
} finally {
  for (const [id, armor] of armorBefore) TANK_SPECS[id].armor = armor;
}
console.log('suppliedSourceWeapons: all13 supplied + Object695 caliber/launcher census; K21 and both Kurganets launchers, source frames, independent inventory/reload and damage module pass');
