/**
 * missileRecipes.ts — a missile's launch, its motor lighting and its smoke trail on the media layer (fx lane, 2026-10-10;
 * the looks are missileLooks.ts).
 *
 * Every recipe takes its own seeded stream `R` (atmosRecipes.ts puffRandom, keyed to the round and the puff), never the
 * shared fx stream: a trail puff is born where the missile passed, at the time it passed (a negative birth offset), so the
 * same flight draws the same trail at any frame rate or Studio step, and a launch draws the same cloud on every replay.
 */
import type { BlastContext } from './blastRecipes.ts';
import type { MissileLook } from './missileLooks.ts';

type Rgb = readonly [number, number, number];
const TAU = Math.PI * 2;

const GAS: Rgb = [0.62, 0.61, 0.58];
const GAS_AGED: Rgb = [0.68, 0.67, 0.64];
const DUST: Rgb = [0.36, 0.31, 0.25];
const DUST_AGED: Rgb = [0.48, 0.44, 0.38];
const FLASH_HOT: readonly [number, number, number] = [1, 0.92, 0.74];
const FLASH_DEEP: readonly [number, number, number] = [1, 0.56, 0.2];

function puffLook(C: BlastContext, c0: Rgb, c1: Rgb, density: number, fadeIn: number, fadeOut: number): void {
  const m = C.m;
  m.r0 = c0[0]; m.g0 = c0[1]; m.b0 = c0[2]; m.r1 = c1[0]; m.g1 = c1[1]; m.b1 = c1[2];
  m.density = density; m.fadeIn = fadeIn; m.fadeOut = fadeOut;
}
function puffBook(C: BlastContext, R: () => number, playSeconds: number, startFrame: number, aspect: number): void {
  const m = C.m;
  m.medium = 'billow'; m.variant = 0; m.mirror = R() < 0.5; m.playSeconds = playSeconds; m.startFrame = startFrame;
  m.aspect = aspect; m.heat = 0; m.cool = 1;
}
/** One media puff (every field group set: nothing carries over between emits). */
function puff(C: BlastContext, R: () => number, x: number, y: number, z: number, vx: number, vy: number, vz: number,
  drag: number, rise: number, windK: number, life: number, size0: number, size1: number, growExp: number,
  c0: Rgb, c1: Rgb, density: number, fadeIn: number, fadeOut: number, bo: number, aspect = 1): void {
  const m = C.m;
  m.x = x; m.y = y; m.z = z; m.birthOffset = bo;
  m.vx = vx; m.vy = vy; m.vz = vz; m.drag = drag; m.rise = rise; m.windK = windK; m.grav = 0;
  m.life = life; m.size0 = size0; m.size1 = size1; m.growExp = growExp;
  m.rot = (R() - 0.5) * 0.7; m.spin = (R() - 0.5) * 0.06;
  puffLook(C, c0, c1, density, fadeIn, fadeOut);
  puffBook(C, R, life * (0.9 + R() * 0.2), Math.floor(R() * 24), aspect);
  C.media(m);
}
function flash(C: BlastContext, R: () => number, x: number, y: number, z: number, size0: number, size1: number,
  life: number, alpha: number, bo: number): void {
  const lp = C.lp;
  lp.pos[0] = x; lp.pos[1] = y; lp.pos[2] = z; lp.vel[0] = 0; lp.vel[1] = 0.3; lp.vel[2] = 0;
  lp.life = life; lp.size0 = size0; lp.size1 = size1; lp.rot = R() * TAU; lp.rotVel = 0;
  lp.col0[0] = FLASH_HOT[0]; lp.col0[1] = FLASH_HOT[1]; lp.col0[2] = FLASH_HOT[2];
  lp.col1[0] = FLASH_DEEP[0]; lp.col1[1] = FLASH_DEEP[1]; lp.col1[2] = FLASH_DEEP[2];
  lp.alpha = alpha; lp.grav = 0; lp.birthOffset = bo;
  C.flash(lp);
}

/**
 * The launch at the muzzle (x, y, z; d the unit flight direction; gy the ground under it). A gun-launched round's blast
 * is the gun's own (effects.ts draws the cannon's muzzle flash): it adds only a thin wisp of the missile's gas.
 *   - tube: the launch charge throws a dense grey puff out of the tube's mouth and a backblast cloud out of its rear,
 *     kicking the ground's dust up where the blast reaches it;
 *   - soft_eject: a small eject puff and a smaller one behind (the counter-mass), no flash;
 *   - rail: the motor lights on the rail — a flash and a dense white cloud blown back and out round the launcher;
 *   - canister: a rocket's flame and a dense cloud that swallows the launcher, its blast raising the ground's dust.
 */
