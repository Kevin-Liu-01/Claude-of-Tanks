// Lens sightlines against the props (2026-10-06, the engine review: a pole, a stall, a tree and roofs taller than the
// footprint check's 12 m hid the hero in six takes that check had passed). The rail is resolved as the lab resolves it
// (ground-relative heights over the smoothed ground, absolute keys kept) and sampled as the Studio plays it
// (sampleCameraRail, every 100 ms, the spline between keys included). At each sample the hero's hull is seen through
// five sightlines — its centre, nose, tail and both flanks — and the sample is blocked when two or more cross a record
// or a canopy (world-model.mjs) or the lens sits inside one. Low crushable cover (under 1.4 m: fences, wire, sandbags)
// never blocks: it lies under the lens or flat under a hull. What the hulls crush (the Studio's own plan,
// studioCrush.ts) stops blocking once it falls: a felled tree's canopy is no longer over the road.
import { sampleActorTrack, sampleCameraRail } from '../../src/game/studioTimeline.ts';
import { planStudioCrushes } from '../../src/game/studioCrush.ts';
import { insideRecord, sightBlockers } from './world-model.mjs';
import { hullOf } from './route-check.mjs';

const LOW_COVER_M = 1.4;
/** A blocker this large against the hero's width on screen hides it (lensReport). */
const MAJOR_SHARE = 0.35;

/**
 * When each record the scene's hulls crush falls (ms), by the Studio's plan with each hull's contact rectangle: a
 * collision record when a hull overruns it fast enough, a presentation crushable (a pole) also when a hull's centre
 * comes within the battle's reach (half the hull's length + 0.5 m), whichever is first.
 */
export function crushTimes(scene, model) {
  const sample = {}, idOf = new Map(scene.actors.map((a) => [a.name, a.id]));
  const hulls = (scene.storyboard?.actorTracks ?? []).filter((t) => t.keys?.length).map((t) => {
    const [halfLength, halfWidth] = hullOf(idOf.get(t.actor));
    return {
    halfLength, halfWidth, crushReach: halfLength + 0.5,
    poseAt(tMs, out) {
      if (!sampleActorTrack(t.keys, tMs, sample)) return false;
      out.x = sample.x; out.z = sample.z; out.yawRad = (sample.facingDeg ?? 0) * Math.PI / 180;
      return true;
    },
    };
  });
  const presentation = model.records.filter((r) => r.presentation);
  const props = presentation.map((r) => ({ x: (r.min[0] + r.max[0]) / 2, y: r.min[1], z: (r.min[2] + r.max[2]) / 2, h: r.max[1] - r.min[1] }));
  const times = new Map();
  for (const e of planStudioCrushes(hulls, scene.storyboard?.durationMs ?? 0, model.query, props)) {
    const record = e.record ?? presentation[e.crushable];
    if (!(times.get(record) <= e.tMs)) times.set(record, e.tMs);
  }
  return times;
}

/** The storyboard's camera keys with absolute heights, as lab.mjs resolves a groundRel storyboard. */
export function absoluteShots(scene, model) {
  const sb = scene.storyboard, shots = sb?.shots ?? [];
  if (!sb?.groundRel) return shots;
  const n = Number(sb.groundSmooth ?? 0), H = model.heightAt;
  const gp = shots.map((sh) => H(sh.pos[0], sh.pos[2])), gl = shots.map((sh) => H(sh.lookAt[0], sh.lookAt[2]));
  const avg = (g, i) => { if (!n) return g[i]; let a = 0, c = 0; for (let j = Math.max(0, i - n); j <= Math.min(g.length - 1, i + n); j++) { a += g[j]; c++; } return a / c; };
  return shots.map((sh, i) => sh.absY ? sh : {
    ...sh,
    pos: [sh.pos[0], Math.max(avg(gp, i) + sh.pos[1], gp[i] + 0.25), sh.pos[2]],
    lookAt: [sh.lookAt[0], avg(gl, i) + sh.lookAt[1], sh.lookAt[2]],
  });
}

/**
 * The lens's view of the hero over the take: { blocked, outOfFrame, samples, worst, blockedAt, perSample } where blocked
 * and outOfFrame are fractions of the samples, worst lists the first blocked moments ({ tMs, by }), blockedAt every
 * blocked time and perSample each sample's { tMs, seen (any hull point in frame), centred (the hull's centre inside
 * 70 % of the frame), clear (no blocker), distM (lens to hull centre) }.
 */
