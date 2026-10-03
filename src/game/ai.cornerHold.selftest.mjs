// A route corner is not taken back (bots lane, 2026-10-03). Coastal pacing seed 25003 on the physics lane's tree
// (f9d5a3e20):
// at 130.2 s a T-90M Proryv bound for (25, -150) pressed into a boulder's north-west side and re-chose its r7 corner at
// every 0.6 s recheck, each choice undoing the last. Pressed to the rock, the north-east corner's lane ran inside the
// rock's margin, so it pivoted for the north-west corner; the pivot swung its centre 0.36 m off the rock, the
// north-east lane cleared and won back on score, and it drove back into the rock. It jinked every 0.6 s.
//
// This replays the recorded state through the controller: the five boulders round it (their footprints as the
// dedicated world reads them), the hull's pose and speed at tick 7813, its route, and the hull dims the battlePacing
// harness registered (6.86 x 3.78 m). The boulder's contact is stubbed to the measured response: pressed in, the
// hull's centre stands at A; turning away from the rock swings it out along A->B, 0.36 m by 0.28 rad of turn; driving
// into the rock stops it. The scene is mirrored east-west (x -> -x, yaw -> -yaw): the recorded controller had flipped
// its detour side to -1, a fresh one starts at +1, and the mirror gives the same preference.
import { Vector3 } from 'three';
import { getSpec } from '../vehicles/specs.ts';
import { createTankState, updateTank, SIM_DT } from '../sim/movement.ts';
import { createAI, mulberry32 } from './ai.ts';

let failures = 0;
function ok(cond, label) {
  if (cond) console.log(`  ok  ${label}`);
  else { failures++; console.error(`FAIL  ${label}`); }
}

const M = (x) => -x;
/** A recorded boulder footprint (world min/max x, z and its convex outline), mirrored. */
function rock([x0, z0, x1, z1], points) {
  const out = [];
  for (let i = points.length - 2; i >= 0; i -= 2) out.push(M(points[i]), points[i + 1]); // mirrored, winding kept
  let cx = 0, cz = 0;
  for (let i = 0; i < out.length; i += 2) { cx += out[i]; cz += out[i + 1]; }
  const n = out.length / 2;
  return { min: [M(x1), 0, z0], max: [M(x0), 2, z1], shape2: { kind: 'convex', cx: cx / n, cz: cz / n, points: out } };
}
const ROCKS = [
  rock([36.05, -96.66, 39.36, -93.18], [
    39.36, -94.3, 38.64, -93.52, 38, -93.29, 37.34, -93.18, 36.54, -94.15, 36.2, -94.64, 36.09, -95.12, 36.05,
    -95.32, 36.64, -96.28, 37.2, -96.51, 38.27, -96.66, 38.8, -96.34, 39.3, -95.32
  ]),
  rock([32.16, -101.25, 36.63, -97.01], [
    36.04, -101.03, 36.47, -99.97, 36.63, -99.38, 35.82, -97.74, 34.23, -97.01, 33.54, -97.01, 32.91, -97.44, 32.47,
    -97.94, 32.16, -98.49, 32.18, -99.05, 32.54, -100.08, 33.14, -101.05, 33.66, -101.22, 34.89, -101.25
  ]),
  rock([28.59, -107.13, 34.12, -101.48], [
    28.59, -103.73, 28.85, -105.46, 29.49, -106.37, 30.29, -107.13, 32.28, -106.56, 33.19, -106.21, 33.78, -105.66,
    34.03, -105.42, 34.12, -103.57, 33.58, -102.75, 32.27, -101.54, 31.25, -101.48, 29.61, -102.4
  ]),
  rock([32.57, -111.3, 36.34, -107.68], [
    34.65, -111.3, 35.64, -110.78, 36.05, -110.21, 36.34, -109.57, 35.58, -108.5, 35.18, -108.03, 34.72, -107.78,
    34.53, -107.68, 33.4, -108.02, 33.02, -108.52, 32.57, -109.55, 32.75, -110.18, 33.64, -110.97
  ]),
  rock([37.04, -112.88, 43.08, -106.26], [
    38.39, -112.43, 40.41, -112.88, 41.68, -112.56, 42.87, -112.01, 43.08, -109.57, 43.08, -108.42, 42.73, -107.53,
    42.57, -107.15, 40.57, -106.26, 39.43, -106.52, 37.54, -107.45, 37.04, -108.54, 37.36, -110.74
  ]),
];
const FIELD = { getHeightAt: () => 0, getNormalAt: () => ({ x: 0, y: 1, z: 0 }), getGroundType: () => 'firm' };
// the contact: pressed into the boulder at A, turned away from it the centre swings out toward B
const A = { x: M(27.18), z: -99.98 }, B = { x: M(27.0), z: -99.68 };
const PUSH_M = Math.hypot(B.x - A.x, B.z - A.z), UX = (B.x - A.x) / PUSH_M, UZ = (B.z - A.z) / PUSH_M;
const YAW_PRESSED = M(2.48), YAW_TURN = 0.28;
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

