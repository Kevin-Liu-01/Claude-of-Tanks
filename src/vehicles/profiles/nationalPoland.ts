// Owner revision5: continuous Polish armor assemblies around the approved native T-80/T-72 bases.
// The integrator emits the untouched donor tub, rounded guards and gear.
// This pack adds finite modernization stock, never a replacement nose.
import * as THREE from 'three';
import {KIT, FITTINGS} from './kit.ts';
import {beamBetween} from './measuredPrimitives.ts';
import {castModernizedTurret} from './nationalDonorCore.ts';
import {sectionSolid, type SectionPoint} from './sectionSolid.ts';
import {eraCassette, glacisEraCassette, strappedPack} from './modernizationFittings.ts';
import {mount} from './fittingMount.ts';
import {addPolishProtection} from './nationalPolandProtection.ts';
import {markVehicleNightLens} from '../vehicleNightLighting.ts';
import {NATIONAL_POLAND_DESIGNS} from '../nationalPolandDesign.ts';
import type {NationalModernizationConfig} from '../nationalModernizationConfig.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
const {box, cylY, cylZ, torus} = KIT;

/** Exact cast/deck seat, excluding decoration and removable armor. */
function topOn(P: TankBuilderPort, owner: 'hull' | 'turret', x: number, z: number): number {
  const ray = new THREE.Raycaster(new THREE.Vector3(x, 5, z), new THREE.Vector3(0, -1, 0), 0, 6);
  const material = new THREE.MeshBasicMaterial({side: THREE.DoubleSide});
  let y = -Infinity;
  P.forEachBucketPart([owner], g => {
    const mesh = new THREE.Mesh(g, material); mesh.updateMatrixWorld(true);
    const hit = ray.intersectObject(mesh)[0]; if (hit) y = Math.max(y, hit.point.y);
  });
  material.dispose();
  if (!Number.isFinite(y)) throw new Error(`${P.spec.id}: missing Polish ${owner} seat at ${x},${z}`);
  return y;
}

/** Solid feet meet the underlying deck at both ends of a service box. */
function deckCase(P: TankBuilderPort, x: number, z: number, width: number, depth: number, height: number): void {
  const ends = [-depth * .32, depth * .32].map(dz => [z + dz, topOn(P, 'hull', x, z + dz)] as const);
  const floor = Math.max(...ends.map(([, y]) => y)) + .014;
  for (const [footZ, y] of ends) P.addEquipment('hullDetail', box(width * .75, floor - y + .015, .08), x, (floor + y) / 2, footZ);
  P.addEquipment('hullDetail', box(width, height, depth), x, floor + height / 2, z);
  P.addEquipment('hullDetail', box(width + .022, .02, depth + .014), x, floor + height + .006, z);
  for (const dz of [-depth * .34, depth * .34]) P.addEquipment('hullDark', box(.085, .025, .031), x, floor + height + .025, z + dz);
}

function packOnCast(P: TankBuilderPort, x: number, z: number, width: number, depth: number, height: number): void {
  const feet = [-depth * .31, depth * .31].map(dz => [z + dz, topOn(P, 'turret', x, z + dz)] as const);
  const floor = Math.max(...feet.map(([, y]) => y)) + .014;
  for (const [fz, y] of feet) P.addEquipment('turretDetail', box(width * .64, floor - y + .02, .055), x, (floor + y) / 2, fz);
  P.addEquipment('turretDetail', box(width + .015, .023, depth + .014), x, floor + .006, z);
  strappedPack(P, 'turret', [x, floor + .017 + height / 2, z], [width, height, depth]);
}

