// The true T-64 base, built from scratch (owner 2026-10-27: "the t64 bm1m should be designed from scratchh as well and
// serve as inspiratin to properly update our t64s which are not based onn t64s rn"). No T-72 or T-80 donor builder,
// station or casting is used; the release-233 T-64 build is not used either (owner the same day: "that true t64 build
// is bad and i dont wnat u tgo use it").
//
// Measured from the 42manako T-64BM1M print (CC-BY-NC, measurement only, never shipped; sha256 c62063d8507a993c) on
// the T-64 frame (t64Armor.ts: lateral 0.933, heights 0.96, the turret 0.96 about its ring, the hull's length kept),
// and read against cited photographs (docs/references/tanks/t64bm1m.md): the long, low hull under a 64-degree upper
// glacis and a 2 cm nose bar, the deck stepping straight back over the transverse 5TDF to a louvred exhaust across the
// rear plate, deck-height fenders running into the big curved bow mudguards, the six small dual road wheels and four
// return rollers (t64RunningGear.ts), and the low egg-plan cast turret: its cheeks swelling over the ring at mid
// height, the roof rising from the gun to a crown over the hatches, the commander's cupola with the remote NSVT on the
// right, the gunner's sight head ahead of his hatch on the left, the autoloader's case port aft.
//
// Hull frame: ground y 0, +Z bow, +X the vehicle's left. Turret frame: the ring centre on the deck (T64_FRAME).
import { KIT, FITTINGS } from './kit.ts';
import { sectionSolid, type SectionPoint } from './sectionSolid.ts';
import { boxSections, roofSheet, beamBetween, cappedTube } from './measuredPrimitives.ts';
import { markFixedPaintedPanel } from './fixedPaintedPanel.ts';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';
import { mount } from './fittingMount.ts';
import { buildT64RunningGear } from './t64RunningGear.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

const { box, cylX, cylZ, torus } = KIT;
/** An upright turned solid: KIT.cylY takes (top radius, bottom radius, height, segments). */
const cyl = (rTop: number, h: number, segments: number, rBottom = rTop) => KIT.cylY(rTop, rBottom, h, segments);
/** The T-64 frame's ring, trunnion, muzzle and roof (t64Armor.ts T64_DATUMS, the combat frame's numbers), repeated so
 * the lazy builders never import the boot spec module: a lazy importer splits it into a boot chunk of its own (one more
 * request on every page, bundle-budget). t64Foundation.selftest holds the two equal. */
export const T64_FRAME = Object.freeze({
  turretPivot: Object.freeze([0, 1.40, -.10] as const),
  trunnion: Object.freeze([0, 1.713, .62] as const),
  muzzleZ: 5.85,
  structuralRoofM: 2.19,
} as const);
const PIVOT = T64_FRAME.turretPivot, TRUNNION = T64_FRAME.trunnion;

// ---------------------------------------------------------------- hull datums
export const T64_HULL = Object.freeze({
  halfWidth: 1.05, deckY: 1.40, bellyY: .405,
  glacisTopZ: 1.78, noseZ: 2.97, noseTopY: .83, noseBottomY: .806, lowerGlacisZ: 2.33,
  rearZ: -3.212, fenderOuterX: 1.66, fenderFrontZ: 2.40,
});
const H = T64_HULL;
/** The upper glacis's height at z (64 degrees from the vertical, from the deck edge to the nose bar). */
export const t64GlacisY = (z: number): number =>
  H.deckY - (z - H.glacisTopZ) * (H.deckY - H.noseTopY) / (H.noseZ - H.glacisTopZ);
/** A contour wound counter-clockwise (sectionSolid's winding). */
function ccw(ring: SectionPoint[]): SectionPoint[] {
  let area = 0;
  for (let i = 0; i < ring.length; i++) { const [x0, y0] = ring[i], [x1, y1] = ring[(i + 1) % ring.length]; area += x0 * y1 - x1 * y0; }
  return area < 0 ? [...ring].reverse() : ring;
}
export const T64_GLACIS_RAKE = Math.atan((H.deckY - H.noseTopY) / (H.noseZ - H.glacisTopZ));

