// Selftest for src/sim/spotting.js — run: node src/sim/spotting.selftest.mjs
// Pure-logic checks: formula/clamps, camo tables, fire bloom decay, bush
// concealment + the 15 m rule, spotted linger, camo-paint bonus, staggering.

import {
  MAX_SPOT_RANGE_M, MIN_SPOT_RANGE_M, SPOT_LINGER_S, CAMO_PAINT_BONUS,
  MAX_BUSH_BONUS, VIEW_RANGE_M, BASE_CAMO,
  OPTICS_VIEW_FACTOR, SIGNAL_RANGE_M, RADIO_DAMAGED_FACTOR,
  SIXTH_SENSE_DELAY_S, SIXTH_SENSE_SHOW_S,
  MUZZLE_FLASH_BLOOM_MIN, MUZZLE_FLASH_BUSH_MAX,
  viewRangeOf, baseCamoOf, fireBloomAt, spotRangeM, combineCamo,
  bushBonusBetween, checkIntervalS, createSpottingSystem,
  effectiveViewRangeM, signalRangeM,
} from './spotting.js';

let passed = 0;
let failed = 0;
function ok(cond, label) {
  if (cond) { passed++; console.log(`  ok  ${label}`); }
  else { failed++; console.error(`FAIL  ${label}`); }
}
function near(a, b, eps, label) { ok(Math.abs(a - b) <= eps, `${label} (${a} ~ ${b})`); }

function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

function tank(id, team, x, z, opts = {}) {
  return {
    id, team,
    spec: opts.spec || { id: opts.specId || 'm4a3e8', class: opts.cls || 'medium', dims: { heightM: 2.7 } },
    state: { pos: { x, y: 0, z }, speed: opts.speed || 0 },
    combat: { destroyed: !!opts.destroyed },
  };
}

// ---------------------------------------------------------------------------
console.log('[1] spotting formula + clamps');
near(spotRangeM(400, 0), 400, 1e-9, 'camo 0 -> full view range');
near(spotRangeM(400, 0.5), 400 - 350 * 0.5, 1e-9, 'camo 0.5 midpoint');
ok(spotRangeM(400, 1) === MIN_SPOT_RANGE_M, 'camo 1 clamps to 50 m');
ok(spotRangeM(600, 0) === MAX_SPOT_RANGE_M, 'view range clamps to max render');
ok(spotRangeM(400, 2) === MIN_SPOT_RANGE_M, 'camo > 1 clamps');

console.log('[2] camo & view tables plausible per class');
for (const id of Object.keys(BASE_CAMO)) {
  const c = BASE_CAMO[id];
  ok(c.moving <= c.still, `${id}: moving camo <= stationary`);
  ok(c.still > 0 && c.still < 0.5, `${id}: stationary camo in (0, 0.5)`);
}
ok(BASE_CAMO.tiger1.still < BASE_CAMO.m4a3e8.still, 'heavy rates below medium');
ok(BASE_CAMO.is2.still < BASE_CAMO.t34_85.still, 'IS-2 below T-34-85');
ok(VIEW_RANGE_M.m1a2 > VIEW_RANGE_M.tiger1, 'modern optics out-spot WW2');
ok(viewRangeOf({ id: 'nope', class: 'heavy' }) === 360, 'class view fallback');
near(baseCamoOf({ id: 'nope', class: 'td' }, false), 0.30, 1e-9, 'class camo fallback');

console.log('[3] fire bloom decays');
ok(fireBloomAt(10, 10) === 1, 'bloom = 1 at the shot');
ok(fireBloomAt(10, 11) < fireBloomAt(10, 10.2), 'bloom decays');
ok(fireBloomAt(10, 20) === 0, 'bloom fully cold after ~10 s');
ok(fireBloomAt(10, 9) === 0, 'no bloom before the shot');
const base = combineCamo({ base: 0.24 });
const fired = combineCamo({ base: 0.24, bloom: 1 });
ok(fired < base * 0.3, 'full bloom strips most own camo');
ok(combineCamo({ base: 0.24, bloom: 1, bush: 0.4 }) >= 0.4, 'bush bonus survives bloom');

