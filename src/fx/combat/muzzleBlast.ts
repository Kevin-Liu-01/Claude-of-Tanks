/**
 * combat/muzzleBlast.ts — the gas, smoke and dust of a main-gun shot (combat-fx lane, 2026-10-05).
 *
 * The critics (motion wave 105, 2.4/10): "a cream-white petal-shaped flash in frame 1 only, then a thin grey haze
 * that is mostly gone within about a second, plus one round ball of smoke that rises without changing shape — an
 * unmistakable sprite … no ground dust kicked up by the blast." The battle recipe keeps its shaped flash cards and
 * jets (effects.ts); this module replaces everything that follows them:
 *  1. HOT GAS: the propellant gas leaving the bore still burns for a few frames — fire-in-smoke puffs blown forward
 *     that glow orange and cool to grey within ~0.15 s, bridging the flash and the cloud;
 *  2. the OVERPRESSURE cloud: a toroidal shell thrown forward and outward at 14-26 m/s that stalls within metres
 *     (heavy drag), keeps expanding, rolls (spin, warp) and thins, then drifts with the wind;
 *  3. a forward plume along the line of fire;
 *  4. the barrel keeps smoking: a few small puffs leak from the muzzle over the next second and a half and grow,
 *     deform and drift away;
 *  5. the GROUND KICK-UP: when the bore sits low over dusty ground the blast wave lifts a radial ring of dust under
 *     and ahead of the muzzle (strongest forward), plus a sheet pushed down the line of fire and a little grit — in
 *     the colour of the ground (sand lifts a lot, mud almost none, water throws spray).
 */
import type { CombatContext, Rgb } from './context.ts';
import { calScale, mHeat, mLook, mMove, mPlace, mShape, tierCount } from './context.ts';
import { landClod } from './clods.ts';
import { SURFACE_LOOKS, classifySurface } from './surface.ts';

interface Vec3Like { x: number; y: number; z: number }

const TAU = Math.PI * 2;
// propellant smoke is a light grey-tan aerosol (bright in the sun), the burning gas a little darker under its glow
const GAS0: Rgb = [0.33, 0.3, 0.26];
const GAS1: Rgb = [0.52, 0.5, 0.47];
const CLOUD0: Rgb = [0.42, 0.4, 0.36];
const CLOUD1: Rgb = [0.58, 0.565, 0.54];
const HAZE0: Rgb = [0.5, 0.49, 0.47];
const HAZE1: Rgb = [0.62, 0.61, 0.6];
const _u = { x: 0, y: 0, z: 0 };
const _v = { x: 0, y: 0, z: 0 };

function basis(dx: number, dy: number, dz: number): void {
  // u = normalize(up x dir) (or x-axis when firing near vertical), v = dir x u
  let ux = 0, uy = 0, uz = 0;
  if (Math.abs(dy) < 0.94) { ux = dz; uy = 0; uz = -dx; } else { ux = 0; uy = -dz; uz = dy; }
  const ul = Math.hypot(ux, uy, uz) || 1;
  ux /= ul; uy /= ul; uz /= ul;
  _u.x = ux; _u.y = uy; _u.z = uz;
  _v.x = dy * uz - dz * uy; _v.y = dz * ux - dx * uz; _v.z = dx * uy - dy * ux;
}

export interface MuzzleBlastInput {
  pos: Vec3Like;
  dir: Vec3Like;
  caliberMm: number;
  birthOffset: number;
  /** the camera is the player's own scope right at the muzzle: only a thin haze */
  scoped: boolean;
  /** 0 when the camera is inside ~3 m of the muzzle, 1 past ~14 m (the battle recipe's close-camera discipline) */
  nearAtt: number;
}

