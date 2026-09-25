import { Vector3 } from 'three';
// Register the same complete production specs without executing roster tests.
import '../vehicles/fleetFactory.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createTankState, updateTank, SIM_DT } from '../sim/movement.ts';
import {
  botFriendlyFireRisk, chooseAiSupportActionBits, createAI, mulberry32,
} from './ai.ts';
import { PLAYER_ACTION_BITS } from '../net/protocol.ts';

let failures = 0;
function ok(cond, label) {
  if (cond) console.log(`  ok  ${label}`);
  else { failures++; console.error(`FAIL  ${label}`); }
}

const hf = {
  getHeightAt: () => 0,
  getNormalAt: () => ({ x: 0, y: 1, z: 0 }),
  getGroundType: () => 'firm',
};

function entity(id, specId, team, x, z, yaw = 0) {
  const spec = getSpec(specId);
  const state = createTankState(spec, new Vector3(x, 0, z), yaw);
  return {
    id, specId, spec, team, state,
    combat: {
      hp: 1000, maxHp: 1000, destroyed: false,
      reload: { t: 0, totalS: spec.gun.reloadS, kind: 'ready' }, shellSlot: 0,
      modules: {}, crew: {}, fire: { burning: false, tickTimer: 0, ticksLeft: 0 },
      magazine: null,
    },
    input: {
      throttle: 0, steer: 0, brake: false, fire: false,
      aimPoint: new Vector3(), shellSlot: 0, actionBits: 0,
    },
    aiCtl: null,
  };
}

function controller(bot, enemies, allies, seed = 41, difficulty = 'normal', extraDeps = {}) {
  const ctl = createAI(bot, {
    difficulty,
    rng: mulberry32(seed),
    deps: {
      heightField: hf,
      raycast: () => null,
      getEnemies: () => enemies,
      getAllies: () => allies,
      getObstacles: () => [],
      spotting: { isSpotted: () => true },
      ...extraDeps,
    },
  });
  bot.aiCtl = ctl;
  return ctl;
}

function tick(ctl, bot, seconds, onTick = null) {
  let fired = false;
  let t = 0;
  const steps = Math.ceil(seconds / SIM_DT);
  for (let i = 0; i < steps; i++) {
    t += SIM_DT;
    ctl.update(SIM_DT, t);
    if (bot.input.fire) fired = true;
    if (onTick) onTick(i, t);
    // Exercise the actual gun/turret lay while pinning hull translation so
    // each scenario isolates its decision contract.
    bot.input.throttle = 0;
    bot.input.steer = 0;
    bot.input.brake = false;
    updateTank(bot, hf, SIM_DT);
  }
  return fired;
}

console.log('[1] symmetric friendly-fire geometry');
{
  const shooter = entity('s', 't90m', 'player', 0, 0);
  const ally = entity('a', 'm1a2', 'player', 0, 70);
  const enemy = entity('e', 'm1a2', 'enemy', 0, 150);
  const ap = new Vector3(0, 1.5, 150);
  const apShell = shooter.spec.gun.shells[0];
  const heShell = { ...apShell, type: 'HE', caliberMm: 120 };
  ok(botFriendlyFireRisk(shooter, ap, apShell, [ally, enemy])?.kind === 'corridor',
    'living teammate blocks the direct shell corridor');
  ally.state.pos.x = 18;
  ok(botFriendlyFireRisk(shooter, ap, apShell, [ally, enemy]) === null,
    'teammate outside the corridor permits the shot');
  ally.state.pos.set(7, 0, 150);
  ok(botFriendlyFireRisk(shooter, ap, heShell, [ally, enemy])?.kind === 'blast',
    'HE blast safety protects a teammate beside the target');
  ally.team = 'enemy';
  ok(botFriendlyFireRisk(shooter, ap, apShell, [ally]) === null,
    'opponents are never mistaken for friendlies');
  ally.team = 'player';
  ally.combat.destroyed = true;
  ally.state.pos.set(0, 0, 70);
  ok(botFriendlyFireRisk(shooter, ap, apShell, [ally]) === null,
    'destroyed teammates remain physical cover but do not veto fire');
}

console.log('[2] moving-friendly prediction');
{
  const shooter = entity('s', 't90m', 'enemy', 0, 0);
  const crossing = entity('crossing', 'm1a2', 'enemy', -12, 80, Math.PI / 2);
  crossing.state.speed = 16;
  const slowShell = { ...shooter.spec.gun.shells[0], velocityMps: 100 };
  const risk = botFriendlyFireRisk(shooter, new Vector3(0, 1, 160), slowShell, [crossing]);
  ok(risk?.allyId === 'crossing', 'predicts a teammate crossing before shell arrival');
}

