// Round 6, vs07: the telephoto compression (autumn, golden hour). A 10-degree lens on a hillside 100 m off looks down
// into a wooded fold: the depth collapses, so the near T-62, the Ariete standing on the rise 36 m beyond it, the
// layers of autumn trees around and behind them (100 to 450 m) and the hanging smoke stack into one dense frame with
// no sky. The two read the same size although one is 36 m further: that is the subject. The Ariete, front
// three-quarter, fires down the slope at the T-62; the T-62, front three-quarter with its turret swung back on the
// Ariete, takes the hit: sparks, hot spall and stowage debris falling, its engine deck smoking (the battle wind carries
// it left, away from the Ariete). Earlier HE bursts hang as lit dust behind the Ariete and a field burns deeper in;
// the low sun rakes in from the right and lights both hulls' fronts and the dust.
import { SCENES, fx, moment, hitFx, bearingOf, wrap, r2, lensAt, ground, polar, CLEAN, LIT } from '../versus.mjs';

const ID = 'vs07-autumn-ariete-t62-r6';
const MAP = 'autumn';

SCENES[ID] = () => {
  const T = 7000;
  const eye = [215.7, -240.6], T62 = [280, -164], ARI = [297, -131.3];
  // a hull's heading from the lens: the lens `off` degrees off its nose (+ on its left)
  const facing = (pos, off) => ((bearingOf(pos, eye) - off) % 360 + 360) % 360;
  const hero = { id: 'ariete_c2_x', name: 'hero', pos: ARI, facingDeg: r2(facing(ARI, 35)), turretDeg: 0, gunDeg: -1, camo: 'factory', camoSeed: 7107 };
  hero.turretDeg = r2(wrap(bearingOf(ARI, T62) - hero.facingDeg));
  const foe = { id: 't62mv1_x', name: 'foe0', pos: T62, facingDeg: r2(facing(T62, -40)), turretDeg: 0, gunDeg: 2, camo: 'factory', camoSeed: 7207 };
  foe.turretDeg = r2(wrap(bearingOf(T62, ARI) - foe.facingDeg));
  const yaw = bearingOf(eye, [(T62[0] + ARI[0]) / 2, (T62[1] + ARI[1]) / 2]);
  const back = (d, side = 0) => { const p = polar(ARI, yaw, d); return polar(p, yaw - 90, side).map(r2); };
  const gT = ground(MAP, ...T62);
  const effects = [
    moment('hero', T, 0.055),
    ...hitFx(MAP, foe, ARI, T - 110, 'ricochet'),
    // stowage and spall thrown off the T-62's deck, coming down round it
    fx('debris', [r2(T62[0]), r2(gT + 2.6), r2(T62[1])], T - 700, { count: 30, speedMps: 11, hot: 0.55, scale: 0.9 }),
    fx('engine_smoke', 'foe0', 0),
    // the hanging dust of two earlier HE rounds behind the Ariete, and a field burning deeper in
    fx('explosion', back(28, 6), T - 2600, { size: 'small', munition: 'he', cause: 'shot' }),
    fx('explosion', back(46, -10), T - 1700, { size: 'small', munition: 'he', cause: 'shot' }),
    fx('fire_field', back(85, 14), 0, { radiusM: 6, durationS: 40, intensity: 1, smoke: true }),
  ];
  const mid = [(T62[0] + ARI[0]) / 2, (T62[1] + ARI[1]) / 2];
  return { map: MAP, timeOfDay: 'golden', seed: 1907, light: { sunAzimuthDeg: r2(((yaw - 110) % 360 + 360) % 360), sunElevationDeg: 8 },
    actors: [hero, foe], effects, fxTime: T, timeScale: 0,
    storyboard: { version: 1, durationMs: T + 1500, shots: [], actorTracks: [] },
    picture: { ...CLEAN, ...LIT }, fx: { quality: 'cinematic', trackDust: true }, autoPlace: false,
    lenses: [lensAt('a', eye, 2.5, mid, 0.2, 10)],
    meta: { id: ID, kind: 'versus-still', pair: 'ariete_c2_x v t62mv1_x', round: 6, idea: 'the telephoto compression' } };
};
