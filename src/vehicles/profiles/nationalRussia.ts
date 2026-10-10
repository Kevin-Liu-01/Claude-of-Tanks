// Russian modernization concepts: retained Soviet hulls and compact cast
// turret cores, with the heaviest national protection and sensor packages.
import * as THREE from 'three';
import {KIT} from './kit.ts';
import {sectionSolid,type SectionPoint} from './sectionSolid.ts';
import {beamBetween,blindTube} from './measuredPrimitives.ts';
import {eraCassette,glacisEraCassette,attachedCage,supportedSensor,strappedPack} from './modernizationFittings.ts';
import {castModernizedTurret} from './nationalDonorCore.ts';
import {markSmokeTube} from '../vehicleAuxiliaryGeometry.ts';
import {markVehicleNightLens} from '../vehicleNightLighting.ts';
import {NATIONAL_RUSSIA_DESIGNS} from '../nationalRussiaDesign.ts';
import {addRussianChevronEra,type RussianArmorRow} from './nationalRussiaChevrons.ts';
import type {NationalModernizationConfig} from '../nationalModernizationConfig.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
const {box,cylY,cylZ}=KIT;

function seat(P:TankBuilderPort,owner:'hull'|'turret',x:number,z:number):number {
 const ray=new THREE.Raycaster(new THREE.Vector3(x,5,z),new THREE.Vector3(0,-1,0));
 const mat=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});let y=-Infinity;
 P.forEachBucketPart(owner==='turret'?['turret','turretExternalArmor']:[owner],g=>{const m=new THREE.Mesh(g,mat);m.updateMatrixWorld(true);const h=ray.intersectObject(m)[0];if(h)y=Math.max(y,h.point.y)});
 mat.dispose();if(!Number.isFinite(y))throw Error(P.spec.id+': unsupported fitting');return y;
}
type ArmorRow=readonly[z:number,inner:number,outer:number,bottom:number,top:number];
function armorHousing(P:TankBuilderPort,owner:'hull'|'turret',side:number,rows:readonly ArmorRow[]):void {
 P.addExternalArmor(owner,sectionSolid(rows.map(([z,a,b,lo,hi])=>{
  const bevel=Math.min(.08,(b-a)*.22,(hi-lo)*.22);
  const points:SectionPoint[]=[[a,lo],[b-bevel,lo],[b,lo+bevel],[b,hi-bevel],[b-bevel,hi],[a,hi]];
  return {z,ring:side>0?points:points.map(([x,y])=>[-x,y] as const).reverse()};
 })));
}
function turretProtection(P:TankBuilderPort,c:NationalModernizationConfig):readonly RussianArmorRow[] {
 const m=c.model;
 const rows:readonly ArmorRow[]=m===0?[
  [-2.03,0,.86,.34,.59],[-1.77,.49,1.45,.23,.67],[-1.02,1.01,1.61,.18,.71],
  [.03,1.13,1.64,.17,.70],[.89,.78,1.64,.16,.64],[1.63,.39,.99,.20,.54],
 ]:m===1?[
  [-2.22,0,1.10,.36,.73],[-1.93,.65,1.56,.27,.80],[-1.04,1.01,1.72,.18,.80],
  [.14,1.14,1.74,.17,.77],[.88,.75,1.69,.17,.70],[1.78,.39,1.03,.22,.57],
 ]:[
  [-1.87,0,.74,.36,.55],[-1.55,.49,1.35,.24,.63],[-.79,1.05,1.54,.18,.67],
  [.19,1.08,1.61,.17,.65],[.87,.75,1.52,.17,.59],[1.60,.39,.89,.21,.49],
 ];
 for(const side of [-1,1])armorHousing(P,'turret',side,rows);
 // Visible bolted perimeter seams make the surrounding armor read as a
 // fitted housing rather than an enlarged replacement casting.
 for(const side of [-1,1])for(const z of [-1.55,-.73,.15]){
  const end=rows.findIndex((r,i)=>i>0&&r[0]>=z),a=rows[end-1],b=rows[end];
  const f=(z-a[0])/(b[0]-a[0]),outer=a[2]+f*(b[2]-a[2]);
  const yaw=Math.atan(side*(b[2]-a[2])/(b[0]-a[0]));
  P.addEquipment('turretDetail',box(.025,.34,.050),side*(outer+.006),.44,z,0,yaw);
 }
 return rows;
}
function housingEra(P:TankBuilderPort,housing:readonly THREE.BufferGeometry[],sector:string,seed:readonly[number,number,number],size:readonly[number,number,number]):void {
 const dir=new THREE.Vector3(seed[0],0,seed[2]).normalize(),origin=dir.clone().multiplyScalar(4);origin.y=seed[1];
 const ray=new THREE.Raycaster(origin,dir.negate()),mat=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});let near:THREE.Intersection|undefined;
 for(const g of housing){const o=new THREE.Mesh(g,mat);o.updateMatrixWorld(true);const h=ray.intersectObject(o)[0];if(h&&(!near||h.distance<near.distance))near=h;}mat.dispose();
 if(!near?.face)throw Error(P.spec.id+': no protection housing seat');
 const n=near.face.normal.clone();if(n.dot(dir)>0)n.negate();
 const e=new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),n));
 eraCassette(P,'turret',sector,near.point.clone().addScaledVector(n,size[1]/2-.007).toArray(),size,[e.x,e.y,e.z]);
}
function hullKit(P:TankBuilderPort,c:NationalModernizationConfig):void {
 const m=c.model,outer=[2.00,2.07,1.99][m],count=[6,7,6][m];
 for(const s of [-1,1]){
  // A continuous folded shoulder closes the daylight between the original
  // fender and the outboard skirt. The outer lip enters its armor carrier;
  // the inboard edge overlaps native stock without moving the donor fender.
  const nose=[3.48,3.81,3.56][m],tail=[-3.31,-3.31,-3.22][m];
  const receiving:readonly(readonly[number,number,number])[]=[
   [tail,outer-.12,1.29],[tail+.24,outer+.13,1.38],[-2.38,outer+.13,1.39],
   [2.51,outer+.13,1.39],[nose-.24,outer+.10,1.30],[nose,outer-.12,1.15],
  ];
  const at=(z:number,index:1|2):number=>{
   for(let i=1;i<receiving.length;i++)if(z<=receiving[i][0]){
    const a=receiving[i-1],b=receiving[i],f=Math.max(0,Math.min(1,(z-a[0])/(b[0]-a[0])));
    return a[index]+f*(b[index]-a[index]);
   }
   return receiving[receiving.length-1][index];
  };
  const folds=m===0?[-3.31,-3.10,-2.86,-2.40,-1.20,.60,2.40,2.90,3.07,3.20,3.35]
   :m===1?[-3.31,-3.15,-2.80,1.65,2.70,3.06,3.23,3.43,3.59,3.73,3.81]
   :[-3.22,-3.18,-2.96,-2.76,-1.89,.395,1.70,2.50,3.08,3.22,3.34,3.43,3.508];
  const stations=[...new Set([...folds,-2.38,2.51,tail+.24,nose-.24])].sort((a,b)=>a-b);
  P.addEquipment('hullDetail',sectionSolid(stations.map(z=>{
   const deck=seat(P,'hull',s*1.60,z),edge=at(z,1)-.065,armorY=at(z,2);
   const ring:SectionPoint[]=[[1.59,deck-.009],[edge,armorY-.025],
    [edge,Math.max(deck+.025,armorY+.022)],[1.59,deck+.025]];
   return{z,ring:s>0?ring:ring.map(([x,y])=>[-x,y] as const).reverse()};
  })));
  for(let i=0;i<count;i++){
   const step=4.92/count,z=-2.40+(i+.5)*step,y=seat(P,'hull',s*1.64,z);
   armorHousing(P,'hull',s,[[z-step*.49,1.86,outer+.13,.64,1.39],[z+step*.49,1.86,outer+.13,.69,1.39]]);
   P.addEquipment('hullDetail',beamBetween([s*1.62,y+.022,z],[s*outer,y+.022,z],.028));
   P.addEquipment('hullDetail',box(.036,y-1.28,.16),s*outer,(y+1.28)/2,z);
   eraCassette(P,'hull',`skirt_era_${s<0?'L':'R'}`,[s*(outer+.15),1.02,z],[.15,.55,4.92/count-.07]);
   P.addEquipment('hullDetail',cylZ(.027,.18,12),s*(outer+.205),1.37,z);
   if(m===1)strappedPack(P,'hull',[s*(outer+.12),.55,z],[.19,.23,4.92/count-.06]);
  }
  // Thick molded end housings turn inward only beyond the end-wheel course.
  armorHousing(P,'hull',s,[[tail,1.69,outer-.12,.79,1.29],[tail+.24,1.86,outer+.13,.70,1.38],[-2.38,1.86,outer+.13,.64,1.39]]);
  armorHousing(P,'hull',s,[[2.51,1.86,outer+.13,.69,1.39],[nose-.24,1.86,outer+.10,.73,1.30],[nose,1.69,outer-.12,.81,1.15]]);
  // Two chevron-like rows of thick cassettes leave the driver's sight clear.
  for(const z of [2.04,2.41,2.78])for(const x of [s*.28,s*.72])
   glacisEraCassette(P,`glacis_era_${s<0?'L':'R'}`,x,z,[.38,.105,.29]);
  const lx=s*.88,lz=m===1?2.95:2.77,ly=seat(P,'hull',lx,lz);
  P.addEquipment('hullDetail',box(.22,.095,.20),lx,ly+.037,lz);
  P.addEquipment('hullDetail',markVehicleNightLens(cylZ(.072,.058,20),'headlight'),lx,ly+.15,lz+.027);
  for(const dx of [-.11,.11])P.addEquipment('hullDark',beamBetween([lx+dx,ly,lz-.08],[lx+dx,ly+.25,lz+.12],.013));
  P.addEquipment('hullDark',beamBetween([lx-.11,ly+.25,lz+.12],[lx+.11,ly+.25,lz+.12],.013));
  const ey=seat(P,'hull',s*.48,-2.52);
  P.addEquipment('hullDetail',box(.85,.025,.64),s*.48,ey+.007,-2.52);
  for(let j=0;j<10;j++)P.addEquipment('hullDark',box(.76,.009,.020),s*.48,ey+.025,-2.79+j*.06);
  const by=seat(P,'hull',s*1.45,-1.63);
  P.addEquipment('hullDetail',box(.38,.09,.61),s*1.45,by+.039,-1.63);
  for(const dz of [-.22,.22])P.addEquipment('hullDark',box(.40,.012,.025),s*1.45,by+.09,-1.63+dz);
 }
 const hy=seat(P,'hull',0,1.49);
 P.addHatch('hull',box(.54,.029,.37),0,hy+.009,1.49);
 P.addEquipment('hullDetail',box(.31,.045,.075),0,hy+.043,1.60);
 P.addEquipment('hullGlass',box(.23,.023,.012),0,hy+.045,1.643);
 // Keep the turbine/diesel rear identities visible beneath the service kit.
 if(m===0){
  P.addEquipment('hullDetail',box(1.31,.23,.16),0,1.20,-3.20);
  for(let i=0;i<9;i++)P.addEquipment('hullDark',box(.025,.18,.022),-.57+i*.1425,1.20,-3.29);
 }else{
  const exhaustX=-1.05,exhaustZ=-2.72,exhaustDeck=seat(P,'hull',exhaustX,exhaustZ);
  P.addEquipment('hullDark',box(.19,.17,.43),exhaustX,exhaustDeck+.075,exhaustZ);
  for(const s of [-1,1]){
   P.addEquipment('hullDetail',beamBetween([s*.66,1.18,-3.00],[s*.82,1.09,-3.20],.028));
   P.addEquipment('hullDetail',cylZ(.066,.11,16),s*.82,1.09,-3.20);
  }
 }
}
function turretKit(P:TankBuilderPort,c:NationalModernizationConfig):void {
 const m=c.model,d=NATIONAL_RUSSIA_DESIGNS[m],top=d.roofY;
 castModernizedTurret(P,{halfWidth:[1.43,1.42,1.36][m],roofY:top,rearZ:[-1.47,-1.54,-1.40][m],frontZ:[1.59,1.64,1.55][m],crownHalf:.74,shoulderY:.31});
 const protectionRows=turretProtection(P,c);
 // Freeze permanent receiving surfaces before destructible cassettes exist.
 // Otherwise the upper row can accidentally attach to the lower row's lid.
 const housing:THREE.BufferGeometry[]=[];
 P.forEachBucketPart(['turretExternalArmor'],g=>housing.push(g));
 addRussianChevronEra(P,m,protectionRows,housing);
 for(const s of [-1,1]){
  for(const z of [-.20,-.58,-.89])housingEra(P,housing,`turret_era_${s<0?'L':'R'}`,[s*1.25,.36,z],[.30,.11,.28]);
  // Smoke bank sits on the new outer housing on a positive steel saddle.
  const x=s*(s>0?[1.57,1.66,1.48][m]:[1.48,1.57,1.40][m]),z=s>0?[.32,.08,.38][m]:-.20,base=seat(P,'turret',x,z);
  P.addEquipment('turretDetail',box(.15,.07,.43),x,base+.028,z);
  for(let i=0;i<4;i++)P.addEquipment('turretDark',markSmokeTube(blindTube(.042,.028,.21,.08,12),[0,0,1],true),x,base+.10,z-.15+i*.10,-.38,s*.45);
  // The right mast stands aft of the complete RWS muzzle sweep.
  const ax=s<0?-.54:[.50,.62,.42][m],az=s<0?(m===2?-1.02:-.92):[-1.80,-1.95,-1.74][m],ay=seat(P,'turret',ax,az);
  P.addEquipment('turretDetail',cylY(.053,.065,.08,16),ax,ay+.034,az);
  P.addEquipment('turretDark',cylY(.008,.012,m===1?.57:.43,12),ax,ay+(m===1?.35:.28),az);
 }
 const sightX=[-.82,-.88,-.78][m],sightZ=-.09,sightBase=seat(P,'turret',sightX,sightZ);
 supportedSensor(P,[sightX,sightBase+.20,sightZ],sightBase-.008);
 if(m===1){
  // The rear deck bridges both side housings; the grille and strapped packs
  // have continuous stock underneath instead of hanging over the open core.
  P.addExternalArmor('turret',box(1.98,.065,.75),0,.7575,-1.715);
  // Raised service grille belongs to the enclosing rear command housing.
  P.addEquipment('turretDetail',box(1.05,.025,.42),0,.793,-1.76);
  for(let j=0;j<9;j++)P.addEquipment('turretDark',box(.024,.012,.35),-.43+j*.108,.812,-1.76);
  for(const s of [-1,1]){
   P.addEquipment('turretDetail',box(.035,.21,.30),s*.79,.50,-1.59);
   P.addEquipment('turretDetail',box(.32,.025,.34),s*.30,.794,-1.925);
   strappedPack(P,'turret',[s*.30,.897,-1.925],[.29,.19,.32]);
  }
  attachedCage(P,'turret',[0,.47,-2.47],1.92,.33,.45);
 }else attachedCage(P,'turret',[0,.42,m===0?-2.24:-2.08],m===0?1.62:1.34,.30,.40);
 // Different protection electronics, all physically attached to cast stock.
 for(const s of [-1,1]){
  const x=s*(s<0?(m===0?1.43:m===1?1.52:1.36):[1.29,1.48,1.12][m]);
  const z=s<0?(m===2?-.56:-.79):[-1.69,-1.72,-1.59][m],y=seat(P,'turret',x,z);
  P.addEquipment('turretDetail',cylY(.09,.12,.08,16),x,y+.032,z);
  if(m===0){
   P.addEquipment('turretDetail',cylZ(.115,.17,24),x,y+.12,z);
   P.addEquipment('turretGlass',cylZ(.087,.012,24),x,y+.12,z+.092);
  }else{
   P.addEquipment('turretDetail',box(.22,.15,.19),x,y+.115,z);
   P.addEquipment('turretGlass',box(.16,.073,.012),x,y+.125,z+.102);
  }
 }
 roofStowage(P,c);
}
function roofStowage(P:TankBuilderPort,c:NationalModernizationConfig):void {
 const m=c.model;
 // Low armored service cases on the rear wings: beneath the remote gun's
 // firing plane and outside both roof hatches. Four feet seat independently
 // on the housing; a level tray supports the case across its tapered roof.
 for(const s of [-1,1]){
  // Keep the broad left cabinet; the right one is aft of the gun's reach.
  const x=s*(s<0?[1.05,1.15,.99][m]:[.74,.97,.63][m]);
  const z=s<0?[-1.33,-1.48,-1.19][m]:[-1.87,-1.96,-1.77][m];
  const w=s<0?[.37,.42,.33][m]:[.32,.36,.28][m],depth=s<0?[.49,.62,.42][m]:[.25,.34,.23][m];
  const feet=[-.35,.35].flatMap(dx=>[-.34,.34].map(dz=>[x+dx*w,z+dz*depth] as const));
  const ys=feet.map(([fx,fz])=>seat(P,'turret',fx,fz)),level=Math.max(...ys)+.035;
  feet.forEach(([fx,fz],i)=>P.addEquipment('turretDark',box(.046,level-ys[i]+.012,.064),fx,(level+ys[i])/2-.006,fz));
  P.addEquipment('turretDetail',box(w+.055,.036,depth+.035),x,level,z);
  const height=s>0&&m===2?.12:m===1?.19:.145;
  P.addEquipment('turretDetail',box(w,height,depth),x,level+height/2+.010,z);
  P.addEquipment('turretDetail',box(w+.015,.018,depth+.01),x,level+height+.021,z);
  for(const dz of [-depth*.28,depth*.28]){
   P.addEquipment('turretDark',box(w+.025,.014,.026),x,level+height+.034,z+dz);
   P.addEquipment('turretDark',box(.024,.065,.026),x+s*(w/2+.005),level+height-.003,z+dz);
  }
  // Receiver cables end at fitted glands instead of floating over the deck.
  const endX=s*1.28,endZ=-.91,endY=seat(P,'turret',endX,endZ);
  P.addEquipment('turretDark',beamBetween([x+s*w*.32,level+.06,z+depth/2],[endX,endY+.035,endZ],.012,8));
  P.addEquipment('turretDetail',cylY(.036,.045,.052,12),endX,endY+.019,endZ);
 }
 const rear=m===0?-2.24:m===1?-2.47:-2.08,width=[1.62,1.92,1.34][m],floor=m===1?.305:.27;
 // A shallow perforated cargo floor follows the existing cage; soft kit
 // and towing stores have visible straps and saddles, with cage air intact.
 for(let i=0;i<7;i++)P.addEquipment('turretDetail',box(.031,.028,.40),-width*.43+i*width*.86/6,floor,rear+.195);
 for(const s of [-1,1]){
  const x=s*width*.26;
  P.addEquipment('turretDetail',box(.34,.025,.32),x,floor+.017,rear+.19);
  strappedPack(P,'turret',[x,floor+.11,rear+.19],[.32,.17,.29]);
 }
 const z=[-1.01,-1.13,-.98][m],x=0,y=seat(P,'turret',x,z);
 P.addEquipment('turretDetail',box(.34,.035,.16),x,y+.010,z);
 P.addEquipment('turretDark',KIT.cylX(.046,.31,16),x,y+.063,z);
 for(const sx of [-.11,.11])P.addEquipment('turretDetail',box(.025,.067,.11),sx,y+.043,z);
}
export function buildNationalRussia(P:TankBuilderPort,c:NationalModernizationConfig):void {hullKit(P,c);turretKit(P,c);}
