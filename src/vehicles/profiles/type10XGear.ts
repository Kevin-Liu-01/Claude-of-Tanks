import {KIT} from './kit.ts';
import type {RunningGearConfig, TankBuilderPort} from '../tankFactoryCore.ts';
import {pairedRunningGearStock} from '../pairedRunningGearStock.ts';
import {efficientReturnRoller} from '../efficientReturnRoller.ts';
import {buildFleetTrackShoe} from './abramsSourceXTrackShoe.ts';

/** Fitted 90 mm course; all source road/end axle centres and radii stay fixed.
 * The paired stock leaves real guide air, rather than burying teeth in drums.
 * This opt-in does not change any other Japanese or source-X vehicle. */
export function buildType10XGear(P:TankBuilderPort,base:RunningGearConfig) {
  const stock=(radiusM:number,steel=false)=>pairedRunningGearStock({
    radiusM,axialWidthM:base.wheelW,guideGapM:.10,high:P.q,steel,
  });
  const idlerStock=stock(base.idler.r*.97,true),driveStock=stock(base.sprocket.r*.95,true);
  const roller=efficientReturnRoller({quality:P.q?'high':'low',radiusM:.095,
    axialWidthM:.14,spindleRadiusM:.025,spindleLengthM:.06914});
  // The canonical receiver-aware path constructs its own shafts, not this
  // standalone leaf's optional shaft. Release it immediately, before upload.
  roller.spindle.dispose();
  const cfg:RunningGearConfig={...base,trackTh:.09,botY:.02083,
    idler:{...base.idler,trackR:base.idler.r+.004},
    sprocket:{...base.sprocket,trackR:base.sprocket.r+.004},
    roadWheelGeometry:stock(base.wheelR),
    idlerGeometry:{body:idlerStock.disc,dark:idlerStock.dark},
    sprocketStockGeometry:{body:driveStock.disc,dark:driveStock.dark},
    returnRollerGeometry:roller.rotor,returnRollerWidthM:.14,returnRollerInsetM:.26,
    frontArcSteps:16,rearArcSteps:16,smoothRearTopTangent:true,dedupeLoopPoints:true,
    trackShoeBuilder:p=>{
      if(p.pattern.surface!=='staggered-rib')throw new Error('Type 10 requires its Japanese tread recipe');
      return buildFleetTrackShoe(p);
    },
  };
  cfg.loopPoints=KIT.trackLoopPoints({
    idler:{...base.idler,r:base.idler.r+.004},sprocket:{...base.sprocket,r:base.sprocket.r+.004},
    botY:.02083,topY:base.topY,sag:.022,
    // 2.5 mm clearance leaves LOW's rotating 12-sector crown within the
    // unchanged 6 mm visible support limit, independent of spin radius.
    supports:base.rollers!.map(row=>({z:row.z,y:row.y+(row.r??.095)+.09/2+.0025})),
    contact:{zF:Math.max(...base.wheelZs)+base.wheelR*.5,
      zR:Math.min(...base.wheelZs)-base.wheelR*.5},
    frontArcSteps:16,rearArcSteps:16,smoothRearTopTangent:true,
  });
  return KIT.buildRunningGear(P,cfg);
}
