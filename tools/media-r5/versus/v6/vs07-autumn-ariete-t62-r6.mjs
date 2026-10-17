// Round 6, vs07: the telephoto compression (autumn, golden hour), staged again for the owner's 2026-10-16 direction
// ("i think i want to see tank fronts more in the other versus, and tanks should be more % of frame" ... "and more
// interesting camera rotation and angles"). An 11-degree lens 12 m up, 38 m from the T-62 and rolled -8 degrees, looks up
// a farm road: the T-62 comes down it toward the lens, its turret forward, and 12 m behind it on the road the Ariete
// has its gun laid down on the T-62's back. Both fronts face the lens, and the long lens stacks them, the Ariete as big as
// the T-62 although 12 m further, with the autumn trees close behind them: that is the compression. The Ariete has
// fired (its blast 0.6 s old: a thin propellant ring and gas cone, no live flash); the T-62 takes the hit on its far side
// (the spark fan thrown away from the lens) with stowage debris coming down round it. A patch of field burns
// on the slope behind them at the right; the low sun rakes in from 100 degrees right, lighting both hull fronts; the grade is warmed.
// Searched on the 226 CPU dumps: both hulls on the road (no grass at their tracks), every record sightline
// (0.5/1.3/2.0 m) clear, no bush (ray-tested as ellipsoids) hiding a hull, no near foliage above the frame's bottom
// eighth, no meule in frame.
import { SCENES, fx, plate, axes, inFrame, bearingOf, wrap, r2, lensAt, ground, polar, CLEAN, LIT } from '../versus.mjs';

const ID = 'vs07-autumn-ariete-t62-r6';
const MAP = 'autumn';

SCENES[ID] = () => {
  const T = 7000;
  const T62 = [-280, -320], eye = [-312.91, -339], YAW = 60;
  // a hull's heading from the lens: the lens `off` degrees off its nose (+ on its left)
  const facing = (pos, off) => ((bearingOf(pos, eye) - off) % 360 + 360) % 360;
  // (GO render QA, 2026-10-16) the Ariete 1.5 m to its own right (image-left) of its road spot, so its turret face and gun
  // clear the T-62's turret; its centre now 2.1 m off the road's centreline, its outer track inside the road's feathered
  // 3.85 m edge
  const ARI0 = [-268.11, -316.6], ARI = ((r) => [r2(ARI0[0] + r[0] * 1.5), r2(ARI0[1] + r[1] * 1.5)])(axes(facing(ARI0, -25)).r);
  const hero = { id: 'ariete_c2_x', name: 'hero', pos: ARI, facingDeg: r2(facing(ARI, -25)), turretDeg: 0, gunDeg: -3, camo: 'factory', camoSeed: 7107 };
  hero.turretDeg = r2(wrap(bearingOf(ARI, T62) - hero.facingDeg));
  hero.recoilAgeS = 0.04;   // the recoiled barrel (muzzle_flash does no recoil)
  // the T-62's turret forward: caught on the road, its front to the lens
  const foe = { id: 't62mv1_x', name: 'foe0', pos: T62, facingDeg: r2(facing(T62, -15)), turretDeg: 0, gunDeg: 1, camo: 'factory', camoSeed: 7207 };
  const back = (d, side = 0) => { const p = polar(ARI, YAW, d); return polar(p, YAW - 90, side).map(r2); };
  const gT = ground(MAP, ...T62);
  // the hit on the T-62's far side (its back, facing the Ariete), low (0.45 of its height). (GO render QA: from 12 m up,
  // a spark fan thrown away from the lens rose straight up the frame across the Ariete's front) no spark shower now: a
  // short, low spall of hot fragments at 4.5 m/s, 0.3 s old, and a few slow embers, all close round the plate
  const hit = plate(MAP, foe, ARI, 0.45);
  const effects = [
    // the Ariete's shot: only an earlier blast, 0.7 s old (FX-RECIPES 3, a standing gun), at the 45 mm scale, its ring
    // and gas cone a thin wisp at the muzzle (GO render QA: the 80 mm cone's puffs sat over its glacis; no live flash)
    fx('muzzle_flash', 'hero', T - 700, { caliberMm: 45 }),
    fx('debris', hit.at, T - 300, { count: 12, speedMps: 4.5, hot: 0.9, scale: 0.35 }),
    fx('embers', hit.at, T - 600, { radiusM: 0.6, rate: 18, durationS: 1.2, rise: 1 }),
    // (no stowage debris this round: its 22 pieces kicked soil where they landed, big gold puffs either side of the T-62)
    // (no engine smoke this round: the T-62's deck faces the Ariete, so its smoke would rise across the Ariete's front)
    // a patch of field burning on the slope behind the pair, in the free upper right of the frame: its smoke rises out
    // of the frame's top (no column top in shot) and the battle wind (bearing 71, 11 degrees left of the view) carries it
    // away, clear of the Ariete (no HE dust this round: behind the Ariete it would haze its turret)
    fx('fire_field', inFrame(eye, YAW, 5, 53).map(r2), 0, { radiusM: 4, durationS: 40, intensity: 0.9, smoke: true }),
  ];
  // (GO render QA, optional, taken) fov 10.4 for bigger hulls, the view turned and laid so the pair stays centred
  const mid = [(T62[0] + ARI[0]) / 2, (T62[1] + ARI[1]) / 2], look = polar(eye, YAW + 2.5, Math.hypot(mid[0] - eye[0], mid[1] - eye[1]));
  return { map: MAP, timeOfDay: 'golden', seed: 1907, light: { sunAzimuthDeg: r2(((YAW - 100) % 360 + 360) % 360), sunElevationDeg: 7 },
    actors: [hero, foe], effects, fxTime: T, timeScale: 0,
    storyboard: { version: 1, durationMs: T + 1500, shots: [], actorTracks: [] },
    // the frame holds no sky (the long lens fills it with the tanks and the trees), so golden hour reads in the light
    // itself: a low sun raking in from 100 degrees right and a warmed grade (QA lesson 2)
    picture: { ...CLEAN, ...LIT, temperature: 18 }, fx: { quality: 'cinematic', trackDust: true }, autoPlace: false,
    lenses: [{ ...lensAt('a', eye, 12, look, 0.62, 10.4), rollDeg: -8 }],
    // a 4 ms still exposure (versus.mjs jobs reads it): spark and debris smears cut to a third
    meta: { id: ID, kind: 'versus-still', pair: 'ariete_c2_x v t62mv1_x', round: 6, idea: 'the telephoto compression', stillExposureMs: 4 } };
};