function hullEquipment(P: TankBuilderPort, c: NationalModernizationConfig): void {
  const m = c.model;
  // Small tiles follow the native low glacis and leave its folded guards clear.
  const zs = m === 0 ? [2.00, 2.28, 2.56, 2.83] : m === 1 ? [2.12, 2.45, 2.78, 3.09] : [2.15, 2.41, 2.67, 2.91];
  const xs = m === 1 ? [.23, .65, .99] : [.23, .56, .86];
  for (const side of [-1, 1]) for (const z of zs) for (const x of xs)
    glacisEraCassette(P, `glacis_era_${side < 0 ? 'L' : 'R'}`, side * x, z, [m === 1 ? .32 : .265, .082, m === 1 ? .29 : .23]);
  const hatchZ = m === 0 ? 1.66 : m === 1 ? 1.68 : 1.59, hatchY = topOn(P, 'hull', 0, hatchZ);
  P.addHatch('hull', cylY(.29, .29, .033, 24), 0, hatchY + .013, hatchZ);
  for (const x of [-.16, 0, .16]) {
    P.addEquipment('hullDetail', box(.135, .050, .10), x, hatchY + .050, hatchZ + .15);
    P.addModuleVisual('optics', 'hullGlass', box(.104, .025, .012), x, hatchY + .052, hatchZ + .206);
  }
  const deckZ = m === 0 ? -2.48 : m === 1 ? -2.49 : -2.37;
  for (const x of [-.49, .49]) {
    const y = topOn(P, 'hull', x, deckZ);
    P.addEquipment('hullDetail', box(.86, .031, 1.03), x, y + .012, deckZ);
    for (let i = 0; i < 12; i++) P.addEquipment('hullDark', box(.76, .008, .023), x, y + .034, deckZ - .47 + i * .085);
  }
  for (const side of [-1, 1]) {
    deckCase(P, side * 1.39, m === 0 ? -2.71 : -2.63, m === 1 ? .47 : .39, m === 1 ? .69 : .56, m === 1 ? .18 : .11);
    if (m === 0) deckCase(P, side * 1.37, -1.83, .34, .40, .07);
    const x = side * .91, z = m === 0 ? 2.72 : m === 1 ? 2.95 : 2.77;
    const y = topOn(P, 'hull', x, z);
    P.addEquipment('hullDetail', box(.20, .072, .14), x, y + .033, z);
    P.addEquipment('hullDetail', cylZ(.073, .085, 16), x, y + .082, z + .054);
    P.addEquipment('hullGlass', markVehicleNightLens(cylZ(.056, .012, 16), 'headlight'), x, y + .082, z + .103);
    for (const dx of [-.103, .103]) P.addEquipment('hullDark', beamBetween([x + dx, y, z - .10], [x + dx, y + .18, z + .095], .009));
    P.addEquipment('hullDark', beamBetween([x - .103, y + .18, z + .095], [x + .103, y + .18, z + .095], .009));
  }
  skirts(P, m);
  for (const side of [-1, 1]) {
    const z = m === 0 ? 3.012 : m === 1 ? 3.34 : 3.175, y = m === 0 ? .99 : m === 1 ? .97 : .823;
    P.addEquipment('hullDetail', box(.12, .082, .085), side * .67, y - .018, z - .018);
    P.addEquipment('hullDark', torus(.055, .016, 16, 6), side * .67, y - .020, z + .031);
  }
}

/** Layered skirt modules have a real chamfered thickness and a continuous
 * mounting rail. Their returns turn inwards only past the native track ends. */
