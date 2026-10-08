// Finishing an idle target (bots lane, 2026-10-02). On the maps lane's tree two pacing matches ran long against the
// receipt's idle host. Winter seed 23000 (824 s): a T-90M stood 57-66 m off the host's flank for five minutes while
// its HEAT rounds dug into a crest 16 m short of the hull or passed over the turret; the press held off because the
// hull stood "already on its flank at point-blank", and the shoot-and-scoot is off against a passive target.
// Ruinspires seed 37001 (900 s cap): the survivor emptied its rack with the host at 320 hp and retired, since one
// full-speed ram would have cost it more than its hull. Synthetic fixtures pin the rules (see docs/BOT-TACTICS.md,
// "A passive target"): the flank exemption needs the gun on the hull, three rounds in a row without a hit give the
// spot up, and an empty rack finishes a passive hull with a run no faster than the finishing speed.
import { Vector3 } from 'three';
// Register the same complete production specs without executing roster tests.
import '../vehicles/fleetFactory.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createTankState, updateTank, SIM_DT } from '../sim/movement.ts';
import { createAI, mulberry32 } from './ai.ts';

let failures = 0;
function ok(cond, label) {
  if (cond) console.log(`  ok  ${label}`);
  else { failures++; console.error(`FAIL  ${label}`); }
}

/** Flat ground, optionally with a crest: a 2 m bank across the line between the host (origin) and the bot (+x). */
function field(crest) {
  const getHeightAt = (x, z) => (crest && Math.abs(x - 15) <= 2 && Math.abs(z) <= 3 ? 2 : 0);
  return {
    getHeightAt,
    getNormalAt: (x, z) => (crest && Math.abs(x - 15) <= 2.5 && Math.abs(z) <= 3.5 ? { x: 0, y: 0.5, z: 0 } : { x: 0, y: 1, z: 0 }),
    getGroundType: () => 'firm',
  };
}

/** Terrain sight: march the ray and stop where it runs under the ground. */
function terrainRaycast(ground) {
  return (origin, dir, maxDist) => {
    for (let d = 0.5; d < maxDist; d += 0.5) {
      const x = origin.x + dir.x * d, y = origin.y + dir.y * d, z = origin.z + dir.z * d;
      if (y < ground.getHeightAt(x, z)) return { dist: d };
    }
    return null;
  };
}

function entity(id, specId, team, x, z, yaw = 0, hp = null) {
  const spec = getSpec(specId);
  const state = createTankState(spec, new Vector3(x, 0, z), yaw);
  return {
    id, specId, spec, team, state,
    combat: {
      hp: hp ?? spec.hp, maxHp: spec.hp, destroyed: false,
      reload: { t: 0, totalS: spec.gun.reloadS, kind: 'ready' }, shellSlot: 0,
      modules: {}, crew: {}, fire: { burning: false, tickTimer: 0, ticksLeft: 0 }, magazine: null,
    },
    input: { throttle: 0, steer: 0, brake: false, fire: false, aimPoint: new Vector3(), shellSlot: 0, actionBits: 0 },
    aiCtl: null,
  };
}

function controller(bot, ground, enemies, obstacles = [], allies = []) {
  const ctl = createAI(bot, {
    difficulty: 'normal',
    rng: mulberry32(57),
    deps: {
      heightField: ground,
      raycast: terrainRaycast(ground),
      getEnemies: () => enemies,
      getAllies: () => allies,
      getObstacles: () => obstacles,
      spotting: { isSpotted: () => true },
    },
  });
  bot.aiCtl = ctl;
  return ctl;
}

/**
 * Real movement for the bot; the host stands idle. `gun`: 'held' keeps the gun reloading (no round leaves it),
 * 'miss' lets rounds leave and none reports back, 'hit' reports each round as a penetration on the host; the gun is
 * held for the first `heldS` seconds either way.
 */
