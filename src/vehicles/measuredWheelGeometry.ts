import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Axial coordinate is local X. Separate bands retain true inter-tire air. */
export interface MeasuredTireBand {
  centerM: number;
  widthM: number;
  innerRadiusM: number;
}

export function measuredTireBands(
  bands: readonly MeasuredTireBand[], radius: number, axleWidth: number, segments: number,
): THREE.BufferGeometry {
  if (!Array.isArray(bands) || bands.length < 1 || bands.length > 4)
    throw new RangeError('Measured tire bands require one to four physical rings');
  const ordered = bands.map(b => ({ ...b })).sort((a,b) => a.centerM-b.centerM);
  for (const [i,b] of ordered.entries()) {
    if (![b.centerM,b.widthM,b.innerRadiusM].every(Number.isFinite)
      || b.widthM<=0 || b.innerRadiusM<=0 || b.innerRadiusM>=radius
      || Math.abs(b.centerM)+b.widthM/2>axleWidth/2+1e-6
      || (i>0 && b.centerM-b.widthM/2<ordered[i-1].centerM+ordered[i-1].widthM/2-1e-6))
      throw new RangeError('Measured tire bands must be finite, inside the axle span and nonoverlapping');
  }
  const parts=ordered.map(b=>new THREE.LatheGeometry([
    [b.innerRadiusM,-b.widthM/2],[radius,-b.widthM/2],[radius,b.widthM/2],
    [b.innerRadiusM,b.widthM/2],[b.innerRadiusM,-b.widthM/2],
  ].map(([r,y])=>new THREE.Vector2(r,y)),segments).rotateZ(Math.PI/2).translate(b.centerM,0,0));
  const merged=mergeGeometries(parts);
  for(const part of parts)part.dispose();
  if(!merged)throw new Error('Measured tire bands could not form a native wheel');
  return merged;
}

/** A supplied first-party core replaces the generic injected dish, never the
 * axle, station count or articulation. Reject empty/infinite fake geometry. */
export function validateMeasuredWheelCore(geometry: THREE.BufferGeometry): void {
  const p=geometry?.getAttribute('position');
  if(!p||p.count<12)throw new RangeError('Measured wheel core must contain physical geometry');
  for(let i=0;i<p.count;i++)if(![p.getX(i),p.getY(i),p.getZ(i)].every(Number.isFinite))
    throw new RangeError('Measured wheel core must have finite vertices');
  geometry.computeBoundingBox();
  const size=geometry.boundingBox!.getSize(new THREE.Vector3());
  if(Math.min(size.x,size.y,size.z)<=0)throw new RangeError('Measured wheel core must be a three-dimensional solid');
}

interface WheelSolids {
  tire: THREE.BufferGeometry | null;
  disc: THREE.BufferGeometry;
  dark: THREE.BufferGeometry | null;
}
interface MeasuredWheelOptions {
  wheelTireBands?: readonly MeasuredTireBand[];
  wheelTireInnerRadiusM?: number;
  wheelCoreGeometry?: {disc:THREE.BufferGeometry;dark?:THREE.BufferGeometry|null};
}

export function replaceMeasuredWheelSolids(solids:WheelSolids,cfg:MeasuredWheelOptions,
  radius:number,width:number,segments:number):WheelSolids {
  let {tire,disc,dark}=solids;
  if(cfg.wheelTireBands) {
    if(!tire||cfg.wheelTireInnerRadiusM!==undefined)
      throw new RangeError('Measured tire bands require a rubber wheel and no competing tire opening');
    const rings=measuredTireBands(cfg.wheelTireBands,radius,width,segments);
    tire.dispose();tire=rings;
  }
  if(cfg.wheelCoreGeometry) {
    validateMeasuredWheelCore(cfg.wheelCoreGeometry.disc);
    if(cfg.wheelCoreGeometry.dark)validateMeasuredWheelCore(cfg.wheelCoreGeometry.dark);
    disc.dispose();dark?.dispose();
    disc=cfg.wheelCoreGeometry.disc;dark=cfg.wheelCoreGeometry.dark??null;
  }
  if(cfg.wheelTireInnerRadiusM!==undefined) {
    const inner=cfg.wheelTireInnerRadiusM;
    if(!tire||!Number.isFinite(inner)||inner<=0||inner>=radius)
      throw new RangeError('Measured tire opening must be positive and smaller than its rubber radius');
    tire.dispose();
    tire=new THREE.LatheGeometry([[inner,-width/2],[radius,-width/2],
      [radius,width/2],[inner,width/2],[inner,-width/2]]
      .map(([r,y])=>new THREE.Vector2(r,y)),segments).rotateZ(Math.PI/2);
  }
  return {tire,disc,dark};
}

interface AxialLayer {geometry:THREE.BufferGeometry;side?:-1|1;outset?:number}
function sideBackDepth(side:-1|1,solids:WheelSolids,layers:readonly AxialLayer[]):number {
  let depth=0;
  for(const geometry of[solids.tire,solids.disc,solids.dark])if(geometry) {
    geometry.computeBoundingBox();const b=geometry.boundingBox!;
    depth=Math.max(depth,side<0?b.max.x:-b.min.x);
  }
  for(const layer of layers)if(layer.side===undefined||layer.side===side) {
    layer.geometry.computeBoundingBox();const b=layer.geometry.boundingBox!;
    depth=Math.max(depth,(side<0?b.max.x:-b.min.x)-(layer.outset??0));
  }
  return depth;
}
export function measuredWheelBackDepth(enabled:boolean,legacyDepth:number,
  solids:WheelSolids,layers:readonly AxialLayer[]):Record<-1|1,number> {
  const back={[-1]:legacyDepth,[1]:legacyDepth};
  if(!enabled)return back;
  for(const side of[-1,1] as const)back[side]=sideBackDepth(side,solids,layers);
  return back;
}
