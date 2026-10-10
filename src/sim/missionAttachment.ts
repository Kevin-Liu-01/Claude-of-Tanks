import {AERIAL_RULES} from './matchRuleset.ts';
import { MISSION_ATTACHMENT_SEATS } from './missionAttachmentSeats.generated.ts';
import { auxiliaryCapabilities } from '../vehicles/auxiliaryInventory.ts';
import { auxiliaryWeaponProfile } from '../vehicles/auxiliaryWeapons.ts';

// Structural armor input keeps the room rules independent of fleet builders.
type Vec3Tuple = readonly [number, number, number];
type Frame = 'hull' | 'turret';
type SurfacePlate = { name?: string; verts: readonly Vec3Tuple[]; kind?: string; gunFollow?: boolean };
type Bounds = { sweepRadius?:number; min: readonly number[]; max: readonly number[]; structureKind?: string | null; vertices?: readonly Vec3Tuple[]; faces?: readonly {indices: readonly number[]; normal: readonly number[]; constant: number}[] };
export interface MissionCarrierSpec {
  id?: string;
  nation?: string;
  gunArcDeg?: number;
  hydropneumaticAim?: unknown;
  gun?:{caliberMm?:number};gunDepressionDeg?:number;gunElevationDeg?:number;gunPitchByYawDeg?:readonly (readonly number[])[];
  dims: { hullLengthM: number; widthM: number; heightM: number };
  armor: {
    hullPlates: readonly SurfacePlate[]; turretPlates: readonly SurfacePlate[];
    turretPivot: Vec3Tuple; turretless?: boolean;
    collisionShells?: { hull?: readonly Bounds[]; turret?: readonly Bounds[] };
    externalWeapons?: readonly (Bounds & { turretLocal?: boolean; gunFollow?: boolean })[];
  };
}
export interface MissionAttachment { frame: Frame; x: number; y: number; z: number; width: number; depth: number; footX: number; footZ: number; supportY?: readonly number[]; payloadOffset?:readonly [number,number]; braced?:boolean }
export interface MissionAttachmentNativeRecord extends MissionAttachment { signature:string; geometryHash:string; supportY:readonly number[] }
export const DRONE_AIRFRAME_SCALE = .45;
export const DRONE_DOCK_HEIGHT_M = .1375;
// Includes the largest (ducted) national airframe, every rotor angle, skids and antennas.
export const DRONE_DOCK_ENVELOPE = { halfWidth: .36, halfDepth: .36, bottom: .038, top: .311 } as const;
export const DRONE_DOCK_CRADLE = { width:.34, depth:.32, footX:.108, footZ:.09 } as const;
// Finite stock volumes leave the real open air below each rotor available.
// Bounds are relative to the cradle datum, and geometry tests verify that every
// national model and every spinning blade stays inside their union.
const REFERENCE_STOCK: readonly Bounds[] = [
  {min:[-.14,.057,-.33],max:[.14,.327,.244]},
  {min:[-.10,.28,-.192],max:[.10,.390,-.110]},
  ...[-1,1].flatMap(side=>[
    {min:[side*.084-.014,.174,-.316],max:[side*.084+.014,.205,.316]},
    {min:[side*.108-.052,.038,-.173],max:[side*.108+.052,.199,.199]},
    ...[-1,1].flatMap(end=>[
      {min:[side*.288-.188,.230,end*.288-.188],max:[side*.288+.188,.263,end*.288+.188]},
      {min:[side*.288-.047,.151,end*.288-.047],max:[side*.288+.047,.253,end*.288+.047]},
      {min:[side>0?.050:-.311,.172,end>0?.032:-.317],max:[side>0?.311:-.050,.222,end>0?.317:-.032]},
    ]),
  ]),
];
// These measured stock bounds use the 0.6-scale authoring airframe and its
// 0.17 m origin. Apply the same uniform final scale as the rendered airframe.
const stockRatio=DRONE_AIRFRAME_SCALE/.6;
const stockPoint=(p:readonly number[])=>[p[0]!*stockRatio,(p[1]!-.17)*stockRatio+DRONE_DOCK_HEIGHT_M,p[2]!*stockRatio];
export const DRONE_DOCK_VOLUMES:readonly Bounds[]=REFERENCE_STOCK.map(b=>({min:stockPoint(b.min),max:stockPoint(b.max)}));
/** The optional short cantilever moves only the landing pad; its four feet
 * remain on the certified roof. Both rendered kit and launch use this datum. */
