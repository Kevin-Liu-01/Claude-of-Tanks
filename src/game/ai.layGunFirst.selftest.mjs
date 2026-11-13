// A bot with a shot open lays its gun first (268 Main item 11, judged on standard battles). A hull turning at its own rate
// takes its turret's whole traverse: an M46 swinging onto its route held an open shot at 104 m for 4 s, 32-36 degrees
// off, and on standard seeds 1-16 the hull's turn held off 7.0 % of the bots' clear-shot samples. While a bot's shot is
// open (its target in sight and range, its gun loaded, not yet laid) and no scoot, fallback or kite owns its hull, its
// steer is held to LAY_FIRST_TURN_SHARE of its turret's traverse over its hull's, so the turret closes on the target.
// [1] The scene: an M46 bound for a point due east (a hard turn off its heading) with a visible enemy 100 m off its
// left bow.
//
// Round 8 Y2 (s2-04): the clamp is its own declared layer ('layFirst', after 'finish' in AI_DRIVE_LAYERS), and a tick
// whose turn a recovery wrote (AI_RECOVERY_TURNS) keeps it whole. The clamp cut the low-speed watchdog's contact release
// (steer +-1) and the terrain escape's turn to the share (0.45 on an M46), so an engaged bot pressed into a solid or
// turning off a drop swung at half rate. Each case reveals the enemy (behind the hull's quarter) when its recovery
// starts, so the recovery runs with the shot open and unlaid. [2] The contact release: the M46's right bow corner
// presses a post (a wall that stops the hull: a step deeper into it is undone), its route 11 m on. [3] The terrain
// escape: the M46 drives at a 40 m drop 14 m ahead. [4] The ally swerve and escape: an M46 nose to nose with a parked
// ally it must yield to swerves off it, then reverses out of the deadlock; the enemy shows at the first emergency stop,
// so the swerve, the reverse's first tick (its own claim site) and its held ticks all run with the shot open. debugInfo
// ().recoveryTurn names the recovery that owns the tick's turn and layFirstClamped says the clamp cut it.
// Fix-up r1 (both review lenses: four claim sites had no driven case): [5] a committed passing path round a stopped ally
// writes no swerve, so its pivot is the drive's turn and the clamp holds it (the swerve's claim sits after that return);
// [3b] a rolling escape (doctrine rollingEscapes) keeps the turn its roll limit leaves (the claim follows that limit);
// [6] a rushing hunter (the Horde's zombie doctrine) pressed within RUSH_DRIVE.backOffGapM of a stopped enemy hull backs
// off it at full turn, the back-off branch's tick and the held ticks after it (both 'hullBackOff' claim sites); [7] the
// no-ram lane's turn off a hull after a terrain escape's claim (its swerve and brake bands, no back-off) is the drive's,
// so the clamp cuts it as before round 8 (the correctness review's minor: the escape's claim outlived that write). The
// turret starts aft in [6] and [7], so the gun stays unlaid on the near hull. Every check runs and is reported; any
// failure exits 1. [2] also reads the hull as overturned for three ticks of its release: the overturned hold zeroes the
// turn after the unstick's claim, and the decision keeps a claim only while the steer is still its recovery's.
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import '../vehicles/fleetFactory.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createTankState, updateTank, SIM_DT } from '../sim/movement.ts';
import { CLASSIC_BOT_DOCTRINE, JOCKEY_DRIVE, RUSH_DRIVE, matchRulesetFor, rulesetBotDoctrine } from '../sim/matchRuleset.ts';
import { createAI, mulberry32 } from './ai.ts';

