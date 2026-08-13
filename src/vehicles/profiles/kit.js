// Shared profile-building machinery for the per-family procedural modules in
// this directory. Family modules own their PROFILE DATA and any family-only
// kit/build functions; everything generic (hull styles, turret styles, the
// donor mechanism, the family templates) lives here so two family agents
// never have to edit the same file.
//
// These are original primitive reconstructions informed by normalized local
// reference renders and real vehicle dimensions. They intentionally do not
// contain, decode, or reproduce source mesh topology.
import { KIT } from '../tankFactory.js';

export { KIT };

export const evenStations = (count, span, bias = 0) => Array.from({ length:count }, (_, i) =>
  count === 1 ? bias : span / 2 - i * (span / (count - 1)) + bias);

export function addSegmentedSkirts(P, width, length, y, height, panels = 6) {
  const { box } = KIT;
  const panelD = length / panels;
  for (const side of [-1, 1]) {
    for (let i=0; i<panels; i++) {
      const z=length/2-panelD/2-i*panelD;
      P.add('hull',box(0.045,height,panelD*0.96),side*width/2,y,z);
      P.add('hullDark',box(0.052,height*0.90,0.018),side*(width/2+0.004),y,z-panelD/2);
    }
    // shaded-parity r2 (russia root-cause): the rubber lip's thin sunlit top
    // face rendered as a salmon stripe above the fenders on every family
    // using these skirts. Dark bucket, inset behind the panel face, and no
    // exposed top face under the board key.
    P.add('hullDark',box(0.02,0.06,length*0.98),side*(width/2-0.004),y-height/2-0.02,0);
  }
}

export function addEra(P, width, frontZ, roofY, rows = 2) {
  const { box } = KIT;
  const cols=7;
  for (let row=0; row<rows; row++) for (let col=0; col<cols; col++) {
    const x=(col-(cols-1)/2)*(width*0.82/cols);
    P.add('hullDetail',box(width*0.70/cols,0.07,0.22),x,roofY+0.04-row*0.08,frontZ-row*0.26,-0.20,0,0);
  }
}

