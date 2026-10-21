// Round 6, vs02: the village street-corner ambush on Verdant (the owner, 2026-10-15 17:45: "make them unique scenes
// instead of plaigarizing"; vs02 is one of his favourites, and Verdant's buildings are his visual bar).
// Pass 2 (the owner, 2026-10-16: "i want to see tank fronts more in the other versus, and tanks should be more % of
// frame" and "more interesting camera rotation and angles"): the duel comes to the lens. The shipped pass is kept in
// v6/archive/vs02-verdant-challenger-t80u-r6.shipped-20261015.mjs.
// The corner is a real one: the west lane of Verdant's east-west road, between the granary (south, its north-east corner
// at x -26.8, z 57.4) and the red-brick schoolhouse (north, x -42.2..-25.9, z 73.8..84.3). The telephone line runs
// north-south along the main road at x 10-13, behind this lens, so no conductor crosses the frame.
// A lens 0.55 m off the lane's dirt, tilted 8 degrees (a Dutch angle), looks west-south-west into the lane. The
// Challenger 3 bursts round the granary's corner out of its side lane at 11 m/s, nose to the lens (25 degrees off it),
// filling the right half of the frame, its turret swung onto the T-80U and firing. The T-80U pushes down the lane along
// the schoolhouse wall, nose to the lens (20 degrees off), its gun laid back on the Challenger, sparks flying off its
// front from the Challenger's last round. Its own HE round burst on the granary corner behind the Challenger 1.4 s ago
// (smoke and masonry falling behind the hull); a cook-off column stands at the lane's end between the two guns and a
// fire burns beyond the T-80U.
import { SCENES, fx, hitFx, polar, inFrame, bearingOf, axes, wrap, r2, lensAt, ground, dimsOf, CLEAN, LIT } from '../versus.mjs';

const ID = 'vs02-verdant-challenger-t80u-r6';
const MAP = 'verdant';
const T = 7000;
// the lens frame: low in the lane east of the granary, looking west-south-west into it
const EYE = [-12, 70], YAW = 236;
const at = (side, ahead) => inFrame(EYE, YAW, side, ahead).map(r2);

