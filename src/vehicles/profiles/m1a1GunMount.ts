// Kevin B. Liu — M1A1 gun shield and M256 cannon, measured from the owner's model (release 268 builder E).
// The shield fills the narrow slot between the cheeks (its face bulging forward at the gun axis, its top on the turret
// roof's forward course, its rear a rotor arc that turns in the turret's elevation recess); the round collar and the
// coax tube stand out of it; the cannon is lathed to the model's stations: thermal sleeve, band, bore evacuator,
// barrel and the slimmer muzzle end. Gun-local metres (trunnion origin, +z along the bore). Measurements:
// abrams-bradley-268-evidence/m1fid/measure.md (the source never enters the repository).
import * as THREE from 'three';
import {KIT} from './kit.ts';

interface GunMountPort {
  readonly q: boolean;
  add(slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addGunExtra(geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addGunExtraDark(geometry: THREE.BufferGeometry, ...transform: number[]): void;
}

/** Shield half-width: the slot's 0.319 less a 12 mm running gap at each cheek. */
const SHIELD_HALF_W = 0.307;
/** The turret roof's forward course in gun-local coordinates (y = ROOF_Y0 - ROOF_K z at rest). */
export interface M1A1ShieldRoof { readonly y0: number; readonly k: number }

/** Shield side profile (z, y): flat bottom, the model's bulged face, the roof course on top, a rotor arc behind that
 * stays `rotorR` from the trunnion (the fixed recess is 18 mm larger). */
function shieldProfile(roof: M1A1ShieldRoof, rotorR: number, segments: number): THREE.Shape {
  const yBottom = -0.265;
  const face: readonly (readonly [number, number])[] = [[0.31, yBottom], [0.35, -0.175], [0.39, -0.075], [0.42, 0],
    [0.39, 0.075], [0.35, 0.125], [0.32, 0.175], [0.28, 0.225]];
  const topFrontZ = 0.25, topFront: readonly [number, number] = [topFrontZ, roof.y0 - roof.k * topFrontZ];
  // the rear end of the roof course: on the rotor circle
  const a = 1 + roof.k * roof.k, b = -2 * roof.k * roof.y0, c = roof.y0 * roof.y0 - rotorR * rotorR;
  const zTop = (-b - Math.sqrt(b * b - 4 * a * c)) / (2 * a), yTop = roof.y0 - roof.k * zTop;
  const zBottom = -Math.sqrt(rotorR * rotorR - yBottom * yBottom);
  const shape = new THREE.Shape();
  shape.moveTo(zBottom, yBottom);
  for (const [z, y] of face) shape.lineTo(z, y);
  shape.lineTo(topFront[0], topFront[1]);
  shape.lineTo(zTop, yTop);
  const a0 = Math.atan2(yTop, zTop), a1 = Math.atan2(yBottom, zBottom) + Math.PI * 2;
  for (let i = 1; i < segments; i++) {
    const ang = a0 + (a1 - a0) * (i / segments);
    shape.lineTo(rotorR * Math.cos(ang), rotorR * Math.sin(ang));
  }
  shape.closePath();
  return shape;
}

/** Bands of revolution about +z from an (r, z) profile: smooth round the bore, crisp at every station. */
export function latheBands(profile: readonly (readonly [number, number])[], segments: number): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [];
  for (let i = 0; i + 1 < profile.length; i++) {
    const [r0, z0] = profile[i], [r1, z1] = profile[i + 1];
    const dr = r1 - r0, dz = z1 - z0, len = Math.hypot(dr, dz);
    if (len < 1e-9) continue;
    const nr = dz / len, nz = -dr / len; // outward normal of the profile segment (for r increasing outward)
    for (let k = 0; k < segments; k++) {
      const t0 = (k / segments) * Math.PI * 2, t1 = ((k + 1) / segments) * Math.PI * 2;
      const c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
      const p = (r: number, z: number, c: number, s: number): number[] => [r * c, r * s, z];
      const n = (c: number, s: number): number[] => [nr * c, nr * s, nz];
      const A = p(r0, z0, c0, s0), B = p(r0, z0, c1, s1), C = p(r1, z1, c1, s1), D = p(r1, z1, c0, s0);
      // outward winding (A, B, C) + (A, C, D); a band that starts or ends on the axis keeps its one real triangle
      if (r0 > 1e-9) for (const [v, cc, ss] of [[A, c0, s0], [B, c1, s1], [C, c1, s1]] as const) { pos.push(...v); nor.push(...n(cc, ss)); }
      if (r1 > 1e-9) for (const [v, cc, ss] of [[A, c0, s0], [C, c1, s1], [D, c0, s0]] as const) { pos.push(...v); nor.push(...n(cc, ss)); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  const uv: number[] = [];
  for (let i = 0; i < pos.length; i += 3) uv.push(pos[i + 2], Math.atan2(pos[i + 1], pos[i]));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeBoundingBox();
  return g;
}

/** The M256 to the model's stations (gun-local z = world z − 1.91 on the model): a hidden root (r 0.110) from the breech
 * collar behind the trunnion (z −0.075, where the stock tube's root began) through the shield's passage and the collar,
 * thermal sleeve r 0.146, band 0.158, the tube under the bore evacuator, its collar 0.145, the barrel 0.110 and the
 * slimmer muzzle end 0.091 to the muzzle at `len`. */
export function m1a1CannonGeometry(len: number, segments: number): THREE.BufferGeometry {
  return latheBands([[0, -0.075], [0.110, -0.075], [0.110, 0.86], [0.146, 0.86], [0.146, 1.16], [0.158, 1.165],
    [0.158, 1.255], [0.110, 1.255], [0.110, 1.795], [0.145, 1.80], [0.145, 1.885],
    [0.120, 1.905], [0.110, 1.915], [0.110, len - 0.32], [0.091, len - 0.305], [0.091, len], [0, len]], segments);
}

/** The model's bore evacuator (release 268 builder E, the A/B fix round: sliced at 5 cm from the source, half-width
 * 0.183, top +0.201, bottom -0.165, z 1.29-1.79 gun-local): r 0.183 about an axis 18 mm over the bore, its tapered
 * ends, and an inner wall (r 0.092, flush with the tube's top) that closes it round the tube. Gun-local metres. */
export function m1a1BoreEvacuatorGeometry(segments: number): THREE.BufferGeometry {
  return latheBands([[0.092, 1.255], [0.168, 1.255], [0.183, 1.28], [0.183, 1.78], [0.168, 1.795], [0.092, 1.795],
    [0.092, 1.255]], segments).translate(0, 0.018, 0);
}

/** The part of a (z, y) contour at or above (keepAbove) / below a level y = c (Sutherland-Hodgman). */
function clipAtY(points: readonly THREE.Vector2[], c: number, keepAbove: boolean): THREE.Vector2[] {
  const inside = (p: THREE.Vector2): boolean => (keepAbove ? p.y >= c : p.y <= c);
  const out: THREE.Vector2[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    if (inside(a)) out.push(a);
    if (inside(a) !== inside(b)) out.push(new THREE.Vector2(a.x + (b.x - a.x) * (c - a.y) / (b.y - a.y), c));
  }
  return out;
}
/** Shield passage half-width: the recoiling root (r 0.110) runs through it; the collar (r 0.172) covers its corners. */
const PASSAGE = 0.121;

export function buildM1A1GunMount(P: GunMountPort, searchlight: boolean, roof: M1A1ShieldRoof): void {
  const segments = P.q ? 32 : 20;
  // The shield: one casting across the slot (face, roof course, rotor arc), cut by the gun's square passage: two cheeks
  // of the casting either side of it and its crown and sill above and below.
  const contour = shieldProfile(roof, 0.342, P.q ? 12 : 8).getPoints();
  if (contour.length > 2 && contour[0].distanceTo(contour[contour.length - 1]) < 1e-9) contour.pop();
  const extrude = (pts: readonly THREE.Vector2[], x0: number, x1: number): THREE.BufferGeometry =>
    new THREE.ExtrudeGeometry(new THREE.Shape([...pts]), { depth: x1 - x0, steps: 1, bevelEnabled: false })
      .rotateY(-Math.PI / 2).translate(x1, 0, 0);
  P.addGunExtra(extrude(contour, -SHIELD_HALF_W, -PASSAGE));
  P.addGunExtra(extrude(contour, PASSAGE, SHIELD_HALF_W));
  P.addGunExtra(extrude(clipAtY(contour, PASSAGE, true), -PASSAGE, PASSAGE));
  P.addGunExtra(extrude(clipAtY(contour, -PASSAGE, false), -PASSAGE, PASSAGE));
  // The sleeve the barrel runs out of, straight from the shield face to the model's lip ring (sliced from the source,
  // release 268 A/B fix round: r 0.146 from the face to world 2.75, the ring 0.165 to 2.80; the 0.172 drum before it
  // was the face boss's radius): a hollow non-recoiling sleeve, its 0.147 bore taking the 0.146 thermal sleeve in recoil.
  P.addGunExtra(new THREE.LatheGeometry([[0.147, 0.38], [0.150, 0.38], [0.150, 0.84], [0.165, 0.84], [0.165, 0.89],
    [0.147, 0.89], [0.147, 0.38]].map(([r, z]) => new THREE.Vector2(r, z)), segments).rotateX(Math.PI / 2));
  // Coax: the model's tube out of the shield face, above and right (vehicle right) of the collar.
  const coaxX = -0.225, coaxY = 0.145;
  P.addGunExtra(KIT.cylZ(0.038, 0.50, P.q ? 14 : 10), coaxX, coaxY, 0.57);
  P.addGunExtraDark(KIT.cylZ(0.024, 0.012, P.q ? 12 : 8), coaxX, coaxY, 0.8165);
  if (searchlight) {
    // Keep the support in the central bay until it is ahead of the longer
    // left cheek, then turn outward into the lamp housing. A direct wide
    // rear block cut through the stationary armor when the gun elevated.
    P.addGunExtra(KIT.box(.055, .10, .40), -.285, .04, .46);
    P.addGunExtra(KIT.box(.310, .14, .16), -.435, .04, .63);
  }
}
