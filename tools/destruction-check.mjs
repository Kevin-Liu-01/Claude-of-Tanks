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
 *  - nothing hangs from the fall: the vertex patch's crumble on every triangle of the building's own parts (the GLSL's
 *    twin, structureMask crumbleVertexY), sampled as the cut keeps it, 3.6 and 4.1 s into the fall: no fragment stands
 *    over the front's ragged band and the heap (the owner's "big rectangles": a roof slope or a tower's glazing hung from
 *    its vertex under the eave band until the fold);
 *  - budget: bodies within the pool's cap, a stage's pieces and run vertices within its caps;
 *  - the fracture (fx/fractureStages.ts, as the battle wires it on desktop; `--fracture=0` judges the kit's path alone):
 *    its bodies at rest on support like the rubble's, nothing of what it drew — a body, a heap, a piece laid at rest —
 *    standing over the ground in the air, and a building it brought down as bodies hidden at once (no crumble to judge).
 *
 *   node tools/destruction-check.mjs [--map=urban] [--builders=firestation,cornershop,rowhouse] [--per-builder=1]
 *        [--rounds=12] [--settle=12] [--fracture=0] [--json=<out>]
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
  mapId = 'urban', builders = null, perBuilder = 1, rounds = 20, settleS = 14, roundGapS = 0.45, log = () => {}, fracture = true,
} = {}) {
  installWorldBuildFixture();
  const [maps, terrain, vegetation, props, models, fleet] = await Promise.all([
    import('../src/world/maps/index.ts'), import('../src/world/terrain.ts'), import('../src/world/vegetation.ts'),
    import('../src/world/props.ts'), import('../src/world/propsModelStore.ts'), import('../src/vehicles/fleetFactory.ts')]);
  const maskMod = await import('../src/fx/structureMask.ts');
  const { createStructureMask } = maskMod;
  const debrisMod = await import('../src/fx/structureDebris.ts');
  const { createStructureStages } = await import('../src/fx/structureStages.ts');
  // (a tree without the rigid rubble — main before 2026-10-12 — is judged too: its pieces by their own program's law)
  const rubbleMod = await import('../src/fx/rubbleBodies.ts').catch(() => null);
  // (2026-10-15: the walls' fracture and the collapse as bodies, as the battle runs them on desktop)
  const fractureMod = fracture ? await import('../src/fx/fractureStages.ts').catch(() => null) : null;
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
    const fxGroup = new THREE.Group();
    const fx = fractureMod ? fractureMod.createFractureStages({ group: fxGroup, now: () => clock, environment: () => env, groundAt: ground,
      materialFor: (bucket) => worldMaterials.get(bucket) ?? null }) : null;
    const stages = createStructureStages({ mask, debris, now: () => clock, materialFor: (bucket) => worldMaterials.get(bucket) ?? null,
      scars: null, crumble: 1, ...(fx ? { fracture: fx.attach } : {}) });
    const events = [];
    const bus = { emit(type, e) {
      if (e?.structureId !== undefined) events.push({ t: clock, type, stage: e.stage });
      if (type === DESTRUCTION_BUS_EVENTS.stage && e.stage === 'collapsed') {
        const st = table.byId(e.structureId);
        if (st) mounds.push({ cx: st.cx, cz: st.cz, hw: st.hw, hd: st.hd, yaw: st.yaw, heightM: rubbleHeightFor(st.topY - st.baseY) });
      }
      if (type === DESTRUCTION_BUS_EVENTS.stage) stages.stage(e, seamOf(e.structureId));
      else if (type === DESTRUCTION_BUS_EVENTS.breach) { stages.breach(e, seamOf(e.structureId)); fx?.breach(e); }
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
    // the presentation's whole tick (the round's strike, the stages its events raise, the pieces' landings, the bodies):
    // the frame cost a collapse adds, on the CPU
    const frameMs = [];
    let collapsedAt = -1, fired = 0;
    const lastS = rounds * roundGapS + settleS + 6;
    for (let tick = 0; tick * STEP <= lastS; tick++) {
      clock = tick * STEP;
      const f0 = performance.now();
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
      fx?.update();
      debris.update();
      const t1 = performance.now();
      bodies?.update();
      updMs.push(performance.now() - t1);
      frameMs.push(performance.now() - f0);
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
    // (a through-hole only: a render ring or a spall cuts the skin, and the units behind it stand in the core it leaves)
    const inLaterHole = (x, y, z, after) => holes.some((h) => {
      if (!(h.t > after + 1e-6) || h.depth < 0.2) return false;
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
      lows.push({ x: W.px[slot], z: W.pz[slot], low: W.py[slot] - reach, top: W.py[slot] + reach,
        awake: !W.asleep[slot], v: Math.hypot(W.vx[slot], W.vy[slot], W.vz[slot]), w: Math.hypot(W.wx[slot], W.wy[slot], W.wz[slot]), age: W.age[slot] });
    }
    for (const b of lows) {
      const gap = b.low - ground(b.x, b.z);
      if (gap < -0.3) buriedBody++;
      else if (gap <= 0.15) onGround++;
      else if (lows.some((o) => o !== b && Math.hypot(o.x - b.x, o.z - b.z) < 1 && Math.abs(o.top - b.low) < 0.3)) onBody++;
      else if (query(b.x - 0.6, b.z - 0.6, b.x + 0.6, b.z + 0.6, queryOut).some((r) => !r.crushed && !r.dead && r.max[1] >= b.low - 0.35 && r.min[1] <= b.low + 0.2)) onRecord++;
      else hangingBody++;
    }
    // moving: awake and visibly so (an awake body at rest, its sleep window still open, is at rest)
    const moving = lows.filter((b) => b.awake && (b.v > 0.05 || b.w > 0.15)).length;
    if (moving) failures.push(`${moving} of ${inWorld} bodies still moving ${settleS} s after the collapse`);
    if (hangingBody) failures.push(`${hangingBody} bodies at rest in the air`);
    // 5b. the fracture's: its pool's bodies on support as the rubble's are; and what it drew and left lying (a body's
    // meshes, a heap, a piece laid at rest) never standing over the ground in the air
    let fxInWorld = 0, fxMoving = 0, fxHanging = 0, fxHighMeshes = 0, fxHighM = 0;
    if (fx) {
      const FW = fx.pool.world;
      const fxLows = [];
      for (let slot = 0; slot < FW.capacity; slot++) {
        if (!FW.active[slot]) continue;
        fxInWorld++;
        const rad = FW.shape(slot).radius;
        fxLows.push({ x: FW.px[slot], z: FW.pz[slot], y: FW.py[slot], r: rad, awake: !FW.asleep[slot],
          v: Math.hypot(FW.vx[slot], FW.vy[slot], FW.vz[slot]), w: Math.hypot(FW.wx[slot], FW.wy[slot], FW.wz[slot]) });
      }
      fxMoving = fxLows.filter((b) => b.awake && (b.v > 0.05 || b.w > 0.15)).length;
      // (a compound body's reach is its bounding radius: one whose whole sphere stands clear of the ground, of every
      // other body's and of every solid record is in the air)
      for (const b of fxLows) {
        if (b.y - b.r <= ground(b.x, b.z) + 0.15) continue;
        if (fxLows.some((o) => o !== b && Math.hypot(o.x - b.x, o.y - b.y, o.z - b.z) < o.r + b.r + 0.1)) continue;
        if (query(b.x - b.r, b.z - b.r, b.x + b.r, b.z + b.r, queryOut).some((rr) => !rr.crushed && !rr.dead && rr.max[1] >= b.y - b.r - 0.35)) continue;
        fxHanging++;
      }
      const v = new THREE.Vector3();
      const fxMeshes = fxGroup.children.filter((m) => m.isMesh && /^fx-(fracture-(body|heap|face)|collapse-|landmark-piece)/.test(m.name));
      const boxes = fxMeshes.map((m) => {
        const b = new THREE.Box3(), pa = m.geometry.getAttribute('position');
        for (let i = 0; i < pa.count; i++) b.expandByPoint(v.fromBufferAttribute(pa, i).applyMatrix4(m.matrix));
        return b;
      });
      for (const m of fxMeshes) {
        if (!/^fx-(fracture-(body|heap)|collapse-(?!remnant)|landmark-piece)/.test(m.name)) continue;
        const pa = m.geometry.getAttribute('position');
        let low = Infinity, lx = 0, ly = 0, lz = 0;
        for (let i = 0; i < pa.count; i++) {
          v.fromBufferAttribute(pa, i).applyMatrix4(m.matrix);
          const gap = v.y - ground(v.x, v.z);
          if (gap < low) { low = gap; lx = v.x; ly = v.y; lz = v.z; }
        }
        if (!(low > 1.6)) continue;
        // (on a record: a neighbour's wall or roof, a stub, a wall it fell against; or on another of the fall's pieces, the
        // remnant or a standing face)
        if (query(lx - 0.8, lz - 0.8, lx + 0.8, lz + 0.8, queryOut).some((rr) => !rr.crushed && !rr.dead && rr.max[1] >= ly - 0.5 && rr.min[1] <= ly + 0.3)) continue;
        const own = fxMeshes.indexOf(m);
        if (boxes.some((b, k) => k !== own && lx >= b.min.x - 0.3 && lx <= b.max.x + 0.3 && lz >= b.min.z - 0.3 && lz <= b.max.z + 0.3
          && b.max.y >= ly - 0.4 && b.min.y < ly)) continue;
        fxHighMeshes++; fxHighM = Math.max(fxHighM, low);
      }
      if (fxMoving) failures.push(`${fxMoving} of ${fxInWorld} fracture bodies still moving ${settleS} s after the collapse`);
      if (fxHanging) failures.push(`${fxHanging} fracture bodies at rest in the air`);
      if (fxHighMeshes) failures.push(`${fxHighMeshes} fracture meshes lie ${fxHighM.toFixed(1)} m over the ground`);
    }
    const asBodies = !!fx?.took(id);
    // 6. nothing hangs from the fall (a house's crumble, not a shaft's topple): the patch's law on the building's own
    // triangles (crumbleVertexY; on a tree without it, the law as it stood: a wall vertex never moved), each sampled on a
    // barycentric grid as the cut keeps it — a fragment over the front's ragged band is cut unless its triangle reaches
    // the roof
    let hangingPanel = 0, hangingPanelM = 0;
    {
      const stride = maskMod.STRUCT_STRIDE, data = mask.texture.image.data;
      const A = id * stride * 4, Bt = (id * stride + 1) * 4, Ft = (id * stride + stride - 1) * 4;
      const start = data[A], H = data[A + 1], baseY = data[Bt + 1], eave = data[Ft] > 0 ? data[Ft] : 0.8 * H;
      const law = maskMod.crumbleVertexY ?? ((py, t, e) => {
        const u = Math.min(1, Math.max(0, (t - 0.3) / 3.4)), front = e * (1 - Math.pow(u, 1.5)), roof = py >= e - 0.05;
        if (!roof) return { y: py, roof };
        const tr = Math.max(0, t - 0.2);
        return { y: Math.max(py - 4.9 * tr * tr, front + (py - e) * 0.75 * (1 - u * u) - 1.2 * u * u), roof };
      });
      const mound = mounds[0] ?? null;
      // (a building brought down as bodies left the mask at once: its pieces fell, nothing of it crumbled)
      if (start > 0 && data[Ft] >= 0 && !asBodies) for (const t of [3.6, 4.1]) {
        const u = Math.min(1, Math.max(0, (t - 0.3) / 3.4)), front = eave * (1 - Math.pow(u, 1.5));
        let n = 0;
        for (const span of seam.spans) {
          const g = span.mesh.geometry, pos = span.position, ix = g?.index ? g.index.array : null;
          span.mesh.updateMatrixWorld?.(true);
          const e = span.mesh.matrixWorld.elements;
          const lo = span.first, hi = span.first + span.count;
          const P = [{}, {}, {}];
          for (let k = ix ? 0 : lo; k + 2 < (ix ? ix.length : hi); k += 3) {
            const tri = ix ? [ix[k], ix[k + 1], ix[k + 2]] : [k, k + 1, k + 2];
            if (tri.some((i) => i < lo || i >= hi)) continue;
            for (let v = 0; v < 3; v++) {
              const i = tri[v], x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
              P[v].x = x * e[0] + y * e[4] + z * e[8] + e[12];
              P[v].z = x * e[2] + y * e[6] + z * e[10] + e[14];
              const r = law(x * e[1] + y * e[5] + z * e[9] + e[13] - baseY, t, eave);
              P[v].y = r.y; P[v].roof = r.roof ? 1 : 0;
            }
            let hangs = false;
            for (let a = 0; a <= 6 && !hangs; a++) for (let b = 0; b <= 6 - a && !hangs; b++) {
              const w1 = a / 6, w2 = b / 6, w0 = 1 - w1 - w2;
              const y = P[0].y * w0 + P[1].y * w1 + P[2].y * w2, roof = P[0].roof * w0 + P[1].roof * w1 + P[2].roof * w2;
              if (u > 0 && roof < 0.02 && y > front + 0.78) continue;
              const heap = mound ? rubbleMoundHeightAt(mound, P[0].x * w0 + P[1].x * w1 + P[2].x * w2, P[0].z * w0 + P[1].z * w1 + P[2].z * w2) : 0;
              if (y > front + 1.05 && y > heap + 1.05) { hangs = true; hangingPanelM = Math.max(hangingPanelM, y); }
            }
            if (hangs) n++;
          }
        }
        hangingPanel = Math.max(hangingPanel, n);
      }
    }
    if (hangingPanel) failures.push(`${hangingPanel} of the building's triangles hang over the heap late in its fall (up to ${hangingPanelM.toFixed(1)} m)`);
    // 7. budgets
    const bs = bodies ? bodies.stats() : { live: 0, settled: 0 };
    if (rubbleMod && bs.live > rubbleMod.RUBBLE_BODY_CAPACITY * 4) failures.push(`bodies over budget (${bs.live})`);
    if (stageCaps.pieces > 1024) failures.push(`a stage threw ${stageCaps.pieces} pieces (cap 1024)`);
    if (stageCaps.vertices > 24000) failures.push(`a stage wrote ${stageCaps.vertices} run vertices (cap 24000)`);
    // a landmark or a set piece loses sections, never the whole (DESTRUCTION.md §3.4), and a heavy hall outlasts a short
    // volley: what it left standing is judged as it stands
    updMs.sort((p, q) => p - q);
    frameMs.sort((p, q) => p - q);
    const row = {
      id, builder: seam.builder, kit: a.kit, style: seam.style, fired, collapsedAtS: +collapsedAt.toFixed(2), lastStageS: +lastStage.toFixed(2),
      holes: holes.length, runs: runs.length, untextured: untextured.length, hangingRim, hangingPanel, hangingPanelM: +hangingPanelM.toFixed(2),
      pieces: { thrown, still, stillHanging, overGround, buried, neverLand },
      fracture: fx ? { asBodies, inWorld: fxInWorld, moving: fxMoving, hanging: fxHanging, highMeshes: fxHighMeshes, ...fx.stats() } : null,
      bodies: { live: bs.live, inWorld, asleep, moving: lows.filter((b) => b.awake && (b.v > 0.05 || b.w > 0.15)).length, onGround, onBody, onRecord, hanging: hangingBody, buried: buriedBody, settled: bs.settled,
        awakeSample: lows.filter((b) => b.awake).slice(0, 4).map((b) => ({ v: +b.v.toFixed(3), w: +b.w.toFixed(3), age: b.age,
          gap: +(b.low - ground(b.x, b.z)).toFixed(3) })) },
      caps: stageCaps, bodyUpdateMs: { p50: +updMs[Math.floor(updMs.length * 0.5)].toFixed(3), p95: +updMs[Math.floor(updMs.length * 0.95)].toFixed(3),
        max: +updMs[updMs.length - 1].toFixed(3) },
      frameMs: { p50: +frameMs[Math.floor(frameMs.length * 0.5)].toFixed(3), p99: +frameMs[Math.floor(frameMs.length * 0.99)].toFixed(3),
        max: +frameMs[frameMs.length - 1].toFixed(3) },
      standing: collapsedAt < 0, pass: failures.length === 0, failures,
    };
    rows.push(row);
    log(`${id} ${seam.builder}: ${row.pass ? 'PASS' : `FAIL (${failures.join('; ')})`}`);
  }
  // (a map without destructible structures — the Moon's — has nothing to judge: it passes, with its count 0)
  return { mapId, pass: rows.every((r) => r.pass), buildings: rows.length, rows };
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
    perBuilder: Number(args['per-builder'] ?? 1), rounds: Number(args.rounds ?? 20), settleS: Number(args.settle ?? 14),
    fracture: args.fracture !== '0',
    log: (...m) => console.log('[destruction-check]', ...m),
  });
  if (typeof args.json === 'string') writeFileSync(args.json, JSON.stringify(report, null, 1));
  for (const r of report.rows) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.id} ${r.builder} (${r.kit}): ${r.standing ? `standing after ${r.fired} rounds` : `collapsed ${r.collapsedAtS} s after ${r.fired} rounds`}; holes ${r.holes};`
      + ` pieces ${r.pieces.thrown} thrown / ${r.pieces.overGround} over ground / ${r.pieces.buried} buried; bodies ${r.bodies.inWorld}`
      + ` (${r.bodies.asleep} asleep, ${r.bodies.onGround} ground, ${r.bodies.onBody} body, ${r.bodies.onRecord} record, ${r.bodies.hanging} hanging);`
      + ` body update p95 ${r.bodyUpdateMs.p95} ms; tick p99 ${r.frameMs.p99} ms, max ${r.frameMs.max} ms${r.failures.length ? ` — ${r.failures.join('; ')}` : ''}`);
  }
  console.log(`destruction-check ${report.mapId}: ${report.pass ? 'PASS' : 'FAIL'} (${report.buildings} buildings)`);
  process.exit(report.pass ? 0 : 1);
}