function skirts(P: TankBuilderPort, model: number): void {
  const count = model === 0 ? 7 : model === 1 ? 6 : 8;
  const length = model === 1 ? 5.82 : 5.15, zCenter = model === 1 ? .07 : .03;
  const inner = model === 1 ? 1.92 : model === 0 ? 1.87 : 1.86;
  const thick = model === 1 ? .25 : .22, outer = inner + thick;
  const low = model === 1 ? .73 : model === 0 ? .89 : .98, pitch = length / count;
  const front = zCenter + length / 2, rear = zCenter - length / 2;
  const bevel = (inside: number, outside: number, bottom: number, top: number): SectionPoint[] =>
    [[inside, bottom + .055], [inside + .026, bottom], [outside - .035, bottom],
      [outside, bottom + .065], [outside, top - .065], [outside - .035, top], [inside, top]];
  const mirrored = (ring: SectionPoint[], side: number): SectionPoint[] => side > 0 ? ring : ring.map(([x, y]) => [-x, y] as const).reverse();
  for (const side of [-1, 1]) {
    const heights: number[] = [];
    for (let i = 0; i < count; i++) {
      const z = rear + pitch * (i + .5), deck = topOn(P, 'hull', side * 1.56, z);
      const bridge = Math.max(1.45, deck + .015), high = bridge - .015, h = high - low;
      heights.push(high);
      P.addEquipment('hullDetail', box(.11, bridge - deck + .025, .15), side * 1.56, (bridge + deck) / 2, z);
      P.addEquipment('hullDetail', box(inner - 1.50 + .085, .04, .15), side * (inner + 1.50 + .085) / 2, bridge, z);
      // The bevels break the silhouette in all three axes; narrow gaps expose
      // a permanent recessed carrier instead of a hollow paper curtain.
      const half = pitch / 2 - .017;
      P.addExternalArmor('hull', sectionSolid([
        {z: z - half, ring: mirrored(bevel(inner + .018, outer - .021, low + .023, high - .016), side)},
        {z: z - half + .07, ring: mirrored(bevel(inner, outer, low, high), side)},
        {z: z + half - .07, ring: mirrored(bevel(inner, outer, low, high), side)},
        {z: z + half, ring: mirrored(bevel(inner + .018, outer - .021, low + .023, high - .016), side)},
      ]));
      P.addEquipment('hullDetail', box(.060, .15, pitch + .024), side * (inner + .035), high - .060, z);
      const rows = model === 2 ? 2 : 3, columns = 3;
      const tileHeight = (h - .105) / rows, tileDepth = (pitch - .15) / columns;
      for (let row = 0; row < rows; row++) for (let j = 0; j < columns; j++)
        eraCassette(P, 'hull', `skirt_era_${side < 0 ? 'L' : 'R'}`,
          [side * (outer + .041), low + .055 + tileHeight * (row + .5), z + (j - (columns - 1) / 2) * tileDepth],
          [.092, tileHeight - .015, tileDepth - .019]);
      for (const dz of [-pitch * .30, pitch * .30])
        P.addEquipment('hullDark', cylZ(.024, .029, 8).rotateY(Math.PI / 2), side * (outer + .008), high - .032, z + dz);
    }
    const frontClear = model === 1 ? 3.60 : model === 0 ? 3.22 : 3.35;
    const frontEnd = model === 1 ? 3.82 : model === 0 ? 3.43 : 3.59;
    const rearClear = model === 1 ? -3.12 : model === 0 ? -3.10 : -2.98;
    const rearEnd = model === 1 ? -3.47 : model === 0 ? -3.39 : -3.31;
    const frontTop = model === 1 ? .89 : model === 0 ? .88 : .87;
    // Outboard nose stock follows below the curved fender, then folds across
    // the free space ahead of the track. Both end caps are connected solids.
    P.addExternalArmor('hull', sectionSolid([
      {z: front - .040, ring: mirrored(bevel(inner + .020, outer - .020, low + .030, heights[count - 1] - .018), side)},
      {z: frontClear, ring: mirrored(bevel(inner, outer, Math.min(low, frontTop - .25), frontTop + .19), side)},
      {z: frontEnd, ring: mirrored(bevel(1.52, 1.52 + thick, frontTop - .24, frontTop), side)},
    ]));
    P.addExternalArmor('hull', sectionSolid([
      {z: rearEnd, ring: mirrored(bevel(1.53, 1.53 + thick, .80, 1.075), side)},
      {z: rearClear, ring: mirrored(bevel(inner, outer, Math.min(low, .94), 1.23), side)},
      {z: rear + .040, ring: mirrored(bevel(inner + .020, outer - .020, low + .030, heights[0] - .018), side)},
    ]));
    // One continuous fitted shoulder bridges the native receiving fender to
    // every armor module and follows both curved end returns. Its lower face
    // overlaps the real fender and carrier: no air slit remains between beams.
    const carrierRows = [[rearEnd, 1.075], [rearClear, 1.23],
      ...heights.map((y, i) => [rear + pitch * (i + .5), y]), [frontClear, frontTop + .19], [frontEnd, frontTop]];
    const interpolate = (rows: number[][], z: number): number => {
      for (let i=1;i<rows.length;i++) if(z<=rows[i][0]) {
        const [az,ay]=rows[i-1],[bz,by]=rows[i];return ay+(by-ay)*Math.max(0,Math.min(1,(z-az)/(bz-az)));
      }
      return rows[rows.length-1][1];
    };
    const roofKnots = model === 0 ? [-3.34,-3.10,-2.86,-2.40,-1.20,.60,2.40,2.90,3.07,3.20,3.345]
      : model === 1 ? [-3.45,-3.15,-2.80,1.65,2.70,3.06,3.23,3.43,3.59,3.73,3.805]
      : [-3.31,-3.18,-2.96,-2.76,-1.89,.395,1.70,2.50,3.08,3.22,3.34,3.43,3.50];
    const stations = [...new Set([...roofKnots, rear, front,
      ...heights.map((_,i)=>rear+pitch*(i+.5))])].sort((a,b)=>a-b);
    P.addEquipment('hullDetail', sectionSolid(stations.map(z => {
      const deck = topOn(P,'hull',side*1.53,z), receiving = interpolate(carrierRows,z);
      const turnX = z < rearClear ? interpolate([[rearEnd,1.53],[rearClear,inner]],z)
        : z > frontClear ? interpolate([[frontClear,inner],[frontEnd,1.52]],z) : inner;
      const out = turnX + .095;
      return {z,ring:mirrored([[1.50,deck-.010],[out,receiving-.027],
        [out,Math.max(receiving+.017,deck+.025)],[1.50,deck+.025]],side)};
    })));
    P.addEquipment('hullDetail', beamBetween([side * (inner + .035), heights[0] - .04, rear + .03],
      [side * (inner + .035), 1.18, rearClear + .05], .020));
  }
}

