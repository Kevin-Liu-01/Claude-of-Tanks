// Vickers MBT Mk 1 / Vijayanta — release 262 rebuild from historical references (owner 2026-10-27: "redesign the ...
// vickers ... turrets and hullls ... based on proper historical referrences so they will no longer look so chungus").
// New first-party geometry from the published dimensions and the measured museum photographs recorded in
// docs/references/tanks/vickers_mk1.md: hull 7.29 m, 9.79 m gun forward, 3.17 m wide, 2.44 m to the turret roof and
// 2.64 m to the cupola, 0.41 m ground clearance; 520 mm track on 2.53 m centres, six road wheels a side on torsion
// bars with three return rollers, rear drive; a compact welded turret about 2.4 m wide with inward-sloping walls, a
// flat slab mantlet and the L7A1 with its fume extractor, the commander's cupola on the vehicle's right (-x) and the
// loader's hatch on the left; Centurion-pattern fenders carrying long stowage bins, the nose plate with four lamps.
import * as THREE from 'three';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';
import { KIT, FITTINGS } from './kit.ts';
import { sectionSolid, type SectionPoint } from './sectionSolid.ts';
import { roofSheet, beamBetween, blindTube } from './measuredPrimitives.ts';
import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
const { box, cylY, cylZ, torus } = KIT;

type Point = readonly [number, number, number];
export const VICKERS_MK1 = Object.freeze({
  dims: Object.freeze({ hullLengthM: 7.29, overallLengthM: 9.79, widthM: 3.17, heightM: 2.44 }),
  hull: Object.freeze({ nose: 3.645, tail: -3.645, belly: .41, innerHalfW: .98, sponsonHalfW: 1.30, fenderHalfW: 1.585, fenderY: 1.28, roofY: 1.60, engineDeckY: 1.66 }),
  turretPivot: [0, 1.60, .25] as Point,
  trunnion: [0, 2.02, 1.86] as Point,
  muzzleZ: 6.145,
  gear: Object.freeze({
    trackXc: 1.265, trackW: .52, wheelR: .38, wheelW: .30,
    wheelZs: Object.freeze([2.30, 1.44, .58, -.28, -1.14, -2.00]),
    idler: Object.freeze({ z: 3.25, y: .62, r: .30 }),
    sprocket: Object.freeze({ z: -3.20, y: .80, r: .29 }),
    rollerZs: Object.freeze([1.87, .15, -1.57]), rollerY: .95, rollerR: .09, topY: 1.07,
  }),
});
const D = VICKERS_MK1;
const [PX, PY, PZ] = D.turretPivot;
const at = (x: number, y: number, z: number): [number, number, number] => [x - PX, y - PY, z - PZ];
const local = (g: THREE.BufferGeometry): THREE.BufferGeometry => g.translate(-PX, -PY, -PZ);
function sided(ring: readonly SectionPoint[], side: number): SectionPoint[] {
  return side > 0 ? [...ring] : ring.map(([x, y]) => [-x, y] as const).reverse();
}

// ---------------------------------------------------------------------------------------------------------------
// Hull: welded, a shallow upper glacis to the nose plate, a lower nose plate to the belly, sponsons over the tracks
// with Centurion-pattern fenders and bins, the engine deck 6 cm proud of the fighting compartment roof.
// ---------------------------------------------------------------------------------------------------------------
type Station = readonly [z: number, lo: number, hi: number];
const TUB: readonly Station[] = [
  [-3.645, 1.00, 1.66], [-2.95, .41, 1.66], [-1.13, .41, 1.66], [-1.09, .41, 1.60],
  [2.40, .41, 1.60], [2.75, .41, 1.49], [3.52, .82, 1.24], [3.645, .90, 1.20],
];
// the sponsons carry the glacis across the full upper hull to the nose
const SPONSON: readonly Station[] = [[-3.645, 1.13, 1.66], [-1.13, 1.13, 1.66], [-1.09, 1.13, 1.60], [2.40, 1.13, 1.60], [2.75, 1.13, 1.49], [3.42, 1.13, 1.27]];

