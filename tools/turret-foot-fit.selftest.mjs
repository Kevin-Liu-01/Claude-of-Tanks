// 279 (turret-foot-seat; Main 2026-11-26): the seat's foot fits (turretSeatRace.ts TURRET_FOOT_FIT). The table holds exactly
// the ruled ids. Each fit id built at high quality keeps its turret clear of its deck at every yaw (the 274 turret-deck
// check). A split adds at most 2 % of the tank's high triangles (docs/references/fleet-geometry-ledger.json, less the split's
// own), leaves no drawn mesh on a buffer it replaced, and every span that followed onto its copy still drives what is drawn:
// each turret ERA zone strips the drawn armour and a reset restores it exactly. Controls: a span planted on a replaced
// position attribute, and a damage owner still holding a replaced geometry, each count as stale (the factory fails such a
// build); with the fit reverted to the whole-face lift, the M46's slots under its lip show again. A low build keeps 'whole'.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import './tank-surface-collect.mjs';
import { OWNER_RULES, ownerSoups, pocketClasses, roofPockets } from './roof-pocket.mjs';
import { betweenBuilds } from './build-loop-yield.mjs';
import { createTank } from '../src/vehicles/tankFactory.ts';
import { combatAnatomyCalibration } from '../src/vehicles/combatAnatomyCalibrationRegistry.ts';
import { measureTurretDeck } from '../src/vehicles/turretDeckAudit.test-support.mjs';
import { TURRET_FOOT_FIT, staleSeatSpans, turretFootFitFor, turretSeatSplitBuilt } from '../src/vehicles/turretSeatRace.ts';

const RULED = {
  m46_patton: 'split', pl01: 'split', pl01_105: 'split', t90a_burlak_proto: 'split', m6_linebacker: 'split', object148_proto: 'split',
  amx40_proto: 'tilt', mbt70: 'tilt', chieftain_mk10: 'tilt', m48_super: 'tilt',
};
assert.deepEqual({ ...TURRET_FOOT_FIT }, RULED, 'TURRET_FOOT_FIT holds exactly the ruled ids');
assert.equal(turretFootFitFor('m46_patton', 'low'), 'whole', 'a low build keeps the whole-face lift for a split id');
assert.equal(turretFootFitFor('mbt70', 'low'), 'tilt', 'a tilt id tilts at low quality too');
assert.equal(turretFootFitFor('t72b3', 'high'), 'whole', 'an id outside the table keeps the whole-face lift');

const ledger = JSON.parse(readFileSync(new URL('../docs/references/fleet-geometry-ledger.json', import.meta.url), 'utf8')).tanks;
const build = (id, opts = {}) => createTank(id, null, { proceduralOnly: true, quality: 'high', geometryReceipt: true, camoSeed: 4242, ...opts });
const turretSlotCm2 = (tank) => {
  const s = ownerSoups(tank).turret;
  const c = pocketClasses(roofPockets(s.tri, { ...OWNER_RULES.turret, body: s.body, glass: s.glass, envelope: s.envelope }).map((p) => ({ owner: 'turret', ...p })));
  return c.turretBaseCm2 + c.turretRaisedCm2;
};
const digest = (object) => {
  const h = createHash('sha256');
  object.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    for (const name of ['position', 'normal', 'color']) {
      const a = o.geometry.getAttribute(name)?.array;
      if (a) h.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
    }
  });
  return h.digest('hex');
};

const report = [];
let zones = 0;
for (const [id, fit] of Object.entries(RULED)) {
  await betweenBuilds(); // the last build is free to go (tools/build-loop-yield.mjs)
  const tank = build(id);
  try {
    const turret = tank.root.getObjectByName('rig_turret');
    const receipt = combatAnatomyCalibration(id)?.turretRing;
    assert.ok(receipt, `${id}: a published ring receipt`);
    const deck = measureTurretDeck(tank.root, receipt);
    assert.deepEqual(deck.deck, [], `${id} (${fit}): turret clear of its deck at every yaw (${JSON.stringify(deck.deck[0])})`);
    const added = turret.userData.turretSeatSplitAdded ?? 0, replaced = turretSeatSplitBuilt.get(turret);
    if (fit === 'tilt') {
      assert.equal(added, 0, `${id}: a tilt adds no triangles`);
      assert.equal(replaced, undefined, `${id}: a tilt replaces no geometry`);
      report.push(`${id} tilt`);
      continue;
    }
    const high = ledger[id]?.high?.triangles;
    assert.ok(high > 0, `${id}: a fleet geometry ledger row`);
    assert.ok(added > 0, `${id}: the split cuts its foot faces`);
    assert.ok(added <= 0.02 * (high - added), `${id}: the split adds ${added} triangles, over 2 % of ${high - added}`);
    assert.ok(replaced?.length > 0, `${id}: the receipt names the geometries the split replaced`);
    const drawn = [];
    tank.root.traverse((o) => { if (o.isMesh && o.geometry) drawn.push(o.geometry.getAttribute('position')); });
    assert.equal(staleSeatSpans(replaced, drawn, () => false), 0, `${id}: no drawn mesh is left on a replaced buffer`);
    assert.equal(staleSeatSpans(replaced, [...drawn, replaced[0].getAttribute('position')], () => false), 1,
      `${id}: control, a span planted on a replaced position attribute is stale`);
    assert.equal(staleSeatSpans(replaced, [], (geometry) => geometry === replaced[0]), 1,
      `${id}: control, a damage owner still holding a replaced geometry is stale`);
    const spans = turret.userData.turretSeatSplitSpans;
    assert.ok(spans, `${id}: the receipt counts the spans that followed onto the split copies`);
    const owners = tank.root.userData.eraClusterOwners ?? {};
    const built = digest(turret);
    for (const zone of Object.keys(owners).filter((name) => owners[name] === 'turret')) {
      assert.equal(tank.stripEra(zone), true, `${id}/${zone}: strips`);
      assert.notEqual(digest(turret), built, `${id}/${zone}: the strip blanks the drawn turret`);
      assert.equal(tank.resetEra(), true, `${id}/${zone}: resets`);
      assert.equal(digest(turret), built, `${id}/${zone}: a reset restores the drawn (split, seated) turret exactly`);
      zones++;
    }
    report.push(`${id} split +${added} (${(100 * added / (high - added)).toFixed(2)} %; spans era ${spans.era}, equipment ${spans.equipment}, weapon ${spans.weapon})`);
  } finally {
    tank.dispose();
  }
}

