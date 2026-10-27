// Merkava family turrets (release 262). One construction for the six marks' turrets, every number from the mark's
// record (merkavaFamilyMarks.ts): the cast-and-welded shell lofted from measured stations (the Mk 1 and Mk 2's narrow
// arrowhead with its small frontal area and long bustle; the Mk 3 and Mk 4's larger cores), the bolted armour modules
// laid on it (the Mk 2D's Dor Dalet wedges, the Mk 3's modular cheeks, the Mk 4's long nose and side modules), which
// are the removable packages the spec's turret plates register, the cupola, hatches, sights and mortar, the smoke banks,
// the bustle basket and the ball-and-chain curtain. Turret frame: origin on the ring centre at deck height, +Z forward.
import * as THREE from 'three';
import { KIT, FITTINGS } from './kit.ts';
import { sectionSolid, type SectionPoint, type SolidSection } from './sectionSolid.ts';
import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';
import { tankSeedId } from '../tankIdAliases.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

/** One station of the shell (turret frame): its base, its shoulder (where the sloped side breaks) and its roof edge,
 *  each a half-width at a height, and the roof's crown height on the centreline. */
export interface TurretStation {
  readonly z: number;
  readonly base: readonly [halfWidth: number, y: number];
  /** The Mk 1 / Mk 2 casting's rounded "ear" at the base (its widest point low on the side); absent, the side runs
   *  straight from the base to the shoulder. */
  readonly ear?: readonly [halfWidth: number, y: number];
  readonly shoulder: readonly [halfWidth: number, y: number];
  readonly roof: readonly [halfWidth: number, y: number];
  readonly crown: number;
}

/** A bolted armour module: a solid plate lofted along z between stations, each a quad (inner bottom, outer bottom,
 *  outer top, inner top) on the +X side; mirrored for the left. */
export interface TurretModule {
  readonly stations: readonly {
    readonly z: number;
    readonly inner: readonly [x: number, y: number];
    readonly outerLow: readonly [x: number, y: number];
    readonly outerHigh: readonly [x: number, y: number];
    readonly innerHigh: readonly [x: number, y: number];
  }[];
  /** Bolt heads on its outer face: [z, y] stations (x follows the face). */
  readonly bolts: readonly (readonly [z: number, y: number])[];
}

export interface MerkavaTurretSpec {
  readonly shell: readonly TurretStation[];
  /** Ring collar under the shell: radius and height (it closes the shell's underside over the race). */
  readonly ring: readonly [r: number, h: number];
  /** Bolted armour (removable packages) per side, +X; mirrored for -X. */
  readonly modules: readonly TurretModule[];
  /** Commander's cupola (right side): x, z, ring radius, height. */
  readonly cupola: readonly [x: number, z: number, r: number, h: number];
  /** Loader's hatch (left side) or null (Mk 4: none). */
  readonly loaderHatch: readonly [x: number, z: number, r: number] | null;
  /** 60 mm mortar: 'external' on the roof (Mk 1) or 'internal' (Mk 2 onward, its roof port), at x, z. */
  readonly mortar: readonly ['external' | 'internal', number, number];
  /** Sight heads on the roof: x, z, width, height, depth, with an armoured hood when `hood`. */
  readonly sights: readonly { readonly x: number; readonly z: number; readonly w: number; readonly h: number;
    readonly d: number; readonly hood: boolean }[];
  /** Smoke discharger banks: per side, the bank's x, y, z, its yaw outward, the tube count and their pitch. */
  readonly smoke: { readonly x: number; readonly y: number; readonly z: number; readonly yaw: number; readonly tubes: number;
    readonly rows: number };
  /** The bustle basket: rear of the bustle (z0) to the basket's rear (z1), half-width, floor and rail heights. */
  readonly basket: { readonly z0: number; readonly z1: number; readonly halfWidth: number; readonly floor: number;
    readonly rail: number; readonly sideZ0: number };
  /** The ball-and-chain curtain under the basket's rear (null on the Mk 1 as built; the Mk 1B carries it). */
  readonly chains: { readonly z: number; readonly halfWidth: number; readonly y: number; readonly drop: number } | null;
  /** Roof machine-gun stations: x, z, rest yaw. */
  readonly roofGuns: readonly (readonly [x: number, z: number, yaw: number])[];
  /** Whip antennas: x, z, height. */
  readonly antennas: readonly (readonly [x: number, z: number, h: number])[];
  /** Turret-side stowage bins (+X side, mirrored): z0, z1, y0, y1, depth. */
  readonly bins: readonly (readonly [z0: number, z1: number, y0: number, y1: number, depth: number])[];
}

