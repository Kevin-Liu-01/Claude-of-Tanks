// Source-measured physical T-90 AW rear furniture. These are independent
// section solids, not imported topology. Four empty cradles retain their air.
import {sectionSolid} from './sectionSolid.ts';
import {roofSheet} from './measuredPrimitives.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';

type HeightStation=readonly[z:number,y:number];
// Scalar sections of the 50.8 mm bearing flange. The upper and lower skins
// follow the measured drum-seat bend; no drum is present in this source.
const FLANGE:readonly HeightStation[]=[[-3.79105,1.28130],[-3.72075,1.23830],[-3.66995,1.21970],
  [-3.60355,1.21190],[-3.53515,1.21480],[-3.47855,1.22750],[-3.43555,1.24800],[-3.37505,1.29300],[-3.31445,1.34570]];
const WEB_LOWER:readonly HeightStation[]=[[-3.80275,1.23050],[-3.79885,1.21480],[-3.73635,1.16990],
  [-3.68165,1.14940],[-3.60745,1.13670],[-3.52535,1.13960],[-3.45705,1.15530],[-3.38285,1.18360],
  [-3.32225,1.21680],[-3.31055,1.21090],[-3.24215,1.26170]];
function heightAt(rows:readonly HeightStation[],z:number):number{
  if(z<=rows[0][0])return rows[0][1];
  for(let i=1;i<rows.length;i++)if(z<=rows[i][0]){
    const[a,y]=rows[i-1],[b,next]=rows[i];return y+(next-y)*(z-a)/(b-a);
  }
  return rows[rows.length-1][1];
}
function cradleWeb(P:TankBuilderPort,x:number,dy:number,dz:number):void{
  const rows=[...new Set([...WEB_LOWER.map(r=>r[0]),...FLANGE.map(r=>r[0])])].sort((a,b)=>a-b);
  // A narrow closed web seats into the bearing flange; its hidden upper
  // closure overlaps the flange by 2 mm rather than filling the open U.
  const top=(z:number)=>z<FLANGE[0][0]?1.2305+(z+3.80275)*3.20:
    z>FLANGE.at(-1)![0]?1.343:heightAt(FLANGE,z)-.006;
  const stations=rows.map(z=>({z:z+dz,ring:[[x-.0049,heightAt(WEB_LOWER,z)+dy],
    [x+.0049,heightAt(WEB_LOWER,z)+dy],[x+.0049,Math.max(top(z),heightAt(WEB_LOWER,z)+.0004)+dy],
    [x-.0049,Math.max(top(z),heightAt(WEB_LOWER,z)+.0004)+dy]] as const}));
  P.addEquipment('hullDetail',sectionSolid(stations));
}
function cradleMount(P:TankBuilderPort,x:number,dy:number,dz:number):void{
  // Actual front root and transverse hinge land on the existing rear tub.
  const roots:readonly(readonly[number,number,number])[]=[[-3.295,1.198,1.190],[-3.252,1.237,1.1582],
    [-3.23245,1.2422,1.153],[-3.18355,1.2275,1.139],[-3.15235,1.2334,1.139],[-3.10935,1.150,1.1494]];
  P.addEquipment('hullDetail',sectionSolid(roots.map(([z,t,b])=>({z:z+dz,ring:[[x-.0121,b+dy],
    [x+.0121,b+dy],[x+.0121,t+dy],[x-.0121,t+dy]]}))));
  P.addEquipment('hullDetail',roofSheet([[-3.31835+dz,x-.05935,x+.05935,1.2129+dy,1.2129+dy],
    [-3.24415+dz,x-.05935,x+.05935,1.2666+dy,1.2666+dy]],.030));
}
export function addT90AWRearCradles(P:TankBuilderPort):void{
  for(const x of [-.79865,-.37350,.36355,.80275]){
    const leftOuter=x<-.7,dy=leftOuter?.0029:0,dz=leftOuter?.0078:0;
    cradleWeb(P,x,dy,dz);
    P.addEquipment('hullDetail',roofSheet(FLANGE.map(([z,y])=>[z+dz,x-.0244,x+.0264,y+dy,y+dy] as const),.0098));
    cradleMount(P,x,dy,dz);
  }
}
