// The tanks behind the fire (owner 2026-10-14, on the combat takes: "make sure tanks are still visible and its not just a
// ton of explosions", pointing at s186's winter sunset: a camo-netted T-72B3M side-on, the fireball and black smoke
// behind it). Each effect's body over its life, as a sphere (bursts, knockout fireballs, impacts) or a column (a wreck's
// smoke, a ground fire), so a check can ask, sample by sample, how much of a tank's screen box a nearer effect covers,
// how much of the frame the effects fill, and how many bursts burn at once. The sizes are the engine's as filmed for the
// combat round (lens-check.mjs BURST_R at the peak), held a little long and a little large: the rule errs toward a
// clear tank.
import { sampleActorTrack } from '../../src/game/studioTimeline.ts';
import { hullOf } from './route-check.mjs';

// a burst's radius at its peak by its size (the media worktree's lens-check.mjs BURST_R, the frame-edge rule's)
const BURST_R = { small: 1.8, medium: 2.5, large: 3.5, huge: 7, mixed: 2.2 };

// a burst: the fireball grows to R over 300 ms and holds to 900 ms; its smoke, 1.25 R, rises 1.5 m/s to 2.8 s
const FIREBALL_MS = 900, SMOKE_MS = 2800, GROW_MS = 300;
// a tank under a sixth of the frame's height (its box, in the frame's -1..1 units)
const SMALL_TANK = 2 / 6;
/** Every effect with a body: { kind, actor, tMs, x, z, R, life: 'burst' | 'impact' | 'column', toMs, H? }. */
export function fxItems(scene) {
  const pose = {}, dur = scene.storyboard?.durationMs ?? 0, items = [];
  const at = (name, tMs) => {
    const keys = scene.storyboard?.actorTracks?.find((t) => t.actor === name)?.keys;
    if (keys?.length && sampleActorTrack(keys, tMs, pose)) return [pose.x, pose.z];
    const a = scene.actors.find((x) => x.name === name);
    return a ? [a.pos[0], a.pos[1]] : null;
  };
  const xz = (e) => (Array.isArray(e.at) ? (e.at.length >= 3 ? [e.at[0], e.at[2]] : [e.at[0], e.at[1]]) : e.actor ? at(e.actor, e.tMs) : null);
  // a hit seated on a tank's armour (site50.mjs seatArmor: its point on the plate, the tank's name gone) is that tank's
  // own: the tank whose hull it sits on at the moment, within its half length and 1.5 m
  const ownerOf = (e, p) => {
    if (e.actor) return e.actor;
    if (!Array.isArray(e.at) || e.at.length < 3) return null;
    for (const a of scene.actors) {
      const q = at(a.name, e.tMs);
      if (q && Math.hypot(q[0] - p[0], q[1] - p[1]) <= Math.max(3, hullOf(a.id)[0]) + 1.5) return a.name;
    }
    return null;
  };
  for (const e of scene.effects ?? []) {
    if (e.type === 'explosion' || e.type === 'tank_kill') {
      const p = xz(e);
      if (!p) continue;
      const size = e.params?.size ?? 'large';
      items.push({ kind: e.type === 'tank_kill' ? 'knockout fireball' : `${size} burst`, actor: e.type === 'tank_kill' ? e.actor ?? null : Array.isArray(e.at) ? null : e.actor ?? null,
        tMs: e.tMs, x: p[0], z: p[1], R: e.type === 'tank_kill' ? 3 : BURST_R[size] ?? 3.5, life: 'burst', toMs: e.tMs + SMOKE_MS });
    } else if (e.type === 'barrage' && Array.isArray(e.at)) {
      // lens-check.mjs framedEffects' shells (cinematicFx's own ring and stagger)
      const count = Math.max(1, Math.min(12, e.params?.count ?? 5)), radius = e.params?.radiusM ?? 10, size = e.params?.size ?? 'mixed';
      const seed = (e.params?.seedDeg || 23) * Math.PI / 180, durS = e.params?.durationS ?? 3;
      const [cx, cz] = e.at.length >= 3 ? [e.at[0], e.at[2]] : e.at;
      for (let i = 0; i < count; i++) {
        const a = seed + (i / count) * Math.PI * 2, d = radius * (0.3 + 0.7 * (((i * 37) % 10) / 10));
        const medium = size === 'medium' || (size === 'mixed' && i % 3 === 0), delayMs = count > 1 ? (i / (count - 1)) * durS * 1000 : 0;
        items.push({ kind: 'barrage shell', actor: null, tMs: e.tMs + delayMs, x: cx + Math.sin(a) * d, z: cz + Math.cos(a) * d, R: medium ? 2.7 : 2.0, life: 'burst', toMs: e.tMs + delayMs + SMOKE_MS });
      }
    } else if (e.type === 'impact') {
      const p = xz(e);
      // (a hit is a flash: its spark fan and puff are gone in 0.2 s, the coordinator's allowance)
      if (p) items.push({ kind: 'impact', actor: ownerOf(e, p), tMs: e.tMs, x: p[0], z: p[1], R: 1.2, life: 'impact', toMs: e.tMs + 200 });
    } else if (e.type === 'burning' || e.type === 'fire_field') {
      const p = xz(e);
      if (!p) continue;
      items.push(e.type === 'burning'
        ? { kind: 'smoke column', actor: e.actor ?? null, tMs: e.tMs, x: p[0], z: p[1], R: 1.8, H: 9, base: 1.6, life: 'column', toMs: dur }
        : { kind: 'ground fire', actor: null, tMs: e.tMs, x: p[0], z: p[1], R: e.params?.radiusM ?? 4, H: 2, base: 0, life: 'column', toMs: dur });
    }
  }
  return items;
}