console.log('[3] trigger hold and firing-lane response');
{
  const bot = entity('bot', 't90m', 'player', 0, 0);
  const ally = entity('ally', 'm1a2', 'player', 0, 35);
  const target = entity('target', 'm1a2', 'enemy', 0, 80);
  const ctl = controller(bot, [target], [ally]);
  const firedBlocked = tick(ctl, bot, 3);
  const blocked = ctl.debugInfo();
  ok(!firedBlocked, 'bot never fires through the player-team corridor');
  ok(blocked.friendlyBlockCount >= 1, 'blocked trigger is recorded');
  ok(blocked.friendlyLaneMoves >= 1, 'persistent block schedules a lateral firing lane');
  ally.state.pos.x = 25;
  const firedClear = tick(ctl, bot, 2);
  ok(firedClear, 'bot resumes fire after the friendly clears the lane');
}

console.log('[4] distributed target scoring');
{
  const bot = entity('bot', 't90m', 'player', 0, 0);
  const a = entity('a', 'm1a2', 'enemy', -40, 80);
  const b = entity('b', 'm1a2', 'enemy', 40, 80);
  const wing = entity('wing', 'm1a2', 'player', 20, 0);
  wing.aiCtl = { targetId: 'b' };
  const ctl = controller(bot, [a, b], [wing]);
  tick(ctl, bot, 0.5);
  ok(ctl.targetId === 'a', 'covers an unfocused lane instead of dog-piling one target');
}

console.log('[5] deployment contact discipline');
{
  const bot = entity('bot', 't90m', 'player', 0, 0);
  const distant = entity('distant', 'm1a2', 'enemy', 0, 170);
  const ctl = controller(bot, [distant], []);
  ok(!tick(ctl, bot, 10), 'does not turn a normal deployment sightline into an opening spawn shot');
  distant.state.pos.z = 70;
  ok(tick(ctl, bot, 4), 'responds to a danger-close contact during deployment');
}

console.log('[6] role-aware survival is team invariant');
function survival(team, enemyTeam) {
  const bot = entity(`bot-${team}`, 'm1a2', team, 0, 0);
  bot.combat.hp = 400;
  const support = entity(`support-${team}`, 't90m', team, 0, -80);
  const target = entity(`target-${enemyTeam}`, 't90m', enemyTeam, 0, 80);
  const ctl = controller(bot, [target], [support], 19);
  tick(ctl, bot, 1);
  return ctl.debugInfo();
}

console.log('[7] ally right-of-way and predictive yielding');
{
  const follower = entity('z-follower', 'm1a2', 'player', 0, 0, 0);
  const stopped = entity('a-lead', 't90m', 'player', 0, 12, 0);
  follower.state.speed = 8;
  const ctl = controller(follower, [], [stopped], 73);
  ctl.setWaypoints([[0, 220]], { loop: false });
  ctl.update(SIM_DT, 20);
  const dbg = ctl.debugInfo();
  ok(dbg.allyYielding && dbg.allyAvoidingId === stopped.id,
    'following bot yields to the teammate occupying its lane');
  ok(follower.input.brake && follower.input.throttle === 0,
    'closing-speed guard brakes before physical hull contact');
}
{
  const crossingBot = entity('z-crossing-yield', 'm1a2', 'player', 0, 0, 0);
  const crossingAlly = entity('a-crossing-priority', 'm1a2', 'player', -12, 10, Math.PI / 2);
  crossingBot.state.speed = 7;
  crossingAlly.state.speed = 8;
  const ctl = controller(crossingBot, [], [crossingAlly], 79);
  ctl.setWaypoints([[0, 220]], { loop: false });
  ctl.update(SIM_DT, 20);
  const dbg = ctl.debugInfo();
  ok(dbg.allyYielding && dbg.allyAvoidingId === crossingAlly.id,
    'predicts crossing traffic and assigns one deterministic yielding hull');
  ok(Math.abs(crossingBot.input.steer) >= 0.5 && crossingBot.input.throttle <= 0.32,
    'yield combines an evasive lane with a meaningful speed cap');
}

console.log('[8] humanized fire-control estimate');
{
  const bot = entity('aim-bot', 't90m', 'player', 0, 0);
  const mover = entity('mover', 'm1a2', 'enemy', 0, 120, Math.PI / 2);
  mover.state.speed = 12;
  const ctl = controller(bot, [mover], [], 101);
  tick(ctl, bot, 0.6);
  const first = ctl.debugInfo();
  ok(first.targetTrackLagS >= 0.25 && first.targetTrackLagS <= 0.57,
    'normal bots aim from a delayed target track instead of the live transform');
  ok(Math.abs(first.targetLeadScale - 1) >= 0.01,
    'normal bots estimate mover lead instead of solving it exactly');
  ok(!bot.input.fire,
    'normal reaction window prevents an instant first-sight trigger');
  tick(ctl, bot, 0.5);
  const held = ctl.debugInfo();
  ok(held.targetTrackLagS === first.targetTrackLagS &&
      held.targetLeadScale === first.targetLeadScale,
    'one imperfect estimate persists instead of jittering every frame');
}

