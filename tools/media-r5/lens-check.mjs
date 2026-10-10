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
import { insideRecord, sightBlockers, solidsOf } from './world-model.mjs';
import { hullOf } from './route-check.mjs';

const LOW_COVER_M = 1.4;
/** A blocker this large against the hero's width on screen hides it (lensReport). */
const MAJOR_SHARE = 0.35;
/** A thing nearer the lens than the hull this large a share of the frame crowds it (media wave m1, 2026-10-07: S04's
 *  burnt truck box covered about 6 % of the frame's bottom at 2 s). */
export const FORE_SHARE = 0.04;
/** The same, counted only inside the foreground zone: the frame's middle 60 % across, from its bottom up to the hull's
 *  screen box. Houses that line a street stand at the frame's sides and stay out of it; a roof or a wreck under the
 *  lens is in it. */
export const FORE_ZONE = 0.03;
/** A lens looking down more than this many degrees flattens a hull into its roof (composition wave c1). */
export const STEEP_DEG = 30;

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
 * 70 % of the frame), clear (no blocker), distM (lens to hull centre), box (the hull's screen box), whole (the box inside
 * the frame), size (its half height), fore ({ share, kind, zone, zoneKind }: the largest thing nearer the lens than the
 * hull, as a share of the frame, and the largest inside the foreground zone, FORE_ZONE), at (the hull's [x, z]), eye
 * (the lens), pitchDeg (the lens's look up or down; composition wave c1, 2026-10-07: a 40-60° look-down makes the tanks
 * roof plans), heightM (the lens over the ground under it) and facing (the nose's screen x less the tail's: + the hull
 * faces right) }.
 */