let failures = 0;
const ok = (cond, label) => { if (cond) console.log(`  ok  ${label}`); else { failures++; console.error(`FAIL  ${label}`); } };
const share = Number(/const LAY_FIRST_TURN_SHARE = ([\d.]+);/.exec(readFileSync(new URL('./ai.ts', import.meta.url), 'utf8'))?.[1]);
const flat = { getHeightAt: () => 0, getNormalAt: () => ({ x: 0, y: 1, z: 0 }), getGroundType: () => 'firm' };
function tank(id, specId, team, x, z, yaw) {
  const spec = getSpec(specId);
  return { id, specId: spec.id, spec, team, state: createTankState(spec, new Vector3(x, 0, z), yaw),
    combat: { hp: spec.hp, maxHp: spec.hp, destroyed: false, reload: { t: 0, totalS: spec.gun.reloadS, kind: 'ready' }, shellSlot: 0,
      modules: {}, crew: {}, fire: { burning: false, tickTimer: 0, ticksLeft: 0 }, magazine: null },
    input: { throttle: 0, steer: 0, brake: false, fire: false, aimPoint: new Vector3(), shellSlot: 0, actionBits: 0 } };
}
/** The clamp's gate: the shot is open, the gun not yet laid, and no scoot, kite or fallback owns the hull. */
const openUnlaid = (info, enemy) => info.targetId === enemy.id && info.losClear && info.reloadReady && info.rangeOk
  && !info.alignOk && !info.scooting && !info.kiting && !info.fallingBack;
const probe = tank('probe', 'm46_patton', 'alpha', 0, 0, 0);
const cap = share * probe.spec.turretTraverseDegS / probe.spec.hullTraverseDegS;
const fix = (n) => (Number.isFinite(n) ? n.toFixed(2) : 'n/a');
console.log('[0] the fixture');
ok(share > 0 && share < 1, `the controller holds the hull to a share of the turret's traverse (${share})`);
ok(cap < 1, `the M46's turret traverse (${probe.spec.turretTraverseDegS}) is under twice its hull's (${probe.spec.hullTraverseDegS}): `
  + `the cap binds (${cap.toFixed(2)})`);

console.log('[1] a bot on its route with a shot open turns within the share');
{
  const bot = tank('bot', 'm46_patton', 'alpha', 0, 0, 0), enemy = tank('enemy', 'm46_patton', 'bravo', -60, 80, Math.PI);
  const ctl = createAI(bot, { difficulty: 'normal', rng: mulberry32(3), doctrine: () => CLASSIC_BOT_DOCTRINE, deps: {
    heightField: flat, raycast: () => null, getEnemies: () => [enemy], getAllies: () => [], getObstacles: () => [],
    spotting: { isSpotted: () => true } } });
  ctl.setWaypoints([[160, 0]], { loop: false });
  let open = 0, over = 0, maxSteer = 0, laidAt = null, clamped = 0, recovery = 0;
  for (let i = 0; i < 12 / SIM_DT; i++) {
    const t = 60 + i * SIM_DT; // past the opening's deployment window (its short engagement range)
    ctl.update(SIM_DT, t);
    const info = ctl.debugInfo();
    if (laidAt === null && info.targetId === enemy.id && info.alignOk) laidAt = t - 60;
    if (info.recoveryTurn !== null) recovery++;
    if (openUnlaid(info, enemy)) {
      open++;
      maxSteer = Math.max(maxSteer, Math.abs(bot.input.steer));
      if (Math.abs(bot.input.steer) > cap + 1e-9) over++;
      if (info.layFirstClamped === true) clamped++;
    }
    updateTank(bot, flat, SIM_DT, null);
  }
  console.log(`  M46 with a shot open: ${open} ticks unlaid, steer at most ${maxSteer.toFixed(2)} (cap ${cap.toFixed(2)}), ${over} over `
    + `the cap, ${clamped} cut by the clamp; laid at ${laidAt?.toFixed(2) ?? 'never'} s`);
  ok(open > 0, 'the case is built: the shot opens before the gun is laid');
  ok(over === 0, 'while the shot is open and unlaid the hull turns within the cap');
  ok(laidAt !== null && laidAt < 6, `the gun is laid (${laidAt?.toFixed(2) ?? 'never'} s)`);
  ok(recovery === 0, `no recovery owns a turn on the open route (${recovery} ticks)`);
  ok(clamped > 0, `debugInfo().layFirstClamped charges the route's held turn to the clamp (${clamped} ticks)`);
}

