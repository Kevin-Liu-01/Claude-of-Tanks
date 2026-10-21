// thermalWreckCooling.selftest.mjs — (ac130-fx-228 follow-up, the coordinator: "a killed vehicle goes dark at once in
// thermal") a destroyed hull keeps its heat in a heat-imaging lens and cools by the simulation clock: full heat at the
// kill, its stand-ins' heat scale falling as exp(-age / WRECK_COOL_S) in WRECK_HEAT_LEVELS steps, the cold wreck's own
// material once under a step. The kill's time is noted every frame, lens or not (a lens raised later sees the true age);
// the wreck keeps its hull's own stand-ins (fx-ir-hull-heat-229: one per vehicle and part, one heat program); without a
// clock a wreck is cold, as before; a revived hull starts its clock again. Render-only: the shared fleet material is never
// touched.
import assert from 'node:assert/strict';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, ShaderLib } from 'three';
import { createThermalVehicles, HEAT_FRIENDLY, WRECK_COOL_S, WRECK_HEAT_LEVELS, wreckHeatLevel } from './thermalVehicles.ts';

const source = new MeshStandardMaterial({ color: 0x476234 });
const scene = new Group();
const actor = (id, team, destroyed) => {
  const root = new Group(), mesh = new Mesh(new BoxGeometry(), source);
  root.add(mesh); scene.add(root);
  return { id, team, visual: { root }, combat: { destroyed }, state: { speed: 0 }, mesh };
};
const live = actor('live', 'enemy', false), wreck = actor('wreck', 'enemy', false);
const heat = createThermalVehicles();
const frame = (active, timeS) => { heat.begin([live, wreck], active, 'ally', timeS); const seen = [live.mesh.material, wreck.mesh.material]; heat.end(); return seen; };
/** a stand-in's heat uniforms, read through its own compile hook on three's standard shaders */
const uniformsOf = (m) => { const sh = { uniforms: {}, vertexShader: ShaderLib.standard.vertexShader, fragmentShader: ShaderLib.standard.fragmentShader }; m.onBeforeCompile(sh); return sh.uniforms; };
const scaleOf = (m) => uniformsOf(m).uHeatK.value.z;

// the curve: full at the kill, falling, cold past ~5 time constants, never rising
assert.equal(wreckHeatLevel(0), 1);
let last = 1;
for (let t = 0; t <= 200; t += 0.5) { const h = wreckHeatLevel(t); assert.ok(h <= last + 1e-12, 'a wreck never warms'); last = h; }
assert.equal(wreckHeatLevel(WRECK_COOL_S * 5), 0, 'cold within five time constants');
assert.equal(wreckHeatLevel(-1), 0);

frame(true, 99);
const hostile = frame(true, 99.5)[0];
assert.ok(hostile !== source, 'a live hostile hull is hot');
assert.equal(scaleOf(hostile), 1, 'at full heat');
const wreckLive = frame(true, 99.6)[1];
// destroyed at 100 with the lens down: the clock starts anyway
wreck.combat.destroyed = true;
frame(false, 100);
assert.ok(frame(false, 100.5)[1] === source, 'no stand-in while the lens is down');
// the lens raised 20 s later sees a 20 s-old wreck
const [, at20] = frame(true, 120);
const expect20 = Math.round(Math.exp(-20 / WRECK_COOL_S) * WRECK_HEAT_LEVELS) / WRECK_HEAT_LEVELS;
assert.ok(at20 !== source, 'a 20 s-old wreck keeps a stand-in');
assert.ok(at20 === wreckLive, 'its own hull\'s stand-in (one per vehicle and part)');
assert.ok(Math.abs(scaleOf(at20) - expect20) < 1e-9, `it glows at ${expect20.toFixed(3)} of a live hull (${scaleOf(at20).toFixed(3)})`);
// the same heat program: one key and hook for every stand-in, so the wreck links nothing new
assert.equal(at20.customProgramCacheKey(), hostile.customProgramCacheKey(), 'the cooling stand-in shares the heat program');
assert.equal(at20.onBeforeCompile.toString(), hostile.onBeforeCompile.toString());
// cooler as it ages, by the clock (the same age, the same heat)
frame(true, 140);
const at40 = scaleOf(at20); // the uniforms are the hull's: read after its frame at 140 s
assert.ok(at40 < expect20, 'and cools as it ages');
frame(true, 120);
assert.ok(Math.abs(scaleOf(at20) - expect20) < 1e-9, 'the same wreck age, the same heat');
// cold: the wreck's own material again
assert.ok(frame(true, 100 + WRECK_COOL_S * 5)[1] === source, 'a cold wreck shows its own material');
assert.equal(source.emissive.r, 0, 'the shared fleet material is never touched');
// a revived hull starts its clock again
wreck.combat.destroyed = false; frame(true, 300);
wreck.combat.destroyed = true; frame(false, 310);
const again = frame(true, 310)[1];
assert.ok(again !== source && scaleOf(again) === 1, 'a hull destroyed again is hot again at its new kill');
// a friendly hull: the old friendly share
const friend = actor('friend', 'ally', false);
heat.begin([friend], true, 'ally', 311); const friendly = friend.mesh.material; heat.end();
assert.ok(Math.abs(scaleOf(friendly) - HEAT_FRIENDLY) < 1e-9, 'a friendly hull at the friendly share');
// without a clock (the old callers) a wreck gets nothing
const unclocked = createThermalVehicles();
unclocked.begin([wreck], true, 'ally');
assert.ok(wreck.mesh.material === source, 'without the battle clock a wreck is cold, as before');
unclocked.end();
console.log(`thermalWreckCooling: a wreck stays hot in the heat lens and cools by the battle clock (${expect20.toFixed(2)} at 20 s, cold by ${WRECK_COOL_S * 5} s), on its hull's own stand-ins and the one heat program`);
