// Studio hull-to-ground gap probe (the engine-cs lane, 2026-10-14; media wave f1: "hulls hover: no contact shadow
// under the tracks"). Replays a Studio scene's actor tracks headlessly on the support solve the Studio uses
// (game/studioActorSupport.ts conformStudioActor over sim/structureSupport.ts, on the timeline's 60 Hz grid as
// game/studio.ts applyStoryboardActors steps it, with the visual's wheels on the Studio's own ground sampler) and
// measures, at the asked times, how far the drawn running gear stands over the RENDERED ground
// (heightField.getContactHeightAt): per track side the lowest gap and the gap along the hull in ten bins. A solver float
// shows as a positive lowest gap along the run; a renderer-only "hover" as gaps within a few centimetres.
//
//   node tools/studio-contact-gap.mjs <scene.json|cinema-receipt.json> [--times=400,1680] [--actors=hero|all]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { installCanvasFixture } from '../src/vehicles/canvasFixture.test-support.mjs';
import { createDedicatedWorldCollision } from '../server/dedicatedWorldCollision.ts';
import { ensureAuthorityFleet } from '../src/vehicles/authorityFleet.ts';
import { createTankState, SIM_DT } from '../src/sim/movement.ts';
import { createStructureSupportField } from '../src/sim/structureSupport.ts';
import { conformStudioActor, studioSupportBelly } from '../src/game/studioActorSupport.ts';
import { sampleActorTrack } from '../src/game/studioTimeline.ts';
import { createTank } from '../src/vehicles/tankFactory.ts';
import { getSpec } from '../src/vehicles/specs.ts';

const DEG = Math.PI / 180;
const GEAR = /^gear(?:RoadWheel|TrackPads|TrackBand|Track)/;
const BINS = 10;

/**
 * Replay one Studio actor on `map` and measure its drawn running gear over the rendered ground at `times` (ms).
 * @param {{ world?: object, map: string, actor: { id: string, name?: string, pos: number[], facingDeg?: number, camoSeed?: number },
 *   keys?: object[] | null, times: number[] }} o
 */
export async function replayStudioActorGaps({ world: given = null, map, actor: cfg, keys = null, times }) {
  installCanvasFixture();
  const world = given ?? createDedicatedWorldCollision(map);
  const hf = world.heightField;
  await ensureAuthorityFleet([cfg.id]);
  const spec = getSpec(cfg.id);
  const visual = createTank(cfg.id, null, { proceduralOnly: true, quality: 'high', camoSeed: cfg.camoSeed ?? 1 });
  const sample = {};
  const at = (tMs) => {
    if (keys && sampleActorTrack(keys, tMs, sample)) return { x: sample.x, z: sample.z, yaw: sample.facingDeg * DEG };
    return { x: cfg.pos[0], z: cfg.pos[1], yaw: (cfg.facingDeg ?? 0) * DEG };
  };
  const p0 = at(0);
  const a = {
    spec, visual,
    state: createTankState(spec, new THREE.Vector3(p0.x, hf.getHeightAt(p0.x, p0.z), p0.z), p0.yaw),
    input: { throttle: 0, steer: 0, brake: true, fire: false, aimPoint: new THREE.Vector3(), shellSlot: 0 },
    combat: null, rigidGear: false,
    contactGeom: visual.contactGeom ? { ...visual.contactGeom, endRise: visual.contactGeom.endRise ? { ...visual.contactGeom.endRise } : null } : null,
    supportX: p0.x, supportZ: p0.z, supportYaw: p0.yaw,
  };
  // game/studio.ts actorSupport: terrain plus the standable tops under the belly (a bridge deck from above)
  const field = createStructureSupportField(hf, world);
  const cands = [], deckScratch = [];
  const support = () => {
    const x = a.state.pos.x, z = a.state.pos.z;
    cands.length = 0;
    world.queryObstacles(x - 4, z - 4, x + 4, z + 4, cands);
    field.beginHull(x, z, studioSupportBelly(cands, x, z, a.state.pos.y + (a.contactGeom?.bottomYM ?? 0), deckScratch));
    return field;
  };
  visual.setGroundSampler((x, z) => field.getHeightAt(x, z));
  const root = new THREE.Vector3();
  // game/studio.ts applyStoryboardActorSample
  const apply = (tMs, dt, conform) => {
    const s = at(tMs), st = a.state;
    const dx = s.x - a.supportX, dz = s.z - a.supportZ;
    const dyaw = Math.atan2(Math.sin(s.yaw - a.supportYaw), Math.cos(s.yaw - a.supportYaw));
    if (dt > 0) {
      const d = dx * Math.sin(s.yaw) + dz * Math.cos(s.yaw);
      st.speed = d / dt; st.yawRate = dyaw / dt;
      st.trackScroll.l += d + dyaw * 1.5; st.trackScroll.r += d - dyaw * 1.5;
    } else if (conform) { st.speed = 0; st.yawRate = 0; }
    if (conform) { a.supportX = s.x; a.supportZ = s.z; a.supportYaw = s.yaw; }
    visual.rootPositionForPresentationPoint(s.x, s.z, s.yaw, root);
    st.pos.x = root.x; st.pos.z = root.z; st.yaw = s.yaw;
    if (conform) conformStudioActor(a, support(), dt, false);
  };
  apply(0, 0, true);
  visual.syncFromState(a.state, 0);
  const stepMs = SIM_DT * 1000;
  let step = 0;
  const samples = [];
  for (const t of [...times].sort((x, y) => x - y)) {
    const final = Math.floor((t + 1e-7) / stepMs);
    while (step < final) {
      step++;
      apply(step * stepMs, SIM_DT, true);
      apply(step * stepMs, 0, false);
      visual.syncFromState(a.state, SIM_DT);
    }
    apply(t, 0, false);
    visual.syncFromState(a.state, 0);
    visual.root.updateMatrixWorld(true);
    samples.push({ tMs: t, ...gearGaps(visual, a.state, hf) });
  }
  visual.dispose?.();
  if (!given) world.release?.();
  return { name: cfg.name ?? null, id: cfg.id, samples };
}

