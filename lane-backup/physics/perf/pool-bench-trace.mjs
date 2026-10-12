// dcore → physics (2026-10-11): the debris pool's cost in a struck house's collapse, as the presentation drives it.
// A franconian rowhouse (per-bucket spans, placed off the origin), five 152 mm HE rounds on its front through the wall
// fracture (structureFracture), then its collapse as bodies (collapseBodies) in the same pool; the pool advanced at 60 Hz
// for 12 s as effects.ts drives it (collapseBodies.update steps it, the fracture follows). Reports ms per advance (mean,
// p95, max), the awake count and bodies over time, and the final heap. Run from a tree at feat/prop-fracture c375d26f0
// (or later):  node --experimental-strip-types --no-warnings <this file> [--steps=720]
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
// the tree under test (its own three, its own sources): COT_TREE or the working directory
const root = process.env.COT_TREE ?? process.cwd();
const imp = (p) => import(pathToFileURL(`${root}/${p}`).href);
const THREE = await import(pathToFileURL(createRequire(`${root}/package.json`).resolve('three')).href);
const { ARCHITECTURE_STYLES, buildRegionalParts, regionalKitPlanOf } = await imp('src/world/maps/regional/index.ts');
const { streamFrom } = await imp('src/world/maps/regional/geometry.ts');
const { structureDamageKitChain } = await imp('src/world/destructionKit.ts');
const { createDebrisPhysics } = await imp('src/fx/debrisPhysics.ts');
const { createStructureFracture } = await imp('src/fx/structureFracture.ts');
const { createCollapseBodies } = await imp('src/fx/collapseBodies.ts');

const steps = Number(process.argv.find((a) => a.startsWith('--steps='))?.slice(8) ?? 720);
const [w, d, h] = [7, 10, 10];
const place = { x: 30, y: 0, z: -12, yaw: 0.4 };
const style = ARCHITECTURE_STYLES.find((s) => s.id === 'franconian');
const parts = buildRegionalParts(style, { structureId: 'rowhouse', info: { w, d, h }, bounds: { minX: -w / 2, maxX: w / 2, minZ: -d / 2, maxZ: d / 2, maxY: h },
  wallBucket: 'stone', rng: streamFrom(7), variant: streamFrom(52), mapId: 'damage', snowCap: false, tier: 'desktop' }, streamFrom(26));
const describe = structureDamageKitChain('rowhouse', 'franconian').find((k) => k.describe)?.describe;
const anatomy = describe({ structureIdx: 7, mapId: 'damage', builder: 'rowhouse', style: 'franconian', parts, w, d, h, placement: place,
  massClass: 'house', seed: 5, kitPlan: regionalKitPlanOf(parts) });
const m4 = new THREE.Matrix4().compose(new THREE.Vector3(place.x, place.y, place.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), place.yaw), new THREE.Vector3(1, 1, 1));
const mats = new Map(), spans = [];
for (const [bucket, geos] of Object.entries(parts)) {
  if (!Array.isArray(geos)) continue;
  const pos = [], nrm = [], col = [];
  for (const g0 of geos) {
    if (!g0?.attributes?.position) continue;
    const g = (g0.index ? g0.toNonIndexed() : g0.clone()).applyMatrix4(m4);
    const p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nrm.push(n ? n.getX(i) : 0, n ? n.getY(i) : 1, n ? n.getZ(i) : 0); col.push(1, 1, 1); }
  }
  if (!pos.length) continue;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const mat = new THREE.MeshStandardMaterial(); mat.name = bucket; mats.set(bucket, mat);
  spans.push({ mesh: new THREE.Mesh(geometry, mat), position: geometry.attributes.position, bucket, first: 0, count: pos.length / 3, partClass: 'wall', instanceId: null });
}
const seam = { structureIdx: 7, anatomy, spans, touchShadows() {} };
const group = new THREE.Group();
const pool = createDebrisPhysics({ capacity: 128 });
let clock = 0;
const fracture = createStructureFracture({ pool, group, materialFor: (_s, b) => mats.get(b) ?? null, now: () => clock, keepSpan: () => {} });
const bodies = createCollapseBodies({ pool, group, materialFor: (b) => mats.get(b) ?? null, groundAt: () => 0, environment: () => null, now: () => 0,
  alsoLive: () => fracture.liveBodies() > 0 });
