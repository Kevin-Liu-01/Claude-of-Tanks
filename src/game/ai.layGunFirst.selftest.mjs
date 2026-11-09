// A bot with a shot open lays its gun first (268 Main item 11, judged on standard battles). A hull turning at its own rate
// takes its turret's whole traverse: an M46 swinging onto its route held an open shot at 104 m for 4 s, 32-36 degrees
// off, and on standard seeds 1-16 the hull's turn held off 7.0 % of the bots' clear-shot samples. While a bot's shot is
// open (its target in sight and range, its gun loaded, not yet laid) and no scoot, fallback or kite owns its hull, its
// steer is held to LAY_FIRST_TURN_SHARE of its turret's traverse over its hull's, so the turret closes on the target.
// The scene: an M46 bound for a point due east (a hard turn off its heading) with a visible enemy 100 m off its left bow.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import '../vehicles/fleetFactory.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createTankState, updateTank, SIM_DT } from '../sim/movement.ts';
import { CLASSIC_BOT_DOCTRINE } from '../sim/matchRuleset.ts';
import { createAI, mulberry32 } from './ai.ts';

const share = Number(/const LAY_FIRST_TURN_SHARE = ([\d.]+);/.exec(readFileSync(new URL('./ai.ts', import.meta.url), 'utf8'))?.[1]);
assert.ok(share > 0 && share < 1, `the controller holds the hull to a share of the turret's traverse (${share})`);
const field = { getHeightAt: () => 0, getNormalAt: () => ({ x: 0, y: 1, z: 0 }), getGroundType: () => 'firm' };
function tank(id, specId, team, x, z, yaw) {
  const spec = getSpec(specId);
  return { id, specId: spec.id, spec, team, state: createTankState(spec, new Vector3(x, 0, z), yaw),
    combat: { hp: spec.hp, maxHp: spec.hp, destroyed: false, reload: { t: 0, totalS: spec.gun.reloadS, kind: 'ready' }, shellSlot: 0,
      modules: {}, crew: {}, fire: { burning: false, tickTimer: 0, ticksLeft: 0 }, magazine: null },
    input: { throttle: 0, steer: 0, brake: false, fire: false, aimPoint: new Vector3(), shellSlot: 0, actionBits: 0 } };
}
const bot = tank('bot', 'm46_patton', 'alpha', 0, 0, 0), enemy = tank('enemy', 'm46_patton', 'bravo', -60, 80, Math.PI);
const cap = share * bot.spec.turretTraverseDegS / bot.spec.hullTraverseDegS;
assert.ok(cap < 1, `fixture: the M46's turret traverse (${bot.spec.turretTraverseDegS}) is under twice its hull's (${bot.spec.hullTraverseDegS}): the cap binds (${cap.toFixed(2)})`);
const ctl = createAI(bot, { difficulty: 'normal', rng: mulberry32(3), doctrine: () => CLASSIC_BOT_DOCTRINE, deps: {
  heightField: field, raycast: () => null, getEnemies: () => [enemy], getAllies: () => [], getObstacles: () => [],
  spotting: { isSpotted: () => true } } });
ctl.setWaypoints([[160, 0]], { loop: false });
let open = 0, over = 0, maxSteer = 0, laidAt = null;
for (let i = 0; i < 12 / SIM_DT; i++) {
  const t = 60 + i * SIM_DT; // past the opening's deployment window (its short engagement range)
  ctl.update(SIM_DT, t);
  const info = ctl.debugInfo();
  if (laidAt === null && info.targetId === enemy.id && info.alignOk) laidAt = t - 60;
  if (info.targetId === enemy.id && info.losClear && info.reloadReady && info.rangeOk && !info.alignOk
    && !info.scooting && !info.kiting && !info.fallingBack) {
    open++;
    maxSteer = Math.max(maxSteer, Math.abs(bot.input.steer));
    if (Math.abs(bot.input.steer) > cap + 1e-9) over++;
  }
  updateTank(bot, field, SIM_DT, null);
}
console.log(`M46 with a shot open: ${open} ticks unlaid, steer at most ${maxSteer.toFixed(2)} (cap ${cap.toFixed(2)}), ${over} over the cap; laid at ${laidAt?.toFixed(2) ?? 'never'} s`);
assert.ok(open > 0, 'the case is built: the shot opens before the gun is laid');
assert.equal(over, 0, 'while the shot is open and unlaid the hull turns within the cap');
assert.ok(laidAt !== null && laidAt < 6, `the gun is laid (${laidAt?.toFixed(2) ?? 'never'} s)`);
console.log('ai.layGunFirst.selftest: a bot with a shot open turns its hull within its share of the turret\'s traverse, and lays its gun');