console.log('[4] bush bonus geometry');
const bushes = [{ x: 0, z: 100, r: 3, add: 0.35 }];
near(bushBonusBetween(bushes, 0, 0, 0, 200, false), 0.35, 1e-9, 'bush on the LOS counts');
ok(bushBonusBetween(bushes, 50, 0, 50, 200, false) === 0, 'bush off the LOS ignored');
const stack = [
  { x: 0, z: 80, r: 3, add: 0.35 }, { x: 0, z: 120, r: 3, add: 0.35 }, { x: 0, z: 160, r: 3, add: 0.35 },
];
ok(bushBonusBetween(stack, 0, 0, 0, 200, false) === MAX_BUSH_BONUS, 'stacked bushes cap');

console.log('[5] 15 m proximity rule');
const nearBush = [{ x: 0, z: 195, r: 3, add: 0.35 }];  // 5 m from target at z=200
const farBush = [{ x: 0, z: 160, r: 3, add: 0.35 }];   // 40 m from target
ok(bushBonusBetween(nearBush, 0, 0, 0, 200, true) === 0, 'firing: bush <15 m turns transparent');
near(bushBonusBetween(farBush, 0, 0, 0, 200, true), 0.35, 1e-9, 'firing: bush >15 m keeps concealing');
near(bushBonusBetween(nearBush, 0, 0, 0, 200, false), 0.35, 1e-9, 'not firing: near bush conceals');

console.log('[6] system: open ground vs bush');
// spotter tiger1 (vr 370) vs m4a3e8 target (still camo 0.24) at 250 m.
// open: spotRange = 370 - 320*0.24 = 293 > 250 -> spotted
// bush (+0.35): camo 0.59 -> spotRange = 181 < 250 -> hidden
function mkSys(concealers, tanks, extra = {}) {
  return createSpottingSystem({
    getTanks: () => tanks,
    raycast: extra.raycast !== undefined ? extra.raycast : null,
    concealers,
    getCamoBonus: extra.getCamoBonus,
    rng: mulberry32(42),
  });
}
{
  const spotter = tank('e1', 'enemy', 0, 0, { specId: 'tiger1', cls: 'heavy' });
  const target = tank('p1', 'player', 0, 250);
  const sys = mkSys([], [spotter, target]);
  sys.forceCheck(1);
  ok(sys.isSpotted('p1', 'enemy'), 'open ground @250 m: spotted');
  const sys2 = mkSys([{ x: 0, z: 250, r: 3, add: 0.35 }], [spotter, target]);
  sys2.forceCheck(1);
  ok(!sys2.isSpotted('p1', 'enemy'), 'in bush @250 m: NOT spotted');
  // fire from the bush -> bush lights up (15 m rule) + bloom -> spotted
  sys2.notifyFired('p1', 2);
  sys2.forceCheck(2.1);
  ok(sys2.isSpotted('p1', 'enemy'), 'firing from the bush reveals');
}

console.log('[7] paint bonus shifts the margin');
{
  // panther_g still camo 0.20; spotter vr 370 -> spotRange = 306.
  // at 304 m: spotted bare, hidden with +3.5% paint (spotRange 294.8).
  const spotter = tank('e1', 'enemy', 0, 0, { specId: 'tiger1', cls: 'heavy' });
  const target = tank('p1', 'player', 0, 304, { specId: 'panther_g' });
  const bare = mkSys([], [spotter, target]);
  bare.forceCheck(1);
  ok(bare.isSpotted('p1', 'enemy'), 'no paint @304 m: spotted');
  const painted = mkSys([], [spotter, target], { getCamoBonus: () => CAMO_PAINT_BONUS });
  painted.forceCheck(1);
  ok(!painted.isSpotted('p1', 'enemy'), `+${CAMO_PAINT_BONUS} paint @304 m: hidden`);
}

console.log('[8] moving penalty');
{
  // m4a3e8 moving camo 0.18 -> spotRange 312.4; still 0.24 -> 293.
  const spotter = tank('e1', 'enemy', 0, 0, { specId: 'tiger1', cls: 'heavy' });
  const still = tank('p1', 'player', 0, 300);
  const sysA = mkSys([], [spotter, still]);
  sysA.forceCheck(1);
  ok(!sysA.isSpotted('p1', 'enemy'), 'stationary @300 m: hidden');
  const moving = tank('p1', 'player', 0, 300, { speed: 5 });
  const sysB = mkSys([], [spotter, moving]);
  sysB.forceCheck(1);
  ok(sysB.isSpotted('p1', 'enemy'), 'moving @300 m: spotted');
}

