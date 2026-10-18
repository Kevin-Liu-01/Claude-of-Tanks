// Original Chinese retrofit concepts: the native T-80/T-72 tub, shallow
// glacis, curved track guards and gear remain visible underneath the upgrades.
// Release 227: all three carry donor fleet turrets (chinaDonorTurretKit.ts); this module keeps their hull packages and
// the shared field-fit helpers. The cast CN turrets are gone.
import * as THREE from 'three';
import {KIT} from './kit.ts';
import {addChineseFuelDrum} from './chineseFuelDrum.ts';
import {sectionSolid,type SectionPoint} from './sectionSolid.ts';
import {beamBetween,roofSheet} from './measuredPrimitives.ts';
import {machinedRing} from '../machineGunGeometry.ts';
import {eraCassette,glacisEraCassette} from './modernizationFittings.ts';
import {markVehicleNightLens} from '../vehicleNightLighting.ts';
import type {NationalModernizationConfig} from '../nationalModernizationConfig.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';

const {box,cylY,cylZ}=KIT;
type Point=readonly [number,number,number];






/** The Yun's hull package (release 227: carried unchanged from its cast-turret build under the Type 96B): the twin
 * engine-deck cooling panels, six two-course skirt modules, two glacis tile rows and the slatted transom plate. */
function yunHull(P:TankBuilderPort,c:NationalModernizationConfig):void {
  coolingPanel(P,-.51,-2.38,.76,.91,8);
  coolingPanel(P,.51,-2.38,.76,.91,8);
  skirts(P,c,6,-2.58,2.70,1.94,.79);
  frontTiles(P,2.11,2,.60,.37);
  const rearY=receivingRoof(P,'hull',0,-3.05);
  P.addEquipment('hullDetail',box(1.36,.036,.28),0,rearY+.018,-3.05);
  for(let i=0;i<8;i++)P.addEquipment('hullDark',box(.025,.017,.23),-.56+i*.16,rearY+.042,-3.05);
}



export function permanentParts(P:TankBuilderPort,names:string[]):THREE.BufferGeometry[] {
  const parts:THREE.BufferGeometry[]=[];
  P.forEachBucketPart(names,g=>{if(!Array.isArray(g.userData.eraHitFaceVertexStarts))parts.push(g);});
  return parts;
}


/** A flat reactive tile on the outer wall at (z, y), seated by a -X raycast onto the frozen permanent `parts`. */
export function seatCheekTile(P:TankBuilderPort,parts:readonly THREE.BufferGeometry[],side:number,z:number,y:number,size:Point):void {
  const ray=new THREE.Raycaster(new THREE.Vector3(side*3,y,z),new THREE.Vector3(-side,0,0));
  const mat=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});let nearest:THREE.Intersection|undefined;
  for(const g of parts){
    const mesh=new THREE.Mesh(g,mat);mesh.updateMatrixWorld();
    const hit=ray.intersectObject(mesh)[0];if(hit&&(!nearest||hit.distance<nearest.distance))nearest=hit;
  }
  mat.dispose();
  if(!nearest?.face)throw new Error(`${P.spec.id}: no Chinese cheek tile receiver`);
  const normal=nearest.face.normal.clone();if(normal.x*side<0)normal.negate();
  const rot=new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),normal));
  const p=nearest.point.clone().addScaledVector(normal,size[1]*.5-.006);
  eraCassette(P,'turret',`turret_era_${side<0?'L':'R'}`,p.toArray(),size,[rot.x,rot.y,rot.z]);
}

/** Skirt top lines follow the original fender rake; the curved front guards
 * and moving wheel bay are not enclosed by a new rectangular hull. */