function hullTub(P: TankBuilderPort): void {
  const W = H.halfWidth;
  // The rear plate stands from y 0.72 and rolls forward under the engine to the belly (the print's rear section).
  P.add('hull', boxSections([
    [H.rearZ, W, H.deckY, .72], [-3.158, W, H.deckY, .672], [-3.05, W, H.deckY, .576], [-2.97, W, H.deckY, .48],
    [-2.885, W, H.deckY, .432], [-2.78, W, H.deckY, H.bellyY], [H.glacisTopZ, W, H.deckY, H.bellyY],
    [H.lowerGlacisZ, W, t64GlacisY(H.lowerGlacisZ), .41], [H.noseZ, W, H.noseTopY, H.noseBottomY],
  ]));
  // The deck plate over the tub, its joint with the glacis, and the turret ring's collar.
  P.add('hull', roofSheet([[H.rearZ, -W, W, H.deckY + .012, H.deckY + .012], [H.glacisTopZ, -W, W, H.deckY + .012, H.deckY + .012]], .012));
  P.add('hull', cyl(1.10, .030, P.q ? 64 : 32), PIVOT[0], H.deckY + .027, PIVOT[2]);
}

function fenders(P: TankBuilderPort, side: number): void {
  const inner = side * (H.halfWidth - .01), outer = side * H.fenderOuterX, l = Math.min(inner, outer), r = Math.max(inner, outer);
  // Deck-height shelves from the rear plate to the bow, then the bow mudguard rolls down round the idler.
  P.addMudguard('t64-fender', 'hull', roofSheet([
    [H.rearZ - .02, l, r, H.deckY - .005, H.deckY - .005], [H.fenderFrontZ, l, r, H.deckY - .005, H.deckY - .005],
  ], .010));
  // The bow mudguard: the shelf's front edge rolls down round the idler to a lip ahead of it (z 3.17, y 0.72), a
  // curved plate lofted across the fender so it keeps its 12 mm through the turn.
  const outerArc: SectionPoint[] = [], innerArc: SectionPoint[] = [];
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI / 2 * (1 - i / 10);
    outerArc.push([2.48 + .69 * Math.cos(a), .72 + .675 * Math.sin(a)]);
    innerArc.push([2.48 + .678 * Math.cos(a), .72 + .663 * Math.sin(a)]);
  }
  const strip: SectionPoint[] = [[H.fenderFrontZ, outerArc[0][1]], ...outerArc, ...innerArc.reverse(), [H.fenderFrontZ, innerArc[innerArc.length - 1][1]]];
  // stations run across the fender (local z = -x); the strip lies in (bow z, height)
  P.addMudguard('t64-bow-mudguard', 'hull', sectionSolid([-r, -l].map(s => ({ z: s, ring: ccw(strip) }))).rotateY(-Math.PI / 2));
  // its turned-down outer side face, 0.22 m deep at the top of the roll and 0.12 m at the lip (the flap in profile)
  const lipOuter: SectionPoint[] = outerArc.map(([z, y]) => [z, y]), lipInner: SectionPoint[] = outerArc.map(([z, y], i) => {
    const a = Math.PI / 2 * (1 - i / 10), depth = .22 - .10 * i / 10;
    return [z - depth * Math.cos(a), y - depth * Math.sin(a)];
  });
  const lip: SectionPoint[] = [...lipOuter, ...lipInner.reverse()];
  P.addMudguard('t64-bow-mudguard-lip', 'hull', sectionSolid([-outer - side * .006, -outer + side * .006].sort((a, b) => a - b)
    .map(s => ({ z: s, ring: ccw(lip) }))).rotateY(-Math.PI / 2));
  // the shelf's turned-down outer lip and its stiffener
  P.addMudguard('t64-fender-lip', 'hull', box(.012, .065, H.fenderFrontZ - H.rearZ + .02), outer - side * .006, H.deckY - .036,
    (H.fenderFrontZ + H.rearZ) / 2);
  // rear mudflap
  P.addMudguard('t64-rear-flap', 'hullRubber', box(Math.abs(r - l) - .06, .34, .016), (l + r) / 2, H.deckY - .175, H.rearZ - .03);
}

