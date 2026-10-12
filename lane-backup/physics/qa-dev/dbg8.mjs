import '../src/vehicles/tankFactory.ts';
import { createAuthoritativeMatch } from '../src/sim/authoritativeMatch.ts';
import { SIM_DT } from '../src/sim/movement.ts';
import { createDedicatedWorldCollision } from '../server/dedicatedWorldCollision.ts';
const world = createDedicatedWorldCollision('verdant', { retain: true });
const players = [
  { id: 'h1', specId: 'm1a2', team: 'alpha' }, { id: 'h2', specId: 't90m', team: 'bravo' },
  { id: 'b1', specId: 'leo2a7v', team: 'alpha', bot: true, difficulty: 'normal' }, { id: 'b2', specId: 'm1a2', team: 'bravo', bot: true, difficulty: 'normal' },
];
const match = createAuthoritativeMatch({ players, mapId: 'verdant', seed: 7, countdownS: 0, gameMode: 'standard', worldCollision: world });
match.onMatchReady();
const inputs = new Map();
for (let tick = 1; tick <= 600; tick++) {
  if (tick === 60) {
    const v = match.entities.find((e) => e.id === 'h2');
    console.log('before', v?.id, v?.combat.hp, JSON.stringify(v?.combat.fire), v?.combat.destroyed);
    v.combat.hp = 1; v.combat.fire.burning = true; v.combat.fire.ticksLeft = 4;
  }
  match.step({ dt: SIM_DT, inputs });
  for (const e of match.eventsForViewer('__audit__')) if (e.type === 'tank_destroyed' || e.type === 'tank_fire') console.log(tick, e.type, JSON.stringify(e).slice(0, 160));
  match.afterEventBroadcast();
  if (tick % 120 === 0) { const v = match.entities.find((e) => e.id === 'h2'); console.log(tick, 'b2', v.combat.hp, v.combat.destroyed, JSON.stringify(v._wreckTurret ? [...v._wreckTurret].map(x=>+x.toFixed(2)) : null)); }
}
console.log(match.wreckTurretDigest());