function skirts(P:TankBuilderPort,c:NationalModernizationConfig,count:number,from:number,to:number,x:number,bottom:number):void {
  const length=(to-from)/count,inner=x-.055,thickness=c.model===1?.26:.20,outer=inner+thickness;
  const carrier:{z:number;y:number}[]=[];
  for(const side of [-1,1])for(let i=0;i<count;i++){
    const z=from+length*(i+.5),y=receivingRoof(P,'hull',side*1.58,z),top=y-.08;
    if(side===1)carrier.push({z,y:top-.025});
    const low=bottom+(c.model===1&&i%2===1?.075:0);
    const ring:SectionPoint[]=[[inner,low+.075],[outer-.055,low],[outer,low+.075],
      [outer,top-.06],[outer-.055,top],[inner,top-.020]];
    const oriented=side>0?ring:ring.map(([xx,yy])=>[-xx,yy] as const).reverse();
    P.addExternalArmor('hull',sectionSolid([{z:z-length*.47,ring:oriented},{z:z+length*.47,ring:oriented}]));
    const sector=`skirt_era_${side<0?'L':'R'}`;
    if(c.model===0){
      // Yun's turbine retrofit has two horizontal reactive courses, exposing
      // a narrow permanent carrier belt between the long shallow cassettes.
      for(const row of [-1,1])eraCassette(P,'hull',sector,
        [side*(outer+.035),(top+low)/2+row*(top-low)*.235,z],
        [.080,(top-low)*.39,length*.84]);
    }else if(c.model===1){
      // Kunlun retains large staggered full-height heavy modules.
      eraCassette(P,'hull',sector,[side*(outer+.035),(top+low)/2,z],
        [.080,top-low-.085,length*.84]);
    }else{
      // Qilin's smaller retrofit uses paired narrow replaceable tiles on
      // each broad ribbed skirt bay rather than the other packages' courses.
      for(const dz of [-length*.22,length*.22])eraCassette(P,'hull',sector,
        [side*(outer+.035),(top+low)/2,z+dz],
        [.080,top-low-.085,length*.38]);
    }
    // The second visible layer is inset from the shell's bevels; every panel
    // has a permanent carrier beneath the removable reactive armor face.
    if(c.model===2)P.addEquipment('hullDetail',box(.035,.055,length*.77),side*(outer+.089),top-.053,z);
  }
  for(const side of [-1,1]){
    // Continuous upper carrier bridges the small panel seams.
    P.addExternalArmor('hull',sectionSolid(carrier.map(({z,y})=>{
      const ring:SectionPoint[]=[[inner,y-.050],[inner+.090,y-.050],[inner+.090,y+.023],[inner,y+.023]];
      return {z,ring:side>0?ring:ring.map(([xx,yy])=>[-xx,yy] as const).reverse()};
    })));
    shoulderCover(P,c,side,from,to,length,inner,carrier);
    for(const front of [false,true]){
      const join=front?to-length*.03:from+length*.03,end=front?to+.27:from-.27;
      const y=carrier[front?carrier.length-1:0].y+.025;
      const stations=[
        {z:join,inside:inner,outside:outer,low:bottom+.05,top:y},
        {z:end,inside:inner-.015,outside:inner+.055,low:bottom+.14,top:y-.045},
      ].sort((a,b)=>a.z-b.z);
      // The inward chamfer never enters the native shoe corridor. It folds
      // around the armor bank only, keeping the donor's curved guard exposed.
      P.addExternalArmor('hull',sectionSolid(stations.map(s=>{
        const ring:SectionPoint[]=[[s.inside,s.low+.025],[s.outside-.018,s.low],
          [s.outside,s.low+.035],[s.outside,s.top-.04],[s.outside-.025,s.top],[s.inside,s.top]];
        return {z:s.z,ring:side>0?ring:ring.map(([xx,yy])=>[-xx,yy] as const).reverse()};
      })));
    }
  }
}

/** A closed folded shoulder runs the whole skirt bank. Its inner edge seats
 * into the native guard; only the outer lip descends to the skirt carrier, well
 * outside the moving shoe corridor. The wheel bay remains open underneath. */
