// Kevin B. Liu — the classic M2A2 Bradley turret, kept as its own part for the M3A2 (release 268).
// Owner, 2026-11-02: "also make a new variant of the bradley based on the old turret we had before doing this. i liked the
// shape and all the stuff arounnd it". This is the m2a2_bradley turret and everything mounted on and around it as main
// carried it at 7cc204ab32 (src/vehicles/modern3.ts buildBradleySteps: the ring collar and core 2529-2539, the roof
// risers 2559-2570, the shell, kit, TOW pod and M242 2571-2983, the flash suppressor 2985-3001; the turret-owned seat pan
// and collar of bradleyFlankDressing 3129-3137), extracted verbatim and mirrored across x: that build carried its TOW pod,
// ISU and mast cluster on −X (the vehicle's right) and its commander, bin and coax on +X; the real Bradley, and the
// family's measured source, carry the TOW on the turret's LEFT (+X; forward +Z, up +Y). Every x below is the 7cc204ab32
// value negated (mirrored coordinates, never a negative scale; the frustum, chin wedge and seat are symmetric). One
// deliberate change: the TOW pod is turret-fixed, the real launcher's way, where 7cc204ab32 hung it on the gun mount: at
// rest it stands where it stood (its gun-frame coordinates plus the mirrored gun pivot), and it no longer drives into the
// hull roof as the gun elevates (the 181 standing gun-sweep conflicts of the old m2a2_bradley).
// Turret frame: the ring plane at y 0, the gun pivot CLASSIC_GUN_PIVOT. The hull under it is the shared Bradley hull.
import type * as THREE from 'three';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { KIT, FITTINGS } from './kit.ts';
import { weaponAssembly } from './weaponStock.ts';
import { launchCellParts, perforatedPlate } from './missileCanisterStock.ts';
import { CLASSIC_GUN_PIVOT, CLASSIC_MUZZLE_Z, CLASSIC_TOW_CELLS, CLASSIC_TOW_MOUTHS } from '../bradleyClassicTurretLayout.ts';

const CLASSIC_ROOF_Y = 0.565;
const CLASSIC_RISER_TOP_Y = 0.825;
/** 7cc204ab32's deck under the ring, in the turret frame: the 1.905 roof plate over the 1.895 ring plane. */
const CLASSIC_DECK_Y = 0.01;

export interface ClassicTurretRing {
  /** The hull deck's top under the ring, in the turret frame (the ring plane is y 0): the seat pan and collar follow it. */
  readonly deckY: number;
}

/** The turret-owned seat pan and collar (7cc204ab32 bradleyFlankDressing): a faceted pan and a collar under the shell
 *  that close the low sight-line between the turret's overhang and the deck; both stand on the deck as they stood on
 *  7cc204ab32's. */
function addClassicTurretSeat(P: TankBuilderPort, ring: ClassicTurretRing): void {
  const { cylY, polyMultiLoft } = KIT;
  const dy = ring.deckY - CLASSIC_DECK_Y;
  const turretSeatPlan = [
    [-0.68, 0.82], [0.68, 0.82], [0.90, 0.45], [0.92, -0.78],
    [0.70, -1.08], [-0.70, -1.08], [-0.92, -0.78], [-0.90, 0.45],
  ];
  P.add('turret', polyMultiLoft(turretSeatPlan, [
    { height: -0.07 + dy, inset: 0.90 },
    { height: 0.07 + dy, inset: 1.00 },
  ]));
  P.add('turret', cylY(0.82, 0.87, 0.16, P.q ? 22 : 14), 0, 0.005 + dy, -0.10);
}

/** The classic M2A2 turret on the shared Bradley hull: the seat, the ring collar and core, the roof risers, the step,
 *  chin and cheeks, sight, hatches, bustle rack and stowage, the mast cluster and whips, the right bin, smoke banks, the
 *  TOW pod on the left and the M242. */
