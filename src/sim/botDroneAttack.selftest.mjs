// DR.06 (#100, "smarter bot drones, more than aim at target"): a bot flies the FPV top attack. Closing, its airframe
// holds a cruise height over the aim point; inside the dive radius it noses over onto the target's roof line. A human
// pilot's flight is untouched (it steers where the pilot aims). Deterministic: the same match twice flies the same path.
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import '../vehicles/tankFactory.ts';
import { createAuthoritativeMatch } from './authoritativeMatch.ts';
import { SIM_DT } from './movement.ts';
import { botDroneAim, DRONE_BOT_ATTACK } from './aerialCombat.ts';
import { createDedicatedWorldCollision } from '../../server/dedicatedWorldCollision.ts';

// 1. The aim law
{
  const aim = { x: 0, y: 1.2, z: 100 }, out = new Vector3();
  botDroneAim({ x: 0, y: 4, z: 0 }, aim, out);
  assert.equal(out.y, 1.2 + DRONE_BOT_ATTACK.cruiseM, 'a low airframe far out climbs to the cruise height over the target');
  const band = 1.2 + DRONE_BOT_ATTACK.cruiseM * 1.2;
  botDroneAim({ x: 0, y: band, z: 0 }, aim, out);
  assert.equal(out.y, band, 'inside the cruise band it holds its height while closing');
  botDroneAim({ x: 0, y: 80, z: 0 }, aim, out);
  assert.equal(out.y, 1.2 + DRONE_BOT_ATTACK.cruiseM * 1.5, 'a high airframe comes down to the band');
  botDroneAim({ x: 0, y: 25, z: 100 - DRONE_BOT_ATTACK.diveRadiusM + 1 }, aim, out);
  assert.deepEqual(out.toArray(), [0, 1.2 + DRONE_BOT_ATTACK.roofLiftM, 100], 'inside the dive radius it aims at the roof line');
}

// 2. In the shared authority on Verdant: a bot's drone closes high and arrives from above.
function flight() {
  const world = createDedicatedWorldCollision('verdant', { retain: true });
  const match = createAuthoritativeMatch({ players: [
    { id: 'h1', specId: 'm1a1_abrams_hc', team: 'alpha' },
    { id: 'b1', specId: 't90am', team: 'bravo', bot: true, difficulty: 'hard' },
  ], mapId: 'verdant', seed: 11, countdownS: 0, gameMode: 'drone', worldCollision: world });
  match.onMatchReady();
  const bot = match.entityById.get('b1'), inputs = new Map(), ground = (x, z) => match.heightField.getHeightAt(x, z);
  const path = [];
  let launched = false;
  for (let tick = 1; tick <= 60 * 90; tick++) {
    inputs.set('h1', { throttle: 0, steer: 0, brake: true, fire: false, fireIntentSeq: null, aimLocked: false, shellSlot: 0, actionBits: 0,
      aimYaw: 0, aimPitch: 0, aimDistance: 300 });
    match.step({ dt: SIM_DT, inputs });
    match.eventsForViewer('__bot_drone__'); match.afterEventBroadcast();
    const v = bot.aerial;
    if (v?.active && !v.launching) {
      launched = true;
      const aim = bot.input.aimPoint;
      path.push({ x: v.x, y: v.y, z: v.z, agl: v.y - ground(v.x, v.z), toAim: Math.hypot(aim.x - v.x, aim.z - v.z), aimY: aim.y });
    }
    if (launched && !v?.active) break;
  }
  world.release?.();
  return path;
}
const path = flight();
assert.ok(path.length > 60, `the bot launched and flew its drone (${path.length} ticks)`);
const closing = path.filter((p) => p.toAim > DRONE_BOT_ATTACK.diveRadiusM + 10);
const diving = path.filter((p) => p.toAim <= DRONE_BOT_ATTACK.diveRadiusM);
assert.ok(closing.length > 30, `it spent its approach outside the dive radius (${closing.length} ticks)`);
const peak = Math.max(...closing.map((p) => p.y - p.aimY));
assert.ok(peak >= DRONE_BOT_ATTACK.cruiseM * .7, `it closes high over the target, not at tank height (${peak.toFixed(1)} m over the aim point)`);
// the first dive pass: from the dive radius down to its lowest point before the airframe pulls away again
const dive = [];
for (const p of path.slice(path.findIndex((q) => q.toAim <= DRONE_BOT_ATTACK.diveRadiusM))) {
  if (dive.length && p.toAim > dive[dive.length - 1].toAim + .5 && p.toAim > 3) break;
  dive.push(p);
}
assert.ok(dive.length >= 6, `the bot drone entered its dive (${dive.length} ticks)`);
const low = dive.reduce((m, p) => (p.y < m.y ? p : m), dive[0]);
// the terminal run: the last ten metres of horizontal travel into the lowest point
const lowAt = dive.indexOf(low);
let start = lowAt;
while (start > 0 && Math.hypot(low.x - dive[start - 1].x, low.z - dive[start - 1].z) < 10) start--;
const run = dive[start];
const angle = Math.atan2(run.y - low.y, Math.hypot(low.x - run.x, low.z - run.z)) * 180 / Math.PI;
assert.ok(angle >= 30, `the terminal run dives onto the roof (${angle.toFixed(1)} degrees over its last ${Math.hypot(low.x - run.x, low.z - run.z).toFixed(1)} m)`);
assert.ok(low.y - low.aimY < 4, `it reaches the roof line, not a pass overhead (${(low.y - low.aimY).toFixed(1)} m over the aim point)`);
const again = flight();
assert.deepEqual(again.map((p) => [p.x, p.y, p.z]), path.map((p) => [p.x, p.y, p.z]), 'deterministic');
console.log(`botDroneAttack: a bot drone closes ${peak.toFixed(1)} m over its target and dives at ${angle.toFixed(1)} degrees from inside ${DRONE_BOT_ATTACK.diveRadiusM} m; deterministic`);
