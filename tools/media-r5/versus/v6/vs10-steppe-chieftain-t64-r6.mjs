// Round 6, vs10: the night kill shot, seen from above. A high lens (5 m) looks down on the Chieftain Mk 10, big on the right
// and almost nose-on, its turret swung across the view onto the T-64BV and its muzzle blast rolling out sideways into the
// gap; the T-64BV on the left at mid-distance, front-on toward the Chieftain and the lens, burning (killed 3.5 s before,
// its turret still on, its fire-lit column rising) with a cook-off a second old rolling up beyond and beside it, so the
// hull's edge stands dark against the fire. Debris falls, embers drift and a cook-off column burns behind it. The frame is
// rolled -11° (the other way from vs01's). Night, exposure +0.35, the tanks blacked out (no headlights).
// (rev 4, the owner 2026-10-16, through the coordinator: "i think i want to see tank fronts more in the other versus, and
// tanks should be more % of frame" and "and more interesting camera rotation and angles": both hulls within 35° of their
// noses, the Chieftain at least 45 % of the frame's width and the T-64BV 22 %, a high lens looking down and a Dutch angle.
// Earlier QA stands: no firing moment or flare, the kill older with its turret kept, the cook-off beside it, no
// headlights, nothing at T.)
import { SCENES, fx, polar, inFrame, bearingOf, axes, wrap, r2, lensAt, ground, CLEAN, LIT, SUN_UP, DEG } from '../versus.mjs';

const ID = 'vs10-steppe-chieftain-t64-r6', MAP = 'steppe', T = 7000;
// the lens frame: open steppe north of the village (no record taller than 2.2 m in the frame within 170 m)
const EYE = [240, -90], YAW = 60, ROLL = -11;

SCENES[ID] = () => {
  const at = (side, ahead) => inFrame(EYE, YAW, side, ahead);
  // (rev 5, GO QA: the Chieftain's body, not its barrel, to fill 40-45 % and the empty foreground to go) the lens 4.5 m
  // nearer, both hulls drawn in toward the middle, the facings taken from the lens itself
  const LENS = at(0, 4.5), A = at(4.2, 15.5), B = at(-9.5, 26);
  // the Chieftain: the lens 15° off its nose, on its left (its nose turned toward the frame's left, the T-64BV's side); its
  // turret swung 74° to the hull's right, laid toward the T-64BV, so the bore lies across the view (about 108° off the
  // ray to the lens) and the blast rolls out sideways into the gap, short of the T-64BV
  const hH = (bearingOf(A, LENS) - 15 + 360) % 360;
  // the T-64BV: the lens 25° off its nose, on its right (its nose turned in toward the frame's middle), its gun on the Chieftain
  const fH = (bearingOf(B, LENS) + 25 + 360) % 360;
  const hero = { id: 'chieftain_mk10_x', name: 'hero', pos: A.map(r2), facingDeg: r2(hH), turretDeg: -100, gunDeg: 4, recoilAgeS: 0.075,
    camo: 'factory', camoSeed: 7110 };
  const foe = { id: 't64bv1', name: 'foe0', pos: B.map(r2), facingDeg: r2(fH), turretDeg: r2(wrap(bearingOf(B, A) - fH)), gunDeg: 0,
    camo: 'factory', camoSeed: 7111 };
  const up = (p, h) => [r2(p[0]), r2(ground(MAP, ...p) + h), r2(p[1])];
  const away = bearingOf(LENS, B), far = (dist) => polar(B, away, dist);
  // the cook-off point: 13 m beyond the T-64BV and 3 m to the frame's left of it (away from the gap), so its smoke stands
  // beside and behind the hull rather than on its deck
  const { r: right } = axes(YAW), cook = [far(13)[0] - right[0] * 3, far(13)[1] - right[1] * 3];
  const effects = [
    // the killing round, 44-56 ms old across the exposure (FX-RECIPES.md 3): the muzzle blast with no round drawn, the
    // barrel recoiled (recoilAgeS). No ground wave: the gun's ground lies in front of the T-64BV from this lens
    fx('muzzle_flash', 'hero', T - 75, { caliberMm: 120 }),
    // the T-64BV killed 3.5 s before the still, its turret kept on (no pop): by now a burning wreck, its fire-lit
    // column rising off the deck, the ring's first blowtorch spent
    fx('tank_kill', 'foe0', T - 3500, { cause: 'shot', pop: false }),
    // a cook-off a second old, beyond and beside the hull: orange smoke rolling up behind its edge, debris coming down
    fx('explosion', cook.map(r2), T - 1000, { size: 'medium' }),
    fx('debris', up(cook, 2.2), T - 980, { count: 40, speedMps: 16, hot: 0.75, scale: 1.3 }),
    fx('embers', far(4).map(r2), T - 1500, { radiusM: 5, rate: 70, durationS: 20, rise: 3.5 }),
    // behind on the left: a cook-off column burning since before the shot (doubled a second later to fill its top), its
    // fire on the ground and its embers drifting
    fx('explosion', at(-46, 115).map(r2), 0, { size: 'huge' }),
    fx('explosion', at(-45.4, 115.6).map(r2), 1000, { size: 'huge' }),
    fx('fire_field', at(-40, 100).map(r2), 0, { radiusM: 5, durationS: 40, intensity: 1.2, smoke: true }),
    fx('embers', at(-40, 100).map(r2), 0, { radiusM: 6, rate: 60, durationS: 30, rise: 3 }),
  ];
  // the moon behind the lens's left so both fronts take its light
  const moon = [(YAW + 165) % 360, SUN_UP.night];
  // a high lens looking down (pitch negative), rolled
  const lens = (name, side, ahead, lift, fov, roll, dYaw = 0, pitch = -12) => {
    const eye = at(side, ahead), look = inFrame(eye, YAW + dYaw, 0, 30);
    const lookH = ground(MAP, ...eye) + lift + 30 * Math.tan(pitch * DEG) - ground(MAP, ...look);
    return { ...lensAt(name, eye, lift, look, r2(lookH), fov), rollDeg: roll };
  };
  return { map: MAP, timeOfDay: 'night', seed: 9610, light: { sunAzimuthDeg: r2(moon[0]), sunElevationDeg: moon[1], headlights: false },
    actors: [hero, foe], effects, fxTime: T, timeScale: 0,
    storyboard: { version: 1, durationMs: T + 1500, shots: [], actorTracks: [] },
    picture: { ...CLEAN, ...LIT, exposure: 0.4, lift: [0.02, 0.022, 0.03] }, fx: { quality: 'cinematic', trackDust: true }, autoPlace: false,
    lenses: [lens('a', 0, 4.5, 4.6, 40, ROLL, 0, -11.5), lens('b', 0, 4, 5.4, 40, ROLL - 3, 0, -13.5)],
    meta: { id: ID, kind: 'versus-still', pair: 'chieftain_mk10_x v t64bv1', round: 6, rev: 4,
      idea: 'the night kill shot from above: the Chieftain nose-on and big, its gun swung across onto the T-64BV burning on the left, a Dutch angle' } };
};