function hull(P: TankBuilderPort): void {
  const H = D.hull;
  const chamfered = (w: number, lo: number, hi: number): SectionPoint[] => {
    const c = Math.min(.05, (hi - lo) * .2);
    return [[-w + c, lo], [w - c, lo], [w, lo + c], [w, hi - .025], [w - .025, hi], [-w + .025, hi], [-w, hi - .025], [-w, lo + c]];
  };
  P.add('hull', sectionSolid(TUB.map(([z, lo, hi]) => ({ z, ring: chamfered(H.innerHalfW, lo, hi) }))));
  for (const side of [-1, 1]) {
    const xi = H.innerHalfW - .02, xo = H.sponsonHalfW;
    P.add('hull', sectionSolid(SPONSON.map(([z, lo, hi]) => ({ z, ring: sided([[xi, lo], [xo, lo], [xo, hi - .02], [xo - .02, hi], [xi, hi]], side) }))));
    // Centurion-pattern fender at mid-height out to the 3.17 m width, curving down over the idler and the sprocket,
    // and its four stowage bins against the sponson wall (their tops stay under the turret's traverse).
    const F = H.fenderY, a = Math.min(side * (xo - .01), side * H.fenderHalfW), b = Math.max(side * (xo - .01), side * H.fenderHalfW);
    P.addMudguard(`vickers-fender-${side}`, 'hull', roofSheet([[-3.20, a, b, F, F], [2.95, a, b, F, F]], .025));
    P.addMudguard(`vickers-fender-front-${side}`, 'hull', roofSheet([[2.95, a, b, F, F], [3.35, a, b, F - .07, F - .07],
      [3.60, a, b, F - .22, F - .22], [3.72, a, b, F - .40, F - .40]], .025));
    P.addMudguard(`vickers-fender-rear-${side}`, 'hull', roofSheet([[-3.62, a, b, F - .30, F - .30], [-3.48, a, b, F - .10, F - .10], [-3.20, a, b, F, F]], .025));
    P.addMudguard(`vickers-fender-lip-${side}`, 'hull', box(.02, .08, 6.10), side * (H.fenderHalfW - .01), F - .035, -.12);
    P.hangMudguard('vickers-front-flap', 'hullRubber', box(.24, .20, .02), side * (H.fenderHalfW - .14), F - .52, 3.72);
    P.hangMudguard('vickers-rear-flap', 'hullRubber', box(.24, .26, .02), side * (H.fenderHalfW - .14), F - .45, -3.62);
    for (const [z0, z1] of [[-3.15, -2.15], [-2.07, -1.07], [-.99, .01], [.09, 1.09], [1.17, 2.17]] as const) {
      const zc = (z0 + z1) / 2, len = z1 - z0, w = H.fenderHalfW - xo - .015, x = side * (xo + w / 2 + .005), h = .32;
      P.addEquipment('hullDetail', box(w, h, len), x, F + h / 2, zc);
      P.addEquipment('hullDetail', box(w + .01, .02, len + .02), x, F + h + .005, zc);
      for (const dz of [-len * .3, len * .3]) P.addEquipment('hullDark', box(.012, .05, .06), side * (H.fenderHalfW - .003), F + h - .06, zc + dz);
    }
  }
}

