// 2026-11-02 audit M7 (review round 1): the bots' news between ticks is applied where the callbacks always ran. The
// controllers queue what reaches them (gunshots heard, shell results, hits, orders: ai.eventOrder.selftest pins the
// declared order); both drivers apply every controller's queue at two declared points (ai.ts applyPendingBotNews): at
// the end of their fire-and-shells phase, before spotting, the mode step and the next step's controllers read
// anything, and before the first controller of a step updates. Reproduced on the lane's previous head (f2924b7eea),
// where each controller applied its own queue only at the top of its own update: a teammate hit between ticks still
// showed no target to the bot that thought first in the next step (refreshFocusCounts read null), and every step that
// reported a hit ended with news waiting, read by spotting, the mode step and the commander's team document in its
// old state (5 v 5 urban pacing trace: a different battle from 50 s on). Pins: [1] after the drivers' flush the
// teammate's answer is live before anyone thinks, and the bot that thinks first reads it; [2] the authority's step and
// [3] the solo step end with no bot holding news, over a fight that delivers shots heard, results and hits.
// Round 2 (U17): ending a step with no news waiting is true of a flush anywhere in the step, after spotting and the mode
// step included, so [2] and [3] did not pin where the news lands. They now also read every bot's queue as the
// spotting update starts (the authority's phase profile clock) and as the solo step enters its spotting and mode
// stages (the frame-stage hook): none may hold news there. A flush moved after spotting fails both.
import { Vector3 } from 'three';
import * as ai from './ai.ts';
import { createBus, createCollider, createGameState, setupBattle, simStep } from './state.ts';
import { spawnTanks } from './rosterState.ts';
import { openWatchSeats } from './watchSeat.ts';
import { FRAME_STAGE, setFrameStageSink } from './frameStages.ts';
import { ensureFullFleet } from '../vehicles/fleetFactory.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createTankState, updateTank, SIM_DT } from '../sim/movement.ts';
import { createAuthoritativeMatch } from '../sim/authoritativeMatch.ts';
import { createDedicatedWorldCollision } from '../../server/dedicatedWorldCollision.ts';

const { createAI, mulberry32 } = ai;
let failures = 0;
const ok = (cond, label) => { if (cond) console.log(`  ok  ${label}`); else { failures++; console.error(`FAIL  ${label}`); } };
// the drivers' flush (the previous head had none: each controller applied its queue in its own update)
const flush = (hulls) => { if (typeof ai.applyPendingBotNews === 'function') ai.applyPendingBotNews(hulls); };
ok(typeof ai.applyPendingBotNews === 'function', 'ai.ts exports the drivers\' flush (applyPendingBotNews)');

const settings = new Map();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true, writable: true,
  value: { getItem: (key) => settings.get(key) ?? null, setItem: (key, value) => settings.set(key, String(value)), removeItem: (key) => settings.delete(key) },
});
await ensureFullFleet();

console.log('[1] a teammate\'s news is live before anyone thinks, and the bot that thinks first reads it');
{
  const field = { getHeightAt: () => 0, getNormalAt: () => ({ x: 0, y: 1, z: 0 }), getGroundType: () => 'firm' };
  const tank = (id, specId, team, x, z, yaw = 0) => {
    const spec = getSpec(specId);
    return { id, specId: spec.id, spec, team, state: createTankState(spec, new Vector3(x, 0, z), yaw),
      combat: { hp: 1000, maxHp: 1000, destroyed: false, reload: { t: 0, totalS: spec.gun.reloadS, kind: 'ready' }, shellSlot: 0,
        modules: {}, crew: {}, fire: { burning: false, tickTimer: 0, ticksLeft: 0 }, magazine: null },
      input: { throttle: 0, steer: 0, brake: false, fire: false, aimPoint: new Vector3(), shellSlot: 0, actionBits: 0 },
      aiCtl: null };
  };
  // the news lands after `lead` ticks: a1 looks for targets on its own cadence (the LOS interval), so some leads put its
  // look on the first tick after the news
  const scene = (lead) => {
    const a = tank('a1', 't90am', 'alpha', 0, 0), b = tank('b2', 't90am', 'alpha', 30, 0);
    const e1 = tank('e1', 'm1a1_abrams_hc', 'bravo', 0, 100, Math.PI), e2 = tank('e2', 'm1a1_abrams_hc', 'bravo', 40, 124, Math.PI);
    const enemies = [e1, e2];
    const spotted = new Set();
    // a1 reads its teammate through a window on b2's controller: every read of b2's target while a1 updates is logged
    const reads = [];
    let aUpdating = false;
    const window = { get targetId() { const id = b.aiCtl.targetId; if (aUpdating) reads.push(id); return id; } };
    const bSeenByA = new Proxy(b, { get: (hull, key) => (key === 'aiCtl' ? window : hull[key]) });
    const make = (entity, allies, seed) => createAI(entity, { difficulty: 'normal', rng: mulberry32(seed), deps: {
      heightField: field, raycast: () => null, getEnemies: () => enemies, getAllies: () => allies, getObstacles: () => [],
      spotting: { isSpotted: (id) => spotted.has(id) },
    } });
    a.aiCtl = make(a, [a, bSeenByA], 11);
    b.aiCtl = make(b, [a, b], 22);
    let t = 100;
    const step = () => {
      flush([a, b]); // the driver's flush before the first controller updates
      t += SIM_DT;
      aUpdating = true; a.aiCtl.update(SIM_DT, t); aUpdating = false;
      b.aiCtl.update(SIM_DT, t);
      updateTank(a, field, SIM_DT, null); updateTank(b, field, SIM_DT, null);
    };
    for (let i = 0; i < lead; i++) step();
    const quiet = a.aiCtl.targetId === null && b.aiCtl.targetId === null;
    // between two steps: both enemies come into view and e1's round strikes b2
    spotted.add('e1'); spotted.add('e2');
    b.aiCtl.notifyUnderFire(e1, { selfHit: true, damaging: true, kind: 'pen' });
    flush([a, b]); // the driver's flush at the end of its fire-and-shells phase
    const answered = b.aiCtl.targetId;
    reads.length = 0;
    step();
    return { quiet, answered, reads: reads.slice() };
  };
  let looked = 0, sawNews = 0, quiet = true, answered = true;
  for (let lead = 30; lead < 50; lead++) {
    const result = scene(lead);
    quiet &&= result.quiet;
    answered &&= result.answered === 'e1';
    if (!result.reads.length) continue;
    looked++;
    if (result.reads[0] === 'e1') sawNews++;
  }
  ok(quiet, 'no target before the enemy shows');
  ok(answered, 'after the flush b2 has answered its attacker before anyone thinks (b2 on e1)');
  ok(looked > 0 && sawNews === looked,
    `a1, thinking first on the next tick, reads b2 on e1 (${sawNews} of the ${looked} leads where a1 looked that tick)`);
}

