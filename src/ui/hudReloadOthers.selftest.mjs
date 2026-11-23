// reload-others-275. Owner 2026-11-22: "have an option to turn on reload indicators for allies/enemies in settings too".
//
// Other tanks' plates carry a reload strip (Settings › Interface, allies' and enemies' apart, each off by default). It
// reads the same channel the player's own readout counts: the cycle the authority starts (sim/damage
// startPostShotReload), read as the reticle's sweep reads it (hud reloadHudFraction). This receipt holds:
// 1. the read itself: a channel at rest is loaded, a running one is how far through, a dry weapon and no channel show
//    nothing, unlimited rounds never read dry;
// 2. the strip's writes (paintPlateReload): only where the value moves, hidden and loaded by class;
// 3. every loading model through the real simulation on real hulls (a single shell, an autoloader's clip and magazine, a
//    launcher rail beside a refilling cannon, a guided salvo's interval and group, a dead loader's stretched cycle, the
//    last round fired): the plate reads 1 - remaining/total of the selected channel, the reticle's own fraction, and
//    1 on the ready edge;
// 4. a network battle: the authority's entity row (server captureEntityRow) decoded on a client (mp decodeRow) gives the
//    plate the same reading to the wire's 2 ms step; no field was added to the wire for it;
// 5. the Settings rows, the persisted defaults (off), the event the HUD hears and the HUD's wiring.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';
import { getSpec } from '../vehicles/specs.ts';
import { consumeAmmunition, hasAmmunition } from '../sim/ammunition.ts';
import { createCombatState, selectFirstAvailableShell, selectShell, startPostShotReload, tickReload } from '../sim/damage.ts';
import { captureEntityRow, createEraIndexer } from '../../server/match/entityRows.ts';
import { createEntitySample, decodeRow } from '../mp/match/interpolation.ts';
import { paintPlateReload, reloadHudFraction, reloadIndicatorProgress } from './hud.ts';

const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// 1. the read
assert.equal(reloadIndicatorProgress(null), -1, 'no tank: nothing');
assert.equal(reloadIndicatorProgress({}), -1, 'no channel: nothing');
assert.equal(reloadIndicatorProgress({ reload: { t: 0, totalS: 6 }, shellSlot: 0, ammo: [10] }), 1, 'at rest: loaded');
assert.equal(reloadIndicatorProgress({ reload: { t: 0, totalS: 0 }, shellSlot: 0, ammo: [10] }), 1, 'never fired: loaded');
assert.ok(close(reloadIndicatorProgress({ reload: { t: 1.5, totalS: 6 }, shellSlot: 0, ammo: [10] }), 0.75), 'three quarters through');
assert.equal(reloadIndicatorProgress({ reload: { t: 6, totalS: 6 }, shellSlot: 0, ammo: [10] }), 0, 'just fired');
assert.equal(reloadIndicatorProgress({ reload: { t: 2, totalS: 6 }, shellSlot: 1, ammo: [10, 0] }), -1,
  'the selected weapon dry: nothing, as the reticle\'s sweep shows none');
assert.equal(reloadIndicatorProgress({ reload: { t: 0, totalS: 6 }, shellSlot: 0, ammo: [Infinity] }), 1, 'unlimited rounds never dry');
assert.equal(reloadIndicatorProgress({ reload: { t: 9, totalS: 6 }, shellSlot: 0, ammo: [3] }), 0, 'a channel past its total clamps');

