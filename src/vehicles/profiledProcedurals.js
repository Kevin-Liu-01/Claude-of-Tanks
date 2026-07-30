// Dedicated procedural silhouettes for sourced/recovered variants.
//
// These are original primitive reconstructions informed by normalized local
// reference renders and real vehicle dimensions. They intentionally do not
// contain, decode, or reproduce source mesh topology. The goal is a correct
// public-safe fallback with its own hull, turret, gun and suspension identity
// instead of resolving a distinct tank through a nearby family builder.
import { KIT } from './tankFactory.js';

const evenStations = (count, span, bias = 0) => Array.from({ length:count }, (_, i) =>
  count === 1 ? bias : span / 2 - i * (span / (count - 1)) + bias);

function addSegmentedSkirts(P, width, length, y, height, panels = 6) {
  const { box } = KIT;
  const panelD = length / panels;
  for (const side of [-1, 1]) {
    for (let i=0; i<panels; i++) {
      const z=length/2-panelD/2-i*panelD;
      P.add('hull',box(0.045,height,panelD*0.96),side*width/2,y,z);
      P.add('hullDark',box(0.052,height*0.90,0.018),side*(width/2+0.004),y,z-panelD/2);
    }
    P.add('hullRubber',box(0.025,0.075,length*0.98),side*(width/2+0.008),y-height/2-0.035,0);
  }
}

function addEra(P, width, frontZ, roofY, rows = 2) {
  const { box } = KIT;
  const cols=7;
  for (let row=0; row<rows; row++) for (let col=0; col<cols; col++) {
    const x=(col-(cols-1)/2)*(width*0.82/cols);
    P.add('hullDetail',box(width*0.70/cols,0.07,0.22),x,roofY+0.04-row*0.08,frontZ-row*0.26,-0.20,0,0);
  }
}

function buildHull(P,p) {
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
    P.add('hullDark',cylZ(0.022,0.018,8),side*(width/2+0.035),trackTop*0.78,z,0,side*Math.PI/2,0);
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
    trackW,topY:trackTop*0.86,paintedEnds:true,coveredTop:p.skirts !== false,arms:p.arms !== false,
  });
  if (p.skirts !== false) addSegmentedSkirts(P,width,length*0.86,trackTop*0.72,trackTop*0.60,p.skirtPanels || wheelCount);
  return {width,length,halfL,roofY,trackTop};
}

