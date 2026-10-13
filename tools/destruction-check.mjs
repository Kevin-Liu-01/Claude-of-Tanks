#!/usr/bin/env node
/**
 * destruction-check.mjs — every destructible building kind of a map destroyed in a staged scene, and what it left judged
 * (destruction stream, 2026-10-12; the owner: "make sure that destructible buildings are properly evaluated and their
 * rubble properly falls down onto ground that can potentially be uneven", after a Steinburg screenshot of "big flat
 * untextured grey-blue rectangles" in a broken brick wall and "rows of brick chunks hanging in the air in strips").
 *
 * Node-only and deterministic: the map's real props build (the world's own buckets, kits and seams), the real
 * presentation (fx/structureStages + structureMask + structureDebris + rubbleBodies on the engine), driven by the Studio's
 * destruction match under the battle's P1 rules (sections off): for each building picked, high-explosive rounds at its
 * widest face until it comes down, then the rubble's settling. The checks:
 *
 *  - textured: no stage run drawn in the presentation's untextured fallback (a bucket the world does not draw), and the
 *    room behind a hole drawn in its bucket's own texture (the owner's grey-blue rectangles);
 *  - no rim hangs: no unit of an earlier hole's rim stands inside a later hole's cut (the strips in the opening);
 *  - still pieces belong to their building: no pool piece lies still in the air (a roof's slipped tiles);
 *  - pieces lie on the ground: every thrown piece of the program rests on the ground as drawn where it lands, never over
 *    it (the strips over the heap's plateau); one buried by a heap risen after it landed is counted, not failed;
 *  - bodies rest on support: every rigid body comes to rest within the settling time, its lowest point on the ground, on
 *    another body or on a record (none hanging);
 *  - budget: bodies within the pool's cap, a stage's pieces and run vertices within its caps.
 *
 *   node tools/destruction-check.mjs [--map=urban] [--builders=firestation,cornershop,rowhouse] [--per-builder=1]
 *        [--rounds=12] [--settle=12] [--json=<out>]
 *
 * Exit 1 on a failed check. `tools/destruction-check.selftest.mjs` runs it on Steinburg.
 */
import * as THREE from 'three';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { installWorldBuildFixture } from './headlessWorldCollision.mjs';

const STEP = 1 / 60;

