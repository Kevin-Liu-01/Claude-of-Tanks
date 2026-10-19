// Round 6, vs01: the head-on charge. The M1A2 SEPv3 charges almost nose-on at a very low lens tilted into a Dutch angle,
// a fan of sand thrown back and up off both tracks behind it, its turret swung toward the frame's right and its shot an
// orange fireball beside the hull with the dust blown off the ground under it; the T-90M on the rise behind on the right,
// 3 m up, its front toward the SEPv3 and the lens, a few hot fragments sparking low on its glacis. Burning columns stand
// behind, in the gap between them, and debris falls. Day, the sun high behind the lens's left.
// (rev 5, the owner 2026-10-16, through the coordinator: "i think i want to see tank fronts more in the other versus, and
// tanks should be more % of frame" and "and more interesting camera rotation and angles": both hulls within 35° of their
// noses, the SEPv3 at least 45 % of the frame's width and the T-90M 22 %; a lens 0.7 m up looking up, rolled +9°. Takes
// 1-4's lessons stand: no firing moment (its bolt), the bore across the view, the dust off the track ends, nothing at T.)
import { SCENES, fx, plate, inFrame, bearingOf, axes, wrap, r2, lensAt, ground, dimsOf, MOVE_MS, CLEAN, LIT, DEG } from '../versus.mjs';

const ID = 'vs01-desert-abrams-t90m-r6', MAP = 'desert', T = 7000;
// the lens frame (GO dumps): open sand in the north, clear of the wadi scrub belts, looking east-north-east over a long
// flat horizon
const EYE = [14, 302], YAW = 75, SPEED = 12, ROLL = 12;

