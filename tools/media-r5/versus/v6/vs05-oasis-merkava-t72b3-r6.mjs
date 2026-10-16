// Round 6, vs05: the crest (Sunscar Oasis, bright day). The east dune arm's west face falls 8-9 m to the village's
// eastern edge. A low lens stands beside the arm's crest line and looks west, down the face, over the town. The Merkava
// Mk 4 climbs the last of the face toward the crest in the left foreground: its hull's front three-quarter is turned to
// the lens, its nose pitched up by the rise, and sand sprays off the slope under its tracks. Its turret is swung over its
// far side with the gun depressed onto the T-72B3 below and beyond, which stands at the foot of the face against the
// mud-brick compounds. The Merkava has just fired. The T-72B3 is front three-quarter to the lens, and the round has struck
// its turret front: a white-hot pop, sparks and spall, its engine deck beginning to smoke. The T-72's own shot burst on
// the face behind the Merkava, so clods fall there. Columns climb from the town behind the T-72, and a wreck burns
// beside them. The high day sun stands behind the lens's right shoulder and lights both hull fronts.
import { SCENES, fx, moment, hitFx, plate, inFrame, bearingOf, axes, wrap, r2, lensAt, ground, modelOf, polar, CLEAN, LIT, MOVE_MS } from '../versus.mjs';

const ID = 'vs05-oasis-merkava-t72b3-r6';
const MAP = 'oasis';
const DEG = Math.PI / 180;
// the lens's ground point beside the crest line, and its bearing (west, down the face toward the town)
const EYE = [267, -55];
const YAW = 275;

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

  // the Merkava: 14 m out, left of the axis; the lens 36° off its nose on its right, so its nose points across toward
  // the frame's middle and up the face
  const heroPos = at(-3, 14);
  const hero = { id: 'merkava4_x', name: 'hero', pos: heroPos.map(r2), facingDeg: r2((bearingOf(heroPos, EYE) + 36 + 360) % 360),
    turretDeg: 0, gunDeg: 0, camo: 'factory', camoSeed: 7105 };
  // the T-72B3: at the foot of the face, 58 m out and right; its hull turned 28° off the lens toward the Merkava
  const foePos = at(17, 58);
  const foe = { id: 't72b3_x', name: 'foe0', pos: foePos.map(r2), facingDeg: r2((bearingOf(foePos, EYE) - 28 + 360) % 360),
    turretDeg: 0, gunDeg: 0, camo: 'factory', camoSeed: 7106 };
  Object.assign(hero, lay(hero, 3.8, 1.9, 2.2, foe.pos, 1.9));
  Object.assign(foe, lay(foe, 3.2, 1.9, 2.0, hero.pos, 2.0));

  // the climb: 3.6 m/s up the face over the 2.6 s before the still and on past it
  const { f } = axes(hero.facingDeg), back = 3.6 * MOVE_MS / 1000, on = 3.6 * 0.6;
  const key = (k, tMs, p) => ({ id: `hero-${k}`, tMs, pos: p.map(r2), facingDeg: hero.facingDeg, turretDeg: hero.turretDeg, gunDeg: hero.gunDeg, transition: 'linear' });
  const tracks = [{ actor: 'hero', keys: [key(0, T - MOVE_MS, [hero.pos[0] - f[0] * back, hero.pos[1] - f[1] * back]), key(1, T + 600, [hero.pos[0] + f[0] * on, hero.pos[1] + f[1] * on])] }];

  // a wreck burning in the town behind the T-72, left of it
  const wreckPos = at(6, 84);
  const wreck = { id: 't72b3_x', name: 'wreck0', pos: wreckPos.map(r2), facingDeg: r2((YAW + 130) % 360), turretDeg: 40, gunDeg: 0,
    state: 'wrecked-burnt', stateAgeS: 45, camo: 'factory', camoSeed: 7305 };

  // the T-72's miss: a burst on the face beyond the Merkava and left of it, clods falling
  const miss = at(-10, 27);
  const effects = [
    // the climb's sand off the tracks
    fx('dust', 'hero', T - 620, { count: 10, intensity: 0.9 }),
    fx('dust', 'hero', T - 220, { count: 14, intensity: 1.1 }),
    // the Merkava's shot, and its round's strike on the T-72's turret front
    moment('hero', T, 0.05),
    ...hitFx(MAP, foe, hero.pos, T - 130, 'penetration'),
    // a second spark shower off the same plate, a beat later (the owner: "more sparks")
    (() => { const p = plate(MAP, foe, hero.pos); return fx('sparks', p.at, T - 70, { caliberMm: 120, normal: p.normal }); })(),
    fx('engine_smoke', 'foe0', T - 1500),
    // the T-72's earlier round, short and left
    fx('explosion', miss.map(r2), T - 760, { size: 'small', munition: 'he', cause: 'shot' }),
    fx('debris', [r2(miss[0]), r2(g(miss) + 1.4), r2(miss[1])], T - 735, { count: 40, speedMps: 14, hot: 0.4, scale: 1.3 }),
    // the town behind: two cook-off columns, a fire and embers, the wreck burning
    fx('explosion', at(22, 125).map(r2), 0, { size: 'huge' }),
    fx('explosion', at(46, 142).map(r2), 1200, { size: 'huge' }),
    fx('fire_field', at(24, 74).map(r2), 0, { radiusM: 4, durationS: 40, intensity: 1, smoke: true }),
    fx('embers', at(24, 74).map(r2), 0, { radiusM: 4, rate: 50, durationS: 20, rise: 3 }),
    fx('burning', 'wreck0', 0),
  ];

  // the lens: low (1.0 m) beside the crest; aimed by bearing and pitch rather than a ground point on the slope
  const aim = (name, eye, lift, yaw, pitchDeg, fov) => {
    const look = polar(eye, yaw, 30), eyeY = g(eye) + lift;
    return lensAt(name, eye, lift, look, r2(eyeY + 30 * Math.tan(pitchDeg * DEG) - g(look)), fov);
  };
  return { map: MAP, timeOfDay: 'day', seed: 1905,
    // bright day: the sun high behind the lens's right shoulder, on both hull fronts
    light: { sunAzimuthDeg: r2((YAW + 205) % 360), sunElevationDeg: 42 },
    actors: [hero, foe, wreck], effects, fxTime: T, timeScale: 0,
    storyboard: { version: 1, durationMs: T + 1500, shots: [], actorTracks: tracks },
    picture: { ...CLEAN, ...LIT }, fx: { quality: 'cinematic', trackDust: true }, autoPlace: false,
    lenses: [aim('a', EYE, 1.35, YAW - 3, -5, 37), aim('b', inFrame(EYE, YAW, 1.2, -2), 1.75, YAW - 4, -5.5, 40)],
    meta: { id: ID, kind: 'versus-still', pair: 'merkava4_x v t72b3_x', round: 6,
      idea: 'the crest: the Merkava climbs the dune face toward a low lens, its gun swung onto the T-72B3 below at the town' } };
};