/** The check, as a function: the report (pass, per-building rows, failures). */
export async function runDestructionCheck({
  mapId = 'urban', builders = null, perBuilder = 1, rounds = 20, settleS = 12, roundGapS = 0.45, log = () => {},
} = {}) {
  installWorldBuildFixture();
  const [maps, terrain, vegetation, props, models, fleet] = await Promise.all([
    import('../src/world/maps/index.ts'), import('../src/world/terrain.ts'), import('../src/world/vegetation.ts'),
    import('../src/world/props.ts'), import('../src/world/propsModelStore.ts'), import('../src/vehicles/fleetFactory.ts')]);
  const { createStructureMask } = await import('../src/fx/structureMask.ts');
  const debrisMod = await import('../src/fx/structureDebris.ts');
  const { createStructureStages } = await import('../src/fx/structureStages.ts');
  // (a tree without the rigid rubble — main before 2026-10-12 — is judged too: its pieces by their own program's law)
  const rubbleMod = await import('../src/fx/rubbleBodies.ts').catch(() => null);
  const { createStudioDestruction } = await import('../src/game/studioDestruction.ts');
  const { matchRulesetFor } = await import('../src/sim/matchRuleset.ts');
  const { DESTRUCTION_BUS_EVENTS } = await import('../src/sim/destructionEvents.ts');
  const { createStructureDamageSeam } = await import('../src/world/structureDamageSeam.ts');
  const { createStructureDamage } = await import('../src/sim/structureDamage.ts');
  const { rubbleHeightFor, rubbleMoundHeightAt } = await import('../src/sim/terrainDeformation.ts');
  const { createObstacleGrid, shellPassesThroughCollisionRecord } = await import('../src/world/collision.ts');
  const { munitionClassForShell, munitionChargeKg } = await import('../src/sim/munitionBlast.ts');
  await models.preloadPropModels();

  const config = maps.getMapConfig(mapId);
  if (config.props?.tankWrecks?.ids?.length) await fleet.ensureTankBuilders(config.props.tankWrecks.ids);
  const field = terrain.createHeightField(1337, config);
  const engine = { anisotropy: 4, setupShadowMaterial() {} };
  const flora = vegetation.createVegetation(field, engine, 2001, config);
  const built = props.createProps(field, engine, 2002, config, flora);
  log(`props built: ${built.structureDamage.size} structures`);

  // the world's own bucket materials (what the presentation draws a run in)
  const worldMaterials = new Map();
  for (const entry of built.structureMaterials) if (entry.role === 'surface' && !worldMaterials.has(entry.bucket)) worldMaterials.set(entry.bucket, entry.material);
  const table = createStructureDamage(built.obstacles, built.colliders);
  const seams = new Map();
  const seamOf = (id) => {
    if (seams.has(id)) return seams.get(id);
    const d = built.structureDamage.get(id);
    if (!d) return null;
    const st = table.byId(id);
    if (st && !d.anatomy.mound) d.anatomy.mound = { cx: st.cx, cz: st.cz, hw: st.hw, hd: st.hd, yaw: st.yaw, heightM: rubbleHeightFor(st.topY - st.baseY) };
    const seam = createStructureDamageSeam(id, d.builder, d.style, d.anatomy, built.structureSpans.get(id) ?? []);
    seams.set(id, seam);
    return seam;
  };
  const shellRecord = new Map();
  for (const r of built.colliders) if (r.structureIdx !== undefined && !shellRecord.has(r.structureIdx)) shellRecord.set(r.structureIdx, r);

  // the buildings: per builder kind, the first `perBuilder` the match can strike (a breakable, faced building)
  const byBuilder = new Map();
  for (const [id, d] of built.structureDamage) {
    if (!shellRecord.has(id) || !d.anatomy.storeys?.length) continue;
    if (builders && !builders.includes(d.builder)) continue;
    const list = byBuilder.get(d.builder) ?? [];
    if (list.length < perBuilder) list.push(id);
    byBuilder.set(d.builder, list);
  }
  const picks = [...byBuilder.values()].flat();
  log(`buildings: ${picks.map((id) => `${id} ${built.structureDamage.get(id).builder}`).join(', ')}`);

  const solids = [];
  for (const r of built.colliders) if (r.structureIdx !== undefined) solids.push(r);
  for (const r of built.obstacles) if (r.structureIdx === undefined && !shellPassesThroughCollisionRecord(r)) solids.push(r);
  const query = createObstacleGrid(solids, 16);
  const queryOut = [];
  const ground0 = (x, z) => (field.getContactHeightAt ? field.getContactHeightAt(x, z) : field.getHeightAt(x, z));

  const rows = [];
  for (const id of picks) {
    const seam = seamOf(id);
    const a = seam.anatomy;
    // a fresh match and presentation per building (each judged alone)
    for (const r of [...built.obstacles, ...built.colliders]) { r.crushed = false; r.dead = false; r.openings = null; }
    let clock = 0;
    const mounds = [];
    const ground = (x, z) => { let y = ground0(x, z); for (const m of mounds) y += rubbleMoundHeightAt(m, x, z); return y; };
    const mask = createStructureMask(4096, { holes: true });
    const holes = [];
    const addHole0 = mask.addHole.bind(mask);
    mask.addHole = (sid, x, y, z, r, nx, nz, depth, outside, phase, kind) => {
      if (sid === id) holes.push({ x, y, z, r, nx, nz, depth, outside, phase: phase === undefined ? null : phase * Math.PI * 2, t: clock });
      return addHole0(sid, x, y, z, r, nx, nz, depth, outside, phase, kind);
    };
    const env = { groundAt: (x, z) => ground(x, z), queryStatic: query, isSolid: (r) => !r.crushed && !r.dead };
    const bodies = rubbleMod ? rubbleMod.createRubbleBodies({ now: () => clock, environment: () => env, capacity: rubbleMod.RUBBLE_BODY_CAPACITY,
      materialFor: (bucket) => worldMaterials.get(bucket) ?? null }) : null;
    const debris = debrisMod.createStructureDebris({ now: () => clock, groundY: ground, baseGroundY: ground0, poolCapacity: 256,
      pieceCap: 1024, bodies });
    const stageCaps = { pieces: 0, vertices: 0 };
    const begin0 = debris.begin.bind(debris), commit0 = debris.commit.bind(debris);
    let w = null;
    debris.begin = (...args) => { w = begin0(...args); return w; };
    debris.commit = () => {
      if (w) { stageCaps.pieces = Math.max(stageCaps.pieces, w.pieces.count); stageCaps.vertices = Math.max(stageCaps.vertices, w.mesh.vertices); }
      const made = commit0();
      for (const m of made) m.userData.t = clock;
      return made;
    };
    const stages = createStructureStages({ mask, debris, now: () => clock, materialFor: (bucket) => worldMaterials.get(bucket) ?? null,
      scars: null, crumble: 1 });
    const events = [];
    const bus = { emit(type, e) {
      if (e?.structureId !== undefined) events.push({ t: clock, type, stage: e.stage });
      if (type === DESTRUCTION_BUS_EVENTS.stage && e.stage === 'collapsed') {
        const st = table.byId(e.structureId);
        if (st) mounds.push({ cx: st.cx, cz: st.cz, hw: st.hw, hd: st.hd, yaw: st.yaw, heightM: rubbleHeightFor(st.topY - st.baseY) });
      }
      if (type === DESTRUCTION_BUS_EVENTS.stage) stages.stage(e, seamOf(e.structureId));
      else if (type === DESTRUCTION_BUS_EVENTS.breach) stages.breach(e, seamOf(e.structureId));
    } };
    const sd = createStudioDestruction({ getObstacles: () => built.obstacles, getColliders: () => built.colliders }, bus,
      { rules: matchRulesetFor('standard').destruction, sections: false });
    // its widest face on the ground storey, struck along its normal at heights and offsets across it
    const st0 = a.storeys[0];
    const face = [...st0.faces].sort((p, q) => q.width - p.width)[0];
    const c = Math.cos(a.placement.yaw), s = Math.sin(a.placement.yaw);
    const toWorld = (bx, by, bz) => [a.placement.x + bx * c + bz * s, a.placement.y + by, a.placement.z - bx * s + bz * c];
    const nx = face.out[0] * c + face.out[2] * s, nz = -face.out[0] * s + face.out[2] * c;
    const offs = [0, -0.42, 0.38, -0.18, 0.24, -0.33, 0.1, 0.45, -0.45, 0.05, 0.3, -0.25, 0.15, -0.1];
    const ys = [0.35, 0.6, 0.45, 0.75, 0.3, 0.65, 0.5, 0.85, 0.4, 0.55, 0.7, 0.35, 0.6, 0.5];
    const spec = { name: 'check', type: 'HE', caliberMm: 125, velocityMps: 850 };
    const munition = munitionClassForShell(spec), chargeKg = munitionChargeKg(spec, munition);
    const record = shellRecord.get(id);
    const updMs = [];
    let collapsedAt = -1, fired = 0;
    const lastS = rounds * roundGapS + settleS + 6;
    for (let tick = 0; tick * STEP <= lastS; tick++) {
      clock = tick * STEP;
      if (collapsedAt < 0 && fired < rounds && clock >= 0.3 + fired * roundGapS) {
        const u = offs[fired % offs.length] * face.width * 0.8;
        const y = face.origin[1] + Math.max(0.6, Math.min(face.height - 0.6, ys[fired % ys.length] * face.height));
        const [hx, hy, hz] = toWorld(face.origin[0] + face.u[0] * u, y, face.origin[2] + face.u[2] * u);
        sd.strike(spec, record, hx, hy, hz, -nx, -nz);
        stages.strike(id, seam, hx, hy, hz, -nx, -nz, munition, chargeKg, spec.caliberMm);
        fired++;
      }
      sd.step();
      stages.update();
      debris.update();
      const t1 = performance.now();
      bodies?.update();
      updMs.push(performance.now() - t1);
      if (collapsedAt < 0 && events.some((e) => e.stage === 'collapsed')) collapsedAt = clock;
      if (collapsedAt >= 0 && clock > collapsedAt + settleS) break;
    }
    const lastStage = events.length ? events[events.length - 1].t : 0;

    // ---- the checks
    const failures = [];
    const runs = debris.group.children.filter((m) => m.isMesh && /^fx-structure-/.test(m.name) && !/pieces/.test(m.name));
    // 1. textured
    const untextured = runs.filter((m) => /fx-structure-fallback/.test(m.material?.name ?? '')
      || (/^fx-structure-room-/.test(m.name) && !m.material?.map));
    if (untextured.length) failures.push(`untextured runs: ${untextured.map((m) => m.name).join(', ')}`);
    // 2. rims in later holes
    const inLaterHole = (x, y, z, after) => holes.some((h) => {
      if (!(h.t > after + 1e-6)) return false;
      const dx = x - h.x, dy = y - h.y, dz = z - h.z, along = dx * h.nx + dz * h.nz;
      if (along > h.outside || along < -h.depth) return false;
      const px = dx - h.nx * along, pz = dz - h.nz * along;
      let lobe = 0.48;
      if (h.phase !== null) { const th = Math.atan2(dy, px * h.nz - pz * h.nx); lobe = 0.8 + 0.2 * Math.sin(3 * th + h.phase) + 0.12 * Math.sin(5 * th + 2 * h.phase); }
      return Math.hypot(px, dy, pz) < h.r * 0.85 * lobe;
    });
    let hangingRim = 0;
    for (const m of runs) {
      if (!/^fx-structure-rim-/.test(m.name) || m.userData.dropped) continue;
      const p = m.geometry.getAttribute('position'), ix = m.geometry.getIndex()?.array;
      if (!ix) continue;
      for (let t = 0; t + 2 < ix.length; t += 3) {
        if (ix[t] === ix[t + 1] && ix[t + 1] === ix[t + 2]) continue;
        if (inLaterHole((p.getX(ix[t]) + p.getX(ix[t + 1]) + p.getX(ix[t + 2])) / 3, (p.getY(ix[t]) + p.getY(ix[t + 1]) + p.getY(ix[t + 2])) / 3,
          (p.getZ(ix[t]) + p.getZ(ix[t + 1]) + p.getZ(ix[t + 2])) / 3, m.userData.t ?? 0)) hangingRim++;
      }
    }
    if (hangingRim) failures.push(`${hangingRim} rim triangles hang in a later hole`);
    // 3 + 4. the program's pieces: still ones in the air, thrown ones over the ground where they land
    let still = 0, stillHanging = 0, thrown = 0, overGround = 0, buried = 0, neverLand = 0;
    const K = debrisMod.PIECE_DRAG ?? 0.35;
    for (const m of debris.group.children) {
      if (!m.isMesh || !/fx-structure-pieces-/.test(m.name)) continue;
      const g = m.geometry, n = g.instanceCount;
      const PB = g.getAttribute('aPB').array, VL = g.getAttribute('aVL').array, SS = g.getAttribute('aSS').array, CG = g.getAttribute('aCG').array;
      const LD = g.getAttribute('aLD')?.array;
      for (let i = 0; i < n; i++) {
        const j = i * 4;
        if (!(VL[j + 3] > 0)) continue;
        const half = 0.3 * Math.min(SS[j], SS[j + 1], SS[j + 2]);
        const moving = VL[j] * VL[j] + VL[j + 1] * VL[j + 1] + VL[j + 2] * VL[j + 2] > 1e-4;
        if (!moving) {
          still++;
          if (PB[j + 1] - (ground(PB[j], PB[j + 2]) + half) > 0.3) stillHanging++;
          continue;
        }
        thrown++;
        // the program stops a piece at its landing (aLD); before 2026-10-12 it slid on to p + v / k at its spawn's height
        const tl = LD ? LD[j] : Infinity;
        if (LD && !(tl < 1e3)) { neverLand++; continue; }
        const sd2 = LD ? (1 - Math.exp(-K * tl)) / K : 1 / K;
        const lx = PB[j] + VL[j] * sd2, lz = PB[j + 2] + VL[j + 2] * sd2;
        const gap = CG[j + 3] - ground(lx, lz);
        if (gap > 0.3) overGround++; else if (gap < -0.3) buried++;
      }
    }
    if (stillHanging) failures.push(`${stillHanging} still pieces in the air`);
    if (overGround) failures.push(`${overGround} of ${thrown} thrown pieces rest over the ground where they land`);
    // 5. bodies
    const W = bodies ? bodies.pool.world : { capacity: 0 };
    let inWorld = 0, asleep = 0, onGround = 0, onBody = 0, onRecord = 0, hangingBody = 0, buriedBody = 0;
    const lows = [];
    for (let slot = 0; slot < W.capacity; slot++) {
      if (!W.active[slot]) continue;
      inWorld++;
      if (W.asleep[slot]) asleep++;
      const sol = W.shape(slot).solids, hx = sol[8], hy = sol[9], hz = sol[10];
      const qx = W.qx[slot], qy = W.qy[slot], qz = W.qz[slot], qw = W.qw[slot];
      const reach = Math.abs(2 * (qx * qy + qz * qw)) * hx + Math.abs(1 - 2 * (qx * qx + qz * qz)) * hy + Math.abs(2 * (qy * qz - qx * qw)) * hz;
      lows.push({ x: W.px[slot], z: W.pz[slot], low: W.py[slot] - reach, top: W.py[slot] + reach });
    }
    for (const b of lows) {
      const gap = b.low - ground(b.x, b.z);
      if (gap < -0.3) buriedBody++;
      else if (gap <= 0.15) onGround++;
      else if (lows.some((o) => o !== b && Math.hypot(o.x - b.x, o.z - b.z) < 1 && Math.abs(o.top - b.low) < 0.3)) onBody++;
      else if (query(b.x - 0.6, b.z - 0.6, b.x + 0.6, b.z + 0.6, queryOut).some((r) => !r.crushed && !r.dead && r.max[1] >= b.low - 0.35 && r.min[1] <= b.low + 0.2)) onRecord++;
      else hangingBody++;
    }
    if (asleep < inWorld) failures.push(`${inWorld - asleep} of ${inWorld} bodies still moving ${settleS} s after the collapse`);
    if (hangingBody) failures.push(`${hangingBody} bodies at rest in the air`);
    // 6. budgets
    const bs = bodies ? bodies.stats() : { live: 0, settled: 0 };
    if (rubbleMod && bs.live > rubbleMod.RUBBLE_BODY_CAPACITY * 4) failures.push(`bodies over budget (${bs.live})`);
    if (stageCaps.pieces > 1024) failures.push(`a stage threw ${stageCaps.pieces} pieces (cap 1024)`);
    if (stageCaps.vertices > 24000) failures.push(`a stage wrote ${stageCaps.vertices} run vertices (cap 24000)`);
    // a landmark or a set piece loses sections, never the whole (DESTRUCTION.md §3.4), and a heavy hall outlasts a short
    // volley: what it left standing is judged as it stands
    updMs.sort((p, q) => p - q);
    const row = {
      id, builder: seam.builder, kit: a.kit, style: seam.style, fired, collapsedAtS: +collapsedAt.toFixed(2), lastStageS: +lastStage.toFixed(2),
      holes: holes.length, runs: runs.length, untextured: untextured.length, hangingRim,
      pieces: { thrown, still, stillHanging, overGround, buried, neverLand },
      bodies: { live: bs.live, inWorld, asleep, onGround, onBody, onRecord, hanging: hangingBody, buried: buriedBody, settled: bs.settled },
      caps: stageCaps, bodyUpdateMs: { p50: +updMs[Math.floor(updMs.length * 0.5)].toFixed(3), p95: +updMs[Math.floor(updMs.length * 0.95)].toFixed(3),
        max: +updMs[updMs.length - 1].toFixed(3) },
      standing: collapsedAt < 0, pass: failures.length === 0, failures,
    };
    rows.push(row);
    log(`${id} ${seam.builder}: ${row.pass ? 'PASS' : `FAIL (${failures.join('; ')})`}`);
  }
  return { mapId, pass: rows.length > 0 && rows.every((r) => r.pass), buildings: rows.length, rows };
}

