// Round 6, vs08: the banking drone (CV90 Mk 4 v BMP-3, Winter, day).
// Pass 3 (the owner, 2026-10-16: fronts, bigger tanks, a more interesting camera). A drone 9.1 m over the open snowfield
// west of the village, ahead of both vehicles on a long 24 deg lens, tilted 23 deg down and banked +10 deg, the snowy
// forest edge across the top of the frame. The CV90 races at the lens at 12 m/s, its front to the drone (28 deg off its
// nose) and 46 % of the frame's width, a rooster tail of snow thrown up behind it, its turret laid left on the BMP-3 and
// its autocannon firing (a muzzle blast, the barrel recoiled). The BMP-3 is beside it, at rest at the end of a skid with
// its front to the drone (26 deg) and 37 % of the width, hit in the flank that faces the CV90 and burning: a
// penetration's flame jet, a short low spall of hot fragments, a young fire. The sun stands low, 112 deg left of the view, so both fronts
// take the light and the spray's shadow side reads against the lit snow. (Round 6 QA fixes, remake/v6/FX-RECIPES.md.)
import { SCENES, fx, plate, polar, bearingOf, inFrame, axes, wrap, r2, lensAt, dimsOf, CLEAN, LIT, MOVE_MS } from '../versus.mjs';

const ID = 'vs08-winter-cv90-bmp3-r6';
const MAP = 'winter';
const T = 7000;

