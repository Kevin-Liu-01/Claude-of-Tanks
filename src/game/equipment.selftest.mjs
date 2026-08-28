/**
 * equipment.selftest.mjs — EQUIPMENT SYSTEM verification (plain node, no DOM).
 * Run: node src/game/equipment.selftest.mjs
 *
 * Covers: catalog integrity (ids, categories, effect vocabulary, spotting
 * table cross-refs), loadout sanitizing (slot cap, dedupe, era gate),
 * multiplier folding, combat-state attachment (module durability scaling),
 * and the LIVE sim hooks it can reach headlessly: reload (damage.js
 * startReload), fire self-extinguish (damage.js tickFire), HE surface-burst
 * splash reduction (damage.js resolveShellHit), aim/traverse debuff folding
 * (movement.ts via updateTank is exercised in the battle probe instead), and
 * the spotting view/camo tables (sim/spotting.js).
 */
import {
  EQUIPMENT_CATALOG, EQUIPMENT_BY_ID, EQUIP_SLOTS, EQUIP_CATEGORIES,
  sanitizeLoadout, computeEquipMults, applyEquipmentToCombat,
  defaultLoadoutFor, AI_DEFAULT_LOADOUTS, equipEligible, equipModifiedStats,
} from './equipment.ts';
import {
  createCombatState, startReload, tickFire, resolveShellHit,
} from '../sim/damage.js';
import { createShell } from '../sim/ballistics.ts';
import {
  EQUIPMENT as SPOT_EQUIP, equipViewMult, equipCamoBonus,
} from '../sim/spotting.js';
import { Vector3 } from 'three';

let failures = 0;
let checks = 0;
function assert(cond, msg) {
  checks++;
  if (!cond) { failures++; console.error(`FAIL: ${msg}`); }
  else console.log(`  ok  ${msg}`);
}
function near(actual, expected, tol, msg) {
  assert(Math.abs(actual - expected) <= tol,
    `${msg} — expected ${expected} ±${tol}, got ${actual}`);
}

// ---------------------------------------------------------------- fixtures --
const V = (x, y, z) => new Vector3(x, y, z);
const ww2Spec = {
  id: 'fixture_ww2', era: 'ww2', role: 'heavy', hp: 1000,
  hullTraverseDegS: 22,
  gun: { caliberMm: 88, reloadS: 6.5, baseAccuracy: 0.34, aimTimeS: 2.4 },
  armor: null,
};
const modernSpec = {
  id: 'fixture_mbt', era: 'modern', role: 'mbt', hp: 2000,
  hullTraverseDegS: 40,
  gun: { caliberMm: 120, reloadS: 6.0, baseAccuracy: 0.30, aimTimeS: 1.8 },
  armor: null,
};
const autoloaderSpec = {
  ...modernSpec,
  id: 'fixture_autoloader',
  gun: {
    ...modernSpec.gun,
    autoloader: { magazineSize: 3, intraClipS: 2.4, fullReloadS: 20 },
  },
};

