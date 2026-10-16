// Round 6, vs08: the high three-quarter drone view (CV90 Mk 4 v BMP-3, Winter, day).
// A drone lens 10.5 m over the open snowfield west of the village, ahead of both vehicles and looking down at them about
// 26 degrees, the forest edge across the top of the frame. The CV90 races diagonally down the frame toward the lens's
// left, a long snow-dust trail thrown up behind it to the upper right, its 35 mm autocannon firing (the frozen firing
// moment and a tracer stream on the gun line). The BMP-3 is ahead of it on its line, hit in the rear quarter and burning,
// slewing round in a skid so its nose swings toward the lens: sparks off the plate the CV90 hits, hot debris, flames
// and dark smoke off its engine deck. Both are front three-quarter to the lens and large in the frame; the sun is low
// over the drone's left shoulder, so both fronts and their lens-side flanks take the light and the shadows fall away
// on the snow.
import { SCENES, fx, moment, hitFx, plate, polar, bearingOf, inFrame, axes, wrap, r2, lensAt, CLEAN, LIT, MOVE_MS } from '../versus.mjs';

const ID = 'vs08-winter-cv90-bmp3-r6';
const MAP = 'winter';
const T = 7000;

export function build(p = {}) {
  const v = {
    // the drone's ground point, its bearing, its height and its look point (ground level, `lookAhead` m ahead)
    eye: [-192, 74], yaw: 272, lift: 10.5, fov: 34, lookAhead: 24, lookH: 0,
    cv90: [5, 16.5], bmp: [-7.5, 23],
    // the CV90: the lens `cvOff` degrees off its nose (+ on its left), its turret laid on the BMP-3; the BMP-3 skids:
    // the lens `bmpOff` off its nose, its slide along `slideDeg` (world bearing offset from its nose), at `slideMps`
    cvOff: 52, cvSpeed: 12, bmpOff: 42, bmpTurret: -12, slideDeg: -40, slideMps: 6,
    sun: [60, 28],
    ...p,
  };
  const E = v.eye;
  const cp = inFrame(E, v.yaw, ...v.cv90), bp = inFrame(E, v.yaw, ...v.bmp);
  const cHead = bearingOf(cp, E) - v.cvOff;
  const hero = { id: 'cv90_mkiv_x', name: 'hero', pos: cp.map(r2), facingDeg: r2((cHead % 360 + 360) % 360), turretDeg: r2(wrap(bearingOf(cp, bp) - cHead)),
    gunDeg: 0, camo: 'winter', camoSeed: 7811 };
  const bHead = bearingOf(bp, E) - v.bmpOff;
  const foe = { id: 'bmp3', name: 'foe0', pos: bp.map(r2), facingDeg: r2((bHead % 360 + 360) % 360), turretDeg: v.bmpTurret,
    gunDeg: 2, camo: 'winter', camoSeed: 7812 };
  // the CV90's run: MOVE_MS of travel before the still and a little past it, along its heading (its trail lies behind)
  const key = (name, k, tMs, pos, a) => ({ id: `${name}-${k}`, tMs, pos: pos.map(r2), facingDeg: a.facingDeg, turretDeg: a.turretDeg, gunDeg: a.gunDeg, transition: 'linear' });
  const { f: cf } = axes(hero.facingDeg), back = v.cvSpeed * MOVE_MS / 1000, on = v.cvSpeed * 0.6;
  // the BMP-3's skid: it slides along its old line while its nose has swung toward the lens
  const slide = polar([0, 0], foe.facingDeg + v.slideDeg, 1), sb = v.slideMps * MOVE_MS / 1000, so = v.slideMps * 0.4;
  const tracks = [
    { actor: 'hero', keys: [key('hero', 0, T - MOVE_MS, [cp[0] - cf[0] * back, cp[1] - cf[1] * back], hero), key('hero', 1, T + 600, [cp[0] + cf[0] * on, cp[1] + cf[1] * on], hero)] },
    { actor: 'foe0', keys: [key('foe0', 0, T - MOVE_MS, [bp[0] - slide[0] * sb, bp[1] - slide[1] * sb], foe), key('foe0', 1, T + 400, [bp[0] + slide[0] * so, bp[1] + slide[1] * so], foe)] },
  ];
  const hit = plate(MAP, foe, cp);
  const effects = [
    // the snow thrown up by both: the CV90's long trail (the track dust plus a burst at the still), the BMP-3's skid spray
    fx('dust', 'hero', T - 220, { count: 14, intensity: 1.1 }),
    fx('dust', 'foe0', T - 160, { count: 10, intensity: 0.9 }),
    // the BMP-3 burning since it was first hit, 2.5 s ago: flames and smoke off its engine deck (the effect sets its
    // state to burning, so the fire is young at the still rather than burning since the load)
    fx('burning', 'foe0', T - 2500),
    // the CV90's autocannon: a tracer stream on the gun line, the muzzle 0.05 s after the last round
    fx('mg_burst', 'hero', T - 3, { count: 3, gapM: 2, caliberMm: 35 }),
    moment('hero', T, 0.05),
    // the rounds on the BMP-3's quarter: a penetration's flame jet and spall, sparks, hot debris falling
    ...hitFx(MAP, foe, cp, T - 120, 'penetration'),
    fx('sparks', hit.at, T - 60, { caliberMm: 35, normal: hit.normal }),
    fx('debris', hit.at, T - 90, { count: 26, speedMps: 10, hot: 0.8, scale: 0.6 }),
  ];
  const look = polar(E, v.yaw, v.lookAhead);
  const lenses = [lensAt('a', E, v.lift, look, v.lookH, v.fov), ...(v.b ? [lensAt('b', v.b.eye, v.b.lift, polar(v.b.eye, v.b.yaw, v.b.lookAhead), 0, v.b.fov)] : [])];
  return { map: MAP, timeOfDay: 'day', seed: 1908, light: { sunAzimuthDeg: v.sun[0], sunElevationDeg: v.sun[1] },
    actors: [hero, foe], effects, fxTime: T, timeScale: 0,
    storyboard: { version: 1, durationMs: T + 1500, shots: [], actorTracks: tracks },
    picture: { ...CLEAN, ...LIT }, fx: { quality: 'cinematic', trackDust: true }, autoPlace: false,
    lenses,
    meta: { id: ID, kind: 'versus-still', pair: 'cv90_mkiv_x v bmp3', round: 6, idea: 'the high three-quarter drone view: the CV90 racing down the snow at the burning, skidding BMP-3, its autocannon firing' } };
}
SCENES[ID] = () => build();
