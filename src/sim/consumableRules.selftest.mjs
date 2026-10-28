// consumableRules.selftest — the battle consumables (owner 2026-10-26, the catalog; sim/consumableRules.ts): the catalog
// and its ruleset timing, the era, need and mode gates, the loadout a crew carries, the bots' picks, and every item's
// effect, cooldown and charges through the shared adapter. Copyright © 2026 Kevin B. Liu.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  APS_ARC_DEG, CONSUMABLE_BY_ID, CONSUMABLE_CATALOG, CONSUMABLE_FOLIAGE_EQUIPMENT, CONSUMABLE_SLOTS,
  DEFAULT_CONSUMABLE_LOADOUT, GOVERNOR_POWER_MULT, JAMMER_RADIUS_M, LARGE_REPAIR_RATE_MULT, RATIONS_AIM_MULT,
  RATIONS_RELOAD_MULT, SMOKE_SALVO_MAX, apsIntercepts, botConsumableLoadout, consumableActive, consumableLock,
  consumableSpottingIds, createConsumableState, jammerCovers, sanitizeConsumableLoadout, suppressNewFire, tickConsumables,
  useConsumableSlot,
} from './consumableRules.ts';
import { CONSUMABLE_TIMING, consumableTiming, matchRulesetFor, rulesetAllowsConsumable, rulesetConsumableGate } from './matchRuleset.ts';

// ---- the catalog and its timing
assert.equal(CONSUMABLE_CATALOG.length, 13, 'thirteen consumables');
assert.equal(new Set(CONSUMABLE_CATALOG.map((item) => item.id)).size, CONSUMABLE_CATALOG.length, 'unique ids');
assert.deepEqual(Object.keys(CONSUMABLE_TIMING).sort(), CONSUMABLE_CATALOG.map((item) => item.id).sort(),
  'every item has exactly one timing row in the ruleset');
assert.deepEqual(DEFAULT_CONSUMABLE_LOADOUT, ['repair', 'first_aid', 'extinguisher'], 'the default is the original trio');
assert.deepEqual(DEFAULT_CONSUMABLE_LOADOUT.map((id) => CONSUMABLE_TIMING[id].cooldownS), [35, 45, 25],
  'the original kits keep their cooldowns');
assert.ok(DEFAULT_CONSUMABLE_LOADOUT.every((id) => CONSUMABLE_TIMING[id].charges === null), 'and stay unlimited');
for (const item of CONSUMABLE_CATALOG) {
  const timing = consumableTiming(item.id);
  assert.ok(timing.cooldownS > 0 && (timing.charges === null || timing.charges >= 1), `${item.id}: a cooldown and charges`);
  if (item.durationS) assert.ok(timing.cooldownS >= item.durationS, `${item.id}: a timed item never overlaps itself`);
}
// Worker-safe: the rules read no game or vehicle module (the rooms Worker reaches the rulesets); 264: the APS arc computes
// on the dependency-free detMath (tools/det-math-lint.mjs: no native transcendental in the authority graph)
const source = readFileSync(new URL('./consumableRules.ts', import.meta.url), 'utf8');
assert.deepEqual([...source.matchAll(/from '([^']+)'/g)].map((m) => m[1]), ['./detMath.ts', './vehicleEras.ts'],
  'imports only detMath and the era table');

// ---- gates
const standard = rulesetConsumableGate(matchRulesetFor('standard'));
const ww2 = { era: 'ww2' }, coldWar = { era: 'cold-war', smoke: true }, modern = { era: 'modern', smoke: true };
assert.equal(consumableLock('fire_suppression', ww2, standard), 'era', 'automatic suppression is postwar');
assert.equal(consumableLock('fire_suppression', coldWar, standard), null);
for (const id of ['aps_charge', 'ir_jammer']) {
  assert.equal(consumableLock(id, coldWar, standard), 'era', `${id}: modern and later only`);
  assert.equal(consumableLock(id, modern, standard), null);
  assert.equal(consumableLock(id, { era: 'next-generation' }, standard), null);
}
assert.equal(consumableLock('smoke_reload', { era: 'modern', smoke: false }, standard), 'smoke', 'needs smoke dischargers');
assert.equal(consumableLock('ammo_restock', modern, rulesetConsumableGate(matchRulesetFor('proving_ground'))), 'finiteAmmo',
  'no restock where rounds are unlimited');