console.log('[1] catalog integrity');
{
  const ids = new Set();
  const cats = new Set(EQUIP_CATEGORIES.map((c) => c.id));
  const KNOWN_EFFECTS = new Set([
    'reload', 'aimTime', 'bloom', 'traverse', 'turret', 'repair',
    'heSplash', 'crewHe', 'engineFire', 'fireTicks', 'extinguish', 'moduleHp',
  ]);
  assert(EQUIPMENT_CATALOG.length >= 12 && EQUIPMENT_CATALOG.length <= 16,
    `catalog size in the 12-16 mandate window (${EQUIPMENT_CATALOG.length})`);
  for (const it of EQUIPMENT_CATALOG) {
    assert(!ids.has(it.id), `id '${it.id}' unique`);
    ids.add(it.id);
    assert(cats.has(it.cat), `'${it.id}' category '${it.cat}' listed in EQUIP_CATEGORIES`);
    assert(it.era === 'all' || it.era === 'modern', `'${it.id}' era value valid`);
    assert(typeof it.name === 'string' && typeof it.desc === 'string' && it.desc.length > 4,
      `'${it.id}' carries name + effect description`);
    for (const k of Object.keys(it.effects || {})) {
      assert(KNOWN_EFFECTS.has(k), `'${it.id}' effect '${k}' is a wired vocabulary key`);
    }
    if (it.spot) {
      assert(!!SPOT_EQUIP[it.id], `'${it.id}' marked spot ⇒ present in spotting.js EQUIPMENT`);
    }
    const hasSim = Object.keys(it.effects || {}).length > 0;
    assert(hasSim || it.spot, `'${it.id}' has at least one REAL effect (sim or spotting)`);
  }
  // spotting table carries no orphaned ids
  for (const sid of Object.keys(SPOT_EQUIP)) {
    assert(EQUIPMENT_BY_ID.has(sid), `spotting item '${sid}' exists in the catalog`);
  }
}

console.log('[2] loadout sanitizing: slot cap, dedupe, unknown + era gate');
{
  const dirty = ['rammer', 'rammer', 'no_such_item', 'vents', 'optics', 'toolbox'];
  const clean = sanitizeLoadout(dirty);
  assert(clean.length === EQUIP_SLOTS, `clamped to ${EQUIP_SLOTS} slots`);
  assert(clean[0] === 'rammer' && clean[1] === 'vents' && clean[2] === 'optics',
    'order preserved, dupes + unknown ids dropped');
  const gated = sanitizeLoadout(['vstab', 'auto_ext', 'rammer'], ww2Spec);
  assert(gated.length === 1 && gated[0] === 'rammer',
    'modern-only gear (vstab/auto_ext) dropped on a WWII spec');
  const modern = sanitizeLoadout(['vstab', 'auto_ext', 'rammer'], modernSpec);
  assert(modern.length === 3, 'same loadout legal on a modern spec');
  assert(equipEligible('vstab', modernSpec) && !equipEligible('vstab', ww2Spec),
    'equipEligible era gate');
  assert(!equipEligible('rammer', autoloaderSpec),
    'magazine autoloaders cannot mount a gun rammer');
  const autoloader = sanitizeLoadout(['rammer', 'vents', 'vstab', 'optics'], autoloaderSpec);
  assert(autoloader.join(',') === 'vents,vstab,optics',
    'autoloading loadout drops rammer and fills remaining legal slots');
}

console.log('[3] multiplier folding');
{
  const m = computeEquipMults(['rammer', 'vents', 'rotation']);
  near(m.reload, 0.90 * 0.975, 1e-9, 'rammer × vents reload stack');
  near(m.aimTime, 0.975, 1e-9, 'vents aim-time');
  near(m.traverse, 1.10, 1e-9, 'rotation hull traverse');
  near(m.turret, 1.10, 1e-9, 'rotation turret traverse');
  near(m.repair, 1, 1e-9, 'unequipped fields stay 1');
  const s = computeEquipMults(['susp', 'wet_rack', 'fuel_safety']);
  near(s.moduleHp.trackL, 1.5, 1e-9, 'suspension trackL HP');
  near(s.moduleHp.trackR, 1.5, 1e-9, 'suspension trackR HP');
  near(s.moduleHp.ammoRack, 1.5, 1e-9, 'wet rack ammoRack HP');
  near(s.moduleHp.fuelTank, 1.5, 1e-9, 'safety fuel fuelTank HP');
  near(s.engineFire, 0.5, 1e-9, 'safety fuel engine-fire odds');
  const empty = computeEquipMults(null);
  near(empty.reload * empty.aimTime * empty.bloom * empty.heSplash, 1, 1e-9,
    'null loadout ⇒ all-1 record');
}

