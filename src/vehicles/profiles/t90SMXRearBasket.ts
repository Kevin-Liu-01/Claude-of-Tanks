// Independently authored flat-bar basket. The source oracle is local-only;
// rail levels, canted side planes and support datums are scalar measurements.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type Point = readonly [number,number,number];
const YAW: Point = [.008,1.532,.359];
const REAR_LEVELS = [1.93831,1.99279,2.05251,2.10936,2.16596,2.223315] as const;
const SIDE_LEVELS = [1.95065,2.007875,2.064975,2.122075,2.17843,2.23578] as const;

function rail(P: TankBuilderPort, a: Point, b: Point, width=.04002, thickness=.006): void {
  const direction=new THREE.Vector3(b[0]-a[0],b[1]-a[1],b[2]-a[2]);
  const geometry=KIT.box(width,thickness,direction.length());
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0,0,1),direction.normalize()));
  P.addEquipment('turretDetail',geometry,
    (a[0]+b[0])/2-YAW[0],(a[1]+b[1])/2-YAW[1],(a[2]+b[2])/2-YAW[2]);
}

function member(P: TankBuilderPort, min: Point, max: Point): void {
  P.addEquipment('turretDetail',KIT.box(max[0]-min[0],max[1]-min[1],max[2]-min[2]),
    (min[0]+max[0])/2-YAW[0],(min[1]+max[1])/2-YAW[1],(min[2]+max[2])/2-YAW[2]);
}

function rearRails(P: TankBuilderPort): void {
  for(let row=0;row<REAR_LEVELS.length;row++) {
    const y=REAR_LEVELS[row],wide=row===1||row===4;
    const rear=row===1?-2.920161:-2.922269;
    rail(P,[wide?-.89649:-.86612,y,rear+.02001],
      [wide?.90775:.86024,y,rear+.02001]);
  }
  // Four inset uprights, not a full-height center post or a filled rear wall.
  for(const x of [-.826685,-.24537,.26270,.82986]) {
    member(P,[x-.0034,1.93906,-2.896995],[x+.0034,2.22082,-2.85698]);
  }
}

function sideRails(P: TankBuilderPort): void {
  for(let row=0;row<SIDE_LEVELS.length;row++) {
    const y=SIDE_LEVELS[row],extended=row===1||row===4;
    const rear=extended?-2.92016:-2.85909;
    const leftX=(z:number):number=>-.957039-.151818*(z+2.5)+.0204;
    rail(P,[leftX(rear),y,rear],[leftX(-1.6018),y,-1.6018],.0404);
    const rightX=(z:number):number=>.97275+.16346*(z+2.5)-.0200;
    rail(P,[rightX(rear),y,rear],[rightX(-2.301),y,-2.301],.0405);
  }
}

function sidePosts(P: TankBuilderPort): void {
  const posts: readonly (readonly[number,number,number,number])[] = [
    [-.95675,-.91902,-2.40840,-2.39366],[-1.07481,-1.03660,-1.63445,-1.62076],
    [-1.02190,-.98369,-1.98088,-1.96825],[-.89208,-.85436,-2.83171,-2.81907],
    [.94058,.97879,-2.34101,-2.32837],[.86611,.90383,-2.83171,-2.81907],
  ];
  for(const [left,right,rear,front]of posts)member(P,
    [left,1.95152,rear],[right,2.23329,front]);
}

function basketAttachments(P: TankBuilderPort): void {
  // These thin retainers connect the rear lattice to the existing case.
  // They do not change its permanent marking surface or substitute for it.
  for(const x of [-.2284,.2468]) {
    member(P,[x-.0101,1.839,-2.67854],[x+.0101,2.21653,-2.66654]);
    member(P,[x-.0101,2.20453,-2.67854],[x+.0101,2.21653,-2.3628]);
    member(P,[x-.0101,2.174,-2.3748],[x+.0101,2.21653,-2.3628]);
    // A 4.6 mm construction allowance closes the tiny source arm/retainer
    // separation with positive overlap; it is not a floating attachment.
    member(P,[x-.0117,2.20636,-2.9138],[x+.0117,2.2268,-2.67754]);
  }
  for(const x of [-.2585,.2769])member(P,
    [x-.0117,1.92135,-2.91174],[x+.0117,1.9418,-2.68429]);
}

export function addT90SMRearBasket(P: TankBuilderPort): void {
  rearRails(P);
  sideRails(P);
  sidePosts(P);
  basketAttachments(P);
}