export function buildHull(P,p) {
  const { box,cylY,cylZ,torus,frustum,buildRunningGear,fenders,headlight,towCable }=KIT;
  const d=P.spec.dims;
  const width=p.width || d.widthM;
  const length=p.hullLength || d.hullLengthM;
  const halfL=length/2;
  const roofY=p.roofY || Math.max(1.18,P.spec.armor.turretPivot[1]-0.04);
  const trackTop=p.trackTop || roofY*0.59;
  const trackW=p.trackW || P.spec.visual.trackWidthM || width*0.16;
  const innerW=Math.max(width-trackW*1.95,width*0.58);
  const lowerH=Math.max(0.46,trackTop*0.76);
  const style=p.hull || 'western';

  P.add('hull',box(innerW,lowerH,length*0.91),0,0.22+lowerH/2,0);
  fenders(P,innerW/2,width/2+0.02,Math.min(roofY-0.16,trackTop+0.25),-halfL*0.96,halfL*0.94,0.025);

  if (style === 'merkava') {
    P.add('hull',box(width*0.86,roofY-trackTop,length*0.60),0,trackTop+(roofY-trackTop)/2,-halfL*0.19);
    P.add('hull',frustum(width*0.47,halfL*0.96,halfL*0.02,width*0.40,halfL*0.50,-halfL*0.02,
      trackTop,roofY));
    P.add('hull',frustum(width*0.42,halfL*0.74,halfL*0.98,width*0.48,halfL*0.98,halfL*0.98,
      0.35,trackTop));
    P.add('hullDetail',box(width*0.36,0.035,length*0.22),width*0.18,roofY+0.025,halfL*0.14);
  } else if (style === 'soviet') {
    P.add('hull',box(width*0.86,roofY-trackTop,length*0.61),0,trackTop+(roofY-trackTop)/2,-halfL*0.18);
    P.add('hull',frustum(width*0.47,halfL*0.96,halfL*0.06,width*0.40,halfL*0.42,0,
      trackTop*0.96,roofY));
    P.add('hull',frustum(width*0.39,halfL*0.77,halfL*0.98,width*0.47,halfL*0.98,halfL*0.98,
      0.31,trackTop*0.96));
    if (p.era) addEra(P,width,halfL*0.48,roofY,p.eraRows || 2);
  } else if (style === 'type90') {
    // Type 90: low two-level engine deck, very shallow glacis and broad
    // fender shoulders.  The old generic western hull was almost a metre too
    // tall at the nose and read as a rectangular troop carrier in profile.
    P.add('hull',box(width*0.82,roofY-trackTop,length*0.52),0,trackTop+(roofY-trackTop)/2,-halfL*0.23);
    P.add('hull',frustum(width*0.47,halfL*0.98,halfL*0.02,width*0.38,halfL*0.48,halfL*0.02,
      trackTop*0.78,roofY));
    P.add('hull',frustum(width*0.40,halfL*0.81,halfL*0.98,width*0.47,halfL*0.98,halfL*0.98,
      0.31,trackTop*0.80));
    P.add('hull',box(width*0.94,0.11,length*0.43),0,trackTop+0.17,-halfL*0.22);
    P.add('hullDetail',box(width*0.32,0.035,length*0.26),-width*0.18,roofY+0.025,halfL*0.15);
  } else if (style === 'warrior') {
    // FV510 Warrior: tall but strongly chamfered troop hull, a long shallow
    // glacis and a near-vertical rear door.  A single full-height box erased
    // all three of those cues and hid the complete six-wheel suspension.
    P.add('hull',frustum(width*0.46,halfL*0.46,-halfL*0.94,width*0.39,halfL*0.34,-halfL*0.91,
      trackTop*0.93,roofY));
    P.add('hull',frustum(width*0.46,halfL*0.97,halfL*0.31,width*0.38,halfL*0.46,halfL*0.27,
      trackTop*0.72,roofY));
    P.add('hull',frustum(width*0.41,halfL*0.81,halfL*0.98,width*0.46,halfL*0.98,halfL*0.98,
      0.30,trackTop*0.78));
    P.add('hull',box(width*0.92,0.12,length*0.61),0,trackTop+0.17,-halfL*0.12);
    P.add('hullDetail',box(width*0.56,roofY*0.58,0.045),0,roofY*0.61,-halfL*0.985);
    P.add('hullDark',box(width*0.23,roofY*0.44,0.052),0,roofY*0.59,-halfL*0.995);
  } else if (style === 'ifv') {
    P.add('hull',box(width*0.86,roofY-trackTop,length*0.69),0,trackTop+(roofY-trackTop)/2,-halfL*0.12);
    P.add('hull',frustum(width*0.46,halfL*0.98,halfL*0.16,width*0.40,halfL*0.55,halfL*0.04,
      trackTop*0.82,roofY));
    P.add('hull',box(width*0.80,roofY*0.56,0.10),0,roofY*0.62,-halfL*0.96);
  } else if (style === 'classic') {
    P.add('hull',box(width*0.88,roofY-trackTop,length*0.58),0,trackTop+(roofY-trackTop)/2,-halfL*0.18);
    P.add('hull',frustum(width*0.47,halfL*0.96,halfL*0.03,width*0.39,halfL*0.42,-halfL*0.02,
      trackTop,roofY));
    P.add('hull',frustum(width*0.39,halfL*0.78,halfL*0.98,width*0.47,halfL*0.98,halfL*0.98,
      0.30,trackTop));
  } else if (style === 'casemate') {
    P.add('hull',box(width*0.88,roofY-trackTop,length*0.58),0,trackTop+(roofY-trackTop)/2,-halfL*0.16);
    P.add('hull',frustum(width*0.47,halfL*0.98,halfL*0.08,width*0.40,halfL*0.48,0,
      trackTop,Math.min(roofY,trackTop+0.42)));
    const cW=p.casemateWidth || width*0.72;
    const cH=p.casemateHeight || Math.max(0.62,roofY-trackTop+0.28);
    const cD=p.casemateDepth || length*0.48;
    P.add('hull',frustum(cW/2,cD*0.48,-cD*0.52,cW*0.44,cD*0.35,-cD*0.46,
      roofY-cH,roofY));
    if (p.casemateRoof) P.add('hullDetail',box(cW*0.82,0.035,cD*0.72),0,roofY+0.025,-cD*0.08);
  } else {
    P.add('hull',box(width*0.87,roofY-trackTop,length*0.64),0,trackTop+(roofY-trackTop)/2,-halfL*0.16);
    P.add('hull',frustum(width*0.47,halfL*0.97,halfL*0.06,width*0.41,halfL*0.42,0,
      trackTop,roofY));
    P.add('hull',frustum(width*0.40,halfL*0.77,halfL*0.98,width*0.47,halfL*0.98,halfL*0.98,
      0.34,trackTop));
  }

  P.add('hull',box(width*0.82,Math.max(0.30,roofY-trackTop),0.10),0,trackTop+(roofY-trackTop)/2,-halfL*0.96);
  P.add('hullDark',box(width*0.49,0.025,length*0.18),0,roofY+0.025,-halfL*0.66);
  for (let i=0;i<4;i++) P.add('hullDetail',box(width*0.46,0.025,0.045),0,roofY+0.04,-halfL*(0.78-i*0.075));

  // Family-specific deck furniture. These remain in the existing merged
  // material buckets, so a much richer close-up does not add draw calls.
  if (style === 'merkava') {
    // Front-mounted powerpack: offset louvre bank, intake lip and the rear
    // troop/ammunition hatch that distinguish a Merkava hull in side view.
    P.add('hullDark',box(width*0.31,0.025,length*0.19),width*0.20,roofY+0.035,halfL*0.34);
    for (let i=0;i<7;i++) P.add('hullDetail',box(width*0.28,0.032,0.032),width*0.20,roofY+0.055,halfL*(0.48-i*0.052));
    P.add('hull',box(width*0.32,0.12,0.16),-width*0.18,roofY+0.06,halfL*0.23,-0.18,0,0);
    P.add('hullDark',box(width*0.34,roofY*0.38,0.025),0,roofY*0.64,-halfL*0.985);
    P.add('hullDetail',box(width*0.36,0.035,0.05),0,roofY*0.83,-halfL*0.995);
  } else if (style === 'soviet') {
    // Circular driver hatch/periscopes, transverse engine grilles and the
    // familiar right-fender external fuel/stowage run.
    P.add('hull',cylY(0.25,0.25,0.045,16),0,roofY+0.03,halfL*0.27);
    for (const x of [-0.18,0,0.18]) P.add('hullDark',box(0.12,0.04,0.035),x,roofY+0.075,halfL*0.38);
    for (let i=0;i<6;i++) P.add('hullDetail',box(width*0.42,0.028,0.045),0,roofY+0.05,-halfL*(0.40+i*0.07));
    P.add('hull',box(0.34,0.18,length*0.30),width*0.40,roofY-0.07,-halfL*0.20);
    P.add('hullDark',cylZ(0.075,length*0.23,10),-width*0.39,roofY+0.09,-halfL*0.28,Math.PI/2,0,0);
  } else if (style === 'type90') {
    // The Japanese tank's rear deck is dominated by two rectangular cooling
    // banks and a transverse louvre row; the driver sits front-left beneath a
    // flush, polygonal hatch.  These are important in top and rear views.
    for (const side of [-1,1]) {
      P.add('hullDark',box(width*0.29,0.024,length*0.21),side*width*0.19,roofY+0.035,-halfL*0.53);
      for (let i=0;i<7;i++) P.add('hullDetail',box(width*0.26,0.026,0.030),side*width*0.19,roofY+0.055,-halfL*(0.40+i*0.055));
      P.add('hullDark',box(0.035,0.13,0.62),side*width*0.43,roofY-0.04,-halfL*0.54);
    }
    P.add('hull',cylY(0.28,0.28,0.045,8),-width*0.18,roofY+0.03,halfL*0.22,0,0.18,0);
    for (const x of [-0.76,-0.57,-0.38]) P.add('hullDark',box(0.13,0.035,0.038),x,roofY+0.08,halfL*0.36);
    P.add('hullDark',box(width*0.57,0.34,0.025),0,trackTop+0.31,-halfL*0.995);
    for(let i=0;i<8;i++) P.add('hullDetail',box(width*0.52,0.026,0.028),0,trackTop+0.18+i*0.035,-halfL*1.002);
    P.add('hullDetail',box(0.22,0.28,0.04),width*0.36,trackTop+0.27,-halfL*1.01);
  } else if (style === 'warrior') {
    for (const side of [-1,1]) {
      P.add('hullDark',box(width*0.29,0.024,length*0.23),side*width*0.19,roofY+0.035,-halfL*0.51);
      for(let i=0;i<6;i++) P.add('hullDetail',box(width*0.26,0.025,0.030),side*width*0.19,roofY+0.052,-halfL*(0.37+i*0.065));
      P.add('hullDetail',box(0.18,0.30,0.10),side*width*0.36,roofY*0.70,halfL*0.74);
    }
    P.add('hull',cylY(0.26,0.26,0.045,8),-width*0.19,roofY+0.025,halfL*0.18);
    for(const x of [-0.72,-0.52,-0.32]) P.add('hullDark',box(0.12,0.035,0.035),x,roofY+0.075,halfL*0.34);
  } else if (style === 'western' || style === 'ifv') {
    // Twin cooling banks, driver's hatch and rear exhaust louvres.
    for (const side of [-1,1]) {
      P.add('hullDark',box(width*0.27,0.025,length*0.16),side*width*0.20,roofY+0.035,-halfL*0.52);
      for (let i=0;i<4;i++) P.add('hullDetail',box(width*0.24,0.03,0.035),side*width*0.20,roofY+0.055,-halfL*(0.42+i*0.07));
    }
    P.add('hull',cylY(0.27,0.27,0.045,16),width*0.18,roofY+0.03,halfL*0.20);
    P.add('hullDark',box(width*0.54,Math.max(0.18,roofY*0.20),0.025),0,roofY*0.66,-halfL*0.995);
  } else {
    P.add('hull',cylY(0.25,0.25,0.04,14),width*0.16,roofY+0.03,halfL*0.16);
  }

  // Side-skirt panel fasteners and towing eyes give scale in every family.
  if (p.skirts !== false) for (const side of [-1,1]) for (let i=0;i<(p.skirtPanels || (style === 'ifv'?6:7));i++) {
    const z=length*0.37-i*(length*0.74/Math.max(1,(p.skirtPanels || (style === 'ifv'?6:7))-1));
    P.add('hullDark',cylZ(0.022,0.018,8),side*(width/2+0.035),p.skirtY ?? trackTop*0.78,z,0,side*Math.PI/2,0);
  }
  for (const side of [-1,1]) P.add('hullDetail',torus(0.09,0.018,10),side*width*0.27,0.48,halfL*0.94,Math.PI/2,0,0);
  const lampY=p.headlightY ?? trackTop+0.10;
  headlight(P,-width*0.35,lampY,halfL*0.88,-0.34,0.05);
  headlight(P,width*0.35,lampY,halfL*0.88,-0.34,0.05);
  towCable(P,[[-width*0.34,roofY-0.15,halfL*0.72],[0,roofY-0.01,halfL*0.48],[width*0.34,roofY-0.15,halfL*0.72]]);

  const wheelCount=p.wheels || (style === 'ifv' ? 6 : 7);
  const wheelR=p.wheelR || Math.min(0.40,length/(wheelCount*3.2));
  const wheelSpan=p.wheelSpan || length*0.74;
  const wheelZs=evenStations(wheelCount,wheelSpan,p.wheelBias || 0);
  const xc=width/2-trackW/2;
  buildRunningGear(P,{
    style:p.wheelStyle || 'rubber',wheelR,wheelW:Math.min(0.22,trackW*0.36),wheelY:p.wheelY || wheelR+0.09,xc,
    wheelZs,
    sprocket:{z:p.frontSprocket ? halfL*0.88 : -halfL*0.88,y:wheelR+0.10,r:wheelR*0.88},
    idler:{z:p.frontSprocket ? -halfL*0.88 : halfL*0.88,y:wheelR+0.08,r:wheelR*0.84},
    rollers:evenStations(Math.max(3,Math.floor(wheelCount/2)),wheelSpan*0.68).map((z)=>({z,y:trackTop*0.84,r:wheelR*0.23})),
    trackW,topY:trackTop*0.86,paintedEnds:true,coveredTop:p.coveredTop ?? (p.skirts !== false),arms:p.arms !== false,
  });
  if (p.skirts !== false) addSegmentedSkirts(P,width,p.skirtLength ?? length*0.86,
    p.skirtY ?? trackTop*0.72,p.skirtHeight ?? trackTop*0.60,p.skirtPanels || wheelCount);
  if (p.trackClearance) {
    P.raiseTrackCorridor(p.trackClearance.buckets || ['hull'], {
      laneInnerX:p.trackClearance.laneInnerX,
      floorY:p.trackClearance.floorY,
      zMin:p.trackClearance.zMin ?? -Infinity,
      zMax:p.trackClearance.zMax ?? Infinity,
    });
  }
  return {width,length,halfL,roofY,trackTop};
}

export function westernWedge(P,p) {
  const { box,frustum,slab }=KIT;
  const tw=p.turretWidth/2, h=p.turretHeight, front=p.turretFront, rear=p.turretRear;
  P.add('turret',frustum(tw*0.96,front*0.50,rear,tw*0.83,front*0.30,rear*0.94,0.02,h));
  const inner=Math.max(0.13,tw*0.14);
  P.add('turret',slab(
    [inner,0.02,front],[tw,0.02,front*0.42],[tw,0.02,front*0.10],[inner,0.02,front*0.70],
    [inner,h,front*0.58],[tw*0.86,h,front*0.05],[tw*0.86,h,-front*0.15],[inner,h,front*0.34]));
  P.add('turret',slab(
    [-tw,0.02,front*0.42],[-inner,0.02,front],[-inner,0.02,front*0.70],[-tw,0.02,front*0.10],
    [-tw*0.86,h,front*0.05],[-inner,h,front*0.58],[-inner,h,front*0.34],[-tw*0.86,h,-front*0.15]));
  P.add('turret',box(tw*1.75,h*0.72,Math.abs(rear)*0.58),0,h*0.39,rear*0.82);
}