console.log('[2] the contact release keeps its full turn');
{
  const bot = tank('bot', 'm46_patton', 'alpha', 0, 0, 0), enemy = tank('enemy', 'm46_patton', 'bravo', -50, -60, Math.PI);
  // a post at the right bow corner (the hull's corner stands at x 1.76, z 3.17), short of the route's look-ahead
  const POST = { kind: 'building', min: [1.4, 0, 3.0], max: [2.4, 4, 3.6] };
  const hl = bot.spec.dims.hullLengthM / 2, hw = bot.spec.dims.widthM / 2;
  const pressedPoints = (x, z, yaw) => {
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    let n = 0;
    for (let a = -1; a <= 1; a += 0.5) for (let b = -1; b <= 1; b += 0.5) {
      const px = x + fx * a * hl + fz * b * hw, pz = z + fz * a * hl - fx * b * hw;
      if (px >= POST.min[0] && px <= POST.max[0] && pz >= POST.min[2] && pz <= POST.max[2]) n++;
    }
    return n;
  };
  let revealed = false;
  const ctl = createAI(bot, { difficulty: 'normal', rng: mulberry32(3), doctrine: () => CLASSIC_BOT_DOCTRINE, deps: {
    heightField: flat, raycast: () => null, getEnemies: () => (revealed ? [enemy] : []), getAllies: () => [],
    getObstacles: () => [POST], spotting: { isSpotted: () => revealed } } });
  ctl.setWaypoints([[0, 11]], { loop: false });
  let releaseTicks = 0, openRelease = 0, full = 0, kept = 0, minSteer = Infinity, flipped = 0, flipHeld = 0, flipTaken = 0;
  for (let i = 0; i < 4 / SIM_DT; i++) {
    // fix-up r1: three ticks into the open release the hull reads as overturned (only for the controller's tick), so the
    // overturned hold zeroes the turn after the unstick claimed it: the decision must not name the unstick over that 0
    const flip = openRelease >= 20 && flipped < 3;
    const takenBefore = ctl.debugInfo().overriddenRecoveryTurns;
    if (flip) bot.state.overturned = true;
    ctl.update(SIM_DT, 60 + i * SIM_DT);
    const info = ctl.debugInfo();
    if (flip) {
      bot.state.overturned = false;
      flipped++;
      if (bot.input.steer === 0 && info.recoveryTurn === null) flipHeld++;
      if (info.overriddenRecoveryTurns === takenBefore + 1) flipTaken++;
    }
    if (info.contactReleases > 0) revealed = true;
    // the release's reverse (applyActiveUnstick: throttle -0.7, its steer +-1) after the contact release fired
    if (info.contactReleases > 0 && bot.input.throttle === -0.7) {
      releaseTicks++;
      if (openUnlaid(info, enemy)) {
        openRelease++;
        minSteer = Math.min(minSteer, Math.abs(bot.input.steer));
        if (Math.abs(bot.input.steer) === 1) full++;
        if (info.recoveryTurn === 'unstick' && info.layFirstClamped === false) kept++;
      }
    }
    const st = bot.state, px = st.pos.x, pz = st.pos.z, pyaw = st.yaw, before = pressedPoints(px, pz, pyaw);
    updateTank(bot, flat, SIM_DT, null);
    if (pressedPoints(st.pos.x, st.pos.z, st.yaw) > before) { st.pos.x = px; st.pos.z = pz; st.yaw = pyaw; st.speed = 0; }
  }
  const info = ctl.debugInfo();
  console.log(`  contact releases ${info.contactReleases}; ${releaseTicks} release ticks, ${openRelease} with the shot open and unlaid, `
    + `${full} at the release's full turn (least |steer| ${fix(minSteer)}), ${kept} kept as 'unstick'`);
  ok(info.contactReleases > 0, 'the case is built: the pressed hull released from the post');
  ok(openRelease >= 10, `the case is built: the release ran with the shot open and unlaid (${openRelease} ticks)`);
  ok(full === openRelease, `every open, unlaid release tick keeps the release's full turn (${full} of ${openRelease}; least `
    + `${fix(minSteer)}, the cap ${cap.toFixed(2)})`);
  ok(kept === openRelease, `debugInfo names the unstick as the tick's recovery turn, uncut (${kept} of ${openRelease})`);
  ok(flipped === 3 && flipHeld === 3 && flipTaken === 3, `a claim a later write zeroed is not named: on ${flipped} overturned ticks the `
    + `turn is 0 with no recovery turn (${flipHeld}) and the claim is counted as taken back (${flipTaken})`);
}