/** The rubber-fabric side skirt of the T-64B/BV: painted panels hung from the fender lip over the return run. */
export function t64RubberSkirt(P: TankBuilderPort, side: number, fromZ = -3.05, toZ = 2.33): void {
  const x = side * (H.fenderOuterX + .025);
  P.addMudguard('t64-rubber-skirt', 'hullFixedPaintedBodywork', markFixedPaintedPanel(sectionSolid([
    [fromZ, .78, H.deckY - .02], [toZ, .74, H.deckY - .02],
  ].map(([z, low, top]) => ({ z, ring: [[x - .010, low], [x + .010, low], [x + .010, top], [x - .010, top]] as SectionPoint[] }))),
  't64-rubber-skirt', 'hullRubber'));
  for (let z = fromZ + .55; z < toZ - .2; z += .92) P.addEquipment('hullDetail', box(.020, .30, .024), x + side * .012, 1.18, z);
  // hangers from the fender lip
  for (let z = fromZ + .25; z < toZ; z += .92) P.addEquipment('hullDetail', box(.03, .07, .05), x - side * .012, H.deckY - .05, z);
}

function glacisFittings(P: TankBuilderPort, headlights: 'glacis' | 'mudguard'): void {
  // The V splash board ahead of the driver's hatch, let into the plate along its foot, its top 4.5 cm under the gun's
  // jacket at full depression.
  for (const side of [-1, 1]) P.addEquipment('hullDetail', box(.56, .09, .022), side * .25, t64GlacisY(1.92) + .04, 1.92, 0, side * .44, 0);
  // headlight pairs behind guard bars: on the glacis corners, or (under a full-width package) on the bow mudguards'
  // forward roll, 35 degrees down its turn (on the crown they stood in the gun's path at 22-32 degrees of yaw)
  if (headlights === 'mudguard') {
    for (const side of [-1, 1]) {
      const x = side * 1.36, z = 2.48 + .69 * Math.cos(35 * Math.PI / 180), y = .72 + .69 * Math.sin(35 * Math.PI / 180);
      P.snapGroup('t64-headlight', () => {
        P.addEquipment('hullDetail', box(.24, .05, .14), x, y + .025, z);
        for (const dx of [-.06, .06]) P.addEquipment('hullDetail', markVehicleNightLens(cylZ(.045, .08, 18), 'headlight'), x + dx, y + .085, z + .03);
        for (const dx of [-.10, .10]) P.addEquipment('hullDetail', beamBetween([x + dx, y + .03, z - .06], [x + dx, y + .15, z + .09], .007, 8));
      }, { reachM: .06, mode: 'down' });
    }
  } else for (const side of [-1, 1]) {
    const x = side * .80, z = 2.42;
    P.snapGroup('t64-headlight', () => {
      P.addEquipment('hullDetail', box(.26, .05, .16), x, t64GlacisY(z) + .018, z, T64_GLACIS_RAKE, 0, 0);
      for (const dx of [-.065, .065]) {
        P.addEquipment('hullDetail', markVehicleNightLens(cylZ(.050, .085, 18), 'headlight'), x + dx, t64GlacisY(z) + .085, z + .02);
        P.addEquipment('hullDetail', beamBetween([x + dx, t64GlacisY(z - .10) + .01, z - .10], [x + dx, t64GlacisY(z) + .16, z + .10], .007, 8));
      }
    }, { reachM: .06 });
  }
  // towing eyes on the nose bar and the two glacis lifting lugs
  for (const side of [-1, 1]) {
    P.addEquipment('hullDetail', box(.10, .10, .09), side * .58, .80, H.noseZ + .02);
    P.addEquipment('hullDetail', torus(.055, .018, 16, 6), side * .58, .80, H.noseZ + .085);
    P.addEquipment('hullDetail', torus(.040, .013, 12, 6).rotateX(T64_GLACIS_RAKE), side * .30, t64GlacisY(2.62) + .03, 2.62);
  }
}

