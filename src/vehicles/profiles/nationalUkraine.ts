// Ukrainian packages fitted to native T-80U/T-72 hull cores and running gear.
// Compact cast-core turrets keep their ancestry visible between the finite
// modern cheek banks, working stations, stowage and open protective screens.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid } from './sectionSolid.ts';
import { beamBetween, blindTube } from './measuredPrimitives.ts';
import { attachedCage, eraCassette, glacisEraCassette, supportedSensor, strappedPack } from './modernizationFittings.ts';
import { castModernizedTurret } from './nationalDonorCore.ts';
import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';
import { addVehicleGhillieSuit } from '../ghillieSuit.ts';
import { addNationalUkraineProtection, NATIONAL_UKRAINE_GHILLIE, ukrainianSkirtEra } from './nationalUkraineProtection.ts';
import { NATIONAL_UKRAINE_DESIGNS } from '../nationalUkraineDesign.ts';
import type { NationalModernizationConfig } from '../nationalModernizationConfig.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

const { box, cylX, cylY, cylZ, torus } = KIT;

/** Real first-hit height, so stock rests on each retained native surface. */
function surfaceY(P:TankBuilderPort,owner:'hull'|'turret',x:number,z:number,armor=false):number {
  const ray=new THREE.Raycaster(new THREE.Vector3(x,5,z),new THREE.Vector3(0,-1,0),0,10);
  const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  let height=-Infinity;
  P.forEachBucketPart(armor?[owner,`${owner}ExternalArmor`]:[owner],g=>{
    if(armor&&Object.hasOwn(g.userData,'eraHitFaceVertexStarts'))return;
    const mesh=new THREE.Mesh(g,material);mesh.updateMatrixWorld(true);
    const hit=ray.intersectObject(mesh)[0];if(hit)height=Math.max(height,hit.point.y);
  });
  material.dispose();
  if(!Number.isFinite(height))throw new Error(`${P.spec.id}: missing native ${owner} seat at ${x},${z}`);
  return height;
}

type ArmorRow=readonly [z:number,inner:number,outer:number,bottom:number,top:number];

/** Closed, chamfered armor housing. Mirrored contours keep outward winding. */
function sideHousing(side:number,rows:readonly ArmorRow[]):THREE.BufferGeometry {
  return sectionSolid(rows.map(([z,inner,outer,bottom,top])=>{
    const ring:[number,number][]=[
      [inner,bottom],[outer-.045,bottom],[outer,bottom+.045],
      [outer,top-.045],[outer-.045,top],[inner,top],
    ];
    if(side<0){for(const p of ring)p[0]*=-1;ring.reverse();}
    return {z,ring};
  }));
}

/** ERA goes onto the new permanent receiving stock, never the buried dome.
 * The stock-only list excludes earlier tiles, so every cassette has a seat. */
function housingEra(P:TankBuilderPort,stock:readonly THREE.BufferGeometry[],side:number,
  seed:readonly [number,number,number],size:readonly [number,number,number]):void {
  const outward=new THREE.Vector3(...seed);outward.y=0;outward.normalize();
  const origin=outward.clone().multiplyScalar(4);origin.y=seed[1];
  const direction=outward.clone().negate(),ray=new THREE.Raycaster(origin,direction,0,8);
  const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  let nearest:THREE.Intersection|undefined;
  for(const g of stock){
    const mesh=new THREE.Mesh(g,material);mesh.updateMatrixWorld(true);
    const hit=ray.intersectObject(mesh)[0];
    if(hit&&(!nearest||hit.distance<nearest.distance))nearest=hit;
  }
  material.dispose();
  if(!nearest?.face)throw new Error(`${P.spec.id}: Ukrainian housing has no ERA seat`);
  const normal=nearest.face.normal.clone();if(normal.dot(direction)>0)normal.negate();
  const rotation=new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),normal));
  const seat=nearest.point.clone().addScaledVector(normal,size[1]/2-.008);
  eraCassette(P,'turret',`turret_era_${side<0?'L':'R'}`,seat.toArray(),size,[rotation.x,rotation.y,rotation.z]);
}

/** Continuous cheek-to-flank structures carry the outer ERA. Both halves
 * remain open at the front; rear ties are entirely behind the gun trunnion. */
