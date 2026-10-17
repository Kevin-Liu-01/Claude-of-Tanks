// Round 6, vs06: the beach charge (Saltmere Bay, bright day). Owner pass, 2026-10-16: "i want to see tank fronts more in
// the other versus, and tanks should be more % of frame" and "more interesting camera rotation and angles".
// A lens stands on the pale strand, 1.5 m up and 6 m from the water, tilted -10° (a Dutch angle against vs05's +9°), and
// looks along the shore with the bay behind the far tank. The Type 10 charges up the sand straight at it, 16 m out, its
// front 28° off the lens, filling half the frame. Its turret faces the lens (its gun 32° off it), and it fires past the
// lens's left at a target out of frame. The ZTZ-99A2 comes up out of the surf on the right, 23 m out, front-on at 14°, firing back at the
// Type 10, and the Type 10's left cheek takes its round as a short, low spark fan. Sand sprays from both tracks. The sun
// stands behind the lens and lights both fronts.
// (GO-render QA, 2026-10-17: the Type 10 had aimed at the ZTZ 17 m deeper, so its turret showed its right rear and
// stowage basket. Its gun is now laid 26° off the lens, so the turret face reads. The far water column did not read
// against the pale sky and is gone. The lens came up to 1.5 m for more surf, and moved onto the pale strand within 8 m
// of the water. Kept from earlier QA: every lens-to-hull line clear of records and shrub crowns; live muzzle_flash
// blasts, the barrels recoiled, no firing_moment bolt and no effect at T; ricochet fans thrown sideways and down;
// honestly day. Placement from the GO dump, rerender-226/features-go.)
import { SCENES, fx, plate, inFrame, bearingOf, axes, wrap, r2, lensAt, ground, polar, dimsOf, CLEAN, LIT, MOVE_MS } from '../versus.mjs';

const ID = 'vs06-coastal-type10-ztz99a2-r6';
const MAP = 'coastal';
const DEG = Math.PI / 180;
// the lens's ground point on the pale strand (6 m from the water), its bearing along the shore, the aim's turn and pitch,
// and the roll
const EYE = [320, -154];
const YAW = 114, AIM_DY = -0.1, PITCH = 2.1, LIFT = 1.5, FOV = 34, ROLL = -10;

