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

/** Maximum fitted-band slope (drop per metre of run, ~39°) — see the spreading pass below. */
const MAX_FIT_SLOPE=0.8;

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
  halfThickness:number,scratch:ContactScratch,fromOuterFace=false,
  /** stations the end-wheel re-lay already placed on the live wrap / tangent (2026-09-18): the footprint follow
   * never pulls them back toward their authored tire gap; the clearance passes still push them out of a tire */
  pinned:Uint8Array|null=null,
):void {
  const {y,z,drop}=scratch,n=y.length;drop.fill(0);
  for(let i=0;i<n;i++) {
    const base=i*72;
    if(fromOuterFace) {
      // native carriers with an authored inner lining (trackCarrierFromOuterFace): the fitted course is the
      // outer face plus the ORIGINAL nominal half stock, never the lined inner/outer midpoint — a lined and an
      // unlined band must deform identically (merkavaXReturnRollers receipt)
      y[i]=positions[base+7]+(rest[base+19]-rest[base+7])/2;
      z[i]=positions[base+8]+(rest[base+20]-rest[base+8])/2;
    } else {
      y[i]=(positions[base+7]+positions[base+19])/2;
      z[i]=(positions[base+8]+positions[base+20])/2;
    }
  }
  const lower=new Uint8Array(n);
  // 2026-09-17: per-STATION clearance instead of per-span translation. Translating a whole span by its
  // worst violation dragged the axle vertex (already exactly on the tire) down with a flank vertex that
  // needed 1–3 cm, so every drooping wheel showed 1–5 cm of daylight under it. The loaded run now
  // carries flank stations every 0.1 m around each axle (loadedRunStations), so each vertex can sit on
  // its own circle sample; the residual chord sagitta over a 0.1 m station (≤ 3 mm on a 0.4 m tire)
  // is covered by a margin that grows from 0 under the axle to 4 mm at the first flank station.
  for(let i=0;i<n;i++) {
    const base=i*72;
    const restY0=(rest[base+7]+rest[base+19])/2; // rest = the unlined carrier copy, so the midpoint is the nominal carrier
    // 2026-09-18: the end-wheel re-lay moves stations along z as well, so the AUTHORED clearance is read at the rest z
    const restZ0=(rest[base+8]+rest[base+20])/2;
    for(const wheel of wheels) {
      // Never refit the upper return across a road wheel's horizontal span.
      if(restY0>=wheel.y)continue;
      const dz=z[i]-wheel.z;
      const dzRest=restZ0-wheel.z;
      const trueRadius=wheel.r+halfThickness;
      if(Math.abs(dz)>=trueRadius+.004)continue;
      lower[i]=1;
      // chord-sagitta margin: 1 mm at the axle's neighbours growing to 4 mm by 0.1 m out, applied only where the
      // AUTHORED course already clears the tire by more than the margin — the end-wheel wrap arcs sit exactly on
      // the tire circle by design and must not be pushed off it at rest (garage reset restores the authored band
      // byte for byte). Stations are 0.05 m apart around each axle (loadedRunStations), so a chord between two
      // fitted stations dips at most ~1 mm inside the circle; the margin keeps it outside.
      const restUnderside=wheel.y-Math.sqrt(Math.max(0,trueRadius*trueRadius-dzRest*dzRest));
      const restClear=Math.abs(dzRest)<trueRadius?restUnderside-restY0:Infinity;
      const wanted=Math.min(.004,.001+.03*Math.abs(dz));
      const margin=restClear>wanted?wanted:0;
      const radius=trueRadius+margin;
      if(Math.abs(dz)>=radius)continue;
      const underside=wheel.y+(wheel.voff??0)-Math.sqrt(radius*radius-dz*dz);
      const required=y[i]-underside;
      // float32 face means put the parked centreline a few nanometres off its own circle — never deform for that
      if(required>1e-4&&required>drop[i])drop[i]=required;
    }
  }
  // Footprint follow (2026-09-17): the influence field raises the station under a rising wheel one-to-one but
  // its neighbours less, leaving a sharp apex under the axle; a rigid shoe on that apex's flank tilts its far
  // corner up into the tire (Type 10 X compression, 2 mm). Across each tire's footprint the band
  // keeps its authored gap to the tire when the wheel moves TOWARD the hull (negative drop = lift), so the
  // footprint rides up as one piece and blends out through the influence weights beyond it. A parked band
  // (gap == authored gap) is untouched; a station another tire needs pushed down is never lifted.
  for(let i=0;i<n;i++) {
    if(drop[i]>0||(pinned&&pinned[i]))continue;
    const base=i*72;
    const restY0=(rest[base+7]+rest[base+19])/2;
    const restZ0=(rest[base+8]+rest[base+20])/2;
    for(const wheel of wheels) {
      if(restY0>=wheel.y)continue;
      const dz=z[i]-wheel.z;
      const dzRest=restZ0-wheel.z;
      const trueRadius=wheel.r+halfThickness;
      if(Math.abs(dz)>=trueRadius||Math.abs(dzRest)>=trueRadius)continue;
      const chord=Math.sqrt(trueRadius*trueRadius-dz*dz);
      const chordRest=Math.sqrt(trueRadius*trueRadius-dzRest*dzRest);
      const gapRest=(wheel.y-chordRest)-restY0;
      const gapNow=(wheel.y+(wheel.voff??0)-chord)-(y[i]-drop[i]);
      // blend the follow out to nothing at the footprint edge — a rigid translation of the whole footprint left a
      // step at its edge and the rigid shoe astride it tilted its far corner 3 cm into the tire (Type 10 X)
      const falloff=1-(dz*dz)/(trueRadius*trueRadius);
      let lift=(gapNow-gapRest)*falloff;
      if(!(lift>1e-4&&lift<.08))continue;
      // never lift a station into another tire (interleaved rigs share stations between overlapping footprints)
      for(const other of wheels) {
        const odz=z[i]-other.z, oR=other.r+halfThickness;
        if(other===wheel||Math.abs(odz)>=oR)continue;
        const room=(other.y+(other.voff??0)-Math.sqrt(oR*oR-odz*odz))-(y[i]-drop[i])-1e-4;
        if(room<lift)lift=room;
      }
      if(lift>1e-4&&-lift<drop[i])drop[i]=-lift;
    }
  }
  // Chord pass (2026-09-17): a straight span can still enter a tire from its SIDE even when both of its
  // stations clear the circle — the near-vertical ramp behind a drooping outer wheel crosses the tire's
  // rear flank between the last station inside the wheel's footprint and the first one outside it. For
  // every lower-half span, the exact chord-vs-circle violation (loadedSpanDrop) translates both stations
  // down, except a station directly under an axle, which stays on its tire (no daylight there; the
  // axle-adjacent chord dips at most the 5 cm-station sagitta, ~1 mm).
  for(let i=0;i<n;i++) {
    const j=(i+1)%n;
    if(!lower[i]&&!lower[j])continue;
    for(const wheel of wheels) {
      const wy=wheel.y+(wheel.voff??0);
      const required=loadedSpanDrop(z[i],y[i]-drop[i],z[j],y[j]-drop[j],wheel.z,wy,wheel.r+halfThickness);
      // the authored wrap arcs' 1–4° chords sit ≤ 0.5 mm inside the true circle by construction — a parked band must
      // come out of the fit byte-identical, so only real (≥ 1 mm) chord cuts move stations
      if(required<=1e-3)continue;
      if(Math.abs(z[i]-wheel.z)>=.03)drop[i]+=required;
      if(Math.abs(z[j]-wheel.z)>=.03)drop[j]+=required;
      lower[i]=1;lower[j]=1;
    }
  }
  // Spread each drop along the lower run so the fitted band bends no steeper than MAX_FIT_SLOPE
  // (2026-09-14): with the loaded run wrapping the outer road wheels, a wheel at full droop pulled
  // the short wrap cells straight down and the band rejoined the fixed ramp at a sharp kink; a rigid
  // shoe straddling that kink cut 8 mm into the tire it had been fitted around (Type 10 X wave
  // fixture). Two alternating passes bound the slope in both directions; cells of the upper return
  // never take a drop.
  for(let pass=0;pass<2;pass++)for(let step=0;step<n;step++) {
    const i=pass?n-1-step:step,j=(i+1)%n;
    if(!lower[i]||!lower[j])continue;
    const limit=MAX_FIT_SLOPE*Math.hypot(z[j]-z[i],y[j]-y[i]);
    if(drop[j]>drop[i]+limit)drop[i]=drop[j]-limit;
    if(drop[i]>drop[j]+limit)drop[j]=drop[i]-limit;
  }
  for(let i=0;i<n;i++)for(let k=0;k<24;k++) {
    positions[i*72+k*3+1]-=drop[TRACK_BAND_ENDPOINT_ONE[k]?(i+1)%n:i];
  }
}