type HousingStation = readonly [z: number, inside: number, outside: number, bottom: number, top: number];

/** The connected armor shell stays after its individual ERAWA tiles are spent.
 * A deliberately exposed crown and lower cast chin preserve donor ancestry. */
function turretArmor(P: TankBuilderPort, model: number): void {
  const stocks: THREE.BufferGeometry[] = [];
  const stations: readonly HousingStation[] = model === 0 ? [
    [-1.83, .59, 1.15, .36, .58], [-1.43, .62, 1.42, .31, .60],
    [-.96, 1.03, 1.64, .28, .63], [-.38, 1.22, 1.71, .23, .67],
    [.27, 1.17, 1.67, .19, .68], [.82, .98, 1.51, .18, .66],
    [1.23, .56, 1.14, .18, .59], [1.50, .42, .66, .18, .49],
  ] : model === 1 ? [
    [-2.08, .57, 1.28, .38, .64], [-1.55, .63, 1.64, .33, .69],
    [-1.00, 1.06, 1.79, .28, .73], [-.36, 1.25, 1.81, .22, .74],
    [.38, 1.16, 1.78, .19, .74], [.96, .90, 1.46, .18, .68],
    [1.36, .48, .97, .18, .55], [1.54, .42, .60, .18, .47],
  ] : [
    [-1.63, .54, 1.05, .32, .51], [-1.24, .59, 1.35, .29, .55],
    [-.75, 1.03, 1.51, .25, .58], [-.12, 1.17, 1.59, .21, .60],
    [.45, 1.10, 1.51, .18, .59], [.93, .84, 1.25, .18, .56],
    [1.27, .47, .88, .18, .49], [1.43, .41, .56, .18, .43],
  ];
  const stock = (g: THREE.BufferGeometry) => { stocks.push(g.clone()); P.addExternalArmor('turret', g); };
  for (const side of [-1, 1]) {
    stock(sectionSolid(stations.map(([z, inner, outer, bottom, top]) => {
      const ring: SectionPoint[] = [[inner, bottom + .04], [inner + .028, bottom], [outer - .07, bottom],
        [outer, bottom + .07], [outer, top - .065], [outer - .055, top], [inner, top]];
      return {z, ring: side > 0 ? ring : ring.map(([x, y]) => [-x, y] as const).reverse()};
    })));
    // Separate bolted access lids express the side panniers without making
    // the construction a disconnected wall of individual blocks.
    const xs = model === 1 ? [1.67, 1.53] : model === 0 ? [1.57, 1.42] : [1.46, 1.32];
    for (let i = 0; i < 2; i++) {
      const z = i === 0 ? -.38 : -1.13, x = side * xs[i];
      const seats = [-.145, .145].map(dz => [z + dz, armorTop(stocks, x, z + dz)] as const);
      const floor = Math.max(...seats.map(([, y]) => y)) + .006;
      for (const [fz, y] of seats) P.addEquipment('turretDetail', box(.145, floor - y + .012, .055), x, (floor + y) / 2, fz);
      P.addEquipment('turretDetail', box(.19, .017, .36), x, floor + .005, z);
      P.addEquipment('turretDark', box(.055, .019, .11), x, floor + .021, z);
    }
  }
  const rear = stations[0][0], bridgeY = model === 1 ? .51 : model === 0 ? .465 : .415;
  stock(box(model === 1 ? 1.36 : model === 0 ? 1.33 : 1.22, model === 1 ? .27 : .22, .22).translate(0, bridgeY, rear + .09));
  if (model === 1) {
    stock(box(1.28, .30, .70).translate(0, .515, -1.76));
    P.addEquipment('turretDetail', box(1.29, .024, .68), 0, .676, -1.76);
    for (const x of [-.39, .39]) P.addEquipment('turretDark', box(.067, .026, .27), x, .697, -1.76);
  }
  // Seat ERA on the actual new permanent housing, never on the buried cast
  // shell. Sparse rows on Husarz, deep three-course Wilk, fine compact Zubr.
  const seeds: readonly (readonly [number, number])[] = model === 0
    ? [[.58,1.47],[.81,1.35],[1.06,1.21],[1.32,1.02],[1.52,.77],[1.64,.46],[1.71,.10],[1.70,-.25],[1.68,-.57],[1.61,-.91],[1.51,-1.21]]
    : model === 1 ? [[.53,1.50],[.74,1.41],[.96,1.27],[1.19,1.11],[1.43,.94],[1.64,.71],[1.77,.39],[1.81,.02],[1.81,-.31],[1.80,-.64],[1.75,-.96],[1.66,-1.28],[1.51,-1.58]]
    : [[.51,1.40],[.70,1.31],[.91,1.18],[1.12,1.02],[1.30,.80],[1.46,.52],[1.56,.23],[1.59,-.08],[1.56,-.39],[1.49,-.69],[1.41,-.98],[1.28,-1.26]];
  for (const side of [-1,1]) for (let i = 0; i < seeds.length; i++) {
    const [x,z] = seeds[i], aft = z < -.8;
    const ys = model === 1 ? (i < 2 ? [.285,.43] : aft ? [.44,.61] : [.28,.46,.64])
      : model === 0 ? (i < 2 ? [.285] : aft ? [.405,.555] : [.30,.51])
      : (i < 2 ? [.29] : aft ? [.36,.485] : [.285,.455]);
    for (const y of ys) housingEra(P, stocks, [side*x,y,z], model === 2 ? .145 : model === 1 ? .155 : .17,
      model === 1 ? .10 : .085, side);
  }
  turretLoadout(P, model, stocks);
  addPolishProtection(P, model, stocks);
  for (const g of stocks) g.dispose();
}