function driverStation(P: TankBuilderPort): void {
  // the driver's hatch on the centreline ahead of the turret and his TNPO block, its head 5 cm over the plate: it sits
  // under the bore, which keeps its 6 degrees of depression over it
  P.addHatch('hullDetail', cyl(.27, .035, P.q ? 28 : 14), 0, H.deckY + .03, 1.48);
  P.addEquipment('hullDetail', box(.20, .05, .12), 0, H.deckY + .025, 1.70);
  P.addModuleVisual('optics', 'hullGlass', box(.15, .026, .012), 0, H.deckY + .03, 1.766);
}

function engineDeck(P: TankBuilderPort): void {
  // The 5TDF lies across the hull behind the fighting compartment: the air intake's mesh over the left of the deck
  // behind the ring, the cooling grilles across the stern and the access plates between them.
  P.snapGroup('t64-intake', () => {
    P.addEquipment('hullDetail', box(.92, .045, .56), .42, H.deckY + .035, -1.62);
    for (let i = 0; i < 10; i++) P.addEquipment('hullDark', box(.86, .008, .018), .42, H.deckY + .061, -1.86 + i * .052);
  }, { reachM: .05, mode: 'down' });
  for (const [x, z, w, d] of [[-.52, -2.05, .90, .62], [.46, -2.18, .98, .46]] as const) P.snapGroup('t64-access-plate', () => {
    P.addEquipment('hullDetail', box(w, .018, d), x, H.deckY + .021, z);
    for (const dx of [-w * .36, w * .36]) P.addEquipment('hullDetail', box(.060, .020, .040), x + dx, H.deckY + .036, z + d / 2 - .03);
  }, { reachM: .04, mode: 'down' });
  for (const x of [-.46, .46]) P.snapGroup('t64-cooling-grille', () => {
    P.addEquipment('hullDetail', box(.86, .040, .70), x, H.deckY + .032, -2.80);
    for (let i = 0; i < 12; i++) P.addEquipment('hullDark', box(.80, .006, .016), x, H.deckY + .055, -3.10 + i * .054);
  }, { reachM: .04, mode: 'down' });
  // rear deck's lifting eyes
  for (const x of [-.86, .86]) P.addEquipment('hullDetail', torus(.040, .012, 12, 6), x, H.deckY + .045, -3.08);
}

function rearPlate(P: TankBuilderPort, drums: boolean, log: boolean): void {
  // The exhaust louvre across the rear plate under the deck edge (the 5TDF blows aft): a framed outlet with its vanes.
  const z = H.rearZ - .012;
  P.addEquipment('hullDetail', box(1.92, .025, .060), 0, 1.355, z - .01);
  P.addEquipment('hullDetail', box(1.92, .025, .060), 0, 1.165, z - .01);
  for (const x of [-.96, .96]) P.addEquipment('hullDetail', box(.025, .215, .060), x, 1.26, z - .01);
  for (let i = 0; i < 5; i++) P.addEquipment('hullDark', box(1.88, .010, .050), 0, 1.19 + i * .036, z - .02, -.45, 0, 0);
  // the exhaust shroud over the louvre at the deck edge, 0.19 m aft and across to the mudflaps: from above the stern reads
  // closed from the plate to the beam (no slit between the louvre and the cradles, nor at the hull's corners)
  P.addEquipment('hullDetail', box(2.14, .020, .19), 0, H.deckY - .012, H.rearZ - .092);
  // towing hooks, tail lights and the unditching beam's cradles
  for (const side of [-1, 1]) {
    P.addEquipment('hullDetail', box(.12, .11, .10), side * .70, .80, z - .04);
    P.addEquipment('hullDetail', torus(.052, .017, 14, 6), side * .70, .80, z - .10);
    P.addEquipment('hullDetail', box(.10, .06, .05), side * .88, 1.30, z - .035);
    P.addEquipment('hullGlass', box(.06, .03, .012), side * .88, 1.30, z - .066);
    // the unditching beam's cradles, where it is carried
    if (log) P.addEquipment('hullDetail', box(.08, .13, .17), side * .42, 1.04, z - .085);
  }
  if (log) mount(P, 'hull', FITTINGS.unditchingLog({ mats: P.mats, len: 2.86, r: .115, straps: 2, seed: 64 }), 0, 1.04, z - .20);
  if (drums) for (const side of [-1, 1]) {
    // a 200 L drum on each half of the rear plate, lying across it in its cradle (two arms and a strap)
    const x = side * .52;
    for (const dx of [-.30, .30]) P.addEquipment('hullDetail', box(.05, .05, .34), x + dx, .985, z - .17);
    P.addEquipment('hullDetail', cylX(.29, .88, P.q ? 24 : 12), x, 1.13, z - .31);
    P.addEquipment('hullDark', torus(.296, .010, P.q ? 24 : 12, 4).rotateY(Math.PI / 2), x, 1.13, z - .31);
  }
}