console.log('[9] current-feature support actions are team invariant');
function supportActions(team) {
  const bot = entity(`support-${team}`, 'strv103', team, 0, 0);
  bot.consumableReadyAt = [0, 0, 0];
  bot.combat.modules.engine = { hp: 0, maxHp: 100, state: 'red', repairT: 0 };
  bot.combat.crew = { driver: true, gunner: false };
  bot.combat.fire = { burning: true, tickTimer: 0, ticksLeft: 5 };
  bot.specialAction = { kind: 'hydropneumatic_aim', active: false };
  const fire = chooseAiSupportActionBits(bot, 10);
  bot.combat.fire.burning = false;
  const repair = chooseAiSupportActionBits(bot, 10);
  bot.combat.modules.engine.state = 'ok';
  const aid = chooseAiSupportActionBits(bot, 10);
  bot.combat.crew.gunner = true;
  const suspension = chooseAiSupportActionBits(bot, 10, { wantsSuspensionAim: true });
  return [fire, repair, aid, suspension];
}
const alliedSupport = supportActions('player');
const hostileSupport = supportActions('enemy');
ok(JSON.stringify(alliedSupport) === JSON.stringify(hostileSupport),
  'allied and enemy bots choose identical recovery actions from identical state');
ok(JSON.stringify(alliedSupport) === JSON.stringify([
  PLAYER_ACTION_BITS.EXTINGUISHER,
  PLAYER_ACTION_BITS.REPAIR,
  PLAYER_ACTION_BITS.FIRST_AID,
  PLAYER_ACTION_BITS.SPECIAL_ACTION,
]), 'support priorities cover fires, modules, crew and suspension aim');

{
  const loader = entity('loader', 'pl01_105', 'player', 0, 0);
  loader.combat.magazine = { rounds: 2, capacity: 4 };
  loader.combat.gunReload = { t: 0, totalS: 0, kind: 'ready' };
  ok(chooseAiSupportActionBits(loader, 10, { safeToReloadMagazine: true }) ===
    PLAYER_ACTION_BITS.RELOAD_MAGAZINE,
  'autoloaders refill a depleted ready rack while safely out of contact');
  ok(chooseAiSupportActionBits(loader, 10, { safeToReloadMagazine: false }) === 0,
    'autoloaders do not discard a partial magazine during an exposed duel');
}
{
  // Exercise finishStep's retained support context through two real owners,
  // not just the exported policy with hand-written context flags. Keep poses
  // fixed and let 18 ordinary ticks exceed the bounded LOS refresh interval;
  // both contacts are danger-close, so deployment policy cannot hide them.
  const loader = entity('context-loader', 'pl01_105', 'player', 0, 0);
  loader.combat.magazine = { rounds: 2, capacity: 4 };
  loader.combat.gunReload = { t: 0, totalS: 0, kind: 'ready' };
  const loaderTarget = entity('context-loader-target', 'm1a2', 'enemy', 0, 70);
  const loaderEnemies = [];
  const loaderCtl = controller(loader, loaderEnemies, [], 109);
  const suspension = entity('context-suspension', 'strv103', 'enemy', 0, 0);
  suspension.specialAction = { kind: 'hydropneumatic_aim', active: false };
  const suspensionTarget = entity('context-suspension-target', 'm1a2', 'player', 0, 70);
  const suspensionCtl = controller(suspension, [suspensionTarget], [], 113);
  let loaderTime = 0, suspensionTime = 0;
  function advanceLoader() {
    for (let i = 0; i < 18; i++) loaderCtl.update(SIM_DT, loaderTime += SIM_DT);
  }
  function advanceSuspension(steps = 18) {
    for (let i = 0; i < steps; i++) suspensionCtl.update(SIM_DT, suspensionTime += SIM_DT);
  }

  advanceLoader();
  ok(loaderCtl.targetId === null && loader.input.actionBits === PLAYER_ACTION_BITS.RELOAD_MAGAZINE,
    'controller A enables magazine refill without contact');
  advanceSuspension();
  ok(suspensionCtl.targetId === suspensionTarget.id && Math.abs(suspension.input.throttle) < 0.2
      && suspension.input.actionBits === PLAYER_ACTION_BITS.SPECIAL_ACTION,
    'controller B independently requests suspension aim while holding a visible contact');

  loaderEnemies.push(loaderTarget);
  advanceLoader();
  ok(loaderCtl.targetId === loaderTarget.id && loaderCtl.state === 'engage'
      && loader.input.actionBits === 0,
    'controller A refreshes safe-reload true to false after B runs and contact arrives');
  suspension.state.speed = 3;
  advanceSuspension(1);
  ok(suspensionCtl.targetId === suspensionTarget.id && suspension.input.actionBits === 0,
    'controller B refreshes suspension-aim true to false when its own speed rises');

  loaderTarget.combat.destroyed = true;
  advanceLoader();
  ok(loaderCtl.targetId === null && loader.input.actionBits === PLAYER_ACTION_BITS.RELOAD_MAGAZINE,
    'controller A restores safe-reload false to true after its contact is destroyed');
  suspension.state.speed = 0;
  advanceSuspension(1);
  ok(suspensionCtl.targetId === suspensionTarget.id && Math.abs(suspension.input.throttle) < 0.2
      && suspension.input.actionBits === PLAYER_ACTION_BITS.SPECIAL_ACTION,
    'controller B restores suspension aim from its own live state after A runs again');
}
{
  const allied = survival('player', 'enemy');
  const hostile = survival('enemy', 'player');
  ok(allied.fallingBack && hostile.fallingBack,
    'low-health allied and enemy flankers both disengage toward support');
  ok(allied.role === hostile.role && allied.hpFrac === hostile.hpFrac,
    'both teams use the same role and survival thresholds');
}