console.log('[9] hard cover blocks; proximity spotting floor');
{
  const spotter = tank('e1', 'enemy', 0, 0, { specId: 'tiger1', cls: 'heavy' });
  const target = tank('p1', 'player', 0, 200);
  const wall = mkSys([], [spotter, target], { raycast: () => ({ dist: 100 }) });
  wall.forceCheck(1);
  ok(!wall.isSpotted('p1', 'enemy'), 'blocked raycast: not spotted');
  const close = tank('p1', 'player', 0, 40);
  const prox = mkSys([{ x: 0, z: 40, r: 3, add: 0.35 }], [spotter, close]);
  prox.forceCheck(1);
  ok(prox.isSpotted('p1', 'enemy'), 'inside 50 m: bushes cannot save you');
  // WoT proximity detection works THROUGH hard cover: a tank 40 m away
  // behind a house is still proximity-spotted (no LOS test inside 50 m).
  const proxWall = mkSys([], [spotter, tank('p1', 'player', 0, 40)],
    { raycast: () => ({ dist: 10 }) });
  proxWall.forceCheck(1);
  ok(proxWall.isSpotted('p1', 'enemy'), 'inside 50 m: detected through walls');
  const farWall = mkSys([], [spotter, tank('p2', 'player', 0, 60)],
    { raycast: () => ({ dist: 10 }) });
  farWall.forceCheck(1);
  ok(!farWall.isSpotted('p2', 'enemy'), 'beyond 50 m: walls still block');
}

console.log('[10] linger 5 s');
{
  const spotter = tank('e1', 'enemy', 0, 0, { specId: 'tiger1', cls: 'heavy' });
  const target = tank('p1', 'player', 0, 250);
  const tanks = [spotter, target];
  const sys = mkSys([], tanks);
  sys.forceCheck(1);
  ok(sys.isSpotted('p1', 'enemy'), 'spotted at t=1');
  target.state.pos.z = 2000; // teleport far out of range
  sys.forceCheck(3);
  ok(sys.isSpotted('p1', 'enemy'), 'still spotted at t=3 (linger)');
  sys.forceCheck(1 + SPOT_LINGER_S + 0.2);
  ok(!sys.isSpotted('p1', 'enemy'), 'linger expires after 5 s');
}

console.log('[11] newly-spotted events + team separation');
{
  const spotter = tank('e1', 'enemy', 0, 0, { specId: 'tiger1', cls: 'heavy' });
  const target = tank('p1', 'player', 0, 100);
  const sys = mkSys([], [spotter, target]);
  const evs = sys.forceCheck(1).slice();
  ok(evs.some((e) => e.id === 'p1' && e.team === 'enemy'), 'rising edge event for p1/enemy');
  ok(evs.some((e) => e.id === 'e1' && e.team === 'player'), 'both directions checked');
  const evs2 = sys.forceCheck(1.5);
  ok(evs2.length === 0, 'no duplicate event while continuously spotted');
  ok(!sys.isSpotted('p1', 'player'), 'own team never "spots" its own tank');
}

console.log('[12] checks are staggered, not per-frame');
{
  ok(checkIntervalS(50) === 0.5 && checkIntervalS(200) === 1.0 && checkIntervalS(400) === 2.0,
    'cadence 0.5–2 s by distance');
  const spotter = tank('e1', 'enemy', 0, 0, { specId: 'tiger1', cls: 'heavy' });
  const target = tank('p1', 'player', 0, 200);
  let rays = 0;
  const sys = mkSys([], [spotter, target], { raycast: () => { rays++; return null; } });
  const dt = 1 / 60;
  for (let t = 0; t <= 4; t += dt) sys.update(dt, t);
  // 4 s @1 s cadence, 2 tanks, <=2 rays per LOS -> handful of rays, never 240/frame-pair
  ok(rays > 0 && rays <= 40, `raycast work staggered (${rays} rays over 4 s / 240 frames)`);
}