function turretAssembly(P:TankBuilderPort,c:NationalModernizationConfig):void {
  const stock:THREE.BufferGeometry[]=[];
  const add=(g:THREE.BufferGeometry)=>{stock.push(g.clone());P.addExternalArmor('turret',g);};
  const rows:readonly ArmorRow[]=c.model===0?[
    [-1.68,.64,1.11,.32,.54],[-1.21,1.02,1.51,.22,.57],[-.34,1.16,1.64,.18,.60],
    [.39,1.08,1.66,.18,.63],[1.00,.84,1.43,.18,.63],[1.43,.53,1.03,.20,.60],[1.78,.42,.68,.23,.54],
  ]:c.model===1?[
    [-1.94,.61,1.06,.39,.65],[-1.58,.69,1.36,.31,.69],[-.96,1.09,1.57,.23,.64],
    [.28,1.12,1.61,.18,.64],[.79,.95,1.57,.18,.65],[1.29,.65,1.19,.20,.61],[1.80,.42,.68,.24,.53],
  ]:[
    [-1.61,.64,1.10,.30,.43],[-1.08,1.04,1.54,.23,.43],[-.20,1.09,1.59,.18,.44],
    [.37,1.05,1.59,.18,.60],[.87,.88,1.40,.18,.60],[1.28,.61,1.05,.21,.56],[1.69,.42,.68,.24,.50],
  ];
  for(const side of [-1,1])add(sideHousing(side,rows));
  // Back plates intersect each side return and overlap the cast core by a
  // finite amount. Their rising floors clear the hull at every turret yaw.
  if(c.model===1)add(sectionSolid([
    {z:-1.96,ring:[[-.92,.39],[.92,.39],[.92,.63],[-.92,.63]]},
    {z:-1.59,ring:[[-1.14,.31],[1.14,.31],[1.14,.69],[-1.14,.69]]},
    {z:-1.31,ring:[[-.77,.26],[.77,.26],[.77,.65],[-.77,.65]]},
  ]));
  else add(sectionSolid([
    {z:c.model===0?-1.70:-1.63,ring:[[-.95,.32],[.95,.32],[.95,c.model===0?.54:.43],[-.95,c.model===0?.54:.43]]},
    {z:-1.19,ring:[[-.85,.25],[.85,.25],[.85,c.model===0?.57:.43],[-.85,c.model===0?.57:.43]]},
  ]));
  for(const side of [-1,1]){
    const seeds=c.model===0?[[1.28,.405,.56],[1.14,.405,.99],[.81,.40,1.39]]:
      c.model===1?[[1.25,.425,.50],[1.16,.425,.91],[.86,.41,1.35]]:
      [[1.19,.40,.53],[1.04,.40,.90],[.79,.385,1.25]];
    for(const [x,y,z]of seeds)for(const dy of [-.082,.082])housingEra(P,stock,side,[side*x,y+dy,z],
      [c.model===2?.135:.16,.10,c.model===2?.23:.27]);
    for(const z of [-.38,-.76,-1.03]){
      const ys=c.model===2?[.31]:[.315,.49];
      for(const y of ys)housingEra(P,stock,side,[side*1.5,y,z],[.15,.09,.205]);
    }
    // Upper side rails and the rear frame attach directly to permanent armor.
    const outer=c.model===0?1.61:c.model===1?1.57:1.62;
    if(c.model===2){
      for(const z of [-1.08,-.20]){
        P.addEquipment('turretDetail',beamBetween([side*1.40,.36,z],[side*outer,.36,z],.023));
        P.addEquipment('turretDetail',box(.034,.36,.034),side*outer,.54,z);
      }
      for(const y of [.39,.72])P.addEquipment('turretDetail',box(.035,.035,.91),side*outer,y,-.64);
      for(let i=1;i<7;i++)P.addEquipment('turretDetail',box(.014,.32,.014),side*outer,.55,-1.08+i*.126);
    }else{
      for(const z of [-.25,-.82])P.addEquipment('turretDetail',box(.05,.15,.045),side*outer,.61,z);
      P.addEquipment('turretDetail',box(.04,.04,.67),side*outer,.69,-.53);
    }
  }
  for(const g of stock)g.dispose();
}

