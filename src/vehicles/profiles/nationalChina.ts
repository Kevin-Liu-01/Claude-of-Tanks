// Original Chinese retrofit concepts: the native T-80/T-72 tub, shallow
// glacis, curved track guards and gear remain visible underneath the upgrades.
import * as THREE from 'three';
import {KIT} from './kit.ts';
import {addChineseChevronBank} from './chineseChevronEra.ts';
import {addChineseFuelDrum} from './chineseFuelDrum.ts';
import {sectionSolid,type SectionPoint} from './sectionSolid.ts';
import {beamBetween,blindTube,roofSheet} from './measuredPrimitives.ts';
import {castModernizedTurret} from './nationalDonorCore.ts';
import {weldedFlankHousing} from './weldedFlankHousing.ts';
import {eraCassette,glacisEraCassette} from './modernizationFittings.ts';
import {markSmokeTube} from '../vehicleAuxiliaryGeometry.ts';
import {markVehicleNightLens} from '../vehicleNightLighting.ts';
import type {NationalModernizationConfig} from '../nationalModernizationConfig.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';

const {box,cylY,cylZ}=KIT;
type Point=readonly [number,number,number];
type CheekRow=readonly [z:number,inner:number,outer:number,bottom:number,top:number];

/** A finite, replaceable cheek wedge. Its rear root overlaps the curved casting,
 * while the lower cast chin, crown, flank and bearing stay visibly independent. */
function cheekModule(P:TankBuilderPort,side:number,rows:readonly CheekRow[]):void {
  const g=weldedFlankHousing(rows,side,.035);
  // Permanent armor wedge remains in place beneath the small ERA face tiles.
  P.addExternalArmor('turret',g);
  addChineseChevronBank(P,side,rows,P.spec.id==='cn_t72b3m_modern'?.115:P.spec.id==='cn_t80u_modern'?.10:.09);
}

function bustle(P:TankBuilderPort,back:number,half:number,bottom:number,top:number):void {
  const ring=(width:number,low:number):SectionPoint[]=>{
    const b=Math.min(.06,(top-low)*.25);
    return [[-width+b,low],[width-b,low],[width,low+b],[width,top-b],
      [width-b,top],[-width+b,top],[-width,top-b],[-width,low+b]];
  };
  P.addExternalArmor('turret',sectionSolid([
    {z:back,ring:ring(half,bottom+.08)},
    {z:-1.04,ring:ring(half+.06,bottom)},
  ]));
  P.addEquipment('turretDetail',box(half*1.55,.022,-1.04-back-.10),0,top+.006,(back-1.04)/2);
  for(const side of [-1,1])P.addEquipment('turretDark',box(.08,.07,.02),side*half*.67,top-.035,back-.008);
}

/** A continuous flank housing joins the existing cheek root to the rear
 * bustle. Its rising lower edge leaves the original cast chin and bearing
 * readable and clear of the hull through a complete turret revolution. */
function flankHousing(P:TankBuilderPort,side:number,rows:readonly CheekRow[]):void {
  P.addExternalArmor('turret',weldedFlankHousing(rows,side));
}

function turretWrap(P:TankBuilderPort,c:NationalModernizationConfig):void {
  for(const side of [-1,1]){
    if(c.model===0){
      flankHousing(P,side,[[-1.68,.57,1.05,.40,.59],[-1.32,.83,1.36,.34,.63],
        [-.60,1.10,1.55,.23,.65],[.10,.88,1.50,.22,.63]]);
    }else if(c.model===1){
      flankHousing(P,side,[[-2.08,.91,1.21,.43,.65],[-1.61,.76,1.45,.37,.69],
        [-.86,1.10,1.68,.26,.73],[.12,.94,1.60,.25,.70]]);
    }else{
      flankHousing(P,side,[[-1.76,.50,.96,.42,.54],[-1.31,.72,1.25,.34,.59],
        [-.58,1.04,1.48,.22,.61],[.24,.80,1.44,.22,.59]]);
    }
  }
  if(c.model===1){
    // A real open maintenance bay sits behind the small original bustle: two
    // thick outboard housings, lower sill and upper lintel surround open air.
    P.addExternalArmor('turret',box(2.12,.075,.20),0,.465,-2.00);
    P.addExternalArmor('turret',box(2.12,.075,.16),0,.690,-2.02);
    for(const side of [-1,1])P.addExternalArmor('turret',box(.12,.25,.17),side*1.015,.575,-2.02);
    for(const x of [-.57,.57])P.addEquipment('turretDetail',beamBetween([x,.47,-1.79],[x,.47,-2.055],.022));
  }else{
    const z=c.model===0?-1.655:-1.70,w=c.model===0?1.30:1.12,y=c.model===0?.49:.47;
    P.addExternalArmor('turret',box(w,.14,.17),0,y,z);
    // Exposed rear access seams make the surrounding assembly legible.
    for(const x of [-w*.30,w*.30])P.addEquipment('turretDark',box(.015,.095,.014),x,y,z-.092);
  }
}

