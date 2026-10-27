// The T-64BV pair on the true T-64 base (t64Foundation.ts). Owner 2026-10-27: the T-64BM1M "should be designed from
// scratchh as well and serve as inspiratin to properly update our t64s which are not based onn t64s rn"; Main's brief
// the same day: keep each one's own deltas, the T-64BV's Kontakt-1 and the mod. 2017's 2017 modernisation fittings.
// Until 262 both were the T-72B3 study under this Kontakt-1 layout (owner 2026-10-22: "the ukranian t64bv1 should just
// be its previous model with an updated name", "make our donbas version take cues from a lot of aesthetic
// ennnhancemennts and the era layout from our newer one tho", "now redesignn the russian t64bv1 to be based on the
// ukranian t64bv donbas").
// The layout is the same, re-seated on the T-64's own hull and cast turret: four staggered Kontakt-1 courses on the
// glacis below the V splash board, containers on the leading rubber-skirt panels, the two-tier horseshoe round the
// turret front and a roof row ahead of the hatches, the self-entrenching blade on the lower nose, the 902B banks on
// the turret's left (MilitaryLand: "smoke grenade launchers on the left of the turret"). The T-64BV1 keeps the L-2G
// searchlight, its sensor, turret cage and pack, the OPVT snorkel on the rear box and the rear drums; the mod. 2017
// deletes the searchlight (MilitaryLand: "no IR searchlight") and carries the Donbas field kit and cover.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { beamBetween, blindTube, type Point3 } from './measuredPrimitives.ts';
import { markEraHitFaces, markEraFurniture } from './eraHitFaces.ts';
import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';
import { buildT64Base, t64RubberSkirt, t64DomeContains, t64DomeHeight, t64GlacisY, t64Searchlight, T64_GLACIS_RAKE, T64_HULL } from './t64Foundation.ts';
import { addDonbasFieldCover } from './donbasFieldCover.ts';
import { attachedCage, supportedSensor, strappedPack } from './modernizationFittings.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

const { box, cylX, torus } = KIT;
const UP = new THREE.Vector3(0, 1, 0);

/** One Kontakt-1 container: the reactive body (its +Y face is the hit face) and its bolted lid, oriented by `basis`. */
function k1Brick(P: TankBuilderPort, owner: 'hull' | 'turret', sector: string, basis: THREE.Matrix4, size: Point3): void {
  const [w, th, len] = size;
  // HIGH draws the container's rounded edges; LOW the plain block (the fleet LOW tier's cost rule)
  const body = P.q ? box(w, th, len) : new THREE.BoxGeometry(w, th, len);
  P.destructibleCluster(sector, () => {
    P.addExternalArmor(owner, markEraHitFaces(body, [0, 1, 0]).applyMatrix4(basis));
    P.addExternalArmor(owner, markEraFurniture(box(w * .86, .010, len * .86)).translate(0, th / 2 + .004, 0).applyMatrix4(basis));
  });
}

// ---------------------------------------------------------------- hull (hull frame)
function glacisEra(P: TankBuilderPort): void {
  // Four staggered courses seated on the plate (3 mm into it); the courses stop short of the headlight pairs.
  const n = new THREE.Vector3(0, Math.cos(T64_GLACIS_RAKE), Math.sin(T64_GLACIS_RAKE)), th = .075;
  const rotation = new THREE.Matrix4().makeRotationX(T64_GLACIS_RAKE);
  [2.10, 2.34, 2.58, 2.82].forEach((z, row) => {
    const count = row % 2 ? 5 : 6;
    for (let i = 0; i < count; i++) {
      const x = (i - (count - 1) / 2) * .27;
      if (Math.abs(x) + .12 > .66 && z + .12 > 2.30 && z - .12 < 2.54) continue;
      const p = new THREE.Vector3(x, t64GlacisY(z), z).addScaledVector(n, th / 2 - .003);
      k1Brick(P, 'hull', `glacis_era_${x < 0 ? 'R' : 'L'}`, rotation.clone().setPosition(p), [.24, th, .26]);
    }
  });
}

function skirtEra(P: TankBuilderPort, side: number): void {
  // A container on each leading rubber-skirt panel's face (the skirt's outer face at |x| 1.695).
  const th = .075, x = side * (T64_HULL.fenderOuterX + .035 + th / 2 - .003);
  const rotation = new THREE.Matrix4().makeRotationZ(-side * Math.PI / 2);
  for (const z of [.20, .57, .94, 1.31, 1.68, 2.05])
    k1Brick(P, 'hull', `skirt_era_${side < 0 ? 'R' : 'L'}`, rotation.clone().setPosition(new THREE.Vector3(x, 1.02, z)), [.28, th, .34]);
}

