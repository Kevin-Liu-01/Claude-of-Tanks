import * as THREE from 'three';
import { KIT } from './kit.ts';
import { beamBetween } from './measuredPrimitives.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
type Port=Pick<TankBuilderPort,'turretG'|'forEachBucketPart'|'addEquipment'> & {spec:{readonly id:string}};
type Point=readonly[number,number,number];

/** Three independently supported side panels and folded shoulder returns.
 * The central roof, hatch openings and main-gun corridor stay open. */
export function addModernFieldCage(P:Port):void {
 const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),stock:THREE.Mesh[]=[],outerStock:THREE.Mesh[]=[],bounds=new THREE.Box3();
 P.forEachBucketPart(['turret'],geometry=>{
  const mesh=new THREE.Mesh(geometry,material);mesh.updateMatrixWorld();stock.push(mesh);bounds.expandByObject(mesh);
 });
 P.forEachBucketPart(['turret','turretExternalArmor'],geometry=>{
  const mesh=new THREE.Mesh(geometry,material);mesh.updateMatrixWorld();outerStock.push(mesh);
 });
 const z0=bounds.min.z+.22,z1=Math.min(.12,bounds.max.z-.35),height=bounds.max.y-bounds.min.y;
 const mid=bounds.min.y+height*.48,low=mid-.22,top=mid+.28;
 const anchors:Point[]=[],bar=(a:Point,b:Point,r=.012)=>{
  const geometry=beamBetween(a,b,r,8);geometry.userData.modernFieldCage=true;
  P.addEquipment('turretOpenLattice',geometry);
 };
 const panelStock=(side:number,panel:number):void=>{
   const a=z0+(z1-z0)*panel/3+.035,b=z0+(z1-z0)*(panel+1)/3-.035;
   const feet:THREE.Vector3[]=[];
   for(const z of [a+.06,b-.06]) {
    const hit=new THREE.Raycaster(new THREE.Vector3(side*4,mid,z),new THREE.Vector3(-side,0,0)).intersectObjects(stock)[0];
    if(!hit)throw Error(`${P.spec.id}: modern cage needs a structural side receiver at ${z}`);
    feet.push(hit.point);anchors.push(hit.point.toArray());
   }
   let outer=Math.max(...feet.map(p=>Math.abs(p.x)));
   // The supporting wall can sit behind applique/APS stock. Stand the whole
   // panel off that outer course while anchoring its brackets to the wall.
   for(const y of [low+.01,mid,top-.01])for(let i=0;i<=6;i++){
    const z=a+(b-a)*i/6;
    const hit=new THREE.Raycaster(new THREE.Vector3(side*4,y,z),new THREE.Vector3(-side,0,0)).intersectObjects(outerStock)[0];
    if(hit)outer=Math.max(outer,Math.abs(hit.point.x));
   }
   const x=side*(outer+.19);
   for(const foot of feet) {
    P.addEquipment('turretDetail',KIT.box(.05,.13,.14),foot.x,foot.y,foot.z);
    bar([foot.x-side*.012,mid,foot.z],[x,mid,foot.z],.025);
    bar([x,low,foot.z],[x,top,foot.z],.021);
    // Folded upper return ties the screen back to its receiving wall.
    bar([x,top,foot.z],[foot.x,mid+.05,foot.z],.012);
   }
   for(const y of [low,top])bar([x,y,a],[x,y,b],.019);
   const count=Math.ceil((b-a)/.11);
   for(let i=0;i<=count;i++){const z=a+(b-a)*i/count;bar([x,low,z],[x,top,z],.007);}
   for(const y of [low+.16,top-.15])bar([x,y,a],[x,y,b],.007);
   // Strapped field packs are supported on each rear panel's cross rail.
   if(panel===0){
    const z=(a+b)/2;
    P.addEquipment('turretCloth',KIT.box(.13,.22,(b-a)*.66),x+side*.045,mid,z);
    for(const dz of [-.13,.13])P.addEquipment('turretDark',KIT.box(.148,.235,.023),x+side*.045,mid,z+dz);
   }
 };
 try {
  for(const side of [-1,1])for(let panel=0;panel<3;panel++)panelStock(side,panel);
 }finally{material.dispose();}
 P.turretG.userData.modernFieldCage={panels:6,anchors,openRoof:true};
}