// No ruled split cuts a mesh a damage span lies on (each row's spans read 0), so the follow is proven on ids split by
// override whose split copies carry each owner's spans: ERA clusters, equipment lids and weapon stock. Each one, damaged,
// changes the drawn turret, and a reset restores it exactly.
const FORCED = [['t72b3_bastion_m', 'era'], ['chieftain_mk9', 'equipment'], ['bmpt_terminator2', 'weapon']];
const forced = [];
for (const [id, owner] of FORCED) {
  await betweenBuilds();
  const tank = build(id, { turretFootFit: 'split' });
  try {
    const turret = tank.root.getObjectByName('rig_turret');
    const spans = turret.userData.turretSeatSplitSpans;
    assert.ok(spans?.[owner] > 0, `${id} split: its copies carry ${owner} spans (${JSON.stringify(spans)})`);
    const rest = digest(turret);
    let damaged = 0;
    if (owner === 'era') {
      const owners = tank.root.userData.eraClusterOwners;
      for (const zone of Object.keys(owners).filter((name) => owners[name] === 'turret')) {
        assert.equal(tank.stripEra(zone), true);
        assert.notEqual(digest(turret), rest, `${id}/${zone}: the strip blanks the drawn split turret`);
        assert.equal(tank.resetEra(), true);
        assert.equal(digest(turret), rest, `${id}/${zone}: a reset restores the drawn split turret exactly`);
        damaged++;
      }
    } else if (owner === 'equipment') {
      for (const at of spans.equipmentAt) {
        assert.equal(tank.applyEquipmentDamage({ kind: 'pen', caliberMm: 120, impactFrame: 'turret', impactLocalPos: at, impactLocalNormal: [0, 1, 0] }), true,
          `${id}: a hit on the lid at ${at.map((v) => v.toFixed(2))} folds it`);
        assert.notEqual(digest(turret), rest, `${id}: the folded lid is drawn on the split turret`);
        tank.resetDestroyed();
        assert.equal(digest(turret), rest, `${id}: a reset restores the drawn split turret exactly`);
        damaged++;
      }
    } else {
      for (const module of spans.weaponModules) {
        tank.setWeaponModuleState(module, 'red');
        assert.notEqual(digest(turret), rest, `${id}/${module}: the red stock is drawn on the split turret`);
        tank.setWeaponModuleState(module, 'ok');
        assert.equal(digest(turret), rest, `${id}/${module}: ok restores the drawn split turret exactly`);
        damaged++;
      }
    }
    assert.ok(damaged > 0, `${id}: damaged at least one ${owner} span`);
    forced.push(`${id} ${owner} ${damaged}`);
  } finally {
    tank.dispose();
  }
}

// the reverted control: the M46 with its fit and with the whole-face lift
await betweenBuilds();
const fitted = build('m46_patton');
const fittedCm2 = turretSlotCm2(fitted);
fitted.dispose();
await betweenBuilds();
const reverted = build('m46_patton', { turretFootFit: 'whole' });
const revertedCm2 = turretSlotCm2(reverted);
assert.equal(reverted.root.getObjectByName('rig_turret').userData.turretSeatSplitAdded ?? 0, 0, 'reverted: no split');
reverted.dispose();
assert.ok(fittedCm2 <= 200, `m46_patton: its split leaves ${fittedCm2} cm2 of slot under the lip`);
assert.ok(revertedCm2 >= 4000, `m46_patton: control, with the whole-face lift the slots show again (${revertedCm2} cm2)`);
await betweenBuilds();
const low = build('m46_patton', { quality: 'low' });
assert.equal(low.root.getObjectByName('rig_turret').userData.turretSeatSplitAdded ?? 0, 0, 'm46_patton low: no split');
low.dispose();

console.log(`turret-foot-fit.selftest: ${report.join('; ')}; ${zones} turret ERA zones strip and reset on split turrets; `
  + `forced splits damage and restore through the copy (${forced.join(', ')}); m46 slot ${fittedCm2} cm2 split vs ${revertedCm2} reverted`);
