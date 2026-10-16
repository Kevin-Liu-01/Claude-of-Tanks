// Round 6, vs03: the sunset over the water (K2 Black Panther v ZTZ-99 Longwei, Highland Reservoir, sunset).
// A low lens at the edge of the reservoir's south-west bay, looking north across the water to the dry promontory. The
// K2 stands on the bay's west bank in the right foreground, front three-quarter to the lens, its nose at the waterline
// and its turret laid left across the bay; it has just fired, and its coax's tracers stream over the water. The ZTZ-99
// is on the far shore left of centre, front three-quarter toward the K2, firing back as the K2's round strikes its
// glacis (sparks, white-hot spall, falling debris). A cook-off column rises off the promontory behind the ZTZ, with burning
// ground and embers at its foot. The sunset sun sits low behind the lens's left shoulder, so both hulls' fronts and the
// lens-side flanks take the warm key, and the bay's open water fills the lower left of the frame (the social card's
// lockup corner) under the sunset sky.
import { SCENES, fx, moment, hitFx, plate, polar, bearingOf, inFrame, wrap, r2, lensAt, ground, CLEAN, LIT } from '../versus.mjs';

const ID = 'vs03-reservoir-k2-ztz99-r6';
const MAP = 'reservoir';
const T = 7000;

/** The scene from its lens frame: the lens at `eye` facing `yaw`; the K2 and the ZTZ placed [side, ahead] of it. */
export function build(p = {}) {
  const v = {
    // the lens at the bay's west waterline, 1.15 m up, looking north across the bay (chosen by a CPU search of the
    // basin's shores: the K2's pad dry and clear on the bank, the ZTZ's dry on the promontory, both sightlines open)
    eye: [80, -78], yaw: 344, lift: 1.15, fov: 38, lookAhead: 30, lookH: 2.0, dYaw: 0,
    k2At: [68.1, -60.4], k2Off: 55, ztzAt: [82, -27.6], ztzOff: 30,
    sun: [125, 5],
    column: [-42, 95],
    // lens b: a step nearer the waterline, 0.3 m lower and a touch tighter
    b: { eye: [79.4, -78.8], lift: 0.85, yaw: 344.5, lookH: 1.9, fov: 36 },
    ...p,
  };
  const E = v.eye;
  const kp = v.k2At ?? inFrame(E, v.yaw, ...v.k2), zp = v.ztzAt ?? inFrame(E, v.yaw, ...v.ztz);
  // the K2: the lens `k2Off` degrees off its nose on its left, its turret laid on the ZTZ
  const kHead = bearingOf(kp, E) - v.k2Off;
  const hero = { id: 'k2_x', name: 'hero', pos: kp.map(r2), facingDeg: r2((kHead % 360 + 360) % 360), turretDeg: r2(wrap(bearingOf(kp, zp) - kHead)),
    gunDeg: 1, camo: 'factory', camoSeed: 7311 };
  // the ZTZ-99: the lens 30 degrees off its nose (on its left: + on its left), its front turned to the sun's side, its
  // turret laid on the K2
  const zHead = bearingOf(zp, E) - v.ztzOff;
  const foe = { id: 'type99a', name: 'foe0', pos: zp.map(r2), facingDeg: r2((zHead % 360 + 360) % 360), turretDeg: r2(wrap(bearingOf(zp, kp) - zHead)),
    gunDeg: 1, camo: 'factory', camoSeed: 7312 };
  const at3 = (q, up = 0) => [r2(q[0]), r2(ground(MAP, ...q) + up), r2(q[1])];
  const col = inFrame(E, v.yaw, ...v.column);
  const hit = plate(MAP, foe, kp);
  const effects = [
    // the cook-off column on the promontory behind the ZTZ (fired at 0 so its smoke has climbed by the still), the
    // burning ground and embers at its foot
    fx('explosion', col.map(r2), 0, { size: 'huge' }),
    fx('fire_field', col.map(r2), 0, { radiusM: 5, durationS: 40, intensity: 1.1, smoke: true }),
    fx('embers', col.map(r2), 0, { radiusM: 5, rate: 60, durationS: 20, rise: 3.2 }),
    // a cook-off pop in the column 0.7 s ago: its hot fragments are raining on the far shore
    fx('debris', at3(col, 3), T - 700, { count: 40, speedMps: 16, hot: 0.6, scale: 1.3 }),
    // the K2's coax across the water, then its main gun 0.05 s before the still
    fx('mg_burst', 'hero', T - 12, { count: 4, gapM: 5 }),
    moment('hero', T, 0.05),
    // the K2's round on the ZTZ's glacis: sparks, the white-hot pop, hot spall, and more debris raining off the plate
    ...hitFx(MAP, foe, kp, T - 130, 'ricochet'),
    fx('debris', hit.at, T - 110, { count: 22, speedMps: 11, hot: 0.85, scale: 0.6 }),
    // the ZTZ fires back across the bay
    moment('foe0', T, 0.045),
  ];
  const look = polar(E, v.yaw + v.dYaw, v.lookAhead);
  const lenses = [lensAt('a', E, v.lift, look, v.lookH, v.fov), ...(v.b ? [lensAt('b', v.b.eye, v.b.lift, polar(v.b.eye, v.b.yaw, v.lookAhead), v.b.lookH, v.b.fov)] : [])];
  return { map: MAP, timeOfDay: 'sunset', seed: 1903, light: { sunAzimuthDeg: v.sun[0], sunElevationDeg: v.sun[1] },
    actors: [hero, foe], effects, fxTime: T, timeScale: 0,
    storyboard: { version: 1, durationMs: T + 1500, shots: [], actorTracks: [] },
    picture: { ...CLEAN, ...LIT, temperature: 6 }, fx: { quality: 'cinematic', trackDust: true }, autoPlace: false,
    lenses,
    meta: { id: ID, kind: 'versus-still', pair: 'k2_x v type99a', round: 6, idea: 'the sunset over the water: a low lens at the bay\'s edge, the K2 on the near bank firing across the water at the ZTZ-99 on the far shore' } };
}
SCENES[ID] = () => build();