export function lensReport(scene, model, { stepMs = 100, aspect = 16 / 9 } = {}) {
  const shots = absoluteShots(scene, model), dur = scene.storyboard?.durationMs ?? 0;
  const heroKeys = scene.storyboard?.actorTracks?.find((t) => t.actor === 'hero')?.keys;
  const heroActor = scene.actors.find((a) => a.name === 'hero');
  if (!shots.length || !heroActor) return { blocked: 0, outOfFrame: 0, samples: 0, worst: [], blockedAt: [], perSample: [] };
  const [halfLength, halfWidth] = hullOf(heroActor.id);
  const cam = {}, pose = {}, hits = [], fallen = crushTimes(scene, model);
  let samples = 0, blocked = 0, outOfFrame = 0, now = 0;
  const ignore = (r) => (r.crushable && r.max[1] - r.min[1] < LOW_COVER_M) || (fallen.get(r) ?? Infinity) <= now;
  const worst = [], blockedAt = [], perSample = [];
  for (let t = 0; t <= dur; t += stepMs) {
    if (!sampleCameraRail(shots, t, cam)) continue;
    now = t;
    let x = heroActor.pos[0], z = heroActor.pos[1], yaw = (heroActor.facingDeg ?? 0) * Math.PI / 180;
    if (heroKeys?.length && sampleActorTrack(heroKeys, t, pose)) { x = pose.x; z = pose.z; yaw = (pose.facingDeg ?? 0) * Math.PI / 180; }
    const gy = model.heightAt(x, z), fx = Math.sin(yaw), fz = Math.cos(yaw);
    const eye = [cam.x, cam.y, cam.z];
    const points = [
      [x, gy + 1.4, z],
      [x + fx * halfLength * 0.75, gy + 1.1, z + fz * halfLength * 0.75],
      [x - fx * halfLength * 0.75, gy + 1.1, z - fz * halfLength * 0.75],
      [x + fz * halfWidth * 0.8, gy + 1.1, z - fx * halfWidth * 0.8],
      [x - fz * halfWidth * 0.8, gy + 1.1, z + fx * halfWidth * 0.8],
    ];
    samples++;
    // in frame: any of the hull's five points inside 95 % of a 16:9 frame at the sample's vertical fov (a close pass
    // sweeps the hull's centre past the frame's edge while the hull fills that side of it)
    const f = [cam.lookX - cam.x, cam.lookY - cam.y, cam.lookZ - cam.z], fl = Math.hypot(...f) || 1;
    const fw = f.map((v) => v / fl), rl = Math.hypot(fw[2], fw[0]) || 1, right = [fw[2] / rl, 0, -fw[0] / rl];
    const up = [fw[1] * right[2] - fw[2] * right[1], fw[2] * right[0] - fw[0] * right[2], fw[0] * right[1] - fw[1] * right[0]];
    const ty = Math.tan((cam.fov ?? 40) * Math.PI / 360), tx = ty * aspect;
    const seen = (p) => {
      const d = [p[0] - cam.x, p[1] - cam.y, p[2] - cam.z], depth = d[0] * fw[0] + d[1] * fw[1] + d[2] * fw[2];
      return depth > 0.5 && Math.abs((d[0] * right[0] + d[1] * right[1] + d[2] * right[2]) / depth) < tx * 0.95
        && Math.abs((d[0] * up[0] + d[1] * up[1] + d[2] * up[2]) / depth) < ty * 0.95;
    };
    const inView = points.some(seen);
    if (!inView) outOfFrame++;
    const c = [points[0][0] - cam.x, points[0][1] - cam.y, points[0][2] - cam.z], cDepth = c[0] * fw[0] + c[1] * fw[1] + c[2] * fw[2];
    const centred = cDepth > 0.5 && Math.abs((c[0] * right[0] + c[1] * right[1] + c[2] * right[2]) / cDepth) < tx * 0.7
      && Math.abs((c[0] * up[0] + c[1] * up[1] + c[2] * up[2]) / cDepth) < ty * 0.7;
    const insideAny = insideRecord(model, eye, 0.3), inside = insideAny && !ignore(insideAny) ? insideAny : null;
    let blockedRays = 0, by = inside ? `lens inside a ${inside.kind}` : '';
    if (!inside) {
      // a blocker counts when it is large on screen: at least MAJOR_SHARE of the hero's own width there (a pole at
      // the lens hides the hull; one halfway to a distant hero is a sliver across it)
      const heroAngle = (2 * halfWidth) / Math.max(1, Math.hypot(x - eye[0], z - eye[2]));
      const major = (r) => {
        const w = r.canopyR ? 2 * r.canopyR : Math.min(r.max[0] - r.min[0], r.max[2] - r.min[2]);
        return w / Math.max(0.5, Math.hypot((r.min[0] + r.max[0]) / 2 - eye[0], (r.min[2] + r.max[2]) / 2 - eye[2])) >= MAJOR_SHARE * heroAngle;
      };
      for (const p of points) {
        sightBlockers(model, eye, p, { ignore, out: hits });
        const hit = hits.find(major);
        if (hit) { blockedRays++; by ||= hit.canopyR ? 'a tree canopy' : `a ${hit.kind}`; }
      }
    }
    const isBlocked = !!inside || blockedRays >= 2;
    if (isBlocked) {
      blocked++;
      blockedAt.push(t);
      if (worst.length < 4) worst.push({ tMs: t, by });
    }
    // the hull's screen box (media wave m1, 2026-10-07): its bounding box's eight corners, ground to 2.6 m, in the frame's
    // normalised coordinates (-1..1 each way); whole when every corner lies inside 92 % of the frame
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, ahead = true;
    for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) for (const h of [0, 2.6]) {
      const q = [x + fx * halfLength * a + fz * halfWidth * b, gy + h, z + fz * halfLength * a - fx * halfWidth * b];
      const d = [q[0] - cam.x, q[1] - cam.y, q[2] - cam.z], depth = d[0] * fw[0] + d[1] * fw[1] + d[2] * fw[2];
      if (depth <= 0.5) { ahead = false; continue; }
      const sx = (d[0] * right[0] + d[1] * right[1] + d[2] * right[2]) / depth / tx, sy = (d[0] * up[0] + d[1] * up[1] + d[2] * up[2]) / depth / ty;
      x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    }
    const box = ahead ? [x0, y0, x1, y1].map((v) => +v.toFixed(3)) : null;
    const whole = !!box && box[0] > -0.92 && box[2] < 0.92 && box[1] > -0.92 && box[3] < 0.92;
    perSample.push({ tMs: t, seen: inView, centred, clear: !isBlocked && blockedRays === 0, distM: +Math.hypot(points[0][0] - cam.x, points[0][1] - cam.y, points[0][2] - cam.z).toFixed(1),
      box, whole, size: box ? +((box[3] - box[1]) / 2).toFixed(3) : 0 });
  }
  return { blocked: samples ? blocked / samples : 0, outOfFrame: samples ? outOfFrame / samples : 0, samples, worst, blockedAt, perSample };
}

