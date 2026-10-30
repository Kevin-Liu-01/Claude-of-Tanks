// Ukrainian field-protection stock. Primary hulls, turret shells, fenders and
// working weapon assemblies are deliberately outside this helper's ownership.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { beamBetween } from './measuredPrimitives.ts';
import { sampleArmorRay } from './armorFaceSampling.ts';
import { eraCassette } from './modernizationFittings.ts';
import type { GhillieConfig } from '../ghillieSuit.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type Point=readonly[number,number,number];
type Owner='hull'|'turret';
type ProtectionId='t80u_zoria'|'t72b3m_hetman'|'t72b3_sich'|'t72b3m_hetman_ii';
interface ProtectionLayout {
  hullX:number; turretX:number; rearZ:number; sideBack:number; sideFront:number;
  bottom:number; top:number; rearHalf:number; hullPanels:readonly(readonly[number,number])[];
  /** The screen slats' ends stand 12 mm inside their 17 mm rails (the cap's rim 14.4 mm off the rail's axis), so their
   * end caps are never drawn: open-ended slats (264: Hetman II's triangle ceiling, frontEraPackages). */
  openSlatEnds?:boolean;
}

// Owner 2026-10-15 (VEH-21): the Hetman, Hetman II and Sich carry their donor turrets (nationalDonorTurrets.ts); their
// hull screens are laid from these rows, while their turret screens, cages and turret nets are the donor-turret kit's
// (ukraineDonorTurretKit.ts, ukraineDonorSuit): the turret fields of those three rows describe the retired cast and
// welded concept turrets and are no longer laid.
export const NATIONAL_UKRAINE_PROTECTION:Readonly<Record<ProtectionId,ProtectionLayout>>={
  t80u_zoria:{hullX:2.34,turretX:1.87,rearZ:-2.12,sideBack:-1.51,sideFront:-.52,bottom:.28,top:.72,rearHalf:1.43,
    hullPanels:[[-2.65,-1.44],[-1.27,-.05],[.15,1.43],[1.63,2.67]]},
  t72b3m_hetman:{hullX:2.38,turretX:1.88,rearZ:-2.40,sideBack:-1.80,sideFront:-.56,bottom:.34,top:.78,rearHalf:1.42,
    hullPanels:[[-2.65,-1.44],[-1.27,-.05],[.15,1.43],[1.63,2.67]]},
  t72b3_sich:{hullX:2.37,turretX:1.91,rearZ:-2.23,sideBack:-1.47,sideFront:-.50,bottom:.27,top:.74,rearHalf:1.47,
    hullPanels:[[-2.65,-1.44],[-1.27,-.05],[.15,1.43],[1.63,2.67]]},
  t72b3m_hetman_ii:{hullX:2.43,turretX:1.97,rearZ:-3.19,sideBack:-2.40,sideFront:-.65,bottom:.40,top:.81,rearHalf:1.48,
    hullPanels:[[-2.65,-1.44],[-1.27,-.05],[.15,1.43],[1.63,2.67]],openSlatEnds:true},
};

/** Low hulls need a falling cage header at the gun's outer traverse reach.
 * Only end courses fall away; the retained armor/ERA and native gun limits
 * stay intact. The net, lashings, posts and support ends share this datum. */
function hullCageTop(id:ProtectionId,z:number):number{
  // Owner 2026-10-15 (VEH-21): the Sich's T-72B3 donor gun sits 6 cm lower than the cast concept's: the end courses fall
  // further so its full depression clears the headers, feet and lashings over the hull ends.
  if(id==='t72b3_sich')return 1.42-.16*Math.min(1,Math.max(0,(Math.abs(z)-1.35)/.75));
  if(id==='t72b3m_hetman_ii')return 1.46-.11*Math.min(1,Math.max(0,(Math.abs(z)-1.55)/.75));
  // Owner 2026-10-15 (VEH-21): the Hetman's T-72B3M (2016) donor gun sits 7 cm lower than the cast concept's, so at full
  // depression over the hull ends its barrel sweeps lower: the end courses fall further, as the Sich's do.
  if(id==='t72b3m_hetman')return 1.46-.10*Math.min(1,Math.max(0,(Math.abs(z)-1.35)/.75));
  return 1.46-.055*Math.min(1,Math.max(0,(Math.abs(z)-1.35)/.75));
}

