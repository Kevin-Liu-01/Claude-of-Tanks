import * as THREE from 'three';
import type {TankBuilderPort} from './tankFactoryCore.ts';

/** Thicken the existing closed upper-return band inward at its support
 * frames. End crowns taper to zero; outer tread, wraps and lower stock are
 * unchanged. Native suspension only rewrites the lower-course vertices, so
 * this authored stock needs no animation wrapper or per-frame allocation.
 * Pair with trackCarrierFromOuterFace to preserve the original shoe course. */
export function lineUpperReturnBand(P: Pick<TankBuilderPort,'hullG'>, stations: readonly number[], depthM: number) {
  if(!Number.isFinite(depthM)||depthM<=0)throw new RangeError('Upper lining depth must be finite and positive');
  if(!stations.length||stations.some(z=>!Number.isFinite(z))||new Set(stations).size!==stations.length)
    throw new RangeError('Upper lining stations must be nonempty, finite and distinct');
  const usesNext=[1,1,0,1,0,0,0,0,1,0,1,1,0,1,1,0,1,0,0,0,1,0,1,1];
  const innerSlots=[6,7,8,9,10,11,14,16,17,19,20,22];
  // Preflight both native bands before changing either owned buffer.
  const plans=['gearTrackBandL','gearTrackBandR'].map(name=>{
    const band=P.hullG.getObjectByName(name);
    if(!(band instanceof THREE.Mesh))throw new Error('Upper lining requires its native band');
    const p=band.geometry.getAttribute('position');
    if(!(p instanceof THREE.BufferAttribute)||p.itemSize!==3||p.count<24||p.count%24!==0)
      throw new Error('Upper lining requires the native 24-vertex band cells');
    const count=p.count/24;
    const selected=stations.map(()=>({frame:-1,y:-Infinity}));
    for(let frame=0;frame<count;frame++) {
      const base=frame*24,y=(p.getY(base+2)+p.getY(base+6))/2,z=(p.getZ(base+2)+p.getZ(base+6))/2;
      for(let s=0;s<stations.length;s++)if(Math.abs(z-stations[s])<2e-6&&y>selected[s].y)
        selected[s]={frame,y};
    }
    if(selected.some(s=>s.frame<0)||new Set(selected.map(s=>s.frame)).size!==stations.length)
      throw new Error('Every upper lining station must resolve to its own native frame');
    const shift=Array.from({length:count},()=>({y:0,z:0}));
    for(const {frame} of selected) {
      const base=frame*24,dy=p.getY(base+6)-p.getY(base+2),dz=p.getZ(base+6)-p.getZ(base+2);
      const length=Math.hypot(dy,dz);
      if(!Number.isFinite(length)||length<=1e-7)throw new Error('Upper lining requires finite nonzero stock normals');
      shift[frame]={y:dy/length*depthM,z:dz/length*depthM};
    }
    return {band,p,count,shift};
  });
  for(const {band,p,count,shift} of plans) {
    for(let frame=0;frame<count;frame++)for(const slot of innerSlots) {
      const delta=shift[(frame+usesNext[slot])%count],vertex=frame*24+slot;
      p.setY(vertex,p.getY(vertex)+delta.y);p.setZ(vertex,p.getZ(vertex)+delta.z);
    }
    p.needsUpdate=true;band.geometry.computeVertexNormals();
    band.geometry.computeBoundingBox();band.geometry.computeBoundingSphere();
  }
}
