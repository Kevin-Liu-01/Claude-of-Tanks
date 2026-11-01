// Original native solids, using independently measured physical dimensions.
// The supplied M model is comparison-only; no source buffers or traced mesh
// contours are used here. The end guards retain actual wheel-well openings.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import { sheetGuardSection, sheetUnderside, type SheetGuardStation } from './t90AXFenderClosures.ts';
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

// 267 (S1, blind critics: "the bow mudguards read as oversized wedges jutting forward over the tracks"): the bow guard is
// pressed sheet, in the oracle's two parts. The fender sheet runs on to the hinge at z 3.60 and rolls over its outer edge
// into a short lip (the oracle's guard shoulder, 10-12 cm down); a separate toe flap hangs from that hinge down the steep
// nose (the measured crown and plan of the former lip, which sat under the fender as a second sheet); under the roll a
// separate front skirt panel hangs 18 mm inboard of the lip (the oracle's Hull_side002, its measured low edge and the
// plan that tucks in at the nose), hemmed in rubber; a rubber mud flap hangs behind the toe's front edge, 29 cm ahead of
// the track's front run. Nothing reaches further forward or wider than the former guard (x 1.8398, z 3.735).
const M_GUARD: readonly SheetGuardStation[] = [
  [3.10,1.200,1.0223,1.8373,.026,.030,.022],[3.20,1.1835,1.0223,1.8373,.050,.085,.016],
  [3.30,1.167,1.0223,1.8373,.058,.095,.016],[3.40,1.141,1.0223,1.8373,.058,.095,.016],
  [3.50,1.068,1.0223,1.8373,.058,.090,.016],[3.60,.9954,1.0223,1.8373,.052,.080,.016],
];
const M_TOE: readonly SheetGuardStation[] = [
  [3.594,.9785,1.030,1.834,.045,.062,.014],[3.650,.951,1.045,1.805,.045,.060,.014],
  [3.698,.906,1.079,1.748,.040,.055,.018],[3.713,.845,1.084,1.742,.040,.050,.030],
  [3.735,.790,1.091,1.732,.036,.042,.030],
];
// [z, outer face x, low edge y]: the panel's top tucks 25 mm up behind the roll's lip
const M_PANEL: readonly (readonly [number, number, number])[] = [
  [3.165,1.819,.753],[3.30,1.819,.728],[3.40,1.819,.715],[3.50,1.812,.717],
  [3.60,1.788,.705],[3.65,1.770,.712],[3.70,1.738,.724],
];

function frontGuards(P: TankBuilderPort, side: number): void {
  P.addMudguard('t90m-x-bow-sheet','hull',sectionSolid(M_GUARD.map(s => sheetGuardSection(side,s))));
  P.addMudguard('t90m-x-toe-flap','hull',sectionSolid(M_TOE.map(s => sheetGuardSection(side,s))));
  // the hinge: a pin through four knuckles along the joint, half proud of the sheet's front edge over the flap's tucked end
  P.addEquipment('hullDetail',cylX(.008,.74,10),side*1.43,.992,3.601);
  for (const x of [1.10,1.30,1.55,1.76]) P.addEquipment('hullDetail',cylX(.015,.11,12),side*x,.992,3.601);
  // the panel's top edge is buried 3 mm in the underside of the roll above it, behind the lip
  const panel = M_PANEL.map(([z,outer,low]) => mirroredSection(z,side,
    [[outer-.012,low],[outer,low],[outer,sheetUnderside(M_GUARD,M_TOE,z,outer-.012)+.003],
      [outer-.012,sheetUnderside(M_GUARD,M_TOE,z,outer-.012)+.003]]));
  P.addMudguard('t90m-x-front-skirt','hull',sectionSolid(panel));
  P.addMudguard('t90m-x-front-skirt-hem','hullRubber',sectionSolid(M_PANEL.map(([z,outer,low]) => mirroredSection(z,side,
    [[outer-.016,low-.034],[outer+.003,low-.034],[outer+.003,low+.010],[outer-.016,low+.010]]))));
  // the fender's inner support: where the glacis falls away under the fender (z 2.28 on), the hull side carries on up to
  // the sheet as a 62 mm web (its foot inside the hull's top bevel), so the strip of glacis edge under the fender's inner
  // edge is no open slot (Main's Proryv/BMPT roof pocket, 552 cm2, seen from ahead)
  const roofAt = (z: number): readonly [number, number] => { // hull roof and top bevel (buildT90MX stations)
    const rows = [[1.89,1.339,.11],[2.52,1.115,.11],[3.04,.929,.0746],[3.43,.790,.0068]] as const;
    let i=1;while(i<rows.length-1&&z>rows[i][0])i++;
    const a=rows[i-1],b=rows[i],t=(z-a[0])/(b[0]-a[0]);return [a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
  };
  const underside = (z: number): number => z<=3.10?(z<=2.70?1.276-(z-2.10)/.6*.05:1.226-(z-2.70)/.4*.026)-.022
    : sheetUnderside(M_GUARD,M_TOE,z,1.05);
  P.addEquipment('hullDetail',sectionSolid([2.28,2.52,2.70,3.04,3.10,3.30,3.42].map(z => {
    const [roof,bevel]=roofAt(z);
    return mirroredSection(z,side,[[1.024,roof-bevel-.005],[1.086,roof-bevel-.005],[1.086,underside(z)+.002],[1.024,underside(z)+.002]]);
  })));
  // the mud flap: 10 mm rubber behind the toe's front edge, its top buried in the flap
  P.addMudguard('t90m-x-mud-flap','hullRubber',sideStrip([[3.721,.600,.815],[3.731,.600,.790]],side,1.13,1.69));
}

export function addT90MFenders(P: TankBuilderPort): void {
  // Only the forward fender is full-width. The narrower rear housings above
  // leave genuine air beside the cage rather than an invented upper shelf.
  // (267) the sheet runs to z 3.10; the rolled bow guard and its toe flap carry it on (frontGuards)
  const rows: readonly (readonly [number,number])[] = [[-1.3369,1.327],
    [.50,1.312],[1.30,1.302],[2.10,1.276],[2.70,1.226],[3.10,1.200]];
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
  // (267) forward of z 3.10 the tops stand 6 mm down inside the rolled bow sheet (they stood flush with its top face) and
  // the plates end under the hinge, short of the toe flap (they stood 17 mm through it).
  const rows: readonly Row[] = [[-1.3369,.745,1.327],[.50,.745,1.312],
    [1.30,.745,1.302],[2.10,.745,1.276],[2.70,.745,1.226],
    [3.10,.745,1.200],[3.30,.746,1.161],[3.40,.770,1.135],
    [3.50,.810,1.062],[3.592,.851,.990]];
  P.addExternalArmor('hull',sideStrip(rows,side,1.73214,1.75236));
  // the forward module's outer face stands behind the curtain to its front edge (z 3.16), then 9 mm inside the front
  // skirt panel that hangs there now, tucking in with it at the nose
  const outer = (z: number): number => z<3.162?1.8373:z<3.47?1.798:1.798-(z-3.47)*.205;
  const fwd = rows.filter(([z]) => z>=2.70);
  P.addExternalArmor('hull',sectionSolid([...fwd.slice(0,2),[3.16,.745,1.1883] as Row,[3.17,.745,1.1864] as Row,...fwd.slice(2)]
    .map(([z,low,high]) => mirroredSection(z,side,[[1.752,low],[outer(z),low],[outer(z),high],[1.752,high]]))));
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
