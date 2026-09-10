import * as THREE from 'three';
import {KIT, type RunningGearConfig, type TankBuilderPort} from '../tankFactoryCore.ts';
import {wheelPatternFor} from '../wheelPatterns.ts';
import {efficientReturnRoller} from '../efficientReturnRoller.ts';

/** Four per side is an explicitly inferred T-14 layout, supported by the
 * original runtime control and a published secondary count, not primary
 * certification. Fitted stations occupy source-wheel gaps so the original
 * full suspension stroke clears real rollers; source axles never move. */
export function t14XReturnRollers(P: TankBuilderPort, cfg: RunningGearConfig): RunningGearConfig {
  const rear=cfg.sprocket,front=cfg.idler;
  const stations=[0,2,3,5].map(i=>(cfg.wheelZs[i]+cfg.wheelZs[i+1])/2);
  const rearY=rear.y+(rear.trackR??rear.r)+.045;
  const frontY=front.y+(front.trackR??front.r)+.045;
  const slope=(frontY-rearY)/(front.z-rear.z);
  const supports=stations.map(z=>({z,y:Math.max(cfg.topY,rearY+slope*(z-rear.z))}));
  const course=[{z:rear.z,y:rearY},...supports,{z:front.z,y:frontY}];
  const radius=.09,width=.16,inset=.17;
  const rollers=supports.map((support,i)=>{
    const normalLength=Math.max(...[course[i],course[i+2]].map(neighbor=>
      Math.hypot(1,(neighbor.y-support.y)/(neighbor.z-support.z))));
    return {z:support.z,y:support.y-(radius+(cfg.trackTh??.09)/2)*normalLength,r:radius};
  });
  const loopPoints=KIT.trackLoopPoints({
    sprocket:{...rear,r:rear.trackR??rear.r},idler:{...front,r:front.trackR??front.r},
    botY:cfg.botY??.055,topY:cfg.topY,sag:0,supports,
    contact:{zF:Math.max(...cfg.wheelZs)+cfg.wheelR*.5,zR:Math.min(...cfg.wheelZs)-cfg.wheelR*.5},
  });
  for(let i=loopPoints.length-1;i>0;i--)if(Math.hypot(
    loopPoints[i][0]-loopPoints[i-1][0],loopPoints[i][1]-loopPoints[i-1][1])<1e-7)loopPoints.splice(i,1);

  // Closed finite shafts overlap the unmodified X ±1.0 lower hull and hub.
  const inner=.95,outer=cfg.xc-inset+.015;
  const {rotor,spindle}=efficientReturnRoller({quality:P.q?'high':'low',
    radiusM:radius,axialWidthM:width,spindleRadiusM:.026,spindleLengthM:outer-inner});
  const mounts=new THREE.InstancedMesh(spindle,P.mats.wheels,8);
  const pattern=wheelPatternFor(P.spec,cfg.style??'rubber',cfg.wheelPattern??null);
  mounts.name='gearReturnRollerSpindles';mounts.userData.runningGear=true;
  mounts.userData.wheelPattern=pattern.id;mounts.userData.wheelPatternLabel=pattern.label;
  mounts.userData.runningGearUnitId=P.hullG.userData.runningGearUnitCount||0;
  mounts.userData.appearanceRole='wheelDish';mounts.receiveShadow=true;
  const matrix=new THREE.Matrix4();
  let instance=0;
  for(const roller of rollers)for(const side of[-1,1]){
    matrix.makeTranslation(side*(outer+inner)/2,roller.y,roller.z);
    mounts.setMatrixAt(instance++,matrix);
  }
  P.hullG.add(mounts);P.disposables.push(spindle);
  return {...cfg,rollers,rollerR:radius,returnRollerWidthM:width,returnRollerInsetM:inset,
    returnRollerGeometry:rotor,loopPoints};
}