function yun(P:TankBuilderPort,c:NationalModernizationConfig):void {
  castModernizedTurret(P,{halfWidth:1.36,roofY:.70,rearZ:-1.42,frontZ:1.26,shoulderY:.49,crownHalf:.68});
  for(const side of [-1,1]){
    cheekModule(P,side,[[-.12,.73,1.40,.26,.65],[.53,.69,1.61,.23,.65],
      [1.12,.43,1.20,.26,.55],[1.48,.39,.66,.28,.46]]);
  }
  bustle(P,-1.64,.70,.32,.58);
  coolingPanel(P,-.51,-2.38,.76,.91,8);
  coolingPanel(P,.51,-2.38,.76,.91,8);
  skirts(P,c,6,-2.58,2.70,1.94,.79);
  frontTiles(P,2.11,2,.60,.37);
  const rearY=receivingRoof(P,'hull',0,-3.05);
  P.addEquipment('hullDetail',box(1.36,.036,.28),0,rearY+.018,-3.05);
  for(let i=0;i<8;i++)P.addEquipment('hullDark',box(.025,.017,.23),-.56+i*.16,rearY+.042,-3.05);
}

function kunlun(P:TankBuilderPort,c:NationalModernizationConfig):void {
  castModernizedTurret(P,{halfWidth:1.42,roofY:.77,rearZ:-1.46,frontZ:1.30,shoulderY:.52,crownHalf:.68});
  for(const side of [-1,1]){
    // A two-piece Type-96/VT-inspired brow surrounds visible round stock.
    cheekModule(P,side,[[-.21,.82,1.46,.29,.72],[.34,.76,1.66,.25,.72],[.85,.58,1.43,.26,.64]]);
    cheekModule(P,side,[[.78,.61,1.43,.28,.64],[1.26,.40,1.05,.27,.56],[1.52,.39,.68,.29,.46]]);
  }
  bustle(P,-1.91,.84,.32,.63);
  for(const side of [-1,1])coolingPanel(P,side*.52,-2.49,.85,.88,9);
  skirts(P,c,7,-2.65,3.08,1.98,.74);
  frontTiles(P,2.19,3,.68,.29);
}

function qilin(P:TankBuilderPort,c:NationalModernizationConfig):void {
  castModernizedTurret(P,{halfWidth:1.30,roofY:.69,rearZ:-1.36,frontZ:1.19,shoulderY:.46,crownHalf:.68});
  for(const side of [-1,1]){
    // Small triangular blocks expose the rounded front/side casting below.
    cheekModule(P,side,[[.14,.77,1.24,.26,.60],[.53,.70,1.43,.24,.59],
      [.91,.50,1.05,.25,.50],[1.32,.39,.70,.27,.44]]);
  }
  bustle(P,-1.53,.61,.34,.53);
  coolingPanel(P,-.46,-2.49,.73,.83,7);
  coolingPanel(P,.46,-2.38,.73,1.00,8);
  skirts(P,c,5,-2.35,2.67,1.93,.85);
  frontTiles(P,2.06,2,.57,.38);
}

function permanentParts(P:TankBuilderPort,names:string[]):THREE.BufferGeometry[] {
  const parts:THREE.BufferGeometry[]=[];
  P.forEachBucketPart(names,g=>{if(!Array.isArray(g.userData.eraHitFaceVertexStarts))parts.push(g);});
  return parts;
}

function turretEra(P:TankBuilderPort,c:NationalModernizationConfig):void {
  // Freeze the completed permanent housing before adding any removable face.
  // An earlier cassette or its lid must never become the next tile's receiver.
  const parts=permanentParts(P,['turretExternalArmor']);
  for(const side of [-1,1]){
    if(c.model===0){
      for(const z of [-1.04,-.65,-.27])seatCheekTile(P,parts,side,z,.43,[.27,.075,.30]);
    }else if(c.model===1){
      for(const z of [-1.30,-.89,-.47])seatCheekTile(P,parts,side,z,.48,[.32,.085,.30]);
    }else{
      for(const z of [-.98,-.53,-.10])seatCheekTile(P,parts,side,z,.40,[.25,.07,.31]);
    }
  }
}