export function muzzleBlast(C: CombatContext, o: MuzzleBlastInput): void {
  const { pos, dir, caliberMm, birthOffset, scoped } = o;
  const s = calScale(caliberMm);
  const m = C.m;
  const R = C.rand;
  basis(dir.x, dir.y, dir.z);
  const dk = C.distBoost(pos.x, pos.y, pos.z);
  const near = 0.55 + 0.45 * o.nearAtt;

  if (!scoped) {
    // 1. hot gas: burning propellant gas blown out of the bore, orange for a few frames
    const gasN = tierCount(C, 6);
    for (let i = 0; i < gasN; i++) {
      const a = R() * TAU, r = 2 + R() * 4, f = 9 + R() * 14, along = 0.3 + R() * 0.9;
      const ca = Math.cos(a), sa = Math.sin(a);
      const rx = _u.x * ca + _v.x * sa, ry = _u.y * ca + _v.y * sa, rz = _u.z * ca + _v.z * sa;
      mPlace(m, pos.x + dir.x * along, pos.y + dir.y * along, pos.z + dir.z * along, birthOffset);
      mMove(m, dir.x * f + rx * r, dir.y * f + Math.max(ry * r, -1) + 0.4, dir.z * f + rz * r, 7, 0.35, 0.7, 0);
      mShape(m, 1.6 + R() * 0.7, 0.55 * s, (2.7 + R() * 1.0) * s * dk, 3.2, 1, R() * TAU, (R() - 0.5) * 3);
      mLook(m, GAS0, GAS1, 0.62 * near, 0.008, 0.4, 0.45, 0.14, 0.02, 0.25, R());
      mHeat(m, 1.0, 13 + R() * 5, 1.15, 1.05);
      C.smoke(m);
    }
    // 2. the overpressure shell: thrown forward and out, stalls within metres, rolls and thins
    const ringN = tierCount(C, 14);
    for (let i = 0; i < ringN; i++) {
      const a = (i / ringN) * TAU + (R() - 0.5) * 0.5;
      const ca = Math.cos(a), sa = Math.sin(a);
      const rx = _u.x * ca + _v.x * sa, ry = _u.y * ca + _v.y * sa, rz = _u.z * ca + _v.z * sa;
      const fw = 0.45 + R() * 0.35, side = 0.8 + R() * 0.3;
      let ex = dir.x * fw + rx * side, ey = dir.y * fw + ry * side, ez = dir.z * fw + rz * side;
      // the ground turns the downward half of the ring aside: it spreads out low instead of burrowing
      if (ey < -0.15) { const k = 0.15 / -ey; ey = -0.15; ex /= Math.sqrt(k); ez /= Math.sqrt(k); }
      // and the upper half rolls out over the bore rather than climbing away as a lone ball above the gun
      if (ey > 0.3) ey = 0.3 + (ey - 0.3) * 0.45;
      const el = Math.hypot(ex, ey, ez) || 1;
      ex /= el; ey /= el; ez /= el;
      const v = (14 + R() * 12) * Math.sqrt(s);
      const along = 0.5 + R() * 0.5;
      mPlace(m, pos.x + dir.x * along, pos.y + dir.y * along, pos.z + dir.z * along, birthOffset + R() * 0.02);
      mMove(m, ex * v, ey * v + 0.3, ez * v, 6.2 + R() * 1.2, 0.32, 1, 0);
      mShape(m, 2.6 + R() * 1.2, 0.8 * s, (3.4 + R() * 1.6) * s * dk, 2.8, 1, R() * TAU, (R() - 0.5) * 2.2);
      mLook(m, CLOUD0, CLOUD1, (0.5 + R() * 0.12) * near, 0.02, 0.34, 0.62, 0.22, 0.025, 0.3, R());
      mHeat(m, 0.45, 16, 0.95, 0.9);
      C.earth(m);
    }
    // 3. the forward plume down the line of fire
    const plumeN = tierCount(C, 8);
    for (let i = 0; i < plumeN; i++) {
      const along = 0.8 + R() * 2.8 * s;
      const a = R() * TAU, lat = R() * 0.35 * along * 0.25;
      const ca = Math.cos(a), sa = Math.sin(a);
      const f = 5 + R() * 6;
      mPlace(m, pos.x + dir.x * along + (_u.x * ca + _v.x * sa) * lat,
        pos.y + dir.y * along + (_u.y * ca + _v.y * sa) * lat,
        pos.z + dir.z * along + (_u.z * ca + _v.z * sa) * lat, birthOffset + along * 0.012);
      mMove(m, dir.x * f, dir.y * f + 0.5, dir.z * f, 4.2, 0.3, 1, 0);
      mShape(m, 2.6 + R() * 1.3, 0.9 * s, (3.2 + R() * 1.5) * s * dk, 2.2, 1, R() * TAU, (R() - 0.5) * 1.5);
      mLook(m, CLOUD0, CLOUD1, (0.44 + R() * 0.12) * near, 0.03, 0.32, 0.62, 0.22, 0.02, 0.3, R());
      mHeat(m, 0, 1, 0.5, 1);
      C.earth(m);
    }
  }

  // 4. the barrel keeps smoking: small puffs leak from the muzzle and grow, deform and drift away
  const leakN = tierCount(C, scoped ? 2 : 5);
  for (let i = 0; i < leakN; i++) {
    const delay = 0.12 + i * 0.3 + R() * 0.15;
    const along = 0.15 + R() * 0.3;
    mPlace(m, pos.x + dir.x * along, pos.y + dir.y * along + 0.05, pos.z + dir.z * along, birthOffset + delay);
    mMove(m, dir.x * (0.8 + R()), 0.35 + R() * 0.3, dir.z * (0.8 + R()), 1.4, 0.42 + R() * 0.2, 1, 0);
    mShape(m, 3.6 + R() * 1.6, 0.35 * s, (1.9 + R() * 0.9) * s, 1.4, 1, R() * TAU, (R() - 0.5) * 1.2);
    mLook(m, HAZE0, HAZE1, (scoped ? 0.12 : 0.26) + R() * 0.06, 0.12, 0.3, 0.6, 0.3, 0, 0.35, R());
    mHeat(m, 0, 1, 0.5, 1);
    C.earth(m);
  }
  if (scoped) return;

  // 5. the blast wave lifts the ground under and ahead of a low muzzle
  const aheadX = pos.x + dir.x * 1.6, aheadZ = pos.z + dir.z * 1.6;
  const gy = C.groundY(aheadX, aheadZ);
  const h = pos.y - gy;
  const hK = Math.max(0, Math.min(1, 1 - (h - 1.4) / 2.6));
  if (hK <= 0.04) return;
  const surf = classifySurface(C.field, aheadX, aheadZ);
  const L = SURFACE_LOOKS[surf];
  const dust = hK * L.blastDust;
  if (dust <= 0.03) return;
  let fx = dir.x, fz = dir.z;
  const fl = Math.hypot(fx, fz) || 1;
  fx /= fl; fz /= fl;
  const ringN = tierCount(C, 20 * Math.min(1.4, dust));
  const aim = Math.atan2(fz, fx);
  for (let i = 0; i < ringN; i++) {
    // most of the dust rolls out ahead of the muzzle in one overlapping low cloud; a thinner ring runs round it
    const ahead = i % 4 !== 0;
    const a = ahead ? aim + ((i + 0.5) / ringN - 0.5) * 2.6 + (R() - 0.5) * 0.3 : (i / ringN) * TAU + (R() - 0.5) * 0.45;
    const cx = Math.cos(a), cz = Math.sin(a);
    // the wave is strongest down the line of fire, weakest behind the muzzle
    const fwd = 0.5 + 0.5 * (cx * fx + cz * fz);
    const v = (3 + R() * 5 + fwd * 6) * Math.sqrt(s);
    mPlace(m, aheadX + cx * 0.6, gy + 0.3, aheadZ + cz * 0.6, birthOffset + 0.012 + R() * 0.03);
    mMove(m, cx * v, 0.45 + R() * 0.6, cz * v, 3.3, 0.18, 0.95, 0);
    // a low sheet that rolls out along the ground (flat from its first frames, smeared along its run)
    mShape(m, 3.0 + R() * 1.6, 1.2, (4.4 + R() * 2.2 + fwd * 2.2) * s * Math.sqrt(Math.min(1.5, dust)) * dk, 2.5,
      0.4, R() * TAU, (R() - 0.5) * 0.6);
    mLook(m, L.dust0, L.dust1, (0.5 + R() * 0.16) * Math.min(1, dust), 0.03, 0.4, 0.55, 0.2, 0.06, L.scatter, R());
    mHeat(m, 0, 1, 0.5, 1);
    C.earth(m);
  }
  // the sheet pushed down the line of fire
  const sheetN = tierCount(C, 8 * Math.min(1.4, dust));
  for (let i = 0; i < sheetN; i++) {
    const ahead = 2 + R() * 5 * s;
    const side = (R() - 0.5) * 2.4;
    const px = aheadX + fx * ahead - fz * side, pz = aheadZ + fz * ahead + fx * side;
    mPlace(m, px, C.groundY(px, pz) + 0.45, pz, birthOffset + 0.03 + ahead * 0.01);
    mMove(m, fx * (6 + R() * 6), 0.8 + R() * 0.8, fz * (6 + R() * 6), 2.8, 0.2, 1, 0);
    mShape(m, 3 + R() * 1.4, 0.9, (3.6 + R() * 1.6) * s * dk, 2.2, 0.42, R() * TAU, (R() - 0.5) * 0.6);
    mLook(m, L.dust0, L.dust1, (0.36 + R() * 0.12) * Math.min(1, dust), 0.05, 0.35, 0.6, 0.18, 0.02, L.scatter, R());
    mHeat(m, 0, 1, 0.5, 1);
    C.earth(m);
  }
  // grit thrown off the ground right under the blast
  if (surf !== 'water' && surf !== 'mud') {
    const k = C.k;
    const gritN = tierCount(C, 5 * hK);
    for (let i = 0; i < gritN; i++) {
      const a = R() * TAU;
      k.px = aheadX + Math.cos(a) * 0.5; k.py = gy + 0.25; k.pz = aheadZ + Math.sin(a) * 0.5;
      const v = 3 + R() * 4;
      k.vx = Math.cos(a) * v + fx * 2.5; k.vy = 2.5 + R() * 3; k.vz = Math.sin(a) * v + fz * 2.5;
      k.scale = 0.035 + R() * 0.05; k.ax = R() - 0.5; k.ay = R() - 0.5; k.az = R() - 0.5; k.spin = 12 + R() * 12;
      k.seed = R(); k.r = L.clod[0]; k.g = L.clod[1]; k.b = L.clod[2]; k.wet = L.clodWet;
      landClod(k, C.groundY);
      k.life = k.landS + 0.8; k.birthOffset = birthOffset;
      C.clod(k);
    }
  }
}