function drive(bot, ctl, ground, host, seconds, { gun = 'held', heldS = 0, onTick = null, collide = null } = {}) {
  let shots = 0;
  const pending = [];
  for (let i = 0; i < seconds / SIM_DT; i++) {
    const t = 300 + i * SIM_DT;
    ctl.update(SIM_DT, t);
    if (gun === 'held' || i * SIM_DT < heldS) bot.combat.reload.t = 1;
    else if (bot.input.fire && bot.combat.reload.t <= 0) {
      shots++;
      bot.combat.reload.t = bot.spec.gun.reloadS;
      if (gun === 'hit') pending.push(t + 0.2);
    }
    bot.combat.reload.t = Math.max(0, bot.combat.reload.t - SIM_DT);
    while (pending.length && pending[0] <= t) {
      pending.shift();
      ctl.notifyShellResult({ targetId: host.id, kind: 'pen' });
    }
    updateTank(bot, ground, SIM_DT, collide);
    if (onTick && onTick(i * SIM_DT, t) === false) break;
  }
  return shots;
}

/** The press lane's own test from (x, z): the gun reaches the host's hull at 40 % of its height. */
function gunReachesHull(bot, host, ground) {
  const gunY = ground.getHeightAt(bot.state.pos.x, bot.state.pos.z) + 1.72;
  const hullY = host.spec.dims.heightM * 0.4;
  const dx = host.state.pos.x - bot.state.pos.x, dz = host.state.pos.z - bot.state.pos.z;
  const dist = Math.hypot(dx, dz);
  for (let d = 0.5; d < dist - 2; d += 0.5) {
    const f = d / dist;
    if (gunY + (hullY - gunY) * f < ground.getHeightAt(bot.state.pos.x + dx * f, bot.state.pos.z + dz * f)) return false;
  }
  return true;
}

function idleHost(hp = null) {
  const host = entity('host', 'm1a2', 'player', 0, 0, 0, hp);
  host.isPlayer = true;
  return host;
}

console.log('[1] the flank exemption needs the gun on the hull: a crest masks it, the press goes round');
{
  const ground = field(true);
  const host = idleHost();
  const bot = entity('bot', 't90m', 'enemy', 60, 0, -Math.PI / 2);
  ok(!gunReachesHull(bot, host, ground), 'fixture: from the flank spot the crest masks the hull from the gun');
  const ctl = controller(bot, ground, [host]);
  let pressedAt = null;
  drive(bot, ctl, ground, host, 60, { onTick: (t) => {
    if (pressedAt === null && ctl.debugInfo().passivePress) pressedAt = t;
  } });
  ok(pressedAt !== null && pressedAt < 25, `the press starts from the masked flank (at ${pressedAt?.toFixed(1) ?? 'never'} s)`);
  ok(gunReachesHull(bot, host, ground),
    `it ends where the gun reaches the hull (${bot.state.pos.x.toFixed(0)}, ${bot.state.pos.z.toFixed(0)})`);
}
{
  const ground = field(false);
  const host = idleHost();
  const bot = entity('bot', 't90m', 'enemy', 60, 0, -Math.PI / 2);
  const ctl = controller(bot, ground, [host]);
  drive(bot, ctl, ground, host, 40);
  ok(ctl.debugInfo().passivePresses === 0 && bot.state.pos.distanceTo(new Vector3(60, 0, 0)) < 12,
    'control: with the hull in the gun\'s lane the flank spot is held, no press');
}

