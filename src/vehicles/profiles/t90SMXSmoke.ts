// Original closed launcher bodies with genuine blind bores. Mouth centers,
// axes and stock dimensions are independent scalar source measurements;
// neither the source mesh nor its topology is part of the runtime model.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type TubeDatum=readonly[number,number,number,number,number,number,number,number,number,number,number];
const TUBES:readonly TubeDatum[]=[
  [-1.452815,2.308909,-.250458,-.625627,.307795,.716835,.202018,.040099,.033403,.045489,.121708],
  [-1.338240,2.322367,-.159682,-.485850,.319664,.813489,.204457,.039802,.033176,.045086,.123574],
  [-1.227521,2.327196,-.091995,-.410906,.321916,.852951,.205254,.039541,.032967,.044984,.123597],
  [-1.418418,2.241431,-.016431,-.410656,.221882,.884381,.205825,.039612,.032894,.045043,.123749],
  [-1.281381,2.241337,.040813,-.258219,.202093,.944712,.207634,.039574,.032768,.044881,.125102],
  [-1.383715,2.156819,.178999,-.190644,.202607,.960523,.208034,.039086,.032614,.044566,.124815],
  [1.187368,2.259754,-.191980,.316114,.258519,.912820,.206781,.039456,.032779,.044884,.124697],
  [1.213197,2.184207,-.037645,.271246,.253711,.928470,.207139,.039553,.033009,.044872,.124060],
  [1.331505,2.185672,-.076504,.352051,.257535,.899853,.206362,.039614,.032898,.045006,.123091],
  [1.447610,2.186233,-.123405,.427870,.254784,.867186,.205412,.039745,.032892,.045015,.123358],
  [1.310390,2.084035,.012660,.347781,.274510,.896489,.206256,.039642,.033015,.044949,.123186],
  [1.435675,2.079160,-.048581,.510205,.265634,.818003,.204293,.039846,.033260,.045201,.122066],
];

function launcherBody(row:TubeDatum):THREE.BufferGeometry {
  const length=row[6],outer=row[7],inner=row[8],base=row[9],depth=row[10];
  const profile=[new THREE.Vector2(0,-length),new THREE.Vector2(base,-length),
    new THREE.Vector2(base,-length+.063),new THREE.Vector2(outer,-length+.077),
    new THREE.Vector2(outer,0),new THREE.Vector2(inner,0),new THREE.Vector2(0,-depth)];
  return new THREE.LatheGeometry(profile,16).rotateX(Math.PI/2);
}

function placed(P:TankBuilderPort,bucket:string,geometry:THREE.BufferGeometry,
  row:TubeDatum,offset=0):void {
  const axis=new THREE.Vector3(row[3],row[4],row[5]).normalize();
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),axis));
  P.addEquipment(bucket,geometry,row[0]+axis.x*offset-.008,
    row[1]+axis.y*offset-1.532,row[2]+axis.z*offset-.359);
}

export function addT90SMSmoke(P:TankBuilderPort):void {
  for(const row of TUBES) {
    placed(P,'turretDetail',launcherBody(row),row);
    // The source cavity tapers to a closed tip: offset rays meet its inner
    // cone before the 12 cm center depth. This tiny physical dark tip is not
    // a front cap and does not obstruct that source negative space.
    placed(P,'turretDark',KIT.cylZ(.002,.001,16),row,-row[10]+.0005);
  }
}
