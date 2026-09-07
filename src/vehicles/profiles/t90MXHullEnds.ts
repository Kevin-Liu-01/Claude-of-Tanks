// Original native solids, using independently measured physical dimensions.
// The supplied M model is comparison-only; no source buffers or traced mesh
// contours are used here. The end guards retain actual wheel-well openings.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

const { box, cylX, cylZ } = KIT;
type Row = readonly [number, number, number];
type XY = readonly [number, number];

function mirroredSection(z: number, side: number, ring: readonly XY[]): SolidSection {
  return { z, ring: side > 0 ? ring : ring.map(([x,y]) => [-x,y] as const).reverse() };
}

function sideStrip(rows: readonly Row[], side: number, inner: number, outer: number): THREE.BufferGeometry {
  return sectionSolid(rows.map(([z,low,high]) => mirroredSection(z,side,
    [[inner,low],[outer,low],[outer,high],[inner,high]])));
}

function rearHousings(P: TankBuilderPort, side: number): void {
  // The rear shoulder is a deep housing aft of the drive wheel. Its lower
  // edge rises before the return course, not a full-height slab over it.
  const rows: readonly Row[] = [[-3.470,.965,1.324],[-3.405,.814,1.324],
    [-3.055,.816,1.3234],[-3.048,.938,1.3234],[-2.85,.938,1.3234],
    [-2.80,1.114,1.3234],[-1.334,1.108,1.3274]];
  const dx=side<0?.0296:0;
  const sections=rows.map(([z,low,high]) => mirroredSection(z,side,
    [[1.086,low],[1.713+dx,low],[1.713+dx,high-.043],
      [1.680+dx,high],[1.129,high],[1.086,high-.043]]));
  P.add('hull',sectionSolid(sections));
}

function frontGuards(P: TankBuilderPort, side: number): void {
  // Outer cheek exists beside the idler. Across the wheel lane the curved
  // skin begins only at the forward lip; it does not fill the wheel well.
  P.addMudguard('t90m-x-front-cheek','hull',sideStrip([
    [3.160,.753,1.081],[3.30,.728,1.052],[3.40,.715,1.024],
    [3.50,.717,.975],
  ],side,1.8278,1.8398));
  const rows: readonly (readonly [number,number,number,number])[] = [
    [3.427,1.011,1.025,1.8395],[3.50,.975,1.025,1.8395],
    [3.60,.935,1.047,1.813],[3.698,.906,1.079,1.748],
    [3.713,.833,1.084,1.742],[3.735,.782,1.091,1.732],
  ];
  P.addMudguard('t90m-x-front-lip','hull',sectionSolid(rows.map(([z,top,inner,outer]) =>
    mirroredSection(z,side,[[inner,top-.012],[outer,top-.012],[outer,top],[inner,top]]))));
  for (const outside of [false,true]) {
    const sections=rows.map(([z,top,inner,outer]) => {
      const low=z<3.5?.716: z<3.65?.701:.724;
      const a=outside?outer-.011:inner,b=outside?outer:inner+.011;
      return mirroredSection(z,side,[[a,low],[b,low],[b,top],[a,top]]);
    });
    P.addMudguard('t90m-x-lip-edge','hull',sectionSolid(sections));
  }
  P.addMudguard('t90m-x-lip-return','hull',sideStrip([
    [3.731,.724,.791],[3.735,.724,.782],
  ],side,1.091,1.732));
}

export function addT90MFenders(P: TankBuilderPort): void {
  // Only the forward fender is full-width. The narrower rear housings above
  // leave genuine air beside the cage rather than an invented upper shelf.
  const rows: readonly (readonly [number,number])[] = [[-1.3369,1.327],
    [.50,1.312],[1.30,1.302],[2.10,1.276],[2.70,1.226],[3.10,1.200],
    [3.30,1.167],[3.40,1.141],[3.50,1.068],[3.60,.9954],[3.699,.9235]];
  for (const side of [-1,1]) {
    P.add('hull',sideStrip(rows.map(([z,y]) => [z,y-.022,y] as const),side,1.0223,1.8373));
    for (const [z,y] of rows.slice(0,6)) {
      P.addEquipment('hullDetail',box(.64,.012,.028),side*1.431,y+.004,z);
    }
    rearHousings(P,side);
    frontGuards(P,side);
  }
}