function zoria(P:TankBuilderPort,c:NationalModernizationConfig):void {
  castModernizedTurret(P,{halfWidth:1.39,roofY:.69,rearZ:-1.44,frontZ:1.57,shoulderY:.28,crownHalf:.76});
  turretAssembly(P,c);
  for(const side of [-1,1]) {
    // Short rear stowage is carried by the structural rear return.
    strappedPack(P,'turret',[side*.43,.647,-1.47],[.30,.19,.30]);
    const by=surfaceY(P,'hull',side*1.48,-2.22);
    P.addEquipment('hullDetail',box(.46,.075,.72),side*1.48,by+.03,-2.22);
    for(let i=0;i<7;i++)P.addEquipment('hullDark',box(.38,.008,.039),side*1.48,by+.072,-2.50+i*.087);
  }
  skirtPackage(P,c,5);
  glacisTiles(P,[2.09,2.53,2.86],.63,.57,.32);
  attachedCage(P,'turret',[0,.42,-1.84],1.42,.28,.28);
}

function hetman(P:TankBuilderPort,c:NationalModernizationConfig):void {
  castModernizedTurret(P,{halfWidth:1.36,roofY:.74,rearZ:-1.56,frontZ:1.61,shoulderY:.30,crownHalf:.76});
  turretAssembly(P,c);
  for(const side of [-1,1]) {
    // Antenna-control packs occupy the joined command bustle, behind all seats.
    strappedPack(P,'turret',[side*.42,.785,-1.61],[.30,.20,.34]);
    P.addEquipment('turretDetail',box(.035,.12,.30),side*.61,.743,-1.61);
  }
  // The command panorama sits on the left rear armor shoulder, beyond the
  // roof weapon's complete yaw envelope. Its pedestal meets permanent stock.
  supportedSensor(P,[-1.18,.92,-1.12],surfaceY(P,'turret',-1.18,-1.12,true)-.008);
  skirtPackage(P,c,7);
  glacisTiles(P,[2.15,2.59,3.04],.63,.55,.33);
  attachedCage(P,'turret',[0,.49,-2.13],1.47,.31,.30);
}

function sich(P:TankBuilderPort,c:NationalModernizationConfig):void {
  castModernizedTurret(P,{halfWidth:1.32,roofY:.70,rearZ:-1.37,frontZ:1.49,shoulderY:.27,crownHalf:.75});
  turretAssembly(P,c);
  skirtPackage(P,c,6);
  glacisTiles(P,[2.00,2.47,2.87],.61,.52,.30);
  attachedCage(P,'turret',[0,.49,-1.85],1.41,.37,.33);
  for(const side of [-1,1]) {
    P.addEquipment('hullDetail',box(.026,.026,3.82),side*2.19,1.36,-.15);
    for(const z of [-1.85,-.37,1.11])P.addEquipment('hullDetail',box(.15,.022,.033),side*2.12,1.36,z);
  }
}

/** A permanent carrier backs each removable face. Chamfered front/rear
 * returns wrap toward (but never inside) x=1.89, keeping the wheel bays open
 * and the donor's curved front fenders exposed inboard of the modern armor. */