SCENES[ID] = () => {
  const T = 7000, g = (p) => ground(MAP, p[0], p[1]);
  const at = (side, ahead) => inFrame(EYE, YAW, side, ahead);
  // the Type 10 16 m out, the lens 28° off its nose on its right, its gun laid 32° off the lens direction toward the
  // frame's outer (left) side, at a target out of frame past the lens, so its turret face reads and its blast stands at
  // the frame's left, clear of the ZTZ; the ZTZ 22 m out at the water's edge, the lens 14° off its nose on its left,
  // its gun laid on the Type 10
  const A = at(-3, 16), B = at(8, 22);
  const hA = (bearingOf(A, EYE) + 28 + 360) % 360, hB = (bearingOf(B, EYE) - 14 + 360) % 360;
  const hero = { id: 'type10_x', name: 'hero', pos: A.map(r2), facingDeg: r2(hA), turretDeg: r2(wrap(bearingOf(A, EYE) - 32 - hA)), gunDeg: 1,
    camo: 'factory', camoSeed: 7106, recoilAgeS: 0.04 };
  const foe = { id: 'ztz99a2', name: 'foe0', pos: B.map(r2), facingDeg: r2(hB), turretDeg: r2(wrap(bearingOf(B, A) - hB)),
    gunDeg: r2(Math.atan2(g(A) - g(B), Math.hypot(A[0] - B[0], A[1] - B[1])) / DEG + 0.6), camo: 'factory', camoSeed: 7107, recoilAgeS: 0.04 };

  // the charge: the Type 10 at 5 m/s, the ZTZ at 4 m/s up out of the surf, over the 2.6 s before the still and on past it
  const drive = (a, speed) => {
    const { f } = axes(a.facingDeg), hullAt = (ago) => [a.pos[0] - f[0] * speed * ago / 1000, a.pos[1] - f[1] * speed * ago / 1000];
    const key = (k, tMs, p) => ({ id: `${a.name}-${k}`, tMs, pos: p.map(r2), facingDeg: a.facingDeg, turretDeg: a.turretDeg, gunDeg: a.gunDeg, transition: 'linear' });
    return { track: { actor: a.name, keys: [key(0, T - MOVE_MS, hullAt(MOVE_MS)), key(1, T + 400, hullAt(-400))] }, hullAt };
  };
  const dh = drive(hero, 5), df = drive(foe, 4);
  // sand off both tracks: bursts at both rear track ends where each hull was before the still, thrown back (dirDeg the heading)
  const tail = (a, hullAt, bursts) => {
    const { f, r } = axes(a.facingDeg), d = dimsOf(a.id), out = [];
    for (const [ago, count] of bursts) {
      const p = hullAt(ago);
      for (const s of [-1, 1]) {
        const q = [p[0] - f[0] * d[0] * 0.9 + r[0] * s * d[1] * 0.8, p[1] - f[1] * d[0] * 0.9 + r[1] * s * d[1] * 0.8];
        out.push(fx('dust', q.map(r2), T - ago, { count, intensity: 1.2, dirDeg: r2(a.facingDeg) }));
      }
    }
    return out;
  };
  // the ZTZ's round on the Type 10's plate facing it, 0.25 s old: a small ricochet whose short fan is thrown sideways
  // toward the ZTZ and down onto the sand, never up into the sky
  // (GO QA 2, 10-17: thrown level toward the ZTZ 12.5 m off, the fan's sparks drew thin orange needles across its glacis
  // and turret face) the fan swung 75° off the line to the ZTZ, to the side away from the lens, and thrown down
  const strike = (me, from, tMs) => {
    const p = plate(MAP, me, from), b = bearingOf(me.pos, from);
    const toEye = [EYE[0] - me.pos[0], EYE[1] - me.pos[1]];
    const away = [polar([0, 0], b + 75, 1), polar([0, 0], b - 75, 1)].sort((s, t) => (s[0] * toEye[0] + s[1] * toEye[1]) - (t[0] * toEye[0] + t[1] * toEye[1]))[0];
    const n = [r2(away[0] * 0.7), -0.7, r2(away[1] * 0.7)];
    return [fx('impact', p.at, tMs, { kind: 'ricochet', caliberMm: 60, normal: n }), fx('sparks', p.at, tMs + 20, { caliberMm: 40, normal: n }),
      fx('debris', p.at, tMs + 10, { count: 8, speedMps: 6, hot: 0.6, scale: 0.4 })];
  };
  const effects = [
    ...tail(hero, dh.hullAt, [[1200, 21], [800, 21], [450, 18], [200, 15], [90, 12]]),
    ...tail(foe, df.hullAt, [[700, 16], [400, 14], [180, 12]]),
    // the Type 10's shot at the 175 mm blast-size cap, its gun turned toward the lens: a live blast 42 ms old over a
    // 0.3 s-old one whose smoke ring and haze read; the ZTZ's answering shot, 120 mm and 65 ms old, its fire turned orange
    fx('muzzle_flash', 'hero', T - 300, { caliberMm: 175 }), fx('muzzle_flash', 'hero', T - 42, { caliberMm: 175 }),
    fx('muzzle_flash', 'foe0', T - 65, { caliberMm: 120 }),
    ...strike(hero, foe.pos, T - 250),
  ];

  const look = polar(EYE, YAW + AIM_DY, 30), eyeY = g(EYE) + LIFT;
  const lens = { ...lensAt('a', EYE, LIFT, look, r2(eyeY + 30 * Math.tan(PITCH * DEG) - g(look)), FOV), rollDeg: ROLL };
  return { map: MAP, timeOfDay: 'day', seed: 1906,
    // bright coastal day: the sun behind the lens, on both fronts
    light: { sunAzimuthDeg: r2((YAW + AIM_DY + 180) % 360), sunElevationDeg: 35 },
    actors: [hero, foe], effects, fxTime: T, timeScale: 0,
    storyboard: { version: 1, durationMs: T + 1500, shots: [], actorTracks: [dh.track, df.track] },
    picture: { ...CLEAN, ...LIT }, fx: { quality: 'cinematic', trackDust: true }, autoPlace: false,
    lenses: [lens],
    meta: { id: ID, kind: 'versus-still', pair: 'type10_x v ztz99a2', round: 6,
      idea: 'the beach charge: the Type 10 charges up the strand at a tilted lens, its turret facing it, the ZTZ-99A2 firing back out of the surf' } };
};
