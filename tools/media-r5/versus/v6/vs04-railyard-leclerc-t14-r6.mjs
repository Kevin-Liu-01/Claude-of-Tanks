// Round 6, vs04: the night tracer duel down the rails (Cinder Junction). The lens stands low in the six-foot between
// the two main-line tracks at the yard's west throat and looks east along them: the rails run away to their vanishing
// point between the cuts of standing stock (the G 10 vans at the right edge, the tank wagons and the coal wagons
// deeper in). The Leclerc rolls across the corridor in the left foreground, its hull's front three-quarter to the
// lens, the turret swung over its left side and the gun laid down the line: it has just fired. The T-14 stands deep in
// the yard between the sidings, front three-quarter, its coax stream coming back up the line and whipping over the
// Leclerc's roof, the Leclerc's round striking sparks off its front; behind it the tank wagons burn and throw burning
// fragments. Two illumination flares hang over the yard (the brighter, nearer one is the scene's flare light); a low
// moon behind the lens keys the hull fronts.
import { SCENES, fx, moment, hitFx, inFrame, bearingOf, wrap, r2, lensAt, ground, CLEAN, LIT, MOVE_MS, axes } from '../versus.mjs';

const ID = 'vs04-railyard-leclerc-t14-r6';
const MAP = 'railyard';
// the main line's chord (railyard.ts lineZ: z = 0.066 x); its bearing, east along the yard
const lineZ = (x) => x * 0.066;
const YAW = Math.atan2(1, 0.066) * 180 / Math.PI;

SCENES[ID] = () => {
  const T = 7000;
  const eye = [-192, lineZ(-192) - 0.4];
  // the lens looks 6 degrees left of the rails, so their vanishing point falls on the T-14, not behind the Leclerc's nose
  const at = (side, ahead) => inFrame(eye, YAW + 6, side, ahead);
  // a hull's heading from the lens: the lens `off` degrees off its nose (+ on its left)
  const facing = (pos, off) => ((bearingOf(pos, eye) - off) % 360 + 360) % 360;
  const L = at(-3.2, 15), F = at(10.5, 51);
  const hero = { id: 'leclerc_xlr', name: 'hero', pos: L.map(r2), facingDeg: r2(facing(L, -55)), turretDeg: 0, gunDeg: 1, camo: 'factory', camoSeed: 7104 };
  hero.turretDeg = r2(wrap(bearingOf(L, F) - hero.facingDeg));
  // the T-14's gun 2 degrees up: its coax stream passes just over the Leclerc's turret roof
  const foe = { id: 't14_x', name: 'foe0', pos: F.map(r2), facingDeg: r2(facing(F, 30)), turretDeg: 0, gunDeg: 2, camo: 'factory', camoSeed: 7204 };
  foe.turretDeg = r2(wrap(bearingOf(F, L) - foe.facingDeg));

  // the Leclerc rolls across the corridor at 4 m/s (its track dust), the T-14 holds
  const { f } = axes(hero.facingDeg), back = 4 * MOVE_MS / 1000, on = 4 * 0.6;
  const key = (k, tMs, p) => ({ id: `hero-${k}`, tMs, pos: p.map(r2), facingDeg: hero.facingDeg, turretDeg: hero.turretDeg, gunDeg: hero.gunDeg, transition: 'linear' });
  const tracks = [{ actor: 'hero', keys: [key(0, T - MOVE_MS, [L[0] - f[0] * back, L[1] - f[1] * back]), key(1, T + 600, [L[0] + f[0] * on, L[1] + f[1] * on])] }];

  // the burning tank wagons behind the T-14 (the north +9 siding, x -121.5..-104.6), their cook-off's fragments falling
  const wagons = [-113, lineZ(-113) + 9], gw = ground(MAP, ...wagons);
  const flareA = at(-6, 100), flareB = at(45, 180);
  const effects = [
    moment('hero', T, 0.05),
    fx('dust', 'hero', T - 220, { count: 12, intensity: 1 }),
    ...hitFx(MAP, foe, hero.pos, T - 90, 'ricochet'),
    // the coax stream, 8 ms old: four tracers from the muzzle to the Leclerc's roof
    fx('mg_burst', 'foe0', T - 8, { count: 4, gapM: 8.5 }),
    fx('fire_field', wagons.map(r2), 0, { radiusM: 6, durationS: 40, intensity: 1.4, smoke: true }),
    fx('embers', wagons.map(r2), 0, { radiusM: 5, rate: 70, durationS: 20, rise: 3.5 }),
    fx('debris', [r2(wagons[0]), r2(gw + 3.6), r2(wagons[1])], T - 1400, { count: 34, speedMps: 16, hot: 0.9, scale: 1.2 }),
    fx('flare', flareA.map(r2), 0, { heightM: 40, burnS: 40, intensity: 2.4, driftMps: 1, fallMps: 1.4, color: 'white', launch: false }),
    fx('flare', flareB.map(r2), 1500, { heightM: 50, burnS: 40, intensity: 1.2, driftMps: 1, fallMps: 1.6, color: 'white', launch: false }),
  ];
  const look = at(1, 80);
  return { map: MAP, timeOfDay: 'night', seed: 1904, light: { sunAzimuthDeg: r2((YAW + 200) % 360), sunElevationDeg: 15 },
    actors: [hero, foe], effects, fxTime: T, timeScale: 0,
    storyboard: { version: 1, durationMs: T + 1500, shots: [], actorTracks: tracks },
    picture: { ...CLEAN, ...LIT, exposure: 0.35 }, fx: { quality: 'cinematic', trackDust: true }, autoPlace: false,
    lenses: [lensAt('a', eye, 1.3, look, 3.6, 36)],
    meta: { id: ID, kind: 'versus-still', pair: 'leclerc_xlr v t14_x', round: 6, idea: 'the night tracer duel down the rails' } };
};
