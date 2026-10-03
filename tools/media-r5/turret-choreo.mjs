// Turret choreography for the site loops (owner 2026-10-03: "experiment with turrets being at unique angles and
// rotations"). Every gun has a job:
//   - each turret watches its own sector and scans it on a sine whose period is the loop, so the take's tail matches
//     its head and the crossfade never doubles a barrel: the hero holds on the fight ahead, a wingman watches outward
//     from its side of the formation, the tail tank of a column watches the rear;
//   - before each of its shots a turret traverses to that shot's target (the tank it knocks out, the enemy that fired
//     at it, or the nearest enemy still in the fight) at about 30°/s, holds through the shot, then goes back to its
//     scan; nothing moves inside the loop's crossfade windows;
//   - style 'flank' turns one hero round (never a knockout; the one with the most room to swing out and back) onto a
//     flank target on the side away from the lens, so the barrel crosses the frame; its round lands out on that bearing;
//   - style 'lens' (close holds) turns the hero's first round that is not a knockout ~35° toward the lens, so the barrel
//     angles at the camera (the turret lab's strongest close frames, 2026-10-03).
// Angles are relative to the hull, + toward the hull's left (headings grow toward +X; a hull facing +Z has -X on its
// right), the convention setups.mjs uses for turretDeg.
const deg = r => r * 180 / Math.PI, rad = d => d * Math.PI / 180;
const wrap = d => ((d % 360) + 540) % 360 - 180;
const yawTo = (from, to) => deg(Math.atan2(to[0] - from[0], to[1] - from[1]));
const smooth = u => u * u * (3 - 2 * u);
export const TRAVERSE_DEG_S = 30;
const RATE = TRAVERSE_DEG_S / 1000, LEAD_MS = 350, HOLD_MS = 550, SCAN_DEG = 11, GRID_MS = 100;
const GUNS = [3.2, 0.8, 4.5, 2, 3.8];

/** An actor's pose at t from its storyboard track (linear between keys) or its placement. */
export function poseAt(scene, name, t) {
  const a = scene.actors.find(x => x.name === name);
  const k = scene.storyboard?.actorTracks?.find(tr => tr.actor === name)?.keys;
  if (!k?.length) return { p: a.pos, h: a.facingDeg };
  if (t <= k[0].tMs) return { p: k[0].pos, h: k[0].facingDeg };
  if (t >= k[k.length - 1].tMs) return { p: k[k.length - 1].pos, h: k[k.length - 1].facingDeg };
  let i = 0; while (k[i + 1].tMs < t) i++;
  const u = (t - k[i].tMs) / (k[i + 1].tMs - k[i].tMs), L = (x, y) => x + (y - x) * u;
  return { p: [L(k[i].pos[0], k[i + 1].pos[0]), L(k[i].pos[1], k[i + 1].pos[1])], h: L(k[i].facingDeg, k[i + 1].facingDeg) };
}
const lateral = (pose, q) => { const f = [Math.sin(rad(pose.h)), Math.cos(rad(pose.h))]; return (q[0] - pose.p[0]) * -f[1] + (q[1] - pose.p[1]) * f[0]; };
const along = (pose, q) => { const f = [Math.sin(rad(pose.h)), Math.cos(rad(pose.h))]; return (q[0] - pose.p[0]) * f[0] + (q[1] - pose.p[1]) * f[1]; };
/** Turret angle (relative to the hull) that lays `name`'s gun on point q at time t. */
const bearingTo = (scene, name, q, t) => { const p = poseAt(scene, name, t); return wrap(yawTo(p.p, q) - p.h); };
const camAt = (scene, t) => { const sh = scene.storyboard.shots; let best = sh[0]; for (const s of sh) if (Math.abs(s.tMs - t) < Math.abs(best.tMs - t)) best = s; return best; };

/** Each shooter's shots with their targets: the foe its round kills or penetrates, else the foe that fired at it,
 * else the nearest foe still in the fight. */
function engagements(scene, name) {
  const foes = scene.actors.filter(a => a.name.startsWith('foe'));
  const live = foes.filter(f => !/burn|wreck/.test(f.state ?? ''));
  const fx = scene.effects;
  return fx.filter(e => e.type === 'fire' && e.actor === name).sort((a, b) => a.tMs - b.tMs).map(shot => {
    const hit = fx.find(e => ['impact', 'tank_kill'].includes(e.type) && e.actor?.startsWith('foe') && e.tMs >= shot.tMs && e.tMs <= shot.tMs + 400);
    let target = hit ? foes.find(f => f.name === hit.actor) : null;
    if (!target) {
      const shooter = fx.filter(e => e.type === 'fire' && e.actor?.startsWith('foe') && e.tMs < shot.tMs).sort((a, b) => b.tMs - a.tMs)[0];
      target = shooter ? foes.find(f => f.name === shooter.actor) : null;
    }
    if (!target) {
      const p = poseAt(scene, name, shot.tMs).p, pool = live.length ? live : foes;
      target = pool.slice().sort((a, b) => Math.hypot(a.pos[0] - p[0], a.pos[1] - p[1]) - Math.hypot(b.pos[0] - p[0], b.pos[1] - p[1]))[0];
    }
    return { t: shot.tMs, q: target?.pos ?? null, kill: Boolean(hit) };
  }).filter(e => e.q);
}