/**
 * 2026-10-12 (cam-netting; the owner, 10-09: "add a ton more netting and camo leaves all over the zoria and hetman and
 * sich", again on 10-12): the plates the screens left bare: the glacis [z0, z1], its top and its fall per metre in
 * the hull frame, and the turret roof's height in the turret frame (measured on the built hulls; every net is laid on
 * the armour, so these are only where it starts its search).
 */
const DECKS:Readonly<Record<ProtectionId,{glacis:readonly[number,number];fall:number;glacisTop:number;roof:number;marks:readonly(readonly[number,number])[]}>>={
  t80u_zoria:{glacis:[1.95,3.25],fall:.42,glacisTop:1.47,roof:.68,marks:[[-.92,-1.02],[-.53,-1.20]]},
  t72b3m_hetman:{glacis:[1.95,3.45],fall:.38,glacisTop:1.50,roof:.72,marks:[[-.79,-1.12],[.79,-1.12]]},
  t72b3_sich:{glacis:[1.95,3.30],fall:.38,glacisTop:1.45,roof:.68,marks:[[-.78,-1.12],[1.21,-.34]]},
  t72b3m_hetman_ii:{glacis:[1.95,3.06],fall:.38,glacisTop:1.50,roof:.72,marks:[[-1.18,-2.30],[-1.24,-1.59]]},
};
/**
 * The trident and the hull number keep their places on the turret roof (marks: the turret-frame seats the marking
 * solver chose on the bare kit, tools/gen-vehicle-marking-seats.mjs): the roof net is opened 26 cm round each, so the
 * finished vehicle still shows them (the tank asset check's marking visibility receipt).
 */
const markOpening=([x,z]:readonly[number,number]):[number,number][]=>[[x-.26,z-.26],[x+.26,z-.26],[x+.26,z+.26],[x-.26,z+.26]];

/** A roof or deck net laid over the armour (ghillieFleetSuits.ts laid: clipped to the armour, opened round every lid). */
function laidNet(panel:Omit<NonNullable<NonNullable<GhillieConfig['hull']>['top']>[number],'yFromArmour'|'clipToArmour'|'autoOpeningsM'|'rimScale'>){
  return {yFromArmour:true,clipToArmour:true,autoOpeningsM:.07,rimScale:.5,...panel};
}

/** The lower bow plate under the nose: [z of the nose, top of the plate] (the netting lane's bow drape). */
const BOW:Readonly<Record<ProtectionId,readonly[number,number]>>={
  t80u_zoria:[3.30,.98],t72b3m_hetman:[3.78,.96],t72b3_sich:[3.46,.94],t72b3m_hetman_ii:[3.78,.96],
};

/** Bounded panels follow the actual open screens, not a generic roof blanket.
 * The central roof, forward sights, gun throat, hatch circles and vertical
 * mission-attachment launch column have no camouflage panels over them.
 * 2026-10-09 (owner: "add a ton more netting and camo leaves all over the zoria and hetman and sich"): every screen
 * bay on each flank is netted (the second bay's ERA no longer left bare), the garnish is denser with more cut boughs
 * and a drape hangs over the lower bow plate; the roof, the hatches, the engine deck and the drone column stay open,
 * and the suit keeps the working clearances (fieldClearanceM). */
