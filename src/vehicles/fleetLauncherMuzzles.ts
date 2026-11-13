import type { FleetTankSpec } from './specContracts.ts';
import type { LauncherMuzzle } from '../sim/launcherPolicy.ts';

import * as detMath from '../sim/detMath.ts';
import { CLASSIC_TOW_MOUTHS } from './bradleyClassicTurretLayout.ts';
import { M113_TOW, type M113TowMark } from './m113Datums.ts';
// Terminal centers measured from the native builders, in final metre frames.
// These are launch exits, never spare tubes, smoke dispensers or cannon bores.
// Batteries with authored layouts keep their existing shared geometry datums.
function turret(x: number, y: number, z: number, pitch = 0, yaw = 0): LauncherMuzzle {
  return { x, y, z, frame: 'turret', pitch, yaw };
}
function mouth(x: number, y: number, z: number): LauncherMuzzle { return { x, y, z }; }
// 2026-10-21: the TOW collars' mouths on the flat-fronted pod (modern3.ts), 8.5 cm ahead of the old sloped face.
// 268 (2026-11-02): the launcher on the turret's LEFT as the owner's supplied model carries it, built in its travel
// pose: stowed along the left wall, folded 90 deg down and out about the source's pivot (modern3.ts BRADLEY_TOW x0/y0),
// so its two mouths at the plate's 4 cm-proud collars stand one over the other (the source's erected 1.05/1.35 at 1.055).
const bradley = [turret(1.105, .68, .60), turret(1.105, .38, .60)];
const towMouths = (mark: M113TowMark): LauncherMuzzle[] => {
  const T = M113_TOW[mark];
  return T.ys.map((y) => turret(T.x, y, T.mouthZ + 0.05));
};
const mounts: Readonly<Record<string, readonly LauncherMuzzle[]>> = {
  // 269: the source turret is the M3A2's, the classic turret the M2A2's (modern3.ts buildM2A2Bradley)
  m3a2_bradley: bradley,
  ua_m2a3_bradley: bradley,
  // 267: the full-length 9M113 container on the 9P135M post (profiles/bmpBoatHull.ts), its front ring's mouth
  bmp2: [turret(.05, .655 + .03 * detMath.sin(.02), .32 + .03 * detMath.cos(.02), .02)],
  spz_puma: [mouth(1.19, -.02, .465), mouth(1.41, -.02, .465)],
  puma_s1: [-.1005,.1005].map(dx => mouth(1.366+dx,-.0462,.7294)),
  // 269: the Spike LR2 twin launcher's canister faces on the turret's left wall (profiles/redback.ts, leftX + 0.11)
  redback: [.33, .55].map(y => turret(1.23, y, -.108)),
  // 269: the M113s' twin TOW on the turret's right flank (m113Datums.ts M113_TOW), lower tube first
  m113a1_fsv: towMouths('fsv'),
  m113a1_mrv: towMouths('mrv'),
  m113as4: towMouths('as4'),
  borsuk: [.545,.795].map(y => turret(1.34,y,.91)),
  // 2026-10-21: the Jyu-MAT canister collars stand 4 cm proud of the duct front (profiles/type89SourceX.ts).
  type89: [-1,1].map(side => turret(side*1.25,.63,.40)),
  spz_wotan: [.36, .59].map(y => turret(-1.02 * .9, y * .9, .839 * .9)),
  raiju_ifv: [-1, 1].flatMap(s => [.32, .56].map(y => turret(s * 1.39 * .9, y * .9, .7175 * .9))),
  cv90_mk4_concept: [.42, .70].map(y => turret(-1.20 * .9, y * .9, .68 * .9)),
  hayate_ifv: [-1, 1].map(s => turret(s * .92, .385 + .02 * detMath.sin(.14), .285 + .02 * detMath.cos(.14), .14)),
  fv510_milan: [turret(.56 * 1.1, (.92 + .0125 * detMath.sin(.04)) * 1.1 * .84,
    (.927 + .0125 * detMath.cos(.04)) * 1.1, detMath.atan(detMath.tan(.04) * .84))],
  // 267: the front caps of the two armoured Ataka boxes, two tubes side by side in each box's outboard part
  // (profiles/bmpt72Station.ts: tubes x .905 / 1.075, axis y .985, cap faces z .985)
  bmpt_terminator2: [-1, 1].flatMap(s => [.905, 1.075].map(x => turret(s * x, .985, .985))),
  // 267: the Spike-LR canister on the RCWS-30's right arm (profiles/bwp1Rcws30.ts), its front collar's mouth
  bwp1: [turret(-.88, .51, .705)],
  // 268: the classic TOW pod on the turret's LEFT, turret-fixed, its two collar mouths one over the other
  // (profiles/bradleyClassicTurret.ts); the M2A2's since 269, whose ODS rebuild (T2) stows the launcher flush on the left
  // wall behind the front corner plate (bradleyClassicTurretLayout.ts CLASSIC_TOW_CELLS)
  m2a2_bradley: CLASSIC_TOW_MOUTHS.map(m => turret(m.x, m.y, m.z)),
  marder1a3: [turret(.55, .92, .445)],
  // 269: the A3 turret carries the family's stowed launcher (profiles/bradleyA3Turret.ts on modern3.ts's shell) and, the
  // owner's second order ("a launcher aonn its other sdie"), the same launcher on the right wall, mirrored about the
  // shell's centre plane (modern3.ts BRADLEY_TOW_MIRROR_X, -0.07): its mouths at x -0.14 - 1.105
  m3a3_bradley: [...bradley, turret(-1.245, .68, .60), turret(-1.245, .38, .60)],
  upior: [turret(1.10, .37, .83)],
  // 267: the frangible discs on the two armoured Ataka boxes' front covers (profiles/bmptT90Station.ts), 2 x 2 a box
  bmpt_t90: [-1, 1].flatMap(s => [.85, 1.05].flatMap(x => [.77, .93].map(y => turret(s * x, y, 1.695)))),
  // 267: the original Terminator's open Ataka tubes ride the cradle's arms (profiles/bmptTerminatorStation.ts RAMKA_ATAKA): the
  // gun frame, each mouth the front end cap's face, 2 x 2 a side (lower, upper)
  bmpt_terminator: [-1, 1].flatMap(s => [-.155, .155].map(y => mouth(s * .95, y, 2.032))),
  // Preserve the source battery's left-to-right, lower/upper firing order.
  aft10: [-1.035, -.505, .505, 1.035].flatMap(x => [0, 1].map(r => ({ ...mouth(x, -.025 + r * .475, 1.244), covered: true }))),
};