function hullFittings(P: TankBuilderPort): void {
  const H = D.hull;
  // Driver's hatch at the front right of the roof with his periscope, and the lamps on the nose plate.
  P.addHatch('hullDetail', cylY(.27, .28, .04, P.q ? 22 : 14), -.48, 1.62, 2.12);
  P.addEquipment('hullDark', box(.18, .06, .07), -.48, 1.66, 2.42);
  P.addModuleVisual('optics', 'hullGlass', box(.15, .03, .012), -.48, 1.665, 2.456);
  for (const x of [-.66, -.34, .34, .66]) {
    P.addEquipment('hullDetail', cylZ(.075, .10, P.q ? 16 : 10), x, 1.14, 3.60);
    P.addEquipment('hullGlass', markVehicleNightLens(cylZ(.058, .02, P.q ? 16 : 10), 'headlight'), x, 1.14, 3.655);
  }
  for (const x of [-.78, .78]) {
    P.addEquipment('hullDetail', box(.12, .14, .12), x, .80, 3.52, -.6, 0, 0);
    P.addEquipment('hullDark', torus(.05, .015, 12, 6), x, .76, 3.58, Math.PI / 2, 0, 0);
  }
  P.addEquipment('hullDetail', box(1.60, .04, .06), 0, 1.55, 2.62, -.30, 0, 0);
  // Engine deck: louvred decks either side of the centre line, filler caps, the gun crutch folded on the rear deck.
  for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
    const z = -1.55 - i * .62, x = side * .55;
    P.addEquipment('hullDetail', box(.96, .03, .56), x, H.engineDeckY + .015, z);
    for (let k = 0; k < (P.q ? 8 : 5); k++) P.addEquipment('hullDark', box(.90, .010, .02), x, H.engineDeckY + .032, z - .23 + k * (.46 / ((P.q ? 8 : 5) - 1)));
  }
  for (const side of [-1, 1]) P.addEquipment('hullDetail', cylY(.07, .07, .03, 12), side * 1.20, H.engineDeckY + .015, -3.40);
  P.addEquipment('hullDetail', box(.50, .05, .10), 0, H.engineDeckY + .025, -3.45);
  for (const x of [-.18, .18]) P.addEquipment('hullDetail', beamBetween([x, H.engineDeckY + .02, -3.42], [x, H.engineDeckY + .05, -3.05], .02, 8));
  // Rear plate: the cooling-air louvre, two exhaust silencers on the rear fenders, tail lights, the towing pintle.
  P.addEquipment('hullDark', box(1.30, .30, .03), 0, 1.40, -3.66);
  for (let k = 0; k < 5; k++) P.addEquipment('hullDetail', box(1.26, .012, .045), 0, 1.28 + k * .06, -3.675);
  for (const side of [-1, 1]) {
    P.addEquipment('hullDark', cylZ(.11, .62, P.q ? 16 : 10), side * 1.28, 1.30, -3.30);
    P.addEquipment('hullDark', cylZ(.06, .10, 10), side * 1.28, 1.30, -3.65);
    P.addEquipment('hullDetail', box(.14, .09, .05), side * 1.05, 1.55, -3.665);
    P.addEquipment('hullGlass', markVehicleNightLens(box(.10, .045, .01), 'marker'), side * 1.05, 1.55, -3.692);
  }
  P.addEquipment('hullDark', torus(.06, .018, 12, 6), 0, 1.06, -3.68, Math.PI / 2, 0, 0);
  KIT.towCable(P, [[-1.20, 1.67, -1.30], [-1.22, 1.67, -2.60], [-.90, 1.67, -3.30]]);
  const num = P.spec.visual.number || '';
  for (const side of [-1, 1]) P.decal('hull', 'number', num, .24, [side * (H.fenderHalfW + .006), H.fenderY + .17, -.49], side * Math.PI / 2);
}

