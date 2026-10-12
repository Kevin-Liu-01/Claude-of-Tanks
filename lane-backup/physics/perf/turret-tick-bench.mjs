// physics lane scratch: the turret world alone in a 14v14-like scene — 28 hulls on flat ground (8 dead, their turrets
// thrown at staggered ticks, 20 live hulls driving slowly), stepped 1800 ticks; CPU of turrets.step per tick.
//   node turret-tick-bench.mjs --tree=<repo>
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const tree = path.resolve(process.argv.find((a) => a.startsWith('--tree='))?.slice(7));
const at = (p) => pathToFileURL(path.join(tree, p)).href;
const { getSpec } = await import(at('src/vehicles/specs.ts'));
const { createWreckTurrets, createWreckEnvironment } = await import(at('src/sim/wreckTurrets.ts'));
const turrets = createWreckTurrets({ seed: 3, capacity: 64 });
turrets.bind(createWreckEnvironment(() => 0, [], []));
const specs = ['m1a2', 't90m', 'kv2', 'leopard2a6', 't72b3'].map((id) => { try { return getSpec(id); } catch { return getSpec('m1a2'); } });
const tanks = [];
for (let i = 0; i < 28; i++) {
  tanks.push({ id: `t${i}`, spec: specs[i % specs.length], combat: { destroyed: false },
    state: { pos: { x: (i % 7) * 18 - 54, y: 0, z: Math.floor(i / 7) * 22 - 33 }, yaw: i * 0.7, visualPitch: 0, visualRoll: 0, turretYaw: 0.3 * i, speed: i < 8 ? 0 : 4, verticalSpeed: 0, yawRate: 0 } });
}
let cpu = 0, n = 0;
for (let tick = 1; tick <= 1800; tick++) {
  if (tick >= 120 && tick % 90 === 0) { const k = (tick / 90) - 2; if (k < 8) { tanks[k].combat.destroyed = true; turrets.launch(tanks[k], 'ammorack', tick); } }
  for (let i = 8; i < 28; i++) { const t = tanks[i]; t.state.pos.x += Math.sin(t.state.yaw) * t.state.speed / 60; t.state.pos.z += Math.cos(t.state.yaw) * t.state.speed / 60; t.state.yaw += 0.002; }
  const c0 = process.cpuUsage(); turrets.step(tanks); const c = process.cpuUsage(c0);
  if (tick > 120) { cpu += (c.user + c.system) / 1000; n++; }
}
console.log(`${path.basename(tree)}: turrets.step CPU ${(cpu / n).toFixed(4)} ms/tick over ${n} ticks`);
