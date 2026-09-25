import type { FleetTankSpec } from './specContracts.ts';
import type { LauncherMuzzle } from '../sim/launcherPolicy.ts';

// Terminal centers measured from the native builders, in final metre frames.
// These are launch exits, never spare tubes, smoke dispensers or cannon bores.
// Batteries with authored layouts keep their existing shared geometry datums.
function turret(x: number, y: number, z: number, pitch = 0, yaw = 0): LauncherMuzzle {
  return { x, y, z, frame: 'turret', pitch, yaw };
}
function mouth(x: number, y: number, z: number): LauncherMuzzle { return { x, y, z }; }
const bradley = [mouth(-.97, .04, .145), mouth(-.97, -.20, .145)];
const mounts: Readonly<Record<string, readonly LauncherMuzzle[]>> = {
  m2a2_bradley: bradley,
  ua_m2a3_bradley: bradley,
  bmp2: [turret(.06, .655 + .025 * Math.sin(.02), .155 + .025 * Math.cos(.02), .02)],
  spz_puma: [mouth(1.19, -.02, .465), mouth(1.41, -.02, .465)],
  spz_puma_s1: [.36, .59].map(y => turret(-1.02 * .9, y * .9, .839 * .9)),
  type89_light_tiger: [-1, 1].flatMap(s => [.32, .56].map(y => turret(s * 1.39 * .9, y * .9, .7175 * .9))),
  cv90_mkiv: [.42, .70].map(y => turret(-1.20 * .9, y * .9, .68 * .9)),
  type89: [-1, 1].map(s => turret(s * .92, .385 + .02 * Math.sin(.14), .285 + .02 * Math.cos(.14), .14)),
  fv510_milan: [turret(.56 * 1.1, (.92 + .0125 * Math.sin(.04)) * 1.1 * .84,
    (.927 + .0125 * Math.cos(.04)) * 1.1, Math.atan(Math.tan(.04) * .84))],
  bmpt_terminator2: [-1, 1].flatMap(s => [.335, .575].map(y => turret(s * (.93 + .011 * Math.sin(.035)), y, .668 + .011 * Math.cos(.035), 0, s * .035))),
  bwp1: [turret(.28, 1.11, .76)],
  marder1a3: [turret(.55, .92, .445)],
  m3a3_bradley: [-.115, .115].map(dy => turret(-.91, .75 + dy * .82 + .011 * Math.sin(.05), .352 + .011 * Math.cos(.05), .05)),
  upior: [turret(-.30, 1.042, .553)],
  bmpt_t90: [-1, 1].flatMap(s => [1.005, 1.245].flatMap(x => [.35, .60].map(y => turret(s * (x + .011 * Math.sin(.03)), y, .724 + .011 * Math.cos(.03), 0, s * .03)))),
  aft10_x: [-1, 1].flatMap(s => [0, 1].flatMap(c => [0, 1].map(r => ({ ...mouth(s * (.505 + c * .53), -.025 + r * .475, 1.244), covered: true })))),
};

/** Install after donor/spec synchronization, without loading visual builders. */
export function applyFleetLauncherMuzzles(spec: FleetTankSpec): void {
  let tips = mounts[spec.id];
  const [px, py, pz] = spec.armor.turretPivot;
  const world = (x: number, y: number, z: number, pitch = 0): LauncherMuzzle => turret(x - px, y - py, z - pz, pitch);
  if (spec.id === 'fv510_milan_x') tips = [world(-.64, 2.955, .482)];
  if (spec.id === 'cv90_mkiv_x') tips = [-1.0525, -1.3769].map(x => world(x, 2.275 + .007 * Math.sin(.085), .303 + .007 * Math.cos(.085), .085));
  if (spec.id === 'k21_x') {
    const angle = Math.PI / 9;
    // Front of the housing's two apertures, in its measured 20-degree frame.
    tips = [2.71787735, 2.90094968].map(v => world(1.254325 - .01195,
      v * Math.cos(angle) + .4243 * Math.sin(angle) - .0138,
      -v * Math.sin(angle) + .4243 * Math.cos(angle), angle));
  }
  if (spec.id === 'kurganets25_x') {
    tips = [
      ...[-1, 1].flatMap(s => [1.281, 1.474].map(x => ({ ...world(s * x, 2.869, -.698), shellSlots: [1] }))),
      // The dark rear discs are end caps; launch from the forward (+Z) ends.
      ...([[3.291, [.526, .628, .732]], [3.463, [.479, .580, .686, .789, .893]]] as const)
        .flatMap(([y, xs]) => xs.map(x => ({ ...world(x, y, -2.4075), shellSlots: [2] }))),
    ];
  }
  if (tips) spec.gun.launcherMuzzles = tips.map(tip => ({ ...tip, ...(tip.shellSlots ? { shellSlots: [...tip.shellSlots] } : {}) }));
}