// 2. the strip's writes
{
  const classes = new Map();
  const track = { classList: { toggle(name, on) { classes.set(name, on); } } };
  const fill = { style: { transform: '' } };
  let shown = -1;
  shown = paintPlateReload(track, fill, shown, -1);
  assert.deepEqual([shown, classes.size, fill.style.transform], [-1, 0, ''], 'hidden to hidden writes nothing');
  shown = paintPlateReload(track, fill, shown, 0.3333);
  assert.deepEqual([shown, classes.get('off'), classes.has('ld'), fill.style.transform], [0.33, false, false, 'scaleX(0.330)'],
    'loading: shown, in half-percent steps');
  fill.style.transform = 'untouched';
  shown = paintPlateReload(track, fill, shown, 0.334);
  assert.equal(fill.style.transform, 'untouched', 'a move under the half-percent writes nothing');
  shown = paintPlateReload(track, fill, shown, 0.9999);
  assert.deepEqual([shown, classes.has('ld')], [0.995, false], 'a hair short of loaded never reads loaded');
  shown = paintPlateReload(track, fill, shown, 1);
  assert.deepEqual([shown, classes.get('ld'), fill.style.transform], [1, true, 'scaleX(1.000)'], 'loaded: full, in the loaded ink');
  shown = paintPlateReload(track, fill, shown, 0);
  assert.deepEqual([shown, classes.get('ld'), fill.style.transform], [0, false, 'scaleX(0.000)'], 'fired again: empty, the reload ink');
  shown = paintPlateReload(track, fill, shown, -1);
  assert.deepEqual([shown, classes.get('off')], [-1, true], 'dry: hidden, its room kept');
}

// 3. every loading model through the simulation
await ensureAuthorityFleet(['m1a1_abrams_hc', 'm1a3', 'ztz100_prototype']);
const DT = 1 / 60;
const busy = (combat) => combat.reload.t > 0 || (combat.gunReload?.t ?? 0) > 0;
const settle = (combat) => { for (let guard = 0; busy(combat) && guard < 200000; guard++) tickReload(combat, DT); };
function fire(tank) {
  const { combat, spec } = tank;
  settle(combat);
  if (!consumeAmmunition(combat, combat.shellSlot)) return false;
  startPostShotReload(combat, spec);
  if (!hasAmmunition(combat, combat.shellSlot)) selectFirstAvailableShell(combat, spec);
  return true;
}
const tankOf = (id) => { const spec = getSpec(id); return { spec, combat: createCombatState(spec) }; };
/** The plate's read against the reticle's own fraction for the selected channel, and the plate's own arithmetic. */
function agrees(tank, label) {
  const { combat } = tank;
  const progress = reloadIndicatorProgress(combat);
  assert.ok(close(progress, 1 - reloadHudFraction(combat.reload)), `${label}: the reticle's own fraction`);
  if (combat.reload.t > 0.001) assert.ok(close(progress, 1 - combat.reload.t / combat.reload.totalS), `${label}: through the cycle`);
  return progress;
}
/** Tick to the channel's ready edge, holding the plate's read rising all the way and loaded on the edge. */
function loadsThrough(tank, label) {
  let last = agrees(tank, label);
  assert.ok(last < 1, `${label}: counting`);
  for (let guard = 0; guard < 200000; guard++) {
    const ready = tickReload(tank.combat, DT);
    const next = agrees(tank, label);
    assert.ok(next >= last - 1e-9, `${label}: never runs backwards`);
    last = next;
    if (ready) break;
  }
  assert.equal(last, 1, `${label}: loaded on the ready edge`);
}

{
  // a single-shell gun (M1A1: 6 s)
  const gun = tankOf('m1a1_abrams_hc');
  assert.equal(agrees(gun, 'single shell at rest'), 1);
  assert.ok(fire(gun));
  assert.equal(gun.combat.reload.kind, 'shell');
  assert.equal(agrees(gun, 'single shell fired'), 0);
  tickReload(gun.combat, 3 * (gun.combat.equipMults?.reload ?? 1));
  assert.ok(close(agrees(gun, 'single shell half way'), 0.5, 1e-6), 'half way through a 6 s cycle');
  loadsThrough(gun, 'single shell');
  // the loader killed: the cycle the next shot starts is 1.5 times as long, and the plate runs through that cycle
  gun.combat.crew.loader = false;
  assert.ok(fire(gun));
  const stretched = gun.combat.reload.totalS;
  tickReload(gun.combat, stretched / 4);
  assert.ok(close(agrees(gun, 'dead loader'), 0.25, 1e-6), 'a quarter through the stretched cycle');
  loadsThrough(gun, 'dead loader');
  // fired to its last round: the simulation still reloads; the plate shows nothing, as the reticle
  gun.combat.crew.loader = true;
  while (gun.combat.ammo.some((count) => count > 0)) assert.ok(fire(gun));
  assert.ok(gun.combat.reload.t > 0, 'the last round\'s reload still runs');
  assert.equal(reloadIndicatorProgress(gun.combat), -1, 'dry: nothing');
}

