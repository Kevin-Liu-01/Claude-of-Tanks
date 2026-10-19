// Round 6, vs03: across the water (K2 Black Panther v ZTZ-99 Longwei, Highland Reservoir, golden hour).
// Pass 3 (the owner, 2026-10-16: fronts, bigger tanks, a more interesting camera). A lens 0.9 m over the shallows at
// the west waterline of the reservoir's south-west bay, rolled -10 deg, looks north across the bay's corner. The K2
// stands on the west bank in the right foreground, its front to the lens (26 deg off its nose) and 46 % of the frame's
// width, its turret laid left across the water at the ZTZ: a live muzzle blast 42 ms old, the barrel recoiled. The
// ZTZ-99 is on the far shore left of centre, its front to the lens too (18 deg) and 27 % of the width, firing back (its
// blast 75 ms old) as the K2's round, struck 0.3 s ago, throws sparks and spall off its quarter. A doubled cook-off
// column rises off the promontory past it. The golden-hour sun stands low behind the lens's left shoulder, so both
// fronts take the warm key; a warm grade carries the water, which fills the lower left (the card's lockup corner).
import { SCENES, fx, hitFx, plate, polar, bearingOf, inFrame, wrap, r2, lensAt, ground, CLEAN, LIT } from '../versus.mjs';

const ID = 'vs03-reservoir-k2-ztz99-r6';
const MAP = 'reservoir';
const T = 7000;

