// Native suspension-driven gear, independently dimensioned from the complete
// supplied courses. No parked wheel faces or copied source vertices.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { c1Length as m, c1Point as p } from './challenger1XSuppliedFrame.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

function wheelCore():THREE.BufferGeometry{
  // Turned hollow tire seat, recessed outer disc and local small hub.
  const contour:readonly(readonly[number,number])[]=[[0,-8.268],[4.645,-8.268],
    [4.645,-4.213],[11.890,-5.157],[12.14,-5.157],[12.14,5.157],
    [12.086,5.157],[3.70,5.394],[3.70,6.733],[.90,9.016],[0,9.016]];
  return new THREE.LatheGeometry(contour.map(([r,x])=>new THREE.Vector2(m(r),m(x))),48)
    .rotateZ(-Math.PI/2);
}
export function addChallenger1SuppliedGear(P:TankBuilderPort):void{
  const rollers=[-108.622044,-35.039370,37.637797].map(z=>({z:p(0,0,z)[2],y:p(0,36.889765,0)[1],r:m(5.590552)}));
  const wheelZs=[-128.602360,-88.897641,-55.334647,-15.393701,17.972440,53.405514].map(z=>p(0,0,z)[2]);
  const rear={z:p(0,0,-158.090546)[2],y:p(0,29.507875,0)[1],r:m(13.484252),trackR:m(14.20)};
  const front={z:p(0,0,87.992126)[2],y:p(0,29.488188,0)[1],r:m(11.653542),trackR:m(13.5)};
  P.gear=KIT.buildRunningGear(P,{
    style:'rubber',wheelPattern:'pressed-six',wheelR:m(15.9448815),wheelY:p(0,18.9370075,0)[1],
    wheelW:m(20.629921),wheelTireInnerRadiusM:m(12.05),wheelCoreGeometry:{disc:wheelCore()},
    wheelZs,xc:m(51.535433),roadWheelOutsetM:m(.1574805),trackW:m(24.803150),trackTh:.011,
    sprocket:rear,idler:front,rollers,returnRollerWidthM:m(8.543308),returnRollerOutsetM:m(3.759842),
    topY:p(0,42.25,0)[1],botY:.0325,linkPitchM:m(4.0),
    trackShoeDimensions:{padHeight:.020,grouserHeight:.008,webHeight:.012,hornHeight:.045,pinRadius:.007,pinCentreY:0},
    loopPoints:KIT.trackLoopPoints({sprocket:rear,idler:front,
      contact:{zF:p(0,0,58)[2],zR:p(0,0,-135)[2]},botY:.0325,topY:p(0,42.25,0)[1],sag:.011,
      supports:rollers.map(r=>({z:r.z,y:r.y+r.r+.018}))}),
    arms:true,coveredTop:true,paintedEnds:true,rigidLinkChords:true,
    // Concealed joints are a mechanical inference: move the web12mm inward
    // to clear the source-seated wheel bowl, then extend its receiving spindle
    // inboard. All visible wheels, measured axles and track courses stay fixed.
    suspensionDimensions:{armWidthM:m(4.0),armHeightM:m(6.0),armAxleHeightM:m(3.8),
      armCenterAbsXM:m(37.0)-.012,armAxialShearM:m(6.0),anchorBossWidthM:m(4.3),anchorBossRadiusM:m(3.82),
      anchorBossCenterAbsXM:m(33.28)-.012,axleBossWidthM:m(1.575)+.024,axleBossRadiusM:m(1.535),
      axleBossCenterAbsXM:m(42.64)-.006,anchorLiftM:m(2.12),anchorTrailM:m(5.5)},
  });
}
