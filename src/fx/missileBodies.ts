/**
 * missileBodies.ts — the airframes of the guided missiles and rockets in flight (FX lane, 2026-10-15; the coordinator's
 * brief: calibre-true Kornet / TOW / Spike-style bodies with fins, a nozzle and a seeker nose, matched to each launcher's
 * tube, sitting on the wire and the smoke trail).
 *
 * Before this a missile in flight was one pale eight-sided cylinder of a fixed 1.25 m x 0.17 m scaled per family, unlit.
 * Each look now flies its family's own airframe:
 * - a TOW: a long tandem probe, four pop-out mid-body wings and four tail control fins, the flight motor's two side
 *   nozzles ahead of the wings;
 * - a Kornet: a short precursor probe, two nose canards, four folding wings at the tail, two oblique side nozzles;
 * - a Spike, Javelin or Hellfire: a glass seeker dome, four mid-body wings and four tail fins;
 * - a Konkurs, MILAN or Fagot: a blunt or probed nose and four wrap-around tail wings;
 * - a Malyutka: a pointed warhead and four broad rear wings; a gun-launched Arkan or Shillelagh, an Ataka, a Stinger,
 *   the hypersonic gun round, a micro-missile and a salvo rocket each their own.
 * The round's own calibre sets the diameter (the launcher's tube is built to it), and the family's length-to-calibre
 * ratio the length, so a 70 mm Bulat and a 152 mm Kornet are the same airframe at their true sizes. The nose sits at the
 * round's position; the tail (where the wire leaves, the tracking beacon burns and the trail is born) is `lengthM` behind.
 *
 * The body is lit by the time of day's rig (sceneLight.ts: the light the wire and the trail take): sun, sky and ground
 * on the paint, a glint on the seeker's glass. A roll-stabilised round rolls at its look's roll rate; the others fly
 * with their fins in an X. One InstancedMesh per airframe, one shared program, nothing allocated per frame; an
 * airframe with no round in flight draws nothing.
 */
import * as THREE from 'three';
import { LATE_FX_LAYER } from './layers.ts';
import type { SceneLightUniforms } from './sceneLight.ts';

/** How the nose is shaped: a tandem charge's probe, a blunt cap, a seeker's glass dome, a pointed ogive. */
type NoseKind = 'probe' | 'blunt' | 'seeker' | 'ogive';

/** A set of fins: `n` plates radiating from the body (D = calibre, positions in calibres back from the nose). */
interface FinSet {
  readonly n: number;
  /** tip-to-tip span (calibres) */
  readonly span: number;
  /** root chord: leading and trailing edge (calibres from the nose) */
  readonly root: readonly [number, number];
  /** tip chord as a share of the root, and how far back the tip's leading edge sits (calibres) */
  readonly taper: number;
  readonly sweep: number;
  /** roll offset of the first fin (radians; 0 = in the airframe's X with the others) */
  readonly roll?: number;
}

interface MissileAirframe {
  readonly id: string;
  /** length over calibre (the probe included) */
  readonly ld: number;
  /** the family's calibre (mm) when a round names none */
  readonly calMm: number;
  readonly nose: NoseKind;
  /** a probe's length and radius (calibres; probe noses only) */
  readonly probe?: readonly [number, number];
  /** an ogive's length (calibres) */
  readonly ogive?: number;
  readonly fins: readonly FinSet[];
  /** the flight motor's two side nozzles (calibres from the nose), or none (a rear nozzle) */
  readonly sideNozzles?: number;
}

const X = Math.PI / 4;
const air = (a: MissileAirframe): MissileAirframe => Object.freeze(a);

