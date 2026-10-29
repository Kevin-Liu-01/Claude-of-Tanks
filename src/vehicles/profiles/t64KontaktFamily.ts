// The Kontakt-1 T-64s on the true T-64 base (t64Foundation.ts), new tanks in 262. Owner 2026-10-27: the T-64BM1M
// "should be designed from scratchh as well and serve as inspiratin to properly update our t64s", then "i also liked our
// old t64s that are on main and deployed rn so make these new tanks were making fully nnew tnaks": the T-64BV1 and the
// T-64BV mod. 2017 stay as they are (t64bvK1.ts, the T-72B3 study), and the true T-64s are their own vehicles, named
// for real variants (MilitaryLand, T-64 variants):
// - T-64BV (`t64bv`, USSR): the T-64B line with Kontakt-1 and the 902B banks on the turret's left; the L-2G searchlight,
//   the OPVT snorkel on the rear box and two 200 L drums on the rear plate;
// - T-64B1V mod. 2022 (`t64b1v_2022`, Ukraine): the B1V with "updated radio, navigation and communication systems,
//   identifiable by a gunner shield and slat armor"; no IR searchlight (removed from mod. 2017 on).
// The Kontakt-1 package is the dense one the photographs show (Alan Wilson, "T-64BV - Patriot Museum, Kubinka", Commons,
// CC BY-SA 2.0; VoidWanderer, "T-64BV mod 2017, Kyiv 2021, 16", Commons, CC BY-SA 4.0): five courses of containers across
// the glacis below the V splash board, a three-row grid over the leading two thirds of each skirt, a continuous collar of
// upright containers round the turret face with a tilted tier on the shoulder above it, and a roof row ahead of the hatches.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { beamBetween, blindTube, type Point3 } from './measuredPrimitives.ts';
import { markEraHitFaces, markEraFurniture } from './eraHitFaces.ts';
import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';
import { buildT64Base, t64RubberSkirt, t64DomeContains, t64DomeHeight, t64GlacisY, t64Searchlight, T64_GLACIS_RAKE, T64_HULL } from './t64Foundation.ts';
import { attachedCage, supportedSensor, strappedPack } from './modernizationFittings.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

const { box, cylX, torus } = KIT;
const UP = new THREE.Vector3(0, 1, 0);

/** One Kontakt-1 container (a plain steel box; its +Y face is the hit face) and its bolted lid, oriented by `basis`. */
function k1Brick(P: TankBuilderPort, owner: 'hull' | 'turret', sector: string, basis: THREE.Matrix4, size: Point3): void {
  const [w, th, len] = size;
  P.destructibleCluster(sector, () => {
    P.addExternalArmor(owner, markEraHitFaces(new THREE.BoxGeometry(w, th, len), [0, 1, 0]).applyMatrix4(basis));
    P.addExternalArmor(owner, markEraFurniture(new THREE.BoxGeometry(w * .84, .008, len * .84)).translate(0, th / 2 + .004, 0).applyMatrix4(basis));
  });
}

// ---------------------------------------------------------------- hull (hull frame)
function glacisEra(P: TankBuilderPort): void {
  // Four stepped courses of eight edge to edge between the bow mudguards, each container tilted 12 degrees off the plate
  // like a shingle (its leading edge standing off it), the last course hanging over the nose bar.
  const tilt = 12 * Math.PI / 180, th = .07, len = .26;
  const n = new THREE.Vector3(0, Math.cos(T64_GLACIS_RAKE), Math.sin(T64_GLACIS_RAKE));
  const rotation = new THREE.Matrix4().makeRotationX(T64_GLACIS_RAKE - tilt);
  for (const z of [2.10, 2.34, 2.58, 2.84]) for (let i = 0; i < 8; i++) {
    const x = (i - 3.5) * .252;
    const p = new THREE.Vector3(x, t64GlacisY(z), z).addScaledVector(n, th / 2 + len / 2 * Math.sin(tilt) - .006);
    k1Brick(P, 'hull', `glacis_era_${x < 0 ? 'R' : 'L'}`, rotation.clone().setPosition(p), [.244, th, len]);
  }
}

