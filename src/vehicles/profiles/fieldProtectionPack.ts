import * as THREE from 'three';
import { KIT } from './kit.ts';
import { beamBetween } from './measuredPrimitives.ts';
import { addVehicleGhillieSuit,type GhillieConfig } from '../ghillieSuit.ts';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';
import { addFieldRoofCage } from './fieldRoofCage.ts';
import { addFieldRoofWeapon } from './fieldRoofWeapon.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
type Owner='hull'|'turret';
type Point=readonly[number,number,number];

function sideScreens(P:TankBuilderPort,owner:Owner,x:number,zs:readonly number[],low:number,high:number):void{
 const mat=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),stock:THREE.Mesh[]=[];
 P.forEachBucketPart([owner,`${owner}ExternalArmor`],g=>{if(g.userData.eraHitFaceVertexStarts)return;const m=new THREE.Mesh(g,mat);m.updateMatrixWorld();stock.push(m);});
 const bar=(a:Point,b:Point,r=.014)=>P.addEquipment(`${owner}OpenLattice`,beamBetween(a,b,r,8));
 try{for(const side of[-1,1])for(let j=1;j<zs.length;j++){
  const a=zs[j-1]+.045,b=zs[j]-.045;
  for(const z of[a+.09,b-.09]){
   const y=(low+high)/2;
   const hit=new THREE.Raycaster(new THREE.Vector3(side*4,y,z),new THREE.Vector3(-side,0,0)).intersectObjects(stock)[0];
   if(!hit)throw new Error(`${P.spec.id}: ${owner} screen missing support at ${z}`);
   P.addEquipment(`${owner}Detail`,KIT.box(.04,.12,.13),hit.point.x,hit.point.y,z);
   bar([hit.point.x-side*.02,y,z],[side*x,y,z],.026);
   bar([side*x,low,z],[side*x,high,z],.021);
  }
  for(const y of[low,high])bar([side*x,y,a],[side*x,y,b],.020);
  const n=Math.ceil((b-a)/.115);
  for(let i=0;i<=n;i++){const z=a+(b-a)*i/n;bar([side*x,low,z],[side*x,high,z],.008);}
 }}finally{mat.dispose();}
}
function lampsAndTools(P:TankBuilderPort):void{
 for(const side of[-1,1]){
  // Raised cheek fittings attach to the broad outer shoulder, clear of bore.
  const x=side*1.15,y=.845,z=.17;
  P.addEquipment('turretDetail',KIT.box(.22,.14,.27),x,y+.025,z);
  P.addEquipment('turretDark',KIT.cylZ(.087,.09,20),x,y+.11,z+.08);
  P.addEquipment('turretGlass',markVehicleNightLens(KIT.cylZ(.069,.012,20),'headlight'),x,y+.11,z+.131);
  P.addEquipment('turretDetail',KIT.box(.255,.025,.32),x,y+.21,z);
  P.addEquipment('turretCloth',KIT.box(.43,.20,.39),side*.71,.91,-1.20);
  for(const dx of[-.12,.12])P.addEquipment('turretDark',KIT.box(.025,.218,.404),side*.71+dx,.91,-1.20);
 }
}
export function upgradeOplotFieldEquipment(P:TankBuilderPort):void{
 sideScreens(P,'hull',2.26,[-2.9,-1.55,-.2,1.15,2.65],1.16,1.58);
 sideScreens(P,'turret',1.82,[-1.46,-.67,.1],.28,.77);
 addFieldRoofCage(P,true);lampsAndTools(P);
 addFieldRoofWeapon(P,[-.45,.795,.02],12.7,'Oplot-M protected heavy machine gun',.32,.90);
 P.turretG.userData.oplotFieldUpgrade={hullScale:1.10,roofCages:true,roofGunCaliber:12.7};
}
export function addLeclercFieldProtection(P:TankBuilderPort):void{
 sideScreens(P,'hull',1.93,[-2.85,-1.52,-.19,1.14,2.43],1.05,1.52);
 sideScreens(P,'turret',1.84,[-2.13,-1.40,-.67,.06,.66],.26,.65);
 const cfg:GhillieConfig={id:P.spec.id,seed:105071,style:'leafy',density:.93,leafScale:.72,
  light:0x737d52,dark:0x344630,netColor:'rgba(39,53,31,0.82)',
  hull:{side:[-1,1].flatMap(side=>[[-2.58,-1.45],[.0,1.10],[1.24,2.36]].map(([z0,z1],i)=>({
   side,z0,z1,nz:17,ny:8,seed:i+31,topAt:()=>1.48,bottomAt:()=>1.10,outAt:()=>1.968})))},
  turret:{side:[-1,1].map(side=>({side,z0:-2.06,z1:-.24,nz:21,ny:8,seed:60+side,
   topAt:()=>.61,bottomAt:()=>.31,outAt:()=>1.878}))}};
 addVehicleGhillieSuit(P,cfg);
 P.turretG.userData.leclercFieldProtection={cages:true,leafyNetting:true};
}