/** The airframes, by missile look id (missileLooks.ts). Dimensions from the published rounds. */
export const MISSILE_AIRFRAMES: Readonly<Record<string, MissileAirframe>> = Object.freeze({
  // BGM-71 TOW-2A: 152 mm, 1.17 m body with the 0.36 m extended probe; wings 0.46 m, tail fins 0.34 m
  tow: air({ id: 'tow', ld: 10.0, calMm: 152, nose: 'probe', probe: [2.4, 0.17], sideNozzles: 3.7,
    fins: [{ n: 4, span: 3.0, root: [4.6, 6.0], taper: 0.75, sweep: 0.5 }, { n: 4, span: 2.25, root: [8.8, 10.0], taper: 0.6, sweep: 0.4 }] }),
  // 9M133 Kornet: 152 mm, 1.2 m; the precursor's probe, two canards, four folding tail wings 0.46 m
  kornet: air({ id: 'kornet', ld: 7.9, calMm: 152, nose: 'probe', probe: [0.9, 0.22], sideNozzles: 2.2,
    fins: [{ n: 2, span: 1.7, root: [1.4, 2.1], taper: 0.55, sweep: 0.3, roll: 0 }, { n: 4, span: 3.0, root: [6.7, 7.9], taper: 0.85, sweep: 0.15 }] }),
  // 9M113 Konkurs (and Fagot, Metis): 135 mm, 1.165 m; four rear wings 0.468 m
  konkurs: air({ id: 'konkurs', ld: 8.6, calMm: 135, nose: 'probe', probe: [0.8, 0.2], sideNozzles: 3.0,
    fins: [{ n: 4, span: 3.45, root: [7.2, 8.6], taper: 0.8, sweep: 0.25 }] }),
  // MILAN 2: 115 mm, 1.2 m with the probe; four wrap-around tail wings 0.26 m
  milan: air({ id: 'milan', ld: 10.4, calMm: 115, nose: 'probe', probe: [1.8, 0.26], sideNozzles: 4.0,
    fins: [{ n: 4, span: 2.3, root: [8.9, 10.4], taper: 0.9, sweep: 0.1 }] }),
  // 9M14 Malyutka: 125 mm, 0.86 m; four broad rear wings 0.39 m
  mclos: air({ id: 'mclos', ld: 6.9, calMm: 125, nose: 'ogive', ogive: 2.0, sideNozzles: 3.6,
    fins: [{ n: 4, span: 3.15, root: [4.1, 6.6], taper: 0.55, sweep: 1.0 }] }),
  // Type 79 Jyu-MAT: 153 mm, 1.57 m; mid wings and tail fins
  jyumat: air({ id: 'jyumat', ld: 10.3, calMm: 153, nose: 'blunt', sideNozzles: 4.2,
    fins: [{ n: 4, span: 2.6, root: [5.0, 6.6], taper: 0.7, sweep: 0.5 }, { n: 4, span: 2.0, root: [9.2, 10.3], taper: 0.6, sweep: 0.3 }] }),
  // Spike LR / ER / MELLS, Javelin, Jyu-MAT Kai: 130-170 mm, ~9 calibres; the seeker's glass dome
  spike: air({ id: 'spike', ld: 9.2, calMm: 130, nose: 'seeker',
    fins: [{ n: 4, span: 2.6, root: [4.0, 5.6], taper: 0.65, sweep: 0.6 }, { n: 4, span: 2.1, root: [8.1, 9.2], taper: 0.6, sweep: 0.3 }] }),
  // 9M117 Arkan / Bastion (gun-launched): 100 mm, 1.05 m; nose canards, pop-out tail fins, the beam receiver in the tail
  arkan: air({ id: 'arkan', ld: 10.5, calMm: 100, nose: 'probe', probe: [1.0, 0.22],
    fins: [{ n: 4, span: 1.6, root: [1.6, 2.3], taper: 0.6, sweep: 0.2 }, { n: 4, span: 2.0, root: [9.4, 10.5], taper: 0.8, sweep: 0.2 }] }),
  // 9M120 Ataka: 130 mm, 1.83 m; tandem probe, two canards, four folding tail wings 0.31 m
  ataka: air({ id: 'ataka', ld: 14.0, calMm: 130, nose: 'probe', probe: [1.6, 0.2],
    fins: [{ n: 2, span: 1.6, root: [2.0, 2.7], taper: 0.55, sweep: 0.3, roll: 0 }, { n: 4, span: 2.4, root: [12.6, 14.0], taper: 0.85, sweep: 0.2 }] }),
  // MGM-51 Shillelagh: 152 mm, 1.14 m; four long-chord pop-out tail fins
  shillelagh: air({ id: 'shillelagh', ld: 7.5, calMm: 152, nose: 'blunt',
    fins: [{ n: 4, span: 2.0, root: [5.0, 7.5], taper: 0.9, sweep: 0.15 }] }),
  // AGM-114 Hellfire / HJ-10: 178 mm, 1.63 m; the laser seeker's dome, mid-body delta wings, tail controls
  hellfire: air({ id: 'hellfire', ld: 9.2, calMm: 178, nose: 'seeker',
    fins: [{ n: 4, span: 1.85, root: [3.0, 6.0], taper: 0.25, sweep: 2.2 }, { n: 4, span: 1.85, root: [8.3, 9.2], taper: 0.7, sweep: 0.2 }] }),
  // FIM-92 Stinger: 70 mm, 1.52 m; seeker, four canards, four folding tail fins
  stinger: air({ id: 'stinger', ld: 21.7, calMm: 70, nose: 'seeker',
    fins: [{ n: 4, span: 1.5, root: [2.6, 3.4], taper: 0.5, sweep: 0.4, roll: 0 }, { n: 4, span: 1.35, root: [20.2, 21.7], taper: 0.8, sweep: 0.3 }] }),
  // XM1210 MRM (gun-launched, hypersonic): canards and tail fins on a seeker nose
  mrm: air({ id: 'mrm', ld: 8.0, calMm: 130, nose: 'seeker',
    fins: [{ n: 4, span: 1.5, root: [1.4, 2.0], taper: 0.5, sweep: 0.3, roll: 0 }, { n: 4, span: 1.9, root: [7.0, 8.0], taper: 0.8, sweep: 0.2 }] }),
  // a micro-missile: pop-out mid wings and tail fins
  viper: air({ id: 'viper', ld: 6.5, calMm: 140, nose: 'seeker',
    fins: [{ n: 4, span: 2.5, root: [2.6, 3.8], taper: 0.7, sweep: 0.4 }, { n: 4, span: 1.8, root: [5.7, 6.5], taper: 0.7, sweep: 0.2 }] }),
  // a salvo rocket (TOS-1A's 220 mm, 3.3 m): an ogive and small wrap-around tail fins
  rocket: air({ id: 'rocket', ld: 15.0, calMm: 220, nose: 'ogive', ogive: 2.6,
    fins: [{ n: 4, span: 1.45, root: [13.8, 15.0], taper: 0.95, sweep: 0.05 }] }),
});