export function missionAirframeVolumes(seat:MissionAttachment,takeoff=false):Bounds[] {
 const [x,z]=seat.payloadOffset??[0,0];
 return DRONE_DOCK_VOLUMES.map(part=>({min:[part.min[0]!+x,part.min[1]!,part.min[2]!+z],
  max:[part.max[0]!+x,part.max[1]!+(takeoff?AERIAL_RULES.drone.launchHeightM:0),part.max[2]!+z]}));
}
/** Exact open cradle solids, shared by the renderer and native collision audit. */
export interface MissionCradleVolume extends Bounds { roofContact?:boolean; brace?:{start:Vec3Tuple;end:Vec3Tuple;thickness:number} }
export function missionCradleVolumes(seat:MissionAttachment):MissionCradleVolume[] {
  const result:MissionCradleVolume[]=[];
  const [dx,dz]=seat.payloadOffset??[0,0];
  const box=(w:number,h:number,d:number,x:number,y:number,z:number,roofContact=false)=>{
    result.push({min:[x-w/2,y-h/2,z-d/2],max:[x+w/2,y+h/2,z+d/2],roofContact});
  };
  for(const z of [-seat.footZ,seat.footZ])box(seat.width+Math.abs(dx),.028,.055,dx/2,0,z);
  box(.10,.045,.12,0,.012,-seat.footZ);
  for(const [xi,x]of [-seat.footX,seat.footX].entries()){
    box(.052,.032,seat.depth+Math.abs(dz),x+dx,.005,dz/2);
    for(const [zi,z]of [-seat.footZ,seat.footZ].entries()){
      box(.085,.018,.10,x+dx,.030,z+dz);box(.018,.052,.09,x+dx+Math.sign(x)*.047,.020,z+dz);
      const foot=seat.y-(seat.supportY?.[xi*2+zi]??seat.y-.045);
      box(.038,foot,.045,x,-foot/2,z,true);box(.095,.016,.10,x,-foot+.004,z,true);
    }
  }
  if(seat.braced) {
    const rise=seat.y-Math.max(...(seat.supportY??[seat.y-.045]));
    if(rise>=.20) {
      const lower=-rise+.08,upper=-.045,thickness=.022,pad=thickness/Math.SQRT2;
      const brace=(start:Vec3Tuple,end:Vec3Tuple)=>result.push({
        min:start.map((v,i)=>Math.min(v,end[i]!)-pad),max:start.map((v,i)=>Math.max(v,end[i]!)+pad),
        brace:{start,end,thickness},
      });
      // Four diagonal members tie both axes of the tall open stand into its
      // measured legs. Their finite conservative bounds are collision stock;
      // the renderer draws the actual straight members, never stepped boxes.
      for(const sign of [-1,1]) {
        brace([sign*seat.footX,lower,-seat.footZ],[sign*seat.footX,upper,seat.footZ]);
        brace([-seat.footX,lower,sign*seat.footZ],[seat.footX,upper,sign*seat.footZ]);
      }
    }
  }
  return result;
}
const mounts = new WeakMap<MissionCarrierSpec, MissionAttachment>();
const margin = .012;