export function addT90MInnerSidePlates(P: TankBuilderPort, side: number): void {
  // Source inner hanging steel is separate from the scalloped outer curtain.
  // In particular the forward module follows the curved fender, rather than
  // projecting a constant-height rectangular shelf beyond the nose.
  const rows: readonly Row[] = [[-1.3369,.745,1.327],[.50,.745,1.312],
    [1.30,.745,1.302],[2.10,.745,1.276],[2.70,.745,1.226],
    [3.10,.745,1.200],[3.30,.746,1.167],[3.40,.770,1.141],
    [3.50,.810,1.068],[3.60,.854,.9954],[3.699,.892,.9235]];
  P.addExternalArmor('hull',sideStrip(rows,side,1.73214,1.75236));
  P.addExternalArmor('hull',sideStrip(rows.filter(([z]) => z>=2.70),side,1.752,1.8373));
  for (const [z,top] of [[-.84,1.327],[.16,1.313],[1.16,1.304],[2.16,1.272]] as const) {
    P.addEquipment('hullDetail',box(.024,.075,.15),side*1.759,top-.085,z);
  }
}

function drumArms(P: TankBuilderPort, side: number): void {
  // Four folded 13 mm support plates cradle the two drums, then descend
  // toward the lower transom. Air remains between them and below the drums.
  const rows: readonly Row[] = [[-4.042,1.228,1.334],[-3.92,1.152,1.243],
    [-3.80,1.136,1.206],[-3.70,1.144,1.224],[-3.57,1.112,1.328],
    [-3.41,.995,1.131],[-3.30,.8803,.9461],[-3.20,.7124,.7781],
    [-3.10,.5444,.6102],[-3.029,.4903,.530]];
  for (const x of [.27734,.86346]) {
    P.addEquipment('hullDetail',sideStrip(rows,side,x-.006525,x+.006525));
    P.addEquipment('hullDetail',box(.057,.056,.074),side*x,.540,-3.036);
  }
}

function rearTransom(P: TankBuilderPort): void {
  // Separate cast rear access boss and the two low recovery brackets.
  P.addEquipment('hullDetail',cylZ(.177,.025,28).scale(1.035,1,1),.0017,.7565,-3.1995,-.565);
  for (const side of [-1,1]) {
    // Seat the welded outer edge just inside the native tub's 1.088 m
    // half-width; the source casting's 11 mm outboard seam is simplified.
    P.add('hull',sideStrip([[-3.117,.616,.620],[-3.0,.433,.617],
      [-2.925,.3134,.614],[-2.733,.320,.609],[-2.695,.324,.333]],side,.7696,1.082));
    P.addEquipment('hullDetail',sideStrip([[-3.215,.494,.573],[-3.03,.367,.507],
      [-3.010,.357,.473]],side,.8653,.8982));
    P.addEquipment('hullDetail',sideStrip([[-3.113,.565,.613],[-2.970,.403,.455]],side,.8212,.9424));
  }
}

function crossDrumHose(P: TankBuilderPort): void {
  // The source is one continuous U-shaped cross-drum pipe. It turns back
  // before the rear deck, not two disconnected hoses ending over the grille.
  const points: readonly (readonly [number,number,number])[] = [
    [-.569,1.753,-3.791],[-.565,1.818,-3.739],[-.49,1.710,-3.574],
    [-.28,1.582,-3.452],[.004,1.572,-3.433],[.32,1.586,-3.447],
    [.53,1.710,-3.580],[.575,1.820,-3.746],[.576,1.754,-3.791],
  ];
  const curve=new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  P.addEquipment('hullDark',new THREE.TubeGeometry(curve,48,.018,8,false));
}

export function addT90MRearDrums(P: TankBuilderPort): void {
  const r=.29158,length=.83825,rz=.30460,z=-3.79256,y=1.47892;
  for (const side of [-1,1]) {
    const x=side*.56963+.00198;
    P.addEquipment('hullDetail',cylX(r,length,40).scale(1,1,rz/r),x,y,z);
    for (const offset of [-.24,.24]) {
      P.addEquipment('hullDark',cylX(r+.001,.0486,40).scale(1,1,rz/r),x+offset,y,z);
      P.addEquipment('hullDetail',box(.0645,.015,.038),x+offset,y+r-.002,z);
    }
    for (const offset of [-length/2,length/2]) {
      P.addEquipment('hullDetail',cylX(r*.957,.012,40).scale(1,1,rz/r),x+offset,y,z);
      P.addEquipment('hullDark',cylX(r*.10,.014,16),x+offset,y,z);
    }
    P.addEquipment('hullDetail',KIT.cylY(.029,.029,.0216,20),x+.0037,1.7553,-3.7926);
    drumArms(P,side);
  }
  rearTransom(P);
  crossDrumHose(P);
}