{
  // an autoloader (M1A3: 2.5 s between the clip's rounds, 21 s for the magazine)
  const rack = tankOf('m1a3');
  assert.ok(fire(rack));
  assert.equal(rack.combat.reload.kind, 'intraClip');
  loadsThrough(rack, 'between the clip\'s rounds');
  while (rack.combat.magazine.rounds > 1) assert.ok(fire(rack));
  assert.ok(fire(rack));
  assert.equal(rack.combat.reload.kind, 'magazine');
  tickReload(rack.combat, 1);
  const magazine = agrees(rack, 'the magazine refilling');
  assert.ok(magazine > 0 && magazine < 0.1, 'a second into the magazine\'s load');
  // the launcher selected mid-refill: its own rail is loaded, so its plate reads loaded; fired, its 3 s rail counts
  assert.ok(selectShell(rack.combat, 1, rack.spec));
  assert.equal(agrees(rack, 'the launcher selected mid-refill'), 1);
  assert.ok(consumeAmmunition(rack.combat, 1));
  startPostShotReload(rack.combat, rack.spec);
  tickReload(rack.combat, 1);
  assert.ok(agrees(rack, 'the rail') < 1, 'the rail counting');
  // the cannon selected again: its refill is still running, and the plate follows it, not the rail
  assert.ok(selectShell(rack.combat, 0, rack.spec));
  assert.equal(rack.combat.reload.kind, 'magazine');
  assert.ok(agrees(rack, 'the cannon again') > magazine, 'the refill carried on while the rail was selected');
  loadsThrough(rack, 'the magazine');
}

{
  // a guided salvo (ZTZ-100: two missiles 0.35 s apart, a 12 s group reload)
  const salvo = tankOf('ztz100_prototype');
  const guided = salvo.spec.gun.shells.findIndex((shell) => shell.guided === true);
  assert.ok(guided >= 0 && selectShell(salvo.combat, guided, salvo.spec));
  assert.ok(fire(salvo));
  assert.equal(salvo.combat.reload.kind, 'intraClip');
  loadsThrough(salvo, 'the interval to the group\'s next missile');
  assert.ok(fire(salvo));
  assert.ok(salvo.combat.reload.totalS > 10, 'the group spent: its group reload');
  loadsThrough(salvo, 'the group reload');
}

