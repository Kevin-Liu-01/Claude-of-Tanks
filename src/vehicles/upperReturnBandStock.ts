import * as THREE from 'three';
import type {TankBuilderPort} from './tankFactoryCore.ts';

/** Thicken the existing closed upper-return band inward at its support
 * frames. End crowns taper to zero; outer tread, wraps and lower stock are
 * unchanged. Native suspension only rewrites the lower-course vertices, so
 * this authored stock needs no animation wrapper or per-frame allocation.
 * Pair with trackCarrierFromOuterFace to preserve the original shoe course. */
export function lineUpperReturnBand(P: Pick<TankBuilderPort,'hullG'>, stations: readonly number[], depthM: number) {
  const usesNext=[1,1,0,1,0,0,0,0,1,0,1,1,0,1,1,0,1,0,0,0,1,0,1,1];
  const innerSlots=[6,7,8,9,10,11,14,16,17,19,20,22];
  for(const name of ['gearTrackBandL','gearTrackBandR']) {
    const band=P.hullG.getObjectByName(name);
    if(!(band instanceof THREE.Mesh))throw new Error('Upper lining requires its native band');
    const p=band.geometry.getAttribute('position'),count=p.count/24;
    const selected=stations.map(()=>({frame:-1,y:-Infinity}));
    for(let frame=0;frame<count;frame++) {
      const base=frame*24,y=(p.getY(base+2)+p.getY(base+6))/2,z=(p.getZ(base+2)+p.getZ(base+6))/2;
      for(let s=0;s<stations.length;s++)if(Math.abs(z-stations[s])<2e-6&&y>selected[s].y)
        selected[s]={frame,y};
    }
    const shift=Array.from({length:count},()=>({y:0,z:0}));
    for(const {frame} of selected)if(frame>=0) {
      const base=frame*24,dy=p.getY(base+6)-p.getY(base+2),dz=p.getZ(base+6)-p.getZ(base+2);
      const length=Math.hypot(dy,dz);
      shift[frame]={y:dy/length*depthM,z:dz/length*depthM};
    }
    for(let frame=0;frame<count;frame++)for(const slot of innerSlots) {
      const delta=shift[(frame+usesNext[slot])%count],vertex=frame*24+slot;
      p.setY(vertex,p.getY(vertex)+delta.y);p.setZ(vertex,p.getZ(vertex)+delta.z);
    }
    p.needsUpdate=true;band.geometry.computeVertexNormals();
    band.geometry.computeBoundingBox();band.geometry.computeBoundingSphere();
  }
}