export function lensReport(scene, model, { stepMs = 100, aspect = 16 / 9 } = {}) {
  const shots = absoluteShots(scene, model), dur = scene.storyboard?.durationMs ?? 0;
  const heroKeys = scene.storyboard?.actorTracks?.find((t) => t.actor === 'hero')?.keys;
  const heroActor = scene.actors.find((a) => a.name === 'hero');
  if (!shots.length || !heroActor) return { blocked: 0, outOfFrame: 0, inside: 0, samples: 0, worst: [], blockedAt: [], perSample: [] };
  const [halfLength, halfWidth, muzzleReach = halfLength + 2.4, heightM = 2.4] = hullOf(heroActor.id);
  const cam = {}, pose = {}, hits = [], fallen = crushTimes(scene, model);
  // the other tanks (composition wave c3: escorts sliced by the frame's edge, or parked right behind the hero so the
  // hulls fuse), each with its track and contact rectangle
  const escorts = scene.actors.filter((a) => a.name !== 'hero').map((a) => ({
    actor: a, keys: scene.storyboard?.actorTracks?.find((t) => t.actor === a.name)?.keys ?? null, dims: hullOf(a.id), pose: {},
  }));
  let samples = 0, blocked = 0, outOfFrame = 0, insideCount = 0, now = 0;
  const crushed = (r) => (fallen.get(r) ?? Infinity) <= now;
  const ignore = (r) => (r.crushable && r.max[1] - r.min[1] < LOW_COVER_M) || crushed(r);
  const worst = [], blockedAt = [], perSample = [], nearby = [], nearShrubs = [];
  // a lens in a shrub's crown (its inner 0.8 across, under its top) sees only leaves (world-model.mjs shrubs)
  const shrubAround = (eye) => {
    for (const sh of model.queryShrubs?.(eye[0] - 0.5, eye[2] - 0.5, eye[0] + 0.5, eye[2] + 0.5, nearShrubs) ?? []) {
      if (Math.hypot(eye[0] - sh.x, eye[2] - sh.z) < sh.r * 0.8 && eye[1] < sh.y + sh.h) return { kind: sh.kind, min: [sh.x - sh.r, sh.y, sh.z - sh.r], max: [sh.x + sh.r, sh.y + sh.h, sh.z + sh.r] };
    }
    return null;
  };
  for (let t = 0; t <= dur; t += stepMs) {
    if (!sampleCameraRail(shots, t, cam)) continue;
    now = t;
    let x = heroActor.pos[0], z = heroActor.pos[1], yaw = (heroActor.facingDeg ?? 0) * Math.PI / 180;
    if (heroKeys?.length && sampleActorTrack(heroKeys, t, pose)) { x = pose.x; z = pose.z; yaw = (pose.facingDeg ?? 0) * Math.PI / 180; }
    const gy = (model.supportAt ?? model.heightAt)(x, z), fx = Math.sin(yaw), fz = Math.cos(yaw);
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
    // screen right and up as the render has them (2026-10-07: right was mirrored; every check then was symmetric)
    const fw = f.map((v) => v / fl), rl = Math.hypot(fw[2], fw[0]) || 1, right = [-fw[2] / rl, 0, fw[0] / rl];
    const up = [right[1] * fw[2] - right[2] * fw[1], right[2] * fw[0] - right[0] * fw[2], right[0] * fw[1] - right[1] * fw[0]];
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
    const insideAny = insideRecord(model, eye, 0.3) ?? shrubAround(eye), inside = insideAny && !ignore(insideAny) ? insideAny : null;
    if (inside) insideCount++;
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
    // which way the hull faces on screen (composition wave c2, 2026-10-08: guns and blasts ran into the frame's edge,
    // the hull centred with no lead room): the nose's screen x less the tail's, in the frame's units (+ faces right)
    const sx = (q) => { const d = [q[0] - cam.x, q[1] - cam.y, q[2] - cam.z], depth = d[0] * fw[0] + d[1] * fw[1] + d[2] * fw[2]; return depth > 0.5 ? (d[0] * right[0] + d[1] * right[1] + d[2] * right[2]) / depth / tx : null; };
    const noseX = sx(points[1]), tailX = sx(points[2]), facing = noseX != null && tailX != null ? +(noseX - tailX).toFixed(3) : 0;
    const whole = !!box && box[0] > -0.92 && box[2] < 0.92 && box[1] > -0.92 && box[3] < 0.92;
    const distM = Math.hypot(points[0][0] - cam.x, points[0][1] - cam.y, points[0][2] - cam.z);
    // the foreground (media wave m1, 2026-10-07: a burnt truck's cargo box filled the bottom of S04 at 2 s, clear of every
    // sightline): each record nearer the lens than the hull, its solids' corners on screen, the union clipped to the frame,
    // as a share of it; the largest is kept. Trees (the woods rule keeps the lens out of them) and what the hulls have
    // crushed by then are left out. Low cover counts here (composition wave c3, 2026-10-08: of the 41 frames both critics
    // flagged FOREGROUND, the hedgehogs, fences, benches, crates and drums under the lens scored nothing while the
    // sightlines' low-cover rule left them out; it cannot hide a hull, but it crowds the frame).
    let foreShare = 0, foreKind = null, zoneShare = 0, zoneKind = null, clutter = 0, clutterKind = null;
    // clutter: the foreground without architecture (houses and anything over 4 m: a street's frontages are its set,
    // not in the shot's way; composition wave c2 scored them up), so props, low cover and shrubs
    const zoneTop = box ? Math.min(box[1], 0.2) : 0.2;
    model.query(Math.min(cam.x, x) - 10, Math.min(cam.z, z) - 10, Math.max(cam.x, x) + 10, Math.max(cam.z, z) + 10, nearby);
    for (const r of nearby) {
      if (r.treeIdx != null || r.canopyR || crushed(r)) continue;
      const nx = Math.max(r.min[0], Math.min(cam.x, r.max[0])), ny = Math.max(r.min[1], Math.min(cam.y, r.max[1])), nz = Math.max(r.min[2], Math.min(cam.z, r.max[2]));
      if (Math.hypot(nx - cam.x, ny - cam.y, nz - cam.z) > distM - 3) continue;
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (const o of solidsOf(r)) {
        if (o.canopy) continue;
        for (const lx of [-o.hw, o.hw]) for (const lz of [-o.hl, o.hl]) for (const qy of [o.y0, o.y1]) {
          const qx = o.cx + o.c * lx + o.s * lz, qz = o.cz - o.s * lx + o.c * lz;
          const d = [qx - cam.x, qy - cam.y, qz - cam.z], depth = d[0] * fw[0] + d[1] * fw[1] + d[2] * fw[2];
          if (depth <= 0.3) continue;
          const sx = (d[0] * right[0] + d[1] * right[1] + d[2] * right[2]) / depth / tx, sy = (d[0] * up[0] + d[1] * up[1] + d[2] * up[2]) / depth / ty;
          a0 = Math.min(a0, sx); a1 = Math.max(a1, sx); b0 = Math.min(b0, sy); b1 = Math.max(b1, sy);
        }
      }
      const w = Math.min(1, a1) - Math.max(-1, a0), h = Math.min(1, b1) - Math.max(-1, b0);
      const share = w > 0 && h > 0 ? (w * h) / 4 : 0;
      if (share > foreShare) { foreShare = share; foreKind = r.kind; }
      if (share > clutter && r.kind !== 'structure' && r.max[1] - r.min[1] <= 4) { clutter = share; clutterKind = r.kind; }
      const zw = Math.min(0.6, a1) - Math.max(-0.6, a0), zh = Math.min(zoneTop, b1) - Math.max(-1, b0);
      const zone = zw > 0 && zh > 0 ? (zw * zh) / 4 : 0;
      if (zone > zoneShare) { zoneShare = zone; zoneKind = r.kind; }
    }
    // the shrubs nearer the lens than the hull (world-model.mjs; composition wave c3: a bush at the lens filled S36's
    // frame): each crown a box 0.8 of its radius across, ground to top, the same way
    for (const sh of model.queryShrubs?.(Math.min(cam.x, x) - 10, Math.min(cam.z, z) - 10, Math.max(cam.x, x) + 10, Math.max(cam.z, z) + 10, nearShrubs) ?? []) {
      const half = sh.r * 0.8, ring = Math.hypot(sh.x - cam.x, sh.z - cam.z) - half;
      if (ring > distM - 3) continue;
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity, behind = false;
      for (const lx of [-half, half]) for (const lz of [-half, half]) for (const qy of [sh.y, sh.y + sh.h]) {
        const d = [sh.x + lx - cam.x, qy - cam.y, sh.z + lz - cam.z], depth = d[0] * fw[0] + d[1] * fw[1] + d[2] * fw[2];
        if (depth <= 0.3) { behind = true; continue; }
        const sx = (d[0] * right[0] + d[1] * right[1] + d[2] * right[2]) / depth / tx, sy = (d[0] * up[0] + d[1] * up[1] + d[2] * up[2]) / depth / ty;
        a0 = Math.min(a0, sx); a1 = Math.max(a1, sx); b0 = Math.min(b0, sy); b1 = Math.max(b1, sy);
      }
      // a crown reaching behind the lens spans the frame's side it stands on, to the edge
      if (behind && a1 > -Infinity) { if (a0 > 0) a1 = 1; else if (a1 < 0) a0 = -1; b0 = Math.min(b0, -1); }
      const w = Math.min(1, a1) - Math.max(-1, a0), h = Math.min(1, b1) - Math.max(-1, b0);
      const share = w > 0 && h > 0 ? (w * h) / 4 : 0;
      if (share > foreShare) { foreShare = share; foreKind = sh.kind; }
      if (share > clutter) { clutter = share; clutterKind = sh.kind; }
      const zw = Math.min(0.6, a1) - Math.max(-0.6, a0), zh = Math.min(zoneTop, b1) - Math.max(-1, b0);
      const zone = zw > 0 && zh > 0 ? (zw * zh) / 4 : 0;
      if (zone > zoneShare) { zoneShare = zone; zoneKind = sh.kind; }
    }
    // the gun (composition wave c3: barrels cut by the frame's edge or jammed against it in a third of the frames): the
    // muzzle's screen point, `muzzleReach` out along the hull's heading plus the turret's from the trunnion (80 % of the
    // silhouette's height), and `gunRoom`, the frame left ahead of the muzzle toward the edge the gun points at (frame
    // units across, 2 wide; negative when the muzzle is past that edge; null when either point is behind the lens)
    const turretDeg = heroKeys?.length ? pose.turretDeg ?? 0 : heroActor.turretDeg ?? 0, gunDeg = heroKeys?.length ? pose.gunDeg ?? 0 : heroActor.gunDeg ?? 0;
    const gunYaw = yaw + turretDeg * Math.PI / 180, gunPitch = gunDeg * Math.PI / 180, trunnion = gy + heightM * 0.8;
    const screenOf = (q) => {
      const d = [q[0] - cam.x, q[1] - cam.y, q[2] - cam.z], depth = d[0] * fw[0] + d[1] * fw[1] + d[2] * fw[2];
      return depth > 0.5 ? [(d[0] * right[0] + d[1] * right[1] + d[2] * right[2]) / depth / tx, (d[0] * up[0] + d[1] * up[1] + d[2] * up[2]) / depth / ty] : null;
    };
    const pivotS = screenOf([x, trunnion, z]);
    const muzzleS = screenOf([x + Math.sin(gunYaw) * Math.cos(gunPitch) * muzzleReach, trunnion + Math.sin(gunPitch) * muzzleReach, z + Math.cos(gunYaw) * Math.cos(gunPitch) * muzzleReach]);
    const gunRoom = pivotS && muzzleS ? +(muzzleS[0] >= pivotS[0] ? 1 - muzzleS[0] : 1 + muzzleS[0]).toFixed(3) : null;
    // the escorts: one is sliced when its box crosses the frame's side edge with at least a quarter of its width inside
    // and it stands half the hero's height or more; stacked when it stands behind the hero and half its box or more
    // lies inside the hero's
    // and `overlap` (composition wave c4: "a follower stacked behind the turret, the two silhouettes fused"): the largest
    // share of an escort's box (one farther than the hull) inside the hull's, and `turretOverlap`, inside the hull box's
    // upper 45 % (the turret's band)
    let sliced = 0, stacked = 0, overlap = 0, turretOverlap = 0;
    for (const e of escorts) {
      let ex = e.actor.pos[0], ez = e.actor.pos[1], eyaw = (e.actor.facingDeg ?? 0) * Math.PI / 180;
      if (e.keys?.length) { if (!sampleActorTrack(e.keys, t, e.pose)) continue; ex = e.pose.x; ez = e.pose.z; eyaw = (e.pose.facingDeg ?? 0) * Math.PI / 180; }
      const egy = (model.supportAt ?? model.heightAt)(ex, ez), efx = Math.sin(eyaw), efz = Math.cos(eyaw), [ehl, ehw] = e.dims;
      let ex0 = Infinity, ex1 = -Infinity, ey0 = Infinity, ey1 = -Infinity, front = true;
      for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) for (const h of [0, 2.6]) {
        const q = screenOf([ex + efx * ehl * a + efz * ehw * b, egy + h, ez + efz * ehl * a - efx * ehw * b]);
        if (!q) { front = false; continue; }
        ex0 = Math.min(ex0, q[0]); ex1 = Math.max(ex1, q[0]); ey0 = Math.min(ey0, q[1]); ey1 = Math.max(ey1, q[1]);
      }
      if (!front || ey1 < -1 || ey0 > 1 || ex1 < -1 || ex0 > 1) continue;
      const inside = Math.min(1, ex1) - Math.max(-1, ex0), width = ex1 - ex0;
      if ((ex0 < -1 || ex1 > 1) && inside >= width * 0.25 && box && (ey1 - ey0) >= (box[3] - box[1]) * 0.5) sliced++;
      if (box && Math.hypot(ex - cam.x, ez - cam.z) > distM) {
        const ox = Math.min(ex1, box[2]) - Math.max(ex0, box[0]), oy = Math.min(ey1, box[3]) - Math.max(ey0, box[1]);
        if (ox > 0 && oy > 0 && ox * oy >= 0.5 * width * (ey1 - ey0)) stacked++;
        const area = Math.max(1e-6, width * (ey1 - ey0));
        if (ox > 0 && oy > 0) overlap = Math.max(overlap, (ox * oy) / area);
        const band = box[3] - (box[3] - box[1]) * 0.45, ty = Math.min(ey1, box[3]) - Math.max(ey0, band);
        if (ox > 0 && ty > 0) turretOverlap = Math.max(turretOverlap, (ox * ty) / area);
      }
    }
    // a merger (composition waves c2-c3: about a quarter of the critics' notes have a pole, a lamp or a pylon "rising
    // straight out of the turret"): a tall thin record standing behind the hull whose line on screen passes through the
    // turret, the middle half of the hull's box across, from under the box's top to over it
    let merger = 0, mergerKind = null;
    if (box) {
      const mid = (box[0] + box[2]) / 2, span = (box[2] - box[0]) * 0.25;
      // only the corridor behind the hull can hold one: 150 m on from it, 30 m either side
      const ux = x - cam.x, uz = z - cam.z, ul = Math.hypot(ux, uz) || 1, fx2 = x + ux / ul * 150, fz2 = z + uz / ul * 150;
      model.query(Math.min(x, fx2) - 30, Math.min(z, fz2) - 30, Math.max(x, fx2) + 30, Math.max(z, fz2) + 30, nearby);
      for (const r of nearby) {
        const h = r.max[1] - r.min[1], w = Math.max(r.max[0] - r.min[0], r.max[2] - r.min[2]);
        if (h < 4 || w > 2.5 || r.treeIdx != null || crushed(r)) continue;
        const cx = (r.min[0] + r.max[0]) / 2, cz = (r.min[2] + r.max[2]) / 2;
        if (Math.hypot(cx - cam.x, cz - cam.z) < distM + 1) continue;
        const top = screenOf([cx, r.max[1], cz]), foot = screenOf([cx, r.min[1], cz]);
        if (!top || !foot || Math.abs(top[0] - mid) > span) continue;
        if (top[1] > box[3] && foot[1] < box[3]) { merger = 1; mergerKind = r.kind; break; }
      }
    }
    perSample.push({ tMs: t, seen: inView, centred, clear: !isBlocked && blockedRays === 0, distM: +distM.toFixed(1),
      muzzle: muzzleS ? muzzleS.map((v) => +v.toFixed(3)) : null, gunRoom, sliced, stacked, overlap: +overlap.toFixed(3), turretOverlap: +turretOverlap.toFixed(3), merger, mergerKind,
      box, whole, size: box ? +((box[3] - box[1]) / 2).toFixed(3) : 0, fore: { share: +foreShare.toFixed(3), kind: foreKind, zone: +zoneShare.toFixed(3), zoneKind, clutter: +clutter.toFixed(3), clutterKind },
      at: [+x.toFixed(2), +z.toFixed(2)], eye: [+cam.x.toFixed(2), +cam.y.toFixed(2), +cam.z.toFixed(2)], facing,
      pitchDeg: +(Math.asin(Math.max(-1, Math.min(1, fw[1]))) * 180 / Math.PI).toFixed(1), heightM: +(cam.y - model.heightAt(cam.x, cam.z)).toFixed(1) });
  }
  // inside: the share of samples with the lens inside a record (2026-10-08: the dolly zooms ran S12, S15 and S49's lenses
  // into rubble and walls for their last 0.2 s, and S30's through a longhouse, all under the 5 % blocked allowance; the
  // lens inside anything is never allowed)
  return { blocked: samples ? blocked / samples : 0, outOfFrame: samples ? outOfFrame / samples : 0, inside: samples ? insideCount / samples : 0, samples, worst, blockedAt, perSample };
}