const DEFAULT_AIRFRAME = 'konkurs';

/** The airframe a look flies (its own, else the commonest kind). */
export function airframeOf(lookId: string | null | undefined): MissileAirframe {
  return MISSILE_AIRFRAMES[lookId ?? ''] ?? MISSILE_AIRFRAMES[DEFAULT_AIRFRAME];
}

/** A round's body: diameter and length (m) from its calibre (mm; 0 or absent: its family's) and its airframe. The body
 *  fills the tube it left (its folded fins inside the bore), 0.94 of the calibre. */
export function missileBodyDims(lookId: string | null | undefined, calMm: number | null | undefined, out: number[]): number[] {
  const a = airframeOf(lookId);
  const cal = calMm != null && calMm > 20 && calMm < 400 ? calMm : a.calMm;
  out[0] = cal * 0.94 / 1000;
  out[1] = cal * a.ld / 1000;
  return out;
}

const _dims = [0, 0];
/** The tail's distance behind the nose (m): where the wire leaves, the beacon burns and the trail is born. */
export function missileTailM(lookId: string | null | undefined, calMm: number | null | undefined): number {
  return missileBodyDims(lookId, calMm, _dims)[1];
}

// ---------------------------------------------------------------------------------------------------------------------
// The geometry: built at true proportions (calibres on every axis) so its normals are right, then its length divided by
// the length-to-calibre ratio, so an instance scaled (diameter, diameter, length) draws it true at any calibre.
// ---------------------------------------------------------------------------------------------------------------------