/** The drawn running gear over the rendered ground: per side the lowest gap and the gap in ten bins along the hull (cm). */
function gearGaps(visual, st, hf) {
  const p = new THREE.Vector3(), m = new THREE.Matrix4(), w = new THREE.Matrix4(), inv = new THREE.Matrix4();
  inv.copy(visual.root.matrixWorld).invert();
  const local = new THREE.Vector3();
  let zMin = Infinity, zMax = -Infinity;
  const pts = [];
  visual.root.traverseVisible((mesh) => {
    if (!mesh.isMesh || !GEAR.test(mesh.name)) return;
    const pos = mesh.geometry.getAttribute('position');
    const count = mesh.isInstancedMesh ? mesh.count : 1;
    for (let i = 0; i < count; i++) {
      if (mesh.isInstancedMesh) { mesh.getMatrixAt(i, m); w.multiplyMatrices(mesh.matrixWorld, m); } else w.copy(mesh.matrixWorld);
      for (let v = 0; v < pos.count; v++) {
        p.fromBufferAttribute(pos, v).applyMatrix4(w);
        local.copy(p).applyMatrix4(inv);
        pts.push([local.x < 0 ? 0 : 1, local.z, p.y - hf.getContactHeightAt(p.x, p.z)]);
        zMin = Math.min(zMin, local.z); zMax = Math.max(zMax, local.z);
      }
    }
  });
  const bins = [Array(BINS).fill(Infinity), Array(BINS).fill(Infinity)];
  for (const [s, z, g] of pts) {
    const b = Math.min(BINS - 1, Math.floor((z - zMin) / (zMax - zMin) * BINS));
    if (g < bins[s][b]) bins[s][b] = g;
  }
  const cm = (x) => +(x * 100).toFixed(1);
  const side = (b) => ({ minCm: cm(Math.min(...b)), binsCm: b.map(cm) });
  return {
    pitchDeg: +(st.visualPitch / DEG).toFixed(2), rollDeg: +(st.visualRoll / DEG).toFixed(2),
    rideCm: cm(st.pos.y - hf.getContactHeightAt(st.pos.x, st.pos.z)), vertices: pts.length,
    left: side(bins[0]), right: side(bins[1]),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const scene = raw.config?.scene ?? raw.scene ?? raw;
  const times = opt('times', (raw.stills ?? []).map((s) => s.timelineMs).join(',') || '0').split(',').map(Number);
  const names = opt('actors', 'hero').split(',');
  const world = createDedicatedWorldCollision(scene.map);
  const out = { map: scene.map, timeOfDay: scene.timeOfDay, actors: [] };
  for (const actor of scene.actors.filter((a) => names.includes('all') || names.includes(a.name))) {
    const keys = scene.storyboard?.actorTracks?.find((t) => t.actor === actor.name)?.keys ?? null;
    out.actors.push(await replayStudioActorGaps({ world, map: scene.map, actor, keys, times }));
  }
  world.release?.();
  console.log(JSON.stringify(out, null, 1));
}