function replay(seconds) {
  const base = getSpec('t90m_proryv');
  const spec = { ...base, dims: { ...base.dims, hullLengthM: 6.86, widthM: 3.78 } };
  const state = createTankState(spec, new Vector3(M(27.169), 0, -99.971), M(2.4558));
  state.speed = 0.235;
  const bot = {
    id: 'bot-bravo-0', specId: 't90m_proryv', spec, team: 'bravo', state,
    combat: {
      hp: spec.hp, maxHp: spec.hp, destroyed: false,
      reload: { t: 0, totalS: spec.gun.reloadS, kind: 'ready' }, shellSlot: 0,
      modules: {}, crew: {}, fire: { burning: false, tickTimer: 0, ticksLeft: 0 }, magazine: null,
    },
    input: { throttle: 0, steer: 0, brake: false, fire: false, aimPoint: new Vector3(), shellSlot: 0, actionBits: 0 },
    aiCtl: null,
  };
  const ctl = createAI(bot, {
    difficulty: 'normal',
    rng: mulberry32(7),
    deps: {
      heightField: FIELD, raycast: () => null, getEnemies: () => [], getAllies: () => [],
      getObstacles: () => ROCKS, spotting: { isSpotted: () => true },
    },
  });
  // the recorded route from waypoint 1 on: (25, -150), (25, -225), (25, -250), (0, -275)
  ctl.setWaypoints([[M(25), -150], [M(25), -225], [M(25), -250], [0, -275]], { loop: false });
  const steers = [];
  let left = null;
  for (let i = 0; i < seconds / SIM_DT; i++) {
    ctl.update(SIM_DT, 300 + i * SIM_DT);
    steers.push(bot.input.steer);
    updateTank(bot, FIELD, SIM_DT, null);
    const p = bot.state.pos;
    const out = PUSH_M * Math.min(1, Math.max(0, wrap(YAW_PRESSED - bot.state.yaw) / YAW_TURN));
    const d = (p.x - A.x) * UX + (p.z - A.z) * UZ;
    if (d < out && d > -1) {
      p.x += UX * (out - d);
      p.z += UZ * (out - d);
      const heading = Math.sin(bot.state.yaw) * UX + Math.cos(bot.state.yaw) * UZ;
      const into = heading * Math.sign(bot.state.speed || 1);
      if (into < 0) bot.state.speed = 0; // the recorded speed fell from 2.9 to 0.2 m/s on contact
    }
    if (left === null && Math.hypot(p.x - A.x, p.z - A.z) > 3) left = i * SIM_DT;
  }
  return { steers, left };
}

/** The times (s) the steering reverses (|steer| > 0.3 on either side) before `toS`. */
function reversals(steers, toS) {
  const at = [];
  let last = 0;
  for (let i = 0; i < Math.min(steers.length, Math.round(toS / SIM_DT)); i++) {
    const sign = steers[i] > 0.3 ? 1 : steers[i] < -0.3 ? -1 : 0;
    if (sign && last && sign !== last) at.push(i * SIM_DT);
    if (sign) last = sign;
  }
  return at;
}

console.log('[1] a hull pressed against a boulder does not take back the corner it just gave up');
{
  const { steers, left } = replay(8);
  const at = reversals(steers, 6);
  // it gives the first corner up at 0.6 s and takes it back at 1.8 s (the north-east lane blocked again); the
  // recheck at 2.4 s would give it up once more
  const taken = at.filter((t) => t > 1.9 && t < 3);
  ok(taken.length === 0, `no reversal from 1.9 to 3 s, where the recheck would undo the last choice ` +
    `(${taken.map((t) => t.toFixed(2)).join(', ') || 'none'})`);
  ok(at.length <= 4, `at most four reversals in 6 s (${at.length}; one every 0.6 s before)`);
  const leftAt = left === null ? 'never' : `${left.toFixed(1)} s`;
  ok(left !== null && left < 8, `it leaves the boulder (3 m off it at ${leftAt})`);
}

if (failures) {
  console.error(`ai.cornerHold.selftest: ${failures} failure(s)`);
  process.exit(1);
}
console.log('ai.cornerHold.selftest: a refused flip ends the jinking');
