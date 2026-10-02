import type { ArmorEnvelope, Vec3Tuple } from '../vehicles/specHelpers.ts';

export interface MissionCarrierSpec {
  dims: { hullLengthM: number; widthM: number; heightM: number };
  armor: Pick<ArmorEnvelope, 'hullPlates'>;
}
export interface MissionAttachment { x: number; y: number; z: number; width: number; depth: number }
const mounts = new WeakMap<MissionCarrierSpec, MissionAttachment>();

/** Vertical intersection with an actual hull triangle, in the canonical hull frame. */
function triangleHeight(x: number, z: number, a: Vec3Tuple, b: Vec3Tuple, c: Vec3Tuple): number {
  const den = (b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);
  if (Math.abs(den)<1e-8) return -Infinity;
  const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/den;
  const v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/den;
  if(u<0||v<0||u+v>1) return -Infinity;
  return u*a[1]+v*b[1]+(1-u-v)*c[1];
}
export function hullSurfaceAt(spec: MissionCarrierSpec, x: number, z: number): number {
  let height=-Infinity;
  for(const plate of spec.armor.hullPlates){
    for(let i=1;i<plate.verts.length-1;i++) height=Math.max(height,triangleHeight(x,z,plate.verts[0]!,plate.verts[i]!,plate.verts[i+1]!));
  }
  return height;
}
/** Reusable mission payload rail, aft of the turret, seated on the carrier's own hull. */
export function missionAttachmentFor(spec: MissionCarrierSpec): MissionAttachment {
  const cached=mounts.get(spec);if(cached)return cached;
  // All four mounting feet need real support; accommodate tapered rear hulls.
  for(const rear of [.36,.3,.24]) {
    const x=spec.dims.widthM*.22,z=-spec.dims.hullLengthM*rear;
    let y=hullSurfaceAt(spec,x,z),supported=Number.isFinite(y);
    for(const dx of [-.32,.32])for(const dz of [-.4,.4]) {
      const height=hullSurfaceAt(spec,x+dx,z+dz);
      supported=supported&&Number.isFinite(height);y=Math.max(y,height);
    }
    if(supported){const mount={x,y:y+.12,z,width:.85,depth:1.05};mounts.set(spec,mount);return mount;}
  }
  throw new Error('Mission attachment has no supporting hull surface');
}
export const DRONE_DOCK_HEIGHT_M = .25;
