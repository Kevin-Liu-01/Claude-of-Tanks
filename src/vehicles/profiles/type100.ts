import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';
import { antennaPart } from './antennaPart.ts';
import { weaponAssembly } from './weaponStock.ts';
// Original owner-directed Chinese IFV, 2026-09-19. Photographs inform the
// fabrication language; dimensions and unmanned layout are authored game design.
// Authority: docs/references/concepts/type100-ifv-20260919.json.
import * as THREE from 'three';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';
import { KIT } from './kit.ts';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import { openTube, mirrorX } from './europeSourcePrimitives.ts';
import { buildType100RunningGear } from './type100RunningGear.ts';
import { addClampFrame, addLaunchCanister, elevationSector, type LaunchCanister } from './missileCanisterStock.ts';

const { cylX, cylY, cylZ } = KIT;
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const part = (g: THREE.BufferGeometry, name: string) => {
  g.userData.type100 = name;
  return g;
};
export const TYPE100_DATUMS = Object.freeze({
  roof: 2.00, belly: .40, sponsonFloor: 1.30, tubHalf: 1.05,
  stern: -3.63, nose: 3.50, shoulderHalf: 1.72, skirtHalf: 1.83,
  ring: [0, 2.02, -.15] as const, gun: [0, .53, .65] as const,
  turretRear: -1.16, turretFront: 1.20, turretRoof: .78,
  barrelLength: 2.35, barrelRadius: .045,
  launcherColumns: [-1.18, 1.18], launcherRows: [.12, .44],
  launcherRear: -.55, launcherMouth: 1.00, launcherOuter: .14, launcherInner: .11,
});
const D = TYPE100_DATUMS;
// 2026-10-21 (owner: "follow that of the object 695, and tagil"): round HJ-10 canisters in the Object 695 vocabulary,
// a proud collar (D.launcherOuter) around a dark-lined bore (D.launcherInner) and a sealed terminal 90 mm deep.
export const TYPE100_LAUNCH_CANISTER: LaunchCanister = Object.freeze({
  bodyRadius: .120, collarRadius: D.launcherOuter, boreRadius: D.launcherInner, capRadius: .128, bandRadius: .127,
  rear: D.launcherRear, mouth: D.launcherMouth, collarLength: .15, recess: .09,
  bands: Object.freeze([-.28, .66]), segments: [20, 12] as const,
});

// The lower tub stays inside the belt lanes. Broad shoulders only emerge above
// the actual sprocket return run; the nose has a continuous shallow upper plane.
function hullSection(z: number, width: number, roof: number, bottom = .40): SolidSection {
  const floor = Math.max(D.sponsonFloor, bottom + .02);
  const seam = Math.max(floor + .025, roof - .15);
  return { z, ring: [[-.975, bottom], [.975, bottom], [1.05, bottom + .07],
    [1.05, floor], [width, floor], [width, seam], [width - .12, roof],
    [-width + .12, roof], [-width, seam], [-width, floor],
    [-1.05, floor], [-1.05, bottom + .07]] };
}
function hull(P: TankBuilderPort): void {
  P.add('hull', part(sectionSolid([
    hullSection(-3.63, 1.49, 2.00, .55), hullSection(-3.30, 1.72, 2.00),
    hullSection(1.80, 1.72, 2.00), hullSection(2.52, 1.66, 1.746),
    hullSection(3.28, 1.60, 1.478, 1.02), hullSection(3.50, 1.56, 1.40, 1.18),
  ]), 'hull-body'));
  for (const side of [-1, 1]) hullSide(P, side);
}

function hullSide(P: TankBuilderPort, s: number): void {
  // Four broad upper armor modules establish the straight Chinese IFV shoulder.
  for (const z of [-2.51, -1.29, -.07, 1.15]) {
    P.addExternalArmor('hull', part(box(.11, .43, 1.17), 'side-armor'), s * 1.755, 1.665, z);
    for (const end of [-1, 1]) {
      P.addEquipment('hullDark', part(cylX(.023, .012, P.q ? 12 : 8), 'armor-fastener'), s * 1.816, 1.785, z + end * .47);
    }
  }
  P.addEquipment('hull', part(box(.14, .055, 6.54), 'fender-rail'), s * 1.75, 1.3275, -.10);
  for (let i = 0; i < 6; i++) {
    const z = -2.65 + i * 1.07;
    const skirt = sectionSolid([
      { z: -.51, ring: [[-.028, .72], [.028, .72], [.028, 1.30], [-.028, 1.30]] },
      { z: .40, ring: [[-.028, .65], [.028, .65], [.028, 1.30], [-.028, 1.30]] },
      { z: .51, ring: [[-.028, .75], [.028, .75], [.028, 1.30], [-.028, 1.30]] },
    ]);
    P.addExternalArmor('hull', part(skirt, 'lower-skirt'), s * 1.802, 0, z);
    for (const dz of [-.32, .32]) P.addEquipment('hull', part(cylZ(.045, .16, P.q ? 12 : 8), 'skirt-hinge'), s * 1.79, 1.29, z + dz);
  }
  P.addEquipment('hullRubber', part(box(.48, .95, .035), 'rear-mudflap'), s * 1.40, .85, -3.43);
  // Restrained side grab rails, seated on both ends.
  for (const z of [-2.85, 1.34]) {
    P.addEquipment('hullDark', part(cylZ(.016, .38, P.q ? 10 : 6), 'side-handle'), s * 1.48, 2.075, z);
    for (const dz of [-.17, .17]) P.addEquipment('hullDark', part(box(.035, .082, .035), 'handle-foot'), s * 1.48, 2.037, z + dz);
  }
}