function camouflage(id:ProtectionId,index:number):GhillieConfig{
  const d=NATIONAL_UKRAINE_PROTECTION[id],[bowZ,bowTop]=BOW[id],k=DECKS[id];
  return {
    id,seed:8460+index*113,style:'leafy',density:1.8,leafScale:.8,boughShare:.42,fieldClearanceM:.03,hemFloorM:.6,
    // the hull's suit keeps under the protection receipt's continuous main-gun envelope (its glacis boughs lie low)
    conservativeGunEnvelope:true,
    // release 227 (round 2): Hetman II's stepped prow and chevron glacis: no card passes into a course or a band
    // (round 7: spent, the cloth and garnish over a sector's modules fall onto the stock under them: eraSpentDrape.ts)
    ...(id==='t72b3m_hetman_ii'?{cardsClearOfArmour:true,dropOverSpentEra:true}:{}),
    light:0x6d7e48,dark:0x31482d,netColor:'rgba(38,53,30,0.83)',
    hull:{
     // 2026-10-12 (cam-netting): the glacis netted to the bow plate, the driver's hatch and periscopes open (the
     // builder). The engine deck stays bare: the protection receipt's continuous main-gun envelope (full depression at
     // every yaw) comes down to within 3-7 cm of it from 1.5 m out and below it past 2.7 m, so no net or bough fits
     top:[
      laidNet({x0:-1.5,x1:1.5,z0:k.glacis[0],z1:k.glacis[1],nx:30,nz:Math.round((k.glacis[1]-k.glacis[0])/.1),
       yAt:(_x:number,z:number)=>k.glacisTop-Math.max(0,z-k.glacis[0])*k.fall,garnishRiseM:.1,seed:137,
       // release 227 (round 4): over Hetman II's chevron bands the net lies on the bands' tops (ghillieSuit.ts envelopeM),
       // and it ends behind the nose sill (DECKS: z 3.06): the sill's LED bars, its hood and the hinge line under it stay
       // clear of the net's edge and of the garnish that hung from it over them (the critic: "foliage strands cross the new
       // LED light-bar housings")
       // (round 6: the shingled glacis blocks leave two four-cell scraps of it tied to nothing: minPieceTris drops them)
       ...(id==='t72b3m_hetman_ii'?{envelopeM:.09,envelopeZ:[1.98,3.06] as const,minPieceTris:12}:{})}),
     ],
     // (release 227, round 2: Hetman II's bow drape is tied over the faces of its hinged lower-plate aprons, under its
     // nose sill: the T-72B3M lower plate rises from (z 2.60, y .533) to (3.342, .955), the aprons' faces stand .07 off it)
     face:[id==='t72b3m_hetman_ii'
      ?{z:3.2,zAt:(_x:number,y:number)=>2.60+(y+.07*.869-.533)/.5687+.07*.494,x0:-1.0,x1:1.0,y0:.64,y1:.92,nx:20,ny:5,seed:101,seatGapM:.012}
      :{z:bowZ,x0:-1.02,x1:1.02,y0:bowTop-.36,y1:bowTop,nx:20,ny:5,seed:101}],
     side:[-1,1].flatMap(side=>d.hullPanels.map(([z0,z1],i)=>({
      side,z0:z0+.055,z1:z1-.055,nz:15,ny:7,seed:37+side+i*17,
      // Tied under the header (tiedTop): the drape starts 4 mm under the header's centre line, 1.4 cm outside the
      // tube, within the lashings, instead of rolling over the header's top into the gun's sweep.
      topAt:(z:number)=>hullCageTop(id,z)-.004,bottomAt:(z:number)=>1.005+.020*Math.sin(z*5.4),
      outAt:(_z:number,t:number)=>d.hullX+.024+(1-t)*.018,tiedTop:true,
    })))},
    turret:{
      // 2026-10-12 (cam-netting): the whole turret roof netted round the hatches, sights, the roof gun and the drone
      // dock (the builder opens each), from the bustle screen to the brow
      top:[laidNet({x0:-d.turretX+.04,x1:d.turretX-.04,z0:d.rearZ+.02,z1:1.75,nx:38,nz:Math.round((1.73-d.rearZ)/.1),
        yAt:()=>k.roof,garnishRiseM:.16,seed:151,holes:k.marks.map(markOpening)})],
      side:[-1,1].map(side=>({side,z0:d.sideBack+.04,z1:d.sideFront-.055,nz:index===3?23:17,ny:7,seed:71+side,
        topAt:()=>d.top-.026,bottomAt:(z:number)=>d.bottom+.068+.017*Math.sin(z*5.2),
        outAt:(_z:number,t:number)=>d.turretX+.028+(1-t)*.015})),
      face:[{z:d.rearZ-.030,x0:-d.rearHalf+.10,x1:d.rearHalf-.10,y0:d.bottom+.065,y1:d.top-.030,nx:29,ny:7,
        seed:91,seatGapM:.027,seat:'ukrainian-bustle-screen'}],
    },
  };
}
export const NATIONAL_UKRAINE_GHILLIE:Readonly<Record<ProtectionId,GhillieConfig>>={
  t80u_zoria:camouflage('t80u_zoria',0),
  t72b3m_hetman:camouflage('t72b3m_hetman',1),
  t72b3_sich:camouflage('t72b3_sich',2),
  t72b3m_hetman_ii:camouflage('t72b3m_hetman_ii',3),
};

function permanentStock(P:TankBuilderPort,owner:Owner):THREE.BufferGeometry[]{
  const result:THREE.BufferGeometry[]=[];
  P.forEachBucketPart([owner,`${owner}ExternalArmor`],g=>{
    if(!Object.hasOwn(g.userData,'eraHitFaceVertexStarts'))result.push(g);
  });
  return result;
}

