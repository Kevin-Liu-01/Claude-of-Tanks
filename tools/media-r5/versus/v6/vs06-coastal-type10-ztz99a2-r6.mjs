// Round 6, vs06: the broadside exchange (Saltmere Bay, golden hour). Below the southern downs the strand lies flat and
// dry for 40 m in front of the bay. A long lens stands on the grass above the beach, 60-odd metres inland, and looks out
// to sea. The Type 10 and the ZTZ-99A2 roll along the sand toward each other across the frame's left and right thirds.
// Each is near profile, 62-64° off its nose, its hull angled a little toward the lens so the front still reads, and its
// turret laid back onto the other. Both fire at the same instant: two muzzle blasts face each other across the gap. Each
// takes the other's round on the turret front in a spray of sparks. Behind them a beached wreck and the shoreline burn,
// a cook-off column climbs and clods fall. The bay and the low gold sun sit behind them. The sun stands off the frame's
// right, so the Type 10's front takes a raking key, and the backlit sand dust glows around both hulls.
import { SCENES, fx, moment, hitFx, plate, inFrame, bearingOf, axes, wrap, r2, lensAt, ground, polar, CLEAN, LIT, MOVE_MS } from '../versus.mjs';

const ID = 'vs06-coastal-type10-ztz99a2-r6';
const MAP = 'coastal';
const DEG = Math.PI / 180;
// the lens's ground point on the grass above the strand, and its bearing (east, out to sea)
const EYE = [246, -212];
const YAW = 88;

SCENES[ID] = () => {
  const T = 7000, g = (p) => ground(MAP, p[0], p[1]);
  const at = (side, ahead) => inFrame(EYE, YAW, side, ahead);
  const A = at(-12.5, 62), B = at(12.5, 66);
  // each hull faces the other, turned `turn` degrees toward the lens; its turret laid back onto the other
  const face = (me, other, turn) => {
    const to = bearingOf(me, other), side = Math.sign(wrap(bearingOf(me, EYE) - to)), hdg = (to + side * turn + 360) % 360;
    return { facingDeg: r2(hdg), turretDeg: r2(wrap(to - hdg)) };
  };
  const elev = (me, other) => r2(Math.atan2(g(other) - g(me), Math.hypot(other[0] - me[0], other[1] - me[1])) / DEG + 0.6);
  const hero = { id: 'type10_x', name: 'hero', pos: A.map(r2), ...face(A, B, 24), gunDeg: elev(A, B), camo: 'factory', camoSeed: 7106 };
  const foe = { id: 'ztz99a2', name: 'foe0', pos: B.map(r2), ...face(B, A, 8), gunDeg: elev(B, A), camo: 'factory', camoSeed: 7107 };

  // both roll at 3 m/s along their hulls over the 2.6 s before the still and on past it
  const track = (a, speed) => {
    const { f } = axes(a.facingDeg), back = speed * MOVE_MS / 1000, on = speed * 0.6;
    const key = (k, tMs, p) => ({ id: `${a.name}-${k}`, tMs, pos: p.map(r2), facingDeg: a.facingDeg, turretDeg: a.turretDeg, gunDeg: a.gunDeg, transition: 'linear' });
    return { actor: a.name, keys: [key(0, T - MOVE_MS, [a.pos[0] - f[0] * back, a.pos[1] - f[1] * back]), key(1, T + 600, [a.pos[0] + f[0] * on, a.pos[1] + f[1] * on])] };
  };
  const tracks = [track(hero, 3.2), track(foe, 2.6)];

  // a beached wreck burning on the strand behind the Type 10, left of it
  const wreckPos = at(-22, 92);
  const wreck = { id: 'type10_x', name: 'wreck0', pos: wreckPos.map(r2), facingDeg: r2((YAW + 70) % 360), turretDeg: -30, gunDeg: 0,
    state: 'wrecked-burnt', stateAgeS: 50, camo: 'factory', camoSeed: 7306 };
  const fall = at(1.5, 80);
  const sparkAgain = (me, from, tMs) => { const p = plate(MAP, me, from); return fx('sparks', p.at, tMs, { caliberMm: 120, normal: p.normal }); };
  const effects = [
    // the backlit sand off both hulls' tracks
    fx('dust', 'hero', T - 240, { count: 12, intensity: 1 }),
    fx('dust', 'foe0', T - 200, { count: 10, intensity: 0.9 }),
    // the same instant: both guns, both strikes (and a second spark shower off each plate, the owner's "more sparks")
    moment('hero', T, 0.05), moment('foe0', T, 0.05),
    ...hitFx(MAP, hero, foe.pos, T - 130, 'ricochet'), ...hitFx(MAP, foe, hero.pos, T - 120, 'ricochet'),
    sparkAgain(hero, foe.pos, T - 70), sparkAgain(foe, hero.pos, T - 60),
    // an HE round's burst on the sand behind the gap, its clods coming down
    fx('explosion', fall.map(r2), T - 760, { size: 'small', munition: 'he', cause: 'shot' }),
    fx('debris', [r2(fall[0]), r2(g(fall) + 1.4), r2(fall[1])], T - 735, { count: 44, speedMps: 15, hot: 0.45, scale: 1.35 }),
    // behind them on the strand: a cook-off column by the water, a second behind the ZTZ, the wreck and a beach fire
    fx('explosion', at(-6, 100).map(r2), 0, { size: 'huge' }),
    fx('explosion', at(26, 104).map(r2), 1200, { size: 'huge' }),
    fx('burning', 'wreck0', 0),
    fx('fire_field', at(-15, 84).map(r2), 0, { radiusM: 4, durationS: 40, intensity: 1, smoke: true }),
    fx('embers', at(-15, 84).map(r2), 0, { radiusM: 4, rate: 50, durationS: 20, rise: 3 }),
  ];

  // the long lens: aimed by bearing and pitch from the grass bank
  const aim = (name, eye, lift, yaw, pitchDeg, fov) => {
    const look = polar(eye, yaw, 40), eyeY = g(eye) + lift;
    return lensAt(name, eye, lift, look, r2(eyeY + 40 * Math.tan(pitchDeg * DEG) - g(look)), fov);
  };
  return { map: MAP, timeOfDay: 'golden', seed: 1906,
    // the low gold sun out over the bay, behind the pair and off the frame's right
    light: { sunAzimuthDeg: r2((YAW - 34 + 360) % 360), sunElevationDeg: 9 },
    actors: [hero, foe, wreck], effects, fxTime: T, timeScale: 0,
    storyboard: { version: 1, durationMs: T + 1500, shots: [], actorTracks: tracks },
    picture: { ...CLEAN, ...LIT, exposure: 0.38 }, fx: { quality: 'cinematic', trackDust: true }, autoPlace: false,
    lenses: [aim('a', EYE, 2.0, YAW, -3.6, 21), aim('b', inFrame(EYE, YAW, 0, -14), 2.6, YAW, -3.4, 18)],
    meta: { id: ID, kind: 'versus-still', pair: 'type10_x v ztz99a2', round: 6,
      idea: 'the broadside exchange: a long lens off the line, both tanks firing across the strand at once, the bay and the gold sun behind' } };
};