/**
 * Whether a burst buries the hull at a lens sample (media wave m1, 2026-10-07: S04's barrage at 5 s): a burst on the
 * hero, or one placed (no actor) within its reach of the hull or of the lens's line to it, from its start until
 * `burstMs` after it ends. Returns a predicate over lensReport's perSample entries.
 */
export function burstsAt(scene, { burstMs = 1200 } = {}) {
  const bursts = (scene.effects ?? []).filter((e) => /dust|boom|explosion|barrage|debris|shockwave|smoke/.test(e.type ?? '')
    && (e.actor === 'hero' || (Array.isArray(e.at) && !e.actor)));
  const lineDist = (q, a, b) => {
    const abx = b[0] - a[0], abz = b[1] - a[1], l2 = abx * abx + abz * abz || 1;
    const u = Math.max(0, Math.min(1, ((q[0] - a[0]) * abx + (q[1] - a[1]) * abz) / l2));
    return Math.hypot(q[0] - a[0] - u * abx, q[1] - a[1] - u * abz);
  };
  return (p) => bursts.some((e) => {
    const t0 = e.tMs ?? 0, t1 = t0 + burstMs + (e.params?.durationS ?? 0) * 1000;
    if (p.tMs < t0 || p.tMs > t1) return false;
    if (e.actor === 'hero') return true;
    const reach = (e.params?.radiusM ?? 0) + (/huge|large/.test(e.params?.size ?? '') ? 12 : 8);
    return Math.hypot(e.at[0] - p.at[0], e.at[1] - p.at[1]) < reach || lineDist(e.at, [p.eye[0], p.eye[2]], p.at) < reach * 0.6;
  });
}