/** vertex part: rgb a multiplier on the paint, a = gloss */
const PAINT = [1, 1, 1, 0.12] as const;
const DARK = [0.2, 0.19, 0.18, 0.25] as const;
const GLASS = [0.1, 0.12, 0.15, 1] as const;
const BAND = [0.82, 0.78, 0.55, 0.2] as const; // a warhead band, a shade off the paint

interface Parts { pos: number[]; nrm: number[]; part: number[] }

function pushTri(p: Parts, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, na: THREE.Vector3, nb: THREE.Vector3,
  nc: THREE.Vector3, col: readonly number[]): void {
  p.pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  p.nrm.push(na.x, na.y, na.z, nb.x, nb.y, nb.z, nc.x, nc.y, nc.z);
  for (let i = 0; i < 3; i++) p.part.push(col[0], col[1], col[2], col[3]);
}

/** A body of revolution about the z axis from a profile of [radius, z (calibres, nose at 0, the tail negative), part]. */
function lathe(p: Parts, profile: readonly (readonly [number, number, readonly number[]])[], seg: number): void {
  const n = profile.length;
  // profile normals in (r, z): perpendicular to the neighbours' chord, pointing out
  const nr: number[] = [], nz: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = profile[Math.max(0, i - 1)], b = profile[Math.min(n - 1, i + 1)];
    const dr = b[0] - a[0], dz = b[1] - a[1];
    // the tangent runs nose to tail (z falling); its outward normal
    let r = -dz, z = dr;
    const l = Math.hypot(r, z) || 1;
    r /= l; z /= l;
    if (r < 0 || (r === 0 && z < 0)) { r = -r; z = -z; }
    nr.push(r); nz.push(z);
  }
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), D = new THREE.Vector3();
  const nA = new THREE.Vector3(), nB = new THREE.Vector3(), nC = new THREE.Vector3(), nD = new THREE.Vector3();
  for (let i = 0; i < n - 1; i++) {
    const [r0, z0, c0] = profile[i];
    const [r1, z1] = profile[i + 1];
    // a ring sharing its two profile points' normals; a hard edge where the two points coincide in radius and z
    for (let s = 0; s < seg; s++) {
      const t0 = (s / seg) * Math.PI * 2, t1 = ((s + 1) / seg) * Math.PI * 2;
      const c0s = Math.cos(t0), s0s = Math.sin(t0), c1s = Math.cos(t1), s1s = Math.sin(t1);
      A.set(r0 * c0s, r0 * s0s, z0); B.set(r0 * c1s, r0 * s1s, z0);
      C.set(r1 * c1s, r1 * s1s, z1); D.set(r1 * c0s, r1 * s0s, z1);
      nA.set(nr[i] * c0s, nr[i] * s0s, nz[i]); nB.set(nr[i] * c1s, nr[i] * s1s, nz[i]);
      nC.set(nr[i + 1] * c1s, nr[i + 1] * s1s, nz[i + 1]); nD.set(nr[i + 1] * c0s, nr[i + 1] * s0s, nz[i + 1]);
      if (r0 > 1e-5) pushTri(p, A, D, B, nA, nD, nB, c0);
      if (r1 > 1e-5) pushTri(p, B, D, C, nB, nD, nC, c0);
    }
  }
}

