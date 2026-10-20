// thermalWreckCooling.selftest.mjs — (ac130-fx-228 follow-up, the coordinator: "a killed vehicle goes dark at once in
// thermal") a destroyed hull keeps its heat in a heat-imaging lens and cools by the simulation clock: full heat at the
// kill, its stand-in's emission falling as exp(-age / WRECK_COOL_S) in WRECK_HEAT_LEVELS steps, the cold wreck's own
// material once under a step. The kill's time is noted every frame, lens or not (a lens raised later sees the true age);
// the cooling stand-ins share the live heat program (no new link); without a clock a wreck is cold, as before; a revived
// hull starts its clock again. Render-only: the shared fleet material is never touched.
import assert from 'node:assert/strict';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { createThermalVehicles, WRECK_COOL_S, WRECK_HEAT_LEVELS, wreckHeatLevel } from './thermalVehicles.ts';

const source = new MeshStandardMaterial({ color: 0x476234 });
const scene = new Group();
const actor = (team, destroyed) => {
  const root = new Group(), mesh = new Mesh(new BoxGeometry(), source);
  root.add(mesh); scene.add(root);
  return { team, visual: { root }, combat: { destroyed }, mesh };
};
const live = actor('enemy', false), wreck = actor('enemy', false);
const heat = createThermalVehicles();
const frame = (active, timeS) => { heat.begin([live, wreck], active, 'ally', timeS); const seen = [live.mesh.material, wreck.mesh.material]; heat.end(); return seen; };

// the curve: full at the kill, falling, cold past ~5 time constants, never rising
assert.equal(wreckHeatLevel(0), 1);
let last = 1;
for (let t = 0; t <= 200; t += 0.5) { const h = wreckHeatLevel(t); assert.ok(h <= last + 1e-12, 'a wreck never warms'); last = h; }
assert.equal(wreckHeatLevel(WRECK_COOL_S * 5), 0, 'cold within five time constants');
assert.equal(wreckHeatLevel(-1), 0);

frame(true, 99);
const hostile = frame(true, 99.5)[0];
assert.ok(hostile !== source, 'a live hostile hull is hot');
// destroyed at 100 with the lens down: the clock starts anyway
wreck.combat.destroyed = true;
frame(false, 100);
assert.ok(frame(false, 100.5)[1] === source, 'no stand-in while the lens is down');
// the lens raised 20 s later sees a 20 s-old wreck
const [, at20] = frame(true, 120);
const expect20 = Math.round(Math.exp(-20 / WRECK_COOL_S) * WRECK_HEAT_LEVELS) / WRECK_HEAT_LEVELS;
assert.ok(at20 !== source && at20 !== hostile, 'a 20 s-old wreck takes a cooling stand-in');
assert.ok(Math.abs(at20.emissive.r - hostile.emissive.r * expect20) < 1e-6, `it glows at ${expect20.toFixed(3)} of a live hull (${at20.emissive.r.toFixed(3)})`);
assert.ok(/cooling/.test(at20.name));
// the same heat program: the stand-ins' hook and key, so the cooling wreck links nothing new
assert.equal(at20.customProgramCacheKey(), hostile.customProgramCacheKey(), 'the cooling stand-in shares the heat program');
assert.equal(at20.onBeforeCompile.toString(), hostile.onBeforeCompile.toString());
// cooler as it ages, the same stand-in for the same step (deterministic, cached)
const at40 = frame(true, 140)[1];
assert.ok(at40.emissive.r < at20.emissive.r, 'and cools as it ages');
assert.ok(frame(true, 120)[1] === at20, 'one cached stand-in per step (the same wreck age, the same material)');
// cold: the wreck's own material again
assert.ok(frame(true, 100 + WRECK_COOL_S * 5)[1] === source, 'a cold wreck shows its own material');
assert.equal(source.emissive.r, 0, 'the shared fleet material is never touched');
// a revived hull starts its clock again
wreck.combat.destroyed = false; frame(true, 300);
wreck.combat.destroyed = true; frame(false, 310);
assert.ok(frame(true, 310)[1] === hostile, 'a hull destroyed again is hot again at its new kill');
// without a clock (the old callers) a wreck gets nothing
const unclocked = createThermalVehicles();
unclocked.begin([wreck], true, 'ally');
assert.ok(wreck.mesh.material === source, 'without the battle clock a wreck is cold, as before');
unclocked.end();
console.log(`thermalWreckCooling: a wreck stays hot in the heat lens and cools by the battle clock (${expect20.toFixed(2)} at 20 s, cold by ${WRECK_COOL_S * 5} s), on the live heat program`);
