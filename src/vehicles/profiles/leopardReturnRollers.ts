import {KIT, type TankBuilderPort, type RunningGearConfig} from '../tankFactoryCore.ts';
import * as THREE from 'three';
import {wheelPatternFor} from '../wheelPatterns.ts';
import {efficientReturnRoller} from '../efficientReturnRoller.ts';

/** Four return rollers per side: Slovak MOD, October 2009, printed p26.
 * Stations fit each authored hull, not the differently normalized A6M.
 * Taut supported spans retain the authored upper datum and end crowns. */
export function leopardReturnRollers(
  P: TankBuilderPort, cfg: RunningGearConfig, stations: readonly number[], supportInsetM=0,
  spindleInnerXM=.965,
): RunningGearConfig {
  const rear=cfg.sprocket,front=cfg.idler;
  if(stations.length!==4||stations.some((z,i)=>!Number.isFinite(z)||z<=rear.z||z>=front.z||(i>0&&z<=stations[i-1])))
    throw new RangeError('Leopard return support requires four ordered stations between its end wheels');
  // Match the canonical trackLoopPoints endpoint crown clearance.
  const rearY=rear.y+(rear.trackR??rear.r)+.045;
  const frontY=front.y+(front.trackR??front.r)+.045;
  const slope=(frontY-rearY)/(front.z-rear.z);
  const radius=.095,width=.16,inset=.18;
  const outer=cfg.xc-inset+.015;
  if(!Number.isFinite(spindleInnerXM)||spindleInnerXM<=0||spindleInnerXM>=outer)
    throw new RangeError('Return spindle requires a positive finite root inside its receiving hub');
  const supports=stations.map(z=>({z,y:Math.max(cfg.topY??-Infinity,rearY+slope*(z-rear.z))}));
  const course=[{z:rear.z,y:rearY},...supports,{z:front.z,y:frontY}];
  const rollers=supports.map((support,i)=>{
    // At an end-span kink, both finite adjoining planes must clear the
    // roller cylinder; a vertical-radius offset alone clips its crown.
    const normalLength=Math.max(...[course[i],course[i+2]].map(neighbor=>
      Math.hypot(1,(neighbor.y-support.y)/(neighbor.z-support.z))));
    return {z:support.z,y:support.y-(radius+(cfg.trackTh??.09)/2+supportInsetM)*normalLength,r:radius};
  });
  const loopPoints=KIT.trackLoopPoints({
    sprocket:{...rear,r:rear.trackR??rear.r},idler:{...front,r:front.trackR??front.r},
    botY:cfg.botY??.055,topY:cfg.topY,sag:0,
    supports,
    contact:{zF:Math.max(...cfg.wheelZs)+cfg.wheelR*.5,zR:Math.min(...cfg.wheelZs)-cfg.wheelR*.5},
  });
  for(let i=loopPoints.length-1;i>0;i--){
    if(Math.hypot(loopPoints[i][0]-loopPoints[i-1][0],loopPoints[i][1]-loopPoints[i-1][1])<1e-7)
      loopPoints.splice(i,1);
  }
  const {rotor,spindle}=efficientReturnRoller({quality:P.q?'high':'low',radiusM:radius,
    axialWidthM:width,spindleRadiusM:.027,spindleLengthM:1});
  const mounts=new THREE.InstancedMesh(spindle,P.mats.wheels,8);
  const pattern=wheelPatternFor(P.spec,cfg.style??'rubber',cfg.wheelPattern??null);
  mounts.name='gearReturnRollerSpindles';mounts.userData.runningGear=true;
  mounts.userData.wheelPattern=pattern.id;mounts.userData.wheelPatternLabel=pattern.label;
  mounts.userData.runningGearUnitId=P.hullG.userData.runningGearUnitCount||0;
  mounts.userData.appearanceRole='wheelDish';mounts.receiveShadow=true;
  const matrix=new THREE.Matrix4(),inner=spindleInnerXM;
  let instance=0;
  for(const roller of rollers)for(const side of[-1,1]){
    // Positive hull/hub lap; the stationary shaft shares the visible gear's
    // hull owner instead of disappearing with the decorative hull-detail LOD.
    matrix.makeScale(outer-inner,1,1);matrix.setPosition(side*(outer+inner)/2,roller.y,roller.z);
    mounts.setMatrixAt(instance++,matrix);
  }
  // The factory traverses and disposes InstancedMesh buffers itself.
  P.hullG.add(mounts);P.disposables.push(spindle);
  return {...cfg,rollers,rollerR:radius,returnRollerWidthM:width,returnRollerInsetM:inset,
    returnRollerGeometry:rotor,loopPoints};
}
