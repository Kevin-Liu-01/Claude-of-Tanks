// Original thin folded-sheet primitives. Scalar bend/rake/thickness evidence
// comes from the unchanged local Type 10 oracle; no source contour is copied.
import {KIT} from './kit.ts';
import {markFixedPaintedPanel} from './fixedPaintedPanel.ts';
import {sectionSolid,type SolidSection} from './sectionSolid.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';

const clamp=(n:number)=>Math.max(0,Math.min(1,n));
const ramp=(z:number,a:number,b:number)=>clamp((z-a)/(b-a));
const tent=(z:number,c:number,r:number)=>Math.max(0,1-Math.abs(z-c)/r);
const SPANS=[[-2.4732,-1.4735],[-1.4782,-.2190],[-.2167,1.0250],
  [1.0285,2.2909648],[2.2940,3.1363]] as const;

function sheetX(panel:number,z:number,t:number):number {
  const low=1-t,belly=4*t*low;
  if(panel===0)return 1.5741+.0192*tent(z,-1.75,.48)*low**2
    +.06943*(1-ramp(z,-2.4732,-2.355))*low**1.14
    -.0110*ramp(z,-1.70,-1.4735)*belly;
  if(panel===1)return 1.5752+.0230*(1-ramp(z,-1.36,-.43))*low**2
    +.0827472*ramp(z,-.350,-.2190)*low**1.25-.0045*belly;
  if(panel===2)return 1.5752+(.0600-.0517*clamp((z+.063)/.886))*low**1.50
    -.0185*(1-ramp(z,-.2167,-.063))*low
    +.0250*ramp(z,.83,1.0250)*low**1.65+.0020*belly;
  if(panel===3)return 1.5746+(.0030+.0167*ramp(z,1.22,2.12))*low**2
    +.0452*(1-ramp(z,1.0285,1.22))*low**1.25
    +.100348685*ramp(z,2.105,2.2909648)*low**1.35-.0060*belly;
  return 1.5745+.0133*low**2+.05673*(1-ramp(z,2.294,2.48))*low**1.65
    +.0200*ramp(z,2.92,3.1363)*low**1.55+.0030*belly;
}

function sheetFloor(panel:number,z:number):number {
  const floor=.390227+.0100435*z;
  if(panel===0)return Math.max(floor,-.5886852-.438727*z);
  if(panel===4)return Math.max(floor,.4254067+.554724*(z-2.9));
  return floor;
}

function sheetSection(panel:number,side:number,z:number):SolidSection {
  const floor=sheetFloor(panel,z),top=.783621+.0100435*z;
  const outside=[0,.25,.5,.75,1].map(t=>
    [sheetX(panel,z,t),floor+(top-floor)*t] as [number,number]);
  const inside=outside.map(([x,y])=>[x-.0064,y] as [number,number]).reverse();
  const ring=[...outside,...inside];
  return{z,ring:side<0?ring.map(([x,y])=>[-x,y] as [number,number]).reverse():ring};
}

function addSheet(P:TankBuilderPort,panel:number,side:number):void {
  const [a,b]=SPANS[panel];
  // Regular authoring subdivisions approximate the analytic bend functions,
  // rather than repeating source vertices or its triangulation.
  const sections=Array.from({length:49},(_,i)=>sheetSection(panel,side,a+(b-a)*i/48));
  P.addEquipment('hullPaintedDetail',markFixedPaintedPanel(sectionSolid(sections),
    'type10-painted-folded-skirt','hullDetail'));
}

function addHinges(P:TankBuilderPort,side:number):void {
  // The source has small horizontal U straps near the upper fascia's lower
  // edge, not the former broad, disconnected boxes along the shoulder roof.
  for(const z of [-2.62549,-2.33705,-1.66135,-1.35956,-.40878,-.08358,
    .83199,1.15052,2.13445,2.41356]) {
    const y=.84191+.0100435*z;
    for(const dz of [-.040,.040])
      P.addEquipment('hullDetail',KIT.box(.038,.0107,.006),side*1.5905,y,z+dz);
    P.addEquipment('hullDetail',KIT.box(.0100,.0107,.080),side*1.6140,y,z);
  }
}

export function addType10Skirts(P:TankBuilderPort,side:number):void {
  for(let panel=0;panel<SPANS.length;panel++)addSheet(P,panel,side);
  addHinges(P,side);
}