console.log('[10] bot philosophy r1: target hierarchy objective → closest → weakest');
{
  // an enemy on the mission objective outranks a closer one off it
  const bot = entity('bot', 't90m', 'player', 0, 0);
  const onObjective = entity('onObjective', 'm1a2', 'enemy', 5, 80);
  const near = entity('near', 'm1a2', 'enemy', 20, 35);
  const ctl = controller(bot, [onObjective, near], [], 41, 'normal',
    { getObjective: () => ({ x: 0, z: 80, radiusM: 30 }) });
  tick(ctl, bot, 0.5);
  ok(ctl.targetId === 'onObjective', 'enemies on the mission objective rank first');
  // without an objective the closest enemy leads
  const bot2 = entity('bot2', 't90m', 'player', 0, 0);
  const far2 = entity('far2', 'm1a2', 'enemy', 5, 80);
  const near2 = entity('near2', 'm1a2', 'enemy', 20, 35);
  const ctl2 = controller(bot2, [far2, near2], []);
  tick(ctl2, bot2, 0.5);
  ok(ctl2.targetId === 'near2', 'with no objective the closest enemy leads');
  // inside one distance band the weakest hull leads
  const bot3 = entity('bot3', 't90m', 'player', 0, 0);
  const healthy = entity('healthy', 'm1a2', 'enemy', -6, 70);
  const weak = entity('weak', 'm1a2', 'enemy', 8, 74);
  weak.combat.hp = 220;
  const ctl3 = controller(bot3, [healthy, weak], []);
  tick(ctl3, bot3, 0.5);
  ok(ctl3.targetId === 'weak', 'inside a distance band the weakest hull leads');
}

console.log('[11] bot philosophy r1: no retaliation at an unseen gun');
{
  const bot = entity('bot', 't90m', 'player', 0, 0);
  const sniper = entity('sniper', 'm1a2', 'enemy', 0, 160);
  let sniperSpotted = false;
  const ctl = controller(bot, [sniper], [], 41, 'normal',
    { spotting: { isSpotted: (id) => id !== 'sniper' || sniperSpotted } });
  tick(ctl, bot, 0.3);
  ctl.notifyUnderFire(sniper, { selfHit: true, damaging: true, kind: 'pen' });
  const fired = tick(ctl, bot, 2.5);
  const dbg = ctl.debugInfo();
  ok(ctl.targetId === null, 'a hit from an unspotted gun claims no target');
  ok(!fired, 'the bot does not fire back blindly');
  ok(dbg.suspectId === 'sniper', 'the unseen gun is remembered as a suspect');
  ok(dbg.reactions >= 1 && (dbg.reaction === 'jink' || dbg.reaction === 'cover' || dbg.reaction === null),
    'the struck hull reacts (cover or jink) instead of shooting');
  sniperSpotted = true;
  tick(ctl, bot, 1.5);
  ok(ctl.targetId === 'sniper', 'once the team spots the gun it becomes the target');
}

console.log('[12] bot philosophy r1: a hurt hull backs off with its bow on the shooter');
{
  const bot = entity('bot', 't90m', 'player', 0, 0);
  bot.combat.hp = 300;
  const shooter = entity('shooter', 'm1a2', 'enemy', 0, 120);
  const ctl = controller(bot, [shooter], []);
  tick(ctl, bot, 0.5);
  ctl.notifyUnderFire(shooter, { selfHit: true, damaging: true, kind: 'pen' });
  ctl.update(SIM_DT, 0.6);
  const dbg = ctl.debugInfo();
  ok(dbg.reaction === 'backoff', 'a penetrating hit on a hull under 42 % picks the reverse-to-cover reaction');
  ok(bot.input.throttle < -0.5, 'the hull reverses (bow stays on the shooter) instead of turning away');
  ok(ctl.targetId === 'shooter', 'the spotted shooter stays the target while backing off');
}

