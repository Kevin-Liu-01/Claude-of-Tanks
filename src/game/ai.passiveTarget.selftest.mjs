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

function controller(bot, ground, enemies) {
  const ctl = createAI(bot, {
    difficulty: 'normal',
    rng: mulberry32(57),
    deps: {
      heightField: ground,
      raycast: terrainRaycast(ground),
      getEnemies: () => enemies,
      getAllies: () => [],
      getObstacles: () => [],
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
function drive(bot, ctl, ground, host, seconds, { gun = 'held', heldS = 0, onTick = null } = {}) {
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
    updateTank(bot, ground, SIM_DT, null);
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
function emptyRack(hostHp, moving = false) {
  const ground = field(false);
  const host = idleHost(hostHp);
  const bot = entity('bot', 'm1a2', 'enemy', 120, 0, -Math.PI / 2, 803);
  bot.combat.ammo = [0, 0, 0];
  bot.combat.ammoCapacity = [20, 12, 8];
  const ctl = controller(bot, ground, [host]);
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
  ok(ramAt === null && maxDist > 200, `control: a full-health host is not rammed, the hull retires (${maxDist.toFixed(0)} m)`);
}
{
  const { ramAt } = emptyRack(320, true);
  ok(ramAt === null, 'control: a moving host is judged at full speed, and that run would cost the rammer its hull');
}

if (failures) {
  console.error(`ai.passiveTarget.selftest: ${failures} failure(s)`);
  process.exit(1);
}
console.log('ai.passiveTarget.selftest: ok');
