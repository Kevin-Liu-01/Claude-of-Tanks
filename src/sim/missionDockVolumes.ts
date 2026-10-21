// The drone dock's certified volumes: the parked airframe's stock bounds and the open cradle's solids, relative to a
// seat's datum. A leaf of src/sim/missionAttachment.ts (which re-exports every name here), split out on 2026-10-12 (the
// 221 integration) so the decor builder's dock keep-out (src/vehicles/decorations.ts dockKeepOut, items 2b/2c) reads them
// without missionAttachment.ts's seat search, whose vehicle auxiliary inventory and weapons are battle-only: through
// decorations.ts they put about 400 kB into the garage boot (tools/boot-static-closure.selftest.mjs, the bundle budget).
// Moved verbatim: the values, and the mission-attachment signatures that hash DRONE_DOCK_VOLUMES, do not change.
// The launch column's height is the ruleset's AERIAL_RULES.drone.launchHeightM, read from its leaf (2026-10-16): the
// ruleset itself would put every mode rule into every vehicle build's import graph (src/sim/droneDockRules.ts).
import { DRONE_LAUNCH_HEIGHT_M } from './droneDockRules.ts';
import type { MissionAttachment } from './missionAttachment.ts';

type Vec3Tuple = readonly [number, number, number];
type Bounds = { sweepRadius?:number; min: readonly number[]; max: readonly number[]; structureKind?: string | null; vertices?: readonly Vec3Tuple[]; faces?: readonly {indices: readonly number[]; normal: readonly number[]; constant: number}[] };
export const DRONE_AIRFRAME_SCALE = .45;
export const DRONE_DOCK_HEIGHT_M = .1375;
// Finite stock volumes leave the real open air below each rotor available.
// Bounds are relative to the cradle datum, and geometry tests verify that every
// national model and every spinning blade stays inside their union.
const REFERENCE_STOCK: readonly Bounds[] = [
  {min:[-.14,.057,-.33],max:[.14,.327,.244]},
  {min:[-.10,.28,-.192],max:[.10,.390,-.110]},
  ...[-1,1].flatMap(side=>[
    {min:[side*.084-.014,.174,-.316],max:[side*.084+.014,.205,.316]},
    {min:[side*.108-.052,.038,-.173],max:[side*.108+.052,.199,.199]},
    ...[-1,1].flatMap(end=>[
      {min:[side*.288-.188,.230,end*.288-.188],max:[side*.288+.188,.263,end*.288+.188]},
      {min:[side*.288-.047,.151,end*.288-.047],max:[side*.288+.047,.253,end*.288+.047]},
      {min:[side>0?.050:-.311,.172,end>0?.032:-.317],max:[side>0?.311:-.050,.222,end>0?.317:-.032]},
    ]),
  ]),
];
// These measured stock bounds use the 0.6-scale authoring airframe and its
// 0.17 m origin. Apply the same uniform final scale as the rendered airframe.
const stockRatio=DRONE_AIRFRAME_SCALE/.6;
const stockPoint=(p:readonly number[])=>[p[0]!*stockRatio,(p[1]!-.17)*stockRatio+DRONE_DOCK_HEIGHT_M,p[2]!*stockRatio];
export const DRONE_DOCK_VOLUMES:readonly Bounds[]=REFERENCE_STOCK.map(b=>({min:stockPoint(b.min),max:stockPoint(b.max)}));
/** The optional short cantilever moves only the landing pad; its four feet
 * remain on the certified roof. Both rendered kit and launch use this datum. */
export function missionAirframeVolumes(seat:MissionAttachment,takeoff=false):Bounds[] {
 const [x,z]=seat.payloadOffset??[0,0];
 return DRONE_DOCK_VOLUMES.map(part=>({min:[part.min[0]!+x,part.min[1]!,part.min[2]!+z],
  max:[part.max[0]!+x,part.max[1]!+(takeoff?DRONE_LAUNCH_HEIGHT_M:0),part.max[2]!+z]}));
}
/** Exact open cradle solids, shared by the renderer and native collision audit. */
interface MissionCradleVolume extends Bounds { roofContact?:boolean; brace?:{start:Vec3Tuple;end:Vec3Tuple;thickness:number} }
export function missionCradleVolumes(seat:MissionAttachment):MissionCradleVolume[] {
  const result:MissionCradleVolume[]=[];
  const [dx,dz]=seat.payloadOffset??[0,0];
  const box=(w:number,h:number,d:number,x:number,y:number,z:number,roofContact=false)=>{
    result.push({min:[x-w/2,y-h/2,z-d/2],max:[x+w/2,y+h/2,z+d/2],roofContact});
  };
  for(const z of [-seat.footZ,seat.footZ])box(seat.width+Math.abs(dx),.028,.055,dx/2,0,z);
  box(.10,.045,.12,0,.012,-seat.footZ);
  for(const [xi,x]of [-seat.footX,seat.footX].entries()){
    box(.052,.032,seat.depth+Math.abs(dz),x+dx,.005,dz/2);
    for(const [zi,z]of [-seat.footZ,seat.footZ].entries()){
      box(.085,.018,.10,x+dx,.030,z+dz);box(.018,.052,.09,x+dx+Math.sign(x)*.047,.020,z+dz);
      const foot=seat.y-(seat.supportY?.[xi*2+zi]??seat.y-.045);
      box(.038,foot,.045,x,-foot/2,z,true);box(.095,.016,.10,x,-foot+.004,z,true);
    }
  }
  if(seat.braced) {
    const rise=seat.y-Math.max(...(seat.supportY??[seat.y-.045]));
    if(rise>=.20) {
      const lower=-rise+.08,upper=-.045,thickness=.022,pad=thickness/Math.SQRT2;
      const brace=(start:Vec3Tuple,end:Vec3Tuple)=>result.push({
        min:start.map((v,i)=>Math.min(v,end[i]!)-pad),max:start.map((v,i)=>Math.max(v,end[i]!)+pad),
        brace:{start,end,thickness},
      });
      // Four diagonal members tie both axes of the tall open stand into its
      // measured legs. Their finite conservative bounds are collision stock;
      // the renderer draws the actual straight members, never stepped boxes.
      for(const sign of [-1,1]) {
        brace([sign*seat.footX,lower,-seat.footZ],[sign*seat.footX,upper,seat.footZ]);
        brace([-seat.footX,lower,sign*seat.footZ],[seat.footX,upper,sign*seat.footZ]);
      }
    }
  }
  return result;
}