/**
 * The take's framing faults from its lens record (media wave m1 and composition wave c1, 2026-10-07: the subject small
 * in empty ground, cut by the frame or squeezed against its edge, a wreck under the lens, buried in dust), each as the
 * share of the take's samples: small (the hull under 12 % of the frame's height), cut (crossing an edge while under
 * 60 % of the height; a close-up that fills the frame is a choice, a mid-size hull half out of it is not), squeezed (its
 * centre outside the middle 60 % across), crowded (the foreground zone over FORE_ZONE), buried (burstsAt) and steep (the
 * lens looking down more than STEEP_DEG: the critics' first fault, roof plans over empty ground).
 */
export function framingFaults(scene, report) {
  const ps = report.perSample, n = ps.length || 1, buried = burstsAt(scene);
  const share = (f) => ps.filter(f).length / n;
  return {
    small: share((p) => p.seen && p.size < 0.12),
    cut: share((p) => p.seen && !p.whole && p.size < 0.6),
    squeezed: share((p) => p.box && Math.abs((p.box[0] + p.box[2]) / 2) > 0.6),
    crowded: share((p) => p.fore?.zone > FORE_ZONE),
    buried: share((p) => p.seen && buried(p)),
    steep: share((p) => p.pitchDeg < -STEEP_DEG),
  };
}