function shoulderCover(P:TankBuilderPort,c:NationalModernizationConfig,side:number,
  from:number,to:number,length:number,inner:number,carrier:readonly {z:number;y:number}[]):void {
  const nativeBreaks=c.model===0?[-2.86,-2.40,-1.20,.60,2.40,2.90,3.07]:
    c.model===1?[-3.15,-2.80,1.65,2.70,3.06,3.08,3.23,3.43]:[-2.96,-2.76,-1.89,.395,1.70,2.50,3.08];
  // Continue past both skirt returns onto the native fender folds; ending at
  // the last cassette left a visible rear slot above the moving return course.
  const start=Math.min(from-.27,-3.02),end=Math.max(to+.27,3.10),rearJoin=from+length*.03,frontJoin=to-length*.03;
  const stations=[...new Set([start,end,rearJoin,frontJoin,...carrier.map(s=>s.z),
    ...nativeBreaks.filter(z=>z>start&&z<end)])].sort((a,b)=>a-b);
  function carrierTop(z:number):number {
    if(z<rearJoin)return carrier[0].y+.025-.045*(rearJoin-z)/(rearJoin-(from-.27));
    if(z>frontJoin)return carrier[carrier.length-1].y+.025-.045*(z-frontJoin)/(to+.27-frontJoin);
    for(let i=1;i<carrier.length;i++)if(z<carrier[i].z){
      const a=carrier[i-1],b=carrier[i],t=Math.max(0,(z-a.z)/(b.z-a.z));
      return a.y+(b.y-a.y)*t+.025;
    }
    return carrier[carrier.length-1].y+.025;
  }
  const geometry=sectionSolid(stations.map(z=>{
    const y=receivingRoof(P,'hull',side*1.58,z),lip=Math.min(carrierTop(z),y-.012);
    const ring:SectionPoint[]=[[1.56,y-.004],[inner+.020,y-.004],[inner+.020,lip-.035],
      [inner+.090,lip-.035],[inner+.090,y+.008],[inner+.040,y+.028],[1.56,y+.028]];
    return {z,ring:side>0?ring:ring.map(([x,yy])=>[-x,yy] as const).reverse()};
  }));
  geometry.userData.nationalShoulderCover={side,from:start,to:end,innerLip:inner+.020};
  P.addExternalArmor('hull',geometry);
  // Small service joints lie on the fitted cover rather than bridging open air.
  for(const {z} of carrier){
    const y=receivingRoof(P,'hull',side*1.58,z);
    P.addEquipment('hullDetail',box(.23,.008,.024),side*(inner-.095),y+.030,z);
  }
}

function coolingPanel(P:TankBuilderPort,x:number,z:number,w:number,d:number,n:number):void {
  const back=z-d*.5,front=z+d*.5,y0=receivingRoof(P,'hull',x,back),y1=receivingRoof(P,'hull',x,front);
  P.addEquipment('hullDetail',roofSheet([
    [back,x-w*.5,x+w*.5,y0+.026,y0+.026],[front,x-w*.5,x+w*.5,y1+.026,y1+.026],
  ],.030));
  for(let i=0;i<n;i++){
    const zz=back+d*.07+i*d*.86/(n-1),y=y0+(y1-y0)*(zz-back)/d;
    P.addEquipment('hullDark',box(w*.87,.008,.028),x,y+.032,zz);
  }
}

function frontTiles(P:TankBuilderPort,z:number,rows:number,w:number,d:number):void {
  for(const side of [-1,1])for(let j=0;j<rows;j++)
    glacisEraCassette(P,`glacis_era_${side<0?'L':'R'}`,side*.55,z+j*(d+.04),[w,.065,d]);
}

function receivingRoof(P:TankBuilderPort,owner:'hull'|'turret',x:number,z:number,includeArmor=false):number {
  const ray=new THREE.Raycaster(new THREE.Vector3(x,4,z),new THREE.Vector3(0,-1,0));
  const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});let y=-Infinity;
  P.forEachBucketPart(includeArmor?[owner,`${owner}ExternalArmor`]:[owner],g=>{
    if(Array.isArray(g.userData.eraHitFaceVertexStarts))return;
    const mesh=new THREE.Mesh(g,material);mesh.updateMatrixWorld();
    const hit=ray.intersectObject(mesh)[0];if(hit)y=Math.max(y,hit.point.y);
  });
  material.dispose();
  if(!Number.isFinite(y))throw new Error(`${P.spec.id}: missing Chinese ${owner} receiving roof ${x},${z}`);
  return y;
}

