import { buildAbramsSourceXHullCooperativeSteps } from './abramsSourceXHull.ts';
import { buildAbramsSourceXEquipmentCooperativeSteps } from './abramsSourceXEquipment.ts';
import { drainTankBuild, type TankProfileBuild } from '../tankBuildCooperation.ts';
// Owner-supplied SEP v2 study, rebuilt as independent first-party solids.
// This profile never imports a legacy Abrams builder or an external model.
import { KIT, orientedSlab } from './kit.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { planeBoundedArmor, type ArmorPlane, type XYZ } from './abramsSourceXGeometry.ts';
import { bindAbramsSourceXStockEra } from './abramsSourceXEra.ts';
import { ABRAMS_SOURCE_X_FRAME } from '../abramsSourceXDatums.ts';
export { ABRAMS_SOURCE_X_FRAME } from '../abramsSourceXDatums.ts';

// Inferred articulation from the source's bearing circle and level bore.
// These are authoring joints: OBJ has no skeleton. Their provenance is in
// the source study, independently of any candidate envelope fitting.
export function abramsSourceXConfiguration(id: string) {
  const a1 = id === 'm1a1_x' || id === 'm1a1ha_x' || id === 'ua_m1a1_x';
  const sepv3 = id === 'm1a2_sepv3_x';
  const curvedArat = id === 'm1a2_sepv2_x';
  return { a1, sepv3, curvedArat, urbanArmor: curvedArat || id === 'm1a2_tusk_x',
    ukrainian: id === 'ua_m1a1_x' };
}

function turretSlab(P: TankBuilderPort, corners: readonly XYZ[]): void {
  const t = ABRAMS_SOURCE_X_FRAME.turret;
  const p = corners.map(c => [c[0] - t[0], c[1] - t[1], c[2] - t[2]] as [number, number, number]);
  P.add('turret', orientedSlab(p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7]));
}