console.log('[13] destroyed tanks neither spot nor get spotted');
{
  const spotter = tank('e1', 'enemy', 0, 0, { specId: 'tiger1', cls: 'heavy', destroyed: true });
  const target = tank('p1', 'player', 0, 100);
  const sys = mkSys([], [spotter, target]);
  sys.forceCheck(1);
  ok(!sys.isSpotted('p1', 'enemy'), 'dead observers see nothing');
}

console.log('[14] getConcealment snapshot');
{
  const spotter = tank('e1', 'enemy', 0, 0, { specId: 'tiger1', cls: 'heavy' });
  const target = tank('p1', 'player', 0, 250);
  const sys = mkSys([{ x: 0, z: 250, r: 3, add: 0.35 }], [spotter, target]);
  const c1 = { ...sys.getConcealment(target, 1) }; // snapshot object is reused — copy
  ok(c1.inBush && c1.bush > 0 && !c1.moving && !c1.fired, 'in-bush stationary snapshot');
  near(c1.camo, combineCamo({ base: 0.24, bush: 0.35 }), 1e-9, 'snapshot camo matches formula');
  sys.notifyFired('p1', 2);
  const c2 = sys.getConcealment(target, 2.1);
  ok(c2.fired && c2.bush === 0 && c2.camo < c1.camo, 'after firing: bush lit, camo collapsed');
}

console.log('[14b] sixth-sense display gate (getConcealment.spotted)');
{
  // Raw team intel (isSpotted) is instant; the player's own HUD knowledge
  // lights SIXTH_SENSE_DELAY_S later and holds only for the lamp window —
  // the eye must never leak the spot before the lamp (r8 major).
  const spotter = tank('e1', 'enemy', 0, 0, { specId: 'tiger1', cls: 'heavy' });
  const target = tank('p1', 'player', 0, 100);
  const sys = mkSys([], [spotter, target]);
  sys.forceCheck(1);
  ok(sys.isSpotted('p1', 'enemy'), 'raw spot registers instantly (enemies aim on it)');
  ok(!sys.getConcealment(target, 1.2).spotted, 'display state dark 0.2 s after the spot');
  ok(!sys.getConcealment(target, 1 + SIXTH_SENSE_DELAY_S - 0.1).spotted,
    'display state dark just before the fuse burns');
  sys.forceCheck(3.5); // keep the spot fresh through the fuse
  ok(sys.getConcealment(target, 1 + SIXTH_SENSE_DELAY_S + 0.1).spotted,
    'display state lights 3 s after the rising edge');
  // hold the spot alive past the lamp window: knowledge expires like the bulb
  for (let t = 4; t <= 13; t += 1) sys.forceCheck(t);
  ok(sys.isSpotted('p1', 'enemy'), 'still raw-spotted at t=13');
  ok(!sys.getConcealment(target, 1 + SIXTH_SENSE_DELAY_S + SIXTH_SENSE_SHOW_S + 0.5).spotted,
    'display state dies with the lamp window even while still spotted');
}

console.log('[15] armor doc §9: damaged optics halve view range');
{
  // tiger1 vr 370 vs still m4a3e8 (camo 0.24) at 250 m: healthy spotRange
  // 293 m ⇒ spotted; damaged optics vr 185 ⇒ spotRange 152.6 m ⇒ hidden.
  const spotter = tank('e1', 'enemy', 0, 0, { specId: 'tiger1', cls: 'heavy' });
  spotter.combat.modules = { optics: { state: 'yellow' } };
  near(effectiveViewRangeM(spotter), 370 * OPTICS_VIEW_FACTOR, 1e-9, 'yellow optics: −50% view range');
  const target = tank('p1', 'player', 0, 250);
  const sys = mkSys([], [spotter, target]);
  sys.forceCheck(1);
  ok(!sys.isSpotted('p1', 'enemy'), 'damaged optics: 250 m target hidden');
  spotter.combat.modules.optics.state = 'ok';
  near(effectiveViewRangeM(spotter), 370, 1e-9, 'repaired optics restore view range');
  sys.forceCheck(2);
  ok(sys.isSpotted('p1', 'enemy'), 'repaired optics: 250 m target spotted again');
}

