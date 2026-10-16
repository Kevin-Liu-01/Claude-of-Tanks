// Round 6, vs02: the village street-corner ambush on Verdant (the owner, 2026-10-15 17:45: "make them unique scenes
// instead of plaigarizing"; vs02 is one of his favourites, and Verdant's buildings are his visual bar).
// The corner is a real one: the west lane of Verdant's east-west road, where it runs between the granary (south, its
// north-east corner at x -26.8, z 57.4) and the red-brick schoolhouse (north, x -42.2..-25.9, z 73.8..84.3). The
// telephone line runs north-south along the main road at x 10-13, behind this lens, so no conductor crosses the frame.
// The Challenger 3 has come up the granary's east side at speed and swings round its corner into the lane, front
// three-quarter to a low lens standing in the lane; the T-80U holds at the village's west edge, framed between the two
// houses at the end of the lane, front three-quarter, its gun flashing. Its first HE round has just burst on the
// granary's street wall beside the Challenger's glacis (masonry and dust falling), the Challenger's round sparks off the
// T-80U's front, and a cook-off column and a burning field stand beyond the village edge.
import { SCENES, fx, moment, hitFx, polar, inFrame, bearingOf, axes, wrap, r2, lensAt, ground, CLEAN, LIT } from '../versus.mjs';

const ID = 'vs02-verdant-challenger-t80u-r6';
const MAP = 'verdant';
const T = 7000;
// the lens frame: a low lens in the lane, looking west-south-west down it to the village edge
const EYE = [-12, 72], YAW = 239;
const at = (side, ahead) => inFrame(EYE, YAW, side, ahead).map(r2);

SCENES[ID] = () => {
  // the Challenger 3 at the corner, 14 m off: out of the side lane up the granary's east face, its nose on the lane's
  // far side, its turret already slewed down the lane onto the T-80U (the lens 42 degrees off its nose, on its left)
  const hPos = [-21, 59], hHead = 352;
  // the T-80U at the village edge, 35 m down the lane, its hull and gun laid on the Challenger
  const tPos = [-46, 63], tHead = r2(bearingOf(tPos, hPos));
  const hero = { id: 'challenger_3x', name: 'hero', pos: hPos, facingDeg: hHead, turretDeg: r2(wrap(bearingOf(hPos, tPos) - hHead)), gunDeg: 1,
    camo: 'factory', camoSeed: 7101 };
  const foe = { id: 't80u_x', name: 'foe0', pos: tPos, facingDeg: tHead, turretDeg: 0, gunDeg: 1, camo: 'factory', camoSeed: 7102 };
  // the Challenger's run: up the granary's east side (x about -21.5) at about 6 m/s, its nose swinging right into the
  // lane toward the T-80U (only the first leg, clear of the granary, is the check's route)
  const { f } = axes(hHead);
  const key = (k, tMs, p, facing) => ({ id: `hero-${k}`, tMs, pos: p.map(r2), facingDeg: r2(facing), turretDeg: hero.turretDeg, gunDeg: 1, transition: 'linear' });
  const track = { actor: 'hero', keys: [
    key(0, T - 2600, [hPos[0] - 0.6, hPos[1] - 16.5], (hHead + 12) % 360),
    key(1, T - 1000, [hPos[0] - 0.35, hPos[1] - 6.6], (hHead + 6) % 360),
    key(2, T, hPos, hHead),
    key(3, T + 600, [hPos[0] + f[0] * 3.6, hPos[1] + f[1] * 3.6], hHead),
  ] };
  // the T-80U's HE round, a near miss: it ends on the granary's street (north) wall by its far corner, in the gap
  // between the Challenger's glacis and the T-80U in the frame, on the line it flew from the T-80U's muzzle
  const wallAim = [-32.2, 57.4], dir = bearingOf(tPos, wallAim), wallFrom = polar(wallAim, dir + 180, 2.5);
  const burst = [r2(wallAim[0]), r2(ground(MAP, ...wallAim) + 2.7), r2(wallAim[1] + 0.6)];
  // beyond the village edge: a cook-off column and a burning field, behind the T-80U in the lens frame
  const behind = (side, ahead) => inFrame(EYE, YAW, side, ahead).map(r2);
  const effects = [
    fx('dust', 'hero', T - 220, { count: 14, intensity: 1.1 }),
    moment('foe0', T, 0.05),
    ...hitFx(MAP, foe, hPos, T - 130, 'ricochet'),
    fx('explosion', wallFrom.map(r2), T - 650, { munition: 'he', wall: true, dirDeg: r2(dir), hitH: 2.7 }),
    fx('debris', burst, T - 620, { count: 46, speedMps: 9, hot: 0.35, scale: 1.25 }),
    fx('dust', [r2(wallAim[0] + 0.4), r2(wallAim[1] + 0.8)], T - 560, { count: 10, intensity: 1.2 }),
    fx('explosion', behind(-60, 115), 0, { size: 'huge' }),
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