function primary(plate: SurfacePlate): boolean {
  // Anatomy records hatches/optics separately: they obstruct a seat, never
  // become a convenient tall pedestal selected instead of the real roof.
  return !plate.gunFollow && (!plate.kind || plate.kind === 'main')
    && !/^(hull|turret)_.+_\d+_(front|rear|left|right|top)$/.test(plate.name ?? '');
}
/** Vertical intersection with a finite triangle in its canonical armor frame. */
function triangleHeight(x: number, z: number, a: Vec3Tuple, b: Vec3Tuple, c: Vec3Tuple): number {
  const den = (b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);
  if (Math.abs(den)<1e-8) return -Infinity;
  const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/den;
  const v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/den;
  if(u<0||v<0||u+v>1) return -Infinity;
  return u*a[1]+v*b[1]+(1-u-v)*c[1];
}
function platesFor(spec: MissionCarrierSpec, frame: Frame): readonly SurfacePlate[] {
  return frame === 'hull' ? spec.armor.hullPlates : spec.armor.turretPlates;
}
function surfaceAt(plates: readonly SurfacePlate[], x: number, z: number): number {
  let height=-Infinity;
  for(const plate of plates){
    if(!primary(plate))continue;
    for(let i=1;i<plate.verts.length-1;i++)height=Math.max(height,triangleHeight(x,z,plate.verts[0]!,plate.verts[i]!,plate.verts[i+1]!));
  }
  return height;
}
function carrierSurfaceAt(spec: MissionCarrierSpec,frame: Frame,x: number,z: number): number {
  const cells=spec.armor.collisionShells?.[frame];
  if(!cells?.some(c=>!c.structureKind&&c.vertices?.length))return surfaceAt(platesFor(spec,frame),x,z);
  let height=-Infinity;
  for(const cell of cells){
    if(cell.structureKind||!cell.vertices||!cell.faces)continue;
    for(const face of cell.faces){
      if(face.normal[1]!<=.25)continue;
      const a=cell.vertices[face.indices[0]!]!;
      for(let i=1;i<face.indices.length-1;i++)height=Math.max(height,triangleHeight(x,z,a,cell.vertices[face.indices[i]!]!,cell.vertices[face.indices[i+1]!]!));
    }
  }
  return height;
}
export function hullSurfaceAt(spec: MissionCarrierSpec, x: number, z: number): number { return carrierSurfaceAt(spec,'hull',x,z); }
export function missionAttachmentFrame(spec: MissionCarrierSpec): Frame { return missionAttachmentFor(spec).frame; }
/** The generated equipment inventory records the native rig datum. Some older
 * armor reference pivots differ from their renderer's actual rotating owner. */