/** A flat fin plate (a thin prism) in the plane at roll angle `phi`, root on the body's skin. */
function fin(p: Parts, f: FinSet, phi: number): void {
  const t = 0.035, rr = 0.47, rt = f.span / 2;
  const [l0, l1] = f.root;
  const chord = (l1 - l0) * f.taper;
  const tl0 = l0 + f.sweep, tl1 = tl0 + chord;
  // planform corners (radius, z): root leading, root trailing, tip trailing, tip leading
  const pts: [number, number][] = [[rr, -l0], [rr, -l1], [rt, -tl1], [rt, -tl0]];
  const c = Math.cos(phi), s = Math.sin(phi);
  const off = new THREE.Vector3(-s * t / 2, c * t / 2, 0); // the plate's half thickness, along its normal
  const at = (r: number, z: number, side: number): THREE.Vector3 => new THREE.Vector3(r * c + side * off.x, r * s + side * off.y, z);
  const top = pts.map(([r, z]) => at(r, z, 1)), bot = pts.map(([r, z]) => at(r, z, -1));
  const nUp = off.clone().normalize(), nDn = nUp.clone().negate();
  pushTri(p, top[0], top[1], top[2], nUp, nUp, nUp, PAINT); pushTri(p, top[0], top[2], top[3], nUp, nUp, nUp, PAINT);
  pushTri(p, bot[0], bot[2], bot[1], nDn, nDn, nDn, PAINT); pushTri(p, bot[0], bot[3], bot[2], nDn, nDn, nDn, PAINT);
  // the edges (leading, tip, trailing), each facing away from the plate's middle
  const mid = top.reduce((m, v) => m.add(v), new THREE.Vector3()).multiplyScalar(0.25);
  const e = new THREE.Vector3(), em = new THREE.Vector3();
  for (const [i, j] of [[3, 0], [2, 3], [1, 2]] as const) {
    e.subVectors(top[j], top[i]).cross(nUp).normalize();
    em.addVectors(top[i], top[j]).multiplyScalar(0.5).sub(mid);
    if (e.dot(em) < 0) e.negate();
    pushTri(p, top[i], bot[i], bot[j], e, e, e, PAINT); pushTri(p, top[i], bot[j], top[j], e, e, e, PAINT);
  }
}

/** The flight motor's two side nozzles: short dark cones canted back and out at `z` (calibres from the nose). */
function sideNozzles(p: Parts, z: number): void {
  for (const phi of [X, X + Math.PI]) {
    const c = Math.cos(phi), s = Math.sin(phi);
    const base = new THREE.Vector3(0.42 * c, 0.42 * s, -z);
    const axis = new THREE.Vector3(c * 0.6, s * 0.6, -0.8).normalize();
    const u = new THREE.Vector3(-s, c, 0).normalize(), v = new THREE.Vector3().crossVectors(axis, u).normalize();
    const seg = 8, len = 0.32, r0 = 0.11, r1 = 0.16;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), cc = new THREE.Vector3(), d = new THREE.Vector3();
    const n0 = new THREE.Vector3(), n1 = new THREE.Vector3();
    for (let k = 0; k < seg; k++) {
      const t0 = (k / seg) * Math.PI * 2, t1 = ((k + 1) / seg) * Math.PI * 2;
      const dir0 = u.clone().multiplyScalar(Math.cos(t0)).addScaledVector(v, Math.sin(t0));
      const dir1 = u.clone().multiplyScalar(Math.cos(t1)).addScaledVector(v, Math.sin(t1));
      a.copy(base).addScaledVector(dir0, r0); b.copy(base).addScaledVector(dir1, r0);
      cc.copy(base).addScaledVector(axis, len).addScaledVector(dir1, r1); d.copy(base).addScaledVector(axis, len).addScaledVector(dir0, r1);
      n0.copy(dir0); n1.copy(dir1);
      pushTri(p, a, d, b, n0, n0, n1, DARK); pushTri(p, b, d, cc, n1, n0, n1, DARK);
    }
  }
}