// Abrams-family welded turret: broad, low, almost rectangular bustle with
// distinct swept cheeks. The generic Leopard arrow wedge made every M1 read
// like a narrowed Leopard 2 and was especially obvious from above.
export function abramsTurret(P,p) {
  const { box,frustum,slab }=KIT;
  const tw=p.turretWidth/2,h=p.turretHeight,f=p.turretFront,r=p.turretRear;
  P.add('turret',frustum(tw*0.98,f*0.52,r,tw*0.91,f*0.36,r*0.96,0,h));
  const slot=Math.max(0.22,tw*0.18);
  for (const side of [-1,1]) {
    const a=side*slot,b=side*tw;
    P.add('turret',slab(
      [a,0.03,f],[b,0.03,f*0.35],[b,0.03,-0.38],[a,0.03,f*0.62],
      [a,h*0.88,f*0.54],[b*0.91,h*0.78,f*0.05],[b*0.94,h*0.92,-0.58],[a,h,f*0.30]));
    P.add('turret',box(tw*0.18,h*0.68,Math.abs(r)*0.68),side*tw*0.89,h*0.43,r*0.67);
  }
  P.add('turret',box(tw*1.82,h*0.77,Math.abs(r)*0.72),0,h*0.43,r*0.72);
  P.add('turretDark',box(tw*1.58,0.045,Math.abs(r)*0.48),0,h*0.82,r*0.77);
  // Three blow-off panel bays and the external bustle basket/side rails.
  for (let i=0;i<3;i++) {
    const x=(i-1)*tw*0.48;
    P.add('turret',box(tw*0.40,0.045,Math.abs(r)*0.34),x,h+0.025,r*0.63);
    P.add('turretDark',box(0.025,0.055,Math.abs(r)*0.32),x+tw*0.20,h+0.055,r*0.63);
  }
  const rackZ=r-0.30;
  P.add('turretDetail',box(tw*1.94,0.035,0.035),0,h*0.64,rackZ);
  P.add('turretDetail',box(tw*1.94,0.035,0.035),0,0.14,rackZ);
  for(let i=0;i<10;i++) P.add('turretDetail',box(0.025,h*0.48,0.025),-tw*0.86+i*(tw*1.72/9),h*0.39,rackZ);
}

export function sovietTurret(P,p) {
  const { lathe,box }=KIT;
  const r=p.turretWidth/2, h=p.turretHeight;
  P.add('turret',lathe([[r*0.86,0],[r,0.12],[r*0.94,h*0.48],[r*0.70,h*0.86],[r*0.40,h],[0.02,h]],28,p.turretDepth/(p.turretWidth||1)));
  if (p.bustle) P.add('turret',box(r*1.52,h*0.62,p.bustle),0,h*0.40,-p.turretDepth*0.47-p.bustle*0.32);
  if (p.era) for (const side of [-1,1]) for (let i=0;i<4;i++) {
    P.add('turretDetail',box(0.23,0.12,0.16),side*(0.25+i*0.22),h*0.54,p.turretFront*0.70-i*0.09,0,side*0.12,side*0.05);
  }
}

export function merkavaTurret(P,p) {
  const { box,cylY,slab }=KIT;
  const tw=p.turretWidth/2,h=p.turretHeight,f=p.turretFront,r=p.turretRear;
  const inner=Math.max(0.11,tw*0.13);
  P.add('turret',slab(
    [inner,0.02,f],[tw,0.02,f*0.18],[tw*0.90,0.02,r],[inner,0.02,r*1.08],
    [inner,h,f*0.55],[tw*0.72,h,-0.02],[tw*0.66,h,r*0.90],[inner,h,r*0.94]));
  P.add('turret',slab(
    [-tw,0.02,f*0.18],[-inner,0.02,f],[-inner,0.02,r*1.08],[-tw*0.90,0.02,r],
    [-tw*0.72,h,-0.02],[-inner,h,f*0.55],[-inner,h,r*0.94],[-tw*0.66,h,r*0.90]));
  P.add('turret',box(tw*1.46,h*0.56,Math.abs(r)*0.45),0,h*0.32,r*0.92);
  const rackZ=r-0.36;
  P.add('turretDetail',box(tw*1.60,0.035,0.035),0,h*0.52,rackZ);
  P.add('turretDetail',box(tw*1.60,0.035,0.035),0,0.12,rackZ);
  for(let i=0;i<8;i++) P.add('turretDetail',box(0.025,h*0.40,0.025),-tw*0.72+i*(tw*1.44/7),h*0.32,rackZ);
  // Ball-and-chain curtain beneath the bustle: a signature Merkava rear
  // silhouette. Short alternating drops keep the curtain irregular.
  for(let i=0;i<11;i++) {
    const x=-tw*0.70+i*(tw*1.40/10);
    const drop=0.20+(i%3)*0.035;
    P.add('turretDark',box(0.018,drop,0.018),x,-drop*0.50,r-0.28);
    P.add('turretDark',cylY(0.035,0.035,0.04,8),x,-drop-0.01,r-0.28);
  }
}

export function castTurret(P,p) {
  const { lathe,frustum,box }=KIT;
  const tw=p.turretWidth/2,h=p.turretHeight;
  const f=p.turretFront ?? p.turretDepth*0.42;
  const r=p.turretRear ?? -p.turretDepth*0.58;
  // Patton/Centurion castings are low, rounded gun shields flowing into a
  // separate rear bustle—not tall polygonal prisms. A forward cast dome
  // supplies the curved cheeks; the tapered bustle supplies the asymmetric
  // side/top profile without stretching the dome into a giant pyramid.
  const domeR=tw*0.88;
  const domeDepth=Math.min(f*1.02,Math.abs(r)*0.58);
  P.add('turret',lathe([
    [domeR*0.70,0],[domeR*0.94,h*0.12],[domeR,h*0.30],
    [domeR*0.88,h*0.60],[domeR*0.62,h*0.84],[domeR*0.28,h*0.98],[0.02,h],
  ],32,domeDepth/Math.max(domeR,0.01)),0,0,f-domeDepth);
  P.add('turret',frustum(tw*0.82,-0.20,r,tw*0.62,-0.30,r*0.94,h*0.10,h*0.76));
  P.add('turret',box(tw*1.16,0.050,Math.abs(r)*0.54),0,h*0.78,r*0.54);
  const rackZ=r-0.22;
  P.add('turretDetail',box(tw*1.45,0.032,0.032),0,h*0.54,rackZ);
  P.add('turretDetail',box(tw*1.45,0.032,0.032),0,0.16,rackZ);
  for(let i=0;i<7;i++) P.add('turretDetail',box(0.022,h*0.34,0.022),-tw*0.62+i*(tw*1.24/6),h*0.34,rackZ);
}

export function ifvTurret(P,p) {
  const { box,polyTurret }=KIT;
  const tw=p.turretWidth/2,h=p.turretHeight,f=p.turretFront,r=p.turretRear;
  P.add('turret',polyTurret([
    [-tw*0.30,f],[tw*0.30,f],[tw*0.92,f*0.54],[tw,f*0.02],
    [tw*0.76,r],[-tw*0.76,r],[-tw,f*0.02],[-tw*0.92,f*0.54],
  ],h,1.02,0.86));
  P.add('turret',box(tw*0.70,h*0.56,0.18),0,h*0.46,f*0.88);
  P.add('turretDark',box(tw*0.42,h*0.30,0.04),tw*0.36,h*0.60,f+0.025);
  P.add('turret',KIT.cylY(tw*0.22,tw*0.22,0.045,12),-tw*0.30,h+0.02,-0.12);
  P.add('turret',KIT.cylY(tw*0.20,tw*0.20,0.045,12),tw*0.31,h+0.02,-0.18);
  P.add('turretDetail',box(tw*1.34,0.035,0.035),0,h*0.42,r-0.16);
  for(let i=0;i<5;i++) P.add('turretDetail',box(0.025,h*0.30,0.025),-tw*0.55+i*(tw*1.10/4),h*0.30,r-0.16);
}

export function type90Turret(P,p) {
  const { box,cylY,polyTurret,slab }=KIT;
  const tw=p.turretWidth/2,h=p.turretHeight,f=p.turretFront,r=p.turretRear;
  // Ten-sided welded shell derived from the Type 90 top view: narrow gun
  // throat, swept cheeks, almost parallel autoloader bustle and clipped rear
  // corners.  Keep the roof nearly full-width; a heavily inset generic
  // polyTurret is what produced the old tiered-pyramid silhouette.
  const plan=[
    [-tw*0.18,f],[tw*0.18,f],[tw*0.73,f*0.62],[tw,f*0.16],
    [tw*0.96,r*0.72],[tw*0.72,r],[-tw*0.72,r],[-tw*0.96,r*0.72],
    [-tw,f*0.16],[-tw*0.73,f*0.62],
  ];
  P.add('turret',polyTurret(plan,h,1.02,0.91));

  // Separate lower cheek wedges create the characteristic arrow nose without
  // turning the whole turret into a Leopard 2A5 pyramid.
  const throat=tw*0.16;
  for (const side of [-1,1]) {
    const inner=side*throat,outer=side*tw;
    P.add('turret',slab(
      [inner,0.03,f],[outer,0.03,f*0.20],[outer,0.03,-0.22],[inner,0.03,f*0.63],
      [inner,h*0.74,f*0.62],[outer*0.90,h*0.60,f*0.05],[outer*0.91,h*0.68,-0.34],[inner,h*0.86,f*0.38]));
    // Long, shallow bustle stowage box and side rail.
    P.add('turretDetail',box(tw*0.16,h*0.31,Math.abs(r)*0.62),side*tw*0.91,h*0.38,r*0.61);
    P.add('turretDetail',box(0.035,0.035,Math.abs(r)*0.78),side*tw*1.01,h*0.30,r*0.55);
  }
  // Autoloader bustle, roof access panels and rear rack.
  P.add('turret',box(tw*1.52,h*0.72,Math.abs(r)*0.63),0,h*0.41,r*0.70);
  for (let i=0;i<3;i++) P.add('turretDark',box(tw*0.42,0.032,Math.abs(r)*0.28),(i-1)*tw*0.48,h+0.02,r*0.62);
  P.add('turretDetail',box(tw*1.72,0.035,0.035),0,h*0.58,r-0.27);
  P.add('turretDetail',box(tw*1.72,0.035,0.035),0,0.16,r-0.27);
  for(let i=0;i<9;i++) P.add('turretDetail',box(0.024,h*0.40,0.024),-tw*0.76+i*(tw*1.52/8),h*0.36,r-0.27);
  // Low mantlet aperture and prominent right-side gunner's primary sight.
  P.add('turretDark',box(tw*0.34,h*0.48,0.14),0,h*0.45,f*0.76);
  P.add('turretDetail',box(0.34,0.31,0.28),tw*0.40,h*0.70,f*0.23);
  P.add('turretGlass',box(0.22,0.12,0.025),tw*0.40,h*0.73,f*0.39);
  P.add('turret',cylY(0.24,0.24,0.045,14),-tw*0.38,h+0.025,-0.24);
}