export function missionAttachmentTurretPivot(spec:MissionCarrierSpec):Vec3Tuple {
  return auxiliaryCapabilities(spec)?.turretPivot??spec.armor.turretPivot;
}
export function missionSurfaceAt(spec: MissionCarrierSpec, x: number, z: number): number {
  return carrierSurfaceAt(spec,missionAttachmentFrame(spec),x,z);
}
function plateBounds(plate: SurfacePlate): Bounds {
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(const v of plate.verts)for(let i=0;i<3;i++){min[i]=Math.min(min[i]!,v[i]!);max[i]=Math.max(max[i]!,v[i]!);}
  return {min,max};
}
function overlaps(a: Bounds,b: Bounds): boolean {
  if(![0,1,2].every(i=>a.max[i]!+margin>b.min[i]!&&a.min[i]!-margin<b.max[i]!))return false;
  // A sloped armor cell's axis-aligned box contains air. Its outward face
  // planes provide a conservative finite separating-axis rejection.
  for(const face of b.faces??[]){
    let nearest=face.constant;
    for(let i=0;i<3;i++)nearest+=face.normal[i]!*(face.normal[i]!>=0?a.min[i]!-margin:a.max[i]!+margin);
    if(nearest>0)return false;
  }
  return true;
}
function radiusRange(bounds: Bounds, ox=0, oz=0): [number,number] {
  const x0=bounds.min[0]!-ox,x1=bounds.max[0]!-ox,z0=bounds.min[2]!-oz,z1=bounds.max[2]!-oz;
  return [Math.hypot(Math.max(x0,0,-x1),Math.max(z0,0,-z1)),Math.hypot(Math.max(Math.abs(x0),Math.abs(x1)),Math.max(Math.abs(z0),Math.abs(z1)))];
}
function shifted(bounds: Bounds, offset: readonly number[]): Bounds {
  return {min:bounds.min.map((v,i)=>v+offset[i]!),max:bounds.max.map((v,i)=>v+offset[i]!)};
}
// Opposite-owner stock rotates relative to the dock. Its annulus is continuous
// over every turret yaw, not just one friendly showroom pose.
function rotationalOverlap(a: Bounds,b: Bounds): boolean {
  if(a.max[1]!+margin<=b.min[1]!||a.min[1]!-margin>=b.max[1]!)return false;
  const ar=radiusRange(a),br=radiusRange(b);
  return ar[1]+margin>br[0]&&br[1]+margin>ar[0];
}
function bodyBounds(seat:MissionAttachment):Bounds[] {return missionAirframeVolumes(seat).map(bounds=>shifted(bounds,[seat.x,seat.y,seat.z]));}
function stockFor(spec: MissionCarrierSpec,frame: Frame): Bounds[] {
  const cells=spec.armor.collisionShells?.[frame];
  const stock: Bounds[]=cells?.length?[...cells]:platesFor(spec,frame).filter(p=>!p.gunFollow).map(plateBounds);
  // Some older anatomy records omit separate hatch cells but do retain plates.
  for(const p of platesFor(spec,frame))if(!p.gunFollow&&!primary(p))stock.push(plateBounds(p));
  for(const weapon of spec.armor.externalWeapons??[])if((weapon.turretLocal?'turret':'hull')===frame&&!weapon.gunFollow)stock.push(weapon);
  return stock;
}
function rotateQuaternion(point: number[],q: readonly number[]): number[] {
  const [x,y,z]=point,[qx,qy,qz,qw]=q;
  const tx=2*(qy!*z!-qz!*y!),ty=2*(qz!*x!-qx!*z!),tz=2*(qx!*y!-qy!*x!);
  return [x!+qw!*tx+qy!*tz-qz!*ty,y!+qw!*ty+qz!*tx-qx!*tz,z!+qw!*tz+qx!*ty-qy!*tx];
}
type RoofGun = NonNullable<ReturnType<typeof auxiliaryCapabilities>>['guns'][number];
function extendYawCircle(min:number[],max:number[],gun:RoofGun,x:number,y:number,z:number,pitch:number,padding:number):void {
  const c=Math.cos(pitch),s=Math.sin(pitch),py=(y*c+z*s+gun.pivot[1]!)*gun.scale[1]!;
  const r=Math.hypot((x+gun.pivot[0]!)*gun.scale[0]!,(-y*s+z*c+gun.pivot[2]!)*gun.scale[2]!);
  const center=rotateQuaternion([0,py,0],gun.rotation),a=rotateQuaternion([r,0,0],gun.rotation),b=rotateQuaternion([0,0,r],gun.rotation);
  for(let axis=0;axis<3;axis++){
    const extent=Math.hypot(a[axis]!,b[axis]!)+padding;
    min[axis]=Math.min(min[axis]!,gun.position[axis]!+center[axis]!-extent);
    max[axis]=Math.max(max[axis]!,gun.position[axis]!+center[axis]!+extent);
  }
}
function roofPartSweep(gun:RoofGun,part:Bounds,id?:string):Bounds {
  const policy=auxiliaryWeaponProfile(gun.caliberMm,id),range=policy.depressionRad+policy.elevationRad;
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  const radial=Math.hypot(...part.min.map((v,i)=>Math.max(Math.abs(v),Math.abs(part.max[i]!))));
  const steps=Math.ceil(range/.04),padding=2*radial*Math.max(...gun.scale.map(Math.abs))*Math.sin(range/steps/4);
  const corners:number[][]=[];
  for(const x of [part.min[0]!,part.max[0]!])for(const y of [part.min[1]!,part.max[1]!])for(const z of [part.min[2]!,part.max[2]!])corners.push([x,y,z]);
  let radius=0,minY=Infinity,maxY=-Infinity,sweepRadius=0;
  for(let i=0;i<=steps;i++){
    const pitch=-policy.depressionRad+range*i/steps,c=Math.cos(pitch),s=Math.sin(pitch);
    for(const [x,y,z]of corners){
      extendYawCircle(min,max,gun,x!,y!,z!,pitch,padding);
      const py=(y!*c+z!*s+gun.pivot[1]!)*gun.scale[1]!;
      const r=Math.hypot((x!+gun.pivot[0]!)*gun.scale[0]!,(-y!*s+z!*c+gun.pivot[2]!)*gun.scale[2]!);
      radius=Math.max(radius,r);minY=Math.min(minY,py);maxY=Math.max(maxY,py);
      const center=rotateQuaternion([0,py,0],gun.rotation);
      sweepRadius=Math.max(sweepRadius,Math.hypot(gun.position[0]!+center[0]!,gun.position[2]!+center[2]!)+r+padding);
    }
  }
  // Circumscribed yaw cylinder removes empty corners of an axis-aligned
  // square without permitting any actual weapon position through a dock.
  const planes=Array.from({length:16},(_,i)=>{
    const angle=i*Math.PI/8,normal=rotateQuaternion([Math.cos(angle),0,Math.sin(angle)],gun.rotation);
    return {indices:[],normal,constant:-normal.reduce((sum,v,k)=>sum+v*gun.position[k]!,0)-radius-padding};
  });
  for(const sign of[-1,1]){
    const normal=rotateQuaternion([0,sign,0],gun.rotation);
    planes.push({indices:[],normal,constant:-normal.reduce((sum,v,k)=>sum+v*gun.position[k]!,0)-(sign>0?maxY:-minY)-padding});
  }
  return {min,max,faces:planes,sweepRadius};
}
const roofSweepsCache=new WeakMap<MissionCarrierSpec,{owner:Frame;bounds:Bounds}[]>();
function roofGunSweeps(spec: MissionCarrierSpec): {owner:Frame;bounds:Bounds}[] {
  // Local pitch samples include an angular chord bound between samples; each
  // transformed yaw circle has analytic extrema, covering continuous motion.
  const cached=roofSweepsCache.get(spec);if(cached)return cached;
  const result=(auxiliaryCapabilities(spec)?.guns??[]).flatMap(gun=>(gun.collisionParts??[])
    .map(part=>({owner:gun.owner,bounds:roofPartSweep(gun,part,spec.id)})));
  roofSweepsCache.set(spec,result);return result;
}
interface ClearanceStock { hull:Bounds[];turret:Bounds[];guns:ReturnType<typeof roofGunSweeps> }
function clearanceStock(spec: MissionCarrierSpec): ClearanceStock { return {hull:stockFor(spec,'hull'),turret:stockFor(spec,'turret'),guns:roofGunSweeps(spec)}; }
function stockHits(spec:MissionCarrierSpec,seat:MissionAttachment,body:Bounds,frame:Frame,bounds:Bounds):boolean {
  if(frame===seat.frame)return overlaps(body,bounds);
  if(spec.armor.turretless)return false;
  const inversePivot=missionAttachmentTurretPivot(spec).map(v=>-v);
  const a=seat.frame==='hull'?shifted(body,inversePivot):body;
  const b=frame==='hull'?shifted(bounds,inversePivot):bounds;
  if(frame==='turret'&&bounds.sweepRadius!==undefined){
    if(a.max[1]!+margin<=b.min[1]!||a.min[1]!-margin>=b.max[1]!)return false;
    return radiusRange(a)[0]<bounds.sweepRadius+margin;
  }
  return rotationalOverlap(a,b);
}
function volumeClear(spec:MissionCarrierSpec,seat:MissionAttachment,body:Bounds,stock:ClearanceStock):boolean {
  for(const frame of ['hull','turret'] as const)for(const bounds of stock[frame]){
    if(stockHits(spec,seat,body,frame,bounds))return false;
  }
  return !stock.guns.some(gun=>stockHits(spec,seat,body,gun.owner,gun.bounds));
}
function supportClear(spec:MissionCarrierSpec,seat:MissionAttachment,stock:ClearanceStock):boolean {
  const other:Frame=seat.frame==='hull'?'turret':'hull';
  // Cradle contact with its own roof is certified against actual native stock;
  // legacy armor proxies can sit above that roof and cannot test this contact.
  for(const part of missionCradleVolumes(seat)){
    const body=shifted(part,[seat.x,seat.y,seat.z]);
    if(stock[other].some(bounds=>stockHits(spec,seat,body,other,bounds)))return false;
    if(stock.guns.some(gun=>stockHits(spec,seat,body,gun.owner,gun.bounds)))return false;
  }
  return true;
}
function clear(spec:MissionCarrierSpec,seat:MissionAttachment,stock:ClearanceStock):boolean {
  return bodyBounds(seat).every(body=>volumeClear(spec,seat,body,stock))&&supportClear(spec,seat,stock);
}
/** Dynamic weapon clearance. Fixed native stock and supports are certified
 * separately by the generated-seat audit, since armor proxies contain roof air. */
