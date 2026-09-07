// The source weapon2 is a stepped receiver, thin stock and separate lower gas
// tube. These original analytic solids use measured dimensions, not topology.
import * as THREE from 'three';
import {KIT} from './kit.ts';
import {sectionSolid} from './sectionSolid.ts';
import {sourceMachineGun} from './sourceMachineGun.ts';
type MachineGun=ReturnType<typeof sourceMachineGun>;
const X=-.6155;
function receiver(mg:MachineGun):void{
  const body=sectionSolid([-1.33385,-.83305].map(z=>{
    const low=2.52085-(z+1.08345)*.0005989;
    return{z,ring:[[X-.03705,low],[X+.03705,low],[X+.03705,low+.110],[X-.03705,low+.110]]};
  }));mg.add('turretDark',body,0,0,0);
  mg.add('turretDark',KIT.box(.0956,.0648,.3218),-.6151,2.5984,-.99410);
  mg.add('turretDark',KIT.box(.0956,.023,.1505),-.6151,2.59855,-1.22995);
  mg.add('turretDark',KIT.box(.0741,.0417,.0592),X,2.54185,-1.34985);
  // Clipped rear end of the raised cover, followed by its narrow fore rail.
  mg.add('turretDark',sectionSolid([
    {z:-1.18965,ring:[[X-.03185,2.629],[X+.03185,2.629],[X+.03185,2.6291],[X-.03185,2.6291]]},
    {z:-1.17615,ring:[[X-.03646,2.629],[X+.03646,2.629],[X+.03646,2.6521],[X-.03646,2.6521]]},
    {z:-1.11355,ring:[[X-.0536,2.6289],[X+.0536,2.6289],[X+.0536,2.6521],[X-.0536,2.6521]]},
    {z:-.96875,ring:[[X-.0536,2.6288],[X+.0536,2.6288],[X+.0536,2.652],[X-.0536,2.652]]},
  ]),0,0,0);
  mg.add('turretDark',KIT.box(.0305,.0255,.1354),-.61555,2.63925,-.90635);
}
function barrel(mg:MachineGun):void{
  // The source six-facet stock has15.2/13.95mm projected half extents. A
  // physical circular stock preserves their area; its cylindrical12.7mm
  // bore keeps the source conical cavity's deepest axial station.
  const stockR=Math.sqrt(.0152*.01395),muzzleR=Math.sqrt(.0285*.0261);
  const section:readonly(readonly[number,number])[]=[[0,-1.48935],[stockR,-1.48935],
    [stockR,-2.11595],[muzzleR,-2.20065],[muzzleR,-2.20265],[.00635,-2.20265],
    [.00635,-1.96685],[0,-1.96685]];
  const g=new THREE.LatheGeometry([...section].reverse().map(([r,z])=>new THREE.Vector2(r,z)),32).rotateX(Math.PI/2);
  mg.add('turretDark',g,X,2.5855,0);
  const collar=sectionSolid([-1.50335,-1.32145].map(z=>({z,ring:
    Array.from({length:4},(_,i)=>{const a=Math.PI/2+i*Math.PI/2;return[X+.0266*Math.cos(a),2.58825+.02435*Math.sin(a)] as const;})})));
  mg.add('turretDark',collar,0,0,0);
}
function gasTube(mg:MachineGun):void{
  mg.add('turretDark',sectionSolid([-1.82755,-1.31815].map(z=>({z,ring:
    Array.from({length:4},(_,i)=>{const a=Math.PI/2+i*Math.PI/2;
      return[X+.01505*Math.cos(a),2.5405-(z+1.82755)*.00060+.0139*Math.sin(a)] as const;})}))),0,0,0);
  // Original thin side links join the two separate tubes; the intervening
  // long axial air slot remains empty, not a rectangular filled forearm.
  for(const x of [-.6258,-.6053])mg.add('turretDark',KIT.box(.001,.0418,.0407),x,2.5617,-1.68990);
  for(const side of [-1,1]){
    const x0=X+side*.0008,x1=X+side*.0067;
    mg.add('turretDark',sectionSolid([-1.97815,-1.95715].map(z=>({z,ring:
      [[x0-.0005,2.5956],[x0+.0005,2.5956],[x1+.0005,2.6374],[x1-.0005,2.6374]]}))),0,0,0);
  }
}
export function addT72B3MachineGunBody(mg:MachineGun):void{receiver(mg);barrel(mg);gasTube(mg);}