assert.equal(consumableLock('nonsense', modern, standard), 'unknown');
assert.equal(consumableLock('aps_charge', null, standard), null, 'a row with no vehicle named is not gated');
assert.equal(rulesetAllowsConsumable(matchRulesetFor('standard'), 'foliage'), true);
assert.equal(rulesetAllowsConsumable(matchRulesetFor('ac130'), 'repair'), false, 'a mode without consumables refuses all');
const visible = { ...matchRulesetFor('standard'), alwaysVisible: true };
assert.equal(rulesetAllowsConsumable(visible, 'foliage'), false, 'no concealment where every tank is always visible');
assert.equal(rulesetAllowsConsumable({ ...matchRulesetFor('standard'), consumableBan: ['rations'] }, 'rations'), false);

// ---- the loadout
assert.deepEqual(sanitizeConsumableLoadout(null, modern, standard), ['repair', 'first_aid', 'extinguisher']);
assert.deepEqual(sanitizeConsumableLoadout(['aps_charge', 'aps_charge', 'nope'], modern, standard),
  ['aps_charge', 'repair', 'first_aid'], 'repeats and unknowns drop; empty slots fill from the default');
assert.deepEqual(sanitizeConsumableLoadout(['aps_charge', 'rations', 'foliage'], ww2, standard),
  ['repair', 'rations', 'foliage'], 'a refused item gives its slot to the default');
assert.equal(sanitizeConsumableLoadout(['foliage', 'rations', 'track_links'], modern, standard).length, CONSUMABLE_SLOTS);
const roles = ['heavy', 'mbt', 'medium', 'light', 'td', 'ifv'];
for (const role of roles) {
  const loadout = botConsumableLoadout({ ...modern, role }, standard);
  assert.equal(loadout.length, CONSUMABLE_SLOTS, `${role}: a full bot loadout`);
  assert.ok(loadout.every((id) => !consumableLock(id, modern, standard)), `${role}: every pick is legal`);
}
assert.deepEqual(botConsumableLoadout({ era: 'next-generation', role: 'mbt' }, standard),
  ['repair', 'aps_charge', 'fire_suppression'],
  'a next-generation MBT bot carries APS (Afganit, StrikeShield, Trophy)');
assert.deepEqual(botConsumableLoadout({ era: 'modern', role: 'mbt' }, standard), ['repair', 'first_aid', 'fire_suppression'],
  'a modern MBT bot keeps first aid');
assert.deepEqual(botConsumableLoadout({ era: 'cold-war', role: 'mbt' }, standard), ['repair', 'first_aid', 'fire_suppression']);
assert.deepEqual(botConsumableLoadout({ era: 'modern', role: 'heavy' }, standard), ['repair_large', 'aps_charge', 'fire_suppression'],
  'a modern heavy bot carries APS');
assert.equal(botConsumableLoadout({ era: 'cold-war', role: 'heavy' }, standard)[1], 'first_aid', 'no APS before the modern era');
assert.equal(botConsumableLoadout({ era: 'modern', role: 'ifv', smoke: true }, standard)[1], 'ir_jammer');
assert.equal(botConsumableLoadout({ era: 'ww2', role: 'mbt' }, standard)[2], 'extinguisher', 'a WW2 bot keeps the trio');
assert.equal(consumableLock('smoke_reload', { era: 'modern', smoke: false }, standard), 'smoke');
assert.equal(consumableLock('smoke_reload', { era: 'modern' }, standard), null,
  'smoke not known (the boot code keeps the inventory out): the gate waits for the battle, which always knows');
for (const role of roles) {
  const loadout = botConsumableLoadout({ era: 'modern', role, smoke: true }, standard);
  assert.ok(loadout.some((id) => id === 'extinguisher' || id === 'fire_suppression'), `${role}: every bot keeps a fire kit`);
  assert.ok(loadout.some((id) => id.startsWith('repair') || id === 'track_links'), `${role}: and a repair`);
}

// ---- effects through the adapter
function combat() {
  return {
    crew: { driver: true, gunner: false, loader: false },
    fire: { burning: false, ticksLeft: 0, tickTimer: 0 },
    modules: {},
    equipMults: { reload: 0.9, aimTime: 1, repair: 1.25 },
    equip: ['optics'],
    ammo: [10, 4, 0],
    ammoCapacity: [24, 16, 12],
    destroyed: false,
  };
}
function host(timeS, overrides = {}) {
  const events = [];
  return {
    events,
    timeS,
    repairAll: () => overrides.damaged ?? [],
    repair: (names) => (overrides.damaged ?? []).filter((name) => names.includes(name)),
    restock: (fraction) => { events.push(['restock', fraction]); return overrides.restocked ?? 9; },
    smoke: 'smoke' in overrides ? overrides.smoke : { smokeCharges: 1 },
    moduleRepaired: (name) => events.push(['module', name]),
    fireOut: () => events.push(['fireOut']),
    ...overrides.host,
  };
}
const state = (items, c) => createConsumableState(items, consumableTiming, c);

