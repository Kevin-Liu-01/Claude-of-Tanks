// Round 6, vs09: the wide-angle low hero on Glacier Pass (the owner, 2026-10-15 17:45: "make them unique scenes instead
// of plaigarizing ... experiment all with new scenes").
// A wide lens sits low in the snow north-east of the frozen lake, looking up the northern cross road toward the saddle
// and the mountain wall behind it. The Strv 122 rolls past the lens 9 m off, front three-quarter, filling the right of
// the frame, its gun swung onto the pass and flashing, snow kicked up from its tracks and thrown off the ground by the
// blast. Far up the road on the pass the T-80BV it has just hit burns: fire, a rising column, spall and debris in the
// air. The morning sun stands low behind the lens's left shoulder, 17 degrees off the Strv's nose: on its glacis and the
// mountains' faces.
import { SCENES, fx, moment, hitFx, polar, inFrame, bearingOf, axes, wrap, r2, lensAt, ground, CLEAN, LIT } from '../versus.mjs';

const ID = 'vs09-alpine-strv122-t80bv-r6';
const MAP = 'alpine';
const T = 7000;
// the lens frame: low in the snow, looking north-east up the northern cross road to the saddle
const EYE = [100, 178], YAW = 30;
const at = (side, ahead) => inFrame(EYE, YAW, side, ahead).map(r2);

SCENES[ID] = () => {
  // the T-80BV on the pass: on the northern cross road where it climbs to the saddle, 108 m off in the left of the
  // frame (the mountain wall behind it); hit, burning, its gun still laid on the Strv
  const tPos = [195, 229.6];
  // the Strv 122 9 m off on the right; the lens 34 degrees off its nose on its left (glacis and left flank to the lens),
  // its turret square across the hull (-89 degrees) onto the T-80BV
  const sPos = at(3.3, 8.6), sHead = r2((bearingOf(sPos, EYE) - 34 + 360) % 360);
  const hero = { id: 'strv122_x', name: 'hero', pos: sPos, facingDeg: sHead, turretDeg: r2(wrap(bearingOf(sPos, tPos) - sHead)), gunDeg: 1,
    camo: 'winter', camoSeed: 7191 };
  const tHead = r2((bearingOf(tPos, sPos) + 28 + 360) % 360);
  const foe = { id: 't80bv', name: 'foe0', pos: tPos, facingDeg: tHead, turretDeg: r2(wrap(bearingOf(tPos, sPos) - tHead)), gunDeg: 2,
    camo: 'winter', camoSeed: 7192, state: 'burning', stateAgeS: 4 };
  // the Strv's run: 3.5 m/s along its heading, through the still and on
  const { f } = axes(sHead), back = 3.5 * 2.6, on = 3.5 * 0.6;
  const key = (k, tMs, p) => ({ id: `hero-${k}`, tMs, pos: p.map(r2), facingDeg: sHead, turretDeg: hero.turretDeg, gunDeg: 1, transition: 'linear' });
  const track = { actor: 'hero', keys: [key(0, T - 2600, [sPos[0] - f[0] * back, sPos[1] - f[1] * back]), key(1, T + 600, [sPos[0] + f[0] * on, sPos[1] + f[1] * on])] };
  const g = ground(MAP, ...tPos);
  const effects = [
    fx('dust', 'hero', T - 220, { count: 14, intensity: 1.2 }),
    moment('hero', T, 0.05),
    // the T-80BV: the Strv's last round in its front 0.7 s ago (a penetration: spall, sparks, hot debris in the air),
    // the fire it lit burning since, a cook-off pop throwing fragments up as the still is taken
    ...hitFx(MAP, foe, sPos, T - 700, 'penetration'),
    fx('burning', 'foe0', 0),
    fx('debris', [r2(tPos[0]), r2(g + 2.4), r2(tPos[1])], T - 520, { count: 40, speedMps: 14, hot: 0.8, scale: 1.6 }),
    fx('embers', 'foe0', 0, { radiusM: 3, rate: 40, durationS: 20, rise: 3 }),
  ];
  return { map: MAP, timeOfDay: 'morning', seed: 1909,
    // the morning sun low behind the lens's left shoulder: on the Strv's glacis and the mountain faces
    light: { sunAzimuthDeg: r2((YAW + 108) % 360), sunElevationDeg: 19 },
    actors: [hero, foe], effects, fxTime: T, timeScale: 0,
    storyboard: { version: 1, durationMs: T + 1500, shots: [], actorTracks: [track] },
    picture: { ...CLEAN, ...LIT }, fx: { quality: 'cinematic', trackDust: true }, autoPlace: false,
    lenses: [
      lensAt('a', EYE, 0.9, polar(EYE, YAW, 20), 2.2, 60),
      lensAt('b', EYE, 1.15, polar(EYE, YAW - 2, 20), 2.6, 56),
    ],
    meta: { id: ID, kind: 'versus-still', pair: 'strv122_x v t80bv', round: 6,
      idea: 'the wide-angle low hero: the Strv 122 fills the frame firing as the T-80BV burns far up the pass under the mountains' } };
};