export function buildTurretAndGun(P,p) {
  const { box,cylY,cylZ,buildGun,cupola,periscope,pintleMG,smokeCluster }=KIT;
  if (p.turret === 'casemate') {
    // The armor/simulation rig still supplies a gun pitch group, but there is
    // no yawing turret shell. The hull superstructure is built above.
  } else if (p.turret === 'abrams') abramsTurret(P,p);
  else if (p.turret === 'soviet') sovietTurret(P,p);
  else if (p.turret === 'merkava') merkavaTurret(P,p);
  else if (p.turret === 'cast') castTurret(P,p);
  else if (p.turret === 'ifv') ifvTurret(P,p);
  else if (p.turret === 'type90') type90Turret(P,p);
  else westernWedge(P,p);

  const h=p.turretHeight;
  if (p.turret !== 'ifv' && p.turret !== 'casemate' && p.turret !== 'type90') {
    cupola(P,'turret',p.commanderX ?? p.turretWidth*0.20,h,p.commanderZ ?? -p.turretDepth*0.22,
      p.cupolaR ?? Math.min(0.24,p.turretWidth*0.09),p.cupolaH ?? 0.10,p.cupolaPeriscopes ?? 6);
    P.add('turret',cylY(0.19,0.19,0.035,14),p.loaderX ?? -p.turretWidth*0.20,h+0.02,-p.turretDepth*0.18);
  }
  if (p.turret !== 'casemate') periscope(P,'turretDetail',p.sightX ?? p.turretWidth*0.20,h+0.06,p.turretFront*0.28);
  if (p.pano) {
    P.add('turretDetail',box(0.16,0.19,0.16),p.panoX ?? 0.32,h+0.10,-p.turretDepth*0.20);
    P.add('turretDark',cylY(0.12,0.12,0.17,12),p.panoX ?? 0.32,h+0.27,-p.turretDepth*0.20);
  }
  if (p.turret === 'western') {
    // Recessed primary sight on the right cheek and a rear mesh basket make
    // Leopard/Type-90 style turrets read as authored armor, not a plain box.
    P.add('turretDark',box(0.34,0.18,0.035),p.turretWidth*0.23,h*0.56,p.turretFront*0.54);
    P.add('turretGlass',box(0.24,0.10,0.018),p.turretWidth*0.23,h*0.56,p.turretFront*0.57);
    P.add('turretDetail',box(p.turretWidth*0.74,0.035,0.035),0,h*0.58,p.turretRear-0.22);
    P.add('turretDetail',box(p.turretWidth*0.74,0.035,0.035),0,0.12,p.turretRear-0.22);
    for(let i=0;i<8;i++) P.add('turretDetail',box(0.025,h*0.44,0.025),-p.turretWidth*0.32+i*(p.turretWidth*0.64/7),h*0.35,p.turretRear-0.22);
  }
  if (p.smoke !== false && p.turret !== 'casemate') {
    smokeCluster(P,p.turretWidth*0.43,h*0.52,0,Math.min(6,p.smokeCount || 4),1.12,0.55);
    smokeCluster(P,-p.turretWidth*0.43,h*0.52,0,Math.min(6,p.smokeCount || 4),-1.12,0.55);
  }
  if (p.mg) pintleMG(P,p.commanderX ?? p.turretWidth*0.20,h+0.08,-p.turretDepth*0.32,p.mg === 'heavy');
  if (p.antennas !== false && p.turret !== 'casemate') for (const side of [-1,1]) {
    P.add('turretDetail',box(0.022,p.antennaHeight || 0.48,0.022),side*p.turretWidth*0.36,h+0.24,p.turretRear*0.78,0,0,side*0.08);
  }
  P.addGunExtra(box(p.mantletWidth || 0.48,p.mantletHeight || 0.44,0.24),0,0.01,p.turretFront*0.62);
  P.addGunExtra(cylZ(Math.max(0.10,P.spec.armor.gunBarrel.radiusM*1.55),0.28,14),0,0,p.turretFront*0.82);
  buildGun(P,{
    len:p.gunLength || P.spec.armor.gunBarrel.lengthM,
    r:p.gunRadius || Math.max(0.05,P.spec.armor.gunBarrel.radiusM*0.82),
    // evacRatio: buildGun's 1.62 default disappears INSIDE a thermal sleeve
    // (r*1.22) — sleeved tubes need the bulge proud of the sleeve to read.
    sleeve:p.sleeve !== false,evac:Object.hasOwn(p,'evac') ? p.evac : 0.55,
    evacR:p.evacR ?? (p.sleeve !== false ? 1.9 : 1.62),
    collar:true,baseR:Math.max(0.12,P.spec.armor.gunBarrel.radiusM*1.7),
  });
  // §B3.1 MUZZLE BORE — OPT-IN per profile (p.muzzleBore true|config);
  // absent = byte-identical build (shared-helper law).
  if (p.muzzleBore) muzzleBore(P,{
    len:p.gunLength || P.spec.armor.gunBarrel.lengthM,
    r:p.gunRadius || Math.max(0.05,P.spec.armor.gunBarrel.radiusM*0.82),
    ...(typeof p.muzzleBore === 'object' ? p.muzzleBore : null),
  });
  P.topY=h+(p.pano?0.46:0.25);
}

// §B3.1 addendum MUZZLE BORE (owner 2026-08-06, banked 32a6946; MANDATORY
// MECHANISM per the leclerc landing, banked 3fca39b): no gun ends in a solid
// capped tip — every muzzle face carries an annular rim + a near-black bore
// disc recessed inside the rim mouth. MECHANISM = SHADOW-NAMED RENDER
// FURNITURE (§C), the misc.js muzzleBore() reference pattern: bucket-based
// rims grow the gun AABB ~3cm and RE-FRAME the turret-row cameras (-6.2
// measured on leclerc; also re-binned gate z-columns here — m46/m47 hull
// -0.5/-0.3 measured before the rework). /shadow/i-named meshes render in
// every game/critic view but are excluded from every measurement mask AND
// the visible-box framing recipes — mask/frame-neutral BY CONSTRUCTION, and
// the rim sits honestly proud of the old solid cap (which would otherwise
// occlude a recessed disc — the kv2 r9/r10 "blank bore face" lesson).
// Dark torus rim at tube radius + mats.shadow disc at 0.62x recessed ~2cm
// inside the rim mouth; parented to P.gunG (elevation-correct).
// ADDITIVE + OPT-IN ONLY: nothing reaches this without a caller asking.
//
// Modes:
//   muzzleBore(P,{len,r,brake})  buildGun-cfg mirror — tip plane derived
//     from buildGun's face table (plain tube len-0.02; brake exits: single
//     +0.02, double +0.00, discs +0.005).
//   muzzleBore(P,{z,r,...})      explicit face plane for hand-authored
//     tubes (x/y for offset bores). MG muzzles do NOT take the ring — the
//     law gives them pinhole-class dark tips (see muzzleTipDot).
export function muzzleBore(P, o = {}) {
  const { cylZ, torus, xform } = KIT;
  const r = o.r ?? Math.max(0.05, P.spec.armor.gunBarrel.radiusM * 0.82);
  const len = o.len ?? P.muzzleZ;
  const zTip = o.z ?? (o.brake === 'double' ? len
    : o.brake === 'discs' ? len + 0.005
    : o.brake ? len + 0.02
    : len - 0.02);
  const x = o.x ?? 0, y = o.y ?? 0;
  // KIT.torus lies flat — rotate rx PI/2 for a vertical ring about the bore
  const ring = new THREE.Mesh(
    xform(torus(r * 0.82, r * 0.18, o.seg ?? 16), 0, 0, 0, Math.PI / 2, 0, 0),
    P.mats.dark);
  ring.name = 'muzzleBoreShadowRim';
  ring.position.set(x, y, zTip + 0.016);
  const disc = new THREE.Mesh(cylZ(o.boreR ?? r * 0.62, 0.012, o.seg ?? 14), P.mats.shadow);
  disc.name = 'muzzleBoreShadowDisc';
  disc.position.set(x, y, zTip + 0.006);
  // parent choice for hull-frame guns (casemate class: tubes authored in
  // hull buckets at world coords) — default stays the elevating gun group.
  const parent = o.parent === 'hullG' ? P.hullG : o.parent === 'turretG' ? P.turretG : P.gunG;
  for (const m of [ring, disc]) {
    m.castShadow = false;
    m.receiveShadow = true;
    parent.add(m);
    P.disposables.push(m.geometry);
  }
}

