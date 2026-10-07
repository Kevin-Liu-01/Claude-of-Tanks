// A patrol the grid cannot route still drives (bots lane, 2026-10-03). On the physics lane's plane attitude, Aegis
// Crossing pacing seed 53001's last bravo tank, a Type 96, slid into a gorge pocket and came to rest at (-45.2, -34.7,
// 68.4) on a 22 x 39 degree lie. Nothing plans from there, so its no-contact search handed the leg to the local router
// (a 'direct' leg). The leg crossed a bridge's span, and the bridge gate, finding no route either, held the hull with
// zero input. A hold has no drive intent, so neither wedge watchdog armed, and every new leg got the same hold: it sat
// at rest for 798 s and the match ended in a draw. The local router now drives on toward the destination.
// Re-seated 2026-10-06 (map revival lane 2, Aegis round 3): the Tajo's new walls (terrain.ts gorge `wall` band and
// `meander`) took that pocket away — the gorge floor runs level through (-45.2, 68.4) now and plans. The same kind of
// pocket lies a few metres east, at the foot of the north wall beside the viaduct, where the 25 m grid reads the cliff's
// cell as solid: the Type 96 is held there on the lower wall's 36-degree toe, and nothing plans from it.
// Re-seated 2026-10-07 (map revival lane 2, Aegis round 5): the Tajo's waist draws the walls in to the bridge, and the
// floor's 25 m cells reach every toe beside the viaduct, so every pocket there plans. The north wall of the west reach
// keeps them: the Type 96 is held on its lower face, 4.6 m over the floor at (-190, 70), where the grid reads the cliff's
// cell as solid; the enemy waits on the east reach's floor (the turbo-ball kickoff), so the direct leg runs east along the
// gorge and crosses the viaduct's span, as the first one did.
import { Vector3 } from 'three';
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createTankState, updateTank, SIM_DT } from '../sim/movement.ts';
import { createAuthoritativeMatch } from '../sim/authoritativeMatch.ts';
import { createDedicatedWorldCollision } from '../../server/dedicatedWorldCollision.ts';
import { createAI, mulberry32 } from './ai.ts';

let failures = 0;
function ok(cond, label) {
  if (cond) console.log(`  ok  ${label}`);
  else { failures++; console.error(`FAIL  ${label}`); }
}

console.log('[1] Aegis Crossing: the Type 96 at rest in the gorge pocket, on its no-contact search');
{
  await ensureAuthorityFleet(['m1a2', 'type96_72m_lei']);
  // the pose the plane-attitude run left it in (4549734b3, 102 s on), held there tick by tick — re-seated on the new
  // gorge (2026-10-06): the north wall's toe by the viaduct (ground -37.6 m), the same heading; (2026-10-07, Aegis round
  // 5) the west reach's north wall (ground -49.5 m), the hull turned east along it
  const POSE = { x: -190, y: -48.9, z: 70, yaw: 100 * Math.PI / 180 };
  const match = createAuthoritativeMatch({
    players: [
      { id: 'host', name: 'Host', specId: 'm1a2', team: 'alpha', bot: false, spawn: { x: 130, z: 0, yaw: 0 } },
      { id: 'type96', name: 'B2', specId: 'type96_72m_lei', team: 'bravo', bot: true, difficulty: 'normal',
        spawn: { x: POSE.x, z: POSE.z, yaw: POSE.yaw } },
    ],
    mapId: 'cliffbridge', seed: 53001, countdownS: 0, worldCollision: createDedicatedWorldCollision('cliffbridge'),
  });
  match.onMatchReady();
  const bot = match.entities.find((entity) => entity.id === 'type96');
  let driving = 0, held = 0, kind = null;
  for (let tick = 0; tick < 40 * 60; tick++) {
    bot.state.pos.set(POSE.x, POSE.y, POSE.z);
    bot.state.yaw = POSE.yaw;
    bot.state.speed = 0;
    match.step({ dt: SIM_DT, inputs: new Map() });
    if ((tick + 1) * SIM_DT <= 26) continue; // the search starts at 25 s
    kind = bot.aiCtl.debugInfo().searchKind;
    if (bot.input.throttle !== 0) driving++;
    else if (bot.input.steer === 0) held++;
  }
  ok(kind === 'direct', `fixture: nothing plans from the pocket, so the search leg is the local router's (${kind})`);
  ok(driving > 14 * 60 * 0.8, `it commands drive on ${driving} of ${14 * 60} ticks after its search begins ` +
    `(held with zero input on ${held})`);
}

const flat = (decks) => ({
  getHeightAt: () => 0, getNormalAt: () => ({ x: 0, y: 1, z: 0 }), getGroundType: () => 'firm', bridgeDecks: decks,
});
// a deck along z whose span the leg from (0, 0) to (0, 200) crosses
const DECK = { x: 0, z: 60, ux: 0, uz: 1, halfLength: 40, halfWidth: 6, deckY: 0 };

/** A Type 96 in patrol at (0, 0) facing north with one leg to (0, 200) and the given planner; its pose after 8 s. */
function patrol(planRoute) {
  const spec = getSpec('type96_72m_lei');
  const field = flat([DECK]);
  const bot = {
    id: 'bot', specId: spec.id, spec, team: 'bravo', state: createTankState(spec, new Vector3(0, 0, 0), 0),
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
    rng: mulberry32(3),
    deps: {
      heightField: field, raycast: () => null, getEnemies: () => [], getAllies: () => [], getObstacles: () => [],
      spotting: { isSpotted: () => false }, planRoute,
    },
  });
  bot.aiCtl = ctl;
  ctl.setWaypoints([[0, 200]], { loop: false });
  for (let i = 0; i < 8 / SIM_DT; i++) {
    ctl.update(SIM_DT, i * SIM_DT);
    updateTank(bot, field, SIM_DT, null);
  }
  return bot.state.pos;
}

console.log('[2] a patrol leg across a bridge span with no route from the hull: it drives on');
{
  const end = patrol(() => []);
  ok(end.z > 20, `it heads up its leg (${end.z.toFixed(1)} m north of its start in 8 s)`);
}

console.log('[3] control: with a route the gate still takes the bridge ingress, not the straight line');
{
  const end = patrol(() => [[40, 15], [40, 100], [0, 200]]);
  ok(end.x > 15, `it turns for the ingress at (40, 15) (at ${end.x.toFixed(1)}, ${end.z.toFixed(1)} after 8 s)`);
}

if (failures) {
  console.error(`ai.patrolNoRoute.selftest: ${failures} failure(s)`);
  process.exit(1);
}
console.log('ai.patrolNoRoute.selftest: a patrol the grid cannot route still drives');