const mirror = (ring: SectionPoint[]): SectionPoint[] => ring.map(([x, y]): SectionPoint => [-x, y]).reverse();

/** The shell at a station as one CCW ring: base, shoulder, roof edge and crown, both sides. */
function shellRing(s: TurretStation): SectionPoint[] {
  const [bw, by] = s.base, [sw, sy] = s.shoulder, [rw, ry] = s.roof;
  const c = Math.min(0.035, (sy - by) * 0.25);
  const [ew, ey] = s.ear ?? [bw + (sw - bw) * 0.5, by + c + (sy - by - c) * 0.5];
  return [
    [-bw + c, by], [bw - c, by], [bw, by + c], [ew, ey], [sw, sy], [rw, ry], [0, s.crown],
    [-rw, ry], [-sw, sy], [-ew, ey], [-bw, by + c],
  ];
}

/** The shell's half-width at height y and station z (linear in the station's own side line), for seating parts. */
export function turretSideAt(spec: MerkavaTurretSpec, z: number, y: number): number {
  const sh = spec.shell;
  let k = 0;
  while (k + 2 < sh.length && sh[k + 1]!.z < z) k++;
  const a = sh[k]!, b = sh[Math.min(k + 1, sh.length - 1)]!;
  const t = Math.min(1, Math.max(0, (z - a.z) / Math.max(1e-6, b.z - a.z)));
  const at = (s: TurretStation): number => {
    const pts = [s.base, s.ear ?? s.base, s.shoulder, s.roof].filter((p, i, a) => i === 0 || p[1] > a[i - 1]![1]);
    if (y <= pts[0]![1]) return pts[0]![0];
    for (let i = 1; i < pts.length; i++) {
      if (y <= pts[i]![1]) {
        const u = (y - pts[i - 1]![1]) / Math.max(1e-6, pts[i]![1] - pts[i - 1]![1]);
        return pts[i - 1]![0] + (pts[i]![0] - pts[i - 1]![0]) * u;
      }
    }
    return pts[pts.length - 1]![0];
  };
  return at(a) + (at(b) - at(a)) * t;
}

/** The roof's height under (x, z) (the crown line falling to the roof edge), for seating roof equipment. */
export function turretRoofAt(spec: MerkavaTurretSpec, x: number, z: number): number {
  const sh = spec.shell;
  let k = 0;
  while (k + 2 < sh.length && sh[k + 1]!.z < z) k++;
  const a = sh[k]!, b = sh[Math.min(k + 1, sh.length - 1)]!;
  const t = Math.min(1, Math.max(0, (z - a.z) / Math.max(1e-6, b.z - a.z)));
  const at = (s: TurretStation): number => {
    const u = Math.min(1, Math.abs(x) / Math.max(1e-6, s.roof[0]));
    return s.crown + (s.roof[1] - s.crown) * u;
  };
  return at(a) + (at(b) - at(a)) * t;
}

function moduleGeometry(m: TurretModule, side: 1 | -1): THREE.BufferGeometry {
  const sections: SolidSection[] = m.stations.map((s) => {
    const ring: SectionPoint[] = [s.inner, s.outerLow, s.outerHigh, s.innerHigh];
    return { z: s.z, ring: side > 0 ? ring : mirror(ring) };
  });
  return sectionSolid(sections, { sideQuadDiagonal: 'convex' });
}

