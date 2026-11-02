import {buildT80UX} from './t80uX.ts';
import {addT80UKCommandFit} from './t80ukCommandFit.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
// The T-80UK: the command fit (t80ukCommandFit.ts) on the complete T-80U casting and turbine chassis. 267 (blind critics
// on the fit, both FIX): the roof sensor head that stood on the gunner's hatch and repeated the commander's own sight is
// gone; the radio boxes are the R-163 whips' insulated mounts, the masts three-section whips; the APU is the AB-1-P/30's
// armoured box on the left rear fender; the basket follows the turret's rear with brackets and a slatted floor, and the
// strapped pack is a canvas roll lashed in it.
export function buildT80UK(P:TankBuilderPort):void {
  buildT80UX(P);
  addT80UKCommandFit(P);
  P.hullG.userData.familyRebuild={donor:'t80u',revision:1,variant:'command'};
}
