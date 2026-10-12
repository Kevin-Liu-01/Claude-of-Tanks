// which contacts keep the field hut's spinning rafter stirring (DBG accessor, never committed)
const KIT = '/private/tmp/claude-501/-Users-kevinliu--codex-worktrees-cot-restore-1049-visuals-20260911/6412983f-6279-4f04-92ea-e3d886747505/scratchpad/destruction/kit-wt/src/world/maps/shedKit.ts';
const kit = await import(KIT);
const { createRigidShape, createRigidWorld } = await import('../src/sim/rigidBody.ts');
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const b = kit.buildShedFieldHut(kit.shedStyleFor('verdant'), rng(7));
const pieces = b.anatomy.pieces;
const world = createRigidWorld({ capacity: 96, kinematicCapacity: 0, spherePool: 96 * 64, velocityIterations: 8, positionIterations: 3, contactsPerBody: 28 });
world.bindEnvironment({ groundAt: () => 0 });
const slots = pieces.map((p) => world.spawn(createRigidShape([{ kind: 'box', center: [0, 0, 0], half: p.h.map((h) => Math.max(0.01, h)), mass: Math.max(0.5, p.massKg) }], { restitution: 0.15, friction: 0.7 }),
  { x: p.c[0], y: p.c[1], z: p.c[2], qx: p.q[0], qy: p.q[1], qz: p.q[2], qw: p.q[3], asleep: !!p.anchor }));
const target = Number(process.argv[2] ?? 11);
const slot = slots[target];
const D = world._dbg;
const name = (bb) => bb >= 0 ? `${pieces[slots.indexOf(bb)].role}${slots.indexOf(bb)}${world.asleep[bb] ? '(z)' : ''}` : bb === -1 ? 'ground' : bb === -2 ? 'static/sleeper' : `kin${-3 - bb}`;
for (let s = 1; s <= 600; s++) {
  world.step();
  if (s >= 470 && s <= 482 || s % 120 === 0) {
    const w = Math.hypot(world.wx[slot], world.wy[slot], world.wz[slot]);
    const rows = [];
    for (let c = 0; c < D.n; c++) {
      if (D.cA[c] !== slot && D.cB[c] !== slot) continue;
      const own = D.cA[c] === slot;
      rows.push(`${own ? '' : '*'}${name(own ? D.cB[c] : D.cA[c])} s${D.cSphere[c]} n(${D.cNx[c].toFixed(2)},${D.cNy[c].toFixed(2)},${D.cNz[c].toFixed(2)}) d${(D.cDepth[c] * 1000).toFixed(1)}mm j${D.cJn[c].toFixed(2)}`);
    }
    console.log(`${(s / 60).toFixed(2)} ${pieces[target].role}${target} w ${w.toFixed(2)} (${world.wx[slot].toFixed(2)},${world.wy[slot].toFixed(2)},${world.wz[slot].toFixed(2)}) y ${world.py[slot].toFixed(3)} contacts ${rows.length}: ${rows.slice(0, 10).join(' | ')}`);
  }
}