/** The outer face's x at (z, y) of a module (linear between its stations), for its bolt heads. */
function moduleFaceAt(m: TurretModule, z: number, y: number): number {
  const st = m.stations;
  let k = 0;
  while (k + 2 < st.length && st[k + 1]!.z < z) k++;
  const a = st[k]!, b = st[Math.min(k + 1, st.length - 1)]!;
  const t = Math.min(1, Math.max(0, (z - a.z) / Math.max(1e-6, b.z - a.z)));
  const at = (s: TurretModule['stations'][number]): number => {
    const [x0, y0] = s.outerLow, [x1, y1] = s.outerHigh;
    const u = Math.min(1, Math.max(0, (y - y0) / Math.max(1e-6, y1 - y0)));
    return x0 + (x1 - x0) * u;
  };
  return at(a) + (at(b) - at(a)) * t;
}

/** The cast shell, its ring collar and the bolted modules. Modules are the spec's removable turret plates. */
export function buildMerkavaTurretShell(P: TankBuilderPort, spec: MerkavaTurretSpec): void {
  P.add('turret', sectionSolid(spec.shell.map((s) => ({ z: s.z, ring: shellRing(s) })),
    { sideQuadDiagonal: 'convex' }));
  const [ringR, ringH] = spec.ring;
  P.add('turret', KIT.cylY(ringR, ringR + 0.02, ringH, P.q ? 40 : 24), 0, ringH / 2 - 0.02, 0);
  if (!spec.modules.length) return;
  for (const side of [1, -1] as const) {
    // schema-1 plate names (tankIdAliases.ts): the spec registers these as single-use turret plates, its `_R` plate on
    // the +X flank (specHelpers.ts reactivePlate 'right')
    const sector = `merkava_${tankSeedId(P.spec.id)}_turret_era_${side > 0 ? 'R' : 'L'}`;
    P.destructibleCluster(sector, () => {
      for (const m of spec.modules) {
        P.addExternalArmor('turret', moduleGeometry(m, side));
        for (const [z, y] of m.bolts) {
          const x = moduleFaceAt(m, z, y);
          P.addExternalArmor('turret', KIT.cylX(0.022, 0.026, 8), side * (x + 0.006), y, z);
        }
      }
    });
  }
}

function cupola(P: TankBuilderPort, spec: MerkavaTurretSpec): void {
  const { cylY, box } = KIT;
  const [x, z, r, h] = spec.cupola;
  const y = turretRoofAt(spec, x, z) - 0.02;
  const seg = P.q ? 28 : 16;
  P.add('turretCupola', cylY(r, r + 0.04, h, seg), x, y + h / 2, z);
  // vision blocks round the cupola's ring
  const blocks = 7;
  for (let i = 0; i < blocks; i++) {
    const a = Math.PI * 0.15 + (i / (blocks - 1)) * Math.PI * 1.7;
    const bx = x + Math.sin(a) * (r + 0.005), bz = z + Math.cos(a) * (r + 0.005);
    P.add('turretDark', box(0.10, 0.06, 0.035), bx, y + h * 0.62, bz, 0, a, 0);
  }
  // the hatch lid, closed, and its hinge
  P.add('turretHatch', cylY(r - 0.03, r - 0.01, 0.05, seg), x, y + h + 0.025, z);
  P.add('turretDark', box(0.14, 0.04, 0.05), x, y + h + 0.03, z - r + 0.02);
}

function loaderHatch(P: TankBuilderPort, spec: MerkavaTurretSpec): void {
  if (!spec.loaderHatch) return;
  const [x, z, r] = spec.loaderHatch;
  const y = turretRoofAt(spec, x, z);
  P.add('turretHatch', KIT.cylY(r, r + 0.02, 0.06, P.q ? 24 : 14), x, y + 0.01, z);
  P.add('turretDark', KIT.box(0.12, 0.035, 0.05), x, y + 0.045, z + r - 0.02);
}