/** A fight close enough to trade rounds in a few seconds. */
function countNews(hulls) {
  const news = { fired: 0, result: 0, underFire: 0 };
  for (const hull of hulls) {
    const ctl = hull.aiCtl;
    if (!ctl) continue;
    for (const [name, key] of [['notifyEnemyFired', 'fired'], ['notifyShellResult', 'result'], ['notifyUnderFire', 'underFire']]) {
      const original = ctl[name];
      if (typeof original !== 'function') continue;
      ctl[name] = (...args) => { news[key]++; return original.apply(ctl, args); };
    }
  }
  return news;
}
const waiting = (hulls) => hulls.filter((hull) => hull.aiCtl && hull.aiCtl.debugInfo().pendingEvents > 0).map((hull) => hull.id);

console.log('[2] the authority\'s step ends with no bot holding news, and none holds any when the spotting reads the field');
{
  // the bench's phase profile: its clock is read as the visibility update starts (and as it ends), after the flush point
  let entities = null, spottingReads = 0, heldAtSpotting = 0, firstAtSpotting = '';
  const profile = { spottingMs: 0, clock: () => {
    if (entities) {
      spottingReads++;
      const ids = waiting(entities);
      if (ids.length && !heldAtSpotting++) firstAtSpotting = ids.join(',');
    }
    return 0;
  } };
  const match = createAuthoritativeMatch({
    mapId: 'verdant', seed: 123, countdownS: 0, profile,
    players: [
      { id: 'a1', specId: 'm1a1_abrams_hc', team: 'alpha', bot: true, spawn: { x: 0, z: 0, yaw: 0 } },
      { id: 'a2', specId: 't90am', team: 'alpha', bot: true, spawn: { x: 24, z: 0, yaw: 0 } },
      { id: 'b1', specId: 't90am', team: 'bravo', bot: true, spawn: { x: 6, z: 110, yaw: Math.PI } },
      { id: 'b2', specId: 'm1a1_abrams_hc', team: 'bravo', bot: true, spawn: { x: 30, z: 110, yaw: Math.PI } },
    ],
  });
  match.onMatchReady();
  entities = match.entities;
  const news = countNews(match.entities);
  const inputs = new Map();
  let stepsWithNews = 0, held = 0, firstHeld = '';
  for (let tick = 0; tick < 1200 && !(news.underFire >= 2 && stepsWithNews >= 4); tick++) {
    const before = news.fired + news.result + news.underFire;
    match.step({ dt: SIM_DT, inputs });
    if (news.fired + news.result + news.underFire > before) stepsWithNews++;
    const ids = waiting(match.entities);
    if (ids.length && !held++) firstHeld = `${match.timeS.toFixed(2)} s: ${ids.join(',')}`;
  }
  ok(news.fired > 0 && news.result > 0 && news.underFire > 0,
    `the fight delivered news (heard ${news.fired}, results ${news.result}, under fire ${news.underFire}; ${stepsWithNews} steps)`);
  ok(held === 0, `no step ended with news waiting (${held} did${firstHeld ? `, first at ${firstHeld}` : ''})`);
  ok(spottingReads > 0 && heldAtSpotting === 0,
    `no bot held news as the spotting read the field (${heldAtSpotting} of ${spottingReads} reads${firstAtSpotting ? `, first ${firstAtSpotting}` : ''})`);
}