/** One airframe's geometry (positions in calibres across, lengths over the length): non-indexed, flat parts. */
export function buildAirframeGeometry(a: MissileAirframe, seg = 12): THREE.BufferGeometry {
  const p: Parts = { pos: [], nrm: [], part: [] };
  const L = a.ld;
  const prof: [number, number, readonly number[]][] = [];
  if (a.nose === 'probe') {
    const [pl, pr] = a.probe ?? [1, 0.2];
    prof.push([0, 0, DARK], [pr * 0.7, -0.04, DARK], [pr, -0.12, PAINT], [pr, -pl, PAINT], [pr * 1.6, -pl - 0.06, PAINT],
      [0.4, -pl - 0.22, PAINT], [0.5, -pl - 0.42, PAINT], [0.5, -pl - 0.62, BAND], [0.5, -pl - 0.9, PAINT]);
  } else if (a.nose === 'seeker') {
    for (let i = 0; i <= 5; i++) {
      const t = (i / 5) * (Math.PI / 2);
      prof.push([0.46 * Math.sin(t), -0.46 * (1 - Math.cos(t)), GLASS]);
    }
    prof.push([0.47, -0.5, DARK], [0.5, -0.56, PAINT], [0.5, -1.1, BAND], [0.5, -1.4, PAINT]);
  } else if (a.nose === 'ogive') {
    const ol = a.ogive ?? 2;
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      prof.push([0.5 * Math.sqrt(t * (2 - t)) * (0.08 + 0.92 * t ** 0.35), -ol * t, i === 0 ? DARK : PAINT]);
    }
    prof.push([0.5, -ol - 0.3, BAND], [0.5, -ol - 0.6, PAINT]);
  } else {
    prof.push([0, 0, PAINT], [0.3, -0.03, PAINT], [0.44, -0.12, PAINT], [0.5, -0.3, PAINT], [0.5, -0.7, BAND], [0.5, -1.0, PAINT]);
  }
  // the cylinder to the boat tail, the nozzle and the beacon's dark end
  prof.push([0.5, -(L - 0.45), PAINT], [0.44, -(L - 0.05), PAINT], [0.44, -L, DARK], [0.3, -L, DARK], [0.3, -(L - 0.12), DARK],
    [0, -(L - 0.12), DARK]);
  lathe(p, prof, seg);
  for (const f of a.fins) for (let k = 0; k < f.n; k++) fin(p, f, (f.roll ?? X) + (k * Math.PI * 2) / f.n);
  if (a.sideNozzles) sideNozzles(p, a.sideNozzles);
  // lengths over the length: the instance's (diameter, diameter, length) scale draws it true
  for (let i = 2; i < p.pos.length; i += 3) p.pos[i] /= L;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(p.nrm, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(p.part, 4));
  g.computeBoundingSphere();
  return g;
}

const VERT = /* glsl */ `
attribute vec4 aPart;
varying vec3 vN;
varying vec3 vAlb;
varying float vGloss;
varying vec3 vView;
#ifdef USE_FOG
  varying float vFogDepth;
#endif
void main() {
  // the instance's rotation alone turns the normals: the geometry was built at true proportions and the instance's
  // (diameter, diameter, length) scale restores them, a uniform scale of the true shape
  mat3 R = mat3( normalize( instanceMatrix[ 0 ].xyz ), normalize( instanceMatrix[ 1 ].xyz ), normalize( instanceMatrix[ 2 ].xyz ) );
  vN = normalize( mat3( modelMatrix ) * ( R * normal ) );
  vec3 alb = aPart.rgb;
  #ifdef USE_INSTANCING_COLOR
    alb *= instanceColor;
  #endif
  vAlb = alb;
  vGloss = aPart.a;
  vec4 wp = modelMatrix * instanceMatrix * vec4( position, 1.0 );
  vView = cameraPosition - wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  #ifdef USE_FOG
    vFogDepth = - mvPosition.z;
  #endif
  gl_Position = projectionMatrix * mvPosition;
}
`;

const FRAG = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uSkyCol;
uniform vec3 uGroundCol;
varying vec3 vN;
varying vec3 vAlb;
varying float vGloss;
varying vec3 vView;
#ifdef USE_FOG
  uniform vec3 fogColor;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  varying float vFogDepth;