console.log('[13] bot philosophy r1: a flank shot re-angles the hull');
{
  const bot = entity('bot', 't90m', 'player', 0, 0);
  const flanker = entity('flanker', 'm1a2', 'enemy', 120, 0);
  const ctl = controller(bot, [flanker], []);
  tick(ctl, bot, 0.5);
  ctl.notifyUnderFire(flanker, { selfHit: true, damaging: false, kind: 'nonpen' });
  ctl.update(SIM_DT, 0.6);
  const dbg = ctl.debugInfo();
  ok(dbg.reaction === 'angle', 'a shooter far off the bow picks the re-angle reaction');
  ok(bot.input.steer > 0.3, 'the hull turns toward the shooter (angled, not square)');
}

if (failures) {
  console.error(`ai.selftest: ${failures} failure(s)`);
  process.exit(1);
}
console.log('[14] round 60: a passive target is pressed to a point-blank side aspect; an active one is not');
{
  // The idle host of server/battlePacing: a hull that never moves and a gun that never fires. The flanker's
  // deployment discipline holds a 220 m contact until 135 s; the target then has to prove passive for 15 s and
  // the bot's shells have to have failed for 15 s more before the press can begin.
  const press = (targetFires) => {
    const bot = entity('press-bot', 'm1a2', 'player', 0, 0);
    const still = entity('still', 't90m', 'enemy', 0, 220, Math.PI); // nose on the bot: a front aspect
    const ctl = controller(bot, [still], [], 77);
    let firstPressThrottle = null; // the strongest drive in the first 3 s of pressing (the pinned fixture hull
    let firstPressScooting = null; // trips the stuck watchdog — round 62's conservation chase closes on the 220 m
    let pressStartS = null;        // contact before the press, so an unstick burst can sit on the press's first tick)
    let nextShotS = 6;
    tick(ctl, bot, 200, (_, t) => {
      if (pressStartS === null || t - pressStartS <= 3) {
        const d = ctl.debugInfo();
        if (d.passivePress) {
          if (pressStartS === null) { pressStartS = t; firstPressScooting = d.scooting; firstPressThrottle = -Infinity; }
          firstPressThrottle = Math.max(firstPressThrottle, bot.input.throttle);
        }
      }
      if (!targetFires) return;
      still.combat.reload.t = Math.max(0, still.combat.reload.t - SIM_DT);
      if (t >= nextShotS) { still.combat.reload.t = still.spec.gun.reloadS; nextShotS = t + 6; }
    });
    return { info: ctl.debugInfo(), firstPressThrottle, firstPressScooting };
  };
  const passive = press(false);
  ok(passive.info.targetPassiveS >= 15, 'a still, silent target reads as passive');
  ok(passive.info.passivePress === true && passive.info.passivePresses >= 1,
    'after the deployment window the bot presses a target it has not penetrated');
  ok(passive.info.passivePressCandidate === 0 || passive.info.passivePressCandidate === 1,
    'the press point is a side aspect, not the glacis');
  ok(passive.firstPressThrottle !== null && passive.firstPressThrottle > 0.25, 'the hull drives at the press point');
  ok(passive.firstPressScooting === false, 'the press begins with no shoot-and-scoot leg in hand');
  const active = press(true);
  ok(active.info.targetPassiveS < 15 && active.info.passivePress === false && active.info.passivePresses === 0,
    'a target that keeps firing is never pressed (no charge at an active player)');
}

console.log('[22] round 67: both side points on water — the press ring falls back to a land-only bearing, not the glacis');
{
  // Tidegate Polders seed 2 under round 62: both side points stood in the polder water and the bot pressed straight
  // in at the glacis. A map that avoids liquid: water everywhere beyond 55 m either side of the target's axis, so the
  // two 75° side points (68 m out) and the 90° / 60° / 105° fallbacks stand in it and the 45° one (50 m out) on land.
  const press = (water) => {
    const bot = entity('press-bot', 'm1a2', 'player', 0, 0);
    const still = entity('still', 't90m', 'enemy', 0, 220, Math.PI);
    const field = water
      ? { ...hf, navigationWaterPolicy: 'avoid-liquid', getWaterMaskAt: (x) => (Math.abs(x) > 55 ? 1 : 0) }
      : hf;
    const ctl = controller(bot, [still], [], 77, 'normal', { heightField: field });
    tick(ctl, bot, 200);
    return { info: ctl.debugInfo(), field };
  };
  const land = press(false);
  ok(land.info.passivePress === true && (land.info.passivePressCandidate === 0 || land.info.passivePressCandidate === 1),
    'with no water the ring takes a side point as before');
  const wet = press(true);
  const candidate = wet.info.passivePressCandidate;
  ok(wet.info.passivePress === true && wet.info.passivePresses >= 1, 'the press still begins beside the water');
  ok(candidate >= 2 && candidate <= 9, `the chosen bearing is a land-only fallback, not a side point or the glacis (candidate ${candidate})`);
  ok(candidate === 8, `the first land bearing in the ring's order is 45° off the nose on the near side (candidate ${candidate})`);
  const px = wet.info.pressPointX, pz = wet.info.pressPointZ;
  ok(Number.isFinite(px) && Number.isFinite(pz), 'the press point is reported while pressing');
  ok(wet.field.getWaterMaskAt(px, pz) === 0 && Math.abs(px) > 40, `the press point stands on land beside the water (x ${px.toFixed(1)})`);
  const bearingFromTarget = Math.atan2(px - 0, pz - 220), offNose = Math.abs(Math.atan2(Math.sin(bearingFromTarget - Math.PI), Math.cos(bearingFromTarget - Math.PI)));
  ok(offNose > 0.6 && offNose < 1.1, `a 45° aspect, not the glacis (${(offNose * 180 / Math.PI).toFixed(0)}° off the nose)`);
}

