// Original closed native deck primitives. Source meshes remain local-only
// measurement oracles; this module contains no source buffers or topology.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

const { box, cylX } = KIT;
type Row = readonly [number, number, number];
type Slot = 'hullDetail' | 'hullDark';
const CENTER_X = .001977;

function stripGeometry(left: number, right: number, rows: readonly Row[]): THREE.BufferGeometry {
  return sectionSolid(rows.map(([z,low,high]) => ({z,
    ring: [[left,low],[right,low],[right,high],[left,high]],
  })));
}

function strip(P: TankBuilderPort, slot: Slot, left: number, right: number, rows: readonly Row[]): void {
  P.addEquipment(slot,stripGeometry(left,right,rows));
}

function rearRamp(P: TankBuilderPort): void {
  // The rear cover rises in two distinct slopes, then meets the grille rim.
  // It is only millimetres deep at the aft tip, not a constant-height plinth.
  const stations: readonly (readonly [number,number,number,number,number])[] = [
    [-3.428,.015,1.166,1.166,1.166],[-3.400,.965,1.166,1.169,1.1813],
    [-3.390,1.0745,1.1724,1.1724,1.1869],[-3.170,1.0745,1.3101,1.3101,1.3101],
    [-3.100,1.0745,1.3121,1.33937,1.34337],[-3.000,1.0745,1.3121,1.3610,1.3838],
  ];
  const sections: SolidSection[] = stations.map(([z,half,edge,witness,center]) => {
    const inset=Math.min(.95,half*.985);
    return {z,ring:[[CENTER_X-half,1.164],[CENTER_X+half,1.164],
      [CENTER_X+half,edge],[CENTER_X+inset,witness],[CENTER_X,center],
      [CENTER_X-inset,witness],[CENTER_X-half,edge]]};
  });
  P.addEquipment('hullDetail',sectionSolid(sections));
}

function grilleSideRails(P: TankBuilderPort): void {
  for (const side of [-1,1]) {
    const rows: readonly (readonly [number,number,number,number])[] = [
      [-3.001,1.3843,1.3619,1.3121],[-2.740,1.3734,1.3619,1.3121],
      [-2.256,1.3531,1.3450,1.3148],[-2.140,1.3525,1.3412,1.3110],
    ];
    const sections: SolidSection[] = rows.map(([z,inner,witness,outer]) => {
      const ring: readonly (readonly [number,number])[] = [
        [.878,1.164],[1.0745,1.164],[1.0745,outer],[.95,witness],[.904,inner],[.878,inner],
      ];
      return {z,ring:side>0?ring.map(([x,y])=>[CENTER_X+x,y] as const):
        ring.map(([x,y])=>[CENTER_X-x,y] as const).reverse()};
    });
    P.addEquipment('hullDetail',sectionSolid(sections));
  }
  strip(P,'hullDetail',-.9031,.9071,[[-2.257,1.164,1.3527],[-2.1398,1.164,1.35247]]);
  strip(P,'hullDetail',-.879,.883,[[-3.001,1.307,1.3838],[-2.984,1.307,1.3828],
    [-2.978,1.307,1.3894],[-2.972,1.307,1.3892]]);
}

function louvreFloorY(z: number): number {
  return 1.30891-(z+2.99770)*.041871;
}

function grilleLouvres(P: TankBuilderPort): void {
  // The paired fields have a genuinely recessed floor. Seventeen inclined
  // vanes sit below the perimeter frame, with exposed troughs between them.
  strip(P,'hullDark',-.87461,.87856,[
    [-3.000,1.164,louvreFloorY(-3.000)],[-2.256,1.164,louvreFloorY(-2.256)],
  ]);
  for (let i=0;i<17;i++) {
    const rear=-2.970432+i*.042154,front=rear+.014886;
    const low=louvreFloorY(rear),high=1.345876-i*.001765;
    strip(P,'hullDark',-.87461,.87858,[
      [rear-.00589,louvreFloorY(rear-.00589)-.001,louvreFloorY(rear-.00589)+.001],
      [rear,low-.001,high],[front,louvreFloorY(front)-.001,louvreFloorY(front)+.001],
    ]);
  }
}

function grilleFrameY(z: number): number {
  return 1.395048-(z+2.997339)*.041834;
}

function grilleFrame(P: TankBuilderPort): void {
  const rear=-2.99734,front=-2.25310;
  for (const [left,right] of [[-.8775,-.8745],[-.02825,-.02535],[.02930,.03220],[.8785,.88149]] as const) {
    strip(P,'hullDetail',left,right,[[rear,grilleFrameY(rear)-.012,grilleFrameY(rear)],
      [front,grilleFrameY(front)-.012,grilleFrameY(front)]]);
  }
  strip(P,'hullDetail',-.02535,.02930,[[rear,1.308,1.38345],[front,1.277,1.35632]]);
  for (const z of [rear,front]) {
    strip(P,'hullDetail',-.8775,.88149,[[z-.002,grilleFrameY(z)-.012,grilleFrameY(z)],
      [z+.002,grilleFrameY(z)-.012,grilleFrameY(z)]]);
  }
  // Thin longitudinal ribs and two cross ties are visibly above the vanes;
  // they must never become a flat opaque sheet closing both louvre fields.
  for (const side of [-1,1]) {
    const x=CENTER_X+side*.451;
    strip(P,'hullDetail',x-.0115,x+.0115,[
      [-2.9848,1.3828,1.38727],[-2.2565,1.3535,1.35795],
    ]);
  }
  for (const z of [-2.760,-2.491]) {
    const y=1.38727-(z+2.9848)*.04028;
    strip(P,'hullDetail',-.87464,.87860,[[z-.0112,y-.005,y],[z+.0112,y-.0059,y-.0009]]);
  }
}

