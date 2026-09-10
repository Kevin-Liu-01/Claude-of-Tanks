import * as THREE from 'three';
import {KIT, type TankBuilderPort} from '../tankFactoryCore.ts';
import {wheelPatternFor} from '../wheelPatterns.ts';
import {efficientReturnRoller} from '../efficientReturnRoller.ts';

type MerkavaGearInput = Pick<Parameters<typeof KIT.trackLoopPoints>[0], 'sprocket'|'idler'|'topY'> & {
  wheelZs: number[]; wheelR: number; xc: number; trackTh?: number; botY?: number;
  style?: string; wheelPattern?: Parameters<typeof wheelPatternFor>[2];
};

/** Supplier Tamor establishes Merkava return rollers, not a Mk3/Mk4 count.
 * These concealed four-station layouts are authored mechanical inferences.
 * Keep the measured road/end axles; support the intended upper-course datum. */
export function merkavaXReturnRollers<C extends MerkavaGearInput>(
  P: TankBuilderPort, cfg: C, stations: readonly number[], hullSeatX: number, inset=.25, seatOffset=.003,
  outerFaceCarrier=false,
) {
  const rear=cfg.idler,front=cfg.sprocket;
  const rearY=rear.y+(rear.trackR??rear.r)+.045,frontY=front.y+(front.trackR??front.r)+.045;
  const slope=(frontY-rearY)/(front.z-rear.z);
  const supports=stations.map(z=>({z,y:Math.max(cfg.topY??0,rearY+slope*(z-rear.z))}));
  const course=[{z:rear.z,y:rearY},...supports,{z:front.z,y:frontY}];
  const radius=.095,width=.14;
  const rollers=supports.map((support,i)=>{
    const normalLength=Math.max(...[course[i],course[i+2]].map(neighbor=>
      Math.hypot(1,(neighbor.y-support.y)/(neighbor.z-support.z))));
    // The Mk4's actual inboard shoe pin extends 4 mm below the Mk3
    // carrier-relative seat. Keep clearance to that stock, not only the band.
    return {z:support.z,y:support.y-(radius+(cfg.trackTh??.09)/2+seatOffset)*normalLength,r:radius};
  });
  const loopPoints=KIT.trackLoopPoints({sprocket:{...rear},idler:{...front},
    botY:cfg.botY??.055,topY:cfg.topY,sag:0,supports,
    contact:{zF:Math.max(...cfg.wheelZs)+cfg.wheelR*.5,zR:Math.min(...cfg.wheelZs)-cfg.wheelR*.5}});
  for(let i=loopPoints.length-1;i>0;i--){
    if(Math.hypot(loopPoints[i][0]-loopPoints[i-1][0],loopPoints[i][1]-loopPoints[i-1][1])<1e-7)
      loopPoints.splice(i,1);
  }
  const {rotor,spindle}=efficientReturnRoller({quality:P.q?'high':'low',radiusM:radius,axialWidthM:width,
    spindleRadiusM:.027,spindleLengthM:1});
  const mounts=new THREE.InstancedMesh(spindle,P.mats.wheels,rollers.length*2);
  const pattern=wheelPatternFor(P.spec,cfg.style??'rubber',cfg.wheelPattern??null);
  mounts.name='gearMerkavaReturnSpindles';mounts.userData.runningGear=true;
  mounts.userData.wheelPattern=pattern.id;mounts.userData.wheelPatternLabel=pattern.label;
  mounts.userData.runningGearUnitId=P.hullG.userData.runningGearUnitCount||0;
  mounts.userData.appearanceRole='wheelDish';mounts.receiveShadow=true;
  const matrix=new THREE.Matrix4(),outer=cfg.xc-inset+.015;
  let instance=0;
  for(const roller of rollers)for(const side of[-1,1]){
    matrix.makeScale(outer-hullSeatX,1,1);
    matrix.setPosition(side*(outer+hullSeatX)/2,roller.y,roller.z);
    mounts.setMatrixAt(instance++,matrix);
  }
  P.hullG.add(mounts);P.disposables.push(spindle);
  return {...cfg,rollers,rollerR:radius,returnRollerWidthM:width,returnRollerInsetM:inset,returnRollerGeometry:rotor,loopPoints,
    ...(outerFaceCarrier?{trackCarrierFromOuterFace:true}:{})};
}

export {lineUpperReturnBand as lineMerkavaXUpperBand} from '../upperReturnBandStock.ts';