/**
 * Plans every allied turret and gun for a built shot (setups.mjs buildShot output).
 * @returns {{ turrets: Record<string, [number, number][]>, guns: Record<string, number>, effects: object[], notes: string[] }}
 */
export function choreograph(scene, { loopMs, xfadeMs, style = 'sectors', flankDeg = 62, lensDeg = 35 }) {
  const dur = loopMs + xfadeMs, allies = scene.actors.filter(a => !a.name.startsWith('foe'));
  const hero0 = poseAt(scene, 'hero', 0), foes = scene.actors.filter(a => a.name.startsWith('foe'));
  const turrets = {}, guns = {}, effects = [], notes = [];
  allies.forEach((a, i) => {
    const plan = engagements(scene, a.name).map(e => ({ t: e.t, b: bearingTo(scene, a.name, e.q, e.t), kill: e.kill }));
    // its sector: the hero watches the fight ahead; a wingman looks outward from its side, the tail of a column behind
    let center;
    if (a.name === 'hero') center = plan[0]?.b ?? (foes.length ? bearingTo(scene, 'hero', foes[0].pos, 0) : 0);
    // the hero's flank shot, on the side away from the lens: the round (never a knockout) with room to swing out from
    // the sector and back before the wrap, as wide as that room allows (up to flankDeg; under 30° it is not a swing)
    if (a.name === 'hero' && style === 'flank' && plan.length) {
      // time to swing out (from the crossfade's end, or from the round before) and back (to the next round, or the wrap)
      const room = e => {
        const j = plan.indexOf(e), prev = plan[j - 1], next = plan[j + 1];
        const outMs = e.t - LEAD_MS - Math.max(xfadeMs + 50, prev ? prev.t + 200 : 0);
        const backMs = (next ? next.t - LEAD_MS : loopMs - 50) - (e.t + HOLD_MS);
        return Math.min(flankDeg, (TRAVERSE_DEG_S * 1.25 / 1000) * Math.min(outMs, backMs));
      };
      const pick = plan.filter(e => !e.kill).sort((x, y) => room(y) - room(x))[0];
      if (pick && room(pick) >= 30) {
        const pose = poseAt(scene, 'hero', pick.t), cam = camAt(scene, pick.t);
        const side = lateral(pose, [cam.pos[0], cam.pos[2]]) > 0 ? 1 : -1; // lens on the right -> swing left (+)
        pick.b = wrap(pick.b + side * room(pick)); pick.flank = true;
        const yaw = rad(pose.h + pick.b), q = [pose.p[0] + Math.sin(yaw) * 75, pose.p[1] + Math.cos(yaw) * 75];
        effects.push({ type: 'explosion', at: [+q[0].toFixed(2), +q[1].toFixed(2)], tMs: pick.t + 140, params: { size: 'large', cause: 'shot' }, choreo: true },
          { type: 'debris', at: [+q[0].toFixed(2), +q[1].toFixed(2)], tMs: pick.t + 170, params: { count: 34, speedMps: 15, hot: 0.4, scale: 1.1 }, choreo: true });
        if (pick === plan[0]) center = plan.find(e => !e.flank)?.b ?? wrap(pick.b - side * room(pick));
      }
    }
    // style 'lens' (close holds): the hero's first round that is not a knockout goes out ~lensDeg toward the lens side —
    // the barrel angles at the camera; the hero watches that bearing and traverses to its knockout targets and back. Its
    // round lands behind the lens, so it gets no impact.
    if (a.name === 'hero' && style === 'lens' && plan.length) {
      const pick = plan.find(e => !e.kill);
      if (pick) {
        const pose = poseAt(scene, 'hero', pick.t), cam = camAt(scene, pick.t);
        const side = lateral(pose, [cam.pos[0], cam.pos[2]]) > 0 ? -1 : 1; // lens on the right -> swing right (-)
        pick.b = wrap(pick.b + side * lensDeg); pick.flank = true;
        if (pick === plan[0]) center = pick.b;
      }
    }
    if (a.name !== 'hero') {
      const lat = lateral(hero0, a.pos), lon = along(hero0, a.pos);
      const tail = i === allies.length - 1 && allies.length >= 3 && lon < -25;
      center = tail ? (lat > 0 ? -150 : 150) : Math.abs(lat) < 2 ? (i % 2 ? 48 : -48) : (lat > 0 ? -(42 + 9 * i) : 42 + 9 * i);
    }
    let amp = a.name === 'hero' ? 4 : SCAN_DEG;
    const phase = i * 2.1, span = (x, y) => Math.max(300, Math.abs(wrap(y - x)) / RATE);
    // the loop's seams stay still: a first shot too early to traverse to is fired from the sector itself, and a last
    // shot too late to come back from becomes the sector (then the late return is short)
    // (a tight leg may run up to 1.25x the traverse rate; a real turret tops out near 40-45°/s)
    if (plan.length) {
      const first = plan[0], last = plan[plan.length - 1];
      if (first.t - LEAD_MS - span(center, first.b) / 1.25 < xfadeMs + 50) { center = first.b; amp = Math.min(amp, 4); }
      else if (last.t + HOLD_MS + span(last.b, center) / 1.25 > loopMs - 50) { center = last.b; amp = Math.min(amp, 4); }
    }
    const scan = t => center + amp * Math.sin(2 * Math.PI * t / loopMs + phase);
    // the timeline: scan, traverse onto each target, hold through the shot, then back to the scan (or straight on to
    // the next target), every segment inside [xfade, loop]
    const segs = [];
    let free = xfadeMs;
    plan.forEach((e, j) => {
      const prev = segs[segs.length - 1], fromTarget = prev && prev.kind === 'hold' ? prev.b : null;
      const in1 = Math.max(free + 200, e.t - LEAD_MS);
      if (fromTarget != null) segs.push({ kind: 'between', t0: free, t1: in1, b0: fromTarget, b: e.b });
      else {
        const in0 = Math.max(free, in1 - span(scan(in1), e.b));
        if (in0 > free) segs.push({ kind: 'scan', t0: free, t1: in0 });
        segs.push({ kind: 'in', t0: in0, t1: in1, b: e.b });
      }
      const next = plan[j + 1];
      let hold1 = Math.min(e.t + HOLD_MS, loopMs - 300);
      const back = span(e.b, scan(hold1));
      if (next && next.t - LEAD_MS - span(e.b, next.b) < hold1 + back + 200) { // the next shot comes first
        hold1 = Math.max(e.t + 200, Math.min(hold1, next.t - LEAD_MS - span(e.b, next.b)));
        segs.push({ kind: 'hold', t0: in1, t1: hold1, b: e.b }); free = hold1; return;
      }
      segs.push({ kind: 'hold', t0: in1, t1: hold1, b: e.b });
      const out1 = Math.min(loopMs - 50, hold1 + back);
      segs.push({ kind: 'out', t0: hold1, t1: out1, b: e.b }); free = out1;
    });
    const angle = t => {
      const s = scan(t), g = segs.find(x => t >= x.t0 && t < x.t1);
      if (!g || g.kind === 'scan') return s;
      const u = smooth((t - g.t0) / Math.max(1, g.t1 - g.t0));
      if (g.kind === 'in') return s + wrap(g.b - s) * u;
      if (g.kind === 'hold') return g.b;
      if (g.kind === 'between') return g.b0 + wrap(g.b - g.b0) * u;
      return g.b + wrap(s - g.b) * u; // out
    };
    const keys = [];
    for (let t = 0; t <= dur; t += GRID_MS) keys.push([t, +angle(t).toFixed(2)]);
    if (keys[keys.length - 1][0] !== dur) keys.push([dur, +angle(dur).toFixed(2)]);
    turrets[a.name] = keys;
    guns[a.name] = a.name === 'hero' ? 1.6 : GUNS[i % GUNS.length];
    notes.push(`${a.name} sector ${center.toFixed(0)}° ±${amp}° · ${plan.map(e => `${(e.t / 1000).toFixed(1)}s@${e.b.toFixed(0)}°`).join(' ') || 'no shots'}`);
  });
  return { turrets, guns, effects, notes };
}

/** Loop seam, traverse speed and lay of a planned turret set (for the receipt). */
export function choreoReport(scene, turrets, { loopMs, xfadeMs }) {
  const at = (keys, t) => { let i = 0; while (i < keys.length - 2 && keys[i + 1][0] <= t) i++; const [t0, a0] = keys[i], [t1, a1] = keys[i + 1]; return a0 + (a1 - a0) * Math.min(1, Math.max(0, (t - t0) / Math.max(1, t1 - t0))); };
  let seam = 0, speed = 0;
  for (const keys of Object.values(turrets)) {
    for (let t = 0; t <= xfadeMs; t += 50) seam = Math.max(seam, Math.abs(wrap(at(keys, t) - at(keys, t + loopMs))));
    for (let i = 1; i < keys.length; i++) speed = Math.max(speed, Math.abs(wrap(keys[i][1] - keys[i - 1][1])) / ((keys[i][0] - keys[i - 1][0]) / 1000));
  }
  return { seamDeg: seam, maxDegS: speed };
}