// §C.1 winding guard (orientedSlab class — the misc.js device, hoisted here
// for the fleet sweep so every family file can bind it): KIT.slab builds its
// six faces for ONE ring handedness — corners in plan order (-x,+z),(+x,+z),
// (+x,-z),(-x,-z), bottom then top. A mirrored call (x *= -1 without
// re-ordering) hands it the OPPOSITE orientation: all six faces come out
// INWARD and the solid is backface-culled in every FrontSide render (game,
// critic, standard-check truth renders) while staying fully visible to the
// gate's DoubleSide masks — the §C MISSING-SIDE class. This wrapper measures
// face outwardness about the corner centroid and re-orients reversed rings
// (b0,b3,b2,b1 / t0,t3,t2,t1) before building: identical solid, outward
// faces, mask-neutral by construction (only the position-buffer ORDER
// changes on repaired slabs — flipped graduates take the graduate-change
// candidate flow). Mixed rings (3-5 outward) pass through untouched —
// per-face adjudication stays with the owning file (§C.1).
export function orientedSlab(b0, b1, b2, b3, t0, t1, t2, t3) {
  const c8 = [b0, b1, b2, b3, t0, t1, t2, t3];
  const cen = [0, 1, 2].map((k) => c8.reduce((s, p) => s + p[k], 0) / 8);
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  let outward = 0;
  for (const f of [[b0, b1, t1, t0], [b1, b2, t2, t1], [b2, b3, t3, t2],
    [b3, b0, t0, t3], [t0, t1, t2, t3], [b3, b2, b1, b0]]) {
    const n = cross(sub(f[1], f[0]), sub(f[2], f[0]));
    const fc = [0, 1, 2].map((k) => (f[0][k] + f[1][k] + f[2][k] + f[3][k]) / 4);
    if (dot(n, sub(fc, cen)) > 0) outward++;
  }
  return outward >= 3
    ? KIT.slab(b0, b1, b2, b3, t0, t1, t2, t3)
    : KIT.slab(b0, b3, b2, b1, t0, t3, t2, t1);
}

// MG-scale companion (§B3.1: "M2/NSVT get pinhole-class dark tips, not
// drilled geometry"): ONE tiny mats.shadow disc on the muzzle of a small-
// arms tube. Shadow-named for the same mask/framing neutrality. parent =
// the P group the MG lives in ('turretG'|'hullG'|'gunG', default turretG);
// pos is that group's frame; rx/ry aim the disc with the tube.
export function muzzleTipDot(P, x, y, z, r = 0.012, o = {}) {
  const { cylZ, xform } = KIT;
  const dot = new THREE.Mesh(
    xform(cylZ(r, 0.006, 8), 0, 0, 0, o.rx ?? 0, o.ry ?? 0, o.rz ?? 0), P.mats.shadow);
  dot.name = 'muzzleTipShadowDot';
  dot.position.set(x, y, z);
  dot.castShadow = false;
  dot.receiveShadow = true;
  (o.parent === 'hullG' ? P.hullG : o.parent === 'gunG' ? P.gunG : P.turretG).add(dot);
  P.disposables.push(dot.geometry);
}

export function buildProfile(P,p) {
  const hull=buildHull(P,p);
  // Recovered roster rows inherit balance data from a nearby vehicle, which
  // includes that donor's articulation anchors. A Pershing inheriting a
  // Sherman ring or an ISU inheriting a Sturmtiger trunnion is exactly how
  // detached turrets and floating cannons were produced. Seat every profiled
  // visual from its own generated roof/superstructure instead.
  if (p.turret === 'casemate') {
    const casemateH=p.casemateHeight || Math.max(0.62,hull.roofY-hull.trackTop+0.28);
    P.turretG.position.set(
      p.turretPivotX || 0,
      p.gunMountY ?? hull.roofY-casemateH*0.38,
      p.gunMountZ ?? (p.casemateDepth || hull.length*0.48)*0.22,
    );
    P.gunG.position.set(0,0,0);
  } else {
    P.turretG.position.set(
      p.turretPivotX || 0,
      p.turretPivotY ?? hull.roofY,
      p.turretPivotZ ?? -hull.length*0.04,
    );
    P.gunG.position.set(
      p.gunX || 0,
      p.gunY ?? p.turretHeight*0.43,
      p.gunZ || 0,
    );
  }
  buildTurretAndGun(P,p);
  P.decal('turret','number',P.spec.visual.number || '',0.25,[p.turretWidth/2*0.97,p.turretHeight*0.40,-p.turretDepth*0.16],Math.PI/2);
  if (p.rearDoor) {
    const { box }=KIT;
    P.add('hullDetail',box(hull.width*0.38,hull.roofY*0.48,0.035),0,hull.roofY*0.62,-hull.halfL*0.975);
  }
}

/**
 * Donor mechanism: start from the canonical family builder and let the
 * owning family module apply its own kit deltas via `profile.kit(P, p)`.
 * (The old central variantKit switch is dissolved into the family modules.)
 */
export function buildDonorVariant(P, p) {
  KIT.buildCanonical(P, p.base);
  if (p.kit) p.kit(P, p);
}

export const WESTERN={hull:'western',wheels:7,skirts:true,turret:'western',turretWidth:2.45,turretDepth:3.05,turretHeight:0.72,turretFront:1.05,turretRear:-1.65,pano:true,mg:true};
export const LEOPARD={...WESTERN,turretWidth:2.62,turretDepth:3.42,turretHeight:0.76,turretFront:1.18,turretRear:-1.92,smokeCount:4,gunLength:4.0,antennaHeight:0.72};
export const SOVIET={hull:'soviet',wheels:6,skirts:true,turret:'soviet',turretWidth:2.25,turretDepth:2.55,turretHeight:0.62,turretFront:0.92,turretRear:-1.18,era:true,pano:true,mg:true,gunLength:4.0};
export const MERKAVA={hull:'merkava',wheels:6,skirts:true,turret:'merkava',turretWidth:2.18,turretDepth:2.85,turretHeight:0.72,turretFront:1.16,turretRear:-1.55,rearDoor:true,pano:true,mg:true,gunLength:2.9,antennaHeight:1.06};
export const CLASSIC={hull:'classic',wheels:6,skirts:false,turret:'cast',turretWidth:2.25,turretDepth:2.55,turretHeight:0.76,turretFront:1.00,turretRear:-1.20,mg:true};
export const WW2={...CLASSIC,pano:false,smoke:false,antennas:false,sleeve:false,evac:null,mg:false,arms:true};
export const CASEMATE={...WW2,hull:'casemate',turret:'casemate',turretWidth:1.5,turretDepth:1.8,turretHeight:0.35,turretFront:0.72,turretRear:-0.9};
export const ABRAMS={...WESTERN,family:'abrams',hull:'western',turret:'abrams',width:3.05,hullLength:7.25,roofY:1.58,trackW:0.56,turretWidth:2.48,turretDepth:3.42,turretHeight:0.74,turretFront:1.05,turretRear:-1.96,pano:true,mg:true,gunLength:3.25,antennaHeight:0.72};

// ===========================================================================
// KIT.fittings — STANDARD DECORATION FITTINGS (kit-fittings round, 2026-08-03)
// ===========================================================================
// Owner directive (BUILD-STANDARD §B3): builders CALL these instead of
// hand-authoring roof MGs / stowage per tank. Everything below is ADDITIVE —
// nothing above this banner changed (graduates hash on the factory chain;
// tools/tmp-hashgeo.mjs proves byte-identity).
//
// CONTRACT (every builder in KIT.fittings):
//  * Returns a THREE.Group. EVERY mesh inside carries
//    `userData.fitting = '<type>'`; the group itself carries the same marker
//    plus `userData.fittingRoot = true` (one root per fitting instance —
//    tools/tank-standard-check.mjs v2 censuses these markers).
//  * DETERMINISTIC: no Math.random anywhere — jitter comes from `opts.seed`
//    (default 1) through a local mulberry32. Same opts => byte-identical
//    geometry.
//  * MATERIAL SLOTS: callers pass their family material set as `opts.mats`
//    (normally just `P.mats`). Builders pick slots by the createTankMaterials
//    keys (dark / detail / canvasCloth / wood / spareTrack / glass / hull /
//    barrel / rubber) and fall back to `mats.dark`. A neutral white vertex-
//    color attribute is baked into every merged geometry so the camo slots
//    (hull/barrel, vertexColors:true) never render black.
//  * AABB FRAMING (BUILD-STANDARD §C): fittings must never change the model
//    AABB. The CALLER anchors the group so its whole envelope stays INSIDE
//    the hull/turret AABB; the as-built local envelope is stamped on
//    `group.userData.aabb = {min:[x,y,z], max:[x,y,z]}` for containment
//    checks (standard-check's fixture mode asserts it matches the meshes).
//  * WINDING: geometry is composed exclusively from canonical three.js
//    primitives (box/cyl/sphere/torus/lathe/tube) — never hand-wound slabs —
//    so top-view backface culling can't eat a fitting. standard-check's
//    fixture mode renders each fitting top-down with FrontSide materials and
//    asserts non-zero coverage.
//  * MG PHYSICS (banked law): pintleMG builds a receiver MASS (never a
//    stick), a barrel that can break the roofline, and tone options — dark
//    body + pale top caps ('two-tone', the abrams/merkava proven recipe),
//    all-pale ('pale', the casemate sky-silhouette recipe: pale top-lit over
//    sky), or all-dark ('dark': pale-deck roof guns invert to dark
//    crown-riding lines). Callers pick tone by their deck polarity. Pintle
//    silhouette allowance stays within the ≤0.4 gate-pt law when the caller
//    keeps the envelope inside certified bins (see the casemate/abrams
//    packets).
//  * Shadows: castShadow/receiveShadow default true (fittings replace
//    bucket-authored greebles which cast); pass `shadows:false` to opt out.
//
// Distinct from the legacy P-bucket helpers (KIT.pintleMG / KIT.towCable /
// KIT.stowage — those write into merged material buckets and stay for the
// already-graduated call sites): KIT.fittings.* return marker-carrying
// groups, which is what the §B3 census machine-checks.
//
// Profile usage (import { FITTINGS } is the timing-proof spelling — see the
// cycle note at the attach site below; KIT.fittings is the same object on
// every runtime build path):
//   import { KIT, FITTINGS } from './kit.js';
//   const mg = FITTINGS.pintleMG({ mats: P.mats, cls: 'm2', tone: 'two-tone' });
//   mg.position.set(0.62, roofY, -0.85);     // anchor INSIDE the turret AABB
//   P.turretG.add(mg);
import * as THREE from 'three';

