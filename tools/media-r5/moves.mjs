// Motion moves for the site fifty and the films (owner 2026-10-05: "a lot of motion with the camera itself moving as if
// it's on a fully 3D track, tanks moving in crazy directions with a lot of speed, the camera close and far away from
// tanks"). Camera moves are multi-key 3D tracks for buildShot's `cam` (flown on the Studio's spline rail); route patterns
// are per-tank curves for buildShot's `routes` (routePath). Positions are in metres in the hero's travel frame (side:
// + is the hull's right, along: + ahead, lift: height above ground) or, for orbits, `orbit` degrees around the hero
// (0 ahead, 90 its right, 180 behind) at `radius`. The owner wants fronts, not rears (2026-10-05): every move leads or
// flanks the tank and passes behind it only in transit.
//   MOTION = { rail: 'spline', travelS: 1.5 } — spread into a shot's motion spec with routes and one of the moves.

export const MOTION = Object.freeze({ rail: 'spline', travelS: 1.5 });

const T = (dur, u) => Math.round(dur * u);
const key = (dur, u, c) => ({ tMs: u >= 1 ? 'end' : T(dur, u), frame: 'travel', lookFrame: 'travel', ...c });

/** Dive: high and wide over the battlefield, down to a low pass a few metres off the hull, then away and up. */
export function swoop(dur, { side = 1, high = [38, 70], low = [2.2, 8], out = [10, 30], fov = [40, 46, 40], lookAhead = 6, lowAt = 0.55 } = {}) {
  return [
    key(dur, 0, { orbit: side * 25, radius: high[1], lift: high[0], fov: fov[0], lookHero: [0, lookAhead + 12, 1] }),
    key(dur, lowAt * 0.55, { orbit: side * 45, radius: (high[1] + low[1]) * 0.45, lift: (high[0] + low[0]) * 0.4, fov: (fov[0] + fov[1]) / 2, lookHero: [0, lookAhead + 4, 1.4] }),
    key(dur, lowAt, { orbit: side * 70, radius: low[1], lift: low[0], fov: fov[1], lookHero: [0, lookAhead, 1.6] }),
    key(dur, (lowAt + 1) / 2, { orbit: side * 100, radius: (low[1] + out[1]) / 2, lift: (low[0] + out[0]) / 2, fov: (fov[1] + fov[2]) / 2, lookHero: [0, lookAhead, 1.6] }),
    key(dur, 1, { orbit: side * 118, radius: out[1], lift: out[0], fov: fov[2], lookHero: [0, lookAhead + 6, 1.2] }),
  ];
}

/** Lead and reveal: right in front of the charging hull, then flying backwards and up as it bears down, the battle
 * opening up behind it. */
export function leadReveal(dur, { side = 1, near = [1.4, 9], far = [22, 55], fov = [34, 42], swing = 30 } = {}) {
  return [
    key(dur, 0, { orbit: side * 8, radius: near[1], lift: near[0], fov: fov[0], lookHero: [0, 0, 1.8] }),
    key(dur, 0.35, { orbit: side * (8 + swing * 0.3), radius: near[1] * 1.6, lift: near[0] * 1.8, fov: fov[0] + 2, lookHero: [0, 2, 1.8] }),
    key(dur, 0.7, { orbit: side * (8 + swing * 0.75), radius: (near[1] + far[1]) * 0.55, lift: (near[0] + far[0]) * 0.5, fov: (fov[0] + fov[1]) / 2, lookHero: [0, -4, 1.4] }),
    key(dur, 1, { orbit: side * (8 + swing), radius: far[1], lift: far[0], fov: fov[1], lookHero: [0, -12, 0.8] }),
  ];
}

/** Orbit and rise: a half circle round the hull at speed, climbing from the tracks to a high three-quarter. */
export function orbitRise(dur, { from = -70, to = 110, radius = [9, 26], lift = [1.4, 20], fov = [42, 38] } = {}) {
  const n = 5;
  return Array.from({ length: n }, (_, i) => {
    const u = i / (n - 1), e = u * u * (3 - 2 * u);
    return key(dur, u, { orbit: from + (to - from) * u, radius: radius[0] + (radius[1] - radius[0]) * e, lift: lift[0] + (lift[1] - lift[0]) * e,
      fov: fov[0] + (fov[1] - fov[0]) * u, lookHero: [0, 2, 1.6 - 0.6 * e] });
  });
}

/** Cable cam: a line flown across the battlefield in the set's own frame (pinned at t = 0), low and fast, the tanks
 * racing underneath and past while the lens stays on the hero. `from` / `to`: [side, along, lift] at the take's ends. */
export function cable(dur, { from = [-24, 70, 5], via = null, to = [26, 40, 3], fov = [40, 34], lookAhead = 4 } = {}) {
  const pts = via ? [from, via, to] : [from, to];
  return pts.map(([side, along, lift], i) => ({ tMs: i === pts.length - 1 ? 'end' : T(dur, i / (pts.length - 1)), frame: 'world', lookFrame: 'travel',
    side, along, lift, fov: fov[0] + (fov[1] - fov[0]) * i / (pts.length - 1), lookHero: [0, lookAhead, 1.6] }));
}