/** Release 227, round 4 (critic CN3-D2: each equipment foot cast 13 downward rays through every triangle of the frozen
 * stock, and the Qilin's kit ran 20 % slower than its 226 build): each frozen part keeps its plan box, and a part a ray
 * lands in more than once keeps its triangles' plan boxes filed by 5 cm strips across X (both per geometry, rebuilt if
 * its positions change). A downward ray at (x, z) meets only triangles whose plan box holds (x, z), and each is tested
 * with the raycaster's own Ray.intersectTriangle on the same ray (double-sided, identity frame), so every height is the
 * one the raycaster returned, to the bit. */
interface RoofStrips {base:number;count:number;offsets:Int32Array;tris:Int32Array;abc:Int32Array;bb:Float64Array}
interface RoofIndex {version:number;x0:number;x1:number;z0:number;z1:number;queries:number;strips:RoofStrips|null}
const ROOF_STRIP=.05,ROOF_INDEX=new WeakMap<THREE.BufferGeometry,RoofIndex>();
const roofRay=new THREE.Ray(),roofA=new THREE.Vector3(),roofB=new THREE.Vector3(),roofC=new THREE.Vector3(),roofHit=new THREE.Vector3();
const attributeVersion=(p:THREE.BufferAttribute|THREE.InterleavedBufferAttribute):number=>
  p instanceof THREE.InterleavedBufferAttribute?p.data.version:p.version;
function roofIndex(g:THREE.BufferGeometry):RoofIndex {
  const p=g.attributes.position,cached=ROOF_INDEX.get(g),version=attributeVersion(p);
  if(cached&&cached.version===version)return cached;
  let x0=Infinity,x1=-Infinity,z0=Infinity,z1=-Infinity;
  for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i);if(x<x0)x0=x;if(x>x1)x1=x;if(z<z0)z0=z;if(z>z1)z1=z;}
  const index={version,x0,x1,z0,z1,queries:0,strips:null};ROOF_INDEX.set(g,index);return index;
}
function roofStrips(g:THREE.BufferGeometry,index:RoofIndex):RoofStrips {
  const p=g.attributes.position,idx=g.index,n=Math.floor((idx?idx.count:p.count)/3);
  const abc=new Int32Array(n*3),bb=new Float64Array(n*4);
  const base=Math.floor(index.x0/ROOF_STRIP),count=Math.floor(index.x1/ROOF_STRIP)-base+1,offsets=new Int32Array(count+1);
  for(let t=0;t<n;t++){
    const a=idx?idx.getX(t*3):t*3,b=idx?idx.getX(t*3+1):t*3+1,c=idx?idx.getX(t*3+2):t*3+2;abc[t*3]=a;abc[t*3+1]=b;abc[t*3+2]=c;
    const xa=p.getX(a),xb=p.getX(b),xc=p.getX(c),za=p.getZ(a),zb=p.getZ(b),zc=p.getZ(c);
    const lx=Math.min(xa,xb,xc),hx=Math.max(xa,xb,xc);bb[t*4]=lx;bb[t*4+1]=hx;bb[t*4+2]=Math.min(za,zb,zc);bb[t*4+3]=Math.max(za,zb,zc);
    for(let s=Math.floor(lx/ROOF_STRIP)-base;s<=Math.floor(hx/ROOF_STRIP)-base;s++)offsets[s+1]!++;
  }
  for(let s=0;s<count;s++)offsets[s+1]!+=offsets[s]!;
  const fill=offsets.slice(0,count),tris=new Int32Array(offsets[count]!);
  for(let t=0;t<n;t++)for(let s=Math.floor(bb[t*4]!/ROOF_STRIP)-base;s<=Math.floor(bb[t*4+1]!/ROOF_STRIP)-base;s++)tris[fill[s]!++]=t;
  return {base,count,offsets,tris,abc,bb};
}
function roofTest(p:THREE.BufferAttribute|THREE.InterleavedBufferAttribute,a:number,b:number,c:number,y:number):number {
  roofA.fromBufferAttribute(p,a);roofB.fromBufferAttribute(p,b);roofC.fromBufferAttribute(p,c);
  return roofRay.intersectTriangle(roofA,roofB,roofC,false,roofHit)?Math.max(y,roofHit.y):y;
}
/** The highest frozen-stock surface under (x, z): a downward ray from y = 3 (throws where there is none). */
export function stockRoof(parts:readonly THREE.BufferGeometry[],x:number,z:number):number {
  roofRay.origin.set(x,3,z);roofRay.direction.set(0,-1,0);let y=-Infinity;
  for(const g of parts){
    const index=roofIndex(g);
    if(x<index.x0||x>index.x1||z<index.z0||z>index.z1)continue;
    const p=g.attributes.position,idx=g.index,n=idx?idx.count:p.count;
    if(!index.strips&&++index.queries>1&&n>3*64)index.strips=roofStrips(g,index);
    const st=index.strips;
    if(st){
      const s=Math.floor(x/ROOF_STRIP)-st.base;if(s<0||s>=st.count)continue;
      for(let k=st.offsets[s]!;k<st.offsets[s+1]!;k++){
        const t=st.tris[k]!;if(x<st.bb[t*4]!||x>st.bb[t*4+1]!||z<st.bb[t*4+2]!||z>st.bb[t*4+3]!)continue;
        y=roofTest(p,st.abc[t*3]!,st.abc[t*3+1]!,st.abc[t*3+2]!,y);
      }
    }else for(let t=0;t+2<n;t+=3)y=roofTest(p,idx?idx.getX(t):t,idx?idx.getX(t+1):t+1,idx?idx.getX(t+2):t+2,y);
  }
  if(!Number.isFinite(y))throw new Error(`Chinese equipment has no permanent seat at ${x},${z}`);
  return y;
}