{ // an item with nothing to do is free; a use starts its cooldown and spends a charge
  const c = combat();
  const s = state(['repair', 'repair_large', 'track_links'], c);
  assert.deepEqual(s.charges, [null, 2, 3]);
  assert.equal(useConsumableSlot(s, 0, c, host(10), consumableTiming).reason, 'NOTHING');
  assert.equal(s.readyAt[0], 0, 'a no-op press is free');
  const used = useConsumableSlot(s, 0, c, host(10, { damaged: ['engine', 'trackL'] }), consumableTiming);
  assert.equal(used.ok, true);
  assert.equal(used.readyAt, 45);
  assert.deepEqual(useConsumableSlot(s, 0, c, host(20, { damaged: ['gun'] }), consumableTiming),
    { ok: false, item: 'repair', reason: 'COOLDOWN', remainingS: 25 });
  const links = useConsumableSlot(s, 2, c, host(10, { damaged: ['engine', 'trackR'] }), consumableTiming);
  assert.equal(links.ok, true, 'track links repair a broken track');
  assert.equal(links.charges, 2);
  assert.equal(useConsumableSlot(s, 2, c, host(30, { damaged: ['engine'] }), consumableTiming).reason, 'NOTHING',
    'track links leave other modules alone');
  // the large kit repairs and then speeds self-repair, for its duration
  assert.equal(useConsumableSlot(s, 1, c, host(10, { damaged: ['gun'] }), consumableTiming).ok, true);
  assert.equal(c.equipMults.repair, 1.25 * LARGE_REPAIR_RATE_MULT, 'the equipment rate times the kit');
  tickConsumables(s, c, 69.9, () => 0.9, () => true);
  assert.equal(c.equipMults.repair, 1.25 * LARGE_REPAIR_RATE_MULT);
  tickConsumables(s, c, 70, () => 0.9, () => true);
  assert.equal(c.equipMults.repair, 1.25, 'and back to the equipment rate when it ends');
  // out of charges
  s.charges[1] = 0;
  assert.equal(useConsumableSlot(s, 1, c, host(200, { damaged: ['gun'] }), consumableTiming).reason, 'EMPTY');
}

{ // crew, rations, fire
  const c = combat();
  const s = state(['first_aid', 'rations', 'fire_suppression'], c);
  assert.equal(useConsumableSlot(s, 0, c, host(5), consumableTiming).ok, true);
  assert.deepEqual(c.crew, { driver: true, gunner: true, loader: true });
  assert.equal(useConsumableSlot(s, 1, c, host(5), consumableTiming).ok, true);
  assert.equal(c.equipMults.reload, 0.9 * RATIONS_RELOAD_MULT);
  assert.equal(c.equipMults.aimTime, RATIONS_AIM_MULT);
  assert.equal(consumableActive(s, 'rations', 44.9), true);
  tickConsumables(s, c, 45, () => 0, () => true);
  assert.equal(c.equipMults.reload, 0.9, 'rations end after 40 s');
  // automatic suppression: armed, a fire that starts goes out
  assert.equal(useConsumableSlot(s, 2, c, host(50), consumableTiming).ok, true, 'arming works with no fire');
  c.fire.burning = true; c.fire.ticksLeft = 6;
  assert.equal(suppressNewFire(s, c, 60), true);
  assert.equal(c.fire.burning, false);
  c.fire.burning = true;
  assert.equal(suppressNewFire(s, c, 96), false, 'and only while armed (45 s)');
}