export function build(p = {}) {
  const v = {
    // the drone's ground point, its bearing, its height and its look point (ground level, `lookAhead` m ahead)
    // pass 3 (the owner 2026-10-16: "tank fronts more ... tanks should be more % of frame ... more interesting camera
    // rotation and angles"): the drone 9.1 m up on a long 24 deg lens, tilted 23 deg down and banked +10 deg, the pair
    // side by side 18-21 m off, both noses toward it
    eye: [-196, 76], yaw: 268, lift: 9.1, fov: 24, lookAhead: 21.5, lookH: 0, roll: 10,
    cv90: [3.5, 18], bmp: [-4.5, 21],
    // the CV90: the lens `cvOff` degrees off its nose (+ on its left), its turret laid on the BMP-3; the BMP-3 skids:
    // the lens `bmpOff` off its nose, its slide along `slideDeg` (world bearing offset from its nose), at `slideMps`
    cvOff: 28, cvSpeed: 12, bmpOff: 26, bmpTurret: -12, slideDeg: -40, slideMps: 0,
    // the sun low, 112 deg left of the view: both fronts take it (29 and 54 deg off their noses) and the snow spray's
    // shadow side reads grey on the lit snow (FX recipes)
    sun: [20, 22],
    ...p,
  };
  const E = v.eye;
  const cp = inFrame(E, v.yaw, ...v.cv90), bp = inFrame(E, v.yaw, ...v.bmp);
  const cHead = bearingOf(cp, E) - v.cvOff;
  const hero = { id: 'cv90_mkiv_x', name: 'hero', pos: cp.map(r2), facingDeg: r2((cHead % 360 + 360) % 360), turretDeg: r2(wrap(bearingOf(cp, bp) - cHead)),
    gunDeg: 0, camo: 'winter', camoSeed: 7811, recoilAgeS: 0.04 };
  const bHead = bearingOf(bp, E) - v.bmpOff;
  const foe = { id: 'bmp3', name: 'foe0', pos: bp.map(r2), facingDeg: r2((bHead % 360 + 360) % 360), turretDeg: v.bmpTurret,
    gunDeg: 2, camo: 'winter', camoSeed: 7812 };
  // the CV90's run: MOVE_MS of travel before the still and 0.4 s past it, along its heading (its trail lies behind);
  // hullAt(ago) is where it was `ago` ms before the still
  const key = (name, k, tMs, pos, a) => ({ id: `${name}-${k}`, tMs, pos: pos.map(r2), facingDeg: a.facingDeg, turretDeg: a.turretDeg, gunDeg: a.gunDeg, transition: 'linear' });
  const { f: cf, r: cr } = axes(hero.facingDeg), d = dimsOf(hero.id);
  const hullAt = (ago) => [cp[0] - cf[0] * v.cvSpeed * ago / 1000, cp[1] - cf[1] * v.cvSpeed * ago / 1000];
  // the BMP-3's skid: it slides along its old line while its nose has swung toward the lens
  const slide = polar([0, 0], foe.facingDeg + v.slideDeg, 1), sb = v.slideMps * MOVE_MS / 1000, so = v.slideMps * 0.4;
  const tracks = [
    { actor: 'hero', keys: [key('hero', 0, T - MOVE_MS, hullAt(MOVE_MS), hero), key('hero', 1, T + 400, hullAt(-400), hero)] },
    // (QA r6: the BMP-3 has come to rest at the end of its skid, so its fire burns where it stands: driven, its fire
    // stayed where it was lit and stood as a stray column in the treeline)
    ...(v.slideMps ? [{ actor: 'foe0', keys: [key('foe0', 0, T - MOVE_MS, [bp[0] - slide[0] * sb, bp[1] - slide[1] * sb], foe), key('foe0', 1, T + 400, [bp[0] + slide[0] * so, bp[1] + slide[1] * so], foe)] }] : []),
  ];
  const hit = plate(MAP, foe, cp);
  // the plate's outward normal laid nearly level (the template's 0.66 up threw the spray up across the turret)
  const nl = Math.hypot(hit.normal[0], hit.normal[2]) || 1, low = [r2(hit.normal[0] / nl * 0.97), 0.24, r2(hit.normal[2] / nl * 0.97)];
  // (FX recipes) the rooster tail: snow bursts at both rear track ends where the hull was 90-1500 ms before the still,
  // thrown back along its heading (an actor-anchored dust lands under the hull, and the track's own dust is thin);
  // (QA r6) the BMP-3's two dust puffs read as snowballs and are gone
  const tail = [];
  for (const [ago, count] of [[1500, 27], [1100, 27], [750, 27], [450, 24], [220, 21], [90, 15]]) {
    const q0 = hullAt(ago);
    for (const sd of [-1, 1]) {
      const q = [q0[0] - cf[0] * d[0] * 0.9 + cr[0] * sd * d[1] * 0.8, q0[1] - cf[1] * d[0] * 0.9 + cr[1] * sd * d[1] * 0.8];
      tail.push(fx('dust', q.map(r2), T - ago, { count, intensity: 1.3, dirDeg: r2(hero.facingDeg) }));
    }
  }
  const effects = [
    ...tail,
    // the BMP-3 burning since it was first hit, 2.5 s ago: flames and smoke off its engine deck (the effect sets its
    // state to burning, so the fire is young at the still rather than burning since the load)
    fx('burning', 'foe0', T - 2500),
    // the CV90's autocannon: its muzzle blast (no firing_moment: its white bolt read as a beam), the barrel recoiled;
    // (pass 3) no tracer stream: the BMP-3 is 3 m past the muzzle at these sizes, inside the 10 m where no dash draws
    // (take 3) 85 ms old: its light pool no longer clips the CV90's nose; (take 4, QA) autocannon size, so its light and
    // glow no longer bloom white on the snow under the glacis
    fx('muzzle_flash', 'hero', T - 85, { caliberMm: 45 }),
    // the rounds on the BMP-3's flank (take 4, QA: the 120 mm spark fans drew a spike-star of long rays across its
    // turret): an autocannon-size penetration, 0.25 s old, its spray thrown out low and level off the plate toward the
    // CV90 and away from the turret, and a short, slow spall of hot fragments; no separate spark fan
    fx('impact', hit.at, T - 250, { kind: 'penetration', caliberMm: 30, normal: low }),
    fx('debris', hit.at, T - 230, { count: 16, speedMps: 5, hot: 0.75, scale: 0.45 }),
  ];
  const look = polar(E, v.yaw, v.lookAhead);
  // (owner 2026-10-16: "more interesting camera rotation and angles") the drone banks: a Dutch roll about the view axis
  const lenses = [{ ...lensAt('a', E, v.lift, look, v.lookH, v.fov), rollDeg: v.roll }, ...(v.b ? [{ ...lensAt('b', v.b.eye, v.b.lift, polar(v.b.eye, v.b.yaw, v.b.lookAhead), 0, v.b.fov), rollDeg: v.b.roll ?? v.roll }] : [])];
  return { map: MAP, timeOfDay: 'day', seed: 1908, light: { sunAzimuthDeg: v.sun[0], sunElevationDeg: v.sun[1] },
    actors: [hero, foe], effects, fxTime: T, timeScale: 0,
    storyboard: { version: 1, durationMs: T + 1500, shots: [], actorTracks: tracks },
    // (QA r6: the snow was near blown out) a third of a stop under LIT
    picture: { ...CLEAN, ...LIT, exposure: -0.03 }, fx: { quality: 'cinematic', trackDust: true }, autoPlace: false,
    lenses,
    meta: { id: ID, kind: 'versus-still', pair: 'cv90_mkiv_x v bmp3', round: 6, idea: 'the high three-quarter drone view: the CV90 racing down the snow at the burning, skidding BMP-3, its autocannon firing' } };
}
SCENES[ID] = () => build();
