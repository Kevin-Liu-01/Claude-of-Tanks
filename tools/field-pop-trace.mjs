// tools/field-pop-trace.mjs — the field audit's pops traced (destruction stream, 2026-10-12): a real map, 28 bots, every
// unexplained horizontal step > 5 cm and vertical step > 5 cm with the hull's state and
// the records round it.   node tools/field-pop-trace.mjs <map> [seconds=60] [seed=8100] [--json=<out>]
const root = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const { createDedicatedWorldCollision } = await import(`${root}/server/dedicatedWorldCollision.ts`);
const { ALL_TANK_IDS, getSpec } = await import(`${root}/src/vehicles/specs.ts`);
const { ensureAuthorityFleet } = await import(`${root}/src/vehicles/authorityFleet.ts`);
const { createAuthoritativeMatch } = await import(`${root}/src/sim/authoritativeMatch.ts`);
const { matchRulesetFor } = await import(`${root}/src/sim/matchRuleset.ts`);
const { SIM_DT } = await import(`${root}/src/sim/movement.ts`);
const { writeFileSync } = await import('node:fs');
const mapId = process.argv[2] ?? 'frontier', seconds = Number(process.argv[3] ?? 60), seed = Number(process.argv[4] ?? 8100);
const pool = ALL_TANK_IDS.filter((id) => ['mbt', 'medium', 'heavy', 'light'].includes(getSpec(id).role)).slice(0, 14);
await ensureAuthorityFleet(pool);
const players = Array.from({ length: 28 }, (_, i) => ({ id: `bot-${i}`, specId: pool[i % pool.length], team: i < 14 ? 'alpha' : 'bravo', bot: true }));
const world = createDedicatedWorldCollision(mapId);
const match = createAuthoritativeMatch({ players, mapId, seed, countdownS: 0, worldCollision: world, ruleset: matchRulesetFor('standard') });
match.onMatchReady();
const pops = [], popsY = [];
let stepMs = 0;
const near = [];
for (let tick = 0; tick < Math.round(seconds / SIM_DT) && !match.result; tick++) {
  const pre = new Map(match.entities.map((e) => [e.id, { x: e.state.pos.x, y: e.state.pos.y, z: e.state.pos.z, speed: e.state.speed,
    recoil: Math.hypot(e.state._spring.recoilVX, e.state._spring.recoilVZ), pitch: e.state.visualPitch, roll: e.state.visualRoll, yaw: e.state.yaw, grounded: e.state.grounded }]));
  const t0 = performance.now();
  match.step({ dt: SIM_DT, inputs: new Map() });
  stepMs += performance.now() - t0;
  for (const e of match.entities) {
    if (e.modeActive === false) continue;
    const s = e.state, p = pre.get(e.id);
    const allowed = (Math.max(Math.abs(p.speed), Math.abs(s.speed)) + p.recoil) * SIM_DT + 1.2 * Math.abs(s.yawRate) * SIM_DT + 0.002;
    const pop = Math.hypot(s.pos.x - p.x, s.pos.z - p.z) - allowed;
    if (s.landingImpactMps <= 0) {
      const popY = Math.abs(s.pos.y - p.y - s._ride.v * SIM_DT);
      if (popY > 0.05) popsY.push({ t: +match.timeS.toFixed(2), id: e.id, spec: e.specId, popY: +popY.toFixed(3), dy: +(s.pos.y - p.y).toFixed(3),
        x: +s.pos.x.toFixed(1), z: +s.pos.z.toFixed(1), sup: +s._sup.y.toFixed(2), floor: +s._sup.floorY.toFixed(2), grounded: s.grounded });
    }
    if (pop <= 0.05) continue;
    world.queryObstacles(s.pos.x - 6, s.pos.z - 6, s.pos.x + 6, s.pos.z + 6, near);
    pops.push({ t: +match.timeS.toFixed(2), id: e.id, spec: e.specId, pop: +pop.toFixed(3),
      dx: +(s.pos.x - p.x).toFixed(3), dz: +(s.pos.z - p.z).toFixed(3), speed: +p.speed.toFixed(2), speed1: +s.speed.toFixed(2),
      impact: s.impactSource, n: [+s.impactNx.toFixed(2), +s.impactNz.toFixed(2)], grounded: [p.grounded, s.grounded],
      pitch: [+p.pitch.toFixed(3), +s.visualPitch.toFixed(3)], roll: [+p.roll.toFixed(3), +s.visualRoll.toFixed(3)],
      dyaw: +(s.yaw - p.yaw).toFixed(3), y: +s.pos.y.toFixed(2),
      near: near.filter((r) => !r.crushed).map((r) => `${r.kind ?? '-'}${r.crushable ? '(c)' : ''} y${r.min[1].toFixed(1)}..${r.max[1].toFixed(1)}`).slice(0, 6) });
  }
}
const out = { mapId, seconds: match.timeS, stepMsMean: +(stepMs / (match.timeS / SIM_DT)).toFixed(3), pops: pops.length, popsY: popsY.length,
  popMax: pops.reduce((a, b) => Math.max(a, b.pop), 0), popYMax: popsY.reduce((a, b) => Math.max(a, b.popY), 0), list: pops.sort((a, b) => b.pop - a.pop).slice(0, 40),
  listY: popsY.sort((a, b) => b.popY - a.popY).slice(0, 20) };
const json = process.argv.find((a) => a.startsWith('--json='));
if (json) writeFileSync(json.slice(7), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ ...out, list: out.list.slice(0, 12), listY: out.listY.slice(0, 6) }, null, 1));
process.exit(0);