function skirtPackage(P:TankBuilderPort,c:NationalModernizationConfig,count:number):void {
  shoulderPanels(P,c);
  const span=4.88,step=span/count,back=1.92,outer=c.model===0?2.09:c.model===1?2.12:2.10;
  const front=c.model===1?3.40:c.model===0?3.07:3.17,rear=c.model===1?-3.07:-3.10;
  for(const side of [-1,1]){
    // One longitudinal load rail joins every armor segment and corner return.
    P.addExternalArmor('hull',box(.105,.105,5.13),side*(back+.025),1.36,0);
    // Sich's field skirt keeps separate removable segments. Short folded
    // lap caps bridge their upper joints all the way across the ERA carrier,
    // overlapping the load rail and both adjacent panel tops for support.
    if(c.model===2)for(let i=1;i<count;i++){
      const joint=-span/2+i*step;
      P.addExternalArmor('hull',sectionSolid(([
        [-.115,1.354,1.388],[-.065,1.398,1.438],
        [.065,1.398,1.438],[.115,1.354,1.388],
      ] as const).map(([dz,low,high])=>{
        const ring:[number,number][]=[[1.95,low],[outer+.075,low],[outer+.075,high],[1.95,high]];
        if(side<0){for(const p of ring)p[0]*=-1;ring.reverse();}
        return {z:joint+dz,ring};
      })));
    }
    for(let i=0;i<count;i++) {
      const z=-span/2+(i+.5)*step,seat=surfaceY(P,'hull',side*1.67,z);
      P.addEquipment('hullDetail',beamBetween([side*1.62,seat+.021,z],[side*(back+.035),seat+.021,z],.027,10));
      const drop=Math.max(.07,seat-1.35);
      P.addEquipment('hullDetail',box(.052,drop,.17),side*(back+.035),seat-drop/2+.021,z);
      const lower=c.model===2?.81:.76,top=1.415;
      P.addExternalArmor('hull',sideHousing(side,[
        [z-step/2+.026,back,outer-.023,lower+.075,top-.045],
        [z-step/2+.10,back,outer,lower,top],
        [z+step/2-.10,back,outer,lower,top],
        [z+step/2-.026,back,outer-.023,lower+.075,top-.045],
      ]));
      ukrainianSkirtEra(P,side,z,step,outer);
      P.addEquipment('hullDetail',cylZ(.023,.16,10),side*(outer-.015),1.415,z);
    }
    P.addExternalArmor('hull',sideHousing(side,[
      [rear,1.89,2.005,1.00,1.30],[rear+.27,1.91,outer,.90,1.395],
      [-2.37,1.92,outer,.80,1.415],
    ]));
    P.addExternalArmor('hull',sideHousing(side,[
      [2.37,1.92,outer,.80,1.415],[front-.27,1.91,outer,.94,1.395],
      [front,1.89,2.005,1.05,1.31],
    ]));
    // Hinge strips show that the shaped end returns and armored main bank
    // belong to one supported assembly, without bridging across the tracks.
    for(const z of [-2.39,2.39])P.addEquipment('hullDetail',box(.038,.43,.068),side*(outer+.008),1.13,z);
  }
}

/** Closed connecting shoulders overlap the native thin fender along their
 * inner edge and the thick permanent skirt carrier along their outer edge.
 * Their authored stations follow every relevant donor fender fold; they never
 * extend downward through the moving track corridor. */
function shoulderPanels(P:TankBuilderPort,c:NationalModernizationConfig):void {
  const outer=c.model===0?2.09:c.model===1?2.12:2.10;
  const rear=c.model===1?-3.07:-3.10,front=c.model===1?3.40:c.model===0?3.07:3.17;
  const zs=c.model===0?[rear,-2.86,-2.83,-2.40,-2.37,-1.20,.60,2.37,2.40,2.80,2.90,front]:
    c.model===1?[rear,-2.80,-2.37,1.65,2.37,2.70,3.06,3.08,3.13,3.23,front]:
    [rear,-2.96,-2.83,-2.76,-2.37,-1.89,.395,1.70,2.37,2.50,2.90,3.08,front];
  for(const side of [-1,1]){
    const inner=c.model===0?1.687:c.model===1?1.729:side<0?1.7555:1.7763;
    const sections=zs.map(z=>{
      const fenderY=surfaceY(P,'hull',side*inner,z);
      let out=outer,carrierY=1.415;
      if(z<rear+.27){const t=(z-rear)/.27;out=2.005+(outer-2.005)*t;carrierY=1.30+.095*t;}
      else if(z<-2.37)carrierY=1.395+.020*(z-(rear+.27))/(-2.37-rear-.27);
      else if(z>front-.27){const t=(z-(front-.27))/.27;out=outer+(2.005-outer)*t;carrierY=1.395-.085*t;}
      else if(z>2.37)carrierY=1.415-.020*(z-2.37)/(front-.27-2.37);
      const ring:[number,number][]=[
        [inner,fenderY-.007],[out-.025,carrierY-.027],
        [out-.025,carrierY+.028],[inner,fenderY+.034],
      ];
      if(side<0){for(const p of ring)p[0]*=-1;ring.reverse();}
      return {z,ring};
    });
    P.addExternalArmor('hull',sectionSolid(sections,{sideQuadDiagonal:side<0?'bd':'ac'}));
    // Shallow seams and fastening strips sit on top of the fitted shoulder.
    for(const z of [-2.15,-.55,1.10,2.18]){
      const y=surfaceY(P,'hull',side*inner,z)+.035;
      P.addEquipment('hullDetail',beamBetween([side*(inner+.01),y,z],[side*(outer-.05),1.447,z],.012,8));
    }
  }
}