/** The receiver is sampled at all four feet and through the centre; this is
 * a shaped adapter on the real casting/housing, not a floating accessory. */
export function equipmentFoot(P:TankBuilderPort,parts:readonly THREE.BufferGeometry[],x:number,z:number,w:number,d:number):number {
  const rows=[z-d/2,z+d/2].map(zz=>({z:zz,left:stockRoof(parts,x-w/2,zz),right:stockRoof(parts,x+w/2,zz)}));
  let high=-Infinity;
  for(const dx of [-w/2,0,w/2])for(const dz of [-d/2,0,d/2])high=Math.max(high,stockRoof(parts,x+dx,z+dz));
  const top=high+.026;
  const g=sectionSolid(rows.map(r=>({z:r.z,ring:[[x-w/2,r.left-.006],[x+w/2,r.right-.006],
    [x+w/2,top],[x-w/2,top]]})));
  g.userData.nationalEquipmentFoot={x,z,w,d,top};
  P.addEquipment('turretDetail',g);
  return top;
}

export function serviceCase(P:TankBuilderPort,parts:readonly THREE.BufferGeometry[],x:number,z:number,w:number,h:number,d:number):number {
  const base=equipmentFoot(P,parts,x,z,w*.92,d*.92)-.003;
  const ring:SectionPoint[]=[[x-w/2,base+.025],[x-w/2+.03,base],[x+w/2-.03,base],
    [x+w/2,base+.025],[x+w/2,base+h-.025],[x+w/2-.03,base+h],[x-w/2+.03,base+h],[x-w/2,base+h-.025]];
  P.addEquipment('turretDetail',sectionSolid([{z:z-d/2,ring},{z:z+d/2,ring}]));
  P.addEquipment('turretDetail',box(w-.04,.018,d-.035),x,base+h-.002,z);
  for(const dx of [-w*.30,w*.30]){
    P.addEquipment('turretDark',box(.032,.050,.018),x+dx,base+h*.46,z+d/2+.005);
    P.addEquipment('turretDetail',box(.056,.025,.026),x+dx,base+h*.48,z+d/2+.011);
  }
  // Recessed handle is built as stock around real open air.
  for(const dx of [-.056,.056])P.addEquipment('turretDark',box(.016,.028,.022),x+dx,base+h+.019,z);
  P.addEquipment('turretDark',box(.126,.014,.022),x,base+h+.029,z);
  return base+h;
}

