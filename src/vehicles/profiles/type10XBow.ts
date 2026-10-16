// Original source-measured spare-link bodies and cross pins; no source buffers.
import {KIT} from './kit.ts';
import {withSpareTrackRun} from '../spareTrackSeat.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';

export function addType10BowLinks(P0:TankBuilderPort):void {
  // VEH-13: each link with its pins is one registered run (spareTrackSeat.ts)
  for(const x of [-.731826,-.192168,.192171,.731828]) withSpareTrackRun(P0,{site:'type10-bow-link',source:'adhoc',
    rotation:[.615620555,0,0],axis:2},(P)=>{
    // 1.4 mm concealed back extension engages the permanent measured face;
    // the complete source front plane and outer silhouette are unchanged.
    P.addEquipment('hullDark',KIT.box(.318035,.351478,.054583),
      x,.884108868,3.461063327,.615620555);
    for(const side of [-1,1]) {
      for(const [y,z]of[[.977979,3.570072],[.751793,3.410087]])
        P.addEquipment('hullDetail',KIT.cylZ(.0157,.0172,10),x+side*.12308,y,z,.615620555);
      for(const [y,z]of[[.912070,3.533590],[.829137,3.475061]]) {
        const pin=KIT.cylZ(.0146,.0168,10);pin.scale(.0149/.0292,1,1);
        P.addEquipment('hullDetail',pin,x+side*.05536,y,z,.615620555);
      }
    }
  });
}