#endif
void main() {
  vec3 n = normalize( vN );
  vec3 v = normalize( vView );
  if ( dot( n, v ) < 0.0 ) n = -n;
  float ndl = max( dot( n, uSunDir ), 0.0 );
  float up = 0.5 + 0.5 * n.y;
  vec3 amb = uSkyCol * ( 0.3 + 0.7 * up ) + uGroundCol * ( 1.0 - up ) * 0.7;
  vec3 col = vAlb * ( uSunCol * ndl + amb );
  // the glint: a seeker's glass mirrors the sun, the paint only sheens
  vec3 h = normalize( uSunDir + v );
  col += uSunCol * pow( max( dot( n, h ), 0.0 ), mix( 16.0, 120.0, vGloss ) ) * ( 0.03 + 0.6 * vGloss * vGloss ) * step( 0.0, dot( n, uSunDir ) );
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogFactor = 1.0 - exp( -fogDensity * fogDensity * vFogDepth * vFogDepth );
    #else
      float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    #endif
    col = mix( col, fogColor, fogFactor );
  #endif
  gl_FragColor = vec4( col, 1.0 );
}
`;

interface MissileBodies {
  /** the airframes' instanced meshes (the late FX layer) */
  readonly group: THREE.Group;
  readonly material: THREE.ShaderMaterial;
  /** start a frame's bodies */
  begin(): void;
  /** one round: its look, its nose (world), its unit flight direction, its roll (rad), its diameter and length (m) and
   *  its paint (sRGB hex); false when its airframe's pool is full */
  write(lookId: string, nose: THREE.Vector3, dir: THREE.Vector3, roll: number, diameterM: number, lengthM: number,
    hex: number): boolean;
  /** upload the frame's bodies */
  end(): void;
  /** the bodies in flight this frame */
  readonly count: number;
  reset(): void;
}

export function createMissileBodies(light: SceneLightUniforms, capacity: number): MissileBodies {
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), {
      uSunDir: light.uSunDir, uSunCol: light.uSunCol, uSkyCol: light.uSkyCol, uGroundCol: light.uGroundCol,
    }),
    // the fins are plates and the nozzles open cones: both faces draw, the normal turned to the eye
    side: THREE.DoubleSide,
    fog: true,
  });
  const group = new THREE.Group();
  group.name = 'fx-missile-bodies';
  const ids = Object.keys(MISSILE_AIRFRAMES);
  const meshes: THREE.InstancedMesh[] = [];
  const counts = new Int32Array(ids.length);
  const lastCounts = new Int32Array(ids.length);
  const byId = new Map<string, number>();
  const white = new THREE.Color(1, 1, 1);
  ids.forEach((id, k) => {
    const mesh = new THREE.InstancedMesh(buildAirframeGeometry(MISSILE_AIRFRAMES[id]), material, capacity);
    mesh.name = `fx-missile-body-${id}`;
    mesh.count = 0;
    mesh.visible = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = 25;
    mesh.layers.set(LATE_FX_LAYER);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // instance colours from the start: one program for every airframe
    for (let i = 0; i < capacity; i++) mesh.setColorAt(i, white);
    meshes.push(mesh);
    byId.set(id, k);
    group.add(mesh);
  });
  const fallback = byId.get(DEFAULT_AIRFRAME) ?? 0;
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _qr = new THREE.Quaternion(), _s = new THREE.Vector3();
  const _z = new THREE.Vector3(0, 0, 1), _c = new THREE.Color();
  let total = 0;
  return {
    group,
    material,
    begin() { counts.fill(0); total = 0; },
    write(lookId, nose, dir, roll, diameterM, lengthM, hex) {
      const k = byId.get(lookId) ?? fallback;
      const i = counts[k];
      if (i >= capacity) return false;
      _q.setFromUnitVectors(_z, dir);
      _qr.setFromAxisAngle(_z, roll);
      _q.multiply(_qr);
      _s.set(diameterM, diameterM, lengthM);
      _m.compose(nose, _q, _s);
      meshes[k].setMatrixAt(i, _m);
      meshes[k].setColorAt(i, _c.setHex(hex));
      counts[k] = i + 1;
      total++;
      return true;
    },
    end() {
      for (let k = 0; k < meshes.length; k++) {
        const mesh = meshes[k], n = counts[k];
        mesh.count = n;
        mesh.visible = n > 0;
        if (n > 0 || lastCounts[k] > 0) {
          mesh.instanceMatrix.needsUpdate = true;
          if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        }
        lastCounts[k] = n;
      }
    },
    get count() { return total; },
    reset() {
      counts.fill(0); total = 0;
      for (const mesh of meshes) { mesh.count = 0; mesh.visible = false; }
    },
  };
}