// 4. a network battle: the authority's row, decoded on a client, gives the plate the same reading
{
  const tank = tankOf('m1a3');
  const entity = {
    spec: tank.spec, combat: tank.combat, input: { fire: false },
    state: { pos: { x: 0, y: 0, z: 0 }, speed: 0, verticalSpeed: 0, yaw: 0, visualPitch: 0, visualRoll: 0, turretYaw: 0,
      gunPitch: 0 },
  };
  const era = createEraIndexer();
  const sample = createEntitySample(1);
  // (the client side as mp/presentation updateCombat writes a remote tank: the selected channel, its kind, the slot, ammo)
  const remote = { reload: { t: 0, totalS: 0, kind: 'ready' }, shellSlot: 0, ammo: [0, 0, 0] };
  const receive = () => {
    decodeRow(captureEntityRow(entity, 1, era, 0), sample);
    remote.shellSlot = sample.shellSlot;
    remote.reload.t = sample.reloadS;
    remote.reload.totalS = Math.max(sample.reloadTotalS || 0, sample.reloadS);
    remote.reload.kind = sample.reloadKind;
    remote.ammo[0] = sample.ammo0; remote.ammo[1] = sample.ammo1; remote.ammo[2] = sample.ammo2;
  };
  const STEP = 0.002 / 0.5; // the wire's 2 ms step over the shortest cycle read here
  receive();
  assert.equal(reloadIndicatorProgress(remote), 1, 'a loaded tank reads loaded on the client');
  for (const [label, act] of [
    ['between the clip\'s rounds', () => fire(tank)],
    ['part way between rounds', () => tickReload(tank.combat, 1)],
    ['the magazine', () => { while (tank.combat.magazine.rounds > 0) fire(tank); tickReload(tank.combat, 5); }],
  ]) {
    act();
    receive();
    assert.equal(remote.reload.kind, tank.combat.reload.kind, `${label}: the row carries the cycle's kind`);
    assert.ok(close(reloadIndicatorProgress(remote), reloadIndicatorProgress(tank.combat), STEP),
      `${label}: client ${reloadIndicatorProgress(remote)} against authority ${reloadIndicatorProgress(tank.combat)}`);
  }
  // no wire field was added for the plates: the row's groups are the ones it carried before
  const messages = readFileSync(new URL('../mp/wire/messages.ts', import.meta.url), 'utf8');
  assert.match(messages, /reload: number;\n {2}reloadTotal: number;\n {2}reloadKind: number;/, 'the row\'s reload fields');
  assert.doesNotMatch(messages, /reloadIndicator|allyReload|enemyReload/, 'no plate field on the wire');
}

// 5. the Settings rows, their defaults, the event and the HUD's wiring
{
  const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
  const input = read('../game/input.ts');
  assert.match(input, /showAllyReload: false,\n {2}showEnemyReload: false,/, 'both rows off by default');
  const settings = read('./settings.ts');
  assert.match(settings, /onOffRow\(iface, t\('settings\.interface\.allyReload'\), 'showAllyReload', emitReloadIndicators\);/);
  assert.match(settings, /onOffRow\(iface, t\('settings\.interface\.enemyReload'\), 'showEnemyReload', emitReloadIndicators\);/);
  assert.match(settings, /emit\('ui:reloadIndicators', \{ allyReload: !!s\.showAllyReload, enemyReload: !!s\.showEnemyReload \}\);/);
  const hud = read('./hud.ts');
  assert.match(hud, /on\('ui:reloadIndicators', \(p\) => \{\n {4}setReloadIndicators\(p\?\.allyReload === true, p\?\.enemyReload === true\);/);
  assert.match(hud, /if \(bar\.ally \? allyReloadShown : enemyReloadShown\) \{\n {8}bar\.reloadShown = paintPlateReload\(bar\.reload, bar\.reloadFill, bar\.reloadShown, reloadIndicatorProgress\(t\.combat\)\);/,
    'each side\'s bars paint only while its row is on');
  assert.match(hud, /rangeActive \? -1 : reloadIndicatorProgress\(target\.combat\)/, 'the proving ground\'s lanes show none');
  assert.match(hud, /\.realistic-mode \.cot-hpb \.rl,\.realistic-mode \.cot-tgt \.rl\{display:none!important\}/, 'none in Realistic');
  const en = JSON.parse(read('./i18nCatalog.en-US.json'));
  assert.equal(en['settings.interface.allyReload'], 'Ally reload indicators');
  assert.equal(en['settings.interface.enemyReload'], 'Enemy reload indicators');
  assert.ok(en['settings.interface.reloadNote'].length <= 150);
}

console.log('hudReloadOthers.selftest: other tanks\' reload plates read the authority\'s channel, solo and networked');