/** Install after donor/spec synchronization, without loading visual builders. */
export function applyFleetLauncherMuzzles(spec: FleetTankSpec): void {
  let tips = mounts[spec.id];
  const [px, py, pz] = spec.armor.turretPivot;
  const world = (x: number, y: number, z: number, pitch = 0): LauncherMuzzle => turret(x - px, y - py, z - pz, pitch);
  if (spec.id === 'warrior_tes_h') tips = [world(-.64, 2.955, .482)];
  if (spec.id === 'cv90_mk4') tips = [-1.0525, -1.3769].map(x => world(x, 2.275 + .007 * detMath.sin(.085), .303 + .007 * detMath.cos(.085), .085));
  if (spec.id === 'k21') {
    const angle = Math.PI / 9;
    // Front of the housing's two apertures, in its measured 20-degree frame.
    tips = [2.71787735, 2.90094968].map(v => world(1.254325 - .01195,
      v * detMath.cos(angle) + .4243 * detMath.sin(angle) - .0138,
      -v * detMath.sin(angle) + .4243 * detMath.cos(angle), angle));
  }
  if (spec.id === 'kurganets25') {
    tips = [
      ...[-1, 1].flatMap(s => [1.281, 1.474].map(x => ({ ...world(s * x, 2.869, -.698), shellSlots: [1] }))),
      // the rear-roof launcher's eight Bulat mouths, the container's measured exits (epokhaTurret.ts)
      ...([[3.291, [.526, .628, .732]], [3.463, [.479, .580, .686, .789, .893]]] as const)
        .flatMap(([y, xs]) => xs.map(x => ({ ...world(x, y, -2.4075), shellSlots: [2] }))),
    ];
  }
  if (tips) spec.gun.launcherMuzzles = tips.map(tip => ({ ...tip, ...(tip.shellSlots ? { shellSlots: [...tip.shellSlots] } : {}) }));
}
