import {buildOplotModern} from './oplotModern.ts';
// Pure family extraction from russia.ts (§5.75). Geometry bytes are unchanged.
import * as THREE from 'three';
import { KIT, FITTINGS, muzzleBore } from './kit.ts';
import { addSovietChevronEra } from './sovietChevronEra.ts';
import {
  loftHull,
  buildT80CastTurret,
  ringSkin,
  domeBoxPlanSeat,
  tubeGun,
  ruSaddle,
  ruGlacisKit,
  ruSkirtBand,
  eraRuCheeks,
} from './russia.ts';
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';

type Vec3Tuple = [number, number, number];
type VehicleAssemblyOwner = 'hull' | 'turret';
type T80Variant = 0 | 1 | 2;

interface DisposableResource {
  dispose(): void;
}

interface T80BuilderPort {
  readonly hullG: THREE.Group;
  readonly turretG: THREE.Group;
  readonly gunG: THREE.Group;
  readonly mats: {
    canvasCloth: THREE.MeshStandardMaterial;
    [role: string]: THREE.Material;
  };
  readonly spec: { id: string; visual: { number?: string } };
  readonly disposables: DisposableResource[];
  muzzleZ?: number;
  topY?: number;
  add(slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addEquipment(slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addGunExtra(geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addGunExtraDark(geometry: THREE.BufferGeometry, ...transform: number[]): void;
  decal(
    owner: VehicleAssemblyOwner,
    kind: string,
    label: string,
    scale: number,
    position: Vec3Tuple,
    ...orientation: number[]
  ): void;
  visualEraCluster(
    key: string,
    owner: VehicleAssemblyOwner,
    build: () => void,
  ): void;
}

interface EraSurfaceSeat {
  readonly x: number;
  readonly z: number;
  readonly surfaceGapM: number;
}

const nonUniformXform = KIT.xform as (
  geometry: THREE.BufferGeometry,
  x: number,
  y: number,
  z: number,
  rotationX: number,
  rotationY: number,
  rotationZ: number,
  scale: number | readonly number[],
) => THREE.BufferGeometry;

function buildT80Line(P: T80BuilderPort, v: T80Variant): void {
  // v: 0 = T-80 (no ERA), 1 = T-80B (brow applique + 902 smokes),
  //    2 = T-80BV (Kontakt-1 field: cheeks via the k1 arc + glacis raft)
  const { box, cylX, cylY, cylZ, buildRunningGear } = KIT;
  const buildT80LineAssemblyStage1 = (): void => {
    loftHull(P, {
      // r26: nose pulled to 3.17 — the ref bow plan is an ARROW (center
      // 3.13-3.16; the wedge/corner kit below carries the diagonals to 3.44).
      // r27 re-phase to the batch-33 compressed ends (fresh gate-faithful
      // probe, proc-frame): the ref bow center now reads 3.02@|x|<0.35 ->
      // 3.09@0.55 -> 3.27@0.80 (nose 3.17 -> 3.05; the corner stacks keep
      // hullLengthM body at 3.41 so dims hold); the ref STERN is an
      // overhanging deck — bottoms rake 0.71@-2.96 -> 1.23@-3.23 -> lip
      // 1.43@-3.36 (the old 0.52@-2.86 belly rake printed 0.25-0.39 err on
      // the three worst side columns of both t80 and t80b).
      deck: [[-3.26, 1.43], [-2.90, 1.41], [-2.55, 1.44], [-1.95, 1.465], [-1.66, 1.503], [-1.36, 1.503], [-1.10, 1.458], [1.25, 1.44], [1.55, 1.452], [1.80, 1.44], [2.00, 1.415], [2.12, 1.345], [2.30, 1.32], [2.44, 1.283], [2.58, 1.232], [2.96, 1.235], [3.05, 1.19]],
      belly: [[-3.26, 1.35], [-3.16, 1.12], [-3.06, 0.90], [-2.96, 0.725], [-2.86, 0.73], [-2.60, 0.44], [2.60, 0.44], [2.88, 0.55], [3.05, 0.72]],
      wUp: [[-3.26, 1.28], [3.05, 1.28]],
      // The BV's inner shoe shoulders finish at |x|=1.04. Pull its lower
      // tub wall 30 mm inboard so the animated connector corners retain a
      // real clearance instead of grazing the hidden belly by 17 mm.
      wLo: [[-3.26, v === 2 ? 1.02 : 1.05], [3.05, 1.02]],
      // First-party track corridor: the sponson underside stays above the
      // native return/suspension envelope along the wheelbase, then rises
      // farther over the sprocket/idler wraps.  The earlier 0.82 m centre
      // floor ran the full 2.56 m upper-hull width through the return lane;
      // decorative skirts hid the filled wheel well in side pixels.  A real
      // T-80 keeps an open wheel well beneath the supported fender shoulders.
      sponsonY: [[-3.26, 1.42], [-2.32, 1.42], [-2.18, 1.24], [2.36, 1.24], [2.46, 1.24], [3.05, 1.24]],
    });
  };
  buildT80LineAssemblyStage1();
  // rear side-hump band (turbine deck): raked top 1.86 -> 1.70, recessed
  // center channel. r26: everything below the 1.24 lip pulls forward of
  // -3.30 — the ref stern fades to an overhanging deck (side col -3.33
  // reads 1.28..1.88). Mask ends stay HARD at ±3.39: the r26a ±3.44
  // extension read hullLengthM 6.93/7.03 by grid phase (dims -9/-22) and
  // was reverted — the certified-long oracle keeps its ~2-col end miss.
  const hy = 0;  // (r25f: BV smallness left as a structural residual — see
                 // the squash post-mortem note at the turret section)
  const buildT80LineHullStage1 = (): void => {
    for (const s of [-1, 1]) {
      // r27 stern re-phase (compressed-ref probe, proc frame): the hump band
      // ends -3.30 (ref top 1.836@-2.98 but only 1.711@-3.36); a full-width
      // LIP STEP carries the -3.30..-3.39 columns at the ref's 1.43..1.71
      // band (y 1.405 keeps the band > the 12% body cut so hullLengthM's
      // rear anchor stays at -3.39) and reaches x 1.76 (ref plan rear -3.35
      // at the ±1.70 column, station-0 width 3.387); the top band gains a
      // 1.79 forward step to -2.845 (ref holds 1.774@-2.86, cliff by -2.73).
      // (r27c: hump rear -3.30 -> -3.27 — its last sliver crossed the -3.276
      // column boundary and printed 1.86 into the -3.34 column whose ref
      // tops at 1.745; the lip deepens to meet it.)
      P.add('hull', box(0.875, 0.45, 0.215), s * 1.2175, 1.635 + hy, -3.1625);  // top 1.86, z -3.27..-3.055
      // (r27b: lip x-span to 1.65 — the fresh front columns prove the ref's
      // lip band ends by x 1.65: front cols ±1.68..1.76 read 1.11-1.23 and
      // only the PLAN ±1.70 column's window catches the outer sliver for its
      // -3.35 rear; a 1.76-wide try printed 1.68 into six front columns, -20
      // pts. r27c: the LEFT print's lip stops at 1.62 — the gate's -1.69
      // plan column reads rear -2.91 on the left while the right reads
      // -3.35 (print asymmetry, t80 fender class).)
      P.add('hull', box(s < 0 ? 0.82 : 0.85, 0.305, 0.12), s * (s < 0 ? 1.21 : 1.225), 1.56 + hy, -3.33);  // lip 1.405..1.71 to -3.39
      P.add('hull', box(0.885, 0.155, 0.11), s * 1.2125, 1.7125 + hy, -2.90);  // 1.79 fwd step z -2.955..-2.845
      // (r27c: plate rear face pulled off the -3.15 column boundary,
      // BODY-EDGE PIN)
      P.add('hull', box(0.90, 0.39, 0.19), s * 1.21, 1.215, -3.045);  // rear plate 1.02..1.41, z -3.14..-2.95
      // fender/stow runs at the 1.21-1.25 line feeding the long mid-deck cols
      // (r27b: widened to x 1.715 — the compressed ref's ±1.66..1.72 front
      // columns read the 1.22-1.23 fender line, not the skirt top)
      // Stop the long fender before the idler climb.  The old z=2.65 end
      // crossed the first two raised shoes; the separate bow shoulders below
      // take over visually from z=2.40.
      // Closed fender cross-section: retain the certified top/outboard
      // silhouette while opening the concealed wheel well for the native
      // return run.  The old solid 455x140 mm bar filled the suspension
      // corridor even though only its cap and edge lip are externally read.
      P.add('hull', box(0.475, 0.030, 4.35), s * 1.4775, 1.245, 0.225);
      P.add('hull', box(0.060, 0.030, 4.35), s * 1.2200, 1.2150, 0.225);
      P.add('hull', box(0.045, 0.125, 4.35), s * 1.6925, 1.1875, 0.225);
    }
    // engine-deck center furniture: louvre field + intake hump on the 1.503
    // plateau, dark grilles (decor; tops stay under the loft plateau line)
    P.add('hullDark', box(1.60, 0.02, 1.05), 0, 1.462, -1.95);
    for (let k = 0; k < 5; k++) P.add('hullDetail', box(1.52, 0.02, 0.05), 0, 1.468, -1.62 - k * 0.15);
    P.add('hull', box(0.95, 0.06, 0.58), 0.40, 1.472, -1.50);
    // glacis dress: splash ridge at the ref's 1.27 brow (z 2.70..2.86), driver
    // periscopes, V-board, headlights, tow eyes
    P.add('hull', box(1.90, 0.045, 0.16), 0, 1.253, 2.78);
    // (r27c: eyeY 0.63 — the default 0.50 tori bottomed 0.40 in the z 3.03
    // window whose compressed-ref floor is 0.525)
    ruGlacisKit(P, { w: 3.0, y: 1.15, z: 2.72, eyeX: 0.82, eyeZ: 3.02, eyeY: 0.82, hookY: 0.82, hookZ: 3.12, hlY: 1.26 });
    // bow fender corners: the ARROW plan — diagonal wedge edges 3.17@x0.40 ->
    // 3.44@x1.30 (ref staircase 3.13/3.22/3.31/3.41), corner shelves at 3.44
    // (half of the certified-long ref corners, inside the 1% grace), and the
    // mudguard tips that own the ref's 0.84 bow floor at z 3.45.
    for (const s of [-1, 1]) {
      // r27: arrow re-lined to the compressed ref (3.02@0.35 -> 3.09@0.55 ->
      // 3.27@0.80, slow-then-steep two-segment diagonal); corner boxes widen
      // to the pub face 1.76 (ref plan front 3.40 at the ±1.70 column).
      P.add('hull', box(0.33, 0.10, 0.05), s * 0.46, 1.11, 3.075, 0, -s * 0.273, 0);
      P.add('hull', box(0.57, 0.10, 0.05), s * 0.83, 1.11, 3.275, 0, -s * 0.624, 0);
      // (r27c: pocket at (0.82, 3.06) — at (0.75, 3.12) its corner printed
      // 3.21 into the ±0.56 plan columns whose ref front is 3.08)
      P.add('hull', box(0.38, 0.07, 0.18), s * 0.82, 1.10, 3.06);   // arrow pocket fill (SSB2 hole cells at +-0.77,3.18)
      // (r27c: corners end 1.745 — 1.76 leaked the ±1.82 plan window whose
      // ref front is the 2.95 skirt line)
      P.add('hull', box(0.945, 0.10, 0.21), s * 1.2725, 1.10, 3.285);    // f 3.39
      P.add('hull', box(0.945, 0.05, 0.10), s * 1.2725, 1.155, 3.34);
      // (r27c: first flap 0.85 -> 0.945 — its 0.70 bottom sat under the
      // compressed ref's 0.795 floor at the z 3.28 window)
      P.add('hullRubber', box(0.34, 0.30, 0.045), s * 1.38, 0.945, 3.30);
      P.add('hullRubber', box(0.34, 0.30, 0.045), s * 1.38, 0.99, 3.3675);
      // r27: rear flaps forward to the compressed ref's stern floor (their
      // 0.87 bottoms at -3.24 printed under the new 1.20 undercut line)
      P.add('hullRubber', box(0.34, 0.26, 0.045), s * 1.36, 1.00, -3.10);
    }
    // rear plate kit: turbine grille + fuel drums + unditching log (owner law).
    // r27: the compressed ref's stern floor moved — bottoms now rake
    // 0.71@-2.96 -> 1.23@-3.23 (was the r26 "0.81-0.87 floor to -3.21"), so
    // the grille/ribs/log/flaps ride the new undercut: everything stays
    // above the belly rake line and the log's 0.87 bottom seats at -3.00
    // where the ref floor is ~0.81-0.85.
    P.add('hullDark', box(1.20, 0.32, 0.05), 0, 1.19, -3.095);
    for (let k = 0; k < 4; k++) P.add('hullDetail', box(1.16, 0.04, 0.05), 0, 1.05 + k * 0.09, -3.085);
    for (const s of [-1, 1]) {
      // (r27c: drums z -3.15 -> -3.12 — their rear sliver crossed the -3.276
      // column boundary and printed 1.83/1.26 into the lip-only -3.34 column)
      P.add('hullDetail', cylY(0.135, 0.135, 0.58, 12), s * 1.02, 1.55, -3.12, 0, 0, s * 0.08);
      P.add('hullDark', cylY(0.14, 0.14, 0.03, 12), s * 1.02, 1.815, -3.13, 0, 0, s * 0.08);
    }
    P.add('hullWood', cylX(0.10, 1.95, 10), 0, 0.97, -3.00);
    for (const s of [-0.5, 0.5]) P.add('hullDark', cylX(0.107, 0.04, 10), s * 1.5, 0.97, -3.00);
  };
  buildT80LineHullStage1();
  const buildT80LineRunningGearStage1 = (): void => {
    KIT.towCable(P, [[-1.02, 1.30, 2.72], [0, 1.34, 2.42], [1.02, 1.30, 2.72]]);
    // §B3.2 DENSITY (owner directive 2026-08-06): common kit FLUSH on the
    // deck lines (t84 recipe — hull mask is hull-only, no tall deck kit).
    // §H.4 VARIANT VARIETY: mirrored seats + seeds per mark so the three
    // T-80s read distinct in the garage.
    {
      const links = FITTINGS.spareTrackLinks({ mats: P.mats, links: 4, width: 0.5, seed: 7 + v });
      links.position.set(v === 1 ? -0.58 : 0.58, 1.395, v === 2 ? 0.30 : 0.60);
      P.hullG.add(links);
      const cable = FITTINGS.towCable({
        mats: P.mats, eyes: false, r: 0.018, seed: 5 + v,
        pts: v === 2
          ? [[0.45, 1.420, 0.95], [0.90, 1.410, 0.35], [0.50, 1.425, -0.25]]
          : v === 1
            ? [[-0.50, 1.432, -0.55], [-0.95, 1.445, -1.15], [-0.60, 1.478, -1.60]]
            : [[0.50, 1.432, -0.55], [0.95, 1.445, -1.15], [0.60, 1.478, -1.60]],
      });
      P.hullG.add(cable);
    }
    // running gear: pt91m r25 corner-pad recipe from birth — flat dies at the
    // ref's ground reads (rear -1.90 / front +2.33), dip zones land inside
    // ground columns, steep diagonals keep the link pads above the strips.
    buildRunningGear(P, {
      // r26: trackW 0.66 -> 0.57 @ xc 1.315 — the ref front view shows BELLY
      // (0.44 floor) at |x| 0.94..1.01; its track band runs |x| 1.03..1.60.
      style: 'dished', wheelR: 0.335, wheelW: 0.21, wheelY: 0.44, xc: 1.345, dishR: 0.80,
      wheelZs: [-1.60, -0.88, -0.16, 0.56, 1.28, 2.00],
      sprocket: { z: -2.55, y: 0.95, r: 0.235 }, idler: { z: 2.72, y: 0.86, r: 0.19 },
      rollers: [-1.24, -0.52, 0.20, 0.92, 1.64].map((z) => ({ z, y: 0.86, r: 0.08 })),
      // r27: botY 0.06 — a corner-pad dip read the whole-mask floor -0.010
      // on t80's grid phase and pushed heightM to 2.225 (0.14% over grace).
      trackW: 0.58, topY: 0.85, botY: 0.06, paintedEnds: true, coveredTop: true, arms: true,
    });
    // The old "gear-fade" bars were hull-owned shadow geometry laid directly
    // through the native shoe path.  The actual linked course and raised
    // terminal loft now own this silhouette; no proxy solids occupy the lane.
    // skirts: outer face at the EXACT pub width (±1.76) but THICK panels
    // (r26: the ref front view fills x 1.64..1.76 — a 0.032 sheet left lerp
    // junk in the 1.68 column), band re-seated to the ref's 0.82..1.17 line.
    // BV: the print wears the short K-1 skirt (front bottom line 1.049).
    // r27: skirt z-window pulled to the compressed ref's outer-column span
    // (plan ±1.75..1.80 cols read z -2.66..2.96 in the ref vs the old
    // -2.93..3.30 band — the two outermost plan columns carried 0.31 err
    // each); yTop 1.16 -> 1.10 (ref front cols ±1.70..1.77 top 1.101).
    ruSkirtBand(P, { x: v === 2 ? 1.744 : 1.71, th: v === 2 ? 0.032 : 0.10, z0: v === 2 ? -2.93 : -2.66, z1: v === 2 ? 3.30 : 2.96, yTop: v === 2 ? 1.23 : 1.10, yBot: v === 2 ? 1.03 : 0.79, panels: 7, lipX: 1.727, dressIn: 0.012, lipY: v === 2 ? 1.045 : 0.805 });
    if (v !== 2) for (const s of [-1, 1]) P.add('hullTrack', box(0.10, 0.37, 0.09), s * 1.67, 1.045, 3.345);
  };
  buildT80LineRunningGearStage1();
  // K-1 skirt front plates (BV only; faces stay inside the pub width)
  const buildT80LineHullStage2 = (): void => {
    if (v === 2) for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
      P.add('hullTrack', box(0.028, 0.42, 0.50), s * 1.745, 0.95, 2.98 - i * 0.55);
    }

    // ---- turret: wide cast dome, crown 2.20 ----
    // (r25f: BV group y/z-squash attempts BOTH regressed — hull and turret
    // rigs squash independently, shearing their mutual registration, and the
    // stations/dims interplay pins the heights. The BV print's ~4.4%
    // under-scale after width normalization stays a structural residual for
    // a certification ruling next round.)
    // The BV uses the same installed ring datum as the accepted Ukrainian BV
    // reference. Its protection is reseated on the casting instead of
    // compensating for a divergent shell by lowering the complete turret.
    P.turretG.position.set(0, 1.45, 0.0);
  };
  buildT80LineHullStage2();
  // r26 dome recalibration from the registered tables: the ref crown is
  // WIDE-FLAT at 2.22-2.25 (raised crown 2.23, +1.4% inside the dims-grace
  // budget) with a LOW front-edge falloff (front cols 2.03@±1.19, 2.07@±1.05
  // — the old rings read 2.11-2.17 there); plan bias cz +0.22. The side
  // 2.16 line at z 1.05..1.35 is NOT the lathe (a revolve cannot hold both
  // views) — the hood step carries it.
  // (r27c: the shared apex is 0.735 — the lathe apex tied the crown box at
  // 2.20 and pinned heightM's p95 with the quantization+pad-dip stack; the
  // crown box remains the single p95 carrier on the bare marks.)
  const turretBodyScaleY = 0.90;
  const previousBVRoofY = 0.06 + (0.75 - 0.06) * 0.90;
  const {
    rings: ringsT, roofDrop, roofTopY,
  } = buildT80CastTurret(P, {
    scaleY: turretBodyScaleY,
    sz: 0.88,
    cz: 0.22,
    curved: v === 2,
    reference: 't80/t80b/ua_t80u_kursk',
    equipmentSeatRevision: v === 2 ? 't80bv-family-reseat-r2' : 'reference-original',
  });
  // Fixed-height armor/equipment follows the crown delta from the rejected
  // seven-ring shell; roof-relative seats inherit it through roofDrop.
  const bvSeatLiftY = v === 2 ? roofTopY - previousBVRoofY : 0;
  const turretSeatY = (y: number): number => y + bvSeatLiftY;
  // Keep the BV chevrons on the lower cast cheek so their two-row V reads
  // cleanly beneath the roof stations instead of riding above the brow.
  const frontChevronY = (y: number): number => turretSeatY(y) + 0.04;
  const roofY = (y: number): number => y - roofDrop;
  // crown plate: the ref roof is FLAT 2.20-2.25 with a falloff beyond — the
  // compressed ref's front profile now falls continuously from ±0.60
  // (2.19@0.54 -> 2.05@1.02 -> 1.96@1.05), which the lathe already tracks;
  // the old 2.04-wide plate printed 2.22 into the ±0.94..1.05 columns
  // (+0.15 err class). Top 2.2215 keeps the heightM p95 anchor over the
  // same 10 side columns.
  // (r27b/c: crown y 0.749 -> 0.72 — MEASURED: the trace reads the crown
  // +1.5 px of MSAA bleed (authored 2.20 read raw 2.217) and heightM
  // stacks the -0.008 pad-dip floor on top (2.225, 0.14% over grace).
  // Authored 2.1925 reads ~2.2175 -> 0.79%, inside grace with margin; the
  // compressed ref's own bodyTop is 2.207, under a mask pixel away.)
  const buildT80LineTurretStage1 = (): void => {
    if (v !== 2) P.add('turret', box(1.24, 0.045, 1.25), 0, roofY(0.72), 0.125);
    // r27: LEFT crown shelf — the compressed ref's falloff is asymmetric
    // (left cols -1.04..-1.20 hold 2.14-2.18 where the right reads 1.96-2.05)
    if (v !== 2) P.add('turret', box(0.36, 0.05, 0.90), -1.06, roofY(0.695), 0.10);
    // hidden turret-node carrier: the ref turret mask bottoms 0.715 (print
    // bakes hull-side kit into the turret node). r27: the two compressed
    // prints DIFFER here — t80's apron zone ends by -0.40 (its old -0.475
    // rear left the -0.48 side column reading 0.62 where the fresh ref
    // bottoms at 1.43, the turret p95 driver) while t80b's print keeps the
    // apron out to -0.47 (trimming it read 0.42 err the other way).
    // (r27b: the t80b apron's FRONT end reaches +1.10 — the +1.04 side column
    // reads its ref bottom at 0.675; the rear -0.44 keeps the -0.35 column.)
    P.add('turretDark', box(1.00, 0.78, v === 1 ? 1.54 : 1.40), 0, -0.40, v === 1 ? 0.33 : 0.30);
    // mantlet hood + saddle root own the ref's 1.94-2.06 side band over
    // z 1.19..1.75; the V-nose dust cover carries 1.9 out to z 1.98.
    if (v === 2) {
      // §B3.1 (prism sweep 2026-08-06): the mantlet block is the cast collar
      // under the boot — elliptical frustum, same plan/side extremes at the
      // center axes (masks read identical rectangles); fold ring inside.
      P.addGunExtra(nonUniformXform(cylZ(0.5, 0.34, 16, 0.465), 0, 0, 0, 0, 0, 0, [0.46, 0.32, 1]), 0, 0.02, 0.72);
      P.addGunExtraDark(nonUniformXform(cylZ(0.5, 0.035, 14), 0, 0, 0, 0, 0, 0, [0.43, 0.295, 1]), 0, 0.015, 0.80);
      // §B3: V-nose dust cover keeps its certified masses + fold-crease
      // strips flush on the faces (canvas grammar, zero growth).
      P.add('turret', box(0.30, 0.20, 0.14), 0, turretSeatY(0.24), 1.70);
      P.add('turret', box(0.56, 0.26, 0.36), 0, turretSeatY(0.22), 1.44);
      P.add('turretDark', box(0.29, 0.02, 0.008), 0, turretSeatY(0.26), 1.766);
      P.add('turretDark', box(0.55, 0.02, 0.008), 0, turretSeatY(0.25), 1.616);
      // §B3.2 (2026-08-06): PKT coax port right of the tube — stub + washer
      // flush-recessed in the V-cover face (all inside its rects).
      P.add('turretDark', KIT.xform(cylZ(0.020, 0.06, 8), 0, 0, 0), 0.17, turretSeatY(0.26), 1.588);
      P.add('turretDark', KIT.xform(cylZ(0.030, 0.012, 10), 0, 0, 0), 0.17, turretSeatY(0.26), 1.612);
      // §B3.1: the right sight is a DRUM (0.26 box -> r 0.13 cylinder:
      // inscribed circle, side/plan rectangles identical) + round lens.
      P.add('turretDetail', KIT.xform(cylZ(0.13, 0.24, 14), 0, 0, 0), 0.55, turretSeatY(0.40), 0.96);
      P.add('turretDark', KIT.xform(cylZ(0.122, 0.014, 14), 0, 0, 0), 0.55, turretSeatY(0.40), 1.082);
      P.add('turretGlass', KIT.xform(cylZ(0.09, 0.02, 14), 0, 0, 0), 0.55, turretSeatY(0.40), 1.09);
    } else {
      // §B3.1 (prism sweep 2026-08-06): boot mass hanging under the hood —
      // elliptical frustum (same extremes), fold ring, clamp hidden under
      // the hood line.
      P.addGunExtra(nonUniformXform(cylZ(0.5, 0.40, 16, 0.465), 0, 0, 0, 0, 0, 0, [0.46, 0.50, 1]), 0, -0.10, 0.75);
      P.addGunExtraDark(nonUniformXform(cylZ(0.5, 0.035, 14), 0, 0, 0, 0, 0, 0, [0.43, 0.47, 1]), 0, -0.105, 0.84);
      // r27: hood/step dropped to the compressed ref's side band (hood zone
      // tops read 1.905-2.015 where the old 2.00/2.16 pair sat +0.10)
      P.add('turret', box(1.30, 0.32, 0.50), 0, 0.34, 1.44);
      P.add('turret', box(0.90, 0.12, 0.24), 0, 0.545, 1.155);
      P.add('turret', box(0.30, 0.40, 0.28), 0, 0.26, 1.84);
      // §B3.2 (2026-08-06): PKT coax port right of the tube — stub + washer
      // flush-recessed in the hood face (z<=1.689 vs the 1.69 face).
      P.add('turretDark', KIT.xform(cylZ(0.022, 0.06, 8), 0, 0, 0), 0.30, 0.30, 1.658);
      P.add('turretDark', KIT.xform(cylZ(0.032, 0.012, 10), 0, 0, 0), 0.30, 0.30, 1.683);
      // §B3: nose cover fold creases + dark end seam, flush on the box faces.
      P.add('turretDark', box(0.29, 0.02, 0.008), 0, 0.30, 1.976);
      P.add('turretDark', box(0.29, 0.35, 0.008), 0, 0.245, 1.9755);
      // Luna IR seated right of the mantlet (ref plan front 1.81 at x 0.6-0.85)
      // §B3.1: Luna is a SEARCHLIGHT DRUM (0.26 box -> r 0.13 cylinder:
      // inscribed circle keeps both mask rectangles) + rim + round lens.
      P.add('turretDetail', KIT.xform(cylZ(0.13, 0.24, 14), 0, 0, 0), 0.72, 0.35, 1.62);
      P.add('turretDark', KIT.xform(cylZ(0.122, 0.014, 14), 0, 0, 0), 0.72, 0.35, 1.742);
      P.add('turretGlass', KIT.xform(cylZ(0.09, 0.02, 14), 0, 0, 0), 0.72, 0.35, 1.75);
    }
  };
  buildT80LineTurretStage1();
  // cheek staircase + flank slabs (ref plan fronts 1.31@±1.0, 1.12@±1.3,
  // 0.9@±1.45; flank rears +0.1@±1.33 — the old shoulder run owned the
  // ±1.30 rear columns 0.6 too deep)
  const buildT80LineTurretStage2 = (): void => {
    for (const s of [-1, 1]) {
      P.add('turret', box(0.34, 0.30, 0.46), s * 1.00, turretSeatY(0.22), 1.08, 0, s * 0.42, 0);
      if (v === 2) {
        P.add('turret', box(0.30, 0.26, 0.40), s * 1.28, turretSeatY(0.16), 0.55, 0, s * 0.72, 0);
        P.add('turret', box(0.40, 0.34, 1.10), s * 1.10, turretSeatY(0.14), -0.08, 0, s * 0.08, 0);
        P.add('turretDetail', box(0.36, 0.05, 0.9), s * 1.11, turretSeatY(0.335), -0.10, 0, s * 0.08, 0);
      } else {
        // r27: cheek chain raised — t80's compressed ref holds 2.13-2.14 at
        // ±1.14..1.27 and 1.98-1.99 out to ±1.45 (the old 1.74 tops read
        // -0.25 over ten front columns); side stays hood-covered. r27c: the
        // raises are t80-ONLY — t80b's print reads 1.84-1.86 at +1.45..1.49
        // and 2.00 at -1.19..-1.25 (per-print falloffs differ; the shared
        // raise cost t80b's front row 5 columns).
        P.add('turret', box(0.28, v === 0 || s < 0 ? 0.50 : 0.26, 0.40), s * 1.27, v === 0 || s < 0 ? 0.28 : 0.16, 0.72, 0, s * 0.66, 0);
        P.add('turret', box(0.12, 0.24, 0.95), s * 1.33, 0.14, 0.575);
        P.add('turret', box(0.34, 0.34, 1.10), s * 1.07, 0.14, -0.08, 0, s * 0.08, 0);
        // LEFT-only mid-cheek riser (the right side's 1.96-2.05 falloff is
        // the lathe's own line; symmetric would read +0.1-0.17 there).
        // r27b: z pulled 1.06 -> 0.95 — its front edge printed 2.13 into the
        // z 1.29 side column where both refs read 1.955-2.015.
        if (s < 0 && v === 0) P.add('turret', box(0.30, 0.25, 0.44), s * 1.00, roofY(0.54), 0.95, 0, s * 0.42, 0);
        P.add('turretDetail', box(0.36, 0.05, 0.9), s * 1.08, roofY(0.335), -0.10, 0, s * 0.08, 0);
      }
    }
  };
  buildT80LineTurretStage2();
  // The cast-body height correction above moved the roof down, but the old
  // stations were also moved down through `roofY()`.  Their feet wound up
  // inside the new shell (the owner screenshots show only hatch rims and a
  // receiver sliver).  Rebuild the roof suite from the actual post-scale
  // crown datum: broad collars deliberately bury their lower third in the
  // casting while hatches, periscopes and the NSVT remain fully readable.
  const cupolaBaseY = roofTopY - 0.015;
  const cupolaTopY = roofTopY + 0.090;
  // commander cupola RIGHT: collar, race ring, hatch leaf, hinge and handle.
  const buildT80LineTurretStage3 = (): void => {
    P.add('turret', cylY(0.31, 0.33, 0.15, 18), 0.52, cupolaBaseY, -0.42);
    P.add('turretDark', KIT.torus(0.315, 0.024, 18), 0.52, cupolaTopY - 0.018, -0.42);
    P.add('turret', cylY(0.255, 0.265, 0.040, 16), 0.52, cupolaTopY, -0.42);
    P.add('turretDetail', box(0.25, 0.055, 0.075), 0.52, cupolaTopY + 0.026, -0.61, 0, -0.06, 0);
    P.add('turretDark', KIT.torus(0.115, 0.014, 12), 0.52, cupolaTopY + 0.043, -0.40, Math.PI / 2, 0, 0);
    // loader cupola LEFT: unequal plan and a rear-offset hatch leaf keep the
    // family roof from reading as two mirrored cylinders.
    P.add('turret', cylY(0.255, 0.275, 0.13, 16), -0.48, cupolaBaseY - 0.005, -0.34);
    P.add('turretDark', KIT.torus(0.265, 0.020, 16), -0.48, cupolaTopY - 0.035, -0.34);
    P.add('turret', cylY(0.225, 0.235, 0.034, 14), -0.48, cupolaTopY - 0.010, -0.38);
    P.add('turretDetail', box(0.20, 0.050, 0.065), -0.48, cupolaTopY + 0.012, -0.54, 0, 0.08, 0);
    // Low asymmetric periscope crowns with deep planted shoes.  Each glass
    // face is outside the shell while its painted base crosses into the roof.
    for (const [x, z, ry] of [
      [0.18, -0.20, 0.44], [0.32, -0.07, 0.22], [0.48, 0.00, -0.03],
      [0.66, -0.10, -0.28], [-0.26, -0.10, -0.28], [-0.60, -0.09, 0.30],
    ]) {
      P.add('turret', box(0.14, 0.10, 0.10), x, roofTopY - 0.015, z, 0, ry, 0);
      P.add('turretDark', box(0.12, 0.055, 0.070), x, roofTopY + 0.035, z, 0, ry, 0);
      P.add('turretGlass', box(0.084, 0.038, 0.014), x, roofTopY + 0.046, z + 0.043, 0, ry, 0);
    }
    // Ventilator, ready-use box and hatch stop add the missing low equipment
    // cadence without competing with the two crew stations.
    P.add('turret', cylY(0.14, 0.16, 0.075, 14), -0.05, roofTopY + 0.005, -0.73);
    P.add('turretDark', cylY(0.12, 0.13, 0.018, 12), -0.05, roofTopY + 0.050, -0.73);
  };
  buildT80LineTurretStage3();
  const buildT80LineTurretStage4 = (): void => {
    P.add('turretDetail', box(0.34, 0.13, 0.25), 0.88, roofTopY - 0.015, -0.75, 0, -0.06, 0);
    P.add('turretDark', box(0.30, 0.020, 0.20), 0.88, roofTopY + 0.058, -0.75, 0, -0.06, 0);
    P.add('turretDetail', box(0.18, 0.055, 0.11), -0.78, roofTopY + 0.010, -0.70, 0, 0.15, 0);
    // Collar-supported radio whip, raised with the rest of the corrected roof.
    P.add('turret', cylY(0.070, 0.076, 0.090, 12), -0.78, roofTopY - 0.015, -0.86);
    P.add('turretDark', cylY(0.042, 0.046, 0.060, 10), -0.78, roofTopY + 0.055, -0.86);
    {
      const antenna = FITTINGS.antennaWhip({ mats: P.mats, h: 1.24, r: 0.011, rake: -0.025, seed: 30 + v });
      antenna.position.set(-0.78, roofTopY + 0.085, -0.86);
      P.turretG.add(antenna);
    }
    if (v !== 2) {
      // left sight head — r27: shifted inboard to x -0.325 (the compressed
      // ref keeps ~2.34 only at the -0.33..-0.39 front columns; at ±0.41..
      // 0.54 it reads 2.19 and the old -0.44 seat printed +0.08 x4 cols).
      // Its z-span still owns the ref's 2.30 side spike at the -0.48 column.
      // r27c: t80b's print has NO left spike (front -0.30..-0.34 reads
      // 2.195, side -0.35 reads 2.135) — its head drops to the 2.19 line.
      P.add('turretDetail', box(0.18, 0.20, 0.18), -0.325, roofTopY + 0.060, -0.56);
      P.add('turretGlass', box(0.13, 0.10, 0.020), -0.325, roofTopY + 0.070, -0.462);
      // rear crown cap: the flattened lathe alone drops to 2.0 behind the
      // ring; r27: the compressed ref holds 2.145 (not 2.19) back to z -0.9,
      // and its left-front reads 2.21 out to x -0.86 — cap dropped and
      // widened left.
      P.add('turret', box(0.83, 0.08, 0.40), -0.445, roofY(0.655), -0.68);
    }
    // gunner sight doghouse left (r27c: cap 0.73 -> 0.70 — its 2.20 top was
    // the second member of the heightM quantization stack with the crown)
    P.add('turret', box(0.42, 0.22, 0.44), -0.45, roofTopY - 0.015, 0.40);
    P.add('turret', box(0.44, 0.055, 0.47), -0.45, roofTopY + 0.105, 0.40);
    P.add('turretGlass', box(0.28, 0.12, 0.022), -0.45, roofTopY + 0.055, 0.635);
    // bustle: 2.20-top band, ref underside rake 1.70 -> 1.91 with the rear
    // cliff at -1.58 (the old -1.63 rear face aliased a 0.2 err column).
    // r27: the compressed ref's bustle is RIGHT-BIASED in plan (rear -1.41
    // at +0.95 but only -0.54 at +1.08, and the LEFT ends -0.76 by -0.92) —
    // the symmetric ±0.88 boxes printed -1.40 into the ±0.92..1.08 columns.
    // Main boxes narrow to -0.82..0.88 (BV keeps the guarded symmetric form);
    // the right corner box carries the deep -1.41 read only to x 1.005.
    P.add('turret', box(v === 2 ? 1.76 : 1.70, 0.45, 0.31), v === 2 ? 0 : 0.03, roofY(0.50), -1.245);
    if (v === 2) {
      P.add('turret', box(1.76, 0.32, 0.23), 0, roofY(0.57), -1.515);
    } else {
      P.add('turret', box(0.125, 0.45, 0.31), 0.9425, roofY(0.50), -1.245);
      // r27b: the compressed ref's rear-most bustle column is a THIN
      // 1.95..2.10 lip (the old 1.84..2.20 band read 0.09 both edges at the
      // -1.59 column); tail box pulled to -1.52 so the lip owns the column.
      P.add('turret', box(1.70, 0.32, 0.16), 0.03, roofY(0.57), -1.44);
      P.add('turret', box(1.60, 0.14, 0.06), 0.03, roofY(0.575), -1.58);
    }
  };
  buildT80LineTurretStage4();
  const buildT80LineTurretStage5 = (): void => {
    P.add('turretDark', cylX(0.07, 1.5, 10), 0, roofY(0.40), -1.06);
    P.add('turretDetail', box(0.05, 0.05, 0.66), 0.80, roofY(0.46), -0.86, 0, 0.5, 0);
    P.add('turretDetail', box(0.05, 0.05, 0.66), -0.80, roofY(0.46), -0.86, 0, -0.5, 0);
    // Rear turret rack: low side rails, a backed terminal rail and unequal
    // strapped packs.  The forward ends bury in the bustle shoulders so the
    // whole service package has an obvious yaw-visible load path.
    P.add('turretDark', box(2.02, 0.055, 0.055), 0, roofY(0.44), -1.72);
    for (const s of [-1, 1]) {
      P.add('turretDark', box(0.055, 0.055, 0.76), s * 1.00, roofY(0.47), -1.38, 0, s * 0.10, 0);
      P.add('turretDark', box(0.055, 0.28, 0.055), s * 1.00, roofY(0.37), -1.70);
      P.add('turret', box(0.42, 0.20, s < 0 ? 0.38 : 0.48), s * 0.64, roofY(0.54), -1.47);
      P.add('turretDark', box(0.055, 0.23, s < 0 ? 0.40 : 0.50), s * 0.64, roofY(0.54), -1.47);
    }
    if (v >= 1) {
      // T-80B brow: forward shelf + spread applique tiles (t80b ref plan
      // front reads 1.74 out to |x| 0.8, 1.43-1.56 to 1.15) + 902 tubes left
      P.add('turret', box(0.50, 0.18, 0.30), -0.86, turretSeatY(0.28), 1.24, 0, -0.50, 0);
      // The former continuous chevron-tip bars are intentionally absent. They
      // floated ahead of the casting and duplicated the BV's real Kontakt field.
      // T-80B keeps its structural brow shelf and individually seated shoulder
      // modules; T-80BV adds its own supported Kontakt blanket below.
      // Two raised outer modules per cheek bridge the applique course into
      // the cast shoulder.  Their backs overlap the existing side carrier;
      // the old low tiles disappeared inside the dome after the height pass.
      for (const s of [-1, 1]) for (let i = 0; i < 2; i++) {
        P.add('turret', box(0.29, 0.22, 0.25), s * (1.18 + i * 0.08), turretSeatY(0.39 - i * 0.015), 0.65 - i * 0.27, -0.15, s * (0.68 + i * 0.16), 0);
        P.add('turretDark', box(0.22, 0.020, 0.19), s * (1.18 + i * 0.08), turretSeatY(0.510 - i * 0.015), 0.65 - i * 0.27, -0.15, s * (0.68 + i * 0.16), 0);
      }
      // T-80B 902A launchers sit in compact mirrored groups on broad cheek
      // shoes.  The BV below receives its distinct 7/5 layout instead.
      if (v === 1) for (const s of [-1, 1]) {
        P.add('turret', box(0.22, 0.22, 0.44), s * 1.16, 0.40, 0.36, 0, 0, -s * 0.18);
        const smoke = FITTINGS.smokeBank({ mats: P.mats, count: 4, r: 0.040, len: 0.25, pitch: -0.42, splay: 0.28, arc: 0.48, spacing: 0.088, seed: 40 + s });
        smoke.position.set(s * 1.17, 0.50, 0.37);
        smoke.rotation.y = s * 0.96;
        P.turretG.add(smoke);
      }
      // bustle tail bin — r27: the compressed t80b ref's 2.0..2.18 band now
      // ends ~-1.61 (the r26 -1.68 seat read ONLY-PROC on the turret row and
      // 0.36 err on side_whole at the -1.67..-1.80 columns)
      P.add('turret', box(0.30, 0.18, 0.09), -0.55, roofY(0.64), -1.575);
      // r27b: t80b keeps a 2.05..2.18 stowage row over z -0.80..-1.06 (its
      // -0.97 side column read the bare lathe 2.005 vs the ref's 2.185)
      P.add('turret', box(0.72, 0.13, 0.28), -0.35, roofY(0.665), -0.92);
    }
  };
  buildT80LineTurretStage5();
  const buildT80LineTurretStage6 = (): void => {
    if (v === 0) {
      // The early T-80 carries no continuous ERA chevron. One compact shoulder
      // return per side remains planted into the cast shell as applique/stowage.
      for (const s of [-1, 1]) {
        P.add('turret', box(0.30, 0.22, 0.27), s * 1.22, 0.36, 0.55, -0.14, s * 0.72, 0);
        P.add('turretDark', box(0.23, 0.020, 0.21), s * 1.22, 0.480, 0.55, -0.14, s * 0.72, 0);
        const smoke = FITTINGS.smokeBank({ mats: P.mats, count: s < 0 ? 5 : 4, r: 0.038, len: 0.24, pitch: -0.40, splay: 0.27, arc: 0.52, spacing: 0.082, seed: 36 + s });
        smoke.position.set(s * 1.16, 0.50, 0.30);
        smoke.rotation.y = s * 0.98;
        P.turretG.add(smoke);
      }
    }
  };
  buildT80LineTurretStage6();
  const buildT80LineHullStage3 = (): void => {
    if (v === 2) {
      // T-80BV Kontakt-1: discrete cheek field + flank wrap + glacis raft. The
      // obsolete shared continuous bars are gone; every visible module below
      // has a painted carrier shoe buried into the cast turret.
      eraRuCheeks(P, { rings: ringsT, sz: 0.88, rCz: 0.22, k1Y: turretSeatY(0.18), k1Pitch: 0.21, k1T0: 0.24, k1Step: 0.22, k1H: 0.21, k1Out: 0.072, k1Bucket: 'turret', k1Chevron: { yaw: 0.78, arcFrom: 3, pitch: 0.30, bw: 0.28, bd: 0.17, d0: 0.05, out: 0.07, banksOff: true } }, 'k1');
      const eraSurfaceSeats: EraSurfaceSeat[] = [];
      const seatEra = (
        x: number,
        y: number,
        z: number,
        w: number,
        h: number,
        d: number,
        rx: number,
        ry: number,
        overlap = 0.01,
      ): EraSurfaceSeat => {
        const seat: EraSurfaceSeat = domeBoxPlanSeat(ringsT, 0.88, {
          x, y, z, w, h, d, rx, ry, overlap, cz: 0.22,
        });
        eraSurfaceSeats.push(seat);
        return seat;
      };
      addSovietChevronEra(P, {
        sector: 't80bv-k1-turret-front-era',
        receiptKey: 't80BVChevronEraReceipt',
        family: 't80bv-kontakt1-cast-chevron-r1',
        plans: [
          [[0.23, 1.31], [0.34, 1.41], [0.78, 1.02], [0.67, 0.91]],
          [[0.68, 0.95], [0.79, 1.05], [1.20, 0.60], [1.09, 0.50]],
        ],
        rows: [
          { y0: frontChevronY(0.12), y1: frontChevronY(0.315), z0: -0.075, z1: 0.060 },
          { y0: frontChevronY(0.315), y1: frontChevronY(0.505), z0: 0.060, z1: -0.070 },
        ],
        tileRanges: [[0.07, 0.29], [0.34, 0.66], [0.71, 0.93]],
        tileBucket: 'turretTrack',
        tileDepthM: 0.060,
        gasketDepthM: 0.022,
        // The cast shell previously swallowed the carrier faces in quarter
        // views. Move the complete carrier-and-tile package to the installed
        // cheek datum; its long rear edges remain buried in the dome.
        forwardM: 0.26,
        centerClosure: { width: 0.36, height: 0.18, depth: 0.055, y: frontChevronY(0.23), z: 1.43, rx: -0.20 },
      });
      // Continue the coherent front into the cast shoulder and flank wrap.
      P.visualEraCluster('t80bv-k1-turret-extra-era', 'turret', () => {
      // Continue the Kontakt-1 blanket into six individually readable flank
      // cassettes per side.  Their buried inner shoes overlap the existing
      // cast carriers; dark caps expose the module cadence at gameplay scale.
      for (const s of [-1, 1]) for (let i = 0; i < 6; i++) {
        const x = 1.24 + i * 0.030;
        const z = 0.46 - i * 0.235;
        const yaw = 0.66 + i * 0.105;
        const shoeY = turretSeatY(0.12 - i * 0.006);
        const cassetteY = turretSeatY(0.15 - i * 0.006);
        const shoe = seatEra(s * (x - 0.055), shoeY, z,
          0.23, 0.15, 0.25, -0.06, s * yaw, 0.055);
        const cassette = seatEra(s * x, cassetteY, z,
          0.22, 0.14, 0.22, -0.06, s * yaw, 0.025);
        P.add('turret', box(0.23, 0.15, 0.25), shoe.x, shoeY, shoe.z, -0.06, s * yaw, 0);
        P.add('turret', box(0.22, 0.14, 0.22), cassette.x, cassetteY, cassette.z, -0.06, s * yaw, 0);
        P.add('turretDark', box(0.17, 0.012, 0.15), cassette.x, turretSeatY(0.226 - i * 0.006), cassette.z, -0.06, s * yaw, 0);
      }
      P.turretG.userData.turretEraSurfaceSeatReceipt = Object.freeze({
        profile: 't80bv',
        cassetteSeats: eraSurfaceSeats.length,
        arcCassetteOverlapM: 0.008,
        maximumSurfaceGapM: Math.max(...eraSurfaceSeats.map((seat) => seat.surfaceGapM)),
        minimumSurfaceGapM: Math.min(...eraSurfaceSeats.map((seat) => seat.surfaceGapM)),
        supportEmbedM: 0.055,
        cassetteEmbedM: 0.025,
        maximumCarrierJointM: 0,
      });
      });
      // The production BV's 902B system is visibly asymmetric: seven tubes
      // on the left cheek and five on the right, each on a planted shoe.
      for (const s of [-1, 1]) {
        const count = s < 0 ? 7 : 5;
        P.add('turret', box(0.24, 0.24, s < 0 ? 0.58 : 0.46), s * 1.17, turretSeatY(0.42), 0.22, 0, 0, -s * 0.16);
        const smoke = FITTINGS.smokeBank({ mats: P.mats, count, r: 0.039, len: 0.25, pitch: -0.42, splay: 0.30, arc: 0.64, spacing: 0.080, seed: 50 + count });
        smoke.position.set(s * 1.18, turretSeatY(0.55), 0.24);
        smoke.rotation.y = s * 1.00;
        P.turretG.add(smoke);
      }
      P.visualEraCluster('t80bv-k1-hull-era', 'hull', () => {
      for (let r = 0; r < 4; r++) for (let c = 0; c < 7; c++) {
        // Four dense upper-glacis courses.  The array stays on the central
        // armor plane (well inboard of both idler lanes) and follows the bow
        // slope instead of hovering as one flat raft.
        P.add('hull', box(0.30, 0.12, 0.18), -0.90 + c * 0.30, 0.84 + r * 0.115, 3.21 - r * 0.235, -1.02, 0, 0);
        P.add('hullDark', box(0.25, 0.018, 0.13), -0.90 + c * 0.30, 0.905 + r * 0.115, 3.21 - r * 0.235, -1.02, 0, 0);
      }
      });
      // Close the real shoulder returns beneath the broadened raft.  These
      // shallow plates bridge the arrow nose to the retained corner shelves;
      // without them the added ERA made three old plan pockets fully enclosed
      // and therefore exposed as sky holes from above.  They remain 25 cm
      // above the native return run and do not replace a guard or skirt.
      for (const s of [-1, 1]) {
        P.add('hull', box(0.78, 0.10, 0.32), s * 1.42, 1.17, 3.13, -0.08, -s * 0.10, 0);
      }
      P.add('hull', box(0.90, 0.075, 0.18), 0, 1.205, 3.08, -0.10, 0, 0);
      // Raised fender bridge caps close the visible plan seams at the idler
      // and sprocket transitions. Their 1.37 m undersides remain above the
      // measured 1.352 m animated shoe envelope, preserving a true gap.
      for (const s of [-1, 1]) {
        P.add('hull', box(0.32, 0.04, 0.50), s * 1.58, 1.39, 2.65);
        P.add('hull', box(0.32, 0.04, 0.70), s * 1.58, 1.39, -2.25);
      }
      P.hullG.userData.t80bvFenderBridgeReceipt = Object.freeze({
        planSeamsOpen: 0,
        bridgeCaps: 4,
        bridgeUndersideY: 1.37,
        animatedShoeEnvelopeTopY: 1.352,
        minimumShoeClearanceM: 0.018,
      });
      // Full skirt-mounted K-1 cadence.  Modules overlap the retained skirt
      // faces by 15 mm, so this is additive armor rather than a replacement
      // band and cannot open the wheel well or alter the smart-track course.
      P.visualEraCluster('t80bv-k1-skirt-era', 'hull', () => {
      for (const s of [-1, 1]) for (let i = 0; i < 11; i++) {
        const z = 2.58 - i * 0.49;
        const y = 1.09 + (i % 3 === 1 ? 0.025 : 0);
        P.add('hull', box(0.065, 0.31, 0.42), s * 1.765, y, z, 0, 0, s * (i % 2 ? 0.025 : -0.018));
        P.add('hullDark', box(0.014, 0.25, 0.34), s * 1.802, y, z, 0, 0, s * (i % 2 ? 0.025 : -0.018));
      }
      });
    }
  };
  buildT80LineHullStage3();
  const dxT = ringSkin(ringsT, 0.30) + 0.02;
  const buildT80LineMarkingsStage1 = (): void => {
    P.decal('turret', 'number', P.spec.visual.number || '', 0.25, [dxT, 0.22, -0.30], Math.PI / 2);
    P.decal('turret', 'number', P.spec.visual.number || '', 0.25, [-dxT, 0.22, -0.30], -Math.PI / 2);
    // ---- 125 mm 2A46M-1. r27 re-read on the COMPRESSED oracle (fresh
    // gate-faithful probe): the ref side band is 1.555..1.868 (0.313 thick,
    // axis 1.7115 — the r26 "axis 1.765 / r 0.112" seat carried a flat 0.047
    // err across ~24 side/turret columns on both variants). A true 0.313
    // cylinder would cross the 12% body cut (0.265-0.275 by camera pitch —
    // the t80-line LANDMINE: tube columns becoming BODY explode hullLengthM)
    // so the working tube runs r 0.128 seated cy -0.054 (band 1.583..1.839,
    // 0.256 thick, inside the r26-proven ceiling); the ±0.03 band residual
    // is the certified circle-law trade. t80b's print keeps its tube to
    // 6.33 — its muzzle extends inside the 1% overall grace (ONLY-REF
    // column + turret cover otherwise). ----
    P.gunG.position.set(0, v === 2 ? 0.235 : 0.285, 0.60);
    ruSaddle(P, { rollR: 0.15, rollW: 0.40, tubeR: 0.128, rootR: 0.28, rootL: 0.62 });
  };
  buildT80LineMarkingsStage1();
  const gunEnd = v === 2 ? 5.22 : v === 1 ? 5.73 : 5.67;
  const buildT80LineGunStage1 = (): void => {
    tubeGun(P, [
      [0.55, 2.03, 0.128, 0.128, 0, -0.040], [2.03, 2.78, 0.130, 0.130, 0, -0.048], [2.78, gunEnd, 0.128, 0.128, 0, -0.054],
    ], { rings: [[3.60, 0.132, 0, -0.054], [4.40, 0.132, 0, -0.054], [Math.min(5.10, gunEnd - 0.18), 0.132, 0, -0.054]], muzzle: gunEnd });
    muzzleBore(P, { r: 0.128, y: -0.054 });  // §B3.1 turret-lane 2026-08-06 (shadow-named, mask/frame-neutral; all three marks)
    // r25f sleeve clamp plate (pt91m precedent): the ref tube's plan edges
    // (±0.19) own the ±0.16..0.19 plan columns — but only to world 6.04
    // (r26: the full-length plate owned the muzzle-tip plan columns 0.23
    // past the ref). Thin plate at the axis plane: side-invisible inside
    // the tube band, never a body column (0.014 band).
    if (v === 2) P.add('gun', box(0.37, 0.014, 4.45), -0.005, -0.056, 2.775);
    else P.add('gun', box(0.37, 0.014, 4.89), -0.005, -0.056, 2.995);
    // r27: crest fin follows the re-seated band (compressed ref side band
    // 1.555..1.868 — the old 1.59..1.94 fin topped +0.07 over its columns)
    P.add('gun', box(0.022, 0.30, 0.75), 0, -0.054, 2.405);
    // (r25e: a whole-tank z-seat was tried and reverted — the fitted view
    // registration re-centers on the body span, so it is seat-invariant;
    // and turretG is NOT a hullG child, so the seat sheared the rig.)
    {
      // The T-80, T-80B and T-80BV share one commander's NSVT installation.
      // Keep the weapon parallel to local +Z instead of applying per-variant
      // display yaw or pitch. Its fitting origin is the pintle foot, so seat
      // that foot 5 mm into the actual commander-hatch top and parent it to a
      // named station. The hierarchy now records the complete load path:
      // turret -> commander cupola station -> NSVT cradle -> weapon body.
      const supportTopY = cupolaTopY + 0.020;
      const supportEmbedM = 0.005;
      const station = new THREE.Group();
      station.name = 'rig_t80CommanderCupolaWeaponStation';
      station.position.set(0.52, supportTopY - supportEmbedM, -0.42);
      station.userData.supportAssembly = 'commander-cupola';
      station.userData.weaponAxis = 'local-positive-z';

      const mg = FITTINGS.pintleMG({
        mats: P.mats, cls: 'nsvt', scale: v === 2 ? 0.84 : 0.88,
        tone: 'two-tone', ammo: true, shield: true, elev: 0,
      });
      mg.rotation.set(0, 0, 0);
      mg.userData.supportAssembly = station.name;
      mg.userData.commandedElevationRad = 0;
      station.add(mg);
      P.turretG.add(station);

      P.turretG.userData.t80CommanderNsvtStationReceipt = Object.freeze({
        profile: v === 0 ? 't80' : v === 1 ? 't80b' : 't80bv',
        supportAssembly: 'commander-cupola',
        stationName: station.name,
        stationYaw: 0,
        weaponYaw: 0,
        weaponPitch: 0,
        cupolaCenter: Object.freeze([0.52, cupolaTopY, -0.42]),
        supportTopY,
        fittingFootY: station.position.y,
        supportEmbedM,
      });
    }
    P.topY = 1.20;
  };
  buildT80LineGunStage1();
}

function buildT80(P: T80BuilderPort): void { buildT80Line(P, 0); }

function buildT80B(P: T80BuilderPort): void { buildT80Line(P, 1); }

function buildT80BV(P: T80BuilderPort): void { buildT80Line(P, 2); }


export const T80_PROFILES = {
  t80: { build: buildT80 },
  t80b: { build: buildT80B },
  t80bv: { build: buildT80BV },
  t84: { build: buildOplotModern },
} satisfies VehicleProfileRecord;