SCENES[ID] = () => {
  // the Challenger 3 at the corner, 13 m off on the right: out of the granary's side lane, the lens 25 degrees off its
  // nose (on its left), its turret slewed across onto the T-80U
  const hPos = at(5, 12), hHead = r2((bearingOf(hPos, EYE) - 25 + 360) % 360);
  // the T-80U 21 m off on the left, along the schoolhouse's south wall: the lens 20 degrees off its nose (on its right)
  const tPos = at(-12, 17), tHead = r2((bearingOf(tPos, EYE) + 20 + 360) % 360);
  const hero = { id: 'challenger_3x', name: 'hero', pos: hPos, facingDeg: hHead, turretDeg: r2(wrap(bearingOf(hPos, tPos) - hHead)), gunDeg: 1,
    camo: 'factory', camoSeed: 7101, recoilAgeS: 0.04 };
  const foe = { id: 't80u_x', name: 'foe0', pos: tPos, facingDeg: tHead, turretDeg: r2(wrap(bearingOf(tPos, hPos) - tHead)), gunDeg: 1,
    camo: 'factory', camoSeed: 7102 };
  // the Challenger's run (FX-RECIPES 2026-10-15): straight up the side lane at 11 m/s so its tracks throw a full rooster
  // tail; it starts 1.4 s before the still, its tail clear of the command tent behind it
  const SPEED = 11, { f, r } = axes(hHead), d = dimsOf(hero.id);
  const hullAt = (ago) => [hPos[0] - f[0] * SPEED * ago / 1000, hPos[1] - f[1] * SPEED * ago / 1000];
  const key = (k, tMs, p) => ({ id: `hero-${k}`, tMs, pos: p.map(r2), facingDeg: hHead, turretDeg: hero.turretDeg, gunDeg: hero.gunDeg, transition: 'linear' });
  const track = { actor: 'hero', keys: [key(0, T - 1400, hullAt(1400)), key(1, T + 400, hullAt(-400))] };
  // dust bursts at both rear track ends where the hull was, along its heading (the churn flies back, the wake drifts on)
  const tail = [];
  for (const [ago, count] of [[1300, 27], [1000, 27], [700, 27], [450, 24], [220, 21], [90, 15]]) {
    const p = hullAt(ago);
    for (const sd of [-1, 1]) {
      const q = [p[0] - f[0] * d[0] * 0.9 + r[0] * sd * d[1] * 0.8, p[1] - f[1] * d[0] * 0.9 + r[1] * sd * d[1] * 0.8];
      tail.push(fx('dust', q.map(r2), T - ago, { count, intensity: 1.3, dirDeg: r2(hHead) }));
    }
  }
  // the T-80U's HE round, a near miss 1.4 s ago: it ended on the granary's street (north) wall by its corner, behind the
  // Challenger from the lens, on the line it flew from the T-80U's muzzle (smoke and masonry rise and fall behind the hull)
  const wallAim = [-27.6, 57.4], dir = bearingOf(tPos, wallAim), wallFrom = polar(wallAim, dir + 180, 2.5);
  const burst = [r2(wallAim[0]), r2(ground(MAP, ...wallAim) + 2.7), r2(wallAim[1] + 0.6)];
  // the lane's end: a cook-off column between the two guns (a second one a second later fills its broken top) and a
  // fire beyond the T-80U, on its far side
  const col = at(-28, 100), fire = at(-17, 42);
  const effects = [
    ...tail,
    // the Challenger fires: a live muzzle flash 42 ms before the still (every exposure sample sees it; no bolt), its bore
    // about 60 degrees across the view ray and its muzzle clear of the T-80U in the frame; the recoil is recoilAgeS
    fx('muzzle_flash', 'hero', T - 42, { caliberMm: 140 }),
    // its previous round on the T-80U's front 0.26 s ago: the pop gone, the sparks still flying (no glow on the T-80U)
    ...hitFx(MAP, foe, hPos, T - 260, 'ricochet'),
    fx('explosion', wallFrom.map(r2), T - 1400, { munition: 'he', wall: true, dirDeg: r2(dir), hitH: 2.7 }),
    fx('debris', burst, T - 1100, { count: 36, speedMps: 9, hot: 0.3, scale: 1.2 }),
    fx('dust', [r2(wallAim[0] + 0.4), r2(wallAim[1] + 0.8)], T - 1300, { count: 10, intensity: 1.2, dirDeg: 0 }),
    fx('explosion', col, 0, { size: 'huge' }),
    fx('explosion', [r2(col[0] + 0.6), r2(col[1] + 0.6)], 1000, { size: 'huge' }),
    fx('fire_field', fire, 0, { radiusM: 4, durationS: 40, intensity: 1, smoke: true }),
    fx('embers', fire, 0, { radiusM: 3.5, rate: 50, durationS: 20, rise: 3 }),
  ];
  return { map: MAP, timeOfDay: 'day', seed: 1902,
    // a fair-weather day sun behind the lens's left shoulder, on both hull fronts and the walls
    light: { sunAzimuthDeg: r2((YAW + 180 - 25) % 360), sunElevationDeg: 36 },
    actors: [hero, foe], effects, fxTime: T, timeScale: 0,
    storyboard: { version: 1, durationMs: T + 1500, shots: [], actorTracks: [track] },
    picture: { ...CLEAN, ...LIT }, fx: { quality: 'cinematic', trackDust: true }, autoPlace: false,
    lenses: [
      // a: 0.55 m off the dirt, rolled 8 degrees clockwise (the frame's right side down), fov 58
      { ...lensAt('a', EYE, 0.55, polar(EYE, YAW + 2, 20), 1.5, 58), rollDeg: -8 },
      // b: a touch higher and steeper in the tilt
      { ...lensAt('b', EYE, 0.8, polar(EYE, YAW + 2, 20), 1.6, 60), rollDeg: -12 },
    ],
    meta: { id: ID, kind: 'versus-still', pair: 'challenger_3x v t80u_x', round: 6, pass: 2,
      idea: 'the village street-corner ambush, pass 2: both noses to a low Dutch-angled lens in the lane, the Challenger 3 bursting round the granary as the T-80U pushes down the schoolhouse wall' } };
};