function fitRng(seed) {
  let a = (seed | 0) ^ 0x2c9277b5;
  return function () {
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Per-fitting part collector with P.add ergonomics, keyed by MATERIAL SLOT.
function fitParts() {
  const bySlot = {};
  return {
    bySlot,
    add(slot, geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) {
      (bySlot[slot] || (bySlot[slot] = [])).push(KIT.xform(geo, x, y, z, rx, ry, rz, s));
    },
  };
}

function fitMat(mats, slot) {
  const m = mats[slot] || mats.dark;
  if (m && m.isMaterial) return m;
  for (const v of Object.values(mats)) if (v && v.isMaterial) return v;
  return null;
}

// Merge one mesh per material slot, stamp markers + local AABB, return group.
function fitAssemble(type, parts, opts) {
  if (!opts || !opts.mats) {
    throw new Error(`KIT.fittings.${type}: opts.mats (family material set, e.g. P.mats) is required`);
  }
  const g = new THREE.Group();
  g.name = `fitting_${type}`;
  const shadows = opts.shadows !== false;
  for (const [slot, geos] of Object.entries(parts.bySlot)) {
    if (!geos.length) continue;
    const merged = KIT.mergeAll(geos);
    // Camo slots (hull/barrel) sample vertexColors; a missing attribute reads
    // (0,0,0) in WebGL and renders BLACK — bake neutral white (ERA precedent).
    merged.setAttribute('color', new THREE.BufferAttribute(
      new Float32Array(merged.attributes.position.count * 3).fill(1), 3));
    const mesh = new THREE.Mesh(merged, fitMat(opts.mats, slot));
    mesh.castShadow = mesh.receiveShadow = shadows;
    mesh.userData.fitting = type;
    mesh.userData.fittingSlot = slot;
    g.add(mesh);
  }
  g.userData.fitting = type;
  g.userData.fittingRoot = true;
  if (opts.rotation) g.rotation.set(opts.rotation[0] || 0, opts.rotation[1] || 0, opts.rotation[2] || 0);
  const bb = new THREE.Box3().setFromObject(g);
  g.userData.aabb = { min: [bb.min.x, bb.min.y, bb.min.z], max: [bb.max.x, bb.max.y, bb.max.z] };
  return g;
}

// MG class table (era/caliber families). rec = [w,h,d] receiver mass.
const MG_CLASSES = {
  m2:   { s: 1.00, rec: [0.115, 0.095, 0.46], barrelR: 0.0165, barrelL: 0.52, jacket: 'sleeve', flashR: 0.021, flashL: 0.07 },
  dshk: { s: 1.02, rec: [0.100, 0.100, 0.44], barrelR: 0.0155, barrelL: 0.50, jacket: 'fins',   flashR: 0.035, flashL: 0.10 },
  nsvt: { s: 0.98, rec: [0.090, 0.100, 0.42], barrelR: 0.0240, barrelL: 0.55, jacket: 'none',   flashR: 0.035, flashL: 0.10 },
  mag:  { s: 0.78, rec: [0.100, 0.045, 0.34], barrelR: 0.0120, barrelL: 0.46, jacket: 'none',   flashR: 0.017, flashL: 0.06 },
};

/**
 * Roof pintle machine gun (MANDATORY §B3 decoration — MG PHYSICS compliant).
 * Origin: pintle FOOT on the roof plate (caller seats it on the deck/cupola).
 * @param {object} opts
 *   mats     family material set (required — normally P.mats)
 *   cls      'm2' | 'dshk' | 'nsvt' | 'mag'                  (default 'm2')
 *   scale    extra uniform scale on the class                (default 1)
 *   tone     'two-tone' | 'pale' | 'dark'                    (default 'two-tone')
 *   elev     barrel elevation in radians, up positive        (default 0.06)
 *   ring     AA ring around the foot: true | {r, stubs}      (default false)
 *   ammo     ammo can on the receiver's left                 (default true)
 *   shield   small gun shield ahead of the receiver          (default false)
 *   seed, shadows, rotation
 * Envelope (m2/scale 1, no ring): x ±0.17, y 0..0.36, z -0.30..+0.93 —
 * authoritative per-build box in group.userData.aabb.
 */
function fittingPintleMG(opts = {}) {
  const { box, cylY, cylZ, torus, xform } = KIT;
  const cls = MG_CLASSES[opts.cls || 'm2'] || MG_CLASSES.m2;
  const s = (opts.scale || 1) * cls.s;
  const tone = opts.tone || 'two-tone';
  const elev = opts.elev ?? 0.06;
  const B = tone === 'pale' ? 'detail' : 'dark';   // body slot
  const CAP = tone === 'dark' ? null : 'detail';   // pale top caps
  const parts = fitParts();
  const [rw, rh, rd] = cls.rec.map((v) => v * s);

  // pintle column: flanged foot -> tapered post -> cradle yoke (real column,
  // never a floating gun — casemate r10 law).
  const colH = 0.16 * s;
  parts.add(B, cylY(0.030 * s, 0.038 * s, 0.014, 12), 0, 0.007, 0);
  parts.add(B, cylY(0.016 * s, 0.021 * s, colH, 10), 0, 0.014 + colH / 2, 0);
  const colTop = 0.014 + colH;
  parts.add(B, box(0.10 * s, 0.05 * s, 0.15 * s), 0, colTop + 0.025 * s, 0.01);

  // receiver MASS (not a stick) + top-cover ridge + pale cap.
  const recY = colTop + 0.05 * s + rh / 2 - 0.01;
  const recZ = 0.06 * s;
  parts.add(B, box(rw, rh, rd), 0, recY, recZ);
  parts.add(B, box(rw * 0.44, 0.016 * s, rd * 0.9), 0, recY + rh / 2 + 0.008 * s, recZ);
  if (CAP) parts.add(CAP, box(rw * 0.9, 0.008, rd * 0.88), 0, recY + rh / 2 + 0.020 * s, recZ);
  // spade grips + charging handle (dark accents in every tone).
  parts.add('dark', box(0.016 * s, 0.020 * s, 0.05 * s), -0.03 * s, recY - 0.01, recZ - rd / 2 - 0.02 * s);
  parts.add('dark', box(0.016 * s, 0.020 * s, 0.05 * s), 0.03 * s, recY - 0.01, recZ - rd / 2 - 0.02 * s);
  parts.add('dark', box(0.044 * s, 0.016 * s, 0.016 * s), 0, recY - 0.028 * s, recZ - rd / 2 - 0.045 * s);

  // barrel group, elevated about the trunnion at the receiver front.
  const trunY = recY + 0.004;
  const trunZ = recZ + rd / 2;
  const aim = (geo, dz, dy = 0) => xform(xform(geo, 0, dy, dz), 0, 0, 0, -elev, 0, 0);
  if (cls.jacket === 'sleeve') {
    parts.add(B, aim(cylZ(cls.barrelR * s * 1.7, 0.10 * s, 10), 0.05 * s), 0, trunY, trunZ);
  } else if (cls.jacket === 'fins') {
    for (let k = 0; k < 5; k++) {
      parts.add(B, aim(cylZ(cls.barrelR * s * 1.5, 0.020 * s, 12), (0.03 + k * 0.028) * s), 0, trunY, trunZ);
    }
  }
  const bl = cls.barrelL * s;
  parts.add(B, aim(cylZ(cls.barrelR * s, bl, 8), 0.10 * s + bl / 2), 0, trunY, trunZ);
  if (CAP) parts.add(CAP, aim(box(0.012 * s, 0.006, bl * 0.8), 0.10 * s + bl / 2, cls.barrelR * s + 0.003), 0, trunY, trunZ);
  parts.add(B, aim(cylZ(cls.flashR * s, cls.flashL * s, 8), 0.10 * s + bl + cls.flashL * s / 2), 0, trunY, trunZ);
  parts.add('dark', aim(cylZ(cls.barrelR * s * 0.55, 0.008, 8), 0.10 * s + bl + cls.flashL * s + 0.005), 0, trunY, trunZ);
  parts.add('dark', box(0.012 * s, 0.017 * s, 0.015 * s), 0, trunY + cls.barrelR * s + 0.012, trunZ + 0.14 * s);

  if (opts.ammo !== false) {
    const ax = -(rw / 2 + 0.055 * s);
    parts.add('detail', box(0.085 * s, 0.11 * s, 0.17 * s), ax, recY - 0.005, recZ - 0.02);
    parts.add('dark', box(0.075 * s, 0.006, 0.15 * s), ax, recY + 0.055 * s, recZ - 0.02);
  }
  if (opts.shield) {
    parts.add(tone === 'pale' ? 'detail' : 'dark', box(0.34 * s, 0.22 * s, 0.02), 0, recY + 0.02, trunZ + 0.03);
  }
  if (opts.ring) {
    const rr = (opts.ring.r || 0.20) * s;
    const rSlot = tone === 'dark' ? 'dark' : 'detail';
    parts.add(rSlot, torus(rr, 0.011, 26), 0, 0.035, 0);
    const stubs = opts.ring.stubs || 3;
    for (let k = 0; k < stubs; k++) {
      const a = 0.6 + k * (Math.PI * 2 / stubs);
      parts.add(rSlot, box(0.024, 0.032, 0.024), Math.cos(a) * rr * 0.98, 0.018, Math.sin(a) * rr * 0.98);
    }
  }
  return fitAssemble('pintleMG', parts, opts);
}

/**
 * Rail stowage rack with soft fill (§B3 dressing). Rail fence + dark mesh
 * back panel + tone-varied duffels/crates/tarp rolls.
 * Origin: center of the rack FLOOR plane; +z is the open/outboard face.
 * @param {object} opts
 *   mats; w=1.2 rack width; d=0.45 depth; h=0.30 rail height;
 *   posts   post count                     (default from width)
 *   rails   1..3 horizontal rails          (default 2)
 *   mesh    dark mesh back panel           (default true)
 *   fill    0..1 soft-fill density         (default 0.75; 0 = bare rack)
 *   seed, shadows, rotation
 * Envelope: x ±w/2, y 0..~1.35h with fill (0..h bare), z ±d/2 — see
 * group.userData.aabb.
 */
function fittingStowageRack(opts = {}) {
  const { box, cylX } = KIT;
  const w = opts.w || 1.2, d = opts.d || 0.45, h = opts.h || 0.30;
  const rails = Math.min(3, Math.max(1, opts.rails || 2));
  const rng = fitRng(opts.seed ?? 1);
  const parts = fitParts();

  // fence: posts + rails on the outer face, short end rails closing the bay.
  const zFace = d / 2 - 0.02;
  const nPosts = Math.min(10, Math.max(2, opts.posts || Math.round(w / 0.22)));
  for (let i = 0; i < nPosts; i++) {
    const x = -w / 2 + 0.02 + i * ((w - 0.04) / (nPosts - 1));
    parts.add('dark', box(0.025, h, 0.025), x, h / 2, zFace);
  }
  const railYs = rails === 1 ? [h * 0.95] : rails === 2 ? [h * 0.95, h * 0.45] : [h * 0.95, h * 0.70, h * 0.45];
  for (const ry of railYs) {
    parts.add('dark', box(w, 0.032, 0.032), 0, ry, zFace);
    for (const sx of [-1, 1]) parts.add('dark', box(0.032, 0.032, d * 0.9), sx * (w / 2 - 0.016), ry, zFace - d * 0.45);
  }
  for (const sx of [-1, 1]) parts.add('dark', box(0.025, h, 0.025), sx * (w / 2 - 0.016), h / 2, zFace - d * 0.9);
  if (opts.mesh !== false) parts.add('dark', box(w * 0.98, h * 0.82, 0.014), 0, h * 0.52, zFace - 0.035);
  parts.add('dark', box(w, 0.025, 0.04), 0, 0.0125, zFace);

  // soft fill: tone-varied bundles (cloth / wood / pale) with seeded jitter.
  const fill = opts.fill ?? 0.75;
  if (fill > 0) {
    const n = Math.max(1, Math.round(fill * w / 0.26));
    const slots = ['canvasCloth', 'wood', 'canvasCloth', 'detail'];
    for (let i = 0; i < n; i++) {
      const x = (n === 1 ? 0 : -w / 2 + 0.18 + i * ((w - 0.36) / (n - 1))) + (rng() - 0.5) * 0.03;
      const slot = slots[i % slots.length];
      const yaw = (rng() - 0.5) * 0.16;
      if (slot === 'wood') {
        const bw = 0.24 + rng() * 0.06, bh = 0.16 + rng() * 0.05;
        parts.add('wood', box(bw, bh, d * 0.62), x, bh / 2 + 0.02, -d * 0.08, 0, yaw, 0);
        parts.add('dark', box(bw * 1.03, bh * 0.16, 0.02), x, bh * 0.5 + 0.02, -d * 0.08 + d * 0.31, 0, yaw, 0);
      } else {
        const r = 0.10 + rng() * 0.035, len = 0.22 + rng() * 0.10;
        parts.add(slot, cylX(r, len, 10), x, r * 0.92 + 0.02, -d * 0.05, 0, yaw, 0);
        parts.add('dark', cylX(r * 1.05, 0.022, 10), x - len * 0.22, r * 0.92 + 0.02, -d * 0.05, 0, yaw, 0);
        parts.add('dark', cylX(r * 1.05, 0.022, 10), x + len * 0.22, r * 0.92 + 0.02, -d * 0.05, 0, yaw, 0);
      }
    }
    // one long tarp roll across wide racks, over the bundles.
    if (w > 0.8 && fill >= 0.5) {
      const r = 0.085;
      parts.add('canvasCloth', cylX(r, w * 0.55, 10), 0, h * 0.9 + r * 0.4, -d * 0.12);
      parts.add('dark', cylX(r * 1.06, 0.024, 10), -w * 0.16, h * 0.9 + r * 0.4, -d * 0.12);
      parts.add('dark', cylX(r * 1.06, 0.024, 10), w * 0.16, h * 0.9 + r * 0.4, -d * 0.12);
    }
  }
  return fitAssemble('stowageRack', parts, opts);
}

/**
 * Draped tow cable with end eyes + clamp blocks.
 * Origin: caller's local frame — `pts` are LOCAL [x,y,z] knots (>= 2), the
 * tube runs through them (CatmullRom, centripetal).
 * @param {object} opts  mats; pts (required); r=0.020; eyes=true; seg=20;
 *   tone 'dark'|'pale' (default 'dark'); seed, shadows, rotation
 */
function fittingTowCable(opts = {}) {
  const pts = opts.pts;
  if (!pts || pts.length < 2) throw new Error('KIT.fittings.towCable: opts.pts (>= 2 local [x,y,z]) required');
  const { box, xform } = KIT;
  const r = opts.r || 0.020;
  const slot = opts.tone === 'pale' ? 'detail' : 'dark';
  const parts = fitParts();
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
  parts.add(slot, new THREE.TubeGeometry(curve, opts.seg || 20, r, 6, false));
  if (opts.eyes !== false) {
    for (const t of [0, 1]) {
      const p = curve.getPointAt(t);
      const tan = curve.getTangentAt(t).multiplyScalar(t === 0 ? -1 : 1);
      const yaw = Math.atan2(tan.x, tan.z);
      const eye = xform(new THREE.TorusGeometry(r * 2.6, r * 0.75, 6, 12), 0, 0, r * 3.4);
      parts.add(slot, xform(eye, 0, 0, 0, 0, yaw, 0), p.x, p.y, p.z);
      parts.add(slot, xform(box(r * 2.6, r * 2.4, r * 3.2), 0, 0, r * 1.2, 0, yaw, 0), p.x, p.y, p.z);
    }
  }
  return fitAssemble('towCable', parts, opts);
}

/**
 * Jerry can row with retaining strap.
 * Origin: bottom center of the row; cans face +z.
 * @param {object} opts  mats; count=2; gap=0.05; slot='detail'
 *   ('detail' pale metal | 'canvasCloth' olive | 'hull' scheme-painted);
 *   strap=true; seed, shadows, rotation
 * Envelope: x ±(count*(0.16+gap))/2, y 0..0.50, z ±0.17.
 */
function fittingJerryCans(opts = {}) {
  const { box, cylY } = KIT;
  const count = Math.max(1, opts.count || 2);
  const gap = opts.gap ?? 0.05;
  // owner 2026-08-06: cans read too bright fleet-wide in 'detail' pale
  // metal — default to the olive canvas tone; callers may still opt in.
  const slot = opts.slot || 'canvasCloth';
  const rng = fitRng(opts.seed ?? 1);
  const parts = fitParts();
  const pitchX = 0.16 + gap;
  for (let i = 0; i < count; i++) {
    const x = (i - (count - 1) / 2) * pitchX;
    const yaw = (rng() - 0.5) * 0.10;
    parts.add(slot, box(0.16, 0.44, 0.32), x, 0.22, 0, 0, yaw, 0);
    parts.add(slot, box(0.04, 0.055, 0.12), x, 0.465, 0, 0, yaw, 0);
    parts.add('dark', cylY(0.020, 0.020, 0.035, 8), x + Math.sin(yaw) * 0.10 + 0.04, 0.455, Math.cos(yaw) * 0.10, 0, yaw, 0);
  }
  if (opts.strap !== false) {
    const w = count * pitchX + 0.02;
    parts.add('dark', box(w, 0.028, 0.018), 0, 0.30, 0.168);
    parts.add('dark', box(w, 0.028, 0.018), 0, 0.30, -0.168);
  }
  return fitAssemble('jerryCans', parts, opts);
}

/**
 * Spare track-link strip (worn track steel — never blockout black, r5 law).
 * Origin: strip center; links run along z. Use opts.rotation for glacis
 * lay-flat / turret-side hang poses.
 * @param {object} opts  mats; links=4; width=0.5; pitch=0.165; seed,
 *   shadows, rotation=[rx,ry,rz]
 */
function fittingSpareTrackLinks(opts = {}) {
  const { box } = KIT;
  const links = Math.max(1, opts.links || 4);
  const width = opts.width || 0.5;
  const pitch = opts.pitch || 0.165;
  const parts = fitParts();
  for (let k = 0; k < links; k++) {
    const z = (k - (links - 1) / 2) * pitch;
    parts.add('spareTrack', box(width, 0.045, 0.15), 0, 0, z);
    parts.add('spareTrack', box(width * 0.88, 0.06, 0.05), 0, 0.02, z);
  }
  return fitAssemble('spareTrackLinks', parts, opts);
}

/**
 * Headlight pod cluster with brush guards.
 * Origin: center between pods at drum axis height; lenses face +z.
 * @param {object} opts  mats; pods=2; spacing=0.16; r=0.055; guard=true;
 *   lens='glass' ('glass' | 'dark' — dark-lens law for pale decks);
 *   rake=-0.30 (drum pitch, matches glacis rake); seed, shadows, rotation
 */
function fittingLightCluster(opts = {}) {
  const { box, cylZ, xform } = KIT;
  const pods = Math.max(1, opts.pods || 2);
  const spacing = opts.spacing ?? 0.16;
  const r = opts.r || 0.055;
  const rake = opts.rake ?? -0.30;
  const lensSlot = opts.lens === 'dark' ? 'dark' : 'glass';
  const parts = fitParts();
  for (let i = 0; i < pods; i++) {
    const x = (i - (pods - 1) / 2) * spacing;
    parts.add('detail', xform(cylZ(r, r * 1.35, 12), 0, 0, 0, rake, 0, 0), x, 0, 0);
    parts.add(lensSlot, xform(xform(cylZ(r * 0.8, 0.02, 12), 0, 0, r * 0.72), 0, 0, 0, rake, 0, 0), x, 0, 0);
    if (opts.guard !== false) {
      for (const sx of [-1, 1]) {
        parts.add('dark', xform(xform(box(0.016, r * 2.5, 0.016), sx * r * 0.62, 0, r * 0.55), 0, 0, 0, rake, 0, 0), x, 0, 0);
      }
      parts.add('dark', xform(xform(box(r * 1.9, 0.016, 0.016), 0, r * 0.85, r * 0.55), 0, 0, 0, rake, 0, 0), x, 0, 0);
    }
  }
  return fitAssemble('lightCluster', parts, opts);
}

/**
 * Smoke-launcher tube bank (one cluster — call twice for L/R, mirroring
 * `splay` sign and x anchor).
 * Origin: bracket center; tubes fan forward/up from it.
 * @param {object} opts  mats; count=4; r=0.038; len=0.24; pitch=-0.5 (tube
 *   pitch rx); splay=1.12 (cluster yaw — negative for the far side);
 *   arc=0.55; spacing=0.095; base=true; caps=true; slot='detail'
 *   ('detail' pale tubes | 'dark'); seed, shadows, rotation
 */
function fittingSmokeBank(opts = {}) {
  const { box, cylZ, xform } = KIT;
  const n = Math.min(8, Math.max(1, opts.count || 4));
  const r = opts.r || 0.038;
  const len = opts.len || 0.24;
  const pitch = opts.pitch ?? -0.5;
  const splay = opts.splay ?? 1.12;
  const arc = opts.arc ?? 0.55;
  const spacing = opts.spacing ?? 0.095;
  const slot = opts.slot || 'detail';
  const parts = fitParts();
  for (let k = 0; k < n; k++) {
    const f = k - (n - 1) / 2;
    const a = splay + f * (arc / n);
    const dx = Math.cos(splay) * f * spacing;
    const dz = -Math.sin(splay) * f * spacing;
    parts.add(slot, xform(cylZ(r, len, 8), 0, 0, 0, pitch, a, 0), dx, 0, dz);
    if (opts.caps !== false) {
      parts.add('dark', xform(xform(cylZ(r * 0.88, 0.012, 8), 0, 0, len / 2 + 0.007), 0, 0, 0, pitch, a, 0), dx, 0, dz);
    }
  }
  if (opts.base !== false) {
    parts.add('dark', xform(box(n * spacing + 0.06, 0.05, 0.08), 0, -0.06, -0.06, 0, splay * 0.5, 0));
  }
  return fitAssemble('smokeBank', parts, opts);
}

/**
 * Whip antenna on a base pot (PALE-REFUND-aware: the thin member defaults to
 * the PALE detail slot so it refunds silhouette cost; pass slot:'dark' only
 * over pale backdrops).
 * Origin: pot base on the deck.
 * @param {object} opts  mats; h=0.9; r=0.011; rake=0.06 (rz lean);
 *   base=true; slot='detail'; seed, shadows, rotation
 */
function fittingAntennaWhip(opts = {}) {
  const { box, cylY } = KIT;
  const h = opts.h || 0.9;
  const r = opts.r || 0.011;
  const rake = opts.rake ?? 0.06;
  const slot = opts.slot || 'detail';
  const parts = fitParts();
  if (opts.base !== false) {
    parts.add('dark', cylY(0.035, 0.045, 0.08, 10), 0, 0.04, 0);
    parts.add('dark', cylY(0.020, 0.020, 0.05, 8), 0, 0.10, 0);
  }
  const baseTop = opts.base !== false ? 0.12 : 0;
  parts.add(slot, box(r * 2, h, r * 2), -Math.sin(rake) * h * 0.5, baseTop + Math.cos(rake) * h * 0.5, 0, 0, 0, rake);
  return fitAssemble('antennaWhip', parts, opts);
}

/**
 * Unditching log with cinch straps (rear-deck dressing, soviet tradition).
 * Origin: log axis center; log runs along x ('x') or z ('z').
 * @param {object} opts  mats; len=2.4; r=0.13; axis='x'; straps=2; seed,
 *   shadows, rotation
 */
function fittingUnditchingLog(opts = {}) {
  const { box, cylX } = KIT;
  const len = opts.len || 2.4;
  const r = opts.r || 0.13;
  const straps = Math.max(0, opts.straps ?? 2);
  const rng = fitRng(opts.seed ?? 1);
  const parts = fitParts();
  parts.add('wood', cylX(r, len, 14), 0, 0, 0);
  parts.add('detail', cylX(r * 0.94, 0.016, 14), -(len / 2 + 0.004), 0, 0);
  parts.add('detail', cylX(r * 0.94, 0.016, 14), len / 2 + 0.004, 0, 0);
  for (let i = 0; i < straps; i++) {
    const x = -len / 2 + (i + 1) * (len / (straps + 1)) + (rng() - 0.5) * 0.10;
    parts.add('dark', cylX(r * 1.06, 0.032, 14), x, 0, 0);
    parts.add('dark', box(0.034, r * 0.9, 0.016), x, -r * 0.62, r * 0.55, 0.5, 0, 0);
  }
  if (opts.axis !== 'z') return fitAssemble('unditchingLog', parts, opts);
  const r0 = opts.rotation || [0, 0, 0];
  return fitAssemble('unditchingLog', parts, { ...opts, rotation: [r0[0] || 0, (r0[1] || 0) + Math.PI / 2, r0[2] || 0] });
}

// Register a source-measured fitting whose exterior cannot be represented by
// one of the generic constructors without losing certified geometry. The
// caller supplies the real mesh group; this helper only validates/stamps the
// same marker and AABB contract as fitAssemble. It is intentionally not a
// marker-only escape hatch: at least one visible mesh is mandatory and every
// mesh in the group receives the fitting type for the integrity census.
function fittingMarkExact(group, type) {
  if (!group?.isGroup || !type) throw new Error('KIT.fittings.markExact: visible Group and type are required');
  let meshCount = 0;
  group.traverse((o) => {
    if (!o.isMesh || !o.geometry || o.material?.colorWrite === false) return;
    meshCount++;
    o.userData.fitting = type;
    o.userData.fittingExact = true;
  });
  if (!meshCount) throw new Error('KIT.fittings.markExact: group must contain visible mesh geometry');
  group.name = `fitting_${type}_exact`;
  group.userData.fitting = type;
  group.userData.fittingRoot = true;
  group.userData.fittingExact = true;
  const bb = new THREE.Box3().setFromObject(group);
  group.userData.aabb = { min: bb.min.toArray(), max: bb.max.toArray() };
  return group;
}

export const FITTINGS = {
  pintleMG: fittingPintleMG,
  stowageRack: fittingStowageRack,
  towCable: fittingTowCable,
  jerryCans: fittingJerryCans,
  spareTrackLinks: fittingSpareTrackLinks,
  lightCluster: fittingLightCluster,
  smokeBank: fittingSmokeBank,
  antennaWhip: fittingAntennaWhip,
  unditchingLog: fittingUnditchingLog,
  markExact: fittingMarkExact,
};

// Attach on the shared KIT object so callers reach the fittings as
// KIT.fittings.<fn>. Additive property; no existing KIT key is touched.
// CYCLE LAW: kit.js evaluates INSIDE the deliberate tankFactory module cycle
// (tankFactory -> profiledProcedurals -> kit.js), BEFORE the KIT const
// initializes — a bare module-scope read here is a TDZ ReferenceError (the
// same law that forbids profiles reading KIT bindings at module scope). The
// try arm covers out-of-cycle evaluation; the microtask arm lands the attach
// the moment the module graph settles, which precedes every runtime build
// path (game boot, garage, critic/gate rigs — all async). The one window it
// cannot cover is a SYNCHRONOUS top-level createTank in the same job as
// graph evaluation (tmp-hashgeo pattern): those rigs — and profile builders
// that must stay loadable under them — use the timing-proof spelling
//   import { FITTINGS } from './kit.js';
// which is initialized before any profile module evaluates.
try {
  KIT.fittings = FITTINGS;
} catch (_) {
  // Vite's SSR evaluator exposes the cyclic namespace before tankFactory's
  // `KIT` value is initialized.  In that path the imported binding is
  // temporarily `undefined` rather than a native-ESM TDZ throw.  The former
  // callback dereferenced it unconditionally and crashed read-only fleet
  // auditors after their module graph had otherwise loaded successfully.
  // Runtime/profile consumers import FITTINGS directly, so a missing shared
  // alias during this one deferred tick is harmless; attach it whenever the
  // value is present and never turn an optional compatibility alias into an
  // audit-fatal exception.
  queueMicrotask(() => {
    if (KIT && !KIT.fittings) KIT.fittings = FITTINGS;
  });
}