export function lowOptic(P:TankBuilderPort,parts:readonly THREE.BufferGeometry[],x:number,z:number,w:number,h:number,d:number,round:boolean):void {
  const base=equipmentFoot(P,parts,x,z,w*.88,d*.88)-.003;
  P.addEquipment('turretDetail',box(w,h,d),x,base+h/2,z);
  if(round){
    for(const dx of [-w*.24,w*.24])P.addModuleVisual('optics','turretGlass',cylZ(w*.14,.013,12),x+dx,base+h*.55,z+d/2+.005);
  }else P.addModuleVisual('optics','turretGlass',box(w*.72,h*.48,.012),x,base+h*.58,z+d/2+.006);
  // Armored rain hood and two short feet leave the lens physically exposed.
  P.addEquipment('turretDetail',box(w+.040,.018,d+.045),x,base+h+.006,z+.008);
  for(const dx of [-w/2-.01,w/2+.01])P.addEquipment('turretDetail',box(.018,h+.010,.035),x+dx,base+h/2,z+d/2+.013);
}

/** A service cable over the roof: segments between the points, a clip at each point. `clipEnds: false` leaves the
 * two end points bare (each end then stops inside the receiver it plugs into, a case face or a pedestal). */
export function serviceCable(P:TankBuilderPort,parts:readonly THREE.BufferGeometry[],points:readonly (readonly[number,number])[],clipEnds=true):void {
  const path=points.map(([x,z])=>[x,stockRoof(parts,x,z)+.013,z] as const);
  for(let i=1;i<path.length;i++)P.addEquipment('turretDark',beamBetween(path[i-1],path[i],.010,8));
  path.forEach(([x,y,z],i)=>{if(clipEnds||(i>0&&i<path.length-1))P.addEquipment('turretDetail',box(.045,.034,.032),x,y+.002,z);});
}



/** Driver's hatch, periscopes and the armoured front lamps on the native glacis. */
function chinaHullEquipment(P:TankBuilderPort,c:NationalModernizationConfig):void {
  const driverZ=c.model===1?1.72:1.61,driverY=receivingRoof(P,'hull',0,driverZ);
  P.addHatch('hullHatch',cylY(.28,.28,.032,24),0,driverY+.012,driverZ);
  for(const x of [-.17,0,.17]){
    const z=driverZ+.28,y=receivingRoof(P,'hull',x,z);
    P.addEquipment('hullDetail',box(.15,.07,.12),x,y+.03,z);
    P.addModuleVisual('optics','hullGlass',box(.11,.032,.010),x,y+.034,z+.065);
  }
  const front=c.model===0?2.76:c.model===1?2.95:2.77;
  for(const side of [-1,1]){
    const x=side*1.40,y=receivingRoof(P,'hull',x,front),y0=receivingRoof(P,'hull',x,front-.12),y1=receivingRoof(P,'hull',x,front+.12);
    P.addEquipment('hullDetail',roofSheet([
      [front-.12,x-.13,x+.13,y0+.025,y0+.025],[front+.12,x-.13,x+.13,y1+.025,y1+.025],
    ],.030));
    if(c.model===0){
      // Yun's low paired rectangular driving lamps share an armored brow.
      P.addEquipment('hullDetail',box(.238,.105,.11),x,y+.091,front+.014);
      for(const dx of [-.061,.061])P.addEquipment('hullGlass',markVehicleNightLens(box(.089,.045,.012),'headlight'),x+dx,y+.092,front+.074);
    }else if(c.model===1){
      P.addEquipment('hullDetail',box(.242,.14,.13),x,y+.11,front+.004);
      for(const dx of [-.059,.059])P.addEquipment('hullGlass',markVehicleNightLens(cylZ(.043,.016,16),'headlight'),x+dx,y+.112,front+.074);
    }else{
      P.addEquipment('hullDark',cylZ(.078,.10,16),x,y+.097,front+.01);
      P.addEquipment('hullGlass',markVehicleNightLens(cylZ(.063,.014,16),'headlight'),x,y+.097,front+.068);
    }
    for(const dx of [-.12,.12])P.addEquipment('hullDetail',beamBetween([x+dx,y-.005,front],[x+dx,y+.175,front],.012));
    P.addEquipment('hullDetail',box(.265,.020,.16),x,y+.18,front);
  }
}