/** Fender stowage stands outside the turret's swept circle (the Nizh blocks reach r 1.75 at y 1.50, the rear racks
 * r 2.2 at y 1.55): nothing on the shelves between z -1.50 and 1.30 rises above them. */
function fenderStowage(P: TankBuilderPort): void {
  // Right shelf: the external fuel tanks; left shelf: the SPTA boxes; each pair of tanks on its two straps. Nothing on the
  // shelves ahead of the turret: the long glacis line runs clear to the bow mudguards.
  for (const [z0, z1] of [[-2.95, -2.30], [-2.22, -1.56]] as const) {
    P.addEquipment('hullDetail', box(.50, .21, z1 - z0), -1.36, H.deckY + .110, (z0 + z1) / 2);
    for (const z of [z0 + .10, z1 - .10]) P.addEquipment('hullDark', box(.52, .020, .030), -1.36, H.deckY + .219, z);
  }
  for (const [z0, z1] of [[-2.95, -2.05], [-1.97, -1.56]] as const)
    P.addEquipment('hullDetail', box(.50, .19, z1 - z0), 1.36, H.deckY + .100, (z0 + z1) / 2);
}

/** The whole hull: tub, fenders, running gear, deck, rear plate and shelves. */
/** drums: two 200 L drums on the rear plate; log: the unditching log across it; mgShield: the gunner shield on the NSVT
 * (the T-64B1V mod. 2022); headlights: on the glacis (default) or on the bow mudguards. */
export interface T64BaseOptions { drums?: boolean; log?: boolean; mgShield?: boolean; headlights?: 'glacis' | 'mudguard' }
export function buildT64Hull(P: TankBuilderPort, options: T64BaseOptions = {}): void {
  P.hullG.position.set(0, 0, 0);
  hullTub(P);
  for (const side of [-1, 1]) fenders(P, side);
  P.gear = buildT64RunningGear(P, KIT);
  glacisFittings(P, options.headlights ?? 'glacis'); driverStation(P); engineDeck(P); rearPlate(P, !!options.drums, options.log !== false); fenderStowage(P);
}