/** The items alive at tMs as bodies: { item, kind, sphere: [x, y, z, r] } or { item, kind, column: [x, z, y0, y1, r] }. */
export function fxBodies(items, tMs, groundAt) {
  const out = [];
  for (const it of items) {
    if (tMs < it.tMs || tMs > it.toMs) continue;
    const gy = groundAt(it.x, it.z), age = tMs - it.tMs;
    if (it.life === 'column') { out.push({ item: it, kind: it.kind, column: [it.x, it.z, gy + it.base, gy + it.base + it.H, it.R] }); continue; }
    if (it.life === 'impact') { out.push({ item: it, kind: it.kind, fireball: true, sphere: [it.x, gy + 1.2, it.z, it.R] }); continue; }
    if (age <= FIREBALL_MS) {
      const r = it.R * Math.min(1, Math.max(0.3, age / GROW_MS));
      out.push({ item: it, kind: it.kind, fireball: true, sphere: [it.x, gy + 0.7 * it.R, it.z, r] });
    } else {
      out.push({ item: it, kind: `${it.kind}'s smoke`, fireball: false, sphere: [it.x, gy + 0.7 * it.R + 1.5 * (age - FIREBALL_MS) / 1000, it.z, 1.25 * it.R] });
    }
  }
  return out;
}

/**
 * One sample through a lens: for each tank box (screen units, [x0, y0, x1, y1] in -1..1, with its view depth and name),
 * the share of a 9 x 6 grid over it that a body nearer the lens than the tank covers (a tank's own effects never cover
 * it: its knockout is the shot), the frame share every body covers (16 x 9 grid), and the bursts in their fireball
 * inside the frame. `view` = { proj: (p) => [sx, sy, depth] | null, tx, ty }.
 */
export function fxCoverAt(bodies, tanks, view) {
  const shapes = [];
  for (const b of bodies) {
    if (b.sphere) {
      const [x, y, z, r] = b.sphere, c = view.proj([x, y, z]);
      if (!c || c[2] <= 0.5) continue;
      shapes.push({ b, depth: c[2], ellipse: [c[0], c[1], r / (c[2] * view.tx), r / (c[2] * view.ty)] });
    } else {
      const [x, z, y0, y1, r] = b.column, lo = view.proj([x, y0, z]), hi = view.proj([x, y1, z]);
      if (!lo || !hi || lo[2] <= 0.5) continue;
      const hw = r / (lo[2] * view.tx);
      shapes.push({ b, depth: lo[2], box: [Math.min(lo[0], hi[0]) - hw, Math.min(lo[1], hi[1]), Math.max(lo[0], hi[0]) + hw, Math.max(lo[1], hi[1])] });
    }
  }
  const inside = (s, px, py) => s.ellipse
    ? ((px - s.ellipse[0]) / s.ellipse[2]) ** 2 + ((py - s.ellipse[1]) / s.ellipse[3]) ** 2 <= 1
    : px >= s.box[0] && px <= s.box[2] && py >= s.box[1] && py <= s.box[3];
  const cover = {};
  for (const t of tanks) {
    if (!t.box) { cover[t.name] = { share: 0, by: null }; continue; }
    // a small tank (under a sixth of the frame's height) is lost against fire behind it as well (review 3's aftermath,
    // 2026-10-14: the barrage behind the far Challenger, AbramsX and Strv 122 swallowed them), so any body over it counts
    const small = t.box[3] - t.box[1] < SMALL_TANK;
    const front = shapes.filter((s) => (small || s.depth < t.depth - 1) && s.b.item.actor !== t.name);
    let hit = 0, n = 0;
    const by = new Map();
    for (let i = 0; i < 9; i++) for (let j = 0; j < 6; j++) {
      const px = t.box[0] + (t.box[2] - t.box[0]) * (i + 0.5) / 9, py = t.box[1] + (t.box[3] - t.box[1]) * (j + 0.5) / 6;
      n++;
      const s = front.find((q) => inside(q, px, py));
      if (s) { hit++; by.set(s.b.kind, (by.get(s.b.kind) ?? 0) + 1); }
    }
    cover[t.name] = { share: hit / n, by: [...by].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null };
  }
  let filled = 0;
  for (let i = 0; i < 16; i++) for (let j = 0; j < 9; j++) {
    const px = -1 + (i + 0.5) / 8, py = -1 + (j + 0.5) / 4.5;
    if (shapes.some((s) => inside(s, px, py))) filled++;
  }
  const bursts = shapes.filter((s) => s.b.fireball && s.b.item.life === 'burst' && s.ellipse && Math.abs(s.ellipse[0]) < 1 && Math.abs(s.ellipse[1]) < 1).length;
  return { cover, frame: filled / 144, bursts };
}