function mortar(P: TankBuilderPort, spec: MerkavaTurretSpec): void {
  const [kind, x, z] = spec.mortar;
  const y = turretRoofAt(spec, x, z);
  if (kind === 'internal') {
    // the internal 60 mm mortar's roof port: an armoured collar and its cap
    P.add('turretDetail', KIT.cylY(0.09, 0.11, 0.08, 16), x, y + 0.02, z);
    P.add('turretDark', KIT.cylY(0.05, 0.05, 0.02, 12), x, y + 0.065, z);
    return;
  }
  // the Mk 1's external 60 mm mortar on its roof cradle, laid forward
  P.add('turretDetail', KIT.box(0.20, 0.10, 0.26), x, y + 0.04, z);
  P.add('turretDark', KIT.cylZ(0.042, 0.72, 14), x, y + 0.17, z + 0.18, -0.12, 0, 0);
  P.add('turretDark', KIT.cylZ(0.055, 0.06, 14), x, y + 0.13, z - 0.16, -0.12, 0, 0);
}

function sights(P: TankBuilderPort, spec: MerkavaTurretSpec): void {
  const { box } = KIT;
  for (const s of spec.sights) {
    const y = turretRoofAt(spec, s.x, s.z);
    P.add('turretDetail', box(s.w, s.h, s.d), s.x, y + s.h / 2 - 0.01, s.z);
    // its window, dark glass on the head's front
    P.add('turretGlass', box(s.w * 0.7, s.h * 0.38, 0.012), s.x, y + s.h * 0.62, s.z + s.d / 2 + 0.004);
    if (s.hood) P.add('turretDetail', box(s.w + 0.04, 0.03, s.d * 0.7), s.x, y + s.h + 0.005, s.z + s.d * 0.12);
  }
}

function smokeBanks(P: TankBuilderPort, spec: MerkavaTurretSpec): void {
  const { x, y, z, yaw, tubes, rows } = spec.smoke;
  if (tubes <= 0) return;
  for (const side of [1, -1]) {
    const ry = side * yaw;
    // the bank's mounting plate, then its tubes in rows, each with its own forward aperture
    const plate = KIT.box(0.08, 0.10 * rows + 0.04, 0.11 * tubes + 0.06);
    P.add('turretDetail', plate, side * x, y, z, 0, ry, 0);
    for (let row = 0; row < rows; row++) {
      for (let i = 0; i < tubes; i++) {
        const along = (i - (tubes - 1) / 2) * 0.11;
        const tx = side * x + Math.sin(ry) * along * 0 + side * 0.06;
        const tz = z + along;
        const ty = y + (row - (rows - 1) / 2) * 0.10;
        const tube = markSmokeTube(KIT.cylZ(0.040, 0.24, 12));
        P.add('turretDetail', tube, tx + side * 0.02, ty, tz, -0.35, side * 0.55, 0);
      }
    }
  }
}

/** The bustle basket: an open welded frame round the bustle's rear with a floor, corner posts and two rails. */
function basket(P: TankBuilderPort, spec: MerkavaTurretSpec): void {
  const b = spec.basket, { box } = KIT;
  const slot = 'turretOpenLattice';
  const hw = b.halfWidth, depth = b.z0 - b.z1;
  // floor grid
  P.add('turretPaintedDetail', box(hw * 2, 0.025, depth), 0, b.floor, (b.z0 + b.z1) / 2);
  for (const rail of [b.floor + (b.rail - b.floor) * 0.5, b.rail]) {
    P.add(slot, box(hw * 2, 0.03, 0.03), 0, rail, b.z1 + 0.015);
    for (const side of [-1, 1]) P.add(slot, box(0.03, 0.03, b.sideZ0 - b.z1), side * hw, rail, (b.sideZ0 + b.z1) / 2);
  }
  // posts
  const posts = 5;
  for (let i = 0; i < posts; i++) {
    const x = -hw + (i / (posts - 1)) * hw * 2;
    P.add(slot, box(0.03, b.rail - b.floor, 0.03), x, (b.rail + b.floor) / 2, b.z1 + 0.015);
  }
  for (const side of [-1, 1]) {
    for (const z of [b.sideZ0, (b.sideZ0 + b.z1) / 2]) {
      P.add(slot, box(0.03, b.rail - b.floor, 0.03), side * hw, (b.rail + b.floor) / 2, z);
    }
  }
  // stowage riding in it: rolled tarps and boxes, below the rail
  const pale = 'turretCanvasPale';
  P.add(pale, KIT.cylX(0.11, hw * 1.3, 12), -hw * 0.1, b.floor + 0.12, b.z1 + 0.20);
  P.add('turretPaintedDetail', box(0.42, 0.22, 0.30), hw * 0.55, b.floor + 0.12, (b.z0 + b.z1) / 2 + 0.05);
  P.add('turretPaintedDetail', box(0.36, 0.18, 0.28), -hw * 0.55, b.floor + 0.10, (b.z0 + b.z1) / 2 + 0.10);
}