console.log('[15] round 60: a sniper with a solution on a passive target keeps firing from its spot');
{
  // The receipt's own reload cycle: a shot sets the channel to the spec reload, the fixture decays it.
  const cadence = (targetFires) => {
    const bot = entity('td', 'strv103', 'player', 0, 0);
    const side = entity('side', 'm1a2', 'enemy', 0, 80, Math.PI / 2); // side on, inside the sniper deployment reach
    const ctl = controller(bot, [side], [], 91);
    let shots = 0;
    // The target needs 20 s to prove passive and a scoot leg begun on the last shot before that runs 14 s more,
    // so the cadence and the scoot check start at 36 s and cover the following minute.
    let sawScooting = false;
    let nextEnemyShotS = 5;
    tick(ctl, bot, 96, (_, t) => {
      bot.combat.reload.t = Math.max(0, bot.combat.reload.t - SIM_DT);
      if (bot.input.fire && bot.combat.reload.t <= 1e-3) { bot.combat.reload.t = bot.spec.gun.reloadS; if (t > 36) shots++; }
      if (t > 36 && ctl.debugInfo().scooting) sawScooting = true;
      if (!targetFires) return;
      side.combat.reload.t = Math.max(0, side.combat.reload.t - SIM_DT);
      if (t >= nextEnemyShotS) { side.combat.reload.t = side.spec.gun.reloadS; nextEnemyShotS = t + 8; }
    });
    return { shots, sawScooting, info: ctl.debugInfo() };
  };
  const passive = cadence(false);
  ok(passive.shots >= 8, `at least eight shots in a minute at a passive target (got ${passive.shots})`);
  ok(!passive.sawScooting, 'no scoot leg after any of them once the target has proven passive');
  const active = cadence(true);
  ok(active.sawScooting, 'shoot-and-scoot is kept against a target that shoots back');
}

console.log('[16] round 60: an overturned bot asks for the self-right and holds its drive still');
{
  const bot = entity('roof', 'm1a2', 'player', 0, 0);
  const foe = entity('foe', 't90m', 'enemy', 0, 90, Math.PI);
  const ctl = controller(bot, [foe], [], 5);
  tick(ctl, bot, 1);
  bot.state.overturned = true;
  ctl.update(SIM_DT, 1.1);
  ok((bot.input.actionBits & PLAYER_ACTION_BITS.SELF_RIGHT) !== 0, 'the SELF_RIGHT bit is requested');
  ok(bot.input.throttle === 0 && bot.input.steer === 0, 'no throttle or steer on the roof');
  ok(chooseAiSupportActionBits(bot, 2) === PLAYER_ACTION_BITS.SELF_RIGHT,
    'the support-action chooser answers the roof before any consumable');
  bot.state.overturned = false;
  ctl.update(SIM_DT, 1.2);
  ok((bot.input.actionBits & PLAYER_ACTION_BITS.SELF_RIGHT) === 0, 'righted, the bit is gone');
}

console.log('[17] round 60: the weak-spot probe scores only zones the gun can reach');
{
  // A crest masks everything below 1.4 m at the target plane: the hull zones are out of reach, the turret is not.
  const run = (raycast) => {
    const bot = entity('probe-bot', 'm1a2', 'player', 0, 0);
    const side = entity('side', 't90m', 'enemy', 0, 80, Math.PI / 2); // inside the flanker's deployment reach
    const ctl = controller(bot, [side], [], 33, 'hard', { raycast });
    let sum = 0, n = 0;
    tick(ctl, bot, 4, (_, t) => { if (t > 2) { sum += bot.input.aimPoint.y; n++; } });
    return { aimY: sum / n, info: ctl.debugInfo() };
  };
  const open = run(() => null);
  const crest = run((origin, dir, maxDist) => (origin.y + dir.y * maxDist < 1.4 ? { dist: maxDist * 0.6 } : null));
  const eyeY = getSpec('m1a2').dims.heightM * 0.85;
  const masked = run((origin) => (origin.y < eyeY - 0.05 ? { dist: 40 } : null)); // every gun-height ray; the eye's still clear
  ok(open.info.penGateOk === true, 'an open side reads as penetrable');
  ok(crest.info.penGateOk === true, 'with the hull masked the probe falls back to the visible turret');
  ok(crest.aimY - open.aimY > 0.3, `the aim rises from the hull to the turret (${open.aimY.toFixed(2)} -> ${crest.aimY.toFixed(2)} m)`);
  ok(masked.info.penGateOk === false && masked.info.penRatio === 0,
    'with every zone masked from the gun there is no solution, whatever the eye sees');
}