/** Four finite feet follow the permanent body, making each level tray a real
 * installation instead of a floating box. ERA is excluded from these seats. */
function utilityTray(P:TankBuilderPort,x:number,z:number,w:number,d:number):number {
  const feet:[number,number,number][]=[];
  for(const dx of [-w*.34,w*.34])for(const dz of [-d*.34,d*.34])
    feet.push([x+dx,surfaceY(P,'turret',x+dx,z+dz,true),z+dz]);
  const y=Math.max(...feet.map(f=>f[1]))+.027;
  for(const [fx,fy,fz]of feet)P.addEquipment('turretDetail',box(.047,y-fy+.012,.060),fx,(y+fy)/2-.006,fz);
  P.addEquipment('turretDetail',box(w,.028,d),x,y+.006,z);
  return y+.020;
}

function utilityCase(P:TankBuilderPort,x:number,z:number,w:number,h:number,d:number):number {
  const y=utilityTray(P,x,z,w+.035,d+.035);
  P.addEquipment('turretDetail',box(w,h,d),x,y+h/2-.004,z);
  P.addEquipment('turretDetail',box(w+.012,.020,d+.012),x,y+h,z);
  for(const dx of [-w*.30,w*.30]){
    P.addEquipment('turretDark',box(.032,.046,.013),x+dx,y+h-.024,z+d/2+.005);
    P.addEquipment('turretDetail',beamBetween([x+dx-.025,y+h+.014,z],[x+dx+.025,y+h+.014,z],.010,8));
  }
  return y+h+.010;
}

function cableRun(P:TankBuilderPort,points:readonly (readonly [number,number,number])[],radius=.011):void {
  const seated:[number,number,number][]=points.map(([x,y,z])=>{
    const skin=surfaceY(P,'turret',x,z,true),height=Math.max(y,skin+radius+.014);
    P.addEquipment('turretDetail',box(.045,height-skin+.012,.050),x,(skin+height)/2-.006,z);
    P.addEquipment('turretDetail',box(.065,.025,.035),x,height+.002,z);
    return [x,height,z];
  });
  for(let i=1;i<seated.length;i++)P.addEquipment('turretDark',beamBetween(seated[i-1],seated[i],radius,8));
}

function liftingEye(P:TankBuilderPort,x:number,z:number):void {
  const y=surfaceY(P,'turret',x,z,true);
  P.addEquipment('turretDetail',box(.15,.026,.11),x,y+.008,z);
  P.addEquipment('turretDetail',torus(.047,.014,12,6),x,y+.060,z);
}