/** The ball-and-chain curtain: a rail under the basket's rear with steel chains, each ending in a ball. */
function chainCurtain(P: TankBuilderPort, spec: MerkavaTurretSpec): void {
  const c = spec.chains;
  if (!c) return;
  P.add('turretOpenLattice', KIT.box(c.halfWidth * 2, 0.035, 0.035), 0, c.y, c.z);
  const jit = (i: number, k: number): number => {
    let h = Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(k + 7, 0x85ebca6b);
    h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
    return (h >>> 0) / 4294967296 - 0.5;
  };
  const span = c.halfWidth * 2 - 0.08, n = Math.max(12, Math.round(span / 0.05)) + 1, pitch = span / (n - 1);
  for (let i = 0; i < n; i++) {
    if (i > 0 && i < n - 1 && jit(i, 1) > 0.40) continue;
    const x = -c.halfWidth + 0.04 + i * pitch + jit(i, 2) * pitch * 0.3;
    const d = c.drop * (1 + jit(i, 3) * 0.3), lean = jit(i, 4) * 0.06, z = c.z + jit(i, 5) * 0.01;
    P.add('turretOpenLatticeDark', KIT.box(0.008, d, 0.008), x + Math.sin(lean) * d / 2, c.y - 0.015 - Math.cos(lean) * d / 2, z, 0, 0, lean);
    const r = 0.02 * (1 + jit(i, 6) * 0.3);
    P.add('turretOpenLatticeDark', KIT.sph(r, 7), x + Math.sin(lean) * d, c.y - 0.015 - Math.cos(lean) * d - r * 0.8, z);
  }
}

function bins(P: TankBuilderPort, spec: MerkavaTurretSpec): void {
  for (const [z0, z1, y0, y1, depth] of spec.bins) {
    for (const side of [1, -1]) {
      const zc = (z0 + z1) / 2, yc = (y0 + y1) / 2;
      const face = turretSideAt(spec, zc, yc);
      P.add('turretPaintedDetail', KIT.box(depth, y1 - y0, z1 - z0), side * (face + depth / 2 - 0.01), yc, zc);
      P.add('turretDark', KIT.box(0.006, 0.012, (z1 - z0) * 0.9), side * (face + depth - 0.008), y1 - 0.05, zc);
    }
  }
}

/** Roof equipment, the working roof machine guns, antennas, basket and chains. */
export function buildMerkavaTurretEquipment(P: TankBuilderPort, spec: MerkavaTurretSpec): void {
  cupola(P, spec);
  loaderHatch(P, spec);
  mortar(P, spec);
  sights(P, spec);
  smokeBanks(P, spec);
  bins(P, spec);
  basket(P, spec);
  chainCurtain(P, spec);
  spec.roofGuns.forEach(([x, z, yaw], i) => {
    // working crew stations (the coordinator's VH.14 ruling: every drawn roof gun works), on the fleet's riding cradle
    const mg = FITTINGS.pintleMG({ mats: P.mats, cls: 'mag', scale: 0.72, seed: 904, tone: 'two-tone', ammo: true,
      shield: false, ring: false, working: true, ridingCradle: true });
    mg.name = `merkavaRoofMag${i + 1}`;
    mg.position.set(x, turretRoofAt(spec, x, z) + 0.002, z);
    mg.rotation.y = yaw;
    P.turretG.add(mg);
  });
  spec.antennas.forEach(([x, z, h], i) => {
    const whip = FITTINGS.antennaWhip({ mats: P.mats, h, seed: 262 + i });
    whip.position.set(x, turretRoofAt(spec, x, z), z);
    P.turretG.add(whip);
  });
}
