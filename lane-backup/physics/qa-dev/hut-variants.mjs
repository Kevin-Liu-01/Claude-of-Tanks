// physics lane scratch (dcore's field hut jitter, 2026-10-11): the hut's fall (every link broken, anchors asleep) in a
// rigid world like the debris pool's, with engine-side variants applied to the shapes: what stops the thin pieces'
// stirring. Reports asleep counts and the fastest spins at 8 s.
import * as THREE from 'three';
const KIT = '/private/tmp/claude-501/-Users-kevinliu--codex-worktrees-cot-restore-1049-visuals-20260911/6412983f-6279-4f04-92ea-e3d886747505/scratchpad/destruction/kit-wt/src/world/maps/shedKit.ts';
const kit = await import(KIT);
const { createRigidShape, createRigidWorld } = await import('../src/sim/rigidBody.ts');
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const style = kit.shedStyleFor('verdant');
const which = process.argv.find((a) => a.startsWith('--kit='))?.slice(6) ?? 'fieldhut';
const b = (which === 'leanto' ? kit.buildShedLeanTo : kit.buildShedFieldHut)(style, rng(7));
const pieces = b.anatomy.pieces;
const variants = {
  base: {},
  inertia20: { inertiaRatio: 20 },
  inertia50: { inertiaRatio: 50 },
  drag: { angularDrag: 0.6 },
  iters16: { velocityIterations: 16, positionIterations: 4 },
  piter8: { positionIterations: 8 },
  masssqrt: { massMode: 'sqrt' },
  massclamp: { massMode: 'clamp' },
  vi16pi8: { velocityIterations: 16, positionIterations: 8 },
  rest0: { restitution: 0 },
  rest0ir20: { restitution: 0, inertiaRatio: 20 },
};
const masses = pieces.map((p) => Math.max(0.5, p.massKg)).sort((a, b) => a - b);
const median = masses[masses.length >> 1];
const pick = (process.argv.find((a) => a.startsWith('--v='))?.slice(4) ?? Object.keys(variants).join(',')).split(',');
for (const name of pick) {
  const v = variants[name];
  const world = createRigidWorld({ capacity: 96, kinematicCapacity: 0, spherePool: 96 * 64, velocityIterations: v.velocityIterations ?? 8, positionIterations: v.positionIterations ?? 3, contactsPerBody: 28 });
  world.bindEnvironment({ groundAt: () => 0 });
  const slots = pieces.map((p) => {
    const m0 = Math.max(0.5, p.massKg);
    const mass = v.massMode === 'sqrt' ? Math.sqrt(m0 * median) : v.massMode === 'clamp' ? Math.min(median * 4, Math.max(median / 4, m0)) : m0;
    const shape = createRigidShape([{ kind: 'box', center: [0, 0, 0], half: p.h.map((h) => Math.max(0.01, h)), mass }],
      { restitution: v.restitution ?? 0.15, friction: 0.7, ...(v.angularDrag ? { angularDrag: v.angularDrag } : {}) });
    if (v.inertiaRatio) {
      // floor each axis's inertia at the largest's 1/ratio (the frozen shape's array is writable)
      const I = Array.from(shape.invInertia, (x) => 1 / x), top = Math.max(...I);
      for (let k = 0; k < 3; k++) shape.invInertia[k] = 1 / Math.max(I[k], top / v.inertiaRatio);
    }
    return world.spawn(shape, { x: p.c[0], y: p.c[1], z: p.c[2], qx: p.q[0], qy: p.q[1], qz: p.q[2], qw: p.q[3], asleep: !!p.anchor });
  });
  const spins8 = [];
  let awakeTimeline = [];
  for (let s = 1; s <= 900; s++) {
    world.step();
    if (s === 480) slots.forEach((slot, i) => { if (!world.asleep[slot]) spins8.push([Math.hypot(world.wx[slot], world.wy[slot], world.wz[slot]), pieces[i].role + i]); });
    if (s % 180 === 0) awakeTimeline.push(slots.filter((slot) => !world.asleep[slot]).length);
  }
  spins8.sort((a, b) => b[0] - a[0]);
  const asleep = slots.filter((slot) => world.asleep[slot]).length;
  console.log(`${which} ${name.padEnd(9)} asleep at 15 s ${asleep}/${pieces.length}; awake at 3/6/9/12/15 s ${awakeTimeline.join('/')}; fastest spins at 8 s ${spins8.slice(0, 5).map(([w, n]) => `${n} ${w.toFixed(2)}`).join(', ')}`);
}