function trayFloor(P: TankBuilderPort): void {
  // Separate original undertray and perimeter. The two cover pockets retain
  // their lower floor; the asymmetric central bridge is not a second lid.
  const left=-.52202,right=.98195;
  strip(P,'hullDetail',left,right,[[-3.5545,1.3235,1.3255],[-3.4752,1.2258,1.3255]]);
  strip(P,'hullDetail',left,right,[[-3.4752,1.2258,1.26529],[-3.4208,1.15785,1.26529],
    [-3.09253,1.15785,1.26529]]);
  for (const [a,b] of [[left,-.46719],[.19526,.25759],[.92712,right]] as const) {
    strip(P,'hullDetail',a,b,[[-3.4752,1.265,1.32550],[-3.09253,1.265,1.32550]]);
  }
  strip(P,'hullDetail',left,right,[[-3.20867,1.265,1.32550],[-3.09253,1.265,1.32550]]);
}

function coverFrame(P: TankBuilderPort, center: number): void {
  // Each separate pressed frame surrounds, rather than fills, its pocket.
  const left=center-.33443,right=center+.33443,rear=-3.48158,front=-3.20696;
  for (const [a,b] of [[left,left+.012],[right-.012,right]] as const) {
    strip(P,'hullDetail',a,b,[[rear,1.2652,1.35695],[front,1.2652,1.35695]]);
  }
  for (const z of [rear,front]) {
    strip(P,'hullDetail',left,right,[[z-.003,1.2652,1.35695],[z+.003,1.2652,1.35695]]);
  }
  strip(P,'hullDetail',center-.3018,center+.3018,[[-3.204,1.3255,1.339],[-3.193,1.3255,1.328]]);
  strip(P,'hullDetail',left+.012,right-.012,[[-3.47077,1.26529,1.27037],[-3.24186,1.26529,1.27037]]);
}

function serviceLid(P: TankBuilderPort, center: number, rearY: number, slope: number): void {
  // Two different small inclinations are measured in the supplied source.
  // A chamfered six-millimetre sheet rests in its frame, not a bounding box.
  const rear=-3.4695,front=-3.2220,half=.33443,chamfer=.041;
  const rows: readonly (readonly [number,number])[] = [
    [rear,half-chamfer],[rear+.022,half],[front-.019,half],[front,half-.0777],
  ];
  P.addEquipment('hullDetail',sectionSolid(rows.map(([z,r]) => {
    const y=rearY-(z-rear)*slope;
    return {z,ring:[[center-r,y-.0064],[center+r,y-.0064],[center+r,y],[center-r,y]]};
  })));
  const latchY=rearY-(-3.235-rear)*slope;
  P.addEquipment('hullDetail',box(.5135,.008,.0081),center,latchY+.006,-3.235);
  P.addEquipment('hullDetail',cylX(.0068,.6036,16),center,1.3348,-3.2288);
}

function rearAccessCovers(P: TankBuilderPort): void {
  trayFloor(P);
  for (const x of [-.139174,.592023]) coverFrame(P,x);
  serviceLid(P,-.139174,1.40185,.25189);
  serviceLid(P,.592023,1.39844,.237754);
  P.addEquipment('hullDetail',box(2.1668,.0711,.0659),.001,1.1033,-3.4271);
}

function fenderCrown(z: number): number {
  const rows: readonly (readonly [number,number])[] = [[-1.3369,1.327],[.50,1.312],
    [1.30,1.302],[2.10,1.276],[2.70,1.226],[3.10,1.200]];
  for (let i=1;i<rows.length;i++) {
    if (z<=rows[i][0]) {
      const a=rows[i-1],b=rows[i];
      return a[1]+(b[1]-a[1])*(z-a[0])/(b[0]-a[0]);
    }
  }
  return rows[rows.length-1][1];
}

function fenderServicePanels(P: TankBuilderPort): void {
  const panels: readonly (readonly [number,number,number,number])[] = [
    [-1.3178,-.12729,1.333385,1.33012],[.60741,1.79808,1.32936,1.31425],
    [1.90543,2.77515,1.3114,1.24134],
  ];
  for (const side of [-1,1]) for (const [rear,front,rearY,frontY] of panels) {
    const center=CENTER_X+side*1.41697;
    strip(P,'hullDetail',center-.22236,center+.22236,[
      [rear,fenderCrown(rear)-.003,rearY],[front,fenderCrown(front)-.003,frontY],
    ]);
  }
}

function fenderTie(P: TankBuilderPort, side: number, z: number, top: number): void {
  const center=CENTER_X+side*1.40686;
  // Raised ends with a lower middle reproduce the pressed cross-tie, keeping
  // the old invented fasteners off the blank inboard fender strip.
  P.addEquipment('hullDetail',box(.4756,.013,.021),center,top-.017,z);
  for (const x of [center-.22,center+.22]) {
    P.addEquipment('hullDetail',box(.032,.023,.028),x,top-.0115,z);
  }
}

function midFenderFixtures(P: TankBuilderPort): void {
  fenderServicePanels(P);
  for (const side of [-1,1]) {
    for (let i=0;i<4;i++) {
      fenderTie(P,side,-1.15818+i*.29699,1.35452-i*.000816);
      fenderTie(P,side,.79303+i*.29699,1.34872-i*.003767);
    }
    for (let i=0;i<3;i++) fenderTie(P,side,2.04983+i*.29699,1.32251-i*.02452);
  }
}

export function addT90MEngineDeck(P: TankBuilderPort): void {
  rearRamp(P);
  grilleSideRails(P);
  grilleLouvres(P);
  grilleFrame(P);
  rearAccessCovers(P);
  midFenderFixtures(P);
}