function skirtEra(P: TankBuilderPort, side: number): void {
  // A three-row grid over the leading two thirds of each skirt (its outer face at |x| 1.695).
  const th = .068, x = side * (T64_HULL.fenderOuterX + .035 + th / 2 - .003);
  const rotation = new THREE.Matrix4().makeRotationZ(-side * Math.PI / 2);
  for (const y of [1.255, 1.08, .905]) for (let i = 0; i < 12; i++) {
    const z = 2.22 - i * .255;
    k1Brick(P, 'hull', `skirt_era_${side < 0 ? 'R' : 'L'}`, rotation.clone().setPosition(new THREE.Vector3(x, y, z)), [.165, th, .24]);
  }
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

/** One container on the casting: one tilt per tier, let 4 mm into the shell at its nearest corner, on stand-off struts
 * where it stands clear of it. */
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
    P.addEquipment('turretDetail', beamBetween(foot.toArray(), foot.clone().addScaledVector(normal, offset + .024).toArray(), .010, 6));
  }
}

// The collar as plan angles from straight ahead toward each flank, one container every 0.12 rad: the upright tier round
// the cheeks at y 0.25, the tilted tier on the shoulder at y 0.45 (60 degrees). The searchlight (when fitted) takes the
// upright places right of the gun; the tilted tier stops under the gunner's sight head on the left.
const LOWER_Y = .25, UPPER_Y = .45, UPPER_PITCH = 1.05;
function turretEra(P: TankBuilderPort, searchlight: boolean): void {
  for (const side of [-1, 1]) {
    for (let a = .32; a <= 1.72; a += .12) {
      if (searchlight && side < 0 && a < .62) continue;
      const { p, n } = castFrame(side * a, LOWER_Y); seat(P, p, n, [.125, .068, .25], 0);
    }
    for (let a = .38; a <= 1.58; a += .12) {
      if (side > 0 && a > .70 && a < 1.06) continue;
      const { p, n } = castFrame(side * a, UPPER_Y); seat(P, p, n, [.125, .060, .20], UPPER_PITCH);
    }
  }
  // the roof row ahead of the hatches, clear of the sight head (x > 0.33)
  for (let x = -.72; x <= .20; x += .13) {
    const z = .30, y = t64DomeHeight(x, z);
    if (y === null) continue;
    seat(P, new THREE.Vector3(x, y, z), new THREE.Vector3(0, 0, 1), [.115, .05, .20], 1.26);
  }
}

