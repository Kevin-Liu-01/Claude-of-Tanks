// physics lane (wave 409 regression): the real collapse pipeline (structureFracture + collapseBodies over the debris
// pool) for several buildings and blow sides; per run: cracks (bodies grown), the final heap: mass-weighted mean height,
// pieces whose top stands above 2.5 m (propped / standing), the tallest top, the settle time. Averaged over the runs.
//   COT_TREE=<tree> node --experimental-strip-types --no-warnings heap-metric.mjs [--runs=...]
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const root = process.env.COT_TREE ?? process.cwd();
const imp = (p) => import(pathToFileURL(`${root}/${p}`).href);
const THREE = await import(pathToFileURL(createRequire(`${root}/package.json`).resolve('three')).href);
const { ARCHITECTURE_STYLES, buildRegionalParts, regionalKitPlanOf } = await imp('src/world/maps/regional/index.ts');
const { streamFrom } = await imp('src/world/maps/regional/geometry.ts');
const { structureDamageKitChain } = await imp('src/world/destructionKit.ts');
const { createDebrisPhysics } = await imp('src/fx/debrisPhysics.ts');
const { createStructureFracture } = await imp('src/fx/structureFracture.ts');
const { createCollapseBodies } = await imp('src/fx/collapseBodies.ts');
const buildings = [['kolkhoz', 'barn', [9, 14, 7], 'brick'], ['franconian', 'rowhouse', [7, 10, 10], 'stone'], ['hessian', 'cottage', [8, 10, 6.5], 'stone']];
const sides = ['front', 'back', 'left', 'right'];
const agg = { runs: 0, mh: 0, high: 0, top: 0, still: 0, bodies: 0, cracks: 0 };
const rows = [];
for (const [styleId, builder, [w, d, h], wall] of buildings) {
  for (const sideName of sides) {
    const place = { x: 30, y: 0, z: -12, yaw: 0.4 };
    const style = ARCHITECTURE_STYLES.find((s) => s.id === styleId);
    const parts = buildRegionalParts(style, { structureId: builder, info: { w, d, h }, bounds: { minX: -w / 2, maxX: w / 2, minZ: -d / 2, maxZ: d / 2, maxY: h },
      wallBucket: wall, rng: streamFrom(7), variant: streamFrom(52), mapId: 'damage', snowCap: false, tier: 'desktop' }, streamFrom(26));
    const describe = structureDamageKitChain(builder, styleId).find((k) => k.describe)?.describe;
    if (!describe) { console.log('no describe for', styleId, builder); continue; }
    const anatomy = describe({ structureIdx: 7, mapId: 'damage', builder, style: styleId, parts, w, d, h, placement: place, massClass: 'house', seed: 5, kitPlan: regionalKitPlanOf(parts) });
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
    const bodies = createCollapseBodies({ pool, group, materialFor: (b) => mats.get(b) ?? null, groundAt: () => 0, environment: () => null, now: () => 0, alsoLive: () => fracture.liveBodies() > 0 });
    const resolve = (b) => mats.get(b) ?? null;
    let spawnsAfter = 0, impacts = 0, armed = false;
    const spawn0 = pool.spawn.bind(pool);
    const born = new Map(); // handle -> [x, y, z, delay]
    pool.spawn = (shape, sp, delay) => { if (armed) spawnsAfter++; const h = spawn0(shape, sp, delay); if (h >= 0) born.set(h, [sp.x, sp.y, sp.z, delay ?? 0, !!sp.asleep]); return h; };
    const frozenAt = new Map(); // handle -> still at its birth place when last seen
    const poseScratch = new Float64Array(7);
    pool.onImpact((x, y, z, speed) => { if (armed && speed >= 2) impacts++; });
    bodies.prepare(seam, resolve);
    for (let i = 0; i < 30; i++) bodies.update(1 / 60);
    const faces = anatomy.storeys.map((st) => st.faces.find((f) => f.name === sideName) ?? st.faces[0]);
    const f2 = faces[Math.min(1, faces.length - 1)];
    const toW = (u, v) => new THREE.Vector3(f2.origin[0] + f2.u[0] * u + f2.out[0] * 0.05, f2.origin[1] + v, f2.origin[2] + f2.u[2] * u + f2.out[2] * 0.05).applyMatrix4(m4);
    const dirW = new THREE.Vector3(-f2.out[0], 0, -f2.out[2]).applyQuaternion(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), place.yaw));
    const rounds = [[-1.6, 0.6], [1.2, 1.4], [-0.6, 2.2], [0.6, 0.6], [-1.2, 1.4], [1.6, 2.0], [0, 1.0], [-2.0, 1.8], [2.2, 0.8], [0.4, 2.4]];
    let next = 0, collapsed = false, stillAt = -1, maxBodies = 0;
    for (let s = 0; s < 60 * 13; s++) {
      const t = s / 60;
      if (next < rounds.length && t >= 0.5 + next * 0.3) { const p = toW(rounds[next][0], rounds[next][1]); fracture.strike(seam, p.x, p.y, p.z, dirW.x, dirW.z, 'he', 1.2, 152); next++; }
      if (!collapsed && t >= 3.6) {
        armed = true;
        collapsed = bodies.collapse(seam, { structureId: 7, cause: 'blast', dirX: dirW.x, dirZ: dirW.z, x: place.x, y: 6, z: place.z, baseY: 0, topY: h,
          cx: place.x, cz: place.z, hw: w / 2, hd: d / 2, stage: 'collapsed' }, fracture.standing(7), resolve, () => fracture.release(7));
      }
      clock += 1 / 60;
      bodies.update(1 / 60);
      fracture.update();
      const st = pool.stats();
      maxBodies = Math.max(maxBodies, st.bodies);
      if (collapsed && s % 30 === 0) for (const [h, b] of born) { if (pool.framePoseAt(h, poseScratch)) frozenAt.set(h, Math.hypot(poseScratch[0] - b[0], poseScratch[1] - b[1], poseScratch[2] - b[2]) < 0.02 && b[1] > 0.8); }
      if (collapsed && stillAt < 0 && t > 4.5 && st.awake === 0) stillAt = t;
    }
    // the final heap from the drawn collapse meshes (baked or live): the triangles' mean height, the share of them
    // above 2.5 m (what stands or is propped), the tallest point
    let sum = 0, count = 0, above = 0, top = 0, n = 0;
    const v = new THREE.Vector3();
    group.updateMatrixWorld(true);
    for (const m of group.children) {
      if (!m.name.startsWith('fx-collapse-') || m.name.startsWith('fx-collapse-remnant')) continue;
      const p = m.geometry.getAttribute('position');
      if (!p) continue;
      n++;
      for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(m.matrix); sum += v.y; count++; if (v.y > 2.5) above++; if (v.y > top) top = v.y; }
    }
    const mhv = count ? sum / count : 0, high = count ? above / count : 0;
    let frozen = 0; for (const v of frozenAt.values()) if (v) frozen++;
    const row = { b: `${styleId}/${builder}`, side: sideName, collapsed, bodies: n, maxBodies, mh: mhv, high, top, still: stillAt, spawnsAfter, impacts, frozen };
    rows.push(row);
    agg.runs++; agg.frozen = (agg.frozen ?? 0) + frozen; agg.spawns = (agg.spawns ?? 0) + spawnsAfter; agg.impacts = (agg.impacts ?? 0) + impacts; agg.mh += row.mh; agg.high += high; agg.top += top; agg.still += stillAt > 0 ? stillAt : 13; agg.bodies += maxBodies;
  }
}
for (const r of rows) console.log(`  ${r.b.padEnd(20)} ${r.side.padEnd(6)} collapsed ${r.collapsed} meshes ${r.bodies} (max bodies ${r.maxBodies}) mean h ${r.mh.toFixed(2)} above2.5 ${(100 * r.high).toFixed(1)}% top ${r.top.toFixed(2)} still ${r.still.toFixed(1)} frozen ${r.frozen}`);
console.log(`HEAP ${(process.env.RB_LABEL ?? '').padEnd(14)} runs ${agg.runs}: mean height ${(agg.mh / agg.runs).toFixed(2)} m, above 2.5 m ${(100 * agg.high / agg.runs).toFixed(1)} %, tallest ${(agg.top / agg.runs).toFixed(2)} m, still ${(agg.still / agg.runs).toFixed(1)} s, max bodies ${(agg.bodies / agg.runs).toFixed(0)}, spawns after collapse ${(agg.spawns / agg.runs).toFixed(1)}, impacts>=2 ${(agg.impacts / agg.runs).toFixed(0)}, never moved (above 0.8 m) ${(agg.frozen / agg.runs).toFixed(1)}`);