console.log('[3] the terrain escape keeps its turn');
{
  const EDGE_Z = 14;
  const cliff = { getHeightAt: (_x, z) => (z > EDGE_Z ? -40 : 0), getNormalAt: () => ({ x: 0, y: 1, z: 0 }), getGroundType: () => 'firm' };
  const bot = tank('bot', 'm46_patton', 'alpha', 0, 0, 0), enemy = tank('enemy', 'm46_patton', 'bravo', -50, -60, Math.PI);
  let revealed = false;
  const ctl = createAI(bot, { difficulty: 'normal', rng: mulberry32(3), doctrine: () => CLASSIC_BOT_DOCTRINE, deps: {
    heightField: cliff, raycast: () => null, getEnemies: () => (revealed ? [enemy] : []), getAllies: () => [],
    getObstacles: () => [], spotting: { isSpotted: () => revealed } } });
  ctl.setWaypoints([[0, 40]], { loop: false });
  let escapeTicks = 0, openEscape = 0, over = 0, kept = 0, maxSteer = 0, maxZ = 0;
  for (let i = 0; i < 4 / SIM_DT; i++) {
    ctl.update(SIM_DT, 60 + i * SIM_DT);
    const info = ctl.debugInfo();
    if (info.terrainAvoiding) {
      revealed = true;
      escapeTicks++;
      if (openUnlaid(info, enemy)) {
        openEscape++;
        maxSteer = Math.max(maxSteer, Math.abs(bot.input.steer));
        if (Math.abs(bot.input.steer) > cap + 1e-9) over++;
        if (info.recoveryTurn === 'terrainEscape' && info.layFirstClamped === false) kept++;
      }
    }
    updateTank(bot, cliff, SIM_DT, null);
    maxZ = Math.max(maxZ, bot.state.pos.z);
  }
  console.log(`  ${escapeTicks} escape ticks, ${openEscape} with the shot open and unlaid, ${over} over the cap (steer at most `
    + `${maxSteer.toFixed(2)}, the cap ${cap.toFixed(2)}), ${kept} kept as 'terrainEscape'; the hull's furthest z ${maxZ.toFixed(2)} `
    + `(the edge ${EDGE_Z})`);
  ok(openEscape >= 10, `the case is built: the escape ran with the shot open and unlaid (${openEscape} ticks)`);
  ok(over >= 10, `the escape's turn runs above the cap while the shot is open (${over} ticks; the clamp held it to ${cap.toFixed(2)})`);
  ok(kept === openEscape, `debugInfo names the terrain escape as the tick's recovery turn, uncut (${kept} of ${openEscape})`);
  ok(maxZ < EDGE_Z, 'the hull stays short of the edge');
}

