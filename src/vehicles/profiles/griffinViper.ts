import * as THREE from 'three';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { buildGriffin50Chassis } from './griffin50X.ts';
import { KIT } from './kit.ts';
import { VIPER as D, VIPER_MUZZLES } from '../griffinViperLayout.ts';
import { GRIFFIN_TURRET_SCALE as S, reduceGriffinTurret } from './griffinProportions.ts';
const { box, cylX, cylY } = KIT;

function launchPods(P: TankBuilderPort): void {
  P.turretG.userData.gunCradleSeats = { stations: [[-.43,1.20,0],[.43,1.20,0]] };
  for (const side of [-1, 1]) {
    const x = side * 1.02;
    // Thin closed stocks around two rows of four deep, open canisters.
    for (const dx of [-.515,.515]) P.add('gunMount', box(.03,.61,2.56), x+dx,0,0);
    for (const y of [-.29,.29]) P.add('gunMount', box(1.06,.03,2.56), x,y,0);
    P.add('gunMount', box(1.06,.61,.04), x,0,-1.26);
    for (const z of [-.92,.70]) {
      P.addEquipment('gunMountDark', box(1.09,.025,.07), x,.32,z);
      P.addEquipment('gunMountDark', box(.04,.65,.07), x+side*.545,0,z);
    }
    // Bearing tower overlaps the solid pedestal and the axial pitch joint.
    P.addEquipment('turretDetail', box(.18,.96,.32), side*.43,.74,0);
    P.add('gunMount', cylX(.06,.31,P.q?24:12), side*.49,0,0);
  }
  for (const tip of VIPER_MUZZLES) {
    const rings = [[.113,-1.25],[.113,1.32],[.07/S,1.32],[.07/S,-1.21],[.113,-1.25]];
    const tube = new THREE.LatheGeometry(rings.map(([r,z]) => new THREE.Vector2(r,z)),P.q?24:12)
      .rotateX(Math.PI/2);
    // Keep the structural mouth and outer shell painted, with a dark bore.
    // Partition the existing stock without adding a cap or duplicate faces.
    const outside: number[] = [], inside: number[] = [];
    const index = tube.getIndex()!;
    for (let i=0;i<index.count;i+=3) {
      const triangle=[index.getX(i),index.getX(i+1),index.getX(i+2)];
      (triangle.every(v=>v%rings.length>=2)?inside:outside).push(...triangle);
    }
    const liner=tube.clone().setIndex(inside);
    tube.setIndex(outside);
    P.addModuleVisual('missileRack','gunMount',tube,tip.x/S,tip.y/S,0);
    P.add('gunMountDark',liner,tip.x/S,tip.y/S,0);
    P.addEquipment('gunMount',new THREE.LatheGeometry([
      [.114,1.26],[.13,1.26],[.13,1.32],[.114,1.32],[.114,1.26],
    ].map(([r,z])=>new THREE.Vector2(r,z)),P.q?24:12).rotateX(Math.PI/2),tip.x/S,tip.y/S,0);
  }
}
function sights(P: TankBuilderPort): void {
  P.addEquipment('turretDetail', box(.30,.34,.28), 0,.55,.76);
  P.addEquipment('turretDetail', box(.38,.30,.24), 0,.84,.98);
  P.addModuleVisual('optics','turretGlass',box(.30,.17,.012),0,.87,1.105);
  P.addEquipment('turretDark',box(.40,.04,.13),0,1.01,1.05);
  P.addEquipment('turretDetail',cylY(.09,.12,.38,P.q?20:10),0,.59,-.69);
  P.addEquipment('turretDetail',box(.58,.22,.16),0,.88,-.69);
  P.addEquipment('turretGlass',box(.48,.15,.012),0,.88,-.603);
  for (const side of [-1,1]) {
    P.addEquipment('turretDetail',box(.27,.025,.35),side*.51,.413,-.59);
    P.addEquipment('turretDark',box(.12,.04,.04),side*.51,.442,-.59);
  }
}
export function buildGriffinViper(P: TankBuilderPort): void {
  buildGriffin50Chassis(P);
  P.turretG.position.set(0,2.07,-.36); P.gunG.position.set(0,1.20,0);
  // One convex structural base; no collision hull spanning separated pods.
  P.add('turret',box(1.50,.40,1.90),0,.20,0);
  P.addEquipment('turretDark',cylY(.94,.94,.06,P.q?48:24),0,.015,0);
  launchPods(P); sights(P);
  P.muzzleZ=D.mouthZ/S; P.topY=1.54;
  reduceGriffinTurret(P);
  P.hullG.userData.griffinViper={concept:true,donor:'griffin50_x',cells:16};
}
export const GRIFFIN_VIPER_PROFILES = { griffin_viper: { build: buildGriffinViper } } as const;