function westernWedge(P,p) {
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
function abramsTurret(P,p) {
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

function sovietTurret(P,p) {
  const { lathe,box }=KIT;
  const r=p.turretWidth/2, h=p.turretHeight;
  P.add('turret',lathe([[r*0.86,0],[r,0.12],[r*0.94,h*0.48],[r*0.70,h*0.86],[r*0.40,h],[0.02,h]],28,p.turretDepth/(p.turretWidth||1)));
  if (p.bustle) P.add('turret',box(r*1.52,h*0.62,p.bustle),0,h*0.40,-p.turretDepth*0.47-p.bustle*0.32);
  if (p.era) for (const side of [-1,1]) for (let i=0;i<4;i++) {
    P.add('turretDetail',box(0.23,0.12,0.16),side*(0.25+i*0.22),h*0.54,p.turretFront*0.70-i*0.09,0,side*0.12,side*0.05);
  }
}

function merkavaTurret(P,p) {
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

function castTurret(P,p) {
  const { lathe }=KIT;
  const r=p.turretWidth/2,h=p.turretHeight;
  P.add('turret',lathe([[r*0.74,0],[r,0.12],[r*0.97,h*0.38],[r*0.82,h*0.75],[r*0.52,h],[0.02,h]],30,p.turretDepth/p.turretWidth));
}

function ifvTurret(P,p) {
  const { box,frustum }=KIT;
  const tw=p.turretWidth/2,h=p.turretHeight;
  P.add('turret',frustum(tw,p.turretFront,p.turretRear,tw*0.86,p.turretFront*0.78,p.turretRear*0.90,0,h));
  P.add('turretDark',box(tw*0.45,h*0.22,0.04),tw*0.32,h*0.56,p.turretFront+0.025);
}

function buildTurretAndGun(P,p) {
  const { box,cylY,cylZ,buildGun,cupola,periscope,pintleMG,smokeCluster }=KIT;
  if (p.turret === 'casemate') {
    // The armor/simulation rig still supplies a gun pitch group, but there is
    // no yawing turret shell. The hull superstructure is built above.
  } else if (p.turret === 'abrams') abramsTurret(P,p);
  else if (p.turret === 'soviet') sovietTurret(P,p);
  else if (p.turret === 'merkava') merkavaTurret(P,p);
  else if (p.turret === 'cast') castTurret(P,p);
  else if (p.turret === 'ifv') ifvTurret(P,p);
  else westernWedge(P,p);

  const h=p.turretHeight;
  if (p.turret !== 'ifv' && p.turret !== 'casemate') {
    cupola(P,'turret',p.commanderX ?? p.turretWidth*0.20,h,-p.turretDepth*0.22,Math.min(0.24,p.turretWidth*0.09),0.10,6);
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

function buildProfile(P,p) {
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

function buildAbramsVariant(P,p) {
  // Preserve the project's most detailed native procedural tank: welded
  // cheeks, long bustle, blow-off panels, CITV/GPS/CROWS, turbine grilles,
  // seven-panel skirts and the correctly stepped M256. Variant hardware is
  // additive and remains merged into those same material buckets.
  KIT.buildM1A2(P);
  const { box,cylY }=KIT;

  if (p.abramsKit === 'tusk') {
    // ARAT-1/2 side tiles in two staggered courses plus the rear slat cage.
    for (const side of [-1,1]) for (let i=0;i<8;i++) for (let row=0;row<2;row++) {
      const z=3.25-i*0.86+(row?0.10:0);
      P.add('hull',box(0.12,0.22,0.70),side*1.98,0.78+row*0.23,z,0,0,side*(row?0.04:-0.04));
      P.add('hullDark',box(0.018,0.18,0.62),side*2.045,0.78+row*0.23,z);
    }
    for (const side of [-1,1]) {
      P.add('hullDetail',box(0.04,0.05,1.35),side*2.06,1.16,-3.05);
      P.add('hullDetail',box(0.04,0.05,1.35),side*2.06,0.60,-3.05);
      for(let i=0;i<9;i++) P.add('hullDark',box(0.025,0.52,0.025),side*2.06,0.88,-2.48-i*0.14);
    }
    P.add('turretDetail',box(0.30,0.32,0.38),-0.52,1.27,-0.20); // loader shield
  } else if (p.abramsKit === 'sepv2') {
    // Raised CROWS station and rear bustle electronics/APU boxes.
    P.add('turretDetail',cylY(0.18,0.20,0.10,14),0.48,1.50,-0.55);
    P.add('turretDetail',box(0.34,0.30,0.36),0.48,1.69,-0.55);
    P.add('turretDark',box(0.21,0.12,0.04),0.48,1.68,-0.35);
    P.add('turret',box(0.52,0.34,0.58),1.35,0.38,-2.50);
  } else if (p.abramsKit === 'aim') {
    P.add('turretDetail',box(0.38,0.22,0.44),-0.88,1.08,0.22); // upgraded thermal housing
    P.add('turretDark',box(0.29,0.12,0.035),-0.88,1.08,0.46);
  }
}

const WESTERN={hull:'western',wheels:7,skirts:true,turret:'western',turretWidth:2.45,turretDepth:3.05,turretHeight:0.72,turretFront:1.05,turretRear:-1.65,pano:true,mg:true};
const LEOPARD={...WESTERN,turretWidth:2.62,turretDepth:3.42,turretHeight:0.76,turretFront:1.18,turretRear:-1.92,smokeCount:4,gunLength:4.0,antennaHeight:0.72};
const SOVIET={hull:'soviet',wheels:6,skirts:true,turret:'soviet',turretWidth:2.25,turretDepth:2.55,turretHeight:0.62,turretFront:0.92,turretRear:-1.18,era:true,pano:true,mg:true,gunLength:4.0};
const MERKAVA={hull:'merkava',wheels:6,skirts:true,turret:'merkava',turretWidth:2.18,turretDepth:2.85,turretHeight:0.72,turretFront:1.16,turretRear:-1.55,rearDoor:true,pano:true,mg:true,gunLength:2.9,antennaHeight:1.06};
const CLASSIC={hull:'classic',wheels:6,skirts:false,turret:'cast',turretWidth:2.25,turretDepth:2.55,turretHeight:0.76,turretFront:1.00,turretRear:-1.20,mg:true};
const WW2={...CLASSIC,pano:false,smoke:false,antennas:false,sleeve:false,evac:null,mg:false,arms:true};
const CASEMATE={...WW2,hull:'casemate',turret:'casemate',turretWidth:1.5,turretDepth:1.8,turretHeight:0.35,turretFront:0.72,turretRear:-0.9};
const ABRAMS={...WESTERN,family:'abrams',hull:'western',turret:'abrams',width:3.05,hullLength:7.25,roofY:1.58,trackW:0.56,turretWidth:2.48,turretDepth:3.42,turretHeight:0.74,turretFront:1.05,turretRear:-1.96,pano:true,mg:true,gunLength:3.25,antennaHeight:0.72};

export const PROCEDURAL_PROFILES={
  // Community/reference WW2 and inter-war vehicles that previously fell
  // through to the generic rectangular placeholder.
  strv103:{...CASEMATE,width:3.18,hullLength:7.04,roofY:1.55,trackW:0.55,wheels:4,skirts:true,casemateWidth:2.65,casemateHeight:0.72,casemateDepth:3.9,gunLength:4.1,gunRadius:0.065},
  is3:{...SOVIET,width:3.15,hullLength:6.90,roofY:1.42,trackW:0.58,wheels:6,turretWidth:2.35,turretDepth:2.55,turretHeight:0.70,bustle:0,pano:false,smoke:false,antennas:false,sleeve:false,evac:null},
  t34_85_cad:{...WW2,width:3.00,hullLength:6.10,roofY:1.50,trackW:0.50,wheels:5,turretWidth:2.08,turretDepth:2.28,turretHeight:0.72,gunLength:4.15,gunRadius:0.06},
  newc_tiger:{...WW2,width:3.70,hullLength:6.32,roofY:1.62,trackW:0.72,wheels:8,turret:'western',turretWidth:2.65,turretDepth:2.65,turretHeight:0.72,turretFront:0.88,turretRear:-1.45,gunLength:4.65,gunRadius:0.065},
  newc_pziii:{...WW2,width:2.95,hullLength:5.56,roofY:1.42,trackW:0.45,wheels:6,turret:'western',turretWidth:1.92,turretDepth:1.95,turretHeight:0.62,turretFront:0.75,turretRear:-0.95,gunLength:2.65,gunRadius:0.042},
  pziii_konserwa:{...WW2,width:2.95,hullLength:5.56,roofY:1.42,trackW:0.45,wheels:6,turret:'western',turretWidth:1.92,turretDepth:1.95,turretHeight:0.62,turretFront:0.75,turretRear:-0.95,gunLength:2.65,gunRadius:0.042},
  leichttraktor:{...WW2,width:2.26,hullLength:4.21,roofY:1.25,trackW:0.35,wheels:4,turret:'western',turretWidth:1.45,turretDepth:1.48,turretHeight:0.52,turretFront:0.58,turretRear:-0.72,gunLength:1.55,gunRadius:0.035},
  recon_tank:{hull:'ifv',width:2.22,hullLength:5.25,roofY:1.70,trackTop:0.66,trackW:0.34,wheels:5,skirts:true,
    turret:'ifv',turretWidth:1.42,turretDepth:1.55,turretHeight:0.50,turretFront:0.62,turretRear:-0.78,gunLength:2.25,gunRadius:0.035,sleeve:false,evac:null,pano:false,mg:false,smoke:false},
  q_heavy:{...WW2,width:3.55,hullLength:7.20,roofY:1.64,trackW:0.62,wheels:7,turret:'western',turretWidth:2.58,turretDepth:2.85,turretHeight:0.78,turretFront:0.95,turretRear:-1.58,gunLength:4.8,gunRadius:0.075},
  kv2:{...WW2,width:3.32,hullLength:6.75,roofY:1.52,trackW:0.58,wheels:6,turret:'ifv',turretWidth:2.55,turretDepth:2.35,turretHeight:1.55,turretFront:0.98,turretRear:-1.18,gunLength:3.15,gunRadius:0.09},
  tiger2:{...WW2,width:3.75,hullLength:7.38,roofY:1.58,trackW:0.72,wheels:9,turret:'western',turretWidth:2.62,turretDepth:3.05,turretHeight:0.75,turretFront:1.05,turretRear:-1.68,gunLength:5.45,gunRadius:0.07},
  sherman_jumbo:{...WW2,width:2.99,hullLength:5.84,roofY:1.73,trackW:0.48,wheels:6,turretWidth:2.10,turretDepth:2.25,turretHeight:0.80,gunLength:3.35,gunRadius:0.055},
  jagdtiger:{...CASEMATE,width:3.75,hullLength:7.30,roofY:2.38,trackW:0.72,wheels:9,casemateWidth:3.05,casemateHeight:1.25,casemateDepth:4.40,gunLength:5.6,gunRadius:0.082},
  jpz_e100:{...CASEMATE,width:4.05,hullLength:8.60,roofY:2.48,trackW:0.78,wheels:8,casemateWidth:3.20,casemateHeight:1.30,casemateDepth:4.20,gunLength:6.1,gunRadius:0.10},
  sturmtiger:{...CASEMATE,width:3.70,hullLength:6.28,roofY:2.32,trackW:0.70,wheels:8,casemateWidth:2.95,casemateHeight:1.35,casemateDepth:3.60,gunLength:1.05,gunRadius:0.19,mantletWidth:0.72,mantletHeight:0.72},
  t95:{...CASEMATE,width:4.55,hullLength:7.24,roofY:1.78,trackW:0.78,wheels:8,casemateWidth:2.82,casemateHeight:0.76,casemateDepth:3.85,gunLength:5.35,gunRadius:0.078},
  is7:{...SOVIET,width:3.40,hullLength:7.38,roofY:1.50,trackW:0.62,wheels:7,turretWidth:2.48,turretDepth:2.72,turretHeight:0.72,bustle:0,pano:false,smoke:false,antennas:false,sleeve:false,evac:null},
  object279:{...SOVIET,width:3.60,hullLength:6.77,roofY:1.42,trackW:0.48,wheels:6,turretWidth:2.38,turretDepth:2.60,turretHeight:0.68,bustle:0,pano:false,smoke:false,antennas:false,sleeve:false,evac:null},
  is6b:{...SOVIET,width:3.10,hullLength:6.30,roofY:1.44,trackW:0.58,wheels:6,turretWidth:2.30,turretDepth:2.52,turretHeight:0.70,bustle:0,pano:false,smoke:false,antennas:false,sleeve:false,evac:null},

  // Native modern sourced variants.
  m1a2:{...ABRAMS,width:2.98,turretHeight:0.74,pano:true},
  m1a1:{...ABRAMS,width:2.92,turretHeight:0.70,pano:false},
  m1a2_tusk:{...ABRAMS,width:3.90,hullLength:7.70,turretWidth:2.76,turretHeight:0.80,skirtPanels:8,gunLength:4.65,abramsKit:'tusk'},
  m1a2_tejas:{...ABRAMS,width:2.92,turretHeight:0.72,pano:true},
  abramsx:{...ABRAMS,width:3.05,turretWidth:2.30,turretDepth:3.15,turretHeight:0.62,turretRear:-1.72,pano:true},
  t90a:{...SOVIET,width:3.10,hullLength:6.86,roofY:1.42,trackW:0.56,turretWidth:2.18,turretDepth:2.62,turretHeight:0.67,bustle:0.28,pano:true},
  kf51:{...LEOPARD,width:3.60,hullLength:7.70,roofY:1.72,trackW:0.64,turretWidth:2.45,turretDepth:3.45,turretHeight:0.72,turretFront:1.18,turretRear:-1.96,gunLength:6.63,gunRadius:0.085,pano:true},
  leo2a6:{...LEOPARD,width:3.08,hullLength:7.72,roofY:1.78,trackW:0.57,turretWidth:2.30,turretDepth:3.20,turretHeight:0.72,turretFront:1.10,turretRear:-1.80,gunLength:6.25,gunRadius:0.079,antennaHeight:0.88,pano:true},

  // British first-generation MBTs / IFV.
  challenger1:{...WESTERN,width:3.45,hullLength:8.30,roofY:1.68,trackW:0.62,turretWidth:2.48,turretDepth:3.10,turretHeight:0.78},
  chieftain5:{...CLASSIC,width:3.47,hullLength:7.52,roofY:1.84,trackW:0.58,turretWidth:2.55,turretDepth:2.95,turretHeight:0.86,pano:false,gunLength:5.75,antennaHeight:0.82},
  fv510:{hull:'ifv',width:3.05,hullLength:6.34,roofY:2.15,trackTop:0.86,trackW:0.46,wheels:6,skirts:true,
    turret:'ifv',turretWidth:1.08,turretDepth:1.28,turretHeight:0.38,turretFront:0.55,turretRear:-0.68,gunRadius:0.035,gunLength:2.35,sleeve:false,evac:null,pano:false,mg:false},

  // Leopard 2 lineage: each receives the correct generation-specific turret.
  leo2_revolution:{...LEOPARD,width:3.25,hullLength:7.72,roofY:1.64,trackW:0.61,turretWidth:2.10,turretDepth:3.18,turretHeight:0.64,pano:true},
  leo2a5:{...LEOPARD,width:3.20,hullLength:7.72,roofY:1.66,trackW:0.61,turretHeight:0.72},
  leo2a7v:{...LEOPARD,width:2.42,hullLength:7.20,roofY:1.78,trackW:0.48,turretWidth:1.68,turretDepth:2.76,turretHeight:0.62,gunLength:3.65,antennaHeight:0.92},
  leopard2_proto:{...WESTERN,width:3.55,hullLength:7.65,roofY:1.58,trackW:0.61,turret:'cast',turretWidth:2.55,turretDepth:2.95,turretHeight:0.68,pano:false},

  // Abrams derivatives use dedicated broad-bustle geometry instead of a
  // Leopard-shaped hull. Widths reflect the normalized local references.
  m1a1ha:{...ABRAMS,width:2.90,turretWidth:2.48,turretDepth:3.42,turretHeight:0.72,pano:false},
  m1a2_sepv2:{...ABRAMS,width:3.18,hullLength:7.05,turretWidth:2.62,turretDepth:3.52,turretHeight:0.78,turretRear:-2.00,pano:true,gunLength:3.55,abramsKit:'sepv2'},
  m1a1_aim:{...ABRAMS,width:3.55,hullLength:7.65,trackW:0.62,turretWidth:2.72,turretDepth:3.55,turretHeight:0.74,turretRear:-2.02,pano:false,gunLength:6.15,abramsKit:'aim'},

  // Patton and Soviet export families.
  m60a1:{...CLASSIC,width:3.63,hullLength:6.95,roofY:1.62,trackW:0.55,turretWidth:2.42,turretDepth:2.85,turretHeight:0.85,pano:false},
  pt91m:{...SOVIET,width:3.15,hullLength:6.86,roofY:1.42,trackW:0.55,turretWidth:2.22,turretDepth:2.58,turretHeight:0.66,bustle:0.58},
  t62mv1:{...SOVIET,width:3.30,hullLength:6.63,roofY:1.38,trackW:0.55,turretWidth:2.18,turretDepth:2.46,turretHeight:0.64,bustle:0},
  t64bv1:{...SOVIET,width:3.35,hullLength:6.54,roofY:1.38,trackW:0.56,turretWidth:2.20,turretDepth:2.52,turretHeight:0.62,bustle:0},
  t72b_1987:{...SOVIET,width:3.45,hullLength:6.67,roofY:1.40,trackW:0.58,turretWidth:2.24,turretDepth:2.58,turretHeight:0.64,bustle:0},
  t72b3m:{...SOVIET,width:2.62,hullLength:6.67,roofY:1.39,trackW:0.48,turretWidth:1.94,turretDepth:2.44,turretHeight:0.65,bustle:0.42,pano:true,gunLength:3.75},
  t72bu:{...SOVIET,width:3.25,hullLength:6.86,roofY:1.40,trackW:0.56,turretWidth:2.18,turretDepth:2.56,turretHeight:0.65,bustle:0.35},
  t90sm:{...SOVIET,width:3.40,hullLength:6.86,roofY:1.43,trackW:0.58,turretWidth:2.32,turretDepth:2.95,turretHeight:0.69,bustle:0.82,pano:true},
  t90a_vladimir:{...SOVIET,width:3.10,hullLength:6.86,roofY:1.42,trackW:0.56,turretWidth:2.20,turretDepth:2.62,turretHeight:0.68,bustle:0.26,pano:true},

  // Merkava generations: narrower early castings, progressively larger
  // modular wedges, all with front-engine hulls and six-wheel suspensions.
  merkava1b:{...MERKAVA,width:2.58,hullLength:5.76,roofY:1.66,trackW:0.46,turret:'cast',turretWidth:1.64,turretDepth:2.18,turretHeight:0.58,pano:false,gunLength:2.75},
  merkava2b:{...MERKAVA,width:2.58,hullLength:5.78,roofY:1.67,trackW:0.46,turret:'cast',turretWidth:1.70,turretDepth:2.26,turretHeight:0.60,pano:false,gunLength:2.75},
  merkava2d:{...MERKAVA,width:2.60,hullLength:5.78,roofY:1.67,trackW:0.47,turretWidth:1.78,turretDepth:2.38,turretHeight:0.62,pano:false,gunLength:2.75},
  merkava3b:{...MERKAVA,width:2.62,hullLength:5.88,roofY:1.70,trackW:0.47,turretWidth:1.84,turretDepth:2.46,turretHeight:0.63,gunLength:2.80},
  merkava3c:{...MERKAVA,width:2.62,hullLength:5.88,roofY:1.70,trackW:0.47,turretWidth:1.86,turretDepth:2.50,turretHeight:0.64,gunLength:2.80},
  merkava3d:{...MERKAVA,width:2.64,hullLength:5.92,roofY:1.71,trackW:0.48,turretWidth:1.92,turretDepth:2.60,turretHeight:0.66,gunLength:2.85},
  merkava4b:{...MERKAVA,width:2.82,hullLength:6.42,roofY:1.72,trackW:0.51,turretWidth:2.06,turretDepth:2.72,turretHeight:0.68,pano:true,gunLength:3.10},

  type90:{...WESTERN,width:2.34,hullLength:6.24,roofY:1.70,trackW:0.45,wheels:6,turretWidth:1.68,turretDepth:2.42,turretHeight:0.62,turretFront:0.78,turretRear:-1.34,pano:false,gunLength:3.15,antennaHeight:0.82},

  // Second recovered archive: dedicated British, Soviet and US silhouettes.
  is3_bergman:{...SOVIET,width:3.15,hullLength:6.90,roofY:1.42,trackW:0.58,wheels:6,turretWidth:2.35,turretDepth:2.55,turretHeight:0.70,bustle:0,pano:false,smoke:false,antennas:false,sleeve:false,evac:null},
  isu152:{...CASEMATE,width:3.07,hullLength:6.80,roofY:2.05,trackW:0.55,wheels:6,casemateWidth:2.55,casemateHeight:1.08,casemateDepth:3.70,gunLength:3.25,gunRadius:0.09},
  isu122s:{...CASEMATE,width:3.07,hullLength:6.80,roofY:2.05,trackW:0.55,wheels:6,casemateWidth:2.55,casemateHeight:1.08,casemateDepth:3.70,gunLength:4.75,gunRadius:0.072},
  centurion3:{...CLASSIC,width:3.39,hullLength:7.60,roofY:1.58,trackW:0.57,wheels:6,turretWidth:2.35,turretDepth:2.72,turretHeight:0.76,pano:false},
  centurion5:{...CLASSIC,width:3.39,hullLength:7.60,roofY:1.58,trackW:0.57,wheels:6,turretWidth:2.38,turretDepth:2.76,turretHeight:0.78,pano:false},
  comet:{...WW2,width:3.04,hullLength:6.55,roofY:1.46,trackW:0.50,wheels:5,turret:'western',turretWidth:2.05,turretDepth:2.35,turretHeight:0.68,turretFront:0.82,turretRear:-1.28,gunLength:4.10,gunRadius:0.052},
  challenger_cruiser:{...WW2,width:2.91,hullLength:8.15,roofY:1.48,trackW:0.47,wheels:5,turret:'western',turretWidth:2.02,turretDepth:2.32,turretHeight:0.72,turretFront:0.84,turretRear:-1.25,gunLength:4.25,gunRadius:0.052},
  charioteer:{...CLASSIC,width:3.05,hullLength:6.55,roofY:1.46,trackW:0.50,wheels:5,turret:'western',turretWidth:2.08,turretDepth:2.52,turretHeight:0.82,turretFront:0.88,turretRear:-1.38,pano:false},
  m46_patton:{...CLASSIC,width:3.51,hullLength:6.35,roofY:1.58,trackW:0.55,wheels:6,turretWidth:2.45,turretDepth:2.70,turretHeight:0.82,pano:false},
  m47_patton:{...CLASSIC,width:3.51,hullLength:6.35,roofY:1.60,trackW:0.55,wheels:6,turretWidth:2.52,turretDepth:2.82,turretHeight:0.86,pano:false},
  m26_pershing:{...CLASSIC,width:3.51,hullLength:6.33,roofY:1.55,trackW:0.54,wheels:6,turretWidth:2.42,turretDepth:2.72,turretHeight:0.80,pano:false},
  m45_patton:{...CLASSIC,width:3.51,hullLength:6.33,roofY:1.55,trackW:0.54,wheels:6,turretWidth:2.46,turretDepth:2.76,turretHeight:0.84,pano:false,gunRadius:0.075},
  m60a3:{...CLASSIC,width:3.63,hullLength:6.95,roofY:1.62,trackW:0.55,wheels:6,turretWidth:2.42,turretDepth:2.85,turretHeight:0.85,pano:true},
};

export const PROFILED_BUILDERS=Object.fromEntries(Object.entries(PROCEDURAL_PROFILES)
  .map(([id,profile])=>[id,(P)=>profile.family === 'abrams'
    ? buildAbramsVariant(P,profile)
    : buildProfile(P,profile)]));
