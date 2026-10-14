// The careful rules stand aside in a wedge (gameplay lane, 2026-10-09). The careful-driving rules (corner cells and
// lanes clear of other solids, the creeping pivot beside walls, the brake that stops a hull short of a solid: the
// destruction core lane's answer to bots ramming houses) trapped a hull on the destruction tree that first carried
// them: Blackglass pacing seed 38001, the last bravo Leopard 2A5 spent 350 s in a 5 by 10 m patch of a lane between two
// buildings at the start of every search leg (34 to 38 crowded corner choices, 902 to 994 solid brakes in 18 s) and the
// match ran to the 900 s cap. A hull whose stuck recovery has escalated (a repeated strike, or an orbit) drives on the
// old rules for WEDGE_RELEASE_S (10 s), then the careful rules return. A building across the bow on a flat field pins it.
import { Vector3 } from 'three';
import '../vehicles/fleetFactory.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createTankState, updateTank, SIM_DT } from '../sim/movement.ts';
import { createAI, mulberry32 } from './ai.ts';

let failures = 0;
function ok(cond, label) {
  if (cond) console.log(`  ok  ${label}`);
  else { failures++; console.error(`FAIL  ${label}`); }
}

const FIELD = { getHeightAt: () => 0, getNormalAt: () => ({ x: 0, y: 1, z: 0 }), getGroundType: () => 'firm' };
/** A building across the bow: 12 m wide, 6 m deep, its near face 8 m north of the origin. */
const BUILDING = { kind: 'structure', min: [-6, 0, 8], max: [6, 6, 14] };

function setup() {
  const spec = getSpec('leo2a5');
  const state = createTankState(spec, new Vector3(0, 0, 0), 0);
  const bot = {
    id: 'bot', specId: 'leo2a5', spec, team: 'bravo', state,
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
    rng: mulberry32(23),
    deps: {
      heightField: FIELD, raycast: () => null, getEnemies: () => [], getAllies: () => [],
      getObstacles: () => [BUILDING], spotting: { isSpotted: () => true },
    },
  });
  bot.aiCtl = ctl;
  return { bot, ctl };
}

/** The hull rolling north at 5 m/s from the origin, its goal beyond the building: a solid inside its stopping lane. */
function rollAtBuilding(bot, ctl) {
  bot.state.pos.set(0, 0, 0);
  bot.state.yaw = 0;
  bot.state.speed = 5;
  ctl.setWaypoints([[0, 60]], { loop: false });
}

let t = 300;
const step = (ctl) => { ctl.update(SIM_DT, t); t += SIM_DT; };

console.log('[1] control: a fresh controller brakes a hull short of the building (the careful rules are the default)');
{
  const { bot, ctl } = setup();
  rollAtBuilding(bot, ctl);
  const before = ctl.debugInfo().solidBrakes;
  step(ctl);
  ok(ctl.debugInfo().solidBrakes === before + 1 && bot.input.brake === true,
    `the solid brake acts (${before} -> ${ctl.debugInfo().solidBrakes}, brake ${bot.input.brake})`);
  ok(ctl.debugInfo().wedgeReleased === false, 'no release');
}

console.log('[2] pressed against the building and going nowhere: the second strike releases the careful rules');
{
  const { bot, ctl } = setup();
  ctl.setWaypoints([[0, 60]], { loop: false });
  // pressed to the near face (the hull's bow at the wall), held there: no step of movement is integrated
  bot.state.pos.set(0, 0, 8 - bot.spec.dims.hullLengthM * 0.5 - 0.1);
  bot.state.speed = 0;
  let armedAt = null;
  for (let i = 0; i < 12 / SIM_DT && armedAt === null; i++) {
    step(ctl);
    bot.state.speed = 0;
    if (ctl.debugInfo().wedgeReleased) armedAt = i * SIM_DT;
  }
  ok(armedAt !== null && armedAt < 8, `released at ${armedAt?.toFixed(1) ?? 'never'} s (strikes ${ctl.debugInfo().strikes})`);
  ok(ctl.debugInfo().wedgeReleases === 1, `one release counted (${ctl.debugInfo().wedgeReleases})`);

  // past the recovery's reverse, still inside the release: rolling at the building, the brake stands aside
  for (let i = 0; i < 1.6 / SIM_DT; i++) { step(ctl); bot.state.speed = 0; }
  rollAtBuilding(bot, ctl);
  const before = ctl.debugInfo().solidBrakes;
  step(ctl);
  ok(ctl.debugInfo().wedgeReleased === true, 'still released 1.6 s on');
  ok(ctl.debugInfo().solidBrakes === before, `no solid brake inside the release (${before} -> ${ctl.debugInfo().solidBrakes})`);

  console.log('[3] ... and once the hull drives free for longer than the release, the careful rules are back');
  bot.state.pos.set(100, 0, 0);
  bot.state.yaw = 0;
  bot.state.speed = 0;
  ctl.setWaypoints([[100, 400]], { loop: false });
  for (let i = 0; i < 11 / SIM_DT; i++) { step(ctl); updateTank(bot, FIELD, SIM_DT, null); }
  ok(ctl.debugInfo().wedgeReleased === false, `careful again after 11 s of free driving (releases ${ctl.debugInfo().wedgeReleases})`);
  rollAtBuilding(bot, ctl);
  const again = ctl.debugInfo().solidBrakes;
  step(ctl);
  ok(ctl.debugInfo().solidBrakes === again + 1, `the solid brake acts again (${again} -> ${ctl.debugInfo().solidBrakes})`);
}

if (failures) {
  console.error(`ai.wedgeRelease.selftest: ${failures} failure(s)`);
  process.exit(1);
}
console.log('ai.wedgeRelease.selftest: a wedge releases the careful rules for 10 s; a free hull drives carefully again');
