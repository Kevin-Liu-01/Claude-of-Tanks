// Round 6, vs04: the night tracer duel down the rails (Cinder Junction), staged again for the owner's 2026-10-16 direction
// ("i think i want to see tank fronts more in the other versus, and tanks should be more % of frame" ... "and more
// interesting camera rotation and angles"). The lens stands 5 m up over the six-foot at the yard's west throat, tilted
// 13 degrees (a Dutch angle), and looks east down the rails to their vanishing point, where the tank wagons burn. Both
// hulls face it: the Leclerc fills the left foreground (20 degrees off its nose), rolling down the corridor at 11 m/s
// with its track dust and its turret swung right onto the T-14, the gun laid across the frame and firing (the bore 80-90
// degrees off the view, so the blast reads as a big orange fireball). The T-14 stands across the corridor in front of
// the G 10 vans (25 degrees off its nose), its turret on the Leclerc (its gun's front toward the lens), the Leclerc's
// round glancing off its left cheek in a spray of sparks thrown into the gap.
// Two illumination flares hang in the strip of night sky; a low moon behind the lens keys the hull fronts.
import { SCENES, fx, plate, inFrame, bearingOf, wrap, r2, lensAt, ground, polar, CLEAN, LIT, dimsOf, axes } from '../versus.mjs';

const ID = 'vs04-railyard-leclerc-t14-r6';
const MAP = 'railyard';
// the main line's chord (railyard.ts lineZ: z = 0.066 x); its bearing, east along the yard
const lineZ = (x) => x * 0.066;
const YAW = Math.atan2(1, 0.066) * 180 / Math.PI;

