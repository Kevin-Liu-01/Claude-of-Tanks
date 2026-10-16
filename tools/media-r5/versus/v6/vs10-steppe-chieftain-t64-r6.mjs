// Round 6, vs10: the night kill shot. A very low lens under the Chieftain Mk 10's gun: the Chieftain fills the left of the
// frame in front three-quarter, its barrel laid across the frame onto the T-64BV and its muzzle still flashing from the
// killing round; the T-64BV brews up mid-distance at the frame's centre right (an ammunition-rack kill: the turret
// popping, a fireball and the ring's blowtorch column), the blast lighting the steppe. A white flare hangs overhead,
// embers drift off the fire, and a cook-off column burns behind. Night, exposure +0.35 so both hulls read.
import { SCENES, fx, moment, hitFx, polar, inFrame, bearingOf, wrap, r2, lensAt, ground, CLEAN, LIT, SUN_UP, DEG } from '../versus.mjs';

const ID = 'vs10-steppe-chieftain-t64-r6', MAP = 'steppe', T = 7000;
// the lens frame: the open steppe east of the round-4 eye, looking south-east over flat grass
const EYE = [185.5, -129], YAW = 120;

SCENES[ID] = () => {
  const at = (side, ahead) => inFrame(EYE, YAW, side, ahead);
  const A = at(-2.6, 10), B = at(11, 40);
  // the Chieftain: the lens 45° off its nose, on its right (its nose turned toward the frame's right), gun on the T-64BV
  const hH = (bearingOf(A, EYE) + 45 + 360) % 360;
  // the T-64BV: the lens 28° off its nose, on its left (its nose turned in toward the middle), its gun on the Chieftain
  const fH = (bearingOf(B, EYE) - 28 + 360) % 360;
  const hero = { id: 'chieftain_mk10_x', name: 'hero', pos: A.map(r2), facingDeg: r2(hH), turretDeg: r2(wrap(bearingOf(A, B) - hH)), gunDeg: 0,
    camo: 'factory', camoSeed: 7110 };
  const foe = { id: 't64bv1', name: 'foe0', pos: B.map(r2), facingDeg: r2(fH), turretDeg: r2(wrap(bearingOf(B, A) - fH)), gunDeg: 0,
    camo: 'factory', camoSeed: 7111 };
  const up = (p, h) => [r2(p[0]), r2(ground(MAP, ...p) + h), r2(p[1])];
  const effects = [
    // the killing round: the Chieftain's gun 0.06 s after the shot; the T-64BV's front plate holed, then the brew-up
    moment('hero', T, 0.06),
    ...hitFx(MAP, foe, A, T - 470, 'penetration'),
    fx('tank_kill', 'foe0', T - 450, { cause: 'ammorack', pop: true }),
    fx('debris', up(B, 2.4), T - 430, { count: 40, speedMps: 16, hot: 0.75, scale: 1.3 }),
    fx('embers', polar(B, bearingOf(EYE, B), 3).map(r2), T - 400, { radiusM: 5, rate: 70, durationS: 20, rise: 3.5 }),
    // behind: a cook-off column burning since before the shot, its fire on the ground and its embers drifting
    fx('explosion', at(54, 110).map(r2), 0, { size: 'huge' }),
    fx('fire_field', at(44, 96).map(r2), 0, { radiusM: 5, durationS: 40, intensity: 1.2, smoke: true }),
    fx('embers', at(44, 96).map(r2), 0, { radiusM: 6, rate: 60, durationS: 30, rise: 3 }),
    // overhead: a white illumination flare drifting down under its canopy
    fx('flare', at(0, 75).map(r2), 0, { heightM: 38, burnS: 40, intensity: 2.4, driftMps: 1, fallMps: 1.5, color: 'white', launch: false }),
  ];
  // the moon behind the lens's left so the Chieftain's front takes the light
  const moon = [(YAW + 140) % 360, SUN_UP.night];
  const lens = (name, side, ahead, lift, fov, dYaw = 0, pitch = 4) => {
    const eye = at(side, ahead), look = inFrame(eye, YAW + dYaw, 0, 30);
    const lookH = ground(MAP, ...eye) + lift + 30 * Math.tan(pitch * DEG) - ground(MAP, ...look);
    return lensAt(name, eye, lift, look, r2(lookH), fov);
  };
  return { map: MAP, timeOfDay: 'night', seed: 9610, light: { sunAzimuthDeg: r2(moon[0]), sunElevationDeg: moon[1] },
    actors: [hero, foe], effects, fxTime: T, timeScale: 0,
    storyboard: { version: 1, durationMs: T + 1500, shots: [], actorTracks: [] },
    picture: { ...CLEAN, ...LIT, exposure: 0.35 }, fx: { quality: 'cinematic', trackDust: true }, autoPlace: false,
    lenses: [lens('a', 0, 0, 0.9, 48, 0, 4.5), lens('b', 0.6, -1.5, 1.2, 44, 1, 4)],
    meta: { id: ID, kind: 'versus-still', pair: 'chieftain_mk10_x v t64bv1', round: 6,
      idea: 'the night kill shot: a low lens under the Chieftain\'s smoking gun, the T-64BV brewing up mid-distance under a flare' } };
};