/** Four real feet carry each level cabinet across the sloping pannier. */
function armorCabinet(P: TankBuilderPort, stocks: readonly THREE.BufferGeometry[], x: number, z: number,
  width: number, depth: number, height: number): number {
  const seats = [-1,1].flatMap(sx => [-1,1].map(sz => {
    const fx=x+sx*width*.32,fz=z+sz*depth*.32;return [fx,armorTop(stocks,fx,fz),fz] as const;
  }));
  const floor = Math.max(...seats.map(p=>p[1]))+.012;
  for(const [fx,y,fz] of seats)P.addEquipment('turretDetail',box(.065,floor-y+.016,.065),fx,(floor+y)/2,fz);
  utilityCase(P,x,floor,z,width,depth,height);
  return floor+height+.025;
}

/** A painted case and steel hardware share an explicit receiving floor. */
function utilityCase(P: TankBuilderPort,x:number,floor:number,z:number,width:number,depth:number,height:number):void {
  P.addEquipment('turretDetail',box(width,height,depth),x,floor+height/2,z);
  P.addEquipment('turretDetail',box(width+.014,.019,depth+.015),x,floor+height+.003,z);
  for(const sx of [-1,1]) {
    P.addEquipment('turretDark',box(.033,.051,.017),x+sx*width*.32,floor+height*.70,z+depth/2+.006);
    P.addEquipment('turretDark',box(.035,.025,.079),x+sx*width*.32,floor+height+.023,z-depth*.26);
    P.addEquipment('turretDetail',box(.020,height*.81,.018),x+sx*width*.39,floor+height*.46,z+depth/2+.003);
  }
  P.addEquipment('turretDark',box(width*.31,.015,.023),x,floor+height+.025,z);
}

