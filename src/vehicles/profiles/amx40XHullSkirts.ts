// Original folded sheet sections from independent plane/dimension readings.
// Rear skin and thicker forward apron are separate courses, not six boxes.
import {KIT} from './kit.ts';
import {sectionSolid,type SectionPoint} from './sectionSolid.ts';
import {beamBetween} from './measuredPrimitives.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';

function lower(z:number):number {
  if(z< -2.7634)return .7561+(-2.7634-z)*1.006;
  if(z>2.7748)return .7577+(z-2.7748)*1.2256;
  return .7561+(z+2.7634)*.000289;
}
function outer(y:number,z:number,rear:boolean):number {
  if(!rear)return 1.6805;
  return Math.max(1.643014+.00005944*y+.00081759*z,
    1.657710-.00957555*y+.00349933*z);
}
function inner(y:number,z:number,rear:boolean):number {
  if(!rear)return 1.637545-.0015126*y;
  return Math.max(1.637621-.000608565*y+.001469626*z,
    1.639010-.001522691*y+.001721849*z);
}
function ring(z:number,rear:boolean):SectionPoint[] {
  const floor=lower(z),top=1.2901;
  const fold=Math.max(floor+.0005,Math.min(top-.0005,(.014696+.00268174*z)/.00963499));
  const root=1.5881+Math.max(0,z+.843)*.001944;
  return [[inner(floor,z,rear),floor],[outer(floor,z,rear),floor],
    [outer(fold,z,rear),fold],[outer(top,z,rear),top],
    [1.6330,1.312],[1.626,1.3203],[root,1.322],
    [root,1.313],[1.623,1.308],[1.627,1.296],
    [inner(1.286,z,rear),1.286]];
}
function addSkirtCourse(P:TankBuilderPort,side:number,rear:boolean):void {
  const stations=rear?[-3.29,-2.7634,-2.2,-1.5,-.846]:[-.846,0,1.5,2.7595,2.7748,3.188];
  const rows=stations.map(z=>({z,ring:ring(z,rear).map(([x,y])=>[side<0?-x+.0025:x,y] as SectionPoint)}));
  if(side<0)for(const row of rows)row.ring.reverse();
  P.addMudguard(`amx40-x-${rear?'aft-skin':'fore-apron'}`,'hullDetail',sectionSolid(rows));
  if(!rear) {
    const x=side<0?-1.61735:1.61985;
    // Small forward top step belongs to the rolled attachment flange.
    P.add('hullDetail',KIT.box(.047,.0436,.2079),x,1.3119,2.86385);
  }
}
export function addAmx40HullSkirts(P:TankBuilderPort):void {
  for(const side of [-1,1])for(const rear of [true,false])addSkirtCourse(P,side,rear);
}
export function addAmx40HullSideFittings(P:TankBuilderPort):void {
  // Two measured starboard side plates stand above the narrow skirt flange.
  // Their inner faces overlap the permanent shoulder by3.2 mm.
  for(const[z,d,y,h]of [[-.8994,.6348,1.47615,.2891],[-2.11815,.3203,1.5469,.333]])
    P.add('hullDetail',KIT.box(.0225,h,d),1.60105,y,z);
  // Separate port folded clasp: two legs and a short transverse crown,
  // retaining the open centre rather than substituting a solid side box.
  for(const z of [-1.997,-1.961]) {
    P.add('hullDetail',beamBetween([-1.585,1.661,z],[-1.640,1.680,z],.003));
    P.add('hullDetail',beamBetween([-1.640,1.680,z],[-1.660,1.643,z],.003));
  }
  P.add('hullDetail',KIT.cylZ(.006,.046,12),-1.655,1.683,-1.979);
}