/** Chase and weave: on the flank at speed, sliding in close to the running gear and out wide, banking with the swerves. */
export function weave(dur, { side = 1, close = 6, wide = 22, along = [10, 2, 14, -2, 8], lift = [1.6, 3.2, 1.2, 4, 2.4], fov = 42, roll = 6 } = {}) {
  return along.map((a, i) => key(dur, i / (along.length - 1), {
    side: side * (i % 2 ? close : wide), along: a, lift: lift[i % lift.length], fov, roll: (i % 2 ? -1 : 1) * side * roll, lookHero: [0, 3, 1.6] }));
}

/** Overtake: from a low chase off the quarter, past the hull at speed and round in front of it. */
export function overtake(dur, { side = 1, lift = [2.4, 1.6, 3.5], radius = [16, 8, 18], fov = [38, 44, 38] } = {}) {
  return [
    key(dur, 0, { orbit: side * 150, radius: radius[0], lift: lift[0], fov: fov[0], lookHero: [0, 6, 1.6] }),
    key(dur, 0.45, { orbit: side * 95, radius: radius[1], lift: lift[1], fov: fov[1], lookHero: [0, 2, 1.6] }),
    key(dur, 1, { orbit: side * 25, radius: radius[2], lift: lift[2], fov: fov[2], lookHero: [0, -2, 1.6] }),
  ];
}

/** Each gun on the foe its own rounds go to: the target of the first kill (or hit) within 1.5 s of one of its shots,
 * else the foes in turn — a knockout round is laid on its victim (the site50 selftest's rule). For buildShot's `aim`. */
export function aimFor(effects, actors, foeCount) {
  const target = (actor) => {
    for (const f of effects.filter((e) => e.type === 'fire' && e.actor === actor).sort((x, y) => x.tMs - y.tMs)) {
      const after = effects.filter((e) => e.tMs >= f.tMs && e.tMs <= f.tMs + 1500 && (e.actor ?? '').startsWith('foe'));
      const hit = after.find((e) => e.type === 'tank_kill') ?? after.find((e) => e.type === 'impact');
      if (hit) return hit.actor;
    }
    return null;
  };
  return Object.fromEntries(actors.map((a, i) => [a, target(a) ?? `foe${i % Math.max(1, foeCount)}`]));
}

// ---------------------------------------------------------------------------------------------------- route patterns
// Waypoints [lat, lon] in the set's frame (lat: + the set heading's right; lon: ahead), long enough for `speed` over the
// take plus a margin, so nobody stops (routePath carries on past the last point anyway).
const reach = (speed, dur, extra = 20) => speed * dur / 1000 + extra;

/** A swerving charge: down the lane at speed, weaving `wiggle` metres either side. */
export function charge({ lat = 0, lon = 0, speed = 15, dur = 6600, wiggle = 6, phase = 1, v0 = null, accel = 0 } = {}) {
  const L = reach(speed, dur);
  return { pts: [[lat, lon], [lat + phase * wiggle, lon + L * 0.3], [lat - phase * wiggle, lon + L * 0.62], [lat + phase * wiggle * 0.5, lon + L]], speed,
    ...(v0 != null ? { v0, accel } : {}) };
}

/** A hard turn across the field: in on the lane, then sweeping `turnDeg` to the side at speed (a slide round a corner). */
export function arc({ lat = 0, lon = 0, speed = 14, dur = 6600, turnDeg = 70, radius = 35, side = 1 } = {}) {
  const L = reach(speed, dur), pts = [[lat, lon], [lat, lon + L * 0.25]];
  const cx = lat + side * radius, cy = lon + L * 0.25, steps = 4;
  for (let i = 1; i <= steps; i++) { const a = (turnDeg * i / steps) * Math.PI / 180; pts.push([cx - side * radius * Math.cos(a), cy + radius * Math.sin(a)]); }
  const end = pts[pts.length - 1], dir = [side * Math.sin(turnDeg * Math.PI / 180), Math.cos(turnDeg * Math.PI / 180)];
  pts.push([end[0] + dir[0] * L * 0.4, end[1] + dir[1] * L * 0.4]);
  return { pts, speed };
}

/** Crossing paths: from `from` to `to` (each [lat, lon]) through a bend, at speed — two of these with mirrored ends
 * make an X; offset their `startMs` so the hulls pass well clear of each other. */
export function crossing({ from, to, bend = 0, speed = 15, startMs = 0 } = {}) {
  const mid = [(from[0] + to[0]) / 2 + bend, (from[1] + to[1]) / 2];
  return { pts: [from, mid, to], speed, ...(startMs ? { startMs } : {}) };
}
