// probe (dcore 2026-10-11): the redesign lane's lean-to and field hut (visual/destructible-kits-r1 2f40bca29) through the
// support graph and the debris pool: masses, links, the intact pose's overlaps, and two falls
import * as THREE from 'three';
const kit = await import('/private/tmp/claude-501/-Users-kevinliu--codex-worktrees-cot-restore-1049-visuals-20260911/6412983f-6279-4f04-92ea-e3d886747505/scratchpad/destruction/kit-wt/src/world/maps/shedKit.ts');
const { checkKitFracture } = await import('/private/tmp/claude-501/-Users-kevinliu--codex-worktrees-cot-restore-1049-visuals-20260911/6412983f-6279-4f04-92ea-e3d886747505/scratchpad/destruction/kit-wt/src/world/fractureAnatomy.ts');
const { createDebrisPhysics } = await import('../src/fx/debrisPhysics.ts');
const { createRigidShape } = await import('../src/sim/rigidBody.ts');
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const style = kit.shedStyleFor('verdant');
for (const [name, build] of [['leanto', kit.buildShedLeanTo], ['fieldhut', kit.buildShedFieldHut]]) {
  const b = build(style, rng(7));
  const a = b.anatomy, pos = b.geometry.attributes.position.array;
  const problems = checkKitFracture(a, pos);
  const byRole = new Map();
  let total = 0;
  for (const p of a.pieces) { byRole.set(p.role, (byRole.get(p.role) ?? 0) + p.massKg); total += p.massKg; }
  const links = new Map(); for (const l of a.links) links.set(l.kind, (links.get(l.kind) ?? 0) + 1);
  console.log(`${name}: ${a.pieces.length} pieces, ${(pos.length / 9) | 0} tris, ${total.toFixed(0)} kg, anchors ${a.pieces.filter((p) => p.anchor).length}, links ${JSON.stringify(Object.fromEntries(links))}, check ${problems.length ? problems.join('; ') : 'ok'}`);
  console.log('  mass by role', JSON.stringify(Object.fromEntries([...byRole].map(([k, v]) => [k, +v.toFixed(0)]))));
  // the intact pose's overlaps between pieces' boxes (SAT on OBBs): what a fall would push apart
  const axes = (p) => { const q = new THREE.Quaternion(p.q[0], p.q[1], p.q[2], p.q[3]); return [new THREE.Vector3(1, 0, 0).applyQuaternion(q), new THREE.Vector3(0, 1, 0).applyQuaternion(q), new THREE.Vector3(0, 0, 1).applyQuaternion(q)]; };
  const depthOf = (p, ap, q, aq) => {
    let least = Infinity;
    const cands = [...ap, ...aq];
    for (const x of ap) for (const y of aq) { const c = new THREE.Vector3().crossVectors(x, y); if (c.lengthSq() > 1e-6) cands.push(c.normalize()); }
    const d = new THREE.Vector3(q.c[0] - p.c[0], q.c[1] - p.c[1], q.c[2] - p.c[2]);
    for (const n of cands) {
      const rp = ap.reduce((s, x, i) => s + Math.abs(x.dot(n)) * p.h[i], 0), rq = aq.reduce((s, x, i) => s + Math.abs(x.dot(n)) * q.h[i], 0);
      const o = rp + rq - Math.abs(d.dot(n));
      if (o < least) least = o;
      if (least <= 0) return 0;
    }
    return least;
  };
  const A = a.pieces.map(axes);
  const overlaps = [];
  for (let i = 0; i < a.pieces.length; i++) for (let j = i + 1; j < a.pieces.length; j++) {
    const o = depthOf(a.pieces[i], A[i], a.pieces[j], A[j]);
    if (o > 0.02) overlaps.push([i, j, o]);
  }
  overlaps.sort((x, y) => y[2] - x[2]);
  console.log(`  box overlaps over 2 cm: ${overlaps.length}; deepest ${overlaps.slice(0, 6).map(([i, j, o]) => `${a.pieces[i].role}${i}-${a.pieces[j].role}${j} ${o.toFixed(2)}`).join(', ')}`);
  // a fall: every link broken, every non-anchor piece a body from its intact pose (anchors stand as bodies asleep)
  for (const shrink of [0, 0.03]) {
    const pool = createDebrisPhysics({ capacity: 96 });
    pool.bind({ groundAt: () => 0 });
    const handles = a.pieces.map((p) => {
      const shape = createRigidShape([{ kind: 'box', center: [0, 0, 0], half: p.h.map((h) => Math.max(0.01, h - shrink)), mass: Math.max(0.5, p.massKg) }], { restitution: 0.15, friction: 0.7 });
      return pool.spawn(shape, { x: p.c[0], y: p.c[1], z: p.c[2], qx: p.q[0], qy: p.q[1], qz: p.q[2], qw: p.q[3], asleep: !!p.anchor });
    });
    const pose = new Float64Array(7);
    let fastest = 0, far = 0, low = Infinity;
    const awakeAt8 = new Map();
    for (let t = 0; t < 15; t += 1 / 30) {
      pool.advance(1 / 30);
      if (t < 0.3) for (const h of handles) { const v = new Float64Array(6); if (pool.velocity(h, v)) fastest = Math.max(fastest, Math.hypot(v[0], v[1], v[2])); }
      if (Math.abs(t - 8) < 1 / 60) a.pieces.forEach((p, i) => { if (!pool.asleep(handles[i])) { const v = new Float64Array(6); pool.velocity(handles[i], v);
        awakeAt8.set(i, `${p.role}${i}(${Math.hypot(v[0], v[1], v[2]).toFixed(2)}m/s,${Math.hypot(v[3], v[4], v[5]).toFixed(2)}r/s,h${p.h.map((x) => x.toFixed(2)).join('/')})`); } });
    }
    console.log(`  awake at 8 s: ${[...awakeAt8.values()].slice(0, 14).join(' ')}`);
    let asleep = 0;
    a.pieces.forEach((p, i) => { pool.framePoseAt(handles[i], pose); far = Math.max(far, Math.hypot(pose[0] - p.c[0], pose[2] - p.c[2])); low = Math.min(low, pose[1]); if (pool.asleep(handles[i])) asleep++; });
    console.log(`  fall (boxes shrunk ${shrink} m): fastest in the first 0.3 s ${fastest.toFixed(1)} m/s, farthest ${far.toFixed(1)} m, lowest centre ${low.toFixed(2)} m, asleep at 15 s ${asleep}/${a.pieces.length}`);
  }
}