// time each pool advance (the presentation's own call inside collapseBodies.update)
const adv = pool.advance.bind(pool);
const times = [];
const trace = [];
let stepMs = 0, stepsThis = 0;
const wstep = pool.world.step.bind(pool.world);
pool.world.step = (dt) => { const c0 = process.cpuUsage(); wstep(dt); const c = process.cpuUsage(c0); stepMs += (c.user + c.system) / 1000; stepsThis++; };
pool.advance = (dt) => { stepMs = 0; stepsThis = 0; const t0 = performance.now(); const r = adv(dt); const ms = performance.now() - t0; times.push(ms); trace.push([times.length, ms, pool.world.awakeCount, pool.world.contactCount ?? -1, pool.world.count, stepMs, stepsThis]); return r; };
process.on('exit', () => { const top = trace.slice().sort((a, b) => b[5] - a[5]).slice(0, 12); console.log('slowest advances [n, ms, awake, contacts, bodies, step ms, steps]:', JSON.stringify(top.map((t) => [t[0], +t[1].toFixed(1), t[2], t[3], t[4], +t[5].toFixed(1), t[6]])));
  const st = trace.map((t) => t[5]).sort((a, b) => a - b); console.log('world.step CPU ms per advance: mean', (st.reduce((a, b) => a + b, 0) / st.length).toFixed(3), 'p95', st[Math.floor(st.length * 0.95)].toFixed(2), 'max', st[st.length - 1].toFixed(2));
  const byBucket = {}; for (const t of trace) { const k = t[2] < 20 ? '<20' : t[2] < 40 ? '20-39' : t[2] < 60 ? '40-59' : '60+'; (byBucket[k] ??= []).push(t[1]); }
  console.log('mean ms by awake count:', JSON.stringify(Object.fromEntries(Object.entries(byBucket).map(([k, v]) => [k, +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2) + ' (' + v.length + ')']))));
  const ct = trace.filter((t) => t[3] >= 0); if (ct.length) console.log('contacts: mean', (ct.reduce((a, t) => a + t[3], 0) / ct.length).toFixed(0), 'max', Math.max(...ct.map((t) => t[3]))); });
const resolve = (b) => mats.get(b) ?? null;
bodies.prepare(seam, resolve);
for (let i = 0; i < 30; i++) bodies.update(1 / 60);
// five rounds on the front, a storey and two up, 0.3 s apart (fr-house), then the collapse at 2.2 s
const front = anatomy.storeys.map((st) => st.faces.find((f) => f.name === 'front'));
const f2 = front[Math.min(2, front.length - 1)];
const toW = (u, v) => new THREE.Vector3(f2.origin[0] + f2.u[0] * u + f2.out[0] * 0.05, f2.origin[1] + v, f2.origin[2] + f2.u[2] * u + f2.out[2] * 0.05).applyMatrix4(m4);
const dirW = new THREE.Vector3(-f2.out[0], 0, -f2.out[2]).applyQuaternion(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), place.yaw));
const rounds = [[-1.6, 0.6], [1.2, 1.4], [-0.6, 2.2], [0.6, 0.6], [-1.2, 1.4]];
let next = 0, collapsed = false;
const awake = [];
for (let s = 0; s < steps; s++) {
  const t = s / 60;
  if (next < rounds.length && t >= 0.5 + next * 0.3) {
    const p = toW(rounds[next][0], rounds[next][1]);
    fracture.strike(seam, p.x, p.y, p.z, dirW.x, dirW.z, 'he', 1.2, 152);
    next++;
  }
  if (!collapsed && t >= 2.2) {
    collapsed = bodies.collapse(seam, { structureId: 7, cause: 'blast', dirX: dirW.x, dirZ: dirW.z, x: place.x, y: 6, z: place.z, baseY: 0, topY: h,
      cx: place.x, cz: place.z, hw: w / 2, hd: d / 2, stage: 'collapsed' }, fracture.standing(7), resolve, () => fracture.release(7));
  }
  clock += 1 / 60;
  bodies.update(1 / 60);
  fracture.update();
  if (s % 30 === 0) awake.push(`${t.toFixed(1)}s:${pool.stats().awake}/${pool.stats().bodies}`);
}
const sorted = times.slice().sort((a, b) => a - b);
const mean = times.reduce((a, b) => a + b, 0) / Math.max(1, times.length);
console.log(`pool advances: ${times.length}, mean ${mean.toFixed(3)} ms, p95 ${sorted[Math.floor(sorted.length * 0.95)]?.toFixed(3)} ms, max ${sorted[sorted.length - 1]?.toFixed(3)} ms, total ${(mean * times.length).toFixed(0)} ms`);
console.log(`awake/bodies every 0.5 s: ${awake.join(' ')}`);
console.log(`collapse taken ${collapsed}; fracture ${JSON.stringify(fracture.stats())}; collapse ${JSON.stringify(bodies.stats())}`);