function addConceptFuelDrums(P:TankBuilderPort,c:NationalModernizationConfig):void {
  const stock=permanentParts(P,['hull']),mat=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  const meshes=stock.map(g=>{const m=new THREE.Mesh(g,mat);m.updateMatrixWorld();return m;});
  const radius=c.model===0?.235:c.model===1?.285:.245,length=c.model===1?.97:.85,center=c.model===1?.70:.65;
  // Low rear cradles keep every fitting below the main gun's complete
  // depressed/recoiling sweep, including intermediate rearward turret yaw.
  // Kunlun .85 (was .86): its Type 96B donor gun's legal depression/recoil sweep over the rear needs the drums 1 cm lower
  // for the 25 mm fitting clearance (chineseFuelDrum receipt).
  const y=c.model===0?.90:c.model===1?.85:.82;
  const roots:THREE.Vector3[]=[];
  for(const side of [-1,1])for(const offset of [-length*.30,length*.30]){
    const x=side*center+offset;
    const ray=new THREE.Raycaster(new THREE.Vector3(x,1.00,-6),new THREE.Vector3(0,0,1),0,6);
    const hit=ray.intersectObjects(meshes,false)[0];
    if(!hit)throw new Error(`${c.id}: auxiliary drum has no native rear hull receiver at ${x}`);
    roots.push(hit.point.clone());
  }
  mat.dispose();
  const z=Math.min(...roots.map(p=>p.z))-radius-.10;
  for(const side of [-1,1])addChineseFuelDrum(P,side*center,y,z,radius,length);
  for(const root of roots){
    const foot=new THREE.Vector3(root.x,y-radius*.73,z+radius*.38);
    const g=beamBetween(root.clone().add(new THREE.Vector3(0,0,.035)).toArray() as [number,number,number],foot.toArray() as [number,number,number],.038,8);
    g.userData.chineseFuelCradle={root:root.toArray(),foot:foot.toArray()};
    P.addEquipment('hullDetail',g);
    // A short upright meets the retaining band at its lower quadrant.
    const upright=box(.058,.095,.058);
    upright.userData.chineseFuelCradle={role:'upright',root:root.toArray(),foot:foot.toArray()};
    P.addEquipment('hullDark',upright,root.x,foot.y+.010,foot.z);
  }
  P.hullG.userData.chineseConceptFuelDrums={centers:[[-center,y,z],[center,y,z]],radius,length,roots:roots.map(r=>r.toArray())};
}

/** The hull half of the Kunlun and Qilin packages, unchanged beneath their donor
 * turrets (nationalDonorTurret.ts): engine-deck cooling panels, heavy skirts,
 * glacis cassettes, the driver's station, armoured lamps and rear fuel drums. */
export function chinaDonorHull(P:TankBuilderPort,c:NationalModernizationConfig):void {
  if(c.model===0)yunHull(P,c);
  else if(c.model===1){
    for(const side of [-1,1])coolingPanel(P,side*.52,-2.49,.85,.88,9);
    skirts(P,c,7,-2.65,3.08,1.98,.74);
    frontTiles(P,2.19,3,.68,.29);
  }else{
    coolingPanel(P,-.46,-2.49,.73,.83,7);
    coolingPanel(P,.46,-2.38,.73,1.00,8);
    skirts(P,c,5,-2.35,2.67,1.93,.85);
    frontTiles(P,2.06,2,.57,.38);
  }
  chinaHullEquipment(P,c);
  addConceptFuelDrums(P,c);
  if(c.model===0)yunRingRace(P);
}

/** Release 227: the Yun's stationary ring race under the Type 96B ring collar, which rides 40 mm higher on the T-80U
 * hull than the cast turret did: a machined race bedded 6-35 mm into the sloping T-80U roof, its top 2 mm under the
 * collar's underside, so no daylight shows under the collar. Its front edge stays behind the driver's hatch rim. */
function yunRingRace(P:TankBuilderPort):void {
  // its top 2 mm under the Type 96B ring collar's underside (pivot 1.59158 - 0.030)
  const g=machinedRing(.98,1.10,1.5596-1.522,.004,P.q?24:16);
  g.userData.chineseModernization={model:0,role:'ring-race'};
  P.addEquipment('hullDetail',g,0,1.522,.0718698169);
}

