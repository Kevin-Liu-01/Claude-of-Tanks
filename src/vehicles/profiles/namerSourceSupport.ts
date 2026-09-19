// Elevated paired stock measured in the supplied Namer's own support axis.
// Source labels weapon2/weapon3 identify geometry, not a gameplay missile type.
import * as THREE from 'three';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { KIT } from './kit.ts';
import { sectionSolid } from './sectionSolid.ts';
import { namerTurretPart as put } from './namerSourceFrame.ts';

const PITCH=.09304, C=Math.cos(PITCH), S=Math.sin(PITCH);
function axialPart(P: TankBuilderPort, slot: string, g: THREE.BufferGeometry,
  x: number, radial: number, axial: number): void {
  put(P,slot,g,x,radial*C+axial*S,axial*C-radial*S,-PITCH);
}

function addPairedBodies(P: TankBuilderPort): void {
  const segments=P.q?24:12;
  for(const x of[-.20707,.20802]){
    axialPart(P,'turretDetail',KIT.cylZ(.08376,.884,segments),x,3.17170,-1.819);
    axialPart(P,'turretDetail',KIT.cylZ(.11193,.052,segments),x,3.17170,-2.280);
    axialPart(P,'turretDark',KIT.cylZ(.099,.006,segments),x,3.17170,-2.309);
    axialPart(P,'turretDetail',KIT.cylZ(.077,.010,segments),x,3.17170,-1.411);
    axialPart(P,'turretDetail',KIT.cylZ(.050,.040,segments,.077),x,3.17170,-1.391);
  }
}

function addSupportCradle(P: TankBuilderPort): void {
  // The base bears on the recessed rear roof; the web bears on that base.
  // Open air beside the central web is retained, not filled with a gantry.
  put(P,'turretDetail',sectionSolid([
    {z:-2.520,ring:[[-.120,2.433],[.120,2.433],[.120,2.558],[-.120,2.558]]},
    {z:-1.896,ring:[[-.120,2.479],[.120,2.479],[.120,2.558],[-.120,2.558]]},
  ]));
  put(P,'turretDetail',sectionSolid([
    {z:-2.352,ring:[[-.085,2.552],[.084,2.552],[.084,2.826],[-.085,2.826]]},
    {z:-1.896,ring:[[-.085,2.552],[.084,2.552],[.084,3.090],[-.085,3.090]]},
    {z:-1.686,ring:[[-.085,2.745],[.084,2.745],[.084,3.115],[-.085,3.115]]},
  ]));
  axialPart(P,'turretDetail',KIT.box(.605,.0145,.702),0,3.0712,-1.9565);
  axialPart(P,'turretDetail',KIT.box(.617,.021,.830),0,3.2883,-1.8305);
  // Source upper receiving saddles extend down from the rail onto the
  // cylindrical bodies; the measured underside is v=3.2352 at u=-1.8.
  for(const x of[-.2354,.2356])
    axialPart(P,'turretDetail',KIT.box(.075,.0467,.829),x,3.2585,-1.8305);
  // Source upper cover is 17 mm thick and rises toward +Z. The previous
  // 80 mm slab with the opposite pitch buried the paired round end faces.
  axialPart(P,'turretDetail',KIT.box(.628,.0178,1.128),-.00043,3.3341,-1.818);
  for(const x of[-.286,.286])
    axialPart(P,'turretDetail',KIT.box(.033,.051,.037),x,3.308,-2.200);
}

export function addNamerSourceSupport(P: TankBuilderPort): void {
  addSupportCradle(P);
  addPairedBodies(P);
}