function deckGrille(P: TankBuilderPort, x: number, z: number): void {
  P.addEquipment('hullDark', part(box(.80, .014, .91), 'engine-grille-bed'), x, 2.005, z);
  for (const dx of [-.42, .42]) P.addEquipment('hull', part(box(.06, .048, .99), 'engine-grille-frame'), x + dx, 2.024, z);
  for (const dz of [-.47, .47]) P.addEquipment('hull', part(box(.80, .048, .05), 'engine-grille-frame'), x, 2.024, z + dz);
  for (let i = 0; i < 9; i++) P.addEquipment('hull', part(box(.80, .027, .038), 'engine-grille-louvre'), x, 2.030, z - .40 + i * .10);
}
function hatch(P: TankBuilderPort, x: number, z: number, w: number, depth: number, name: string): void {
  P.addHatch('hull', part(box(w, .035, depth), name), x, 2.0135, z);
  for (const dx of [-w * .32, w * .32]) P.addEquipment('hull', part(cylX(.035, .12, P.q ? 12 : 8), 'hatch-hinge'), x + dx, 2.028, z - depth / 2 + .02);
  P.addEquipment('hullDark', part(box(.20, .022, .035), 'hatch-handle'), x, 2.043, z + depth * .25);
}
function bowAndDeck(P: TankBuilderPort): void {
  // Front-left driver and front-right powerpack leave an uninterrupted rear troop roof.
  hatch(P, -.87, 1.12, .70, .72, 'driver-hatch');
  for (const dx of [-.22, 0, .22]) {
    P.addEquipment('hull', part(box(.17, .072, .16), 'driver-periscope'), -.87 + dx, 2.036, 1.55);
    P.addModuleVisual('optics', 'hullGlass', part(box(.125, .045, .008), 'driver-glass'), -.87 + dx, 2.040, 1.632);
  }
  deckGrille(P, .90, 1.20);
  P.addEquipment('hull', part(box(.70, .045, .38), 'engine-service-cover'), .90, 2.0225, .40);
  for (const x of [-.53, .53]) hatch(P, x, -2.42, .90, 1.16, 'troop-roof-hatch');
  // Recessed exhaust on the forward right flank with a finite heat shield.
  P.addEquipment('hullDark', part(box(.04, .16, .44), 'exhaust-recess'), 1.81, 1.67, 1.25);
  for (let i = 0; i < 4; i++) P.addEquipment('hull', part(box(.044, .02, .44), 'exhaust-louvre'), 1.825, 1.61 + i * .04, 1.25);
  for (const s of [-1, 1]) {
    P.addEquipment('hull', part(box(.27, .13, .10), 'headlight-body'), s * 1.20, 1.48, 3.32);
    P.addModuleVisual('optics', 'hullGlass', part(markVehicleNightLens(box(.20, .07, .012), 'headlight'), 'headlight-glass'), s * 1.20, 1.48, 3.377);
    for (const dx of [-.15, .15]) P.addEquipment('hull', part(box(.025, .17, .18), 'headlight-guard'), s * 1.20 + dx, 1.475, 3.30);
    P.addEquipment('hull', part(box(.33, .025, .18), 'headlight-guard'), s * 1.20, 1.5525, 3.30);
    P.addEquipment('hull', part(cylZ(.09, .075, P.q ? 16 : 10), 'bow-tow-boss'), s * .69, 1.26, 3.51);
  }
  P.addEquipment('hull', part(box(2.72, .035, .055), 'bow-edge-strip'), 0, 1.409, 3.47);
}
function stern(P: TankBuilderPort): void {
  // Closed troop ramp, separate framed personnel door and actual bottom hinges.
  P.addEquipment('hullDark', part(box(1.96, 1.29, .038), 'ramp-gasket'), 0, 1.235, -3.64);
  P.addHatch('hull', part(box(1.86, 1.20, .046), 'troop-ramp'), 0, 1.235, -3.667);
  P.addEquipment('hullDark', part(box(.67, .87, .016), 'personnel-door-gasket'), -.40, 1.27, -3.695);
  P.addHatch('hull', part(box(.61, .81, .022), 'personnel-door'), -.40, 1.27, -3.712);
  for (const x of [-.69, .69]) P.addEquipment('hull', part(cylX(.065, .33, P.q ? 16 : 8), 'ramp-hinge'), x, .61, -3.685);
  for (const y of [.99, 1.53]) P.addEquipment('hull', part(cylY(.023, .023, .14, 8), 'door-hinge'), -.72, y, -3.729);
  P.addEquipment('hullDark', part(box(.032, .16, .03), 'door-handle'), -.15, 1.29, -3.737);
  for (const s of [-1, 1]) {
    P.addEquipment('hull', part(box(.25, .35, .055), 'tail-light-guard'), s * 1.27, 1.67, -3.633);
    P.addModuleVisual('optics', 'hullGlass', part(box(.17, .075, .016), 'tail-light'), s * 1.27, 1.74, -3.668);
    P.addEquipment('hullDark', part(box(.17, .13, .018), 'tail-light-blackout'), s * 1.27, 1.60, -3.668);
  }
}

