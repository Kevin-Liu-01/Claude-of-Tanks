// Round 6, vs09: the wide-angle hero on Glacier Pass (the owner, 2026-10-15 17:45: "make them unique scenes instead of
// plaigarizing ... experiment all with new scenes").
// Pass 2 (the owner, 2026-10-16: "i want to see tank fronts more in the other versus, and tanks should be more % of
// frame" and "more interesting camera rotation and angles"): both noses to the lens, the lens raised and rolled. The
// shipped pass is kept in v6/archive/vs09-alpine-strv122-t80bv-r6.shipped-20261015.mjs.
// A wide lens stands 3.4 m over the snow of the northern cross road, tilted 10 degrees (a Dutch angle) and looking down
// past the two tanks to the saddle and the mountain wall. The Strv 122 (winter) charges up at it at 12 m/s, 9 m off,
// nose on (32 degrees), filling the right half of the frame, a rooster tail of snow behind it, its turret swung left onto
// the T-80BV and firing. The T-80BV (winter) stands 19 m off on the left, nose to the lens, just hit: its engine deck
// smoking, spall and sparks still flying off its front, its gun laid back on the Strv, its spilled fuel burning on its
// far side (fire, smoke and fragments behind it, never on it). The low morning sun stands off the lens's left side, out
// of frame: raking light on the Strv's glacis, a grey shadow side to the powder and a morning glow in the sky's left.
import { SCENES, fx, hitFx, polar, inFrame, bearingOf, axes, wrap, r2, lensAt, ground, dimsOf, CLEAN, LIT } from '../versus.mjs';

const ID = 'vs09-alpine-strv122-t80bv-r6';
const MAP = 'alpine';
const T = 7000;
// the lens frame: 3.4 m over the snow of the northern cross road, looking north-north-east to the saddle
const EYE = [145.7, 193.6], YAW = 33;
const at = (side, ahead) => inFrame(EYE, YAW, side, ahead).map(r2);

SCENES[ID] = () => {
  // the T-80BV 18 m off on the left, nose to the lens (16 degrees off it, turned toward the Strv), its turret on the Strv
  const tPos = at(-11, 14);
  // the Strv 122 9 m off on the right; the lens 32 degrees off its nose (on its left), its turret swung onto the T-80BV
  const sPos = at(4, 8), sHead = r2((bearingOf(sPos, EYE) - 32 + 360) % 360);
  const hero = { id: 'strv122_x', name: 'hero', pos: sPos, facingDeg: sHead, turretDeg: r2(wrap(bearingOf(sPos, tPos) - sHead)), gunDeg: 1,
    camo: 'winter', camoSeed: 7191, recoilAgeS: 0.04 };
  const tHead = r2((bearingOf(tPos, EYE) + 16 + 360) % 360);
  const foe = { id: 't80bv', name: 'foe0', pos: tPos, facingDeg: tHead, turretDeg: r2(wrap(bearingOf(tPos, sPos) - tHead)), gunDeg: 2,
    camo: 'winter', camoSeed: 7192, state: 'engine-smoking' };
  // the Strv's run (FX-RECIPES 2026-10-15): 12 m/s along its heading, firing on the move, so its tracks throw a full
  // rooster tail of snow
  const SPEED = 12, { f, r } = axes(sHead), d = dimsOf(hero.id);
  const hullAt = (ago) => [sPos[0] - f[0] * SPEED * ago / 1000, sPos[1] - f[1] * SPEED * ago / 1000];
  const key = (k, tMs, p) => ({ id: `hero-${k}`, tMs, pos: p.map(r2), facingDeg: sHead, turretDeg: hero.turretDeg, gunDeg: hero.gunDeg, transition: 'linear' });
  const track = { actor: 'hero', keys: [key(0, T - 2600, hullAt(2600)), key(1, T + 400, hullAt(-400))] };
  // snow bursts at both rear track ends where the hull was, along its heading
  const tail = [];
  for (const [ago, count] of [[1500, 27], [1100, 27], [750, 27], [450, 24], [220, 21], [90, 15]]) {
    const p = hullAt(ago);
    for (const sd of [-1, 1]) {
      const q = [p[0] - f[0] * d[0] * 0.9 + r[0] * sd * d[1] * 0.8, p[1] - f[1] * d[0] * 0.9 + r[1] * sd * d[1] * 0.8];
      tail.push(fx('dust', q.map(r2), T - ago, { count, intensity: 1.3, dirDeg: r2(sHead) }));
    }
  }
  // its far side: the line from the lens through it, 7 m on
  const back = polar(tPos, bearingOf(EYE, tPos), 7).map(r2), g = ground(MAP, ...back);
  const effects = [
    ...tail,
    // the Strv fires: a live muzzle flash 42 ms before the still (every exposure sample sees it; no bolt), its bore about
    // 60 degrees across the view ray and its muzzle clear of the T-80BV in the frame; the recoil is recoilAgeS
    fx('muzzle_flash', 'hero', T - 42, { caliberMm: 140 }),
    // the T-80BV: the Strv's last round in its front 0.7 s ago (spall and sparks still in the air, the pop long gone);
    // its spilled fuel burning on its far side since, smoke and embers rising, fragments thrown up behind it
    ...hitFx(MAP, foe, sPos, T - 700, 'penetration'),
    fx('fire_field', back, 0, { radiusM: 3.5, durationS: 40, intensity: 1.1, smoke: true }),
    fx('embers', back, 0, { radiusM: 3, rate: 40, durationS: 20, rise: 3 }),
    fx('debris', [back[0], r2(g + 1.6), back[1]], T - 900, { count: 30, speedMps: 11, hot: 0.7, scale: 1.2 }),
  ];
  return { map: MAP, timeOfDay: 'morning', seed: 1909,
    // the morning sun low off the lens's left side, out of frame: raking on the Strv's glacis, glowing in the sky
    light: { sunAzimuthDeg: r2((YAW + 72) % 360), sunElevationDeg: 15 },
    actors: [hero, foe], effects, fxTime: T, timeScale: 0,
    storyboard: { version: 1, durationMs: T + 1500, shots: [], actorTracks: [track] },
    picture: { ...CLEAN, ...LIT }, fx: { quality: 'cinematic', trackDust: true }, autoPlace: false,
    lenses: [
      // a: 3.4 m up, looking down past the tanks, rolled 10 degrees anticlockwise (the frame's left side down), fov 66
      { ...lensAt('a', EYE, 3.4, polar(EYE, YAW, 18), 1.4, 66), rollDeg: 10 },
      // b: lower and steeper in the tilt
      { ...lensAt('b', EYE, 2.4, polar(EYE, YAW, 18), 1.3, 66), rollDeg: 13 },
    ],
    meta: { id: ID, kind: 'versus-still', pair: 'strv122_x v t80bv', round: 6, pass: 2,
      idea: 'the wide-angle hero, pass 2: a raised, Dutch-angled wide lens as the Strv 122 charges it firing and the hit T-80BV faces it, the mountains behind' } };
};