/**
 * The take's still moments (owner 2026-10-06: "the stills from those are nice, will we use them too?"), each a 4K
 * frame the finals render: the designated moment kept where the hero stands centred and clear there, else the nearest
 * such sample; and the close portrait, the sample where the lens comes nearest the hull (not under `minDistM`, so the
 * frame holds it) with the hero centred and clear, at least `apartMs` from the first. Ends of the take are left out
 * (the loop's crossfade). Returns [ms, ...].
 */
export function stillMoments(scene, model, designatedMs, { minDistM = 8, apartMs = 900, edgeMs = 400, nearMs = 700, burstMs = 1200 } = {}) {
  const dur = scene.storyboard?.durationMs ?? 0;
  // media wave m1 (2026-10-07): a still keeps the whole hull in frame (not cut by an edge), its centre in the middle
  // band of the frame (not squeezed to one side), and no burst at the hero just before (dust or a blast would bury it)
  const bursts = (scene.effects ?? []).filter((e) => e.actor === 'hero' && /dust|boom|huge|barrage|debris|shockwave|smoke/.test(e.type ?? ''));
  const buried = (t) => bursts.some((e) => t >= (e.tMs ?? 0) && t <= (e.tMs ?? 0) + burstMs);
  const framed = (p) => p.whole && p.box && Math.abs((p.box[0] + p.box[2]) / 2) <= 0.4;
  const samples = lensReport(scene, model).perSample.filter((p) => p.seen && p.clear && p.tMs >= edgeMs && p.tMs <= dur - edgeMs);
  const good = samples.filter((p) => framed(p) && !buried(p.tMs));
  if (!good.length) return [designatedMs];
  // the key moment: the designated instant if it frames well, else the best-framed sample within nearMs of it (the
  // larger hull wins), else the nearest good sample
  const near = good.filter((p) => Math.abs(p.tMs - designatedMs) <= nearMs);
  const exact = near.find((p) => Math.abs(p.tMs - designatedMs) < 50);
  const first = exact ? designatedMs : near.length ? near.reduce((a, b) => (b.size > a.size ? b : a)).tMs
    : good.reduce((a, b) => (Math.abs(b.tMs - designatedMs) < Math.abs(a.tMs - designatedMs) ? b : a)).tMs;
  // the close portrait: the largest hull on screen, at least apartMs from the first, never nearer than minDistM
  const close = good.filter((p) => p.distM >= minDistM && Math.abs(p.tMs - first) >= apartMs).sort((a, b) => b.size - a.size)[0];
  return close ? [first, close.tMs] : [first];
}
