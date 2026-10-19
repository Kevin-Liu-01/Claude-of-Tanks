// Round 6, vs05: the crest (Sunscar Oasis, bright day). Owner pass, 2026-10-16: "i want to see tank fronts more in the
// other versus, and tanks should be more % of frame" and "more interesting camera rotation and angles".
// On the west dune arm, above the palm-ringed spring, a lens stands at the crest's edge, 1 m up and tilted 9° (a Dutch
// angle), and looks down the dune face toward the oasis. The Merkava Mk 4 claws up the last of the face straight at it,
// nose pitched up about 8°, its front 26° off the lens, filling half the frame. A rooster tail of sand trails down the
// slope behind it. Its turret is swung over its far side with the gun laid onto the T-72B3, which is climbing after it
// at the foot of the face, 2.5 m lower and 23 m out, front-on (24° off its nose). The Merkava has just fired, and its
// blast throws out to the right of the T-72, never over it. The T-72's lower front plate shows a ricochet's sparks and
// spall falling clear of its outline, and its engine deck begins to smoke. Beyond them the palm belt and the spring stand
// under a cook-off column and a burning wreck. The high day sun stands just behind the lens and lights both fronts.
// (FX recipes, remake/v6/FX-RECIPES.md: a live muzzle_flash 42 ms old with the barrel recoiled, never firing_moment's
// bolt; no effect at T itself; dust bursts at the rear track ends along the path, dirDeg the heading; each column
// doubled a second later. Placement from the 226 CPU dump, features-cpu-75f9d52e7.)
import { SCENES, fx, plate, inFrame, bearingOf, axes, wrap, r2, lensAt, ground, modelOf, polar, dimsOf, CLEAN, LIT, MOVE_MS } from '../versus.mjs';

const ID = 'vs05-oasis-merkava-t72b3-r6';
const MAP = 'oasis';
const DEG = Math.PI / 180;
// the lens's ground point at the crest's edge on the arm's north reach, its bearing (down the face toward the spring,
// which fills the right of the background at 200-350 m), the aim's turn and pitch off that bearing, and its Dutch roll.
// (A second reach, eye [-336, -84] at bearing 96, also passed, but its background rises to a ridge.)
// (GO QA 2, 10-17, SHIP with a polish: the T-72B3 read about 21 % of the width against the owner's 22 %, a reed tip on
// its track) the T-72B3 a metre nearer on the same bearing
const PICK = { eye: [-404, 164], yaw: 120, aimDy: 3.3, pitch: -7.8, lift: 1.0, foe: [8.11, 21] };
const EYE = PICK.eye, YAW = PICK.yaw, ROLL = 9, FOV = 42;

