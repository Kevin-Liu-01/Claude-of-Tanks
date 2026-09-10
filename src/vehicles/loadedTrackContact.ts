/** Downward translation that keeps a complete finite straight span below a
 * circular road-wheel envelope. Solve the minimum of the lower semicircle
 * minus the line analytically, not with sampled points at the axles. */
export function loadedSpanDrop(
  z0:number,y0:number,z1:number,y1:number,wheelZ:number,wheelY:number,radius:number,
):number {
  const lo=Math.max(Math.min(z0,z1),wheelZ-radius);
  const hi=Math.min(Math.max(z0,z1),wheelZ+radius);
  if(lo>=hi||Math.abs(z1-z0)<1e-10)return 0;
  const slope=(y1-y0)/(z1-z0);
  const z=Math.max(lo,Math.min(hi,wheelZ+slope*radius/Math.hypot(1,slope)));
  const underside=wheelY-Math.sqrt(Math.max(0,radius*radius-(z-wheelZ)**2));
  return Math.max(0,y0+slope*(z-z0)-underside);
}

interface RoadContact {z:number;y:number;r:number;voff?:number;}
interface Positions {readonly length:number;[index:number]:number;}
interface ContactScratch {y:Float64Array;z:Float64Array;drop:Float64Array;}

export function loadedContactScratch(pointCount:number):ContactScratch {
  return {y:new Float64Array(pointCount),z:new Float64Array(pointCount),drop:new Float64Array(pointCount)};
}

// The 24 vertices per native carrier cell duplicate its two cross-sections.
export const TRACK_BAND_ENDPOINT_ONE=[
  1,1,0,1,0,0, // outer: f1/f1/f0, f1/f0/f0
  0,0,1,0,1,1, // inner: f0/f0/f1, f0/f1/f1
  0,1,1,0,1,0, // +X: f0/f1/f1, f0/f1/f0
  0,0,1,0,1,1, // -X: f0/f0/f1, f0/f1/f1
];

/** Opt-in native-band repair; scratch is constructor-owned and reused. Both
 * endpoints receive each span's required drop. A neighbouring span may move
 * either endpoint further down, which cannot violate a lower-half contact
 * constraint. The shared duplicate sections move together, retaining finite
 * thickness; native shoes subsequently sample this same deformed course. */
export function fitLoadedTrackContact(
  positions:Positions,rest:Positions,wheels:readonly RoadContact[],
  halfThickness:number,scratch:ContactScratch,
):void {
  const {y,z,drop}=scratch,n=y.length;drop.fill(0);
  for(let i=0;i<n;i++) {
    const base=i*72;
    y[i]=(positions[base+7]+positions[base+19])/2;
    z[i]=(positions[base+8]+positions[base+20])/2;
  }
  for(let i=0;i<n;i++) {
    const j=(i+1)%n,base=i*72;
    const restY0=(rest[base+7]+rest[base+19])/2;
    const restY1=(rest[base+1]+rest[base+25])/2;
    for(const wheel of wheels) {
      // Never refit the upper return across a road wheel's horizontal span.
      if(restY0>=wheel.y&&restY1>=wheel.y)continue;
      const required=loadedSpanDrop(z[i],y[i],z[j],y[j],wheel.z,
        wheel.y+(wheel.voff??0),wheel.r+halfThickness+.001);
      drop[i]=Math.max(drop[i],required);drop[j]=Math.max(drop[j],required);
    }
  }
  for(let i=0;i<n;i++)for(let k=0;k<24;k++) {
    positions[i*72+k*3+1]-=drop[TRACK_BAND_ENDPOINT_ONE[k]?(i+1)%n:i];
  }
}