/** Low tools are clamped directly to the pannier; no long upright silhouette
 * enters the roof-gun sweep. A bent cable has its own mounted clips. */
function armorTools(P: TankBuilderPort,stocks: readonly THREE.BufferGeometry[],x:number,z:number,length:number):void {
  const ends=[z-length/2,z+length/2], ys=ends.map(t=>armorTop(stocks,x,t)+.036);
  P.addEquipment('turretDark',beamBetween([x,ys[0],ends[0]],[x,ys[1],ends[1]],.013));
  P.addEquipment('turretDetail',box(.13,.024,.15),x,ys[0],ends[0]+.055);
  for(const f of [.20,.76]) {
    const at=ends[0]+f*length,seat=armorTop(stocks,x,at),toolY=ys[0]+f*(ys[1]-ys[0]);
    P.addEquipment('turretDetail',box(.085,toolY-seat+.018,.030),x,(seat+toolY)/2,at);
  }
  const hoseX=x+(x<0?-.065:.065);
  for(let i=0;i<4;i++) {
    const az=z-length*.35+i*length*.175,bz=az+length*.175;
    const ay=armorTop(stocks,hoseX,az)+.023,by=armorTop(stocks,hoseX,bz)+.023;
    P.addEquipment('turretDark',beamBetween([hoseX,ay,az],[hoseX,by,bz],.008));
    P.addEquipment('turretDetail',box(.030,.036,.020),hoseX,ay-.013,az);
  }
}

/** National cargo layouts remain deliberately different: Husarz has field
 * stores in its broad basket, Wilk carries armored electronics cases, while
 * Zubr keeps a narrow tool-and-camouflage load around its compact casting. */
function turretLoadout(P:TankBuilderPort,model:number,stocks:readonly THREE.BufferGeometry[]):void {
  if(model===0) {
    for(const side of [-1,1]) {
      armorCabinet(P,stocks,side*1.10,-1.35,.32,.42,.15);
      armorTools(P,stocks,side*1.32,-.80,.39);
      // The rack floor is y=.395; trays overlap its transverse floor bars.
      P.addEquipment('turretDetail',box(.48,.024,.37),side*.72,.407,-2.055);
      utilityCase(P,side*.72,.417,-2.055,.43,.33,.22);
    }
    P.addEquipment('turretDetail',box(.70,.024,.34),0,.407,-2.055);
    P.addEquipment('turretCloth',cylZ(.12,.62,18).rotateY(Math.PI/2),0,.535,-2.055);
    for(const x of [-.21,.21])P.addEquipment('turretDark',torus(.123,.012,18,6).rotateY(Math.PI/2),x,.535,-2.055);
  } else if(model===1) {
    for(const side of [-1,1]) {
      armorCabinet(P,stocks,side*.35,-1.76,.48,.50,.17);
      armorCabinet(P,stocks,side*1.28,-1.39,.31,.40,.12);
      armorTools(P,stocks,side*1.51,-.82,.35);
      // Louvered cooling faces and attached conduits give the heavy bustle
      // its electronics role, visibly distinct from the open Husarz basket.
      for(let i=0;i<5;i++)P.addEquipment('turretDark',box(.29,.010,.011),side*.35,.728+i*.025,-2.019);
      P.addEquipment('turretDark',beamBetween([side*.54,.70,-1.92],[side*.71,.70,-1.76],.012));
      P.addEquipment('turretDetail',box(.08,.07,.08),side*.65,.69,-1.82);
    }
    P.addEquipment('turretDetail',box(1.04,.024,.235),0,.411,-2.215);
    utilityCase(P,0,.424,-2.215,.96,.205,.19);
    for(const x of [-.75,.75]) {
      P.addEquipment('turretDetail',box(.19,.027,.23),x,.414,-2.215);
      for(let i=0;i<3;i++) {
        P.addEquipment('turretTrack',box(.14,.055,.051),x,.455,-2.285+i*.072);
        P.addEquipment('turretDark',box(.16,.015,.013),x,.490,-2.285+i*.072);
      }
    }
  } else {
    armorCabinet(P,stocks,-.89,-1.27,.30,.34,.135);
    armorCabinet(P,stocks,.89,-1.27,.30,.34,.09);
    armorTools(P,stocks,-1.25,-.61,.53);
    armorTools(P,stocks,1.24,-.60,.49);
    P.addEquipment('turretDetail',box(1.42,.024,.24),0,.350,-1.745);
    P.addEquipment('turretCloth',cylZ(.095,.78,18).rotateY(Math.PI/2),.22,.457,-1.745);
    for(const x of [-.04,.48])P.addEquipment('turretDark',torus(.098,.011,18,6).rotateY(Math.PI/2),x,.457,-1.745);
    utilityCase(P,-.56,.362,-1.745,.30,.21,.19);
  }
  // Laser-warning heads and their finite guards sit on exposed outer armor,
  // outside the cupola footprint and away from the RWS barrel envelope.
  for(const side of [-1,1]) {
    const x=side*(model===1?1.48:model===0?1.38:1.26),z=model===2?.59:.55;
    const seat=armorTop(stocks,x,z),y=seat+.047;
    P.addEquipment('turretDetail',box(.105,.084,.13),x,y,z);
    P.addModuleVisual('optics','turretGlass',box(.074,.035,.013),x,y+.006,z+.071);
    for(const dx of [-.068,.068])P.addEquipment('turretDetail',beamBetween([x+dx,seat-.008,z-.06],[x+dx,seat+.133,z+.058],.008));
    P.addEquipment('turretDetail',beamBetween([x-.068,seat+.133,z+.058],[x+.068,seat+.133,z+.058],.008));
  }
}