export function buildBradleyClassicTurret(P: TankBuilderPort, ring: ClassicTurretRing): void {
  const { box, cylY, cylZ, frustum, slab, stowage, buildGun } = KIT;
  const { rng } = P;
  addClassicTurretSeat(P, ring);
  // ---- ring collar and core (7cc204ab32 2529-2539): the core's front step to the mantlet shoulder below ----------
  P.add('turret', cylY(0.60, 0.66, 0.09, 22), 0, 0.055, -0.10);                    // base ring collar
  P.add('turret', frustum(0.74, 0.66, -1.00, 0.73, 0.61, -0.95, 0.02, 0.565));   // core, roof 0.565
  // ---- the commander's roof riser on the RIGHT (−X), top 0.825 (2559-2570) -----------------------------------------
  const riserH = CLASSIC_RISER_TOP_Y - CLASSIC_ROOF_Y, riserY = (CLASSIC_RISER_TOP_Y + CLASSIC_ROOF_Y) / 2;
  P.add('turret', box(0.665, riserH, 0.60), -0.3625, riserY, -0.60);
  P.add('turret', box(0.655, riserH, 0.85), -0.3575, riserY, 0.125);
  // Side-interface bridges close the narrow daylight seams between the shell and its right stowage bin / left TOW pod.
  const binBridge = Object.freeze({ x: -0.765, y: 0.30, z: -0.015, w: 0.10, h: 0.31, d: 1.24 });
  const towBridge = Object.freeze({ x: 0.765, y: 0.28, z: -0.15, w: 0.09, h: 0.43, d: 1.22 });
  P.add('turret', box(binBridge.w, binBridge.h, binBridge.d), binBridge.x, binBridge.y, binBridge.z);
  P.add('turret', box(towBridge.w, towBridge.h, towBridge.d), towBridge.x, towBridge.y, towBridge.z);
  P.turretG.userData.bradleyClassicTurretReceipt = Object.freeze({
    revision: 'classic-7cc204ab32-mirrored-r1',
    source: '7cc204ab32 src/vehicles/modern3.ts buildBradleySteps (m2a2_bradley), mirrored across x',
    roofY: CLASSIC_ROOF_Y,
    roofRisers: Object.freeze({ count: 2, bottomY: CLASSIC_ROOF_Y, topY: CLASSIC_RISER_TOP_Y }),
    binBridge,
    towBridge,
    deckY: ring.deckY,
    gunPivot: CLASSIC_GUN_PIVOT,
    towMouths: CLASSIC_TOW_MOUTHS,
  });
  // ---- front step, chin wedge, coax port, rotor housing, ODS cheek plates -----------------------------------------
  P.add('turret', box(1.36, 0.49, 0.23), 0, 0.2975, 0.775);                       // front step, top 0.5425
  P.add('turret', slab(                                                          // chin wedge (one raked plate)
    [-0.70, 0.135, 1.07], [0.70, 0.135, 1.07], [0.70, 0.01, 0.65], [-0.70, 0.01, 0.65],
    [-0.70, 0.195, 1.07], [0.70, 0.195, 1.07], [0.70, 0.055, 0.65], [-0.70, 0.055, 0.65]));
  P.add('turretDark', box(0.10, 0.12, 0.06), -0.24, 0.42, 1.045);                 // coax M240 port (right of the gun)
  P.add('turret', box(0.17, 0.16, 0.28), 0.115, 0.37, 1.19);                      // slim M242 rotor housing
  P.add('turret', box(0.36, 0.38, 0.045), 0.44, 0.33, 1.065);                     // A2 appliqué cheeks on the step face
  P.add('turret', box(0.32, 0.38, 0.045), -0.34, 0.33, 1.065);
  // ---- the ISU sight hood low on the LEFT roof and its window; the gunner's riser window --------------------------
  P.add('turret', box(0.40, 0.045, 0.40), 0.32, 0.545, 0.14);
  P.add('turretDark', box(0.34, 0.09, 0.04), 0.32, 0.50, 0.355);
  P.add('turretGlass', box(0.28, 0.05, 0.02), 0.32, 0.505, 0.375);
  P.add('turretDark', box(0.30, 0.10, 0.04), -0.22, 0.77, 0.555);
  // ---- the commander's hatch flush on the riser (right) and its periscope arc; the gunner's hatch on the left roof ---
  P.add('turret', cylY(0.24, 0.24, 0.02, 16), -0.38, 0.833, 0.02);
  P.add('turretDark', box(0.30, 0.015, 0.30), -0.38, 0.852, 0.02);
  for (let k = 0; k < 3; k++) {
    P.add('turretDark', box(0.07, 0.04, 0.05), -(0.24 + k * 0.14), 0.845, 0.24);
    P.add('turretGlass', box(0.05, 0.022, 0.052), -(0.24 + k * 0.14), 0.85, 0.245);
  }
  P.add('turret', cylY(0.22, 0.22, 0.02, 14), 0.40, 0.578, -0.30);
  P.add('turretDark', box(0.26, 0.015, 0.26), 0.40, 0.595, -0.30);
  // ---- bustle rack with its duffels, the LEFT mast cluster and its twin whips, the right bin and its tower fills ----
  {
    const rack = FITTINGS.stowageRack({
      mats: P.mats, w: 1.38, d: 0.55, h: 0.30, rails: 2, fill: 0.40, seed: 11,
      rotation: [0, Math.PI, 0],                                                  // open face aft
    });
    rack.position.set(0.05, 0.36, -0.79);
    P.turretG.add(rack);
    stowage(P, 'turretCloth', rng, [[0.01, 0.39, -1.1275, 0.82, 0.28, 0.445]]);   // rack tail shelf duffel
    // the mast cluster: a three-step stair of mount boxes on the tower column, one connected mass
    P.add('turretDetail', box(0.20, 0.37, 0.13), 0.855, 0.90, -0.78);              // mount tower
    P.add('turretDetail', box(0.16, 0.05, 0.60), 0.88, 0.72, -0.78);
    P.add('turretDetail', box(0.25, 0.52, 0.36), 1.00, 0.825, -0.83);              // tall step
    P.add('turretDetail', box(0.20, 0.42, 0.145), 0.99, 0.77, -0.6025);            // mid step
    P.add('turretDetail', box(0.18, 0.34, 0.32), 0.90, 0.715, -0.33);              // east step
    P.add('turretDetail', box(0.20, 0.30, 0.085), 0.99, 0.815, -1.0625);           // west end block
    for (const [wx, wz, seed] of [[0.85, -1.00, 8], [0.97, -0.60, 5]] as const) {
      const whip = FITTINGS.antennaWhip({ mats: P.mats, h: 0.62, rake: 0.04, seed });
      whip.position.set(wx, 0.34, wz);
      P.turretG.add(whip);
    }
    P.add('turret', box(0.525, 0.30, 1.31), -1.0625, 0.30, -0.015);               // right bin base
    P.add('turret', box(0.03, 0.715, 0.075), -1.34, 0.5075, 0.5875);              // tower corner post
    // 2026-10-19 (owner float sweep): both tower fills run 25 mm deeper into the bin (tops kept)
    stowage(P, 'turretCloth', rng, [
      [-1.12, 0.6525, -0.095, 0.36, 0.405, 1.02],                                 // tower fill A
      [0.98, 0.46, -0.785, 0.30, 0.26, 0.55],                                     // left wing duffels
      [0.30, 0.53, -0.85, 0.55, 0.26, 0.40],                                      // duffels over the rack
      [-0.42, 0.51, -0.78, 0.45, 0.22, 0.38],
      [-0.855, 0.6625, 0.1275, 0.19, 0.405, 0.575],                               // tower fill B (inboard, front half)
    ]);
    P.add('turret', cylZ(0.027, 0.30, 28), -1.10, 0.875, -0.13);                  // tower rail
    stowage(P, 'turretCloth', rng, [[0.51, 0.34, -1.04, 0.14, 0.24, 0.38]]);      // tail duffel C
    P.add('turretCloth', box(0.23, 0.22, 0.45), -0.485, 0.445, -1.075);           // tail duffel B, tapered
    P.add('turretCloth', box(0.11, 0.22, 0.30), -0.655, 0.445, -1.00);
    // the left bags' descending stair, chained to the mast's mid step (turret furniture, never on the TOW pod)
    P.add('turretCloth', box(0.11, 0.43, 0.375), 1.115, 0.42, -0.4625);
    P.add('turretCloth', box(0.105, 0.245, 0.49), 1.1975, 0.155, -0.245);
    P.add('turretCloth', box(0.055, 0.245, 0.34), 1.2775, 0.12, -0.17);
    // VH.14 (2026-10-14): the Bradley carries no roof machine gun (roofWeaponPolicy.ts).
    // 2x4 smoke launchers on the turret front corners (§6.5)
    for (const s of [-1, 1]) {
      const bank = FITTINGS.smokeBank({
        mats: P.mats, count: 4, r: 0.038, len: 0.24, pitch: -0.28, splay: -s * 1.05, spacing: 0.095, seed: 6 + s,
      });
      bank.position.set(-s * 0.52, 0.42, 0.92);
      P.turretG.add(bank);
    }
  }
  // ---- the TOW twin pod on the LEFT: an open pack (four walls, a back plate, a perforated front plate 1 cm inside them)
  // with two cells whose rim collars stand proud round dark liners 45 cm deep (170 mm bore), its elevation arm and root
  // bracket into the left wall. 7cc204ab32's gun-frame coordinates (mirrored) plus the mirrored gun pivot.
  const [gx, gy, gz] = CLASSIC_GUN_PIVOT;
  const pod = (bucket: string, geometry: THREE.BufferGeometry, x = 0, y = 0, z = 0) => P.add(bucket, geometry, x + gx, y + gy, z + gz);
  weaponAssembly(P, () => {
    for (const x of [1.14, 0.80]) pod('turretDetail', box(0.03, 0.47, 1.06), x, -0.08, -0.33);
    for (const y of [-0.325, 0.165]) pod('turretDetail', box(0.37, 0.03, 1.056), 0.97, y, -0.33);
    pod('turretDetail', box(0.32, 0.47, 0.03), 0.97, -0.08, -0.84);
    pod('turretDetail', perforatedPlate(0.32, 0.47, 0.02, [[0, 0.12], [0, -0.12]], 0.0965, P.q ? 24 : 12), 0.97, -0.08, 0.19);
    const T = CLASSIC_TOW_CELLS;
    for (const y of T.ys) {
      const tube = launchCellParts({ bore: 0.085, wall: 0.02, proud: T.proud, behind: 0.02, depth: 0.45,
        segments: [24, 12] }, P.q, T.x + gx, y + gy, T.plateZ + gz);
      P.add('turretDetail', tube.rim); P.add('turretDark', tube.bore);
    }
    pod('turretDetail', box(0.22, 0.05, 0.92), 0.90, 0.185, -0.39);                // lid rib on the pod roof
    pod('turretDetail', box(0.32, 0.26, 0.34), 0.65, -0.04, 0.10);                 // elevation arm to the mount
    pod('turretDetail', box(0.28, 0.16, 0.26), 0.665, 0.06, 0.32);                 // pod root bracket
  });
  // ---- 25 mm M242: box mantlet/rotor, its boot and gun bar, the tube to the 2.23 muzzle (gun frame) ---------------
  P.addGunExtra(box(0.40, 0.34, 0.42), -0.02, -0.04, 0.23);                       // rotor/mantlet block
  P.addGunExtra(box(0.165, 0.07, 0.48), 0.0375, -0.02, 0.68);                     // rotor boot forward of the block
  P.addGunExtra(box(0.10, 0.12, 0.42), 0.055, -0.01, 0.62);                       // cradle/gun bar
  buildGun(P, { len: 0.70, r: 0.038, baseR: 0.075 });                             // breech stub
  P.addGunExtra(cylZ(0.038, 1.53, 28), 0, 0, 1.425);                              // tube, 0.66..2.19
  P.addGunExtra(cylZ(0.041, 0.40, 12), 0, 0, 1.50);                               // thermal-sleeve joint
  P.muzzleZ = CLASSIC_MUZZLE_Z;
  // VH.04 (2026-10-15): the suppressor mouth is the muzzle anchor (2.23)
  P.add('gunDark', cylZ(0.044, 0.13, 8), 0, 0, 2.165);                            // flash suppressor
  P.add('gunDark', cylZ(0.026, 0.012, 12), 0, 0, 2.2095);                         // muzzle bore disc on its face
  P.topY = 1.05;
}