// ---------------------------------------------------------------- turret (turret frame)
// The cast shell's transverse stations: z, half-width at the base, half-width at the cheek line (y 0.187), crown.
// From the print's turret (plan rays at its y 1.50 / 1.65 and the crown map) on the T-64 frame.
const DOME: readonly (readonly [z: number, base: number, cheek: number, top: number])[] = [
  [-1.270, .06, .08, .24], [-1.240, .25, .28, .34], [-1.152, .54, .57, .48], [-1.056, .70, .74, .58],
  [-.960, .80, .86, .65], [-.864, .893, .907, .715], [-.768, .974, .979, .754], [-.672, 1.037, 1.046, .78],
  [-.576, 1.09, 1.094, .79], [-.480, 1.133, 1.142, .782], [-.384, 1.171, 1.171, .782], [-.288, 1.19, 1.19, .768],
  [-.192, 1.205, 1.205, .754], [-.096, 1.219, 1.214, .725], [0, 1.219, 1.219, .706], [.096, 1.205, 1.219, .686],
  [.192, 1.181, 1.219, .662], [.288, 1.157, 1.214, .643], [.384, 1.118, 1.186, .614], [.480, 1.075, 1.138, .59],
  [.576, 1.022, 1.09, .562], [.672, .97, 1.037, .528], [.768, .854, .95, .499], [.864, .739, .826, .466],
  [.960, .557, .71, .427], [1.056, .19, .45, .379], [1.120, .10, .22, .30], [1.140, .02, .06, .24],
];
const CHEEK_Y = .187, CROWN_P = .65, ARC = 24;
function stationAt(z: number): readonly [number, number, number] | null {
  if (z < DOME[0][0] || z > DOME[DOME.length - 1][0]) return null;
  let k = 0; while (k < DOME.length - 2 && DOME[k + 1][0] < z) k++;
  const a = DOME[k], b = DOME[k + 1], f = (z - a[0]) / (b[0] - a[0]);
  return [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f];
}
/** The cast shell's crown height at (x, z) in the turret frame, or null off the shell. */
export function t64DomeHeight(x: number, z: number): number | null {
  const s = stationAt(z); if (!s) return null;
  const [, cheek, top] = s; if (Math.abs(x) > cheek) return null;
  const sinA = Math.sqrt(Math.max(0, 1 - (x / cheek) ** 2));
  return CHEEK_Y + (top - CHEEK_Y) * sinA ** CROWN_P;
}
/** True for a turret-frame point inside the cast shell. */
export function t64DomeContains(x: number, y: number, z: number): boolean {
  const s = stationAt(z); if (!s || y < 0) return false;
  const [base, cheek, top] = s; if (y > top) return false;
  if (y <= CHEEK_Y) return Math.abs(x) <= base + (cheek - base) * y / CHEEK_Y;
  const sinA = ((y - CHEEK_Y) / (top - CHEEK_Y)) ** (1 / CROWN_P);
  return Math.abs(x) <= cheek * Math.sqrt(Math.max(0, 1 - sinA * sinA));
}

function castTurret(P: TankBuilderPort): void {
  P.add('turret', sectionSolid(DOME.map(([z, base, cheek, top]) => {
    const ring: SectionPoint[] = [[-base, 0], [base, 0]];
    for (let i = 0; i <= ARC; i++) {
      const a = i * Math.PI / ARC;
      ring.push([cheek * Math.cos(a), CHEEK_Y + (top - CHEEK_Y) * Math.sin(a) ** CROWN_P]);
    }
    return { z, ring };
  })));
  // the turret's foot over the race: the casting's skirt lip round its base
  P.add('turret', cyl(1.075, .035, P.q ? 64 : 32), 0, .018, -.06);
}

function gunMountAndGun(P: TankBuilderPort): void {
  // the 2A46M-1 in its cast mask (gun frame: the trunnion, +Z along the bore)
  P.gunG.position.set(TRUNNION[0] - PIVOT[0], TRUNNION[1] - PIVOT[1], TRUNNION[2] - PIVOT[2]);
  const muzzle = T64_FRAME.muzzleZ - TRUNNION[2];
  P.add('gunMount', boxSections([[.02, .25, .20, -.24], [.30, .245, .19, -.22], [.44, .20, .155, -.165], [.56, .145, .115, -.105], [.60, .125, .10, -.09]]));
  // coaxial PKT port to the right of the mask
  P.add('gunMount', cylZ(.030, .12, 12), -.20, -.06, .62);
  P.add('gunDark', cylZ(.012, .14, 10), -.20, -.06, .66);
  KIT.buildGun(P, { len: muzzle, r: .083, baseR: .12, sleeve: false, collar: false });
  // thermal sleeve: three jackets with their clamps, the bore evacuator, the last jacket and the muzzle ring
  const z0 = 1.244 - TRUNNION[2], ev0 = 3.489 - TRUNNION[2], ev1 = 4.27 - TRUNNION[2];
  const jackets = [[z0, z0 + .78, .113, .104], [z0 + .80, z0 + 1.58, .104, .094], [z0 + 1.60, ev0 - .06, .094, .088]] as const;
  for (const [a, b, ra, rb] of jackets) P.add('gun', cylZ(rb, b - a, P.q ? 28 : 14, ra), 0, 0, (a + b) / 2);
  for (const [a] of jackets) P.add('gunDark', cylZ(.118, .030, P.q ? 28 : 14), 0, 0, a + .01);
  P.add('gun', cylZ(.106, ev1 - ev0 - .16, P.q ? 28 : 14), 0, 0, (ev0 + ev1) / 2);
  P.add('gun', cylZ(.088, .08, P.q ? 28 : 14, .106), 0, 0, ev0 + .04);
  P.add('gun', cylZ(.106, .08, P.q ? 28 : 14, .088), 0, 0, ev1 - .04);
  P.add('gun', cylZ(.088, muzzle - .30 - ev1, P.q ? 28 : 14, .090), 0, 0, (ev1 + muzzle - .30) / 2);
  P.add('gun', cappedTube(.095, .10, P.q ? 28 : 14), 0, 0, muzzle - .05);
  P.muzzleZ = muzzle;
}