console.log('[16] armor doc §9: damaged radio halves intel share range');
{
  // e1 spots p1 at 100 m; teammate e2 sits 350 m behind e1 and cannot spot
  // p1 itself (450 m > 445 max). Healthy radio shares to 600 m; a damaged
  // radio only to 300 m — e2 loses the intel, e1 keeps its own eyes.
  const mkE1 = () => tank('e1', 'enemy', 0, 0, { specId: 'tiger1', cls: 'heavy' });
  const target = () => tank('p1', 'player', 0, 100);
  const e2 = tank('e2', 'enemy', 0, -350, { specId: 'tiger1', cls: 'heavy' });

  const healthy = mkE1();
  near(signalRangeM(healthy), SIGNAL_RANGE_M, 1e-9, 'healthy radio: full signal range');
  const sysH = mkSys([], [healthy, e2, target()]);
  sysH.forceCheck(1);
  ok(sysH.isSpotted('p1', 'enemy'), 'team-wide query unchanged (legacy callers)');
  ok(sysH.isSpotted('p1', 'enemy', e2), 'healthy radio shares to a 350 m teammate');

  const damaged = mkE1();
  damaged.combat.modules = { radio: { state: 'yellow' } };
  near(signalRangeM(damaged), SIGNAL_RANGE_M * RADIO_DAMAGED_FACTOR, 1e-9, 'damaged radio: share range halved');
  const sysD = mkSys([], [damaged, e2, target()]);
  sysD.forceCheck(1);
  ok(sysD.isSpotted('p1', 'enemy'), 'spot itself still registers');
  ok(sysD.isSpotted('p1', 'enemy', damaged), 'the spotter keeps its own eyes');
  ok(!sysD.isSpotted('p1', 'enemy', e2), 'damaged radio: intel does NOT reach the 350 m teammate');

  // A second, healthy-radio co-spotter restores the full share even when the
  // damaged-radio tank passes first (checkTarget prefers the wider signal).
  const damagedFirst = mkE1();
  damagedFirst.combat.modules = { radio: { state: 'yellow' } };
  const e3 = tank('e3', 'enemy', 0, 200, { specId: 'tiger1', cls: 'heavy' }); // 100 m from p1, 550 m from e2
  const sysB = mkSys([], [damagedFirst, e3, e2, target()]);
  sysB.forceCheck(1);
  ok(sysB.isSpotted('p1', 'enemy', e2), 'a healthy-radio co-spotter restores team intel');
}