/** The scene from its lens frame: the lens at `eye` facing `yaw`; the K2 and the ZTZ placed [side, ahead] of it. */
export function build(p = {}) {
  const v = {
    // pass 3 (the owner 2026-10-16: "i want to see tank fronts more ... tanks should be more % of frame ... and more
    // interesting camera rotation and angles"; golden hour across the water): the lens 0.9 m over the shallows at the
    // bay's west waterline, a long 30 deg lens rolled -10 deg; the K2 26 deg off its nose and 46 % of the width, the
    // ZTZ-99 18 deg off its nose and 27 %; the sun low behind the lens's left shoulder, so both fronts take the key
    eye: [75.5, -62], yaw: 334.5, lift: 0.9, fov: 30, lookAhead: 30, lookH: 2.2, dYaw: 0, roll: -10,
    k2At: [62, -46], k2Off: 26, ztzAt: [71, -29], ztzOff: -18,
    time: 'golden', sun: [140, 9],
    // the cook-off column on the promontory 100 m off, past the ZTZ's left
    column: [-45, 100],
    // lens b: the same spot 1.8 m up, the roll the other way
    b: { eye: [75.5, -62], lift: 1.8, yaw: 334.5, lookH: 2.0, fov: 30, roll: 7 },
    ...p,
  };
  const E = v.eye;
  const kp = v.k2At ?? inFrame(E, v.yaw, ...v.k2), zp = v.ztzAt ?? inFrame(E, v.yaw, ...v.ztz);
  // the K2: the lens `k2Off` degrees off its nose on its left, its turret laid on the ZTZ
  const kHead = bearingOf(kp, E) - v.k2Off;
  const hero = { id: 'k2_x', name: 'hero', pos: kp.map(r2), facingDeg: r2((kHead % 360 + 360) % 360), turretDeg: r2(wrap(bearingOf(kp, zp) - kHead)),
    gunDeg: 1, camo: 'factory', camoSeed: 7311, recoilAgeS: 0.04 };
  // the ZTZ-99: the lens `ztzOff` degrees off its nose (+ on its left), its front turned to the sun's side, its turret
  // laid on the K2 (square across its hull, so its gun and flash stand clear of its front)
  const zHead = bearingOf(zp, E) - v.ztzOff;
  const foe = { id: 'type99a', name: 'foe0', pos: zp.map(r2), facingDeg: r2((zHead % 360 + 360) % 360), turretDeg: r2(wrap(bearingOf(zp, kp) - zHead)),
    gunDeg: 1, camo: 'factory', camoSeed: 7312, recoilAgeS: 0.04 };
  const at3 = (q, up = 0) => [r2(q[0]), r2(ground(MAP, ...q) + up), r2(q[1])];
  const col = inFrame(E, v.yaw, ...v.column);
  const hit = plate(MAP, foe, kp);
  const effects = [
    // the cook-off column on the promontory behind the ZTZ (fired at 0 so its smoke has climbed by the still), the
    // burning ground and embers at its foot
    fx('explosion', col.map(r2), 0, { size: 'huge' }),
    // (FX recipes) a second cook-off 1 s later at the same point, so its cards fill the gaps in the column's top
    fx('explosion', [r2(col[0] + 0.6), r2(col[1] + 0.6)], 1000, { size: 'huge' }),
    fx('fire_field', col.map(r2), 0, { radiusM: 5, durationS: 40, intensity: 1.1, smoke: true }),
    fx('embers', col.map(r2), 0, { radiusM: 5, rate: 60, durationS: 20, rise: 3.2 }),
    // a cook-off pop in the column 0.7 s ago: its hot fragments are raining on the far shore
    fx('debris', at3(col, 3), T - 700, { count: 40, speedMps: 16, hot: 0.6, scale: 1.3 }),
    // the K2's main gun (FX recipes): a live muzzle blast 42 ms old in every sample of the film's 12 ms exposure, its
    // bore laid 65 deg across the view, the barrel recoiled (firing_moment's white bolt read as a beam; the coax is gone
    // for the same reason)
    fx('muzzle_flash', 'hero', T - 42, { caliberMm: 160 }),
    // the K2's round on the ZTZ's plate that faces it (its left quarter): sparks, the pop, hot spall, debris raining
    // (QA: the fresh pop swallowed the ZTZ's front, so the strike is 0.3 s old: the sparks have flown, the plate reads)
    ...hitFx(MAP, foe, kp, T - 300, 'ricochet'),
    fx('debris', hit.at, T - 280, { count: 22, speedMps: 11, hot: 0.85, scale: 0.6 }),
    // the ZTZ fires back across the bay: its muzzle blast 75 ms old, past its white-hot peak so the glare no longer hides
    // its gun and turret, the barrel recoiled
    fx('muzzle_flash', 'foe0', T - 75, { caliberMm: 120 }),
  ];
  const look = polar(E, v.yaw + v.dYaw, v.lookAhead);
  // (owner 2026-10-16: "more interesting camera rotation and angles") a Dutch roll about the view axis
  const lenses = [{ ...lensAt('a', E, v.lift, look, v.lookH, v.fov), rollDeg: v.roll }, ...(v.b ? [{ ...lensAt('b', v.b.eye, v.b.lift, polar(v.b.eye, v.b.yaw, v.lookAhead), v.b.lookH, v.b.fov), rollDeg: v.b.roll ?? v.roll }] : [])];
  return { map: MAP, timeOfDay: v.time, seed: 1903, light: { sunAzimuthDeg: v.sun[0], sunElevationDeg: v.sun[1] },
    actors: [hero, foe], effects, fxTime: T, timeScale: 0,
    storyboard: { version: 1, durationMs: T + 1500, shots: [], actorTracks: [] },
    // (QA: the first film read as afternoon) a sunset grade: warm white balance, amber highlights over cooler shadows,
    // richer warms and a quieter blue sky and water
    picture: { ...CLEAN, ...LIT, temperature: 18, tint: 4, split: { shadowHue: 215, shadowAmount: 0.22, highlightHue: 30, highlightAmount: 0.4, balance: -0.05 },
      warms: { saturation: 1.15 }, blues: { hue: 6, saturation: 0.85 } }, fx: { quality: 'cinematic', trackDust: true }, autoPlace: false,
    lenses,
    meta: { id: ID, kind: 'versus-still', pair: 'k2_x v type99a', round: 6, idea: 'the sunset over the water: a low lens at the bay\'s edge, the K2 on the near bank firing across the water at the ZTZ-99 on the far shore' } };
}
SCENES[ID] = () => build();