console.log('[18] round 62: a bot without contact searches on reachable legs and rotates its goal when a leg fails');
{
  // The pacing receipt's survivor: no contact (the spotting gate hides the enemy), the enemy's sector in another
  // connected component of the navigation grid. The planner answers an empty route for the sector and a
  // two-point route for anything else; the pinned fixture hull never arrives, so every leg fails on strikes.
  const search = (withPlanner) => {
    const bot = entity('seeker', 'm1a2', 'player', 0, 0);
    const hidden = entity('hidden', 't90m', 'enemy', 0, 400, Math.PI);
    const plans = [];
    const planRoute = (start, goal) => {
      plans.push([goal.x, goal.z]);
      if (Math.abs(goal.x) < 1 && Math.abs(goal.z - 400) < 1) return []; // the sector: unreachable
      return [[(start.x + goal.x) / 2, (start.z + goal.z) / 2], [goal.x, goal.z]];
    };
    const ctl = controller(bot, [hidden], [], 12, 'normal', {
      spotting: { isSpotted: () => false }, ...(withPlanner ? { planRoute } : {}),
    });
    const legs = [];
    let drove = false;
    tick(ctl, bot, 200, () => {
      const d = ctl.debugInfo();
      if (d.searching && (!legs.length || legs[legs.length - 1].n !== d.searchLegs)) {
        legs.push({ n: d.searchLegs, kind: d.searchKind, x: d.searchGoalX, z: d.searchGoalZ, wps: d.wpCount, t: +d.playerBudgetT });
      }
      if (d.searching && bot.input.throttle > 0.25) drove = true;
    });
    return { legs, plans, drove, info: ctl.debugInfo() };
  };
  const planned = search(true);
  ok(planned.legs.length >= 2, `legs begin and rotate on failure (${planned.legs.length} legs)`);
  ok(planned.plans.some(([x, z]) => Math.abs(x) < 1 && Math.abs(z - 400) < 1), 'the enemy sector is asked of the planner first');
  ok(planned.legs.every((leg) => leg.kind !== 'sector' && leg.kind !== 'direct'),
    `the unreachable sector is never driven at (${planned.legs.map((l) => l.kind).join(',')})`);
  ok(planned.legs.every((leg) => Math.hypot(leg.x, leg.z - 400) > 60),
    'every leg stands on a different goal than the unreachable sector');
  ok(planned.legs.length < 2 || Math.hypot(planned.legs[0].x - planned.legs[1].x, planned.legs[0].z - planned.legs[1].z) > 30,
    'a failed leg is followed by a leg to another goal');
  ok(planned.legs.every((leg) => leg.wps >= 2), 'the legs carry the planned waypoints');
  ok(planned.drove, 'the hull drives the search legs');
  ok(planned.info.searchFailures >= 1, `failed legs escalate the search (${planned.info.searchFailures})`);
  const local = search(false);
  ok(local.legs.length >= 1 && local.legs[0].kind === 'sector',
    'without a planner the first leg is the pre-round-62 sector leg for the local router');
  ok(local.legs.length >= 2 && local.legs[1].kind !== 'sector',
    `and a failed leg still rotates the goal (${local.legs.map((l) => l.kind).join(',')})`);
}

console.log('[19] round 62: no round is fired at a zone the probe rates unpenetrable, HE included');
{
  // A Strv 103 (105 mm APDS / HEAT / HE) on a Leopard 2A7V's glacis at 80 m: nothing penetrates (best ratio
  // 0.56) and an HE round would burst for nothing on that armour — before round 62 the HE fallback fired it
  // anyway. The same gun on the Leopard's rear fires.
  const shots = (targetYaw) => {
    const bot = entity('td', 'strv103', 'player', 0, 0);
    const foe = entity('foe', 'leo2a7v', 'enemy', 0, 80, targetYaw);
    const ctl = controller(bot, [foe], [], 23, 'normal');
    let fired = false;
    let holds = 0;
    tick(ctl, bot, 40, (_, t) => {
      bot.combat.reload.t = Math.max(0, bot.combat.reload.t - SIM_DT);
      if (bot.input.fire && bot.combat.reload.t <= 1e-3) { bot.combat.reload.t = bot.spec.gun.reloadS; fired = true; }
      if (t > 20 && !bot.input.fire && ctl.debugInfo().losClear) holds++;
    });
    return { fired, holds, info: ctl.debugInfo() };
  };
  const front = shots(Math.PI); // nose on the bot
  ok(front.info.penGateOk === false, `the glacis closes the penetration gate (ratio ${front.info.penRatio})`);
  ok(front.info.heWorth === false && front.info.heBurst < 80,
    `the HE round is not worth a shell on that armour (burst ${front.info.heBurst})`);
  ok(front.fired === false, 'no round leaves the gun at the unpenetrable front');
  ok(front.holds > 0, 'the gun held with line of sight clear');
  const rear = shots(0); // nose away: the rear plate
  ok(rear.info.penGateOk === true && rear.fired === true, 'the same gun fires at the rear');
}

