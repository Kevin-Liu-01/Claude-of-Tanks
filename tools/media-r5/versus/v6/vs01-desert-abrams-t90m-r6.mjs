// Round 6, vs01: the head-on charge. The M1A2 SEPv3 charges almost straight at a low lens on the flat of the western wadi,
// a rooster tail of sand rising behind it, its gun laid past the lens's right shoulder and firing; the T-90M stands far
// back on the right on the berm's crest, 8 m above the flat, front three-quarter toward the SEPv3, sparks and hot spall
// off its front plate. Burning columns stand behind and between them and debris falls; the golden-hour sun sits low
// behind the lens's left, so it lights both hulls' fronts and rakes across the dust.
import { SCENES, fx, moment, hitFx, inFrame, bearingOf, axes, wrap, r2, lensAt, ground, MOVE_MS, CLEAN, LIT, SUN_UP, DEG } from '../versus.mjs';

const ID = 'vs01-desert-abrams-t90m-r6', MAP = 'desert', T = 7000;
// the lens frame: on the wadi flat west of the town, looking east up the long rise toward the town
const EYE = [-298, 102], YAW = 90, SPEED = 10;

SCENES[ID] = () => {
  const at = (side, ahead) => inFrame(EYE, YAW, side, ahead);
  const A = at(-2.0, 12), B = at(25, 58);
  // the lens 15° off the SEPv3's nose, on its right (its nose turned toward the frame's right)
  const hH = (bearingOf(A, EYE) + 15 + 360) % 360;
  // the T-90M: the lens 30° off its nose, on its left (its nose turned in toward the frame's middle), gun on the SEPv3
  const fH = (bearingOf(B, EYE) - 30 + 360) % 360;
  const hero = { id: 'm1a2_sepv3_x', name: 'hero', pos: A.map(r2), facingDeg: r2(hH), turretDeg: 5, gunDeg: -1.5,
    camo: 'service_usa_desert', camoSeed: 7101 };
  const foe = { id: 't90m_x', name: 'foe0', pos: B.map(r2), facingDeg: r2(fH), turretDeg: r2(wrap(bearingOf(B, A) - fH)), gunDeg: -1,
    camo: 'service_t90m', camoSeed: 7102 };
  // the charge: 10 m/s over the MOVE_MS before the still and 0.4 s past it (the Studio lays its track dust along it)
  const { f } = axes(hH), back = SPEED * MOVE_MS / 1000, on = SPEED * 0.4;
  const key = (k, tMs, p) => ({ id: `hero-${k}`, tMs, pos: p.map(r2), facingDeg: hero.facingDeg, turretDeg: hero.turretDeg, gunDeg: hero.gunDeg, transition: 'linear' });
  const track = { actor: 'hero', keys: [key(0, T - MOVE_MS, [A[0] - f[0] * back, A[1] - f[1] * back]), key(1, T + 400, [A[0] + f[0] * on, A[1] + f[1] * on])] };
  const tail = (hH + 180) % 360;
  const up = (p, h) => [r2(p[0]), r2(ground(MAP, ...p) + h), r2(p[1])];
  const effects = [
    // the rooster tail: sand thrown back off the tracks at each stretch of the run, oldest (highest, widest) first
    ...[[1900, 10, 1.1], [1450, 12, 1.2], [1050, 13, 1.3], [700, 14, 1.3], [420, 13, 1.2]]
      .map(([ago, count, intensity]) => fx('dust', 'hero', T - ago, { count, intensity, dirDeg: r2(tail) })),
    // the shot: the SEPv3's gun 0.05 s after firing; the T-90M's front plate takes the round 30 ms later
    moment('hero', T, 0.05),
    ...hitFx(MAP, foe, A, T - 30, 'ricochet'),
    fx('debris', up(B, 1.6), T - 20, { count: 22, speedMps: 11, hot: 0.85, scale: 0.6 }),
    // falling debris: an HE round just over the crest, between them, 0.75 s before the still
    fx('explosion', at(17, 78).map(r2), T - 760, { size: 'small', munition: 'he', cause: 'shot' }),
    fx('debris', up(at(17, 78), 1.4), T - 735, { count: 44, speedMps: 15, hot: 0.45, scale: 1.35 }),
    // burning columns behind: one between them, one beyond the T-90M's crest, one far left behind the dust
    fx('explosion', at(44, 165).map(r2), 0, { size: 'huge' }),
    fx('explosion', at(88, 215).map(r2), 1200, { size: 'huge' }),
    fx('explosion', at(-62, 150).map(r2), 600, { size: 'huge' }),
    fx('embers', at(22, 70).map(r2), 0, { radiusM: 4, rate: 50, durationS: 20, rise: 3 }),
  ];
  const sun = [(YAW + 130) % 360, SUN_UP.golden];
  // a level-to-rising lens: lift 1.1 m, pitched up 3° over a look point 30 m out
  const lens = (name, side, ahead, lift, fov, dYaw = 0, pitch = 3) => {
    const eye = at(side, ahead), look = inFrame(eye, YAW + dYaw, 0, 30);
    const lookH = ground(MAP, ...eye) + lift + 30 * Math.tan(pitch * DEG) - ground(MAP, ...look);
    return lensAt(name, eye, lift, look, r2(lookH), fov);
  };
  return { map: MAP, timeOfDay: 'golden', seed: 9601, light: { sunAzimuthDeg: r2(sun[0]), sunElevationDeg: sun[1] },
    actors: [hero, foe], effects, fxTime: T, timeScale: 0,
    storyboard: { version: 1, durationMs: T + 1500, shots: [], actorTracks: [track] },
    picture: { ...CLEAN, ...LIT }, fx: { quality: 'cinematic', trackDust: true }, autoPlace: false,
    lenses: [lens('a', 0, 0, 1.1, 38), lens('b', 0.8, -1.5, 0.9, 42, 1, 4)],
    meta: { id: ID, kind: 'versus-still', pair: 'm1a2_sepv3_x v t90m_x', round: 6,
      idea: 'the head-on charge: the SEPv3 at a low lens, sand rooster tail, gun past the lens firing; the T-90M hit on the crest far right' } };
};
