// Movement under fire (physics lane, 2026-10-04; the coordinator's defect 1 from Tidegate Polders pacing seed 41002 on
// the merged tree): a BMP-3 that made contact with a Bradley 100 m off braked to a stop in the open, sat facing it under
// fire and died there. An IFV under fire in the open keeps moving to cover or out of sight; it never parks. Real
// movement drives the hull (updateTank) on open ground; the enemy stands idle. See SETTLE_STARVED_S in ai.ts.
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

const flat = { getHeightAt: () => 0, getNormalAt: () => ({ x: 0, y: 1, z: 0 }), getGroundType: () => 'firm' };

function entity(id, specId, team, x, z, yaw = 0) {
  const spec = getSpec(specId);
  const state = createTankState(spec, new Vector3(x, 0, z), yaw);
  return {
    id, specId, spec, team, state,
    combat: {
      hp: spec.hp, maxHp: spec.hp, destroyed: false,
      reload: { t: 0, totalS: spec.gun.reloadS, kind: 'ready' }, shellSlot: 0,
      modules: {}, crew: {}, fire: { burning: false, tickTimer: 0, ticksLeft: 0 }, magazine: null,
    },
    input: { throttle: 0, steer: 0, brake: false, fire: false, aimPoint: new Vector3(), shellSlot: 0, actionBits: 0 },
    aiCtl: null,
  };
}

function controller(bot, enemies, { raycast = () => null, spotted = () => true } = {}) {
  const ctl = createAI(bot, {
    difficulty: 'normal',
    rng: mulberry32(41),
    deps: {
      heightField: flat,
      raycast,
      getEnemies: () => enemies,
      getAllies: () => [],
      getObstacles: () => [],
      spotting: { isSpotted: () => spotted() },
    },
  });
  bot.aiCtl = ctl;
  return ctl;
}

/** Real movement for the bot from t = 300 s. `gun`: 'free' reloads each round the AI fires, 'held' keeps it loading. */
function drive(bot, ctl, seconds, { gun = 'free', onTick = null } = {}) {
  for (let i = 0; i < seconds / SIM_DT; i++) {
    const t = 300 + i * SIM_DT;
    ctl.update(SIM_DT, t);
    if (gun === 'held') bot.combat.reload.t = 1;
    else if (bot.input.fire && bot.combat.reload.t <= 0) bot.combat.reload.t = bot.spec.gun.reloadS;
    bot.combat.reload.t = Math.max(0, bot.combat.reload.t - SIM_DT);
    updateTank(bot, flat, SIM_DT, null);
    if (onTick && onTick(i * SIM_DT, t) === false) break;
  }
}

function idleEnemy(x, z) {
  const host = entity('host', 'm1a2', 'player', x, z, Math.PI);
  host.isPlayer = true;
  return host;
}

console.log('[1] a fresh contact is no starved trigger: a scout that has never fired keeps moving when it sights an enemy');
{
  // driving north at speed on a patrol leg; the enemy, 100 m off its right bow, is spotted at 4 s
  const host = idleEnemy(60, 60);
  const bot = entity('bot', 'bmp3', 'enemy', 0, -60, 0);
  let seen = false;
  const ctl = controller(bot, [host], { spotted: () => seen });
  ctl.setWaypoints([[0, 400]], { loop: false });
  let contactAt = null, speedAtContact = 0, settlingS = 0, brakingS = 0, minSpeed = Infinity;
  drive(bot, ctl, 9, { onTick: (t) => {
    if (t >= 4) seen = true;
    const info = ctl.debugInfo();
    if (contactAt === null && info.targetId === host.id) { contactAt = t; speedAtContact = bot.state.speed; }
    if (contactAt === null || t - contactAt > 4) return;
    if (info.settling) settlingS += SIM_DT;
    if (bot.input.throttle === 0 && bot.input.brake) brakingS += SIM_DT;
    if (t - contactAt > 1) minSpeed = Math.min(minSpeed, Math.abs(bot.state.speed));
  } });
  ok(contactAt !== null && speedAtContact > 8, `fixture: contact at ${contactAt?.toFixed(2) ?? 'never'} s at ${speedAtContact.toFixed(1)} m/s`);
  ok(settlingS === 0 && brakingS === 0, `no settled-shot halt on the contact (${settlingS.toFixed(2)} s settling, ${brakingS.toFixed(2)} s braking)`);
  ok(minSpeed > 3, `it keeps moving through the first 4 s of the contact (slowest ${minSpeed.toFixed(1)} m/s after the first)`);
}

/**
 * The stalemate press's settle: the contact silent from 300 s (the gun held), the search's push window ends at 308 s
 * and the press arms a settle. `hitAt` delivers a direct hit from the enemy then; `covered` hides the hull's body from
 * the enemy's gun (a berm only the turret sees over) while the two still see each other.
 */
function settleCase({ hitAt = null, covered = false } = {}) {
  const host = idleEnemy(0, 100);
  const bot = entity('bot', 'bmp3', 'enemy', 0, 0, 0);
  const raycast = (origin, dir, maxDist) => {
    if (!covered) return null;
    const ex = origin.x + dir.x * maxDist, ey = origin.y + dir.y * maxDist, ez = origin.z + dir.z * maxDist;
    const near = Math.hypot(ex - bot.state.pos.x, ez - bot.state.pos.z) < 2;
    const fromAfar = Math.hypot(origin.x - bot.state.pos.x, origin.z - bot.state.pos.z) > 5;
    return near && fromAfar && ey < bot.state.pos.y + 1.2 ? { dist: Math.max(0, maxDist - 4) } : null;
  };
  const ctl = controller(bot, [host], { raycast });
  let settleAt = null, endSpeed = null, minSpeed = Infinity;
  drive(bot, ctl, 12, { gun: 'held', onTick: (t) => {
    if (hitAt !== null && Math.abs(t - hitAt) < SIM_DT / 2) ctl.notifyUnderFire(host, { selfHit: true, damaging: true, kind: 'pen' });
    const info = ctl.debugInfo();
    if (settleAt === null && info.settling && t > 6) settleAt = t;
    if (settleAt === null) return;
    if (t - settleAt > 1 && t - settleAt < 3.4) minSpeed = Math.min(minSpeed, Math.abs(bot.state.speed));
    if (endSpeed === null && t - settleAt >= 3) endSpeed = Math.abs(bot.state.speed);
  } });
  return { settleAt, endSpeed: endSpeed ?? NaN, minSpeed };
}

console.log('[2] under fire in the open a settle does not hold the hull; in cover it still halts to shoot');
{
  const calm = settleCase();
  ok(calm.settleAt !== null && calm.endSpeed < 0.5,
    `control: the press's settle halts a scout nobody is shooting at (from ${calm.settleAt?.toFixed(1) ?? 'never'} s, ${calm.endSpeed.toFixed(2)} m/s after 3 s)`);
  const open = settleCase({ hitAt: 2 });
  ok(open.settleAt !== null && open.minSpeed > 3,
    `hit in the open, it keeps moving through the settle (from ${open.settleAt?.toFixed(1) ?? 'never'} s, slowest ${open.minSpeed.toFixed(1)} m/s)`);
  const cover = settleCase({ hitAt: 2, covered: true });
  ok(cover.settleAt !== null && cover.endSpeed < 0.5,
    `hit behind a berm the gun sees only its turret over, it halts to shoot (${cover.endSpeed.toFixed(2)} m/s after 3 s)`);
}

if (failures) {
  console.error(`ai.underFire.selftest: ${failures} failure(s)`);
  process.exit(1);
}
console.log('ai.underFire.selftest: ok');