function commanderCupola(P: TankBuilderPort, shield: boolean): void {
  // The commander's rotating cupola on the right of the crown, its hatch, the TKN-3 sight and the remote 12.7 mm NSVT
  // ("Utyos": laid from inside with the hatch shut), the shared NSVT construction on the cupola's ring.
  const x = -.59, z = -.36, roof = t64DomeHeight(x, z) ?? .76;
  P.addCupola('turret', cyl(.37, .095, P.q ? 32 : 16, .39), x, roof + .02, z);
  P.addHatch('turretDetail', cyl(.29, .045, P.q ? 28 : 14), x, roof + .09, z - .03);
  P.addModuleVisual('optics', 'turretDetail', box(.22, .13, .18), x + .02, roof + .12, z + .25);
  P.addModuleVisual('optics', 'turretGlass', box(.16, .06, .012), x + .02, roof + .135, z + .345);
  for (const a of [-1.0, -.45, .45, 1.0]) P.addEquipment('turretDark', box(.07, .045, .05), x + Math.sin(a) * .33, roof + .08, z + Math.cos(a) * .33, 0, a, 0);
  // the Utyos mount's cast housing on the cupola's rear arc: the drive box the gun's cradle turns on, its sight window
  P.addEquipment('turretDetail', box(.36, .30, .32), x - .02, roof + .25, z - .14);
  P.addEquipment('turretDetail', box(.28, .04, .26), x - .02, roof + .42, z - .14);
  P.addModuleVisual('optics', 'turretGlass', box(.10, .05, .012), x + .10, roof + .30, z + .025);
  const mg = FITTINGS.pintleMG({ mats: P.mats, cls: 'nsvt', tone: 'dark', scale: 1, ammo: true, shield,
    remoteControlled: true, ridingCradle: true, feed: 'left', datumBarrel: false, seed: 6464 });
  mg.name = 't64CommanderNsvt';
  mg.position.set(x - .02, roof + .30, z - .14);
  P.turretG.add(mg);
}

function gunnerStation(P: TankBuilderPort): void {
  // The gunner's hatch on the left of the crown and his sight head ahead of it, under its armoured cowl.
  const hx = .52, hz = -.42;
  P.addHatch('turretDetail', cyl(.30, .04, P.q ? 28 : 14), hx, (t64DomeHeight(hx, hz) ?? .74) + .01, hz);
  const sx = .46, sz = .38, sy = t64DomeHeight(sx, sz) ?? .62;
  P.addModuleVisual('optics', 'turretDetail', boxSections([[sz - .14, .13, sy + .17, sy - .02], [sz + .10, .13, sy + .17, sy - .02],
    [sz + .16, .13, sy + .12, sy - .02]]), sx, 0, 0);
  P.addModuleVisual('optics', 'turretGlass', box(.20, .07, .012), sx, sy + .09, sz + .145, -.70, 0, 0);
  P.addEquipment('turretDetail', box(.30, .025, .26), sx, sy + .185, sz - .02);
  // the night sight's head beside it
  P.addModuleVisual('optics', 'turretDetail', cyl(.075, .14, 16), sx + .24, sy + .04, sz - .10);
  P.addModuleVisual('optics', 'turretGlass', box(.09, .06, .012), sx + .24, sy + .09, sz - .02);
}