function armorTop(stocks: readonly THREE.BufferGeometry[], x: number, z: number): number {
  const ray = new THREE.Raycaster(new THREE.Vector3(x,2,z),new THREE.Vector3(0,-1,0),0,3);
  const material = new THREE.MeshBasicMaterial({side:THREE.DoubleSide}); let y = -Infinity;
  for (const g of stocks) {const mesh = new THREE.Mesh(g,material);mesh.updateMatrixWorld(true);
    const hit = ray.intersectObject(mesh)[0];if(hit)y=Math.max(y,hit.point.y);}
  material.dispose();if(!Number.isFinite(y))throw new Error(`Missing Polish armor lid seat at ${x},${z}`);return y;
}

function housingEra(P: TankBuilderPort, stocks: readonly THREE.BufferGeometry[], seed: readonly [number,number,number], width: number, thickness: number, side: number): void {
  const direction = new THREE.Vector3(seed[0],0,seed[2]).normalize();
  const origin = direction.clone().multiplyScalar(4); origin.y = seed[1]; direction.negate();
  const ray = new THREE.Raycaster(origin,direction,0,7), mat = new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  let nearest: THREE.Intersection | undefined;
  for (const g of stocks) {
    const mesh = new THREE.Mesh(g,mat); mesh.updateMatrixWorld(true);
    const hit = ray.intersectObject(mesh)[0]; if (hit && (!nearest || hit.distance < nearest.distance)) nearest = hit;
  }
  mat.dispose();
  if (!nearest?.face) throw new Error(`${P.spec.id}: missing permanent Polish armor seat ${seed}`);
  const normal = nearest.face.normal.clone(); if (normal.dot(direction)>0) normal.negate();
  const rotation = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),normal));
  const center = nearest.point.clone().addScaledVector(normal,thickness/2-.006);
  eraCassette(P,'turret',`turret_era_${side<0?'L':'R'}`,center.toArray(),[width,thickness,width],[rotation.x,rotation.y,rotation.z]);
}