function parseArgs(argv) {
  const args = {};
  for (const arg of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(arg);
    if (m) args[m[1]] = m[2] ?? true;
  }
  return args;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = parseArgs(process.argv.slice(2));
  const report = await runDestructionCheck({
    mapId: args.map ?? 'urban',
    builders: typeof args.builders === 'string' ? args.builders.split(',') : null,
    perBuilder: Number(args['per-builder'] ?? 1), rounds: Number(args.rounds ?? 20), settleS: Number(args.settle ?? 12),
    log: (...m) => console.log('[destruction-check]', ...m),
  });
  if (typeof args.json === 'string') writeFileSync(args.json, JSON.stringify(report, null, 1));
  for (const r of report.rows) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.id} ${r.builder} (${r.kit}): ${r.standing ? `standing after ${r.fired} rounds` : `collapsed ${r.collapsedAtS} s after ${r.fired} rounds`}; holes ${r.holes};`
      + ` pieces ${r.pieces.thrown} thrown / ${r.pieces.overGround} over ground / ${r.pieces.buried} buried; bodies ${r.bodies.inWorld}`
      + ` (${r.bodies.asleep} asleep, ${r.bodies.onGround} ground, ${r.bodies.onBody} body, ${r.bodies.onRecord} record, ${r.bodies.hanging} hanging);`
      + ` body update p95 ${r.bodyUpdateMs.p95} ms${r.failures.length ? ` — ${r.failures.join('; ')}` : ''}`);
  }
  console.log(`destruction-check ${report.mapId}: ${report.pass ? 'PASS' : 'FAIL'} (${report.buildings} buildings)`);
  process.exit(report.pass ? 0 : 1);
}