SCENES[ID] = () => {
  const T = 7000;
  const eye = [-192, lineZ(-192) - 0.4];
  const at = (side, ahead) => inFrame(eye, YAW, side, ahead);
  // a hull's heading from the lens: the lens `off` degrees off its nose (+ on its left)
  const facing = (pos, off) => ((bearingOf(pos, eye) - off) % 360 + 360) % 360;
  const L = at(-5.5, 13), F = at(12, 22);
  const hero = { id: 'leclerc_xlr', name: 'hero', pos: L.map(r2), facingDeg: r2(facing(L, 20)), turretDeg: 0, gunDeg: 1, camo: 'factory', camoSeed: 7104 };
  hero.turretDeg = r2(wrap(bearingOf(L, F) - hero.facingDeg));
  const foe = { id: 't14_x', name: 'foe0', pos: F.map(r2), facingDeg: r2(facing(F, 25)), turretDeg: 0, gunDeg: 1, camo: 'factory', camoSeed: 7204 };
  foe.turretDeg = r2(wrap(bearingOf(F, L) - foe.facingDeg));

  // the Leclerc's shot (FX-RECIPES 3): a recoiled barrel from the actor field, the live flash in the effects below
  hero.recoilAgeS = 0.04;

  // the Leclerc rolls at 11 m/s, the T-14 holds. FX-RECIPES 1: the track runs 2.6 s before the still and 0.4 s past it,
  // and dust bursts lie at both rear track ends where the hull was 90-1500 ms before the still, laid along its heading
  const SPEED = 11, H = hero.facingDeg, { f, r } = axes(H), d = dimsOf(hero.id);
  const hullAt = (ago) => [L[0] - f[0] * SPEED * ago / 1000, L[1] - f[1] * SPEED * ago / 1000];
  const key = (k, tMs, p) => ({ id: `hero-${k}`, tMs, pos: p.map(r2), facingDeg: H, turretDeg: hero.turretDeg, gunDeg: hero.gunDeg, transition: 'linear' });
  const tracks = [{ actor: 'hero', keys: [key(0, T - 2600, hullAt(2600)), key(1, T + 400, hullAt(-400))] }];
  const tail = [];
  for (const [ago, count] of [[1500, 27], [1100, 27], [750, 27], [450, 24], [220, 21], [90, 15]]) {
    const p = hullAt(ago);
    for (const s of [-1, 1]) {
      const q = [p[0] - f[0] * d[0] * 0.9 + r[0] * s * d[1] * 0.8, p[1] - f[1] * d[0] * 0.9 + r[1] * s * d[1] * 0.8];
      tail.push(fx('dust', q.map(r2), T - ago, { count, intensity: 1.3, dirDeg: r2(H) }));
    }
  }

  // the burning tank wagons at the rails' vanishing point (the north +9 siding, x -121.5..-104.6), their cook-off's
  // fragments falling
  const wagons = [-113, lineZ(-113) + 9], gw = ground(MAP, ...wagons);
  const flareA = at(-14, 150), flareB = at(34, 205);
  // the Leclerc's round glances off the T-14's left cheek, its spark fans thrown toward the Leclerc into the gap. (GO
  // render QA, 2026-10-16: an 85 ms ricochet thrown along the plate's own normal stood as a spike-star over the T-14's
  // face) the strike is 0.3 s old, as vs03's is: the pop has died and the sparks have flown. Their spray is laid
  // explicitly: level toward the Leclerc with a small upward part, as vs05's fan is
  const hit = plate(MAP, foe, hero.pos), toL = [hero.pos[0] - hit.at[0], hero.pos[1] - hit.at[2]], nL = Math.hypot(...toL);
  const spray = [r2(toL[0] / nL * 0.92), 0.3, r2(toL[1] / nL * 0.92)];
  const effects = [
    // FX-RECIPES 3: a live muzzle flash 42 ms before the still (no firing_moment: its white bolt reads as a beam), the
    // bore 80-90 degrees across the view ray
    fx('muzzle_flash', 'hero', T - 42, { caliberMm: 140 }),
    ...tail,
    fx('impact', hit.at, T - 300, { kind: 'ricochet', caliberMm: 120, normal: spray }),
    fx('sparks', hit.at, T - 275, { caliberMm: 120, normal: spray }),
    fx('debris', hit.at, T - 290, { count: 10, speedMps: 8, hot: 0.9, scale: 0.4 }),
    // (no coax this round) the two hulls stand 20 m apart, their muzzles 8 m apart on one line, and the Leclerc's fireball
    // fills the first 4.6 m of it: any coax round would fly into the fireball, or land as an orb over the Leclerc (film 1
    // QA). Holding 24 m between the hulls would cost the owner's sizes, so the coax is dropped (the QA lessons allow
    // dropping it) and the T-14's spark fan flies into the gap instead
    fx('fire_field', wagons.map(r2), 0, { radiusM: 5, durationS: 40, intensity: 1.2, smoke: true }),
    fx('embers', wagons.map(r2), 0, { radiusM: 5, rate: 70, durationS: 20, rise: 3.5 }),
    fx('debris', [r2(wagons[0]), r2(gw + 3.6), r2(wagons[1])], T - 1400, { count: 34, speedMps: 16, hot: 0.9, scale: 1.2 }),
    // (GO render QA) at 2.4 and 1.2 the two flares read as full moons (a 44 px flat white core): 0.7 and 0.4
    fx('flare', flareA.map(r2), 0, { heightM: 36, burnS: 40, intensity: 0.7, driftMps: 1, fallMps: 1.4, color: 'white', launch: false }),
    fx('flare', flareB.map(r2), 1500, { heightM: 44, burnS: 40, intensity: 0.4, driftMps: 1, fallMps: 1.6, color: 'white', launch: false }),
  ];
  // the lens: straight down the rails, laid on the pair's depth, 5 m up and rolled 13 degrees
  const look = polar(eye, YAW, 17.5);
  return { map: MAP, timeOfDay: 'night', seed: 1904, light: { sunAzimuthDeg: r2((YAW + 200) % 360), sunElevationDeg: 15 },
    actors: [hero, foe], effects, fxTime: T, timeScale: 0,
    storyboard: { version: 1, durationMs: T + 1500, shots: [], actorTracks: tracks },
    // (film 1 QA) a display gamma of 1.12 lifts the near-black flanks and running gear by about +0.5 EV
    picture: { ...CLEAN, ...LIT, exposure: 0.35, gamma: 1.12 }, fx: { quality: 'cinematic', trackDust: true }, autoPlace: false,
    lenses: [{ ...lensAt('a', eye, 5, look, 0.96, 48), rollDeg: 13 }],
    // (film 1 QA) a 4 ms still exposure (versus.mjs jobs reads it): every tracer smear cut to a third
    meta: { id: ID, kind: 'versus-still', pair: 'leclerc_xlr v t14_x', round: 6, idea: 'the night tracer duel down the rails', stillExposureMs: 4 } };
};