console.log('[2] three rounds in a row that do not reach the target give the spot up');
// the host has been idle for 16 s when the gun opens up, so the flank spot is one the press would otherwise keep
{
  const ground = field(false);
  const host = idleHost();
  const bot = entity('bot', 't90m', 'enemy', 60, 0, -Math.PI / 2);
  const ctl = controller(bot, ground, [host]);
  let verdictAt = null, leftAt = null, shotsAtVerdict = 0, spotHeld = true, shots = 0;
  shots = drive(bot, ctl, ground, host, 70, { gun: 'miss', heldS: 16, onTick: (t) => {
    const info = ctl.debugInfo();
    if (verdictAt === null && bot.state.pos.distanceTo(new Vector3(60, 0, 0)) > 6) spotHeld = false;
    if (verdictAt === null && info.missVerdicts >= 1) { verdictAt = t; shotsAtVerdict = info.missVerdicts; }
    if (verdictAt !== null && leftAt === null && bot.state.pos.distanceTo(new Vector3(60, 0, 0)) > 12) leftAt = t;
  } });
  ok(spotHeld, 'the flank spot is held while the rounds go out (no scoot against a passive target)');
  ok(shots >= 3 && verdictAt !== null && verdictAt < 16 + 3 * bot.spec.gun.reloadS + 3,
    `three misses are a verdict on the spot (at ${verdictAt?.toFixed(1) ?? 'never'} s, ${shots} rounds in all)`);
  ok(leftAt !== null && leftAt - verdictAt < 15, `the press leaves the spot (at ${leftAt?.toFixed(1) ?? 'never'} s)`);
  void shotsAtVerdict;
}
{
  const ground = field(false);
  const host = idleHost();
  const bot = entity('bot', 't90m', 'enemy', 60, 0, -Math.PI / 2);
  const ctl = controller(bot, ground, [host]);
  const shots = drive(bot, ctl, ground, host, 60, { gun: 'hit', heldS: 16 });
  ok(shots >= 3 && ctl.debugInfo().missVerdicts === 0 && bot.state.pos.distanceTo(new Vector3(60, 0, 0)) < 6,
    `control: rounds that reach the target keep the spot (${shots} rounds, ${ctl.debugInfo().missVerdicts} verdicts)`);
}

console.log('[3] an empty rack finishes a passive hull with a run no faster than the finishing speed');
// The bot keeps a teammate with rounds aboard, out beyond support range: the retirement leaves the finish to it. With no
// teammate left that can fire, a run the ram law refuses is the last run (ai.lastRun.selftest).
function emptyRack(hostHp, moving = false) {
  const ground = field(false);
  const host = idleHost(hostHp);
  const bot = entity('bot', 'm1a2', 'enemy', 120, 0, -Math.PI / 2, 803);
  bot.combat.ammo = [0, 0, 0];
  bot.combat.ammoCapacity = [20, 12, 8];
  const teammate = entity('mate', 't90m', 'enemy', -450, 450); // 726 m off: no support to retire to
  const ctl = controller(bot, ground, [host], [], [teammate]);
  let ramAt = null, contactSpeed = null, cap = null, maxDist = 0;
  drive(bot, ctl, ground, host, 70, { onTick: (t) => {
    if (moving) host.state.speed = 2;
    const info = ctl.debugInfo();
    const d = bot.state.pos.distanceTo(host.state.pos);
    maxDist = Math.max(maxDist, d);
    if (ramAt === null && info.ramming) { ramAt = t; cap = info.ramCapMps; }
    if (ramAt !== null && contactSpeed === null && d < 9) { contactSpeed = bot.state.speed; return false; }
    return true;
  } });
  return { ramAt, contactSpeed, cap, maxDist };
}
{
  const { ramAt, contactSpeed, cap } = emptyRack(320);
  ok(ramAt !== null && ramAt < 25, `a 320 hp idle host is rammed (from ${ramAt?.toFixed(1) ?? 'never'} s)`);
  ok(cap !== null && cap >= 6 && cap < 12, `the run is capped at the finishing speed (${cap ?? 'none'} m/s)`);
  ok(contactSpeed !== null && contactSpeed <= cap + 0.9 && contactSpeed >= 4,
    `it reaches the hull at ${contactSpeed?.toFixed(1) ?? '-'} m/s, inside the cap`);
}
{
  const { ramAt, maxDist } = emptyRack(null);
  ok(ramAt === null && maxDist > 200,
    `control: a full-health host is not rammed, the hull retires and leaves it to its team (${maxDist.toFixed(0)} m)`);
}
{
  const { ramAt } = emptyRack(320, true);
  ok(ramAt === null, 'control: a moving host is judged at full speed, and that run would cost the rammer its hull');
}