const RUSH = rulesetBotDoctrine(matchRulesetFor('endless_horde'), 'bravo');
console.log('[3b] a rolling escape keeps the turn its roll limit leaves');
{
  const EDGE_Z = 14;
  const cliff = { getHeightAt: (_x, z) => (z > EDGE_Z ? -40 : 0), getNormalAt: () => ({ x: 0, y: 1, z: 0 }), getGroundType: () => 'firm' };
  const bot = tank('bot', 'm46_patton', 'bravo', 0, 0, 0), enemy = tank('enemy', 'm46_patton', 'alpha', -30, -30, Math.PI);
  let revealed = false;
  const ctl = createAI(bot, { difficulty: 'normal', rng: mulberry32(3), doctrine: () => RUSH, deps: {
    heightField: cliff, raycast: () => null, getEnemies: () => (revealed ? [enemy] : []), getAllies: () => [bot],
    getObstacles: () => [], spotting: { isSpotted: () => revealed } } });
  ctl.setWaypoints([[0, 40]], { loop: false });
  let openEscape = 0, rolled = 0, rolledOver = 0, kept = 0, maxZ = 0;
  for (let i = 0; i < 4 / SIM_DT; i++) {
    ctl.update(SIM_DT, 60 + i * SIM_DT);
    const info = ctl.debugInfo();
    if (info.terrainAvoiding) {
      revealed = true;
      if (openUnlaid(info, enemy)) {
        openEscape++;
        if (bot.input.throttle === JOCKEY_DRIVE.rollThrottle) {
          rolled++;
          if (Math.abs(bot.input.steer) > cap + 1e-9) rolledOver++;
        }
        if (info.recoveryTurn === 'terrainEscape' && info.layFirstClamped === false) kept++;
      }
    }
    updateTank(bot, cliff, SIM_DT, null);
    maxZ = Math.max(maxZ, bot.state.pos.z);
  }
  console.log(`  ${openEscape} open, unlaid escape ticks, ${rolled} rolled (${rolledOver} over the cap at the roll limit `
    + `${JOCKEY_DRIVE.rollSteer}), ${kept} kept as 'terrainEscape'; the hull's furthest z ${maxZ.toFixed(2)} (the edge ${EDGE_Z})`);
  ok(rolledOver >= 10, `the rolled escape's turn runs above the cap while the shot is open (${rolledOver} of ${rolled} rolled ticks)`);
  ok(kept === openEscape, `debugInfo names the terrain escape as the tick's recovery turn, uncut (${kept} of ${openEscape})`);
  ok(maxZ < EDGE_Z, 'the hull stays short of the edge');
}