function buildTurretArmor(P: TankBuilderPort): void {
  // Sparse measured plane constraints, independently built topology. The
  // source has unequal cheeks and a two-stage rising aft belly. Keep that
  // asymmetry about the bearing instead of fitting a mirrored family box.
  const rightSide: ArmorPlane = [.861624, .507547, 0, 2.159152];
  const leftSide: ArmorPlane = [-.86164, .507521, 0, 2.276882];
  const roof: ArmorPlane = [0, 1, 0, 2.360795];
  const floor: ArmorPlane = [0, -1, 0, -1.574195];
  const addArmor = (planes: readonly ArmorPlane[]) => {
    const t = ABRAMS_SOURCE_X_FRAME.turret;
    const solid = planeBoundedArmor(planes);
    solid.translate(-t[0], -t[1], -t[2]);
    P.add('turret', solid);
  };
  const rearStock: ArmorPlane[] = [rightSide, leftSide, roof, floor,
    [.08694,.996214,0,2.423304], [-.093856,.995073,.031953,2.419014],
    [.064548,.991802,.11028,2.382967], [-.063661,.991288,.115304,2.397732],
    [0,-.993585,-.113089,-1.491789], [0,-.707085,-.707128,.157226],
    [0,0,-1,2.284635], [0,0,1,.376045],
  ];
  // The rear central blow-out-panel box remains full-height. Only its two
  // outer corners taper downward at the tail; a full-width bevel would cut
  // away the actual center roof and counterfeit the under-bustle outline.
  const corner = (side: ArmorPlane, flat: ArmorPlane, diagonal: ArmorPlane) => {
    // Adjacent real cap faces form an upper envelope. Split the XZ domain
    // at their intersection; applying both halfspaces would instead carve
    // away a real 18.5mm wedge. These closed pieces share only their seam.
    const split: ArmorPlane = [flat[0] / flat[1] - diagonal[0] / diagonal[1], 0,
      flat[2] / flat[1] - diagonal[2] / diagonal[1],
      flat[3] / flat[1] - diagonal[3] / diagonal[1]];
    const reverse: ArmorPlane = [-split[0], 0, -split[2], -split[3]];
    addArmor([...rearStock, side, split, flat]);
    addArmor([...rearStock, side, reverse, diagonal]);
  };
  corner([1,0,0,-1.091], [0,.70079178,-.71336588,3.059824146],
    [-.059561618165,.68046172728,-.730358987998,3.121734965187]);
  corner([-1,0,0,-.954], [0,.70079178,-.71336588,3.059831163],
    [.059414765773,.680475188547,-.730358407482,3.113469048298]);
  addArmor([...rearStock, [-1,0,0,1.091], [1,0,0,.954]]);
  P.add('turret', KIT.cylY(1.308, 1.308, .058, 64), 0, -.002, 0);

  // Full-depth closed cheek bodies leave the measured 633 mm central bay
  // open. The gun stock, rather than an invisible filler, occupies that bay.
  addArmor([leftSide, roof, floor, [1,0,0,-.410028], [0,0,-1,-.376045],
    [-.363382,.515021,.776342,2.888263],
    [-.063661,.991288,.115304,2.397732],
    [-.070708,-.991558,.108686,-1.300549],
  ]);
  addArmor([rightSide, roof, floor, [-1,0,0,-.222991], [0,0,-1,-.376045],
    [.510997,.499844,.699312,2.674797],
    [.064548,.991802,.11028,2.382967],
    [.060309,-.995584,.071938,-1.389875],
  ]);
  // A short center stock closes the roof behind, not across, the gun mouth.
  addArmor([[1,0,0,.222991],[-1,0,0,.410028],floor,
    [0,.992939,.118622,2.38873], [0,0,-1,-.376045], [0,0,1,1.468495],
  ]);
  turretSlab(P, [
    [-.410028,1.4991,1.46],[.222991,1.4991,1.46],[.222991,1.56,1.696],[-.410028,1.4991,1.696],
    [-.410028,1.58,1.46],[.222991,1.58,1.46],[.222991,1.596,1.696],[-.410028,1.58,1.696],
  ]);
}

export function buildAbramsX(P: TankBuilderPort): void {
  drainTankBuild(buildAbramsXCooperativeSteps(P, false));
}

export function* buildAbramsXCooperativeSteps(P: TankBuilderPort, cooperative = true): TankProfileBuild {
  const frame = ABRAMS_SOURCE_X_FRAME;
  const options = abramsSourceXConfiguration(P.spec.id);
  P.hullG.position.set(0, 0, 0);
  if (cooperative) yield "buildAbramsX:P.hullG.position.set(0, 0, 0);";
  P.turretG.position.set(...frame.turret);
  if (cooperative) yield "buildAbramsX:P.turretG.position.set(...frame.turret);";
  P.gunG.position.set(frame.gun[0] - frame.turret[0],
    frame.gun[1] - frame.turret[1], frame.gun[2] - frame.turret[2]);
  if (cooperative) yield "buildAbramsX:P.gunG.position.set(frame.gun[0] - frame.turret[0],";
  yield* buildAbramsSourceXHullCooperativeSteps(P, options, cooperative);
  buildTurretArmor(P);
  if (cooperative) yield "buildAbramsX:buildTurretArmor(P);";
  bindAbramsSourceXStockEra(P, options.urbanArmor);
  if (cooperative) yield "buildAbramsX:bindAbramsSourceXStockEra(P, options.urbanArmor);";
  yield* buildAbramsSourceXEquipmentCooperativeSteps(P, options, frame, cooperative);
  P.topY = 2.405;
  if (cooperative) yield "buildAbramsX:P.topY = 2.405;";
  P.muzzleZ = 5.809425 - frame.gun[2];
  if (cooperative) yield "buildAbramsX:P.muzzleZ = 5.809425 - frame.gun[2];";
}