function nationalRoofEquipment(P:TankBuilderPort,c:NationalModernizationConfig):void {
  // Keep the entire RWS/cupola installation at x±.55,z-.70 uncovered. New
  // equipment stays low on the armor shoulders or on the aft bustle carrier.
  if(c.model===0){
    const ly=utilityCase(P,-1.17,-.59,.29,.12,.46);
    const ry=utilityCase(P,1.13,-.91,.28,.105,.36);
    for(let i=0;i<5;i++)P.addEquipment('turretDark',box(.17,.007,.025),1.13,ry+.005,-1.04+i*.065);
    cableRun(P,[[-1.29,ly-.08,-.82],[-1.28,.64,-1.05],[-1.04,.58,-1.30],[-.76,.58,-1.45]]);
    // Rear assault-tool carrier and a strapped cylindrical filter kit.
    const ty=utilityTray(P,0,-1.49,.34,.36);
    P.addEquipment('turretCloth',cylZ(.095,.30,18),0,ty+.093,-1.49);
    for(const z of [-1.59,-1.39])P.addEquipment('turretDark',box(.205,.021,.026),0,ty+.180,z);
    for(const side of [-1,1]){
      liftingEye(P,side*1.17,.42);
      const x=side*1.20,z=.19,y=surfaceY(P,'turret',x,z,true);
      P.addEquipment('turretDetail',box(.14,.055,.16),x,y+.024,z);
      P.addEquipment('turretDetail',cylZ(.061,.11,16),x,y+.088,z+.025);
      P.addEquipment('turretGlass',cylZ(.050,.009,16),x,y+.088,z+.085);
      for(const dx of [-.075,.075])P.addEquipment('turretDetail',beamBetween([x+dx,y+.01,z-.045],[x+dx,y+.157,z+.065],.010,8));
      P.addEquipment('turretDetail',beamBetween([x-.075,y+.157,z+.065],[x+.075,y+.157,z+.065],.010,8));
    }
  }else if(c.model===1){
    const left=utilityCase(P,-1.10,-.31,.30,.105,.44);
    const right=utilityCase(P,1.09,-1.30,.29,.10,.32);
    const radio=utilityCase(P,0,-1.80,.48,.095,.23);
    for(let i=0;i<5;i++){
      P.addEquipment('turretDark',box(.18,.006,.023),-1.10,left+.003,-.46+i*.071);
      P.addEquipment('turretDark',box(.022,.006,.16),-.16+i*.08,radio+.003,-1.80);
    }
    // Routed communications harnesses leave both hatch seats clear.
    cableRun(P,[[-1.10,left-.075,-.55],[-1.34,.69,-.74],[-1.38,.69,-1.14],[-1.06,.716,-1.48],[-.72,.716,-1.70],[-.26,radio-.070,-1.80]],.012);
    cableRun(P,[[1.09,right-.070,-1.46],[.84,.715,-1.72],[.26,radio-.070,-1.80]],.012);
    for(const x of [-.13,0,.13])P.addEquipment('turretDark',cylZ(.020,.020,12),x,radio-.055,-1.924);
    // A rear cable reel hangs on two solid arms from the bustle backplate.
    for(const x of [-.17,.17])P.addEquipment('turretDetail',beamBetween([x,.49,-1.87],[x,.49,-2.08],.019,8));
    P.addEquipment('turretDark',cylX(.082,.27,18),0,.49,-2.075);
    for(const x of [-.15,.15])P.addEquipment('turretDetail',cylX(.106,.023,18),x,.49,-2.075);
    for(const side of [-1,1])liftingEye(P,side*1.22,.39);
  }else{
    utilityCase(P,1.26,-.79,.23,.105,.42);
    for(const side of [-1,1]){
      // Slim utility cans behind the hatch/RWS seats, each on its own cradle.
      const x=side*.66,z=-1.45,y=utilityTray(P,x,z,.19,.25);
      P.addEquipment('turretDetail',box(.15,.185,.19),x,y+.090,z);
      P.addEquipment('turretDark',box(.026,.185,.203),x,y+.093,z);
      for(const dx of [-.045,.045])P.addEquipment('turretDetail',beamBetween([x+dx,y+.174,z],[x+dx,y+.199,z],.010,8));
      P.addEquipment('turretDetail',beamBetween([x-.045,y+.199,z],[x+.045,y+.199,z],.012,8));
      liftingEye(P,side*1.16,.41);
    }
    // A removable tray joins the rear armor to its open field cage.
    const ty=utilityTray(P,0,-1.45,.67,.31);
    P.addEquipment('turretCloth',cylX(.082,.57,18),0,ty+.078,-1.45);
    for(const x of [-.20,.20])P.addEquipment('turretDark',box(.030,.18,.181),x,ty+.078,-1.45);
    // Shovel and pry bar rest on separate clips along the cast/armor shoulder.
    for(const x of [-1.18,-1.31]){
      const a=-.81,b=-.08,ya=surfaceY(P,'turret',x,a,true)+.050,yb=surfaceY(P,'turret',x,b,true)+.050;
      P.addEquipment('turretDetail',beamBetween([x,ya,a],[x,yb,b],.013,8));
      for(const z of [-.68,-.20]){
        const y=surfaceY(P,'turret',x,z,true);
        P.addEquipment('turretDark',box(.070,.075,.035),x,y+.027,z);
      }
      if(x<-1.2)P.addEquipment('turretDetail',box(.115,.026,.16),x,yb,b+.055);
    }
    cableRun(P,[[-1.37,.46,-.86],[-1.43,.46,-1.05],[-1.13,.46,-1.34],[-.82,.46,-1.52]],.014);
  }
}