console.log('[4] the swerve off an ally and the reverse out of the deadlock keep their turn');
{
  const bot = tank('zbot', 'm46_patton', 'alpha', 0, 0, 0), ally = tank('ally', 'm46_patton', 'alpha', 0.6, 7.2, Math.PI);
  const enemy = tank('enemy', 'm46_patton', 'bravo', 60, -50, Math.PI);
  let revealed = false;
  const ctl = createAI(bot, { difficulty: 'normal', rng: mulberry32(3), doctrine: () => CLASSIC_BOT_DOCTRINE, deps: {
    heightField: flat, raycast: () => null, getEnemies: () => (revealed ? [enemy] : []), getAllies: () => [bot, ally],
    getObstacles: () => [], spotting: { isSpotted: () => revealed } } });
  ctl.setWaypoints([[0, 40]], { loop: false });
  let swerves = 0, swerveFull = 0, swerveKept = 0, starts = 0, startsFull = 0, escapeTicks = 0, openEscape = 0, full = 0, kept = 0;
  let minSteer = Infinity, escapes = 0;
  for (let i = 0; i < 6 / SIM_DT; i++) {
    ctl.update(SIM_DT, 60 + i * SIM_DT);
    const info = ctl.debugInfo();
    if (info.allyEmergencyStops > 0) revealed = true;
    const start = info.allyReverseEscapes > escapes;
    escapes = info.allyReverseEscapes;
    if (openUnlaid(info, enemy)) {
      // the swerve: the ally avoidance ran on 'ally' (no committed passing path) and no reverse owns the tick
      if (info.allyAvoidingId === 'ally' && info.passingAllyId == null && bot.input.throttle !== -0.42) {
        swerves++;
        if (Math.abs(bot.input.steer) === 1) swerveFull++;
        if (info.recoveryTurn === 'allySwerve' && info.layFirstClamped === false) swerveKept++;
      }
      // the reverse's first tick (resolveAllyEmergency's claim site)
      if (start && bot.input.throttle === -0.42) {
        starts++;
        if (Math.abs(bot.input.steer) === 1 && info.recoveryTurn === 'allyEscape' && info.layFirstClamped === false) startsFull++;
      }
    }
    if (info.allyReverseEscapes > 0 && bot.input.throttle === -0.42) {
      escapeTicks++;
      if (openUnlaid(info, enemy)) {
        openEscape++;
        minSteer = Math.min(minSteer, Math.abs(bot.input.steer));
        if (Math.abs(bot.input.steer) === 1) full++;
        if (info.recoveryTurn === 'allyEscape' && info.layFirstClamped === false) kept++;
      }
    }
    updateTank(bot, flat, SIM_DT, null);
  }
  const info = ctl.debugInfo();
  console.log(`  ${swerves} open, unlaid swerve ticks (${swerveFull} at |steer| 1, ${swerveKept} kept as 'allySwerve'); ally reverse `
    + `escapes ${info.allyReverseEscapes}, ${starts} starting with the shot open (${startsFull} at full turn); ${escapeTicks} reverse `
    + `ticks, ${openEscape} with the shot open and unlaid, ${full} at the reverse's full turn (least |steer| ${fix(minSteer)}), ${kept} `
    + `kept as 'allyEscape'`);
  ok(swerves >= 10, `the case is built: the swerve off the ally ran with the shot open and unlaid (${swerves} ticks)`);
  ok(swerveFull === swerves && swerveKept === swerves, `every open, unlaid swerve tick keeps the swerve's full turn, named `
    + `'allySwerve' and uncut (${swerveFull} and ${swerveKept} of ${swerves}; the cap ${cap.toFixed(2)})`);
  ok(info.allyReverseEscapes > 0, 'the case is built: the yielding hull reversed out of the deadlock');
  ok(starts >= 1 && startsFull === starts, `the reverse's first tick runs with the shot open and keeps its full turn as 'allyEscape' `
    + `(${startsFull} of ${starts})`);
  ok(openEscape >= 10, `the case is built: the reverse ran with the shot open and unlaid (${openEscape} ticks)`);
  ok(full === openEscape, `every open, unlaid reverse tick keeps the reverse's full turn (${full} of ${openEscape}; least `
    + `${fix(minSteer)}, the cap ${cap.toFixed(2)})`);
  ok(kept === openEscape, `debugInfo names the ally escape as the tick's recovery turn, uncut (${kept} of ${openEscape})`);
}