/**
 * The take's framing by the blind critics' measure, as a share of its samples: sweet, in their sweet spot; bad, what they
 * mark. v1 (composition wave c1, 2026-10-07): the lens at most 6 m up looking down no more than 15°, the hull 30-62 % of
 * the frame's height, whole, centred. v2 (wave c2, 2026-10-08: the takes were low and level, and the critics' faults
 * turned to dead ground under a mid-frame hull, 126 of 292 scores, and guns run into the frame's edge; held against the
 * lens record of c2's 146 frames, composition rose with the hull's bottom edge low in the frame (rank -0.36), its size
 * (+0.35), a level, low lens (-0.31, -0.32), and their GOOD frames sat at size 0.43, bottom edge -0.58, the lens 2.3 m
 * up and 13 m out, three-quarter rather than head-on): sweet wants the hull 40-68 % of the frame's height with its
 * bottom edge in the frame's lowest quarter, the lens at most 3 m up and looking down no more than 6°, the hull turned
 * at least a little (|facing| 0.15), whole, its centre in the middle 35 % either side; bad adds a hull under 30 % of
 * the height or with its bottom edge above the lowest 35 % (dead ground under it). v2 drops v1's foreground share: on
 * c2's frames it did not predict the critics' FOREGROUND flag (thin poles and trees across the hull), and it rose with
 * composition (+0.24: houses framing a street).
 * v3 (wave c3, 2026-10-08; held against the lens record and scores of waves c1-c3's 374 frames): sweet keeps v2's low
 * lens and adds an elevated three-quarter, 3.5-7 m up looking down 8-20° at a hull 10-19 m out and 45-68 % of the
 * frame's height (the critics' 7.0-7.5 frames held both, 11-14 m out; such frames scored 5.72, v2's sweet 5.52; out to
 * 19 m so an elevated dolly zoom's long end, the hull held at that size by the longer lens, counts), so bad moves its
 * pitch limit to -22°. Two flaws come back as rates of their own, not as bad: they cost a good frame half a point, where
 * bad geometry costs two (v2's bad frames 3.74, its sweet 5.52). `flaw`: clutter in the foreground (props, low cover,
 * shrubs, not a street's frontages; clutter >= 0.02 or the zone under the hull >= 0.005 marks the critics' FOREGROUND
 * flag at precision 0.73-0.81 against a base rate of 0.33, and costs a good frame 0.37) or an escort sliced by the
 * frame's side (0.54). `gunTight`: under 0.1 of the frame ahead of the muzzle (64-88 % of such frames drew CUT or
 * EDGE_SQUEEZE; a frame's score held, but each of the four c3 re-plans whose tight-gun share rose to 0.88-1.00 lost
 * 0.33-1.00 as a take). `merger`: a pole or lamp behind the hull rising out of its turret (the lens report's merger:
 * 21 of the 28 frames it marks carry a critic's note of it, and it finds 56 % of the notes naming a pole, lamp or wire;
 * smoke, chimneys and spires it cannot see; a good frame loses 0.1).
 */
