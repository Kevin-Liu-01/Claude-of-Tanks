// Source-specific bow lamps, carried gear, shoulder boxes and rear fixtures.
// Dimensions are scalar reconstruction estimates in the frozen source frame.
import * as THREE from 'three';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';
import { KIT } from './kit.ts';
import { sectionSolid } from './sectionSolid.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
const {box,cylX,cylY,cylZ,torus}=KIT;

function bowLamps(P:TankBuilderPort,side:-1|1):void {
  const x=side*1.43;
  const pocket=sectionSolid([
    {z:3.545,ring:[[x-.315,1.006],[x+.315,1.006],[x+.315,1.288],[x-.315,1.288]]},
    {z:3.709,ring:[[x-.270,1.002],[x+.270,1.002],[x+.270,1.171],[x-.270,1.171]]},
  ]);
  P.addEquipment('hullDetail',pocket);
  // Full-source held-out bow rays place the three convex lenses forward of
  // the shoulder lip, not buried at the earlier draft's Z3.638. The centers
  // are staggered with the actual outward sweep of the source light cluster.
  for(const [dx,z] of [[-.161,3.745],[0,3.716],[.161,3.704]]){
    P.addEquipment('hullDark',cylZ(.073,.086,24),x+side*dx,1.087,z-.040);
    P.addEquipment('hullDetail',cylZ(.068,.026,24),x+side*dx,1.087,z-.010,-.12,side*.12);
    P.addEquipment('hullGlass',markVehicleNightLens(cylZ(.053,.006,24),'headlight'),x+side*dx,1.087,z+.004,-.12,side*.12);
  }
  // Square upper lamp is seated on a small bridge on the sloping shoulder.
  P.addEquipment('hullDetail',box(.156,.051,.19),side*1.616,1.473,2.955,.147);
  P.addEquipment('hullDetail',box(.140,.127,.100),side*1.616,1.536,2.932);
  P.addEquipment('hullDark',box(.118,.101,.013),side*1.616,1.536,2.988);
  P.addEquipment('hullGlass',markVehicleNightLens(box(.090,.074,.004),'marker'),side*1.616,1.536,2.997);
}

function bowTowing(P:TankBuilderPort,side:-1|1):void {
  const x=side*.866;
  // Scalar held-outs distinguish the open eye at X.83/.90,Y.988 from its
  // outboard ring at X.928 and the transverse pin lower in that opening.
  // Deep receiving ears intersect the source-shaped bow; no floating loop.
  for(const dx of [-.105,.105])
    P.addEquipment('hullDetail',box(.056,.187,.206),x+dx,1.061,3.654,.185);
  P.addEquipment('hullDetail',cylX(.033,.286,24),x,1.087,3.759);
  P.addEquipment('hullDetail',cylX(.021,.182,24),x,.950,3.746);
  P.addEquipment('hullDetail',torus(.091,.025,32,10),x,.953,3.781,Math.PI/2);
}

function driver(P:TankBuilderPort):void {
  P.addHatch('hullDetail',box(.620,.027,.507),-.698,1.595,1.85,.071);
  for(const x of [-.912,-.700,-.488]){
    P.addEquipment('hullDetail',box(.180,.105,.152),x,1.693,2.014,.104);
    P.addEquipment('hullDark',box(.155,.065,.010),x,1.701,2.094,.104);
    P.addEquipment('hullGlass',box(.122,.043,.004),x,1.705,2.101,.104);
  }
  for(const side of [-1,1]){
    P.addEquipment('hullDetail',box(.390,.026,.64),side*1.018,1.547,2.235,.138);
    for(const z of [2.48,2.86,3.22])
      P.addEquipment('hullDetail',cylY(.010,.010,.013,10),side*.891,1.85-z*.139,z);
  }
  P.addEquipment('hullDetail',box(.643,.025,.492),.717,1.551,2.36,.141);
}

function sideVents(P:TankBuilderPort,side:-1|1):void {
  const groups=[[-2.52,.51],[-1.71,.52],[-.58,.67]];
  for(const [z,length] of groups){
    const y=1.49,depth=.034;
    // True dark recessed back and raised slats, not black stripes through armor.
    P.addEquipment('hullDark',box(depth,.219,length),side*1.839,y,z);
    for(let i=0;i<12;i++)P.addEquipment('hullDetail',box(.042,.227,.014),
      side*1.863,y,z-length/2+.018+i*(length-.036)/11);
    for(const dy of [-.121,.121])P.addEquipment('hullDetail',box(.045,.021,length+.039),side*1.855,y+dy,z);
  }
  for(const [z,len]of [[-2.78,.70],[-1.31,.28],[.78,1.50]]){
    P.addEquipment('hullDetail',box(.040,.206,len),side*1.844,1.474,z);
    for(const end of [-1,1])P.addEquipment('hullDetail',box(.048,.053,.038),side*1.866,1.558,z+end*(len/2-.026));
  }
  // Three open grab loops are individual arms and a bridge against the body.
  for(const z of [-1.22,.27,1.83]){
    for(const dz of [-.087,.087])P.addEquipment('hullDetail',box(.075,.017,.018),side*1.846,1.351,z+dz);
    P.addEquipment('hullDetail',box(.018,.017,.188),side*1.878,1.351,z);
  }
}

function rear(P:TankBuilderPort):void {
  P.addEquipment('hullDetail',box(2.53,.332,.024),0,1.503,-3.705);
  P.addEquipment('hullDark',box(1.86,.215,.010),0,1.477,-3.723);
  for(let i=0;i<25;i++)P.addEquipment('hullDetail',box(.025,.220,.027),-.90+i*.075,1.477,-3.735);
  for(const side of [-1,1]){
    P.addEquipment('hullDetail',box(.32,.182,.091),side*1.473,1.53,-3.727);
    P.addEquipment('hullGlass',box(.113,.054,.009),side*1.478,1.55,-3.777);
    P.addEquipment('hullDetail',box(.144,.093,.151),side*.943,1.246,-3.70);
    P.addEquipment('hullDetail',torus(.069,.022,24,8),side*.943,1.176,-3.774,Math.PI/2);
    // Back hose runs are supported on actual end-deck saddles. Spline is an
    // authored centerline; not a source path or sampled vertex contour.
    const points=[[side*1.38,1.789,-2.858],[side*1.491,1.79,-3.35],
      [side*1.266,1.798,-3.756],[side*.78,1.801,-3.778]];
    P.addEquipment('hullDark',new THREE.TubeGeometry(new THREE.CatmullRomCurve3(
      points.map(p=>new THREE.Vector3(...p))),28,.018,8,false));
    for(const [x,z]of [[side*1.38,-2.88],[side*1.49,-3.34],[side*.80,-3.72]])
      P.addEquipment('hullDetail',box(.075,.041,.064),x,1.774,z);
  }
}

export function addStrv122XSuppliedHullEquipment(P:TankBuilderPort):void {
  driver(P);rear(P);
  for(const side of [-1,1] as const){bowLamps(P,side);bowTowing(P,side);sideVents(P,side);}
}