function seat(stock:readonly THREE.BufferGeometry[],origin:Point,direction:Point):{point:THREE.Vector3;normal:THREE.Vector3}{
  const from=new THREE.Vector3(...origin),dir=new THREE.Vector3(...direction);let nearest:ReturnType<typeof sampleArmorRay>=null;
  for(const g of stock){const hit=sampleArmorRay(g,from,dir);if(hit&&(!nearest||hit.point.distanceToSquared(from)<nearest.point.distanceToSquared(from)))nearest=hit;}
  if(!nearest)throw new Error(`Ukrainian protection has no permanent seat at ${origin}`);
  if(nearest.normal.dot(dir)>0)nearest.normal.negate();return nearest;
}

function rod(P:TankBuilderPort,owner:Owner,a:Point,b:Point,r=.014,openEnded=false):void{
  const geometry=beamBetween(a,b,r,8,openEnded);
  geometry.userData.ukrainianProtection={role:'open-cage-rod',owner};
  P.addEquipment(`${owner}OpenLattice`,geometry);
}

function netTie(P:TankBuilderPort,owner:Owner,center:Point,size:Point):void{
  const geometry=KIT.box(...size);
  geometry.userData.ukrainianProtection={role:'net-lashing',owner};
  P.addEquipment(`${owner}Cloth`,geometry,...center);
}

function foot(P:TankBuilderPort,owner:Owner,stock:readonly THREE.BufferGeometry[],origin:Point,dir:Point,end:Point):void{
  const hit=seat(stock,origin,dir),start=hit.point.clone().addScaledVector(hit.normal,-.016);
  // The short vertical saddle remains above the cassette lids and below the
  // depressed cannon. Its full 115 mm longitudinal foot carries the brace.
  const plate=KIT.box(owner==='hull'?.075:.115,.032,.115).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),hit.normal));
  plate.userData.ukrainianProtection={role:'support-pad',owner,contact:hit.point.toArray(),normal:hit.normal.toArray()};
  P.addEquipment(`${owner}Detail`,plate,...hit.point.clone().addScaledVector(hit.normal,.006).toArray());
  rod(P,owner,start.toArray(),end,.020);
}

/** Four removable cassette leaves per original skirt bay give dense seams
 * and independent visible lids without stacking ERA on top of old bricks. */
export function ukrainianSkirtEra(P:TankBuilderPort,side:number,z:number,step:number,outer:number):void{
  for(const dy of [-.123,.123])for(const dz of [-step*.225,step*.225])
    eraCassette(P,'hull',`skirt_era_${side<0?'L':'R'}`,[side*(outer+.028),1.09+dy,z+dz],[.075,.217,step*.405]);
}