export function framingScore(report, { version = 2 } = {}) {
  const ps = report.perSample, n = ps.length || 1;
  const edge = (p) => (p.box ? Math.abs((p.box[0] + p.box[2]) / 2) : 2);
  if (version === 1) {
    const sweet = ps.filter((p) => p.seen && p.heightM <= 6 && p.pitchDeg >= -15 && p.size >= 0.3 && p.size <= 0.62 && p.whole && edge(p) <= 0.3 && p.fore.share < FORE_SHARE).length / n;
    const bad = ps.filter((p) => !p.seen || p.pitchDeg < -18 || p.heightM > 13 || p.size < 0.2 || (!p.whole && p.size < 0.58) || edge(p) > 0.5 || p.fore.share >= 0.06).length / n;
    return { sweet, bad };
  }
  if (version === 2) {
    const sweet = ps.filter((p) => p.seen && p.whole && p.heightM <= 3 && p.pitchDeg >= -6 && p.size >= 0.4 && p.size <= 0.68
      && p.box && p.box[1] <= -0.5 && edge(p) <= 0.35 && Math.abs(p.facing ?? 0) >= 0.15).length / n;
    const bad = ps.filter((p) => !p.seen || p.pitchDeg < -15 || p.heightM > 8 || p.size < 0.3 || (!p.whole && p.size < 0.58)
      || edge(p) > 0.5 || (p.box && p.box[1] > -0.3)).length / n;
    return { sweet, bad };
  }
  const low = (p) => p.heightM <= 3 && p.pitchDeg >= -6 && p.size >= 0.4 && p.size <= 0.68;
  const raised = (p) => p.heightM > 3.5 && p.heightM <= 7 && p.pitchDeg >= -20 && p.pitchDeg <= -8 && p.size >= 0.45 && p.size <= 0.68
    && p.distM >= 10 && p.distM <= 19;
  const sweet = ps.filter((p) => p.seen && p.whole && (low(p) || raised(p)) && p.box && p.box[1] <= -0.5 && edge(p) <= 0.35
    && Math.abs(p.facing ?? 0) >= 0.15).length / n;
  const bad = ps.filter((p) => !p.seen || p.pitchDeg < -22 || p.heightM > 8 || p.size < 0.3 || (!p.whole && p.size < 0.58)
    || edge(p) > 0.5 || (p.box && p.box[1] > -0.3)).length / n;
  const flaw = ps.filter((p) => (p.fore?.clutter ?? 0) >= 0.02 || (p.fore?.zone ?? 0) >= 0.005 || p.sliced > 0).length / n;
  const gunTight = ps.filter((p) => p.gunRoom != null && p.gunRoom < 0.1).length / n;
  const merger = ps.filter((p) => p.merger > 0).length / n;
  return { sweet, bad, flaw, gunTight, merger };
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
  // band of the frame (not squeezed to one side), nothing big in front of it, and no burst at the hero just before (dust
  // or a blast would bury it): one on the hero, or one placed within its reach of the hull or of the lens's line to it
  // (S04's barrage at 5 s)
  const buried = burstsAt(scene, { burstMs });
  const framed = (p) => p.whole && p.box && Math.abs((p.box[0] + p.box[2]) / 2) <= 0.4;
  const open = (p) => !(p.fore?.zone > FORE_ZONE);
  const samples = lensReport(scene, model).perSample.filter((p) => p.seen && p.clear && p.tMs >= edgeMs && p.tMs <= dur - edgeMs);
  // the strictest rule set that leaves a moment: all of them, then the bursts allowed, then the foreground too; the
  // close portrait looks through the same tiers on its own, so a take keeps its two stills
  const pools = [samples.filter((p) => framed(p) && open(p) && !buried(p)), samples.filter((p) => framed(p) && open(p)), samples.filter(framed)];
  const good = pools.find((g) => g.length) ?? [];
  if (!good.length) return [designatedMs];
  // the key moment: the designated instant if it frames well, else the best-framed sample within nearMs of it (the
  // larger hull wins), else the nearest good sample
  const near = good.filter((p) => Math.abs(p.tMs - designatedMs) <= nearMs);
  const exact = near.find((p) => Math.abs(p.tMs - designatedMs) < 50);
  const first = exact ? designatedMs : near.length ? near.reduce((a, b) => (b.size > a.size ? b : a)).tMs
    : good.reduce((a, b) => (Math.abs(b.tMs - designatedMs) < Math.abs(a.tMs - designatedMs) ? b : a)).tMs;
  // the close portrait: the largest hull on screen, at least apartMs from the first, never nearer than minDistM
  // (a close portrait is close: at least 60 % of the largest framed hull in the take, and 18 % of the frame's height)
  const largest = Math.max(0, ...pools[2].filter((p) => p.distM >= minDistM).map((p) => p.size));
  const closeEnough = (p) => p.size >= Math.min(largest, Math.max(0.18, 0.6 * largest));
  let close = null;
  for (const pool of pools) {
    close = pool.filter((p) => p.distM >= minDistM && Math.abs(p.tMs - first) >= apartMs && closeEnough(p)).sort((a, b) => b.size - a.size)[0];
    if (close) break;
  }
  return close ? [first, close.tMs] : [first];
}