console.log('[4] a press point the hull cannot reach is given up, not driven at forever');
// Reservoir pacing seed 50003 (maps lane's tree): the press point lay below a bank the terrain guard would not let the
// hull descend. Here the near-side press point stands in a closed pen the hull cannot enter (the eye sees over it).
{
  const ground = field(false);
  const host = idleHost();
  const wall = (x0, z0, x1, z1) => ({ min: [x0, -1, z0], max: [x1, 3, z1], kind: 'building' });
  const pen = [wall(58.5, 9.7, 76.5, 10.7), wall(58.5, 26.7, 76.5, 27.7), wall(58.5, 9.7, 59.5, 27.7),
    wall(75.5, 9.7, 76.5, 27.7)];
  const bot = entity('bot', 't90m', 'enemy', 120, -40, -Math.PI / 2);
  /** Push the hull out of the pen's walls: three discs of its half-width along its length. */
  const collide = (pos, _radius, out) => {
    const r = bot.spec.dims.widthM * 0.5, reach = Math.max(0, bot.spec.dims.hullLengthM * 0.5 - r);
    const fx = Math.sin(bot.state.yaw), fz = Math.cos(bot.state.yaw);
    let px = 0, pz = 0;
    for (const along of [-reach, 0, reach]) {
      const sx = pos.x + fx * along + px, sz = pos.z + fz * along + pz;
      for (const o of pen) {
        const cx = Math.max(o.min[0], Math.min(sx, o.max[0])), cz = Math.max(o.min[2], Math.min(sz, o.max[2]));
        const d = Math.hypot(sx - cx, sz - cz);
        if (d < r && d > 1e-6) { px += (sx - cx) / d * (r - d); pz += (sz - cz) / d * (r - d); }
      }
    }
    if (px === 0 && pz === 0) return false;
    out.x = px; out.z = pz;
    return true;
  };
  const ctl = controller(bot, ground, [host], pen);
  let firstPoint = null, givenUpAt = null;
  drive(bot, ctl, ground, host, 100, { collide, onTick: (t) => {
    const info = ctl.debugInfo();
    if (firstPoint === null && info.passivePress) firstPoint = { x: info.pressPointX, z: info.pressPointZ };
    if (givenUpAt === null && info.passivePressRepicks >= 1) givenUpAt = t;
  } });
  ok(firstPoint !== null && firstPoint.x > 58.5 && firstPoint.x < 76.5 && firstPoint.z > 9.7 && firstPoint.z < 27.7,
    `fixture: the press point stands inside the pen (${firstPoint ? `${firstPoint.x.toFixed(0)}, ${firstPoint.z.toFixed(0)}` : 'none'})`);
  ok(givenUpAt !== null && givenUpAt < 75, `the unreached point is given up (at ${givenUpAt?.toFixed(0) ?? 'never'} s)`);
  ok(ctl.debugInfo().pressUnreached >= 1, 'as unreached, not masked');
}

// Reservoir pacing seed 50001 (physics lane round 8, on the track-contact parity tree): the last bravo T-64BV stood
// rolled 17.5 degrees on a bank's flank, its stern against a building, its gun on the 6-degree depression stop 54 m
// from the idle host, for the last 610 s of the 900 s cap. Its back-up for the gun drove into the building every 1.5 s
// and went nowhere, the two press points it alternated between were each given up unreached 30 s after the pick (one
// veto slot let the first come back), and the arc limit's flat-cell leg was never driven: the press owned the hull.