console.log('[20] round 62: a lay the rack cannot afford is closed on, not taken');
{
  // At 380 m the normal tier's fire-control error (σ ≈ 6 mrad, 2.3 m) gives an M1A2 under a one-in-five chance
  // of landing on a T-90M's silhouette. At a bot that far the round is held and the hull closes; at a live
  // player the range doctrine is untouched and the gun fires.
  const volley = (isPlayer) => {
    const bot = entity('mbt', 'm1a2', 'player', 0, 0);
    const far = entity('far', 't90m', 'enemy', 0, 380, Math.PI / 2); // side on: penetrable
    far.isPlayer = isPlayer;
    const ctl = controller(bot, [far], [], 45);
    let fired = false;
    let closed = false;
    let sawConserving = false;
    let nextShotS = 140;
    tick(ctl, bot, 190, (_, t) => {
      bot.combat.reload.t = Math.max(0, bot.combat.reload.t - SIM_DT);
      if (bot.input.fire && bot.combat.reload.t <= 1e-3) { bot.combat.reload.t = bot.spec.gun.reloadS; fired = true; }
      const d = ctl.debugInfo();
      if (d.conserving) { sawConserving = true; if (bot.input.throttle > 0.25) closed = true; }
      if (!isPlayer) return;
      // the player keeps shooting (its reload channel cycles), so it never reads as passive
      far.combat.reload.t = Math.max(0, far.combat.reload.t - SIM_DT);
      if (t >= nextShotS) { far.combat.reload.t = far.spec.gun.reloadS; nextShotS = t + 6; }
    });
    return { fired, closed, sawConserving, info: ctl.debugInfo() };
  };
  const bot = volley(false);
  ok(bot.info.hitChance < 0.35, `the expected hit chance at 380 m is low (${bot.info.hitChance})`);
  ok(bot.sawConserving && bot.fired === false, 'the round is held at a bot that far');
  ok(bot.closed, 'the hull closes on the target instead');
  ok(bot.info.conserveHolds > 0, `the holds are counted (${bot.info.conserveHolds})`);
  const player = volley(true);
  ok(player.sawConserving === false && player.fired === true, 'a live player at 380 m is fired on as before');
}

console.log('[21] round 62: an empty rack rams when the ram law allows it and retires when it does not');
{
  const empty = (targetHp, ownHp = 2700) => {
    const bot = entity('dry', 't90m', 'player', 0, 0);
    bot.combat.hp = ownHp; bot.combat.maxHp = 2700;
    bot.combat.ammo = [0, 0, 0]; bot.combat.ammoCapacity = [24, 16, 12];
    const foe = entity('foe', 'm1a2', 'enemy', 0, 60, Math.PI);
    foe.combat.hp = targetHp; foe.combat.maxHp = 2600;
    const ctl = controller(bot, [foe], [], 9);
    let fired = false;
    let maxThrottle = -Infinity;
    let throttleToward = 0; // throttle signed by whether the hull is headed at the foe
    tick(ctl, bot, 12, () => {
      if (bot.input.fire) fired = true;
      const d = ctl.debugInfo();
      if (!d.emptyRack) return;
      maxThrottle = Math.max(maxThrottle, bot.input.throttle);
      const toward = Math.abs(bot.state.yaw) < 0.4; // nose on +z, the foe's bearing
      throttleToward += toward ? bot.input.throttle : -bot.input.throttle;
    });
    return { fired, maxThrottle, throttleToward, info: ctl.debugInfo() };
  };
  const kill = empty(300);
  ok(kill.info.emptyRack === true && kill.fired === false, 'an empty rack never pulls the trigger');
  ok(kill.info.ramming === true && kill.info.ramRuns >= 1, 'a 300 hp hull at 60 m is rammed (one run kills it)');
  ok(kill.maxThrottle >= 0.9 && kill.throttleToward > 0, 'the run is driven at the foe at full throttle');
  const hopeless = empty(2600);
  ok(hopeless.info.emptyRack === true && hopeless.info.ramming === false,
    'a full-health M1A2 would cost more hull than the rammer has: no run');
  ok(hopeless.maxThrottle > 0.25 && hopeless.throttleToward < 0, 'the empty hull retires away from it instead');
  const wounded = empty(300, 600);
  ok(wounded.info.ramming === false, 'a hull that would not survive its own ram does not run');
}

// round 67 (2026-09-24): the failure count is checked at the end too — checks [14]–[22] printed FAIL and still exited 0
if (failures) {
  console.error(`ai.selftest: ${failures} failure(s)`);
  process.exit(1);
}
console.log('ai.selftest: all shared-combat checks passed');
