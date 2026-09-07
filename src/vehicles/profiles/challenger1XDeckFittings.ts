// Original exterior details from AESP2350-P-100-201 Figs1,17,20,21.
// Dimensions are explicitly drawing-led assembly estimates, not sampled mesh
// vertices or precision measurements from the printed perspective drawings.
import {KIT} from './kit.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
const {box,cylX,cylY,cylZ}=KIT;
// Fig17 distinguishes four rear access covers, two broad forward outer
// radiator covers, and two narrow fixed center air fields. Sizes below are
// perspective-drawing estimates, not precision source measurements.
const ACCESS_BANKS = [[.25,-3.43,.50,.82],[.81,-3.43,.50,.82],
  [.72,-2.48,.68,.77]] as const;

function louvreSkin(P:TankBuilderPort,x:number,z:number,width:number,length:number):void {
  P.addEquipment('hullDetail',box(width,.035,length),x,1.825,z);
  const count=Math.floor(length/.045);
  for(let i=0;i<count;i++)P.addEquipment('hullDark',box(width-.035,.013,.020),
    x,1.849,z-length/2+.03+i*.045);
  for(const dx of [-width/2+.009,width/2-.009])P.addEquipment('hullDetail',
    box(.018,.014,length-.02),x+dx,1.846,z);
  for(const dz of [-length/2+.01,length/2-.01])P.addEquipment('hullDetail',
    box(width,.014,.020),x,1.846,z+dz);
}

export function addChallenger1XLouvreBanks(P:TankBuilderPort):void {
  for(const side of [-1,1]) {
    for(const [x,z,width,length]of ACCESS_BANKS)louvreSkin(P,side*x,z,width,length);
    louvreSkin(P,side*.17,-2.48,.315,.77);
  }
}

function openHandle(P:TankBuilderPort,bucket:string,x:number,y:number,z:number,width:number):void {
  for(const dx of [-width/2,width/2])P.addEquipment(bucket,box(.025,.030,.041),x+dx,y-.015,z);
  P.addEquipment(bucket,cylX(.009,width+.016,12),x,y,z);
}
function louvreFurniture(P:TankBuilderPort,x:number,z:number,width:number,length:number):void {
  // Folded frame, two positive hinge eyes and actual grasp handle above the
  // existing louvre bank. The handle middle remains air, not a filled bar.
  for(const dx of [-width*.34,width*.34]) {
    P.addEquipment('hullDetail',cylX(.013,.050,12),x+dx,1.854,z+length/2-.025);
    P.addEquipment('hullDetail',box(.023,.020,.047),x+dx,1.846,z+length/2-.019);
  }
  openHandle(P,'hullDetail',x,1.883,z-length/2+.080,.112);
}
function deckCatches(P:TankBuilderPort):void {
  for(const side of [-1,1])for(const z of [-3.76,-3.10,-2.78,-2.18]) {
    const x=side*1.045,y=1.856;
    P.addEquipment('hullDetail',box(.065,.018,.045),x,y,z);
    P.addEquipment('hullDetail',cylY(.021,.025,.023,10),x,y+.020,z);
    P.addEquipment('hullDetail',box(.074,.015,.018),x+side*.033,y+.026,z);
  }
  // Low service-cover hinge straps and fasteners are above their existing
  // cover skins, not on the lower structural engine deck beneath them.
  for(const side of [-1,1])for(const z of [-1.94,-1.22])for(const dx of [-.19,.19]) {
    P.addEquipment('hullDetail',box(.046,.014,.037),side*.58+dx,1.819,z);
    P.addEquipment('hullDetail',cylY(.010,.012,.008,6),side*.58+dx,1.829,z);
  }
}
export function addChallenger1XDeckFittings(P:TankBuilderPort):void {
  for(const side of [-1,1])for(const [x,z,width,length]of ACCESS_BANKS)
    louvreFurniture(P,side*x,z,width,length);
  deckCatches(P);
  openHandle(P,'hullDetail',0,1.727,2.04,.14);
  // Fig1 hatch clamp and the upright beside its oblong door are separately
  // supported external forms. The original driver's sight air is untouched.
  P.addEquipment('hullDetail',cylY(.027,.031,.049,14),-.251,1.711,2.028);
  P.addEquipment('hullDetail',box(.094,.017,.025),-.276,1.738,2.028);
  for(const side of [-1,1]) {
    const x=side*1.30;
    for(const dx of [-.145,.145]) {
      P.addEquipment('hullDetail',cylZ(.035,.041,16),x+dx,1.526,3.477);
      P.addEquipment('hullGlass',cylZ(.025,.006,16),x+dx,1.526,3.501);
    }
    P.addEquipment('hullDetail',box(.381,.022,.159),x,1.600,3.456);
    for(const dx of [-.16,.16])P.addEquipment('hullDetail',cylZ(.011,.022,6),x+dx,1.421,3.604);
  }
}