function turret(P: TankBuilderPort, model: number): void {
  const d = NATIONAL_POLAND_DESIGNS[model];
  castModernizedTurret(P, {halfWidth: model === 0 ? 1.38 : model === 1 ? 1.41 : 1.31,
    roofY: d.roofY, rearZ: d.turretRear, frontZ: model === 2 ? 1.34 : 1.44,
    shoulderY: model === 1 ? .41 : .35, crownHalf: .77});
  turretArmor(P, model);
  if (model === 0) {
    rearRack(P, -1.82, .55, 2.25, .31, .48);
    for (const side of [-1, 1]) packOnCast(P, side * .91, -.80, .30, .37, side > 0 ? .12 : .18);
  } else if (model === 1) {
    rearRack(P, -2.08, .54, 2.31, .28, .27);
  } else {
    rearRack(P, -1.62, .46, 1.93, .24, .26);
    packOnCast(P, 0, -1.06, .53, .23, .12);
  }
}

function rearRack(P: TankBuilderPort, front: number, y: number, width: number, height: number, depth: number): void {
  const back = front - depth;
  for (const x of [-width / 2, width / 2]) {
    P.addEquipment('turretDetail', box(.022, height, .022), x, y, back);
    for (const dy of [-height / 2, height / 2]) P.addEquipment('turretDetail', box(.022, .022, depth), x, y + dy, front - depth / 2);
  }
  for (const dy of [-height / 2, height / 2]) P.addEquipment('turretDetail', box(width, .022, .022), 0, y + dy, back);
  for (let i = 0; i < 9; i++) {
    const x = -width * .46 + i * width * .115;
    P.addEquipment('turretDetail', box(.018, .022, depth), x, y - height / 2, front - depth / 2);
    P.addEquipment('turretDetail', box(.013, height, .013), x, y, back);
  }
  // Rails reach the casting at z=-.87 regardless of the shorter curved tail.
  for (const x of [-.46, .46]) for (const dy of [-height * .28, height * .28]) {
    const reach = -.87 - back;
    P.addEquipment('turretDetail', box(.029, .031, reach), x, y + dy, (back - .87) / 2);
  }
}

function turretEquipment(P: TankBuilderPort, c: NationalModernizationConfig): void {
  const model = c.model, d = NATIONAL_POLAND_DESIGNS[model];
  const armorParts: THREE.BufferGeometry[] = [];
  P.forEachBucketPart(['turretExternalArmor'], g => armorParts.push(g));
  for (const side of [-1, 1]) {
    const x = side * (model === 1 ? 1.10 : .99), z = model === 0 ? -.16 : -.07;
    const seat = topOn(P, 'turret', x, z), platform = seat + .10;
    P.addEquipment('turretDetail', cylY(.065, .085, .12, 12), x, seat + .051, z);
    P.addEquipment('turretDetail', box(.40, .034, .18), x, platform, z);
    const bank = FITTINGS.smokeBank({mats: P.mats, count: model === 1 ? 5 : 4, r: .034,
      len: .21, pitch: -.56, splay: side * .68, arc: .29, spacing: .077, shadows: P.q});
    mount(P, 'turret', bank, x, platform + .075, z + .022);
    // The right mast stands on aft armor beyond the complete gun reach.
    const az = side > 0 ? [-1.76, -2.00, -1.60][model] : -.88, ax = side > 0 ? .72 : -.77;
    const ay = side > 0 ? armorTop(armorParts, ax, az) : topOn(P, 'turret', ax, az);
    P.addEquipment('turretDetail', cylY(.060, .075, .06, 12), ax, ay + .024, az);
    P.addEquipment('turretDark', cylY(.008, .014, .65, 8), ax, ay + .375, az);
  }
  const x = -.62, z = .15, seat = topOn(P, 'turret', x, z), y = Math.max(seat, d.roofY) + .055;
  P.addEquipment('turretDetail', box(.30, y - seat + .035, .22), x, (y + seat) / 2, z - .035);
  P.addEquipment('turretDetail', box(.30, .024, .16), x, y + .076, z + .064);
  for (const side of [-1, 1]) P.addEquipment('turretDetail', box(.026, .112, .16), x + side * .137, y + .028, z + .064);
  P.addModuleVisual('optics', 'turretGlass', box(.23, .076, .012), x, y + .026, z + .040);
}

export function buildNationalPoland(P: TankBuilderPort, c: NationalModernizationConfig): void {
  hullEquipment(P, c);
  turret(P, c.model);
  turretEquipment(P, c);
}