console.log('[17] muzzle-flash reveal resolves fire intel THROUGH the formula');
{
  // m4a3e8 (still camo 0.24) at 435 m from an m1a2 spotter (vr 445):
  // cold: spotRange 350.2 < 435 -> hidden. Firing bloom-strips own camo to
  // 0.0432 -> spotRange 427.9, STILL < 435 — the formula alone never reveals
  // this shooter, which is exactly where the old ai.js hard bypass lived.
  // The flash branch reveals it (open ground, bloom hot, inside the
  // spotter's view range, LOS clear).
  const spotter = tank('e1', 'enemy', 0, 0, { specId: 'm1a2', cls: 'mbt' });
  const shooter = tank('p1', 'player', 0, 435);
  const open = mkSys([], [spotter, shooter]);
  open.forceCheck(1);
  ok(!open.isSpotted('p1', 'enemy'), 'open @435 m, cold gun: hidden (beyond formula range)');
  open.notifyFired('p1', 2);
  open.forceCheck(2.05);
  ok(open.isSpotted('p1', 'enemy'), 'open @435 m, firing: muzzle flash reveals');

  // r5 WoT-parity clamp: firing only strips camo — the flash must never
  // extend detection past the SPOTTER'S view range. A tiger1 (vr 370) at
  // 400 m does NOT get the reveal an m1a2 (vr 445) gets.
  const spotterVr = tank('e1', 'enemy', 0, 0, { specId: 'tiger1', cls: 'heavy' });
  const pastVr = mkSys([], [spotterVr, tank('p1', 'player', 0, 400)]);
  pastVr.notifyFired('p1', 2);
  pastVr.forceCheck(2.05);
  ok(!pastVr.isSpotted('p1', 'enemy'),
    'flash reveal clamps to the spotter view range (370 m spotter, 400 m shooter)');

  // Deep bush ambush INSIDE view range: a bush 35 m up the line (> 15 m
  // rule radius) keeps concealing while the bloom is hot — the ambush
  // SURVIVES its own shot (bush gate, not the view-range clamp: 350 < 370).
  const spotter2 = tank('e1', 'enemy', 0, 0, { specId: 'tiger1', cls: 'heavy' });
  const ambusher = tank('p1', 'player', 0, 350);
  const bush = mkSys([{ x: 0, z: 315, r: 3, add: 0.35 }], [spotter2, ambusher]);
  bush.notifyFired('p1', 2);
  bush.forceCheck(2.05);
  ok(!bush.isSpotted('p1', 'enemy'), 'bush ambush @350 m survives its own shot');

  // The flash respects hard cover and the 445 m clamp.
  const spotter3 = tank('e1', 'enemy', 0, 0, { specId: 'm1a2', cls: 'mbt' });
  const walled = mkSys([], [spotter3, tank('p1', 'player', 0, 435)],
    { raycast: () => ({ dist: 100 }) });
  walled.notifyFired('p1', 2);
  walled.forceCheck(2.05);
  ok(!walled.isSpotted('p1', 'enemy'), 'flash reveal still blocked by hard cover');
  const spotter4 = tank('e1', 'enemy', 0, 0, { specId: 'm1a2', cls: 'mbt' });
  const far = mkSys([], [spotter4, tank('p1', 'player', 0, MAX_SPOT_RANGE_M + 30)]);
  far.notifyFired('p1', 2);
  far.forceCheck(2.05);
  ok(!far.isSpotted('p1', 'enemy'), 'flash reveal never crosses MAX_SPOT_RANGE_M');

  // The flash window is short: a first check AFTER the bloom cooled past
  // MUZZLE_FLASH_BLOOM_MIN (~1.4 s) no longer benefits from the flash.
  ok(fireBloomAt(0, 1.3) >= MUZZLE_FLASH_BLOOM_MIN &&
     fireBloomAt(0, 2.5) < MUZZLE_FLASH_BLOOM_MIN, 'flash window ~1.4 s');
  const spotter5 = tank('e1', 'enemy', 0, 0, { specId: 'm1a2', cls: 'mbt' });
  const cold = mkSys([], [spotter5, tank('p1', 'player', 0, 435)]);
  cold.notifyFired('p1', 2);
  cold.forceCheck(4.6); // bloom 0.22 — still bloom-hot camo-wise, flash gone
  ok(!cold.isSpotted('p1', 'enemy'), 'flash expired: shooter back to formula-hidden');
  ok(MUZZLE_FLASH_BUSH_MAX > 0.1 && MUZZLE_FLASH_BUSH_MAX <= 0.35,
    'bush-protection threshold sits between canopy soft-conceal and a real bush');
}

console.log('[18] notifyFired pulls the shooter\'s next check in (no cadence wait)');
{
  // At 435 m the check cadence is 2 s. Without the pull-in, a shot fired
  // right after a scheduled check would stay unresolved for up to 2 s; the
  // reveal must land on the very next update() tick. (m1a2 spotter: the
  // shooter sits inside its 445 m view range for the r5-clamped flash.)
  const spotter = tank('e1', 'enemy', 0, 0, { specId: 'm1a2', cls: 'mbt' });
  const shooter = tank('p1', 'player', 0, 435);
  const sys = mkSys([], [spotter, shooter]);
  const dt = 1 / 60;
  for (let t = 0; t <= 1; t += dt) sys.update(dt, t); // settle the stagger
  ok(!sys.isSpotted('p1', 'enemy'), 'pre-shot: hidden at 435 m');
  sys.notifyFired('p1', 1.02);
  const evs = sys.update(dt, 1.03);
  ok(evs.some((e) => e.id === 'p1' && e.team === 'enemy'),
    'reveal lands on the next update tick after the shot');
}

console.log('');
if (failed > 0) {
  console.error(`spotting.selftest: ${failed} FAILED, ${passed} passed`);
  process.exit(1);
}
console.log(`spotting.selftest: all ${passed} checks passed`);
