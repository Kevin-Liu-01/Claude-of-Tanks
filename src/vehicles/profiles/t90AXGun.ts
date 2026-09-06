// Original circular solids from independently measured owner-source stations.
// This is the A-specific two-stage taper, not the shared Soviet barrel recipe.
import {KIT} from './kit.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';

function tube(P:TankBuilderPort,start:number,end:number,rearR:number,frontR:number):void {
  P.add('gun',KIT.cylZ(frontR,end-start,P.q?28:16,rearR),0,0,(start+end)/2-1.30);
}

export function addT90AGun(P:TankBuilderPort):void {
  // Visible root and thermal jacket. The source's sub-3mm axis drift is
  // approximated concentrically about its independently registered trunnion.
  tube(P,1.63433,2.25047,.124955,.097345);
  tube(P,2.25047,6.24420,.097345,.086689);
  // The narrow rear flange seats into the existing pitching mantlet.
  tube(P,1.63433,1.68440,.124955,.146474);
  tube(P,1.68440,1.68840,.146474,.122540);
  tube(P,3.91676,4.80578,.115667,.115667);
  // Four separate 5mm-wide raised jacket seams, not thick round collars
  // and not the former unsupported 55mm-wide muzzle-reference box.
  for(const [start,end,top]of [
    [2.31525,2.98400,1.93218],[3.11414,3.82652,1.93228],
    [4.88418,5.38938,1.93248],[5.52671,6.03688,1.93258],
  ])P.add('gun',KIT.box(.004974,.030,end-start),0,top-.015-1.8174,(start+end)/2-1.30);
}
