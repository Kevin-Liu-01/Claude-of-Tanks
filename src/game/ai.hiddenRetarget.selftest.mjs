// A target behind cover gives way to one in the gun's line (landmark-lanes-278). Horde wave 1 lost kills once
// landmarks-277's set pieces stood in the server collision and moved where the fights meet: a hull whose target went
// behind a crest or a prop kept it as long as its team spotted it (refreshCurrentTarget: the team's sighting refreshes the memory), so its gun stayed on the wall while
// another spotted hull stood in its line. Now, after HIDDEN_RETARGET_S out of its own line, any spotted enemy it can see
// takes the slot; a flicker shorter than that keeps the fight, and with nothing else in sight the hidden one stays the
// chase point.
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import '../vehicles/fleetFactory.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createTankState, SIM_DT } from '../sim/movement.ts';
import { createAI, mulberry32 } from './ai.ts';

const hf = { getHeightAt: () => 0, getNormalAt: () => ({ x: 0, y: 1, z: 0 }), getGroundType: () => 'firm' };
function tank(id, team, x, z) {
  const spec = getSpec('m1a1_abrams_hc');
  return { id, specId: spec.id, spec, team, isPlayer: false, state: createTankState(spec, new Vector3(x, 0, z), 0),
    combat: { hp: 1000, maxHp: 1000, destroyed: false, reload: { t: 0, totalS: 6, kind: 'ready' }, shellSlot: 0, modules: {}, crew: {},
      fire: { burning: false }, magazine: null },
    input: { throttle: 0, steer: 0, brake: false, fire: false, aimPoint: new Vector3(), shellSlot: 0, actionBits: 0 } };
}

/** One bot, two spotted enemies; `walls` names the enemies a wall hides from the bot (a hit 10 m out along its bearing). */
function scenario() {
  const bot = tank('blue', 'player', 0, 0);
  const near = tank('near', 'enemy', 0, 60), far = tank('far', 'enemy', 40, 70);
  const enemies = [near, far], walls = new Set();
  const raycast = (origin, direction, maxDistance) => {
    for (const e of enemies) {
      if (!walls.has(e.id)) continue;
      const dx = e.state.pos.x - origin.x, dz = e.state.pos.z - origin.z, d = Math.hypot(dx, dz) || 1;
      if ((direction.x * dx + direction.z * dz) / (Math.hypot(direction.x, direction.z) || 1) / d > 0.999 && maxDistance > 10) return { dist: 10 };
    }
    return null;
  };
  bot.aiCtl = createAI(bot, { difficulty: 'normal', rng: mulberry32(7), deps: { heightField: hf, raycast, getEnemies: () => enemies,
    getAllies: () => [bot], getObstacles: () => [], spotting: { isSpotted: () => true } } });
  let time = 0;
  const tick = (seconds) => { for (let n = 0; n < Math.round(seconds / SIM_DT); n++) { time += SIM_DT; bot.aiCtl.update(SIM_DT, time); } };
  return { bot, near, far, walls, tick };
}

{
  const s = scenario();
  s.tick(1);
  assert.equal(s.bot.aiCtl.targetId, 'near', 'the nearer hull in the open is the target');
  s.walls.add('near');
  s.tick(0.8);
  assert.equal(s.bot.aiCtl.targetId, 'near', 'a line lost for less than HIDDEN_RETARGET_S keeps the fight');
  s.tick(1.2);
  assert.equal(s.bot.aiCtl.targetId, 'far', 'past HIDDEN_RETARGET_S the spotted hull in the gun\'s line takes the slot');
}
{
  const s = scenario();
  s.tick(1);
  s.walls.add('near'); s.walls.add('far');
  s.tick(3);
  assert.equal(s.bot.aiCtl.targetId, 'near', 'with nothing else in its line the hidden target stays the chase point');
}
console.log('ai.hiddenRetarget: a target behind cover gives way to one in the line after 1.5 s; a flicker and a lone hidden target hold');