console.log('[4] combat-state attachment + module durability');
{
  const c = createCombatState(ww2Spec);
  const baseRack = c.modules.ammoRack.maxHp;
  const baseTrack = c.modules.trackL.maxHp;
  const applied = applyEquipmentToCombat(c, ['wet_rack', 'susp', 'vstab'], ww2Spec);
  assert(applied.length === 2 && !applied.includes('vstab'),
    'attachment sanitizes (vstab dropped on WWII)');
  near(c.modules.ammoRack.maxHp, baseRack * 1.5, 1e-9, 'ammo rack maxHp ×1.5');
  near(c.modules.ammoRack.hp, baseRack * 1.5, 1e-9, 'ammo rack hp scaled with it');
  near(c.modules.trackL.maxHp, baseTrack * 1.5, 1e-9, 'track maxHp ×1.5');
  assert(Array.isArray(c.equip) && c.equipMults && typeof c.equipMults.reload === 'number',
    'equip ids + equipMults attached to the combat state');
}

console.log('[5] LIVE hook: reload (damage.js startReload)');
{
  const bare = createCombatState(ww2Spec);
  startReload(bare, ww2Spec);
  near(bare.reload.totalS, 6.5, 1e-9, 'no equipment: spec reload');
  const kitted = createCombatState(ww2Spec);
  applyEquipmentToCombat(kitted, ['rammer'], ww2Spec);
  startReload(kitted, ww2Spec);
  near(kitted.reload.totalS, 6.5 * 0.9, 1e-9, 'rammer: 6.5 → 5.85 s');
  const full = createCombatState(ww2Spec);
  applyEquipmentToCombat(full, ['rammer', 'vents'], ww2Spec);
  startReload(full, ww2Spec);
  near(full.reload.totalS, 6.5 * 0.9 * 0.975, 1e-9, 'rammer + vents stack');
  // stacks with the locked debuffs
  full.crew.loader = false;
  startReload(full, ww2Spec);
  near(full.reload.totalS, 6.5 * 0.9 * 0.975 * 1.5, 1e-9,
    'equipment stacks multiplicatively with the dead-loader ×1.5');
}

console.log('[6] LIVE hook: fire self-extinguish (damage.js tickFire)');
{
  const mkBurning = (ids) => {
    const c = createCombatState(modernSpec);
    if (ids) applyEquipmentToCombat(c, ids, modernSpec);
    c.fire.burning = true;
    c.fire.ticksLeft = 10;
    return { spec: modernSpec, combat: c };
  };
  // roll 0.2: base chance 0.12 ⇒ keeps burning; auto_ext 0.24 ⇒ out.
  const bare = mkBurning(null);
  tickFire(bare, () => 0.2);
  assert(bare.combat.fire.burning === true, 'roll 0.2 vs base 0.12: still burning');
  const kitted = mkBurning(['auto_ext']);
  tickFire(kitted, () => 0.2);
  assert(kitted.combat.fire.burning === false, 'roll 0.2 vs auto_ext 0.24: extinguished');
}