function seatCheekTile(P:TankBuilderPort,parts:readonly THREE.BufferGeometry[],side:number,z:number,y:number,size:Point):void {
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

function stockRoof(parts:readonly THREE.BufferGeometry[],x:number,z:number):number {
  const ray=new THREE.Raycaster(new THREE.Vector3(x,3,z),new THREE.Vector3(0,-1,0));
  const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});let y=-Infinity;
  for(const g of parts){
    const mesh=new THREE.Mesh(g,material);mesh.updateMatrixWorld();
    const hit=ray.intersectObject(mesh)[0];if(hit)y=Math.max(y,hit.point.y);
  }
  material.dispose();
  if(!Number.isFinite(y))throw new Error(`Chinese equipment has no permanent seat at ${x},${z}`);
  return y;
}

/** The receiver is sampled at all four feet and through the centre; this is
 * a shaped adapter on the real casting/housing, not a floating accessory. */
function equipmentFoot(P:TankBuilderPort,parts:readonly THREE.BufferGeometry[],x:number,z:number,w:number,d:number):number {
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

function serviceCase(P:TankBuilderPort,parts:readonly THREE.BufferGeometry[],x:number,z:number,w:number,h:number,d:number):number {
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

function lowOptic(P:TankBuilderPort,parts:readonly THREE.BufferGeometry[],x:number,z:number,w:number,h:number,d:number,round:boolean):void {
  const base=equipmentFoot(P,parts,x,z,w*.88,d*.88)-.003;
  P.addEquipment('turretDetail',box(w,h,d),x,base+h/2,z);
  if(round){
    for(const dx of [-w*.24,w*.24])P.addModuleVisual('optics','turretGlass',cylZ(w*.14,.013,12),x+dx,base+h*.55,z+d/2+.005);
  }else P.addModuleVisual('optics','turretGlass',box(w*.72,h*.48,.012),x,base+h*.58,z+d/2+.006);
  // Armored rain hood and two short feet leave the lens physically exposed.
  P.addEquipment('turretDetail',box(w+.040,.018,d+.045),x,base+h+.006,z+.008);
  for(const dx of [-w/2-.01,w/2+.01])P.addEquipment('turretDetail',box(.018,h+.010,.035),x+dx,base+h/2,z+d/2+.013);
}

function serviceCable(P:TankBuilderPort,parts:readonly THREE.BufferGeometry[],points:readonly (readonly[number,number])[]):void {
  const path=points.map(([x,z])=>[x,stockRoof(parts,x,z)+.013,z] as const);
  for(let i=1;i<path.length;i++)P.addEquipment('turretDark',beamBetween(path[i-1],path[i],.010,8));
  for(const [x,y,z]of path)P.addEquipment('turretDetail',box(.045,.034,.032),x,y+.002,z);
}

function nationalRoofEquipment(P:TankBuilderPort,c:NationalModernizationConfig):void {
  const parts=permanentParts(P,['turret','turretExternalArmor']);
  if(c.model===0){
    // Yun uses a low turbine-support/electronics spine and paired service
    // cases, leaving the arrowhead housing and cast roof readable.
    serviceCase(P,parts,-1.10,-1.13,.26,.14,.28);
    serviceCase(P,parts,1.10,-1.13,.26,.14,.28);
    serviceCase(P,parts,0,-1.43,.77,.16,.23);
    lowOptic(P,parts,-.94,.17,.27,.115,.22,false);
    serviceCable(P,parts,[[-.82,-1.01],[-.84,-.86],[-.85,-.66],[-.86,-.44],[-.87,-.24],[-.88,-.02]]);
    const y=stockRoof(parts,0,-1.43)+.026;
    for(const x of [-.48,.48]){
      const foot=equipmentFoot(P,parts,x,-1.36,.070,.070);
      P.addEquipment('turretDetail',beamBetween([x,foot-.006,-1.36],[x,y+.17,-1.36],.016));
      P.addEquipment('turretDetail',beamBetween([x,y+.17,-1.36],[x,y+.17,-1.56],.016));
    }
    P.addEquipment('turretDetail',beamBetween([-.48,y+.17,-1.56],[.48,y+.17,-1.56],.016));
  }else if(c.model===1){
    // Kunlun carries protected sensor blocks and separate removable service
    // cases on both deep wings. No crate fills its open rear maintenance bay.
    for(const side of [-1,1]){
      serviceCase(P,parts,side*1.20,-1.48,.30,.15,.34);
      // Forward guards sit beyond the complete RWS barrel sweep, including
      // its skin at maximum depression, on the wide permanent cheek stock.
      lowOptic(P,parts,side*1.30,.22,.22,.13,.20,true);
    }
    const y=serviceCase(P,parts,0,-1.50,.82,.16,.37);
    for(const x of [-.30,0,.30])P.addEquipment('turretDetail',box(.026,.045,.33),x,y+.010,-1.50);
    serviceCable(P,parts,[[-1.17,-1.25],[-1.24,-1.12],[-1.29,-.96]]);
    serviceCable(P,parts,[[1.17,-1.25],[1.24,-1.12],[1.29,-.96]]);
    // A rear grab rail follows the solid top lintel, preserving air beneath.
    for(const x of [-.70,.70])P.addEquipment('turretDetail',box(.024,.11,.024),x,.775,-2.02);
    P.addEquipment('turretDetail',box(1.424,.026,.024),0,.827,-2.02);
  }else{
    // Qilin has a compact field-tool arrangement instead of the Yun/Kunlun
    // electronics banks: a low roll, tool chest, small rack and side camera.
    serviceCase(P,parts,-.77,-1.02,.29,.13,.33);
    serviceCase(P,parts,.86,-1.03,.25,.12,.29);
    lowOptic(P,parts,.92,.28,.20,.11,.19,true);
    const y=equipmentFoot(P,parts,0,-1.39,.72,.25);
    P.addEquipment('turretCloth',KIT.cylX(.078,.66,16),0,y+.070,-1.39);
    for(const x of [-.23,.23]){
      P.addEquipment('turretDetail',box(.042,.036,.22),x,y+.007,-1.39);
      P.addEquipment('turretDark',KIT.cylX(.082,.028,16),x,y+.070,-1.39);
    }
    for(const x of [-.42,.42]){
      const foot=equipmentFoot(P,parts,x,-1.45,.070,.13);
      P.addEquipment('turretDetail',box(.025,.145,.025),x,foot+.066,-1.45);
      P.addEquipment('turretDetail',beamBetween([x,foot+.132,-1.60],[x,foot+.132,-1.29],.013));
    }
    const rackY=stockRoof(parts,.42,-1.45)+.158;
    P.addEquipment('turretDetail',beamBetween([-.42,rackY,-1.60],[.42,rackY,-1.60],.013));
    serviceCable(P,parts,[[-.80,-.82],[-.83,-.66],[-.85,-.46],[-.86,-.25]]);
  }
}

function equipment(P:TankBuilderPort,c:NationalModernizationConfig):void {
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
  // The central sight is retained in a low armored housing beneath the RWS
  // depression envelope; its new finite adapter is fitted to the cast crown.
  lowOptic(P,permanentParts(P,['turret','turretExternalArmor']),0,-.08,.28,.11,.24,false);
  // The original right mast crossed the receiver/feed box during traverse.
  // Its complete base and whip now sit on the opposite rear shoulder, beyond
  // the full muzzle circle and clear of the commander's hatch.
  const antennaZ=-.86,antennaX=-.85,antennaY=receivingRoof(P,'turret',antennaX,antennaZ);
  P.addEquipment('turretDetail',cylY(.057,.07,.08,12),antennaX,antennaY+.025,antennaZ);
  P.addEquipment('turretDark',cylY(.007,.010,.54,8),antennaX,antennaY+.33,antennaZ);
  for(const side of [-1,1])for(let i=0;i<(c.model===1?6:4);i++){
    const z=-.77+i*.12,x=side*(c.model===1?1.12:c.model===0?1.06:1.02);
    const seats=[z-.047,z+.047].map(zz=>({z:zz,left:receivingRoof(P,'turret',x-.060,zz,true),right:receivingRoof(P,'turret',x+.060,zz,true)}));
    const top=Math.max(...seats.flatMap(s=>[s.left,s.right]))+.035;
    P.addEquipment('turretDetail',sectionSolid(seats.map(s=>({z:s.z,
      ring:[[x-.060,s.left-.006],[x+.060,s.right-.006],[x+.060,top],[x-.060,top]],
    }))));
    P.addEquipment('turretDark',markSmokeTube(blindTube(.038,.027,.21,.13,P.q?12:8),[0,0,1],true),
      x,top+.072,z+.025,-.66,side*.57);
  }
}

/** Turbine Yun, heavy Kunlun and compact Qilin carry different rear layouts.
 * Every rack attaches to permanent hull/turret stock, not to removable ERA. */
function modernizationEquipment(P:TankBuilderPort,c:NationalModernizationConfig):void {
  const turret=permanentParts(P,['turret','turretExternalArmor']);
  // Independent welded rear cages: horizontal Chinese-style slats on Yun,
  // the deep Kunlun maintenance extension, and Qilin's smaller tool basket.
  const cage=c.model===0?{half:.72,join:-1.59,rear:-1.98,bottom:.40,top:.76,rows:3}:
    c.model===1?{half:1.00,join:-2.01,rear:-2.35,bottom:.46,top:.78,rows:2}:
    {half:.52,join:-1.67,rear:-1.96,bottom:.43,top:.69,rows:2};
  const put=(g:THREE.BufferGeometry,role:string)=>{
    g.userData.chineseModernization={model:c.model,role};
    P.addEquipment('turretOpenLattice',g);
  };
  for(const side of [-1,1]){
    const x=side*cage.half;
    // Embedded root strut ties directly into the existing rear armor beam.
    put(beamBetween([x,cage.bottom,cage.join+.035],[x,cage.bottom,cage.rear],.021),'cage-root');
    put(beamBetween([x,cage.bottom,cage.rear],[x,cage.top,cage.rear],.018),'cage-post');
    put(beamBetween([x,cage.top,cage.rear],[x,cage.top,cage.join],.017),'cage-side-rail');
    put(beamBetween([x,cage.bottom,cage.join],[x,cage.top,cage.join],.018),'cage-front-post');
  }
  for(let row=0;row<=cage.rows;row++){
    const y=cage.bottom+(cage.top-cage.bottom)*row/cage.rows;
    put(beamBetween([-cage.half,y,cage.rear],[cage.half,y,cage.rear],row===0||row===cage.rows?.020:.012),'cage-rear-rail');
  }
  for(const ratio of [-.50,0,.50]){
    const x=cage.half*ratio;
    put(beamBetween([x,cage.bottom,cage.join],[x,cage.bottom,cage.rear],.014),'cage-floor');
  }
  if(c.model===0){
    // Wide angular side electronics remain outboard of the low cast crown.
    for(const side of [-1,1])lowOptic(P,turret,side*1.29,.09,.22,.085,.20,false);
  }else if(c.model===1){
    // A three-cell armored rear maintenance console is supported by the
    // existing lintel; it stays below the rotating roof weapon's gun plane.
    for(const x of [-.57,0,.57]){
      P.addEquipment('turretDetail',box(.43,.11,.10),x,.755,-2.01);
      P.addEquipment('turretDark',box(.34,.054,.012),x,.752,-2.066);
      for(const dx of [-.14,.14])P.addEquipment('turretDetail',box(.032,.022,.030),x+dx,.807,-2.01);
    }
  }else{
    // Qilin's inexpensive retrofit keeps a compact central basket and a
    // field-service carrier instead of the other two electronics banks.
    const base=equipmentFoot(P,turret,-1.14,-.60,.18,.33);
    P.addEquipment('turretDetail',box(.19,.08,.34),-1.14,base+.033,-.60);
    for(const z of [-.70,-.60,-.50])P.addEquipment('turretDark',box(.13,.008,.017),-1.14,base+.078,z);
  }
  addConceptFuelDrums(P,c);
}

function addConceptFuelDrums(P:TankBuilderPort,c:NationalModernizationConfig):void {
  const stock=permanentParts(P,['hull']),mat=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  const meshes=stock.map(g=>{const m=new THREE.Mesh(g,mat);m.updateMatrixWorld();return m;});
  const radius=c.model===0?.235:c.model===1?.285:.245,length=c.model===1?.97:.85,center=c.model===1?.70:.65;
  // Low rear cradles keep every fitting below the main gun's complete
  // depressed/recoiling sweep, including intermediate rearward turret yaw.
  const y=c.model===0?.90:c.model===1?.86:.82;
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

export function buildNationalChina(P:TankBuilderPort,c:NationalModernizationConfig):void {
  if(c.model===0)yun(P,c);else if(c.model===1)kunlun(P,c);else qilin(P,c);
  turretWrap(P,c);
  turretEra(P,c);
  equipment(P,c);
  nationalRoofEquipment(P,c);
  modernizationEquipment(P,c);
}