/** The hull screens, skirt-return ERA and (unless a donor-turret kit fits its own) the turret screens. */
export function addNationalUkraineProtection(P:TankBuilderPort,id:ProtectionId,
  options:{turretScreens?:boolean;frontReturnEra?:boolean}={}):void{
  const d=NATIONAL_UKRAINE_PROTECTION[id],hull=permanentStock(P,'hull'),turret=permanentStock(P,'turret');
  const turretScreens=options.turretScreens!==false,frontReturnEra=options.frontReturnEra!==false;
  for(const side of [-1,1]){
    // Four independently framed side screens retain real service gaps. All
    // feet are above the ERA lids. 2026-10-09 (owner): every bay carries a net,
    // so every bay's header carries its lashings.
    for(const [z0,z1] of d.hullPanels){
      for(const z of [z0+.09,z1-.09]){
        const header=hullCageTop(id,z),supportY=Math.min(1.37,header+.028);
        foot(P,'hull',hull,[side*3,supportY,z],[-side,0,0],[side*d.hullX,header-.030,z]);
        rod(P,'hull',[side*d.hullX,.965,z],[side*d.hullX,header,z],.017);
      }
      rod(P,'hull',[side*d.hullX,.965,z0],[side*d.hullX,.965,z1],.017);
      // Split exactly at the header's slope changes so the stock follows
      // the shaped rail instead of bridging above its clearance course.
      const cuts=[z0,...[-2.40,-2.30,-2.10,-1.85,-1.55,-1.35,1.35,1.55,1.85,2.10,2.30,2.40].filter(z=>z>z0&&z<z1),z1];
      for(let i=1;i<cuts.length;i++)rod(P,'hull',
        [side*d.hullX,hullCageTop(id,cuts[i-1]),cuts[i-1]],[side*d.hullX,hullCageTop(id,cuts[i]),cuts[i]],.017);
      const count=Math.ceil((z1-z0)/.105);
      for(let i=0;i<=count;i++){const z=z0+(z1-z0)*i/count;rod(P,'hull',[side*d.hullX,.977,z],[side*d.hullX,hullCageTop(id,z)-.012,z],.008,d.openSlatEnds);}
      rod(P,'hull',[side*d.hullX,1.20,z0],[side*d.hullX,1.20,z1],.010);
      for(const t of [.18,.50,.82]){
        const z=z0+(z1-z0)*t;
        netTie(P,'hull',[side*(d.hullX+.010),hullCageTop(id,z)-.031,z],[.046,.098,.022]);
      }
    }
    // Aft flank sections join the bustle screen below all roof stations.
    // Cast shoulders, hatch circles and the gun aperture stay uncovered.
    const supportZ=id==='t72b3m_hetman_ii'?[-2.04,-.85]:id==='t72b3m_hetman'?[-1.52,-.73]:[-1.22,-.70];
    if(turretScreens){
    for(const z of supportZ){
      foot(P,'turret',turret,[side*3,d.bottom+.08,z],[-side,0,0],[side*d.turretX,d.bottom+.08,z]);
      rod(P,'turret',[side*d.turretX,d.bottom,z],[side*d.turretX,d.top,z],.017);
    }
    for(const y of [d.bottom,d.top]){
      rod(P,'turret',[side*d.turretX,y,d.sideFront],[side*d.turretX,y,d.sideBack],.018);
      rod(P,'turret',[side*d.turretX,y,d.sideBack],[side*d.rearHalf,y,d.rearZ],.018);
    }
    const count=Math.ceil((d.sideFront-d.sideBack)/.095);
    for(let i=0;i<=count;i++){const z=d.sideBack+(d.sideFront-d.sideBack)*i/count;rod(P,'turret',[side*d.turretX,d.bottom+.012,z],[side*d.turretX,d.top-.012,z],.008);}
    for(const t of [.15,.38,.62,.85])netTie(P,'turret',
      [side*(d.turretX+.012),d.top-.038,d.sideBack+(d.sideFront-d.sideBack)*t],[.052,.120,.022]);
    const returnCount=6;
    for(let i=1;i<returnCount;i++){
      const t=i/returnCount,x=side*(d.turretX+(d.rearHalf-d.turretX)*t),z=d.sideBack+(d.rearZ-d.sideBack)*t;
      rod(P,'turret',[x,d.bottom+.012,z],[x,d.top-.012,z],.008);
    }
    }
    // Forward/rear skirt returns receive their own short ERA banks, seated
    // by ray onto finite armor stock rather than floating past the fenders.
    for(const z of [-2.96,-2.65,2.65,2.96]){
      // (release 227) a hull with its own bow modules on the front banks keeps only the rear returns
      if(!frontReturnEra&&z>0)continue;
      const hit=seat(hull,[side*3,1.16,z],[-side,0,0]);
      const rotation=new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(side,0,0),hit.normal));
      eraCassette(P,'hull',`skirt_era_${side<0?'L':'R'}`,hit.point.clone().addScaledVector(hit.normal,.030).toArray(),[.076,.22,.21],[rotation.x,rotation.y,rotation.z]);
    }
  }
  if(!turretScreens)return;
  for(const y of [d.bottom,d.top])rod(P,'turret',[-d.rearHalf,y,d.rearZ],[d.rearHalf,y,d.rearZ],.018);
  for(const x of [-d.rearHalf,d.rearHalf])rod(P,'turret',[x,d.bottom,d.rearZ],[x,d.top,d.rearZ],.018);
  for(let i=1;i<29;i++){const x=-d.rearHalf+2*d.rearHalf*i/29;rod(P,'turret',[x,d.bottom+.012,d.rearZ],[x,d.top-.012,d.rearZ],.008);}
  for(let i=1;i<10;i++)netTie(P,'turret',
    [-d.rearHalf+2*d.rearHalf*i/10,d.top-.038,d.rearZ-.014],[.022,.120,.074]);
  // Low diagonal ties transfer bustle loads into the actual aft shell.
  for(const x of [-.66,.66])foot(P,'turret',turret,[x,d.bottom+.085,-4],[0,0,1],[x,d.bottom+.085,d.rearZ]);
}
