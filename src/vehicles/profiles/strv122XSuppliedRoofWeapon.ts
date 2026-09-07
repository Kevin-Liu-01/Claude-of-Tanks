// Supplied-file roof unit, including its unusual paired tubes. This is an
// owner-selected shape study, not a claim about the real Strv122 armament.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid } from './sectionSolid.ts';
import { sourceMachineGun } from './sourceMachineGun.ts';
import { STRV122_SUPPLIED_DATUMS as D, strvSourceTurret as add } from './strv122XSuppliedFrame.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
const {box,cylY,cylZ}=KIT;

function support(P:TankBuilderPort):void {
  add(P,'turretDetail',box(.437,.070,.511),-.629,2.642,-.354);
  add(P,'turretDetail',cylY(.098,.131,.068,32),-.633,2.590,-.354);
  // Separate cheeks and feet retain air underneath the source cradle.
  for(const x of [-.811,-.432]){
    add(P,'turretDetail',box(.046,.117,.251),x,2.741,-.370);
    add(P,'turretDetail',box(.073,.033,.411),x,2.690,-.370);
  }
  add(P,'turretDetail',new THREE.BoxGeometry(.197,.092,.193),-.6895,2.720,-.3835);
  add(P,'turretDetail',new THREE.BoxGeometry(.094,.049,.207),-.557,2.6975,-.400);
}

function bore(x:number,y:number,end:number,r:number):THREE.BufferGeometry {
  // Annular mouth and a deep metal wall, never a black disc on the muzzle.
  return new THREE.LatheGeometry([[.032,-.108],[.025,end-.096],
    [r,end-.060],[r,end],[r*.61,end],[r*.61,end-.160],
    [.024,end-.160],[.032,-.108]].map(([radius,z])=>new THREE.Vector2(radius,z)),32)
    .rotateX(Math.PI/2).translate(x,y,0);
}

function leftTube():THREE.BufferGeometry {
  // Exact source sections:47mm shaft,61mm sleeve atZ.38–.43, then a44mm
  // foretip throughZ.52. The source tip is not the former truncatedZ.442.
  const profile=[[.0236,-.108],[.0232,.30],[.026,.335],[.0307,.36],
    [.0307,.435],[.0285,.465],[.0223,.480],[.0223,.533],
    [.0136,.533],[.0136,.373],[.019,.373],[.019,-.108],[.0236,-.108]];
  return new THREE.LatheGeometry(profile.map(([r,z])=>new THREE.Vector2(r,z)),32)
    .rotateX(Math.PI/2).translate(-.760,2.866,0);
}

function centerLink():THREE.BufferGeometry {
  // Source stepped bridge remains above the lower cradle with an actual
  //39mm vertical air interval. Its narrow aft crown is not a full-width pad.
  const rows=[[-.515,-.702,-.631,2.814,2.894],[-.480,-.702,-.623,2.814,2.9062],
    [-.405,-.702,-.594,2.810,2.908],[-.324,-.702,-.568,2.805,2.9117],
    [-.272,-.702,-.568,2.900,2.934],[-.180,-.702,-.568,2.900,2.935],
    [-.145,-.702,-.568,2.810,2.916],[-.104,-.650,-.580,2.810,2.898]];
  return sectionSolid(rows.map(([z,left,right,low,top])=>({z,
    ring:[[left,low],[right,low],[right,top],[left,top]],
  })));
}

export function addStrv122XSuppliedRoofWeapon(P:TankBuilderPort):void {
  support(P);const weapon=sourceMachineGun(P,D.turretPivot);
  for(const [x,y,end,r]of [[-.760,2.866,.533,.0223],[-.473,2.865,.587366,.023]]){
    weapon.add('turretDark',box(.133,.128,.424),x,2.873,-.306);
    weapon.add('turretDetail',box(.153,.026,.321),x,2.947,-.312);
    weapon.add('turretDark',x<-.6?leftTube():bore(x,y,end,r),0,0,0);
    weapon.add('turretDark',cylZ(r*.63,.008,24),x,y,end-.164);
    weapon.add('turretDetail',box(.168,.093,.058),x,2.863,-.104);
  }
  // Asymmetric rear returns and two source storage/receiver wings.
  weapon.add('turretDark',box(.099,.111,.302),-.745,2.875,-.644);
  weapon.add('turretDark',box(.192,.150,.260),-.348,2.863,-.652);
  weapon.add('turretDetail',box(.141,.124,.548),-.909,2.884,-.357);
  weapon.add('turretDetail',box(.256,.162,.327),-.276,2.874,-.349);
  weapon.add('turretDetail',box(.256,.024,.327),-.276,2.947,-.349);
  weapon.add('turretDetail',centerLink(),0,0,0);
  weapon.add('turretDetail',box(.162,.037,.135),-.7628,3.006853,-.2191);
  weapon.add('turretDetail',box(.183,.041,.150),-.760,2.965,-.219);
  // The lower projecting members are cradle struts, not invented MG mouths.
  for(const x of [-.807,-.490]){
    weapon.add('turretDark',cylZ(.017,.390,20),x,2.778,-.025);
    weapon.add('turretDetail',box(.053,.062,.070),x,2.784,-.229);
  }
  weapon.finish();
}