function glacisTiles(P:TankBuilderPort,zs:readonly number[],x:number,w:number,d:number):void {
  for(const side of [-1,1])for(const z of zs)for(const dx of [-w*.255,w*.255])glacisEraCassette(P,
    `glacis_era_${side<0?'L':'R'}`,side*x+dx,z,[w*.455,.074,d]);
}

function hullEquipment(P:TankBuilderPort,c:NationalModernizationConfig):void {
  const engineZ=c.model===0?-2.31:c.model===1?-2.38:-2.34;
  for(const x of [-.47,.47]) {
    const y=surfaceY(P,'hull',x,engineZ);
    P.addEquipment('hullDetail',box(.80,.021,.67),x,y+.008,engineZ);
    for(let i=0;i<9;i++)P.addEquipment('hullDark',box(.69,.005,.027),x,y+.022,engineZ-.27+i*.067);
  }
  const driverZ=c.model===0?1.45:1.43,hy=surfaceY(P,'hull',0,driverZ);
  P.addHatch('hull',box(.53,.026,.39),0,hy+.009,driverZ);
  P.addEquipment('hullDark',box(.27,.026,.05),0,hy+.037,driverZ+.11);
  for(const side of [-1,1]) {
    const x=side*.84,z=c.model===1?2.80:2.61,y=surfaceY(P,'hull',x,z);
    P.addEquipment('hullDetail',cylY(.055,.076,.12,12),x,y+.05,z);
    P.addEquipment('hullDetail',markVehicleNightLens(cylZ(.071,.077,16),'headlight'),x,y+.13,z+.025);
    for(const dx of [-.10,.10])P.addEquipment('hullDetail',beamBetween([x+dx,y-.005,z-.03],[x+dx,y+.21,z+.10],.009));
    P.addEquipment('hullDetail',beamBetween([x-.10,y+.21,z+.10],[x+.10,y+.21,z+.10],.009));
    const rearZ=-3.13,ry=surfaceY(P,'hull',side*.67,rearZ);
    P.addEquipment('hullDetail',box(.15,.10,.16),side*.67,ry-.06,rearZ-.025);
    P.addEquipment('hullDetail',torus(.064,.021,14,6),side*.67,ry-.06,rearZ-.11);
  }
}

function roofEquipment(P:TankBuilderPort,c:NationalModernizationConfig):void {
  const d=NATIONAL_UKRAINE_DESIGNS[c.model];
  supportedSensor(P,[-.67,d.roofY+.15,.015],d.roofY-.012);
  for(const side of [-1,1]) {
    const x=side*(c.model===0?1.63:c.model===1?1.58:1.58),y=c.model===2?.47:.65,z=-.12;
    P.addEquipment('turretDetail',box(.20,.12,.47),x,y,z);
    for(let i=0;i<4;i++)P.addEquipment('turretDark',
      markSmokeTube(blindTube(.041,.029,.25,.09,12),[0,0,1],true),
      x+side*.060,y+.08,z-.19+i*.126,-.64,side*.67);
    // Route both aerials to the left shoulder; the former right mast sat
    // inside the rotating receiver and barrel sweep.
    const ax=side<0?-.48:-1.48,az=side<0?-.97:-.68,ay=surfaceY(P,'turret',ax,az,true);
    P.addEquipment('turretDetail',cylY(.055,.070,.058,12),ax,ay+.022,az);
    P.addEquipment('turretDark',cylY(.007,.014,.64,10),ax,ay+.36,az);
  }
}

export function buildNationalUkraine(P:TankBuilderPort,c:NationalModernizationConfig):void {
  if(c.model===0)zoria(P,c);else if(c.model===1)hetman(P,c);else sich(P,c);
  hullEquipment(P,c);roofEquipment(P,c);nationalRoofEquipment(P,c);
  const id=c.model===0?'ua_t80u_modern':c.model===1?'ua_t72b3m_modern':'ua_t72b3_modern';
  addNationalUkraineProtection(P,id);addVehicleGhillieSuit(P,NATIONAL_UKRAINE_GHILLIE[id]);
}