console.log('[5] a committed passing path round a stopped ally writes no swerve: the clamp holds its pivot');
{
  const bot = tank('zbot', 'm46_patton', 'alpha', 0, 0, 0), ally = tank('ally', 'm46_patton', 'alpha', 0.5, 9, 0);
  const enemy = tank('enemy', 'm46_patton', 'bravo', -50, -60, Math.PI);
  let revealed = false;
  const ctl = createAI(bot, { difficulty: 'normal', rng: mulberry32(3), doctrine: () => CLASSIC_BOT_DOCTRINE, deps: {
    heightField: flat, raycast: () => null, getEnemies: () => (revealed ? [enemy] : []), getAllies: () => [bot, ally],
    getObstacles: () => [], spotting: { isSpotted: () => revealed } } });
  ctl.setWaypoints([[0, 80]], { loop: false });
  let passing = 0, open = 0, held = 0, unclaimed = 0;
  for (let i = 0; i < 10 / SIM_DT; i++) {
    ctl.update(SIM_DT, 60 + i * SIM_DT);
    const info = ctl.debugInfo();
    if (info.passingAllyId === 'ally') revealed = true;
    // the passing path's own ticks: its parked ally is the avoidance's ally, so applyAllySteering returned before a swerve
    if (info.passingAllyId === 'ally' && info.allyAvoidingId === 'ally') {
      passing++;
      if (openUnlaid(info, enemy)) {
        open++;
        if (Math.abs(bot.input.steer) <= cap + 1e-9) held++;
        if (info.recoveryTurn === null) unclaimed++;
      }
    }
    updateTank(bot, flat, SIM_DT, null);
  }
  console.log(`  ${passing} ticks passing the stopped ally under its avoidance, ${open} with the shot open and unlaid: ${held} within `
    + `the cap, ${unclaimed} with no recovery turn`);
  ok(open >= 10, `the case is built: the passing path ran past its ally with the shot open and unlaid (${open} ticks)`);
  ok(held === open, `the clamp holds the passing path's pivot within the cap (${held} of ${open}; the cap ${cap.toFixed(2)})`);
  ok(unclaimed === open, `no swerve claims a passing tick (${unclaimed} of ${open} with recoveryTurn null)`);
}

console.log('[6] a rushing hunter backs off a hull at full turn: the back-off\'s tick and its held ticks');
{
  const bot = tank('bot', 'm46_patton', 'bravo', 0, 0, 0), hull = tank('hull', 'm46_patton', 'alpha', 2.5, 8.2, Math.PI / 2);
  bot.state.turretYaw = Math.PI; // the gun starts aft, so it stays unlaid on the hull ahead
  const ctl = createAI(bot, { difficulty: 'normal', rng: mulberry32(3), doctrine: () => RUSH, deps: {
    heightField: flat, raycast: () => null, getEnemies: () => [hull], getAllies: () => [bot], getObstacles: () => [],
    spotting: { isSpotted: () => true }, getObjective: () => ({ x: 2.5, z: 8.2, mission: 'hunt', radiusM: 25 }) } });
  ctl.setWaypoints([[0, 80]], { loop: false });
  let backOff = 0, branch = 0, held = 0, full = 0, kept = 0, minSteer = Infinity, holdOffs = 0;
  for (let i = 0; i < 6 / SIM_DT; i++) {
    ctl.update(SIM_DT, 60 + i * SIM_DT);
    const info = ctl.debugInfo();
    // the back-off's tick writes the hold-off (ramHoldOffs counts it); a held tick returns before the count
    const fresh = info.ramHoldOffs > holdOffs;
    holdOffs = info.ramHoldOffs;
    if (bot.input.throttle === -RUSH_DRIVE.backOffThrottle && openUnlaid(info, hull)) {
      backOff++;
      if (fresh) branch++; else held++;
      minSteer = Math.min(minSteer, Math.abs(bot.input.steer));
      if (Math.abs(bot.input.steer) === 1) full++;
      if (info.recoveryTurn === 'hullBackOff' && info.layFirstClamped === false) kept++;
    }
    updateTank(bot, flat, SIM_DT, null);
  }
  console.log(`  ${backOff} open, unlaid back-off ticks (${branch} at the back-off, ${held} held), ${full} at the full turn (least `
    + `|steer| ${fix(minSteer)}), ${kept} kept as 'hullBackOff'`);
  ok(branch >= 1, `the case is built: the back-off's own tick ran with the shot open and unlaid (${branch})`);
  ok(held >= 10, `the case is built: the held back-off ran with the shot open and unlaid (${held} ticks)`);
  ok(full === backOff, `every open, unlaid back-off tick keeps the back-off's full turn (${full} of ${backOff}; least `
    + `${fix(minSteer)}, the cap ${cap.toFixed(2)})`);
  ok(kept === backOff, `debugInfo names the back-off as the tick's recovery turn, uncut (${kept} of ${backOff})`);
}