export function missionAttachmentMotionClear(spec:MissionCarrierSpec,seat:MissionAttachment):boolean {
  return missionAttachmentVolumesClear(spec,seat,[...missionAirframeVolumes(seat,true),...missionCradleVolumes(seat)]);
}
/** Auxiliary-motion check for finite receiver members relative to a dock.
 * Actual receiving steel, fixed geometry and main guns remain native checks. */
export function missionAttachmentVolumesClear(spec:MissionCarrierSpec,seat:MissionAttachment,volumes:readonly Bounds[]):boolean {
  const guns=roofGunSweeps(spec);
  return volumes.every(part=>{
    const body=shifted(part,[seat.x,seat.y,seat.z]);
    return !guns.some(gun=>stockHits(spec,seat,body,gun.owner,gun.bounds));
  });
}
/** Public diagnostic uses the same conservative finite volumes as seat selection. */
export function missionAttachmentClear(spec: MissionCarrierSpec,seat: MissionAttachment): boolean { return clear(spec,seat,clearanceStock(spec)); }
function roofBounds(spec:MissionCarrierSpec,frame:Frame):Bounds|null {
  const plates=platesFor(spec,frame).filter(primary);
  if(!plates.length)return null;
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(const plate of plates)for(const v of plate.verts)for(let i=0;i<3;i++){
    min[i]=Math.min(min[i]!,v[i]!);max[i]=Math.max(max[i]!,v[i]!);
  }
  return {min,max};
}
function supportedSeat(spec:MissionCarrierSpec,frame:Frame,x:number,z:number):MissionAttachment|null {
  const {footX,footZ}=DRONE_DOCK_CRADLE,heights=[carrierSurfaceAt(spec,frame,x,z)];
  for(const dx of [-footX,footX])for(const dz of [-footZ,footZ])heights.push(carrierSurfaceAt(spec,frame,x+dx,z+dz));
  const high=Math.max(...heights),low=Math.min(...heights);
  if(!Number.isFinite(low)||high-low>.10)return null;
  return {frame,x,y:high+.045,z,...DRONE_DOCK_CRADLE,supportY:heights.slice(1)};
}
const rearFractions=[.15,.22,.08,.30,.38,.46,.54,.62,.70,.78,.86,...Array.from({length:19},(_,i)=>(i+1)*.05)];
const sideFractions=[.65,.35,.5,.8,.2,.9,.1,...Array.from({length:19},(_,i)=>(i+1)*.05)];
function seatOnFrame(spec:MissionCarrierSpec,frame:Frame,stock:ClearanceStock):MissionAttachment|null {
  const bounds=roofBounds(spec,frame);if(!bounds)return null;
  const {min,max}=bounds;
  // A dense deterministic search never shrinks landing feet to fake a fit.
  for(const rear of rearFractions)for(const side of sideFractions){
    const x=min[0]!+(max[0]!-min[0]!)*side,z=min[2]!+(max[2]!-min[2]!)*rear;
    const seat=supportedSeat(spec,frame,x,z);
    if(seat&&clear(spec,seat,stock))return seat;
  }
  return null;
}
/** Deterministic supported candidates are shared with the offline native audit. */
export function* missionAttachmentCandidates(spec:MissionCarrierSpec):Generator<MissionAttachment> {
  for(const frame of spec.armor.turretless?['hull'] as const:['turret','hull'] as const){
    const bounds=roofBounds(spec,frame);if(!bounds)continue;
    for(const rear of rearFractions)for(const side of sideFractions){
      const seat=supportedSeat(spec,frame,bounds.min[0]!+(bounds.max[0]!-bounds.min[0]!)*side,bounds.min[2]!+(bounds.max[2]!-bounds.min[2]!)*rear);
      if(seat)yield seat;
    }
  }
}
/** Detect stale launch/support datums without importing renderers or builders. */
export function missionAttachmentSignature(spec:MissionCarrierSpec):string {
  const {hullPlates,turretPlates,turretPivot,turretless,collisionShells,externalWeapons}=spec.armor;
  const equipment=auxiliaryCapabilities(spec);
  const geometry=JSON.stringify({version:3,mainGun:{caliber:spec.gun?.caliberMm,depression:spec.gunDepressionDeg,elevation:spec.gunElevationDeg,curve:spec.gunPitchByYawDeg,traverseDeg:spec.gunArcDeg,hydropneumaticAim:spec.hydropneumaticAim},launchHeightM:AERIAL_RULES.drone.launchHeightM,armor:{hullPlates,turretPlates,turretPivot,turretless,collisionShells,externalWeapons},
    weapon:equipment?.guns,nativePivot:equipment?.turretPivot,volumes:DRONE_DOCK_VOLUMES,cradle:DRONE_DOCK_CRADLE});
  let hash=2166136261;
  for(let i=0;i<geometry.length;i++)hash=Math.imul(hash^geometry.charCodeAt(i),16777619);
  return (hash>>>0).toString(16).padStart(8,'0');
}
export function missionAttachmentFootHeight(spec:MissionCarrierSpec,seat:MissionAttachment,index:number):number {
  if(seat.supportY)return seat.supportY[index]!;
  return carrierSurfaceAt(spec,seat.frame,seat.x+(index<2?-seat.footX:seat.footX),seat.z+(index%2?seat.footZ:-seat.footZ));
}
/** Native records share one exact launch/support datum between room and renderer. */
export function missionAttachmentFor(spec: MissionCarrierSpec): MissionAttachment {
  const cached=mounts.get(spec);if(cached)return cached;
  const native=MISSION_ATTACHMENT_SEATS[spec.id??''];
  if(native&&native.signature===missionAttachmentSignature(spec)){
    mounts.set(spec,native);return native;
  }
  // Unregistered development fixtures retain a supported deterministic fallback;
  // the fleet regression and native --check reject missing or stale records.
  const stock=clearanceStock(spec);
  for(const frame of spec.armor.turretless?['hull'] as const:['turret','hull'] as const){
    const seat=seatOnFrame(spec,frame,stock);
    if(seat){mounts.set(spec,seat);return seat;}
  }
  throw new Error(`Mission attachment has no clear supported roof on ${spec.id??'carrier'}`);
}