function smokeLeft(P: TankBuilderPort): void {
  // Two banks of four 902B tubes on the turret's left flank, behind the collar, each on a bracket into the casting.
  for (const [a, y] of [[1.86, .32], [2.10, .34]] as const) {
    const { p, n } = castFrame(a, y);
    const base = p.clone().addScaledVector(n, .09);
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

// ---------------------------------------------------------------- each vehicle's own fittings
function bvFittings(P: TankBuilderPort): void {
  const top = rearBox(P);
  supportedSensor(P, [.40, .88, -.49], (t64DomeHeight(.40, -.49) ?? .76) - .006);
  attachedCage(P, 'turret', [0, .36, -1.76], 1.64, .40, .20);
  strappedPack(P, 'turret', [.38, .31, -1.665], [.55, .24, .17]);   // in the rack behind the box
  // The OPVT snorkel tube strapped across the box's lid.
  const r = .12, z = -1.33;
  P.addEquipment('turretDetail', cylX(r, .95, P.q ? 20 : 12), .035, top + r - .004, z);
  for (const dx of [-.30, .30]) P.addEquipment('turretDark', torus(r + .004, .012, P.q ? 20 : 10, P.q ? 6 : 4).rotateY(Math.PI / 2), .035 + dx, top + r - .004, z);
}

/** A slat screen: vertical bars between a top and bottom rail, standing off its receiving stock on posts. */
function slatScreen(P: TankBuilderPort, owner: 'hull' | 'turret', from: Point3, to: Point3, height: number, posts: readonly Point3[]): void {
  const slot = `${owner}Detail`, a = new THREE.Vector3(...from), b = new THREE.Vector3(...to), d = b.clone().sub(a), len = d.length();
  for (const dy of [0, height]) P.addEquipment(slot, beamBetween([a.x, a.y + dy, a.z], [b.x, b.y + dy, b.z], .014, 6));
  const bars = Math.max(2, Math.round(len / .10));
  for (let i = 0; i <= bars; i++) {
    const q = a.clone().addScaledVector(d, i / bars);
    P.addEquipment(slot, box(.010, height, .028).rotateY(Math.atan2(d.x, d.z)), q.x, q.y + height / 2, q.z);
  }
  for (const [fx, fy, fz] of posts) {
    const t = Math.max(0, Math.min(1, new THREE.Vector3(fx, fy, fz).sub(a).dot(d) / (len * len)));
    const q = a.clone().addScaledVector(d, t);
    P.addEquipment(slot, beamBetween([fx, fy, fz], [q.x, q.y + height * .5, q.z], .016, 6));
  }
}

function mod2022Fittings(P: TankBuilderPort): void {
  rearBox(P);
  // updated radio, navigation and communication (MilitaryLand): the digital radio's two sets in armoured boxes either
  // side of the rear box (the crown's whips are theirs), the satellite-navigation puck on its mast, and the night sight's
  // armoured box beside the gunner's hatch
  supportedSensor(P, [.40, .88, -.49], (t64DomeHeight(.40, -.49) ?? .76) - .006);
  for (const side of [-1, 1]) {
    const x = side * .74, z = -1.15, y = t64DomeHeight(x, z) ?? .55;
    P.addEquipment('turretDetail', box(.20, .12, .20), x, y + .05, z);
    P.addEquipment('turretDark', box(.06, .03, .06), x, y + .125, z);
  }
  P.addEquipment('turretDetail', KIT.cylY(.012, .014, .22, 8), -.18, (t64DomeHeight(-.18, -1.02) ?? .62) + .11, -1.02);
  P.addEquipment('turretDark', KIT.cylY(.055, .055, .03, 14), -.18, (t64DomeHeight(-.18, -1.02) ?? .62) + .235, -1.02);
  // slat armour round the turret rear (on posts from the rear box) and across the engine compartment's stern and quarters
  slatScreen(P, 'turret', [-.95, .18, -1.88], [.95, .18, -1.88], .42, [[-.55, .30, -1.56], [.55, .30, -1.56]]);
  for (const side of [-1, 1]) slatScreen(P, 'turret', [side * .95, .18, -1.88], [side * 1.12, .18, -1.10], .42, [[side * .70, .30, -1.40]]);
  const zR = T64_HULL.rearZ;
  // the stern screen against the beam's back and the quarters' just outside the rubber skirt, from the mudflaps forward:
  // from above they meet the hull with no enclosed gap (the stern corners stay open)
  slatScreen(P, 'hull', [-1.62, 1.00, zR - .335], [1.62, 1.00, zR - .335], .46, [[-1.0, 1.20, zR - .02], [0, 1.20, zR - .02], [1.0, 1.20, zR - .02]]);
  for (const side of [-1, 1]) slatScreen(P, 'hull', [side * 1.705, 1.00, zR - .03], [side * 1.705, 1.00, -1.95], .46,
    [[side * (T64_HULL.fenderOuterX - .02), T64_HULL.deckY - .03, -2.40], [side * (T64_HULL.fenderOuterX - .02), T64_HULL.deckY - .03, -3.00]]);
}

/** The shared body: the T-64 base, the rubber skirts and the Kontakt-1 package. */
function buildT64KontaktBody(P: TankBuilderPort, options: { searchlight: boolean; drums: boolean; log: boolean; mgShield: boolean }): void {
  buildT64Base(P, { drums: options.drums, log: options.log, mgShield: options.mgShield, headlights: 'mudguard' });
  for (const side of [-1, 1]) { t64RubberSkirt(P, side); skirtEra(P, side); }
  glacisEra(P); blade(P);
  turretEra(P, options.searchlight); smokeLeft(P);
  if (options.searchlight) t64Searchlight(P);
}

export function buildT64BV(P: TankBuilderPort): void {
  buildT64KontaktBody(P, { searchlight: true, drums: true, log: false, mgShield: false });
  bvFittings(P);
  P.hullG.userData.familyRebuild = { base: 't64Foundation', revision: 1, variant: 'bv',
    features: ['k1-glacis', 'k1-skirt-grid', 'k1-collar', 'k1-roof-row', 'l2g-searchlight', 'dozer-blade', 'smoke-left', 'opvt-snorkel', 'rear-drums'] };
}

export function buildT64B1V2022(P: TankBuilderPort): void {
  buildT64KontaktBody(P, { searchlight: false, drums: false, log: true, mgShield: true });
  mod2022Fittings(P);
  P.hullG.userData.familyRebuild = { base: 't64Foundation', revision: 1, variant: 'b1v2022',
    features: ['k1-glacis', 'k1-skirt-grid', 'k1-collar', 'k1-roof-row', 'dozer-blade', 'smoke-left', 'digital-radio', 'satnav', 'gunner-shield', 'slat-armour'] };
}
