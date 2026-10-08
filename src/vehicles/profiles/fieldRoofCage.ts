import * as THREE from 'three';
import { KIT } from './kit.ts';
import { beamBetween } from './measuredPrimitives.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
type Port=Pick<TankBuilderPort,'spec'|'turretG'|'forEachBucketPart'|'addEquipment'>;
type Point=readonly[number,number,number];

/** Two hinged roof wings leave the central hatch, sight and weapon corridor
 * open. Four measured pads per wing carry the finite lattice. */
export function addFieldRoofCage(P:Port,wide=false):void{
 const mat=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),stock:THREE.Mesh[]=[];
 P.forEachBucketPart(['turret','turretExternalArmor'],g=>{
  if(g.userData.eraHitFaceVertexStarts)return;
  const m=new THREE.Mesh(g,mat);m.updateMatrixWorld();stock.push(m);
 });
 const receipt:{feet:Point[];corners:Point[]}[]=[];
 const bar=(a:Point,b:Point,r=.013)=>{
  const g=beamBetween(a,b,r,8);g.userData.fieldRoofCage=true;
  P.addEquipment('turretOpenLattice',g);
 };
 try{for(const side of[-1,1]){
  receipt.push(roofWing(P,stock,side,wide,bar));
 }}finally{mat.dispose();}
 P.turretG.userData.fieldRoofCage=receipt;
}

function roofWing(P:Port,stock:THREE.Mesh[],side:number,wide:boolean,bar:(a:Point,b:Point,r?:number)=>void):{feet:Point[];corners:Point[]}{
 const inner=wide?1.04:side>0?1.20:.98,outer=wide?1.75:1.62,z0=wide?-1.02:-1.23,z1=.34;
  const feet=cageFeet(P,stock,side,[inner+.03,outer-(wide?.45:.24)],[z0+.20,z1-.16]);
  const y=Math.max(wide?1.20:1.04,...feet.map(p=>p[1]+.22));
  for(const [x,base,z]of feet){
   P.addEquipment('turretDetail',KIT.box(.11,.026,.13),x,base+.004,z);
   bar([x,base+.01,z],[x,y,z],.021);
  }
  const corners:Point[]=[[side*inner,y,z0],[side*outer,y,z0],[side*outer,y,z1],[side*inner,y,z1]];
  for(let i=0;i<4;i++)bar(corners[i],corners[(i+1)%4],.019);
  const rows=Math.ceil((z1-z0)/.145);
  for(let i=1;i<rows;i++){const z=z0+(z1-z0)*i/rows;bar([side*inner,y,z],[side*outer,y,z],.008);}
  for(let i=1;i<4;i++){const x=side*(inner+(outer-inner)*i/4);bar([x,y,z0],[x,y,z1],.008);}
  // Corner braces and hinges make the lattice read as fitted metalwork.
  for(const z of[z0+.20,z1-.16])bar([side*(outer-(wide?.45:.24)),y-.12,z],[side*outer,y,z],.012);
  for(const z of[z0+.22,z1-.22])P.addEquipment('turretDark',KIT.cylZ(.026,.09,12),side*inner,y,z);
 return {feet,corners};
}

function cageFeet(P:Port,stock:THREE.Mesh[],side:number,xs:number[],zs:number[]):Point[]{
 const feet:Point[]=[];
  for(const x of xs)for(const z of zs){
   const hit=new THREE.Raycaster(new THREE.Vector3(side*x,3,z),new THREE.Vector3(0,-1,0)).intersectObjects(stock)[0];
   if(!hit)throw new Error(`${P.spec.id}: roof cage has no armor pad ${side*x},${z}`);
   feet.push(hit.point.toArray());
  }
 return feet;
}
