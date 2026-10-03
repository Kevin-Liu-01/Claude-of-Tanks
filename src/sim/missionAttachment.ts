// Structural armor input keeps the room rules program independent of fleet builders.
type Vec3Tuple = readonly [number, number, number];

type SurfacePlate = { verts: readonly Vec3Tuple[]; kind?: string; gunFollow?: boolean };
export interface MissionCarrierSpec {
  nation?: string;
  dims: { hullLengthM: number; widthM: number; heightM: number };
  armor: { hullPlates: readonly SurfacePlate[]; turretPlates: readonly SurfacePlate[]; turretPivot: Vec3Tuple; turretless?: boolean };
}
export interface MissionAttachment { frame: 'hull' | 'turret'; x: number; y: number; z: number; width: number; depth: number; footX: number; footZ: number }
const mounts = new WeakMap<MissionCarrierSpec, MissionAttachment>();
const owners=new WeakMap<MissionCarrierSpec,'hull'|'turret'>();
export function missionAttachmentFrame(spec:MissionCarrierSpec):'hull'|'turret'{
 const cached=owners.get(spec);if(cached)return cached;
 let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
 for(const plate of spec.armor.turretPlates){
  if(plate.gunFollow||(plate.kind&&plate.kind!=='main'))continue;
  for(const [x,,z] of plate.verts){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minZ=Math.min(minZ,z);maxZ=Math.max(maxZ,z);}
 }
 const frame=spec.armor.turretless||!Number.isFinite(minX)||(maxX-minX)*(maxZ-minZ)<4.5?'hull':'turret';
 owners.set(spec,frame);return frame;
}

/** Vertical intersection with an actual hull triangle, in the canonical hull frame. */
function triangleHeight(x: number, z: number, a: Vec3Tuple, b: Vec3Tuple, c: Vec3Tuple): number {
  const den = (b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);
  if (Math.abs(den)<1e-8) return -Infinity;
  const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/den;
  const v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/den;
  if(u<0||v<0||u+v>1) return -Infinity;
  return u*a[1]+v*b[1]+(1-u-v)*c[1];
}
function surfaceAt(plates: readonly SurfacePlate[], x: number, z: number): number {
  let height=-Infinity;
  for(const plate of plates){
    if(plate.gunFollow || (plate.kind && plate.kind!=='main'))continue;
    for(let i=1;i<plate.verts.length-1;i++) height=Math.max(height,triangleHeight(x,z,plate.verts[0]!,plate.verts[i]!,plate.verts[i+1]!));
  }
  return height;
}
export function hullSurfaceAt(spec: MissionCarrierSpec, x: number, z: number): number {
  return surfaceAt(spec.armor.hullPlates,x,z);
}
export function missionSurfaceAt(spec: MissionCarrierSpec, x: number, z: number): number {
  return surfaceAt(missionAttachmentFrame(spec)==='hull' ? spec.armor.hullPlates : spec.armor.turretPlates,x,z);
}
/** Turret-local payload seat; compact turrets and fixed casemates use the hull. Feet follow actual armor surfaces. */
export function missionAttachmentFor(spec: MissionCarrierSpec): MissionAttachment {
  const cached=mounts.get(spec);if(cached)return cached;
  const frame=missionAttachmentFrame(spec);
  const plates=frame==='hull'?spec.armor.hullPlates:spec.armor.turretPlates;
  let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
  for(const plate of plates){
    if(plate.gunFollow || (plate.kind && plate.kind!=='main'))continue;
    for(const [x,,z] of plate.verts){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minZ=Math.min(minZ,z);maxZ=Math.max(maxZ,z);}
  }
  // Prefer the rear quarter, away from the gun. Support feet fit the selected
  // turret or hull surface while the payload tray retains its full size.
  for(const footprint of [1,.8,.6,.4])for(const rear of [.22,.3,.4,.5,.6])for(const side of [.68,.5,.32]){
    const x=minX+(maxX-minX)*side,z=minZ+(maxZ-minZ)*rear;
    const footX=.32*footprint,footZ=.4*footprint;
    let y=missionSurfaceAt(spec,x,z),low=y,supported=Number.isFinite(y);
    for(const dx of [-footX,footX])for(const dz of [-footZ,footZ]) {
      const height=missionSurfaceAt(spec,x+dx,z+dz);
      supported=supported&&Number.isFinite(height);y=Math.max(y,height);low=Math.min(low,height);
    }
    if(supported && y-low<.35){
      const mount:MissionAttachment={frame,x,y:y+.12,z,width:.85,depth:1.05,footX,footZ};
      mounts.set(spec,mount);return mount;
    }
  }
  throw new Error('Mission attachment has no supporting '+frame+' surface');
}
export const DRONE_DOCK_HEIGHT_M = .25;
