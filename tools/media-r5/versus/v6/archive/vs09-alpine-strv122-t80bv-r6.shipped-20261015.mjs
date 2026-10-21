// Round 6, vs09: the wide-angle low hero on Glacier Pass (the owner, 2026-10-15 17:45: "make them unique scenes instead
// of plaigarizing ... experiment all with new scenes").
// A wide lens sits low in the snow north-east of the frozen lake, looking up the northern cross road toward the saddle
// and the mountain wall behind it. The Strv 122 rolls past the lens 9 m off, front three-quarter, filling the right of
// the frame at 12 m/s, its gun swung onto the pass and flashing, a rooster tail of snow from its tracks and powder off the
// ground from the blast. Up the road on the pass the T-80BV it has just hit smokes from its engine deck, spall and sparks still flying
// off its front, its spilled fuel burning on its far side (fire, smoke and fragments behind it, never on it). A low
// morning sun stands off the lens's left side, out of frame: raking light on the Strv's glacis and a morning glow in
// the left of the sky. (QA lessons 2026-10-15: the T-80BV 31 m off so it holds 10 % of the frame; no glow on it.)
import { SCENES, fx, hitFx, polar, inFrame, bearingOf, axes, wrap, r2, lensAt, ground, dimsOf, CLEAN, LIT } from '../../versus.mjs';

const ID = 'vs09-alpine-strv122-t80bv-r6';
const MAP = 'alpine';
const T = 7000;
// the lens frame: low in the snow, looking north-east up the northern cross road to the saddle
const EYE = [145.7, 193.6], YAW = 30;
const at = (side, ahead) => inFrame(EYE, YAW, side, ahead).map(r2);

SCENES[ID] = () => {
  // the T-80BV on the pass: on the northern cross road's shoulder where it climbs to the saddle, 29 m off in the left of
  // the frame (the mountain wall behind it); hit, engine smoking, its gun still laid on the Strv. It stands far enough
  // left that the Strv's bore lies about 50 degrees across the view ray (FX-RECIPES: nose-on, a flash shrinks to a dot)
  const tPos = [173, 207.5];
  // the Strv 122 9 m off on the right; the lens 34 degrees off its nose on its left (glacis and left flank to the lens),
  // its turret swung across onto the T-80BV
  const sPos = at(3.3, 8.6), sHead = r2((bearingOf(sPos, EYE) - 34 + 360) % 360);
  const hero = { id: 'strv122_x', name: 'hero', pos: sPos, facingDeg: sHead, turretDeg: r2(wrap(bearingOf(sPos, tPos) - sHead)), gunDeg: 1,
    camo: 'winter', camoSeed: 7191, recoilAgeS: 0.04 };
  const tHead = r2((bearingOf(tPos, sPos) + 28 + 360) % 360);
  const foe = { id: 't80bv', name: 'foe0', pos: tPos, facingDeg: tHead, turretDeg: r2(wrap(bearingOf(tPos, sPos) - tHead)), gunDeg: 2,
    camo: 'winter', camoSeed: 7192, state: 'engine-smoking' };
  // the Strv's run (FX-RECIPES 2026-10-15): 12 m/s along its heading, firing on the move, so its tracks throw a full
  // rooster tail of snow; the sun 72 degrees off the view gives the powder a grey shadow side
  const SPEED = 12, { f, r } = axes(sHead), d = dimsOf(hero.id);
  const hullAt = (ago) => [sPos[0] - f[0] * SPEED * ago / 1000, sPos[1] - f[1] * SPEED * ago / 1000];
  const key = (k, tMs, p) => ({ id: `hero-${k}`, tMs, pos: p.map(r2), facingDeg: sHead, turretDeg: hero.turretDeg, gunDeg: hero.gunDeg, transition: 'linear' });
  const track = { actor: 'hero', keys: [key(0, T - 2600, hullAt(2600)), key(1, T + 400, hullAt(-400))] };
  // snow bursts at both rear track ends where the hull was, along its heading
  const tail = [];
  for (const [ago, count] of [[1500, 27], [1100, 27], [750, 27], [450, 24], [220, 21], [90, 15]]) {
    const p = hullAt(ago);
    for (const sd of [-1, 1]) {
      const q = [p[0] - f[0] * d[0] * 0.9 + r[0] * sd * d[1] * 0.8, p[1] - f[1] * d[0] * 0.9 + r[1] * sd * d[1] * 0.8];
      tail.push(fx('dust', q.map(r2), T - ago, { count, intensity: 1.3, dirDeg: r2(sHead) }));
    }
  }
  // its far side: the line from the lens through it, 7 m on
  const back = polar(tPos, bearingOf(EYE, tPos), 7).map(r2), g = ground(MAP, ...back);
  const effects = [
    ...tail,
    // the Strv fires: a live muzzle flash 42 ms before the still (every exposure sample sees it; no bolt), 12 m from the
    // lens; the recoil is the actor's recoilAgeS
    fx('muzzle_flash', 'hero', T - 42, { caliberMm: 140 }),
    // the T-80BV: the Strv's last round in its front 0.7 s ago (spall and sparks still in the air, the pop long gone);
    // its spilled fuel burning on its far side since, smoke and embers rising, fragments thrown up behind it
    ...hitFx(MAP, foe, sPos, T - 700, 'penetration'),
    fx('fire_field', back, 0, { radiusM: 3.5, durationS: 40, intensity: 1.1, smoke: true }),
    fx('embers', back, 0, { radiusM: 3, rate: 40, durationS: 20, rise: 3 }),
    fx('debris', [back[0], r2(g + 1.6), back[1]], T - 900, { count: 30, speedMps: 11, hot: 0.7, scale: 1.2 }),
  ];
  return { map: MAP, timeOfDay: 'morning', seed: 1909,
    // the morning sun low off the lens's left side, just out of frame: raking on the Strv's glacis, glowing in the sky
    light: { sunAzimuthDeg: r2((YAW + 72) % 360), sunElevationDeg: 15 },
    actors: [hero, foe], effects, fxTime: T, timeScale: 0,
    storyboard: { version: 1, durationMs: T + 1500, shots: [], actorTracks: [track] },
    picture: { ...CLEAN, ...LIT }, fx: { quality: 'cinematic', trackDust: true }, autoPlace: false,
    lenses: [
      lensAt('a', EYE, 0.9, polar(EYE, YAW, 20), 2.2, 60),
      lensAt('b', EYE, 1.15, polar(EYE, YAW, 20), 2.6, 62),
    ],
    meta: { id: ID, kind: 'versus-still', pair: 'strv122_x v t80bv', round: 6,
      idea: 'the wide-angle low hero: the Strv 122 fills the frame firing as the T-80BV burns far up the pass under the mountains' } };
};