export function missileLaunch(C: BlastContext, R: () => number, L: MissileLook, x: number, y: number, z: number,
  dx: number, dy: number, dz: number, gy: number, bo: number): void {
  const k = L.launchK;
  // a basis round the line
  let sx = -dz, sz = dx;
  const sl = Math.hypot(sx, sz) || 1; sx /= sl; sz /= sl;
  const nearGround = y - gy < 3.5;
  if (L.launch === 'gun') {
    puff(C, R, x + dx * 1.2, y + dy * 1.2, z + dz * 1.2, dx * 3, dy * 3 + 0.3, dz * 3, 2.4, 0.15, 0.7, 1.6 + R() * 0.6,
      0.35, 1.5, 2.2, GAS, GAS_AGED, 0.32, 0.0, 0.4, bo + 0.02);
    return;
  }
  if (L.launch === 'tube') {
    flash(C, R, x + dx * 0.4, y + dy * 0.4, z + dz * 0.4, 0.35 * k, 1.1 * k, 0.07, 0.75, bo);
    // the mouth: the launch charge's gas thrown forward, stalling within a few metres
    for (let i = 0; i < 3; i++) {
      const v = (6 + 4 * R()) * k;
      puff(C, R, x + dx * 0.5, y + dy * 0.5, z + dz * 0.5, dx * v + sx * (R() - 0.5) * 2, dy * v + 0.4 + R() * 0.6,
        dz * v + sz * (R() - 0.5) * 2, 3.2, 0.18, 0.75, 2.2 + R() * 0.9, 0.5 * k, (1.8 + R() * 0.7) * k, 3,
        GAS, GAS_AGED, 0.7, 0.0, 0.42, bo + R() * 0.02);
    }
    // the backblast out of the tube's rear (behind the launcher), dust where it reaches the ground
    for (let i = 0; i < 4; i++) {
      const v = (8 + 6 * R()) * k;
      const a = (R() - 0.5) * 0.7;
      const bx = -dx * Math.cos(a) + sx * Math.sin(a), bz = -dz * Math.cos(a) + sz * Math.sin(a);
      const c0 = nearGround ? DUST : GAS, c1 = nearGround ? DUST_AGED : GAS_AGED;
      puff(C, R, x - dx * 1.0, y - dy * 1.0, z - dz * 1.0, bx * v, -dy * v * 0.5 + 0.6 + R() * 0.8, bz * v, 2.6, 0.2, 0.9,
        2.6 + R() * 1.4, 0.7 * k, (2.6 + R() * 1.2) * k, 2.6, c0, c1, 0.55, 0.0, 0.4, bo + 0.01 + R() * 0.03);
    }
    if (nearGround) {
      for (let i = 0; i < 3; i++) {
        const a = (R() - 0.5) * 1.6, r = 2.5 + R() * 2.5;
        const ux = -dx * Math.cos(a) + sx * Math.sin(a), uz = -dz * Math.cos(a) + sz * Math.sin(a);
        puff(C, R, x + ux * r, gy + 0.4, z + uz * r, ux * 4, 0.4 + R() * 0.4, uz * 4, 1.6, 0.06, 1.0, 3.5 + R() * 1.5,
          0.8 * k, (3.0 + R()) * k, 2.0, DUST, DUST_AGED, 0.4, 0.05, 0.4, bo + 0.05 + R() * 0.08, 2.2);
      }
    }
    return;
  }
  if (L.launch === 'soft_eject') {
    for (let i = 0; i < 2; i++) {
      const v = (3 + 2 * R()) * k;
      puff(C, R, x + dx * 0.4, y + dy * 0.4, z + dz * 0.4, dx * v, dy * v + 0.3, dz * v, 3, 0.15, 0.8, 1.6 + R() * 0.6,
        0.3, (1.2 + R() * 0.4) * k, 2.6, GAS, GAS_AGED, 0.55, 0.0, 0.4, bo + R() * 0.02);
    }
    puff(C, R, x - dx * 0.6, y - dy * 0.6, z - dz * 0.6, -dx * 2.5, 0.3, -dz * 2.5, 3, 0.12, 0.8, 1.4, 0.25,
      0.9 * k, 2.4, GAS, GAS_AGED, 0.4, 0.0, 0.4, bo + 0.01);
    return;
  }
  if (L.launch === 'rail' || L.launch === 'canister') {
    const can = L.launch === 'canister';
    flash(C, R, x, y, z, 0.6 * k, (can ? 2.6 : 1.8) * k, can ? 0.12 : 0.09, 0.85, bo);
    const fire = C.lp;
    if (can) {
      for (let i = 0; i < 2; i++) {
        fire.pos[0] = x - dx * 0.8; fire.pos[1] = y - dy * 0.8; fire.pos[2] = z - dz * 0.8;
        fire.vel[0] = -dx * (4 + 3 * R()); fire.vel[1] = 0.6; fire.vel[2] = -dz * (4 + 3 * R());
        fire.life = 0.18 + R() * 0.1; fire.size0 = 0.6 * k; fire.size1 = (1.6 + R() * 0.6) * k; fire.rot = R() * TAU;
        fire.rotVel = 0; fire.col0[0] = 1; fire.col0[1] = 0.78; fire.col0[2] = 0.42; fire.col1[0] = 0.95; fire.col1[1] = 0.32;
        fire.col1[2] = 0.06; fire.alpha = 0.7; fire.grav = 0.6; fire.birthOffset = bo;
        C.fire(fire);
      }
    }
    const n = can ? 6 : 5;
    for (let i = 0; i < n; i++) {
      const a = (R() - 0.5) * 1.8;
      const v = (5 + 5 * R()) * k;
      const bx = -dx * Math.cos(a) + sx * Math.sin(a), bz = -dz * Math.cos(a) + sz * Math.sin(a);
      const life = (can ? 6 : 4.5) + R() * 2;
      puff(C, R, x - dx * 0.6, y - dy * 0.6, z - dz * 0.6, bx * v, 0.5 + R() * 1.0, bz * v, 1.8, 0.25, 0.85, life,
        0.8 * k, (can ? 4.2 : 3.4) * k * (0.85 + 0.3 * R()), 2.4, L.smoke?.c0 ?? GAS, L.smoke?.c1 ?? GAS_AGED,
        can ? 0.85 : 0.78, 0.0, 0.45, bo + 0.01 + R() * 0.05);
    }
    if (can && nearGround) {
      for (let i = 0; i < 4; i++) {
        const a = R() * TAU, r = 2 + R() * 3;
        puff(C, R, x + Math.cos(a) * r, gy + 0.4, z + Math.sin(a) * r, Math.cos(a) * 5, 0.4 + R() * 0.3, Math.sin(a) * 5, 1.5,
          0.06, 1.0, 4 + R() * 2, 1.0, 3.6 + R(), 2.0, DUST, DUST_AGED, 0.45, 0.05, 0.4, bo + 0.05 + R() * 0.1, 2.2);
      }
    }
  }
}