{ // governor override: power while it runs, then a one-in-three engine strain from the caller's rng
  const c = combat();
  const s = state(['governor_override', 'extinguisher', 'smoke_reload'], c);
  assert.equal(c.equipMults.power, 1);
  assert.equal(useConsumableSlot(s, 0, c, host(0), consumableTiming).ok, true);
  assert.equal(c.equipMults.power, GOVERNOR_POWER_MULT);
  let strains = 0;
  assert.equal(tickConsumables(s, c, 10, () => 0.2, () => { strains++; return true; }), true, 'rng under 1/3 strains');
  assert.equal(strains, 1);
  assert.equal(c.equipMults.power, 1);
  s.readyAt[0] = 0;
  useConsumableSlot(s, 0, c, host(100), consumableTiming);
  assert.equal(tickConsumables(s, c, 110, () => 0.5, () => { strains++; return true; }), false, 'rng over 1/3 does not');
  assert.equal(strains, 1);
  // extinguisher and smoke reload
  assert.equal(useConsumableSlot(s, 1, c, host(5), consumableTiming).reason, 'NOTHING');
  c.fire.burning = true;
  const fire = host(5);
  assert.equal(useConsumableSlot(s, 1, c, fire, consumableTiming).ok, true);
  assert.deepEqual(fire.events, [['fireOut']]);
  const smoke = { smokeCharges: SMOKE_SALVO_MAX - 1 };
  assert.equal(useConsumableSlot(s, 2, c, host(5, { smoke }), consumableTiming).ok, true);
  assert.equal(smoke.smokeCharges, SMOKE_SALVO_MAX);
  assert.equal(useConsumableSlot(s, 2, c, host(100, { smoke }), consumableTiming).reason, 'NOTHING', 'a full kit is free');
  assert.equal(useConsumableSlot(s, 2, c, host(200, { smoke: null }), consumableTiming).reason, 'NOTHING');
}

{ // restock, foliage, APS, jammer
  const c = combat();
  const s = state(['ammo_restock', 'foliage', 'aps_charge'], c);
  const restock = host(5);
  assert.equal(useConsumableSlot(s, 0, c, restock, consumableTiming).ok, true);
  assert.deepEqual(restock.events, [['restock', 0.3]]);
  assert.equal(useConsumableSlot(s, 0, c, host(500, { restocked: 0 }), consumableTiming).reason, 'EMPTY', 'one restock a life');
  assert.deepEqual(consumableSpottingIds(s, c.equip, 10), ['optics'], 'foliage off: the equipment alone');
  useConsumableSlot(s, 1, c, host(10), consumableTiming);
  assert.deepEqual(consumableSpottingIds(s, c.equip, 20), ['optics', CONSUMABLE_FOLIAGE_EQUIPMENT]);
  assert.deepEqual(consumableSpottingIds(s, c.equip, 70), ['optics'], 'sixty seconds of foliage');
  // APS: the hull faces +Z (yaw 0); a round travelling -Z comes from the front
  const missile = { guided: true, type: 'HEAT' };
  assert.equal(apsIntercepts(s, 5, missile, 0, 0, -1), false, 'not armed');
  useConsumableSlot(s, 2, c, host(10), consumableTiming);
  assert.equal(apsIntercepts(s, 11, { type: 'APFSDS' }, 0, 0, -1), false, 'a kinetic round passes');
  assert.equal(apsIntercepts(s, 11, missile, 0, 0, 1), false, 'a missile from behind passes');
  const edge = (APS_ARC_DEG / 2 - 1) * Math.PI / 180;
  assert.equal(apsIntercepts(s, 11, missile, 0, -Math.sin(edge), -Math.cos(edge)), true, 'inside the arc: intercepted');
  assert.equal(apsIntercepts(s, 12, missile, 0, 0, -1), false, 'the charge is spent');
  // jammer
  const j = state(['ir_jammer', 'repair', 'first_aid'], combat());
  assert.equal(jammerCovers(j, 1, 0, 0, 1, 1), false, 'off');
  useConsumableSlot(j, 0, combat(), host(1), consumableTiming);
  assert.equal(jammerCovers(j, 2, 0, 0, JAMMER_RADIUS_M - 0.1, 0), true);
  assert.equal(jammerCovers(j, 2, 0, 0, JAMMER_RADIUS_M + 0.1, 0), false, 'a missile steered elsewhere keeps guidance');
  assert.equal(jammerCovers(j, 14, 0, 0, 1, 0), false, 'twelve seconds');
}

// a destroyed tank uses nothing; every catalog item is reachable by id
{
  const c = { ...combat(), destroyed: true };
  const s = state(DEFAULT_CONSUMABLE_LOADOUT, c);
  assert.equal(useConsumableSlot(s, 0, c, host(1, { damaged: ['gun'] }), consumableTiming).ok, false);
  assert.ok(CONSUMABLE_CATALOG.every((item) => CONSUMABLE_BY_ID.get(item.id) === item));
}

console.log(`consumableRules.selftest: ${CONSUMABLE_CATALOG.length} consumables, gates, loadouts, bot picks, effects, cooldowns and charges passed`);