function blade(P: TankBuilderPort): void {
  // The self-entrenching blade across the lower nose plate, 22 mm proud of it.
  const z0 = 2.40, y0 = .46, z1 = T64_HULL.noseZ - .02, y1 = T64_HULL.noseBottomY - .01;
  const rise = Math.atan2(y1 - y0, z1 - z0), t = new THREE.Vector3(0, Math.sin(rise), Math.cos(rise));
  const n = new THREE.Vector3(1, 0, 0).cross(t);
  const mid = new THREE.Vector3(0, (y0 + y1) / 2, (z0 + z1) / 2).addScaledVector(n, .022);
  P.addEquipment('hullDetail', box(2.02, .30, .05).applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), t, n).setPosition(mid)));
}

// ---------------------------------------------------------------- turret (turret frame)
/** The casting's surface at height y on the plan ray at angle a (0 ahead, + toward +X), and its outward normal. */
function castFrame(a: number, y: number): { p: THREE.Vector3; n: THREE.Vector3 } {
  const at = (t: number, h: number) => {
    const dx = Math.sin(t), dz = Math.cos(t); let lo = 0, hi = 2.2;
    for (let i = 0; i < 32; i++) { const r = (lo + hi) / 2; if (t64DomeContains(dx * r, h, dz * r)) lo = r; else hi = r; }
    return new THREE.Vector3(dx * lo, h, dz * lo);
  };
  const p = at(a, y), h = at(a + .02, y).sub(at(a - .02, y)).normalize(), v = at(a, y + .006).sub(at(a, y - .006)).normalize();
  const n = new THREE.Vector3().crossVectors(h, v).normalize();
  if (n.x * p.x + n.z * p.z < 0) n.negate();
  return { p, n };
}

/** One container on the casting: one tilt per tier, let 4 mm into the shell at its nearest corner, on stand-off
 * struts where it stands clear of it. */
function seat(P: TankBuilderPort, p: THREE.Vector3, outward: THREE.Vector3, size: Point3, pitch: number): void {
  const [w, th, len] = size;
  const out = new THREE.Vector3(outward.x, 0, outward.z).normalize(), tangent = new THREE.Vector3().crossVectors(UP, out).normalize();
  const normal = out.clone().multiplyScalar(Math.cos(pitch)).addScaledVector(UP, Math.sin(pitch));
  const along = new THREE.Vector3().crossVectors(tangent, normal);
  const back = [-1, 0, 1].flatMap(a => [-1, 0, 1].map(b => tangent.clone().multiplyScalar(a * w / 2).addScaledVector(along, b * len / 2)));
  let offset = 0;
  while (offset < .25 && back.some(v => { const q = p.clone().addScaledVector(normal, offset).add(v); return t64DomeContains(q.x, q.y, q.z); })) offset += .004;
  const centre = p.clone().addScaledVector(normal, offset - .004 + th / 2);
  k1Brick(P, 'turret', `turret_era_${p.x < 0 ? 'R' : 'L'}`, new THREE.Matrix4().makeBasis(tangent, normal, along).setPosition(centre), size);
  if (offset < .02) return;
  for (const k of [-1, 1]) {
    const foot = p.clone().addScaledVector(tangent, k * w * .30).addScaledVector(normal, -.02);
    P.addEquipment('turretDetail', beamBetween(foot.toArray(), foot.clone().addScaledVector(normal, offset + .024).toArray(), .012, 6));
  }
}

// The horseshoe as plan angles from straight ahead toward each flank: the lower tier upright round the cheeks at y 0.28,
// the upper tier lying at 60 degrees on the crown's shoulder at y 0.47. On -X (the vehicle's right) the BV1's
// searchlight takes the lower places beside the gun; on +X the upper tier stops under the gunner's sight head.
const LOWER_Y = .28, UPPER_Y = .47, UPPER_PITCH = 1.05;
const LOWER_T: Readonly<Record<number, readonly number[]>> = { 1: [.36, .57, .78, .99, 1.20, 1.41], [-1]: [.36, .57, .78, .99, 1.20, 1.41] };
const UPPER_T: Readonly<Record<number, readonly number[]>> = { 1: [.42, .72, 1.12, 1.42], [-1]: [.45, .75, 1.05, 1.35] };
function turretEra(P: TankBuilderPort, searchlight: boolean): void {
  for (const side of [-1, 1]) {
    for (const t of LOWER_T[side]) {
      if (searchlight && side < 0 && t < .5) continue;
      const { p, n } = castFrame(side * t, LOWER_Y); seat(P, p, n, [.24, .075, .30], 0);
    }
    for (const t of UPPER_T[side]) { const { p, n } = castFrame(side * t, UPPER_Y); seat(P, p, n, [.24, .075, .28], UPPER_PITCH); }
  }
  // The roof row ahead of the hatches, clear of the sight head (x > 0.33) on the left.
  for (const x of [-.62, -.38, -.14, .10]) {
    const z = .30, y = t64DomeHeight(x, z);
    if (y === null) continue;
    seat(P, new THREE.Vector3(x, y, z), new THREE.Vector3(0, 0, 1), [.22, .06, .24], 1.26);
  }
}