SCENES[ID] = () => {
  const T = 7000, m = modelOf(MAP), g = (p) => ground(MAP, p[0], p[1]);
  const at = (side, ahead) => inFrame(EYE, YAW, side, ahead);
  // the hull's pitch and roll on the face (the height difference over 85 % of its length and 90 % of its width)
  const tilt = (p, hdg, hl, hw) => {
    const { f, r } = axes(hdg), a = hl * 0.85, b = hw * 0.9;
    return { pitch: Math.atan((m.heightAt(p[0] + f[0] * a, p[1] + f[1] * a) - m.heightAt(p[0] - f[0] * a, p[1] - f[1] * a)) / (2 * a)) / DEG,
      roll: Math.atan((m.heightAt(p[0] + r[0] * b, p[1] + r[1] * b) - m.heightAt(p[0] - r[0] * b, p[1] - r[1] * b)) / (2 * b)) / DEG };
  };
  // the gun laid on a point: the turret by bearing, the elevation corrected for the hull's own tilt along the turret
  const lay = (me, hl, hw, gunH, target, targetH) => {
    const turretDeg = wrap(bearingOf(me.pos, target) - me.facingDeg), { pitch, roll } = tilt(me.pos, me.facingDeg, hl, hw);
    const want = Math.atan2(g(target) + targetH - (g(me.pos) + gunH), Math.hypot(target[0] - me.pos[0], target[1] - me.pos[1])) / DEG;
    return { turretDeg: r2(turretDeg), gunDeg: r2(want - pitch * Math.cos(turretDeg * DEG) + roll * Math.sin(turretDeg * DEG)) };
  };

  // the Merkava 11 m out, 3.5 m left of the axis, the lens 26° off its nose on its right; the T-72B3 22 m out and 5.5 m
  // right, climbing toward the lens with the lens 24° off its nose on its left. (QA of the GO render, 2026-10-16: the
  // dune's reeds, which are not in the dumps, crossed both hulls. So the T-72 moved 1.8 m from [4, 23], which makes it a
  // touch bigger, and the Merkava stands 1.2 m further along its own heading: the same climb, a beat later.)
  const heroAt = at(-3.5, 11), heroHdg = (bearingOf(heroAt, EYE) + 26 + 360) % 360, heroPos = at(-2.9, 11);
  const foePos = at(PICK.foe[0], PICK.foe[1]);
  const hero = { id: 'merkava4_x', name: 'hero', pos: heroPos.map(r2), facingDeg: r2(heroHdg),
    turretDeg: 0, gunDeg: 0, camo: 'factory', camoSeed: 7105, recoilAgeS: 0.04 };
  const foe = { id: 't72b3_x', name: 'foe0', pos: foePos.map(r2), facingDeg: r2((bearingOf(foePos, EYE) - 24 + 360) % 360),
    turretDeg: 0, gunDeg: 0, camo: 'factory', camoSeed: 7106 };
  Object.assign(hero, lay(hero, 3.8, 1.9, 2.2, foe.pos, 1.9));
  Object.assign(foe, lay(foe, 3.2, 1.9, 2.0, hero.pos, 2.0));

  // the charge up the face: the Merkava at 6 m/s, the T-72 at 4 m/s after it, over the 2.6 s before the still and on
  const drive = (a, speed) => {
    const { f } = axes(a.facingDeg), at2 = (ago) => [a.pos[0] - f[0] * speed * ago / 1000, a.pos[1] - f[1] * speed * ago / 1000];
    const key = (k, tMs, p) => ({ id: `${a.name}-${k}`, tMs, pos: p.map(r2), facingDeg: a.facingDeg, turretDeg: a.turretDeg, gunDeg: a.gunDeg, transition: 'linear' });
    return { track: { actor: a.name, keys: [key(0, T - MOVE_MS, at2(MOVE_MS)), key(1, T + 400, at2(-400))] }, at: at2 };
  };
  const dh = drive(hero, 6), df = drive(foe, 4);
  const tracks = [dh.track, df.track];
  // the rooster tails: bursts at both rear track ends where each hull was before the still, thrown back down the slope
  const tail = (a, hullAt, bursts) => {
    const { f, r } = axes(a.facingDeg), d = dimsOf(a.id), out = [];
    for (const [ago, count] of bursts) {
      const p = hullAt(ago);
      for (const s of [-1, 1]) {
        const q = [p[0] - f[0] * d[0] * 0.9 + r[0] * s * d[1] * 0.8, p[1] - f[1] * d[0] * 0.9 + r[1] * s * d[1] * 0.8];
        out.push(fx('dust', q.map(r2), T - ago, { count, intensity: 1.3, dirDeg: r2(a.facingDeg) }));
      }
    }
    return out;
  };

  // a burning wreck down by the palms beyond the T-72, left of it
  const wreckPos = at(-9, 62);
  const wreck = { id: 't72b3_x', name: 'wreck0', pos: wreckPos.map(r2), facingDeg: r2((YAW + 130) % 360), turretDeg: 40, gunDeg: 0,
    state: 'wrecked-burnt', stateAgeS: 45, camo: 'factory', camoSeed: 7305 };
  // a cook-off column and its twin a second later at the same point (the twin's cards fill the first one's broken top)
  const column = (p, tMs) => [fx('explosion', p.map(r2), tMs, { size: 'huge' }), fx('explosion', [r2(p[0] + 0.6), r2(p[1] + 0.6)], tMs + 1000, { size: 'huge' })];
  const effects = [
    ...tail(hero, dh.at, [[1500, 27], [1100, 27], [750, 27], [450, 24], [220, 21], [90, 15]]),
    ...tail(foe, df.at, [[900, 18], [500, 16], [200, 14]]),
    // the Merkava's shot at the 175 mm blast-size cap: a live blast 42 ms old in every exposure sample, the barrel recoiled
    // (recoilAgeS on the actor), over an older blast 0.3 s old whose smoke ring and haze now read (GO QA: the gun points away,
    // so the 150 mm blast read as a pale puff)
    fx('muzzle_flash', 'hero', T - 300, { caliberMm: 175 }), fx('muzzle_flash', 'hero', T - 42, { caliberMm: 175 }),
    // its round's strike on the T-72, 0.25 s old, on the lower front plate: the pop has died, and the sparks and spall
    // fall up and to the frame's right, out of the hull's outline (the first films: a fresh hit glow swallows a tank)
    ...(() => {
      const p = plate(MAP, foe, hero.pos, 0.3), rt = axes(YAW).r, fan = [r2(rt[0] * 0.5), 0.85, r2(rt[1] * 0.5)];
      return [fx('impact', p.at, T - 250, { kind: 'ricochet', caliberMm: 125, normal: fan }), fx('sparks', p.at, T - 230, { caliberMm: 120, normal: fan }),
        fx('debris', p.at, T - 240, { count: 14, speedMps: 8, hot: 0.9, scale: 0.45 })];
    })(),
    fx('engine_smoke', 'foe0', T - 1500),
    // beyond them by the spring: a cook-off column (doubled), the wreck burning, a fire with embers
    ...column(at(14, 120), 0),
    fx('burning', 'wreck0', 0),
    fx('fire_field', at(22, 70).map(r2), 0, { radiusM: 4, durationS: 40, intensity: 1, smoke: true }),
    fx('embers', at(22, 70).map(r2), 0, { radiusM: 4, rate: 50, durationS: 20, rise: 3 }),
  ];

  // the lens: 1 m up at the crest's edge, aimed by bearing and pitch, rolled 9° (a Dutch angle)
  const look = polar(EYE, YAW + PICK.aimDy, 30), eyeY = g(EYE) + PICK.lift;
  const lens = { ...lensAt('a', EYE, PICK.lift, look, r2(eyeY + 30 * Math.tan(PICK.pitch * DEG) - g(look)), FOV), rollDeg: ROLL };
  return { map: MAP, timeOfDay: 'day', seed: 1905,
    // bright day: the sun high just behind the lens, on both fronts
    light: { sunAzimuthDeg: r2((YAW + PICK.aimDy + 187) % 360), sunElevationDeg: 42 },
    actors: [hero, foe, wreck], effects, fxTime: T, timeScale: 0,
    storyboard: { version: 1, durationMs: T + 1500, shots: [], actorTracks: tracks },
    picture: { ...CLEAN, ...LIT }, fx: { quality: 'cinematic', trackDust: true }, autoPlace: false,
    lenses: [lens],
    meta: { id: ID, kind: 'versus-still', pair: 'merkava4_x v t72b3_x', round: 6,
      idea: 'the crest: the Merkava claws up the dune face at a tilted lens, its gun laid on the T-72B3 climbing after it, the spring beyond' } };
};