console.log('[3] the solo step ends with no bot holding news, and none holds any at its spotting and mode stages');
{
  const MAP = 'steppe';
  const field = createDedicatedWorldCollision(MAP);
  const authored = field.heightField._layout.spawns;
  const spawnAt = (p) => ({ pos: [p.x, field.heightField.getHeightAt(p.x, p.z), p.z], yaw: p.yaw ?? 0 });
  field.spawnPoints = { player: spawnAt(authored.player), enemies: authored.enemies.map(spawnAt) };
  const visual = (entity) => ({ root: {}, setVisible() {}, syncFromState() {}, dispose() {}, resetDestroyed() {}, setDestroyed() {}, recoilKick() {},
    gunMuzzleWorld: (out) => out.set(entity.state.pos.x, entity.state.pos.y + 2.4, entity.state.pos.z),
    gunDirWorld: (out) => {
      const yaw = entity.state.yaw + entity.state.turretYaw, pitch = entity.state.gunPitch ?? 0;
      return out.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    } });
  const game = createGameState({ rosterSeed: 11 });
  game.mapId = MAP;
  spawnTanks(game, { scene: { remove() {} } });
  for (const entity of game.allTanks) entity.visual = visual(entity);
  const bus = createBus(() => {});
  // a watched battle: every hull a bot's (the human seat's brain takes it when the battle opens)
  setupBattle(game, 'm1a1_abrams_hc', field, { gameMode: 'standard', watch: true, random: true, arrangement: null, brain: null,
    deferVisuals: true, deferCamoRepaint: true, deferOpeningRoutes: false });
  openWatchSeats(game);
  const collider = createCollider(game, field);
  // the two sides face each other across 120 m of the map's own ground
  const centre = authored.player;
  const sides = { player: [], enemy: [] };
  for (const entity of game.tanks) (sides[entity.team] ?? []).push(entity);
  for (const [team, z, yaw] of [['player', -60, 0], ['enemy', 60, Math.PI]]) {
    sides[team].forEach((entity, i) => {
      const x = centre.x + (i - (sides[team].length - 1) / 2) * 22, pz = centre.z + z;
      entity.state.pos.set(x, field.heightField.getHeightAt(x, pz), pz);
      entity.state.yaw = yaw;
      entity.state.speed = 0;
    });
  }
  const news = countNews(game.tanks);
  let stepsWithNews = 0, held = 0, firstHeld = '';
  // the step's stage marks (game/frameStages.ts): the spotting and the mode stage read every bot's queue as they begin
  const staged = { spotting: 0, mode: 0 }, heldAtStage = { spotting: 0, mode: 0 };
  let firstAtStage = '';
  setFrameStageSink({ begin() {}, end() {}, stage(stage) {
    const name = stage === FRAME_STAGE.spotting ? 'spotting' : stage === FRAME_STAGE.mode ? 'mode' : null;
    if (!name) return;
    staged[name]++;
    const ids = waiting(game.tanks);
    if (ids.length && !heldAtStage[name]++ && !firstAtStage) firstAtStage = `${name} at ${game.timeS.toFixed(2)} s: ${ids.join(',')}`;
  } });
  try {
    for (let tick = 0; tick < 1200 && !(news.underFire >= 2 && stepsWithNews >= 4); tick++) {
      const before = news.fired + news.result + news.underFire;
      simStep(game, bus, field, null, collider);
      if (news.fired + news.result + news.underFire > before) stepsWithNews++;
      const ids = waiting(game.tanks);
      if (ids.length && !held++) firstHeld = `${game.timeS.toFixed(2)} s: ${ids.join(',')}`;
    }
  } finally {
    setFrameStageSink(null);
  }
  ok(game.tanks.every((entity) => entity.aiCtl) && sides.player.length > 0 && sides.enemy.length > 0,
    `every hull is a bot's (${sides.player.length} v ${sides.enemy.length})`);
  ok(news.fired > 0 && news.result > 0 && news.underFire > 0,
    `the fight delivered news (heard ${news.fired}, results ${news.result}, under fire ${news.underFire}; ${stepsWithNews} steps)`);
  ok(held === 0, `no step ended with news waiting (${held} did${firstHeld ? `, first at ${firstHeld}` : ''})`);
  ok(staged.spotting > 0 && staged.mode > 0 && heldAtStage.spotting === 0 && heldAtStage.mode === 0,
    `no bot held news as the spotting (${heldAtStage.spotting} of ${staged.spotting}) or the mode step `
    + `(${heldAtStage.mode} of ${staged.mode}) began${firstAtStage ? `; first ${firstAtStage}` : ''}`);
}

if (failures) { console.error(`ai.newsFlush.selftest: ${failures} failure(s)`); process.exit(1); }
console.log('ai.newsFlush.selftest: both drivers apply the bots\' news at their declared flush points; teammates read it');