/** The flight motor lighting clear of the launcher (a soft launch's coast, a TOW's flight motor): a bright pop, a short
 *  burst of its smoke. */
export function missileIgnition(C: BlastContext, R: () => number, L: MissileLook, x: number, y: number, z: number,
  dx: number, dy: number, dz: number, bo: number): void {
  const soft = L.launch === 'soft_eject';
  flash(C, R, x, y, z, 0.3, soft ? 1.4 : 1.0, 0.06, soft ? 0.9 : 0.65, bo);
  const s = L.smoke;
  if (!s) return;
  for (let i = 0; i < (soft ? 3 : 2); i++) {
    const v = 2 + 2 * R();
    puff(C, R, x - dx * 0.5, y - dy * 0.5, z - dz * 0.5, -dx * v + (R() - 0.5), -dy * v + 0.3 + R() * 0.4, -dz * v + (R() - 0.5),
      2.2, s.rise, s.windK, s.life * 0.6 * (0.8 + 0.4 * R()), s.size0, s.size1 * 0.8, 2.4, s.c0, s.c1,
      Math.min(0.75, s.density + 0.25), 0.0, 0.4, bo + R() * 0.02);
  }
}

/**
 * One puff of the trail where the motor passed (x, y, z) heading d, born `bo` (negative: it passed that point earlier).
 * `beat` is the sustainer's pulse at that point (-1..1): a puffy motor's trail swells and thins along its length.
 */
export function missileTrailPuff(C: BlastContext, R: () => number, L: MissileLook, x: number, y: number, z: number,
  dx: number, dy: number, dz: number, beat: number, bo: number, coarse = 1): void {
  const s = L.smoke;
  if (!s) return;
  // `coarse` (>= 1): a crowded sky's trails are laid with fewer, bigger puffs (the caller spaces them wider) so they stay
  // continuous without overrunning the media pool
  const p = (1 + s.pulse * 0.45 * beat) * Math.min(2.5, Math.sqrt(Math.max(1, coarse)));
  // the exhaust leaves backward and stalls within a second; the trail then drifts with the air and rises a little
  const v = 1.5 + R();
  puff(C, R, x + (R() - 0.5) * 0.2, y + (R() - 0.5) * 0.2, z + (R() - 0.5) * 0.2,
    -dx * v + (R() - 0.5) * 0.5, -dy * v + (R() - 0.5) * 0.5, -dz * v + (R() - 0.5) * 0.5,
    2.0, s.rise, s.windK, s.life * (0.8 + 0.4 * R()), s.size0 * p, s.size1 * p * (0.85 + 0.3 * R()), 1.6,
    s.c0, s.c1, Math.min(0.9, s.density * (0.8 + 0.25 * R()) * (1 + s.pulse * 0.3 * beat)), 0.04, 0.35, bo);
}