console.log('[7] the no-ram lane\'s turn after a terrain escape is the drive\'s: the clamp cuts it');
{
  const EDGE_Z = 14;
  const cliff = { getHeightAt: (_x, z) => (z > EDGE_Z ? -40 : 0), getNormalAt: () => ({ x: 0, y: 1, z: 0 }), getGroundType: () => 'firm' };
  const bot = tank('bot', 'm46_patton', 'bravo', 0, 0, 0), hull = tank('hull', 'm46_patton', 'alpha', 6, 20, 0);
  bot.state.turretYaw = Math.PI;
  const ctl = createAI(bot, { difficulty: 'normal', rng: mulberry32(3), doctrine: () => RUSH, deps: {
    heightField: cliff, raycast: () => null, getEnemies: () => [hull], getAllies: () => [bot], getObstacles: () => [],
    spotting: { isSpotted: () => true }, getObjective: () => ({ x: 6, z: 20, mission: 'hunt', radiusM: 25 }) } });
  ctl.setWaypoints([[0, 40]], { loop: false });
  let turns = 0, within = 0, cut = 0, unclaimed = 0, maxSteer = 0, holdOffs = 0, maxZ = 0;
  for (let i = 0; i < 6 / SIM_DT; i++) {
    ctl.update(SIM_DT, 60 + i * SIM_DT);
    const info = ctl.debugInfo();
    const fresh = info.ramHoldOffs > holdOffs;
    holdOffs = info.ramHoldOffs;
    // an escape tick on which the no-ram lane wrote its turn off the hull (ramHoldOffs counts it), not its back-off
    if (info.terrainAvoiding && fresh && bot.input.throttle !== -RUSH_DRIVE.backOffThrottle && openUnlaid(info, hull)) {
      turns++;
      maxSteer = Math.max(maxSteer, Math.abs(bot.input.steer));
      if (Math.abs(bot.input.steer) <= cap + 1e-9) within++;
      if (info.layFirstClamped === true) cut++;
      if (info.recoveryTurn === null) unclaimed++;
    }
    updateTank(bot, cliff, SIM_DT, null);
    maxZ = Math.max(maxZ, bot.state.pos.z);
  }
  const info = ctl.debugInfo();
  console.log(`  ${turns} open, unlaid escape ticks turned by the no-ram lane: ${within} within the cap (at most |steer| `
    + `${maxSteer.toFixed(2)}), ${cut} cut by the clamp, ${unclaimed} with no recovery turn; ${info.overriddenRecoveryTurns} claims `
    + `taken back; the hull's furthest z ${maxZ.toFixed(2)} (the edge ${EDGE_Z})`);
  ok(turns >= 10, `the case is built: the no-ram lane turned the escaping hull with the shot open and unlaid (${turns} ticks)`);
  ok(within === turns, `the clamp holds the no-ram lane's turn within the cap (${within} of ${turns}; at most ${maxSteer.toFixed(2)}, `
    + `the cap ${cap.toFixed(2)})`);
  ok(cut === turns && unclaimed === turns, `the escape's claim does not stand over that turn: cut by the clamp, no recovery turn `
    + `(${cut} and ${unclaimed} of ${turns})`);
  ok(info.overriddenRecoveryTurns > 0, `debugInfo counts the claims taken back (${info.overriddenRecoveryTurns})`);
  ok(maxZ < EDGE_Z, 'the hull stays short of the edge');
}

if (failures) { console.error(`ai.layGunFirst.selftest: ${failures} failure(s)`); process.exit(1); }
console.log('ai.layGunFirst.selftest: a bot with a shot open turns its hull within its share of the turret\'s traverse and lays '
  + 'its gun; a contact release, a terrain escape, an ally swerve and reverse and a back-off from a hull keep their turn; a passing '
  + 'path\'s pivot and the no-ram lane\'s turn after an escape are held');