/** A 12-degree bank across x = -60..-36 (|z| <= 8), rising toward the host at the origin to 2.55 m at x = -48. */
const BANK_GRADE = Math.tan(12 * Math.PI / 180);
const bank = {
  getHeightAt: (x, z) => (Math.abs(z) > 8 ? 0 : x >= -60 && x <= -48 ? BANK_GRADE * (x + 60)
    : x > -48 && x <= -36 ? BANK_GRADE * (-36 - x) : 0),
  getNormalAt: (x, z) => {
    const c = Math.cos(12 * Math.PI / 180), s = Math.sin(12 * Math.PI / 180);
    if (Math.abs(z) > 8) return { x: 0, y: 1, z: 0 };
    if (x >= -60 && x <= -48) return { x: -s, y: c, z: 0 };
    if (x > -48 && x <= -36) return { x: s, y: c, z: 0 };
    return { x: 0, y: 1, z: 0 };
  },
  getGroundType: () => 'firm',
};

/** Push a hull out of solid boxes: three discs of its half-width along its length. */
function discCollider(hull, boxes) {
  return (pos, _radius, out) => {
    const r = hull.spec.dims.widthM * 0.5, reach = Math.max(0, hull.spec.dims.hullLengthM * 0.5 - r);
    const fx = Math.sin(hull.state.yaw), fz = Math.cos(hull.state.yaw);
    let px = 0, pz = 0;
    for (const along of [-reach, 0, reach]) {
      const sx = pos.x + fx * along + px, sz = pos.z + fz * along + pz;
      for (const o of boxes) {
        const cx = Math.max(o.min[0], Math.min(sx, o.max[0])), cz = Math.max(o.min[2], Math.min(sz, o.max[2]));
        const d = Math.hypot(sx - cx, sz - cz);
        if (d < r && d > 1e-6) { px += (sx - cx) / d * (r - d); pz += (sz - cz) / d * (r - d); }
      }
    }
    if (px === 0 && pz === 0) return false;
    out.x = px; out.z = pz;
    return true;
  };
}

/** The T-64BV on the bank 54 m from the idle host, its stern 0.12 m off a building; `facing` the host or across. */
function pinnedOnBank(facing) {
  const host = idleHost();
  const yaw = facing === 'host' ? Math.PI / 2 : 0;
  const bot = entity('bot', 'ua_t64bv', 'enemy', -54, 0, yaw);
  bot.state.pos.y = bank.getHeightAt(-54, 0);
  const rear = 0.5 * bot.spec.dims.hullLengthM + 0.12;
  const walls = yaw ? [{ min: [-54 - rear - 2.6, -1, -4], max: [-54 - rear, 6, 4], kind: 'building' }]
    : [{ min: [-58, -1, -rear - 2.6], max: [-50, 6, -rear], kind: 'building' }];
  const ctl = controller(bot, bank, [host], walls);
  return { host, bot, ctl, collide: discCollider(bot, walls) };
}

console.log('[5] a back-up that goes nowhere is a stuck strike, and the next does not drive into the same face');
{
  // facing the host up the bank the gun needs 13.6 degrees of depression off the hull: it sits on its 6-degree stop
  const { host, bot, ctl, collide } = pinnedOnBank('host');
  let reverseS = 0, pinnedS = 0;
  drive(bot, ctl, bank, host, 14, { collide, onTick: () => {
    if (bot.input.throttle < -0.1) reverseS += SIM_DT;
    if (bot.state.atGunLimit) pinnedS += SIM_DT;
  } });
  const info = ctl.debugInfo();
  ok(pinnedS > 11, `fixture: the gun is on its stop (${pinnedS.toFixed(1)} of 14 s)`);
  ok(info.deadLegs === 1 && info.strikes >= 1,
    `the back-up into the building goes nowhere and counts (${info.deadLegs} dead legs, ${info.strikes} strikes)`);
  ok(reverseS <= 1.3, `no second back-up into it (${reverseS.toFixed(1)} s of reverse; one back-up is 1.2 s)`);
}