function turretSection(z: number, width: number, roof: number): SolidSection {
  return { z, ring: [[-width + .09, .045], [width - .09, .045], [width, .18],
    [width, roof - .20], [width - .16, roof], [-width + .16, roof],
    [-width, roof - .20], [-width, .18]] };
}
function turretBody(P: TankBuilderPort): void {
  P.add('turretDark', part(cylY(.85, .88, .10, P.q ? 48 : 24), 'turret-bearing'), 0, .010, 0);
  P.add('turret', part(sectionSolid([
    turretSection(-1.16, .72, .61), turretSection(-.88, .96, .78),
    turretSection(.28, .96, .78),
  ]), 'turret-body'));
  // Two independent closed cheeks leave genuine cradle/pitch clearance at center.
  for (const s of [-1, 1]) {
    const cheek = sectionSolid([
      { z: .27, ring: [[.28, .045], [.96, .18], [.96, .58], [.80, .78], [.28, .78]] },
      { z: 1.20, ring: [[.28, .045], [.60, .18], [.60, .40], [.47, .59], [.28, .59]] },
    ]);
    P.add('turret', part(s < 0 ? mirrorX(cheek) : cheek, 'turret-cheek'));
    P.add('turret', part(cylX(.17, .70, P.q ? 24 : 12), 'pitch-bearing'), s * .62, .53, .65);
    // Fixed elevation drive: a gearbox on the cheek under the bearing it turns, its motor ahead. Both stay inboard
    // of x .95; the pitching pods start at .9735, so the drive is clear at every pose.
    P.addEquipment('turret', part(box(.19, .16, .24), 'elevation-gearbox'), s * .855, .285, .65);
    P.addEquipment('turretDark', part(cylZ(.055, .16, P.q ? 16 : 10), 'elevation-motor'), s * .88, .26, .84);
    // Its pinion, straight below the pitch axis, stands 2 mm off the tips of the pod's elevation sector.
    P.addEquipment('turretDark', part(cylX(.032, .0395, P.q ? 16 : 10), 'elevation-pinion'), s * .96475, .218, .65);
  }
  P.add('turret', part(box(.57, .08, .94), 'cradle-floor'), 0, .085, .73);
  P.addHatch('turret', part(box(.65, .035, .54), 'turret-service-hatch'), 0, .7975, -.38);
  for (const x of [-.22, .22]) P.addEquipment('turret', part(cylX(.03, .13, 8), 'turret-hatch-hinge'), x, .81, -.65);
}
function cannon(P: TankBuilderPort): void {
  P.addEquipment('gunMount', part(box(.48, .40, .39), 'moving-mantlet'), 0, 0, .015);
  P.addEquipment('gunMount', part(cylZ(.09, .23, P.q ? 24 : 14), 'barrel-slide'), 0, 0, .30);
  P.add('gun', part(cylZ(.065, .38, P.q ? 24 : 14), 'cannon-receiver'), 0, 0, .24);
  openTube(P, D.barrelRadius, .39, D.barrelLength, .0225);
  // Fabricated rectangular shroud: four stock rails and spaced webs. Slots are
  // real air, not dark decals; the circular recoiling tube passes through it.
  for (const x of [-.095, .095]) for (const y of [-.095, .095]) {
    P.addEquipment('gunMount', part(box(.025, .055, 1.61), 'shroud-rail'), x, y, 1.045);
  }
  for (const z of [.29, .60, .91, 1.22, 1.53, 1.82]) {
    for (const s of [-1, 1]) {
      P.addEquipment('gunMount', part(box(.215, .025, .15), 'shroud-web'), 0, s * .095, z);
      P.addEquipment('gunMount', part(box(.025, .165, .15), 'shroud-web'), s * .095, 0, z);
    }
  }
}
function launchers(P: TankBuilderPort): void {
  const C = TYPE100_LAUNCH_CANISTER, n = P.q ? 20 : 12;
  for (const x of D.launcherColumns) {
    const s = Math.sign(x);
    for (const y of D.launcherRows) addLaunchCanister(P, part, C, x, y);
    for (const z of C.bands) addClampFrame(P, part, C, [x], D.launcherRows, z);
    // Ladder cradle: a saddle under each frame from the inner plate to the outer post, joined by two rails; the inner
    // plate crosses the inner posts and the bottom and row straps.
    for (const z of C.bands) {
      P.addEquipment('gunMount', part(new THREE.BoxGeometry(.336, .045, .08), 'launcher-saddle'), x - s * .012, -.0575, z);
    }
    for (const dx of [-.11, .11]) {
      P.addEquipment('gunMount', part(new THREE.BoxGeometry(.04, .036, 1.00), 'launcher-rail'), x + dx, -.0575, .19);
    }
    P.addEquipment('gunMount', part(new THREE.BoxGeometry(.03, .43, 1.04), 'launcher-cradle-plate'), x - s * .17, .085, .19);
    // Trunnion: the hub flange stands 3.5 mm off the turret bearing's end face; the journal runs inside both.
    P.addEquipment('gunMount', part(cylX(.125, .024, n), 'launcher-hub'), x - s * .1945, 0, 0);
    P.addEquipment('gunMountDark', part(cylX(.075, .09, n), 'launcher-journal'), x - s * .23, 0, 0);
    // Elevation sector on the hub, meshing with the cheek pinion below the axis over the whole -10..+45 degree range.
    P.addEquipment('gunMountDark', part(elevationSector(.10, .26, .018, -142, -73, 14, .023, P.q), 'elevation-sector'),
      x - s * .194, 0, 0);
  }
}
function sight(P: TankBuilderPort, x: number, y: number, z: number, w: number, h: number, d: number, name: string): void {
  const wall = .03;
  P.addEquipment('turret', part(box(w, h, wall), name + '-back'), x, y, z - d / 2 + wall / 2);
  for (const s of [-1, 1]) {
    P.addEquipment('turret', part(box(w, wall, d), name + '-frame'), x, y + s * (h - wall) / 2, z);
    P.addEquipment('turret', part(box(wall, h - .06, d), name + '-frame'), x + s * (w - wall) / 2, y, z);
  }
  P.addModuleVisual('optics', 'turretGlass', part(box(w - .06, h - .06, .012), name + '-lens'), x, y, z + d / 2 - .055);
}
function sensors(P: TankBuilderPort): void {
  const n = P.q ? 24 : 12;
  P.addEquipment('turret', part(box(.34, .065, .34), 'gunner-sight-seat'), -.48, .8025, -.05);
  sight(P, -.48, .94, -.05, .32, .22, .31, 'gunner-sight');
  P.addEquipment('turret', part(cylY(.135, .16, .12, n), 'panoramic-bearing'), .42, .835, -.58);
  sight(P, .42, 1.00, -.58, .29, .22, .28, 'panoramic-sight');
  for (const s of [-1, 1]) {
    // Smoke dispensers sit on short sloped brackets, clear of pitchable pods.
    P.addEquipment('turret', part(box(.10, .16, .40), 'smoke-bracket'), s * .90, .32, -.60);
    for (let i = 0; i < 3; i++) P.addEquipment('turretDark', part(markSmokeTube(cylZ(.047, .21, P.q ? 14 : 8)), 'smoke-tube'), s * .96, .38, -.75 + i * .135, -.48, s * .65, 0);
    P.addEquipment('turret', part(cylY(.04, .05, .09, 10), 'antenna-foot'), s * .58, .80, -.80);
    P.addEquipment('turretDark', antennaPart(part(cylY(.009, .013, .70, P.q ? 10 : 6), 'antenna-whip')), s * .58, 1.19, -.80);
  }
  P.topY = 1.54;
}
function buildType100(P: TankBuilderPort): void {
  hull(P); bowAndDeck(P); stern(P); P.gear = buildType100RunningGear(P, KIT);
  turretBody(P); cannon(P); weaponAssembly(P, () => launchers(P)); sensors(P);
  if (P.geometryReceipt) P.hullG.userData.type100Receipt = Object.freeze({
    architecture: 'type100-chinese-ifv-r6', datums: D, roadWheelsPerSide: 6,
    readyMissileCells: 4, stowedMissiles: 4, frontEngine: true, crewFrame: 'hull',
  });
}
export const TYPE100_PROFILES = Object.freeze({ type100: Object.freeze({ build: buildType100 }) }) satisfies VehicleProfileRecord;