function runningGear(P: TankBuilderPort): void {
  const G = D.gear;
  const shoeDims = { padHeight: .028, grouserHeight: .010, webHeight: .014, hornHeight: .045, pinRadius: .007, pinCentreY: 0 };
  const botY = KIT.groundSeatBotY(P.spec, { trackTh: .024, trackShoeDimensions: shoeDims });
  const wheelY = KIT.seatedWheelY(botY, .024, G.wheelR);
  const rollers = G.rollerZs.map((z) => ({ z, y: G.rollerY, r: G.rollerR }));
  P.gear = KIT.buildRunningGear(P, {
    style: 'dished', wheelR: G.wheelR, wheelY, wheelW: G.wheelW, wheelZs: [...G.wheelZs], xc: G.trackXc,
    trackW: G.trackW, trackTh: .024, sprocket: G.sprocket, idler: G.idler, rollers, returnRollerWidthM: .16,
    topY: G.topY, botY, linkPitchM: .15, trackShoeDimensions: shoeDims,
    loopPoints: KIT.trackLoopPoints({
      sprocket: G.sprocket, idler: G.idler, contact: { zF: G.wheelZs[0] + .08, zR: G.wheelZs[G.wheelZs.length - 1] - .08 },
      botY, topY: G.topY, sag: .014,
      endWheels: KIT.endRoadWheels([...G.wheelZs], wheelY, G.wheelR),
      supports: rollers.map((r) => ({ z: r.z, y: r.y + r.r + .018 })),
    }),
    arms: true, coveredTop: false, paintedEnds: true, rigidLinkChords: true,
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Turret: welded rolled plate, walls leaning in 12 degrees, a flat roof, a short wedge front to the slab mantlet and
// a bustle over the engine deck.
// ---------------------------------------------------------------------------------------------------------------
// [z, half-width at the foot, half-width at the roof, underside, roof]
type TurretStation = readonly [z: number, wLo: number, wHi: number, lo: number, hi: number];
const TURRET: readonly TurretStation[] = [
  [-1.08, .92, .82, 1.84, 2.36], [-.82, 1.08, .92, 1.70, 2.44], [-.30, 1.17, 1.00, 1.66, 2.44],
  [1.10, 1.17, 1.00, 1.66, 2.44], [1.58, .96, .80, 1.67, 2.40], [1.88, .62, .48, 1.72, 2.30],
];
function turret(P: TankBuilderPort): void {
  const ring = ([, wLo, wHi, lo, hi]: TurretStation): SectionPoint[] => {
    const c = .04, r = .06;
    return [[-wLo + c, lo], [wLo - c, lo], [wLo, lo + c], [wHi + .01, hi - r], [wHi - r, hi], [-wHi + r, hi], [-wHi - .01, hi - r], [-wLo, lo + c]];
  };
  P.add('turret', local(sectionSolid(TURRET.map((s) => ({ z: s[0], ring: ring(s) })), { sideQuadDiagonal: 'convex' })));
  P.add('turret', cylY(.95, .95, .10, P.q ? 40 : 24), ...at(0, 1.59, D.turretPivot[2]));
  // Turret stowage: a bin on each flank and the bustle rack.
  for (const side of [-1, 1]) {
    const z0 = side < 0 ? -.75 : -.80, z1 = side < 0 ? .55 : .70;
    P.addEquipment('turretDetail', box(.16, .34, z1 - z0), ...at(side * 1.20, 1.98, (z0 + z1) / 2), 0, 0, side * -.21);
    P.addEquipment('turretDetail', box(.17, .02, z1 - z0 + .02), ...at(side * 1.165, 2.16, (z0 + z1) / 2), 0, 0, side * -.21);
  }
  P.addEquipment('turretDetail', box(1.70, .03, .36), ...at(0, 1.86, -1.25));
  for (const x of [-.82, -.27, .27, .82]) P.addEquipment('turretDetail', box(.025, .34, .025), ...at(x, 2.04, -1.42));
  P.addEquipment('turretDetail', box(1.68, .025, .025), ...at(0, 2.20, -1.42));
  P.addEquipment('turretCloth', box(1.40, .22, .30), ...at(0, 1.99, -1.26));
  // Commander's cupola (right) with its sight block and 7.62 mm L7 on the cupola mount; loader's hatch (left).
  const cx = -.50, cz = -.05, roof = 2.44;
  P.addCupola('turret', cylY(.40, .42, .10, P.q ? 30 : 18), ...at(cx, roof + .05, cz));
  P.addCupola('turret', cylY(.33, .35, .10, P.q ? 28 : 16), ...at(cx, roof + .15, cz));
  for (let i = 0; i < 7; i++) {
    const a = -1.65 + i * .55;
    P.addEquipment('turretDark', box(.09, .06, .05), ...at(cx + Math.sin(a) * .34, roof + .15, cz + Math.cos(a) * .34), 0, a, 0);
    P.addModuleVisual('optics', 'turretGlass', box(.07, .04, .01), ...at(cx + Math.sin(a) * .37, roof + .15, cz + Math.cos(a) * .37), 0, a, 0);
  }
  P.addHatch('turretDetail', cylY(.27, .29, .04, P.q ? 22 : 14), ...at(cx, roof + .22, cz));
  {
    const mg = FITTINGS.pintleMG({ mats: P.mats, cls: 'mag58', tone: 'two-tone', elev: .06, scale: 1.0, seed: 23, ammo: true,
      shield: 'low', barrelBridge: true, working: true, ridingCradle: true });
    mg.name = 'vickers_mk1_commander_roof_machine_gun';
    mg.position.set(...at(cx + .26, roof + .20, cz - .06));
    mg.rotation.y = .04;
    mg.userData.stationVariant = 'vickers-mk1-cupola-l7-r262';
    mg.userData.forwardFacing = true;
    P.turretG.add(mg);
    P.turretG.userData.vickersRoofMachineGunReceipt = Object.freeze({
      revision: 'vickers-mk1-cupola-l7-r262', weaponClass: 'mag58', supportBucket: 'turretEquipment',
      forwardFacing: true, armorEnvelopeExcluded: true,
    });
  }
  P.addHatch('turretDetail', cylY(.29, .30, .04, P.q ? 22 : 14), ...at(.48, roof + .02, -.20));
  P.addEquipment('turretDark', torus(.29, .016, P.q ? 22 : 14, 6), ...at(.48, roof + .04, -.20), Math.PI / 2, 0, 0);
  // Gunner's sight head ahead of the cupola, loader's periscope, vents and lifting eyes.
  P.addEquipment('turretDetail', box(.24, .13, .26), ...at(-.42, roof + .065, .72));
  P.addModuleVisual('optics', 'turretGlass', box(.18, .05, .008), ...at(-.42, roof + .085, .855));
  P.addEquipment('turretDetail', box(.14, .07, .14), ...at(.50, roof + .035, .55));
  P.addEquipment('turretDetail', cylY(.09, .10, .05, 12), ...at(.10, roof + .025, -.75));
  for (const [x, z] of [[-.95, .90], [.95, .90], [-.80, -.85], [.80, -.85]] as const) {
    P.addEquipment('turretDark', torus(.04, .013, 10, 6), ...at(x, roof + .04, z));
  }
  for (const [x, z] of [[-.72, -.92], [.72, -.92]] as const) {
    P.addEquipment('turretDetail', cylY(.045, .055, .08, 10), ...at(x, roof + .04, z));
    P.addEquipment('turretDark', cylY(.008, .011, 1.8, 6), ...at(x, roof + .98, z));
  }
  // Six-barrel smoke dischargers on each cheek, splayed outward.
  for (const side of [-1, 1]) {
    const bx = side * 1.02, bz = 1.30, by = 2.08, yaw = side * .70;
    P.addEquipment('turretDetail', box(.30, .16, .10), ...at(bx, by - .01, bz - .05), 0, yaw, 0);
    for (let row = 0; row < 2; row++) for (let k = 0; k < 3; k++) {
      const dx = (k - 1) * .09, ox = Math.cos(yaw) * dx, oz = -Math.sin(yaw) * dx;
      P.addEquipment('turretDetail', markSmokeTube(blindTube(.035, .025, .18, .10, P.q ? 12 : 8), [0, 0, 1], true).rotateX(-.25).rotateY(yaw),
        ...at(bx + ox, by - .04 + row * .08, bz + oz + .04));
    }
  }
}

/** L7A1 105 mm on its trunnion: flat slab mantlet with the 12.7 mm ranging gun beside the tube, fume extractor at
 *  about 37 % of the exposed tube, a plain muzzle. */
function gun(P: TankBuilderPort): void {
  const T = D.trunnion[2];
  const lathe = (rows: readonly (readonly [number, number])[], segments = P.q ? 28 : 16): THREE.BufferGeometry =>
    new THREE.LatheGeometry(rows.map(([z, r]) => new THREE.Vector2(r, z - T)), segments).rotateX(Math.PI / 2);
  P.add('gun', lathe([[1.00, 0], [1.00, .10], [2.22, .10], [2.24, .084], [3.50, .079], [3.54, .106], [3.98, .106],
    [4.02, .075], [6.10, .066], [6.11, .072], [6.145, .072], [6.145, 0]]));
  P.add('gunDark', lathe([[3.52, .100], [3.52, .110], [3.58, .110], [3.58, .100]], P.q ? 22 : 12));
  P.add('gunDark', lathe([[3.94, .100], [3.94, .110], [4.00, .110], [4.00, .100]], P.q ? 22 : 12));
  // the slab mantlet: a thick flat shield on the trunnions, bevelled at its edges
  P.add('gunMount', sectionSolid([1.92, 2.22].map((z) => ({ z: z - T, ring: [[-.26, -.24], [.26, -.24], [.30, -.19], [.30, .21], [.26, .26], [-.26, .26], [-.30, .21], [-.30, -.19]] as SectionPoint[] }))));
  P.add('gunMount', lathe([[2.20, 0], [2.20, .13], [2.32, .10], [2.32, 0]], P.q ? 20 : 12));
  P.add('gunDark', cylZ(.026, .30, 10), .19, -.06, 2.30 - T);
  P.muzzleZ = D.muzzleZ - T;
}

export function buildVickersMk1(P: TankBuilderPort): void {
  P.hullG.position.set(0, 0, 0);
  P.turretG.position.set(...D.turretPivot);
  P.gunG.position.set(D.trunnion[0] - PX, D.trunnion[1] - PY, D.trunnion[2] - PZ);
  P.topY = 2.44 - PY;
  hull(P);
  hullFittings(P);
  runningGear(P);
  turret(P);
  gun(P);
  P.turretG.userData.turretSeatRiseM = .08;
  P.hullG.userData.vickersMk1Rebuild = Object.freeze({ release: 262, reference: 'docs/references/tanks/vickers_mk1.md' });
}
