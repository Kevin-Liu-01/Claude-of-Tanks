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
 // 2026-10-08 (the accessories lane, on the tree merged with main; the defect came from main's 6763d7cc0): a foot and
 // its standoff keep clear of the turret's smoke-discharger banks. On the Leopard 2A6 UA the rearmost panels' rear feet
 // stood in the 2A6M's banks (78 crossings); a field kit's bracket is bolted round a bank, so a foot whose standoff would
 // enter one slides toward its panel's middle, 2 cm at a time, until it clears.
 P.turretG.updateMatrixWorld(true);
 const toTurret=new THREE.Matrix4().copy(P.turretG.matrixWorld).invert(),banks:THREE.Box3[]=[];
 P.turretG.traverse(o=>{
  if(o.userData?.fittingRoot&&o.userData.fitting==='smokeBank')banks.push(new THREE.Box3().setFromObject(o).applyMatrix4(toTurret).expandByScalar(.02));
 });
 const anchors:Point[]=[],bar=(a:Point,b:Point,r=.012)=>{
  const geometry=beamBetween(a,b,r,8);geometry.userData.modernFieldCage=true;
  P.addEquipment('turretOpenLattice',geometry);
 };
 const panelStock=(side:number,panel:number):void=>{
   const a=z0+(z1-z0)*panel/3+.035,b=z0+(z1-z0)*(panel+1)/3-.035;
   const feet:THREE.Vector3[]=[];
   const cast=(z:number)=>new THREE.Raycaster(new THREE.Vector3(side*4,mid,z),new THREE.Vector3(-side,0,0)).intersectObjects(stock)[0];
   // the standoff's room: from the wall 0.30 m out, the bracket's depth, and from under the standoff up past the return
   const standoff=(p:THREE.Vector3)=>new THREE.Box3(new THREE.Vector3(Math.min(p.x,p.x+side*.30),mid-.08,p.z-.07),
    new THREE.Vector3(Math.max(p.x,p.x+side*.30),mid+.12,p.z+.07));
   for(const z0 of [a+.06,b-.06]) {
    let z=z0,hit=cast(z);
    const inward=z0<(a+b)/2?1:-1;
    for(let k=0;k<15&&hit&&banks.some(bank=>bank.intersectsBox(standoff(hit!.point)));k++){z+=inward*.02;hit=cast(z);}
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
