// Analytic tangent fillets for a measured native track course. No source mesh
// points enter this helper. Only new profiles opt in; old fleet paths stay exact.
type Point = [number, number];

/** Replace a sharp ground/approach knee by a circular rolling tangent. A rigid
 * shoe straddling a sharp knee otherwise drives its leading corner underground.
 * The same returned course must drive BOTH the carrier band and animated shoes. */
export function roundedTrackContact(points: readonly Point[], groundY:number,
  radiusM:number):Point[] {
  if (!Number.isFinite(radiusM) || radiusM <= 0 || radiusM > 1)
    throw new RangeError('Ground rolling radius must be in (0,1] metres');
  const output:Point[]=[];
  for(let i=0;i<points.length;i++) {
    const p=points[i],a=points[(i+points.length-1)%points.length],b=points[(i+1)%points.length];
    const ground=Math.abs(p[1]-groundY)<1e-7;
    const enters= a[1]>groundY+1e-5 && Math.abs(b[1]-groundY)<1e-7;
    const leaves= b[1]>groundY+1e-5 && Math.abs(a[1]-groundY)<1e-7;
    if(!ground || !(enters||leaves)){output.push([...p]);continue;}
    const la=Math.hypot(p[0]-a[0],p[1]-a[1]),lb=Math.hypot(b[0]-p[0],b[1]-p[1]);
    const u=[(p[0]-a[0])/la,(p[1]-a[1])/la],v=[(b[0]-p[0])/lb,(b[1]-p[1])/lb];
    const turn=Math.atan2(u[0]*v[1]-u[1]*v[0],u[0]*v[0]+u[1]*v[1]);
    const tangent=radiusM*Math.tan(Math.abs(turn)/2);
    if(tangent>=Math.min(la,lb)*.95)throw new RangeError('Rolling tangent exceeds its adjacent measured span');
    const first:Point=[p[0]-u[0]*tangent,p[1]-u[1]*tangent];
    const sign=Math.sign(turn),cx=first[0]-sign*u[1]*radiusM,cy=first[1]+sign*u[0]*radiusM;
    const start=Math.atan2(first[1]-cy,first[0]-cx),steps=Math.max(3,Math.ceil(Math.abs(turn)/.04));
    for(let k=0;k<=steps;k++) {
      const angle=start+turn*k/steps;
      output.push([cx+radiusM*Math.cos(angle),cy+radiusM*Math.sin(angle)]);
    }
  }
  return output;
}
