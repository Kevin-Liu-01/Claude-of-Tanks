// Round 6, vs02: the village street-corner ambush on Verdant (the owner, 2026-10-15 17:45: "make them unique scenes
// instead of plaigarizing"; vs02 is one of his favourites, and Verdant's buildings are his visual bar).
// The corner is a real one: the west lane of Verdant's east-west road, where it runs between the granary (south, its
// north-east corner at x -26.8, z 57.4) and the red-brick schoolhouse (north, x -42.2..-25.9, z 73.8..84.3). The
// telephone line runs north-south along the main road at x 10-13, behind this lens, so no conductor crosses the frame.
// The Challenger 3 has come up the granary's east side at speed and bursts round its corner into the lane, front
// three-quarter to a low lens standing in the lane; the T-80U holds at the village's west edge, framed between the two
// houses at the end of the lane, front three-quarter, its gun laid on the Challenger. Its HE round burst on the granary's
// street wall 1.4 s ago, clear of the Challenger's glacis (smoke, masonry and debris falling); the Challenger fires now
// (muzzle flash) and its round sparks off the T-80U's front; a cook-off column and a burning field stand beyond the edge.
// (QA lessons 2026-10-15: no flash or fresh glow on the T-80U itself, which is 11 % of the frame, so it reads.)
import { SCENES, fx, hitFx, polar, inFrame, bearingOf, axes, wrap, r2, lensAt, ground, dimsOf, CLEAN, LIT } from '../../versus.mjs';

const ID = 'vs02-verdant-challenger-t80u-r6';
const MAP = 'verdant';
const T = 7000;
// the lens frame: a low lens in the lane, looking west-south-west down it to the village edge
const EYE = [-12, 72], YAW = 239;
const at = (side, ahead) => inFrame(EYE, YAW, side, ahead).map(r2);

SCENES[ID] = () => {
  // the Challenger 3 at the corner, 15 m off: out of the side lane up the granary's east side into the lane, its turret
  // slewed down the lane onto the T-80U (the lens 31 degrees off its nose, on its left), clear of the granary wall
  const hPos = [-20, 58.5], hHead = 0;
  // the T-80U at the village edge, 35 m down the lane, its hull and gun laid on the Challenger
  const tPos = [-46, 63], tHead = r2(bearingOf(tPos, hPos));
  const hero = { id: 'challenger_3x', name: 'hero', pos: hPos, facingDeg: hHead, turretDeg: r2(wrap(bearingOf(hPos, tPos) - hHead)), gunDeg: 1,
    camo: 'factory', camoSeed: 7101, recoilAgeS: 0.04 };
  const foe = { id: 't80u_x', name: 'foe0', pos: tPos, facingDeg: tHead, turretDeg: 0, gunDeg: 1, camo: 'factory', camoSeed: 7102 };
  // the Challenger's run (FX-RECIPES 2026-10-15): straight up the granary's east side at 11 m/s, so its tracks throw a
  // full rooster tail; it starts 1.4 s before the still, its tail clear of the command tent behind it
  const SPEED = 11, { f, r } = axes(hHead), d = dimsOf(hero.id);
  const hullAt = (ago) => [hPos[0] - f[0] * SPEED * ago / 1000, hPos[1] - f[1] * SPEED * ago / 1000];
  const key = (k, tMs, p) => ({ id: `hero-${k}`, tMs, pos: p.map(r2), facingDeg: hHead, turretDeg: hero.turretDeg, gunDeg: hero.gunDeg, transition: 'linear' });
  const track = { actor: 'hero', keys: [key(0, T - 1400, hullAt(1400)), key(1, T + 400, hullAt(-400))] };
  // dust bursts at both rear track ends where the hull was, along its heading (the churn flies back, the wake drifts on)
  const tail = [];
  for (const [ago, count] of [[1300, 27], [1000, 27], [700, 27], [450, 24], [220, 21], [90, 15]]) {
    const p = hullAt(ago);
    for (const sd of [-1, 1]) {
      const q = [p[0] - f[0] * d[0] * 0.9 + r[0] * sd * d[1] * 0.8, p[1] - f[1] * d[0] * 0.9 + r[1] * sd * d[1] * 0.8];
      tail.push(fx('dust', q.map(r2), T - ago, { count, intensity: 1.3, dirDeg: r2(hHead) }));
    }
  }
  // the T-80U's HE round, a near miss 1.4 s ago: it ended on the granary's street (north) wall by its far corner, in the
  // gap between the Challenger's glacis and the T-80U in the frame, on the line it flew from the T-80U's muzzle
  const wallAim = [-32.2, 57.4], dir = bearingOf(tPos, wallAim), wallFrom = polar(wallAim, dir + 180, 2.5);
  const burst = [r2(wallAim[0]), r2(ground(MAP, ...wallAim) + 2.7), r2(wallAim[1] + 0.6)];
  // beyond the village edge: a cook-off column (a second one a second later fills its broken top) and a burning field
  const behind = (side, ahead) => inFrame(EYE, YAW, side, ahead).map(r2);
  const col = behind(-60, 115);
  const effects = [
    ...tail,
    // the Challenger fires: a live muzzle flash 42 ms before the still (every exposure sample sees it; no bolt), the
    // bore 47 degrees across the view ray, 20 m from the lens; the recoil is the actor's recoilAgeS
    fx('muzzle_flash', 'hero', T - 42, { caliberMm: 140 }),
    // its previous round on the T-80U's front 0.26 s ago: the pop gone, the sparks still flying (no glow on the T-80U)
    ...hitFx(MAP, foe, hPos, T - 260, 'ricochet'),
    fx('explosion', wallFrom.map(r2), T - 1400, { munition: 'he', wall: true, dirDeg: r2(dir), hitH: 2.7 }),
    fx('debris', burst, T - 1100, { count: 36, speedMps: 8, hot: 0.3, scale: 1.2 }),
    fx('dust', [r2(wallAim[0] + 0.4), r2(wallAim[1] + 0.8)], T - 1300, { count: 10, intensity: 1.2, dirDeg: 0 }),
    fx('explosion', col, 0, { size: 'huge' }),
    fx('explosion', [r2(col[0] + 0.6), r2(col[1] + 0.6)], 1000, { size: 'huge' }),
    fx('fire_field', behind(2, 58), 0, { radiusM: 5, durationS: 40, intensity: 1, smoke: true }),
    fx('embers', behind(2, 58), 0, { radiusM: 4, rate: 50, durationS: 20, rise: 3 }),
  ];
  return { map: MAP, timeOfDay: 'day', seed: 1902,
    // a fair-weather day sun behind the lens's left shoulder, low enough to light the hull fronts and the walls
    light: { sunAzimuthDeg: r2((YAW + 180 - 25) % 360), sunElevationDeg: 36 },
    actors: [hero, foe], effects, fxTime: T, timeScale: 0,
    storyboard: { version: 1, durationMs: T + 1500, shots: [], actorTracks: [track] },
    picture: { ...CLEAN, ...LIT }, fx: { quality: 'cinematic', trackDust: true }, autoPlace: false,
    lenses: [
      lensAt('a', EYE, 1.15, polar(EYE, YAW, 20), 1.9, 56),
      lensAt('b', EYE, 0.85, polar(EYE, YAW - 1, 20), 2.0, 62),
    ],
    meta: { id: ID, kind: 'versus-still', pair: 'challenger_3x v t80u_x', round: 6,
      idea: 'the village street-corner ambush: the Challenger 3 swings round the granary corner into the lane as the T-80U fires from the village edge' } };
};