console.log('[7] LIVE hook: HE surface-burst splash (damage.js resolveShellHit)');
{
  const HE = {
    name: 'HE-122', type: 'HE', caliberMm: 122, pen100Mm: 61, pen1000Mm: 61,
    dmg: 450, velocityMps: 770, moduleDmg: 122, tracer: 'HE',
  };
  const plate = {
    name: 'thick_front', verts: [[-1, 0, 2], [1, 0, 2], [1, 2, 2], [-1, 2, 2]],
    physicalMm: 120, keMm: 120, ceMm: 120, kind: 'main', era: null,
    moduleLink: null, gunFollow: false,
  };
  const mkHit = () => [{
    t: 0.4, kind: 'plate', plate, point: V(0, 1, 2), normal: V(0, 0, 1),
    impactAngleDeg: 0,
  }];
  const mkShell = () => {
    const s = createShell(HE, 'attacker_1', true, V(0, 1.5, 10), V(0, 0, -1), 1);
    s.ageS = 100 / HE.velocityMps;
    return s;
  };
  const shoot = (ids) => {
    const spec = { ...modernSpec, id: 'he_target' };
    const combat = createCombatState(spec);
    if (ids) applyEquipmentToCombat(combat, ids, spec);
    const target = { id: 'he_target', spec, state: { pos: V(0, 0, 0) }, combat };
    const ev = resolveShellHit(mkShell(), target, mkHit(), () => 0.5);
    return ev;
  };
  const bare = shoot(null);
  const lined = shoot(['spall_liner']);
  assert(bare.kind === 'he_splash' && lined.kind === 'he_splash',
    `both resolve as surface bursts (${bare.kind}/${lined.kind})`);
  assert(bare.damage > 0, `bare splash does damage (${bare.damage.toFixed(1)})`);
  near(lined.damage, bare.damage * 0.75, 1e-6,
    `spall liner soaks 25% of splash (${bare.damage.toFixed(1)} → ${lined.damage.toFixed(1)})`);
}

console.log('[8] spotting table: view/camo items (sim/spotting.js)');
{
  near(equipViewMult(['optics'], true), 1.10, 1e-9, 'coated optics +10% view, moving');
  near(equipViewMult(['optics', 'binoculars'], false), 1.10 * 1.25, 1e-9,
    'optics × binoculars stack while stationary');
  near(equipViewMult(['binoculars'], true), 1, 1e-9, 'binoculars OFF while moving');
  near(equipCamoBonus(['camo_net'], false), 0.12, 1e-9, 'camo net +0.12 still');
  near(equipCamoBonus(['camo_net'], true), 0, 1e-9, 'camo net OFF while moving');
  near(equipViewMult(['vents'], true), 1.025, 1e-9, 'vents +2.5% view');
}

console.log('[9] AI parity defaults');
{
  for (const [cls, list] of Object.entries(AI_DEFAULT_LOADOUTS)) {
    assert(list.length === EQUIP_SLOTS, `role '${cls}' default fills all ${EQUIP_SLOTS} slots`);
    for (const id of list) assert(EQUIPMENT_BY_ID.has(id), `role '${cls}' id '${id}' exists`);
  }
  const heavyWw2 = defaultLoadoutFor(ww2Spec);
  assert(heavyWw2.length === 3 && heavyWw2.every((id) => equipEligible(id, ww2Spec)),
    `WWII heavy default is era-legal (${heavyWw2.join(', ')})`);
  const mbt = defaultLoadoutFor(modernSpec);
  assert(mbt.includes('vstab'), `modern MBT default fields the stabilizer (${mbt.join(', ')})`);
  const autoMbt = defaultLoadoutFor(autoloaderSpec);
  assert(autoMbt.join(',') === 'vents,vstab,optics',
    `autoloading MBT default replaces rammer (${autoMbt.join(', ')})`);
  const unknown = defaultLoadoutFor({ era: 'ww2', role: 'hovertank' });
  assert(unknown.length === 3, 'unknown role falls back to the medium kit');
}

console.log('[10] garage stat helper');
{
  const st = equipModifiedStats(ww2Spec, ['rammer', 'gld', 'rotation']);
  near(st.reloadS.mod, 6.5 * 0.9, 1e-9, 'modified reload for the card');
  near(st.aimTimeS.mod, 2.4 * 0.9, 1e-9, 'modified aim time for the card');
  near(st.traverseDegS.mod, 22 * 1.1, 1e-9, 'modified hull traverse for the card');
  near(st.reloadS.base, 6.5, 1e-9, 'base kept alongside');
}

if (failures) {
  console.error(`\nequipment.selftest: ${failures}/${checks} checks FAILED`);
  process.exit(1);
}
console.log(`\nequipment.selftest: all ${checks} checks passed`);