function crownFittings(P: TankBuilderPort): void {
  // the autoloader's case-ejection port aft on the crown, the ventilator and the antenna bases
  const ex = .04, ez = -.92, ey = t64DomeHeight(ex, ez) ?? .70;
  P.addHatch('turretDetail', box(.38, .035, .32), ex, ey + .005, ez, -.20, 0, 0);
  P.addEquipment('turretDetail', cyl(.10, .07, 16, .12), .10, (t64DomeHeight(.10, .10) ?? .66) + .02, .10);
  for (const [x, z] of [[.36, -1.02], [-.30, -1.00]] as const) {
    const y = t64DomeHeight(x, z) ?? .68;
    mount(P, 'turret', FITTINGS.antennaWhip({ mats: P.mats, h: 1.55, r: .010, seed: x > 0 ? 64 : 46 }), x, y - .01, z);
  }
  // grab rails along the crown's flanks
  for (const side of [-1, 1]) {
    const p0: [number, number, number] = [side * .98, (t64DomeHeight(side * .98, -.70) ?? .5) + .05, -.70];
    const p1: [number, number, number] = [side * 1.04, (t64DomeHeight(side * 1.04, -.15) ?? .5) + .05, -.15];
    P.addEquipment('turretDetail', beamBetween(p0, p1, .012, 8));
    for (const p of [p0, p1]) P.addEquipment('turretDetail', beamBetween([p[0], p[1] - .06, p[2]], p, .012, 8));
  }
}

/** The L-2G infrared searchlight right of the gun, on its bracket from the cheek (the T-64B/BV; the mod. 2017 deletes it). */
export function t64Searchlight(P: TankBuilderPort): void { t64SearchlightAt(P, -.60, .33, 1.52); }
/** The searchlight at a turret-frame seat (its lens's centre), on its arm from the casting ahead of it. */
export function t64SearchlightAt(P: TankBuilderPort, x: number, y: number, z: number): void {
  P.addEquipment('turretDetail', cylZ(.20, .24, P.q ? 28 : 14, .18), x, y, z);
  P.addEquipment('turretDark', torus(.195, .015, P.q ? 28 : 14, 6), x, y, z + .12);
  P.addModuleVisual('optics', 'turretGlass', markVehicleNightLens(cylZ(.18, .012, P.q ? 28 : 14), 'headlight', { searchlight: true }), x, y, z + .122);
  const face = (() => { let lo = .3, hi = 1.3; for (let i = 0; i < 28; i++) { const m = (lo + hi) / 2; if (t64DomeContains(x, y, m)) lo = m; else hi = m; } return lo; })();
  P.addEquipment('turretDetail', box(.10, .10, z - .12 - face + .03), x, y, (face + z - .12) / 2 - .01);
  P.addEquipment('turretDetail', beamBetween([x, .16, face - .02], [x, y - .16, z - .10], .022, 8));
}

/** The base turret on its ring: cast shell, gun and mask, the commander's and gunner's stations and the crown's
 * fittings. A variant adds its armour, smoke and stowage. */
export function buildT64Turret(P: TankBuilderPort, options: T64BaseOptions = {}): void {
  P.turretG.position.set(PIVOT[0], PIVOT[1], PIVOT[2]);
  castTurret(P); gunMountAndGun(P); commanderCupola(P, !!options.mgShield); gunnerStation(P); crownFittings(P);
}

export function buildT64Base(P: TankBuilderPort, options: T64BaseOptions = {}): void {
  buildT64Hull(P, options);
  buildT64Turret(P, options);
  P.topY = T64_FRAME.structuralRoofM - PIVOT[1];
}
