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
  headlight(P,-width*0.35,trackTop+0.10,halfL*0.88,-0.34,0.05);
  headlight(P,width*0.35,trackTop+0.10,halfL*0.88,-0.34,0.05);
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
    sleeve:p.sleeve !== false,evac:Object.hasOwn(p,'evac') ? p.evac : 0.55,
    collar:true,baseR:Math.max(0.12,P.spec.armor.gunBarrel.radiusM*1.7),
  });
  P.topY=h+(p.pano?0.46:0.25);
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