SCENES[ID] = () => {
  const at = (side, ahead) => inFrame(EYE, YAW, side, ahead);
  // (GO QA 3, 10-17: the SEPv3's swung bustle still ran off the left edge, the T-90M at 21.5 % of the width) the SEPv3
  // 0.6 m to the frame's right and the T-90M a metre nearer on its bearing; the lens unchanged
  const A = at(-5.0, 17.5), B = at(11.79, 29);
  // the lens 15° off the SEPv3's nose, on its right (its nose turned toward the frame's right); its turret swung 72° to
  // the hull's left, laid toward the T-90M: the bore lies across the view (about 105° off the ray to the lens), so the
  // blast rolls out sideways into the gap between the two hulls, short of the T-90M
  const hH = (bearingOf(A, EYE) + 15 + 360) % 360;
  // the T-90M: the lens 25° off its nose, on its left (its nose turned in toward the frame's middle), gun on the SEPv3
  const fH = (bearingOf(B, EYE) - 25 + 360) % 360;
  const hero = { id: 'm1a2_sepv3_x', name: 'hero', pos: A.map(r2), facingDeg: r2(hH), turretDeg: 72, gunDeg: 4, recoilAgeS: 0.045,
    camo: 'service_usa_desert', camoSeed: 7101 };
  const foe = { id: 't90m_x', name: 'foe0', pos: B.map(r2), facingDeg: r2(fH), turretDeg: r2(wrap(bearingOf(B, A) - fH)), gunDeg: -1,
    camo: 'service_t90m', camoSeed: 7102 };
  // the charge: 12 m/s over the MOVE_MS before the still and 0.4 s past it (the Studio lays its track dust along it)
  const { f, r } = axes(hH), d = dimsOf('m1a2_sepv3_x');
  const hullAt = (ago) => [A[0] - f[0] * SPEED * ago / 1000, A[1] - f[1] * SPEED * ago / 1000];
  const key = (k, tMs, p) => ({ id: `hero-${k}`, tMs, pos: p.map(r2), facingDeg: hero.facingDeg, turretDeg: hero.turretDeg, gunDeg: hero.gunDeg, transition: 'linear' });
  const track = { actor: 'hero', keys: [key(0, T - MOVE_MS, hullAt(MOVE_MS)), key(1, T + 400, hullAt(-400))] };
  const up = (p, h) => [r2(p[0]), r2(ground(MAP, ...p) + h), r2(p[1])];
  // the fans off the tracks (FX-RECIPES.md 1): bursts at both rear track ends where the hull was 0.09-1.5 s before the
  // still, each turned 20° so its churn goes back and outward (a burst's dirDeg is the direction of travel)
  const tail = [];
  for (const [ago, count] of [[1500, 27], [1100, 27], [750, 27], [450, 24], [220, 21], [90, 15]]) {
    const p = hullAt(ago);
    for (const s of [-1, 1]) {
      const q = [p[0] - f[0] * d[0] * 0.9 + r[0] * s * d[1] * 0.85, p[1] - f[1] * d[0] * 0.9 + r[1] * s * d[1] * 0.85];
      tail.push(fx('dust', q.map(r2), T - ago, { count, intensity: 1.3, dirDeg: r2((hH + (s > 0 ? 20 : -20) + 360) % 360) }));
    }
  }
  // the hit on the T-90M: a few hot fragments off the low glacis, 70 ms old, the pop gone. (rev 6, GO QA 10-17: the
  // nonpen impact's spark spray read as a pale needle fan over the T-90M's gun and turret front; it goes, and the
  // fragments fly short and slow, below the gun line: FX-RECIPES.md, short slow spall)
  const hit = plate(MAP, foe, A, 0.2);
  const effects = [
    ...tail,
    // the shot, 44-56 ms old across the exposure: the fire cooled to orange (FX-RECIPES.md 3), no round drawn, the barrel
    // recoiled (recoilAgeS). No ground wave this time: the gun's ground lies in front of the T-90M from this lens
    fx('muzzle_flash', 'hero', T - 50, { caliberMm: 120 }),
    fx('debris', hit.at, T - 70, { count: 6, speedMps: 2.5, hot: 1, scale: 0.3 }),
    // falling debris: an HE round on the rise behind and right of the T-90M, 0.75 s before the still
    fx('explosion', at(25, 50).map(r2), T - 760, { size: 'small', munition: 'he', cause: 'shot' }),
    fx('debris', up(at(25, 50), 1.4), T - 735, { count: 44, speedMps: 15, hot: 0.45, scale: 1.35 }),
    // a burning column right behind the fireball, so the orange blast stands on its dark smoke (doubled a second later to
    // fill its top; its vertical, with the long flat horizon, carries the Dutch tilt); embers drifting behind the T-90M
    fx('explosion', at(17, 170).map(r2), 0, { size: 'huge' }),
    fx('explosion', at(17.6, 170.6).map(r2), 1000, { size: 'huge' }),
    fx('embers', at(14, 40).map(r2), 0, { radiusM: 4, rate: 50, durationS: 20, rise: 3 }),
  ];
  // day: the sun high behind the lens's left (135° off the view), so both hulls' fronts take bright clear light
  const sun = [(YAW + 135) % 360, 34];
  const lens = (name, side, ahead, lift, fov, roll, dYaw = 0, pitch = 6) => {
    const eye = at(side, ahead), look = inFrame(eye, YAW + dYaw, 0, 30);
    const lookH = ground(MAP, ...eye) + lift + 30 * Math.tan(pitch * DEG) - ground(MAP, ...look);
    return { ...lensAt(name, eye, lift, look, r2(lookH), fov), rollDeg: roll };
  };
  // the LIT grade with a mild warmth and a faint orange halation round the blast
  const picture = { ...CLEAN, ...LIT, temperature: 6, warms: { hue: 0, saturation: 1.08, lightness: 0 },
    halation: { amount: 0.2, threshold: 1.6, radius: 1, tint: [1, 0.36, 0.12] } };
  return { map: MAP, timeOfDay: 'day', seed: 9601, light: { sunAzimuthDeg: r2(sun[0]), sunElevationDeg: sun[1] },
    actors: [hero, foe], effects, fxTime: T, timeScale: 0,
    storyboard: { version: 1, durationMs: T + 1500, shots: [], actorTracks: [track] },
    picture, fx: { quality: 'cinematic', trackDust: true }, autoPlace: false,
    // (rev 6, GO QA 10-17: the SEPv3's swung bustle ran off the left edge while the T-90M's rear sat at 0.92) the lens
    // a degree wider and turned 1° left (dYaw +1: the tanks move right in the frame), the tanks unmoved
    lenses: [lens('a', 0, 0, 0.7, 35, ROLL, 1), lens('b', 0, 0, 0.55, 34.5, ROLL + 4, 1, 7)],
    meta: { id: ID, kind: 'versus-still', pair: 'm1a2_sepv3_x v t90m_x', round: 6, rev: 7,
      idea: 'the head-on charge: the SEPv3 nose-on over a low Dutch lens, sand fanned off its tracks, its gun swung right and firing; the T-90M front-on on the rise' } };
};