function smokeLeft(P: TankBuilderPort): void {
  // Two banks of four 902B tubes on the turret's left flank, each on a bracket into the casting.
  for (const [a, y] of [[1.02, .36], [1.48, .40]] as const) {
    const { p, n } = castFrame(a, y);
    const base = p.clone().addScaledVector(n, .10);
    P.addEquipment('turretDetail', box(.12, .14, .34), base.x - n.x * .05, y - .02, base.z - n.z * .05, 0, a, 0);
    for (let i = 0; i < 4; i++) {
      const s = (i - 1.5) * .085, q = base.clone().add(new THREE.Vector3(Math.cos(a), 0, -Math.sin(a)).multiplyScalar(s));
      P.addEquipment('turretDark', markSmokeTube(blindTube(.041, .030, .25, .16, P.q ? 16 : 10), [0, 0, 1], true),
        q.x, y + .08 + (i % 2) * .04, q.z, -.62, a * .55, 0);
    }
  }
}

function rearBox(P: TankBuilderPort): number {
  // The T-64B's stowage box across the turret's rear wall (VictorAnyakin, "T-64B rear", CC BY-SA 4.0).
  const top = .55;
  P.add('turret', box(1.40, top - .20, .45), 0, (top + .20) / 2, -1.33);
  P.addEquipment('turretDark', box(1.30, .008, .012), 0, top + .004, -1.33);
  for (const x of [-.45, .45]) P.addEquipment('turretDetail', box(.06, .05, .025), x, top - .06, -1.565);
  return top;
}

// ---------------------------------------------------------------- each vehicle's own fittings (turret frame)
function bv1Fittings(P: TankBuilderPort): void {
  const top = rearBox(P);
  supportedSensor(P, [.40, .88, -.49], (t64DomeHeight(.40, -.49) ?? .76) - .006);
  attachedCage(P, 'turret', [0, .22, -1.70], 1.64, .40, .30);
  strappedPack(P, 'turret', [.38, .30, -1.70], [.55, .24, .26]);
  // The OPVT snorkel tube strapped across the box's lid.
  const r = .12, z = -1.33;
  P.addEquipment('turretDetail', cylX(r, .95, P.q ? 20 : 12), .035, top + r - .004, z);
  for (const dx of [-.30, .30]) P.addEquipment('turretDark', torus(r + .004, .012, P.q ? 20 : 10, P.q ? 6 : 4).rotateY(Math.PI / 2), .035 + dx, top + r - .004, z);
}

function donbasFittings(P: TankBuilderPort): void {
  rearBox(P);
  // The 2017 kit: the new night sight's armoured box beside the gunner's hatch, a rear cage and pack, two service bins
  // and the digital radio's paired whips.
  supportedSensor(P, [.40, .88, -.49], (t64DomeHeight(.40, -.49) ?? .76) - .006);
  attachedCage(P, 'turret', [0, .22, -1.70], 1.64, .40, .30);
  strappedPack(P, 'turret', [-.38, .30, -1.70], [.55, .24, .26]);
  for (const side of [-1, 1]) {
    const x = side * .74, z = -1.15, y = t64DomeHeight(x, z) ?? .55;
    P.addEquipment('turretDetail', box(.26, .16, .26), x, y + .07, z);
    P.addEquipment('turretDark', KIT.cylY(.009, .013, .62, 10), x, y + .46, z);
  }
}

/** The shared body: the T-64 base, the rubber skirts and the Kontakt-1 layout. */
function buildT64BVBody(P: TankBuilderPort, options: { searchlight: boolean; drums: boolean; log: boolean }): void {
  buildT64Base(P, { drums: options.drums, log: options.log });
  for (const side of [-1, 1]) { t64RubberSkirt(P, side); skirtEra(P, side); }
  glacisEra(P); blade(P);
  turretEra(P, options.searchlight); smokeLeft(P);
  if (options.searchlight) t64Searchlight(P);
}

export function buildT64BV2017(P: TankBuilderPort): void {
  buildT64BVBody(P, { searchlight: false, drums: false, log: false });
  donbasFittings(P);
  addDonbasFieldCover(P);
  P.hullG.userData.familyRebuild = { base: 't64Foundation', revision: 4, variant: 'bv2017',
    features: ['k1-glacis', 'k1-skirt', 'k1-horseshoe', 'k1-roof-row', 'dozer-blade', 'smoke-left', 'field-cover'] };
}

export function buildT64BV1(P: TankBuilderPort): void {
  buildT64BVBody(P, { searchlight: true, drums: true, log: false });
  bv1Fittings(P);
  P.hullG.userData.familyRebuild = { base: 't64Foundation', revision: 4, variant: 'bv1',
    features: ['k1-glacis', 'k1-skirt', 'k1-horseshoe', 'k1-roof-row', 'l2g-searchlight', 'dozer-blade', 'smoke-left', 'opvt-snorkel', 'rear-drums'] };
}