console.log('[6] press points given up unreached stay given up: two of them do not take turns');
{
  const host = idleHost();
  const wall = (x0, z0, x1, z1) => ({ min: [x0, -1, z0], max: [x1, 3, z1], kind: 'building' });
  const pen = (a, b) => [wall(a, 9.7, b, 10.7), wall(a, 26.7, b, 27.7), wall(a, 9.7, a + 1, 27.7), wall(b - 1, 9.7, b, 27.7)];
  // closed pens round both side-aspect press points (the near side's as in [4], and the far side's)
  const pens = [...pen(58.5, 76.5), ...pen(-76.5, -58.5)];
  const bot = entity('bot', 't90m', 'enemy', 120, -40, -Math.PI / 2);
  const ctl = controller(bot, field(false), [host], pens);
  const picks = [];
  drive(bot, ctl, field(false), host, 240, { collide: discCollider(bot, pens), onTick: (t) => {
    const info = ctl.debugInfo();
    if (!info.passivePress) return;
    const last = picks[picks.length - 1];
    if (!last || Math.hypot(last.x - info.pressPointX, last.z - info.pressPointZ) > 1) {
      picks.push({ t, x: info.pressPointX, z: info.pressPointZ });
    }
  } });
  const inPen = (p) => Math.abs(p.x) > 58.5 && Math.abs(p.x) < 76.5 && p.z > 9.7 && p.z < 27.7;
  const repeats = picks.filter((p, i) => picks.slice(0, i).some((q) => Math.hypot(p.x - q.x, p.z - q.z) < 12 && p.t - q.t < 120));
  ok(picks.length >= 3 && inPen(picks[0]) && inPen(picks[1]),
    `fixture: the first two press points stand in the pens (${picks.slice(0, 2).map((p) => `${p.x.toFixed(0)}, ${p.z.toFixed(0)}`).join(' / ')})`);
  ok(repeats.length === 0, `no press point given up comes back inside its 120 s (${picks.map((p) => `${p.x.toFixed(0)},${p.z.toFixed(0)}@${p.t.toFixed(0)}`).join(' ')})`);
  ok(ctl.debugInfo().pressUnreached >= 2, `the pens' points were given up unreached (${ctl.debugInfo().pressUnreached})`);
}

console.log('[7] a gun on its stop is a reposition the hull drives, over the press and its back-up');
{
  // across the bank, the gun held 16 s (the press arms on the idle host meanwhile), then free to fire
  const { host, bot, ctl, collide } = pinnedOnBank('across');
  const start = bot.state.pos.clone();
  let arcAt = null, pressAtArc = false, arcReverse = 0, leftAt = null, firstShotAt = null;
  const shots = drive(bot, ctl, bank, host, 40, { gun: 'miss', heldS: 16, collide, onTick: (t) => {
    const info = ctl.debugInfo();
    if (arcAt === null && info.arcScoot) { arcAt = t; pressAtArc = info.passivePress; }
    if (info.arcScoot && bot.input.throttle < -0.1) arcReverse += SIM_DT;
    if (leftAt === null && Math.hypot(bot.state.pos.x - start.x, bot.state.pos.z - start.z) > 10) leftAt = t;
    if (firstShotAt === null && bot.combat.reload.t > bot.spec.gun.reloadS - 2 * SIM_DT) firstShotAt = t;
  } });
  ok(arcAt !== null && arcAt < 24 && pressAtArc,
    `the arc limit's leg starts with the press running (at ${arcAt?.toFixed(1) ?? 'never'} s, pressing ${pressAtArc})`);
  ok(arcReverse === 0, `no back-up while it runs (${arcReverse.toFixed(1)} s of reverse)`);
  ok(leftAt !== null && arcAt !== null && leftAt - arcAt < 8,
    `the hull leaves the bank (${leftAt === null ? 'never' : `${(leftAt - arcAt).toFixed(1)} s after the leg began`})`);
  ok(shots >= 1 && firstShotAt !== null && firstShotAt < 35, `and fires (${shots} rounds, the first at ${firstShotAt?.toFixed(1) ?? 'never'} s)`);
}

if (failures) {
  console.error(`ai.passiveTarget.selftest: ${failures} failure(s)`);
  process.exit(1);
}
console.log('ai.passiveTarget.selftest: ok');
