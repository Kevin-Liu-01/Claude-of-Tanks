// Independent native running gear from the complete owner-selected Strv file.
// Fused, partly buried source wheels supply visible section scalars, not rig
// nodes. Hidden axle backs/return supports are explicit mechanical inferences.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { buildFleetTrackShoe } from './abramsSourceXTrackShoe.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

export const STRV122_SUPPLIED_GEAR = Object.freeze({
  roadZ: [-2.245,-1.4375,-.645,.1275,.8925,1.6675,2.465] as readonly number[],
  roadY: .432, roadRadius: .3375, roadAxisAbsX: 1.335,roadAxisLeftAbsX:1.315,
  trackAxisAbsX: 1.410,trackAxisLeftAbsX:1.387,trackWidth: .640,
  // Twenty-one independent outer-course lines per end establish these
  // centers. Body radii exclude KIT's45mm wrap clearance and physical shoe
  // stock; the source tread-tooth phase has up to23mm local radial noise.
  rear: {z:-2.874170,y:.808317,r:.321,axleOutsetM:-.054},
  // Fused source gives the visible hub and lower bowl face, not an owned
  // axle node. These independent axial seats fit both without moving tread.
  front: {z:3.236487,y:.822477,r:.273,
    axialScaleLeft:.760,axialScaleRight:.760,
    axleOutsetRightM:-.149780,axleOutsetLeftM:-.151350},
});
type Section = readonly [radius: number, axial: number];
function turned(rows: readonly Section[],segments=64):THREE.BufferGeometry{
  return new THREE.LatheGeometry(rows.map(([r,x])=>new THREE.Vector2(r,x)),segments)
    .rotateZ(-Math.PI/2);
}
function wheelFace(side:-1|1,segments:number):THREE.BufferGeometry{
  // The steel bowl really sits about90mm behind the local hub and tire edge.
  // The six shallow pressed recesses are curved depressions in this closed
  // body, not dark decals or large star plates placed ahead of the source.
  const g=turned([[0,-.176],[.299,-.176],[.316,-.165],[.316,.185],
    [.304,.185],[.294,.180],[.284,.146],[.274,.118],[.254,.118],[.230,.096],[.150,.091],
    [.120,.096],[.103,.130],[.083,.179],[.066,.195],[.052,.205],[0,.205]],segments);
  const a=g.attributes.position;
  for(let i=0;i<a.count;i++){
    const r=Math.hypot(a.getY(i),a.getZ(i)),x=a.getX(i);
    if(r>=.145&&r<=.265&&x>0){
      const angle=Math.atan2(a.getY(i),a.getZ(i));
      const radial=Math.sin(Math.PI*(r-.145)/.120);
      const lobe=Math.pow(Math.max(0,Math.cos(angle*6+1.15)),2);
      a.setX(i,x-.023*Math.max(0,radial)*lobe);
    }
  }
  g.computeVertexNormals();if(side<0)g.rotateY(Math.PI);return g;
}
export function strv122SuppliedWheelSolids(segments=48):{
  core:THREE.BufferGeometry;left:THREE.BufferGeometry;right:THREE.BufferGeometry;
}{
  return{core:turned([[0,-.178],[.052,-.178],[.052,.18],[0,.18]],24),
    left:wheelFace(-1,segments),right:wheelFace(1,segments)};
}
export function addStrv122XSuppliedGear(P:TankBuilderPort):void{
  // Forty-eight sides retain the six pressed recesses and cardinal stations.
  // Coarser 36/24-sided rims fail the unchanged source-face tolerance, so LOW
  // also keeps 48. This still removes 10,752 triangles across fourteen wheels
  // at both qualities without moving axles or changing section radii/holes.
  const d=STRV122_SUPPLIED_GEAR,wheel=strv122SuppliedWheelSolids();
  // Original file buries the upper return course in its fused hull. Four
  // concealed rolling supports are mechanical inference, not authored nodes.
  const rollers=[[-1.85,1.070],[-.38,1.060],[1.15,1.050],[2.00,1.018]]
    .map(([z,y])=>({z,y,r:.078}));
  const loop=KIT.trackLoopPoints({sprocket:d.rear,idler:d.front,
    botY:.054,topY:1.155,sag:.012,contact:{zR:-2.47,zF:2.69},
    supports:rollers.map(r=>({z:r.z,y:r.y+r.r+.017}))});
  P.gear=KIT.buildRunningGear(P,{
    style:'rubber',wheelPattern:'pressed-six',wheelR:d.roadRadius,wheelY:d.roadY,
    wheelW:.370,wheelTireInnerRadiusM:.314,wheelCoreGeometry:{disc:wheel.core},
    wheelFaceLayers:[{geometry:wheel.left,material:P.mats.wheels,side:-1,
      name:'strv122SuppliedWheelFacesLeft',appearanceRole:'wheelDish'},
    {geometry:wheel.right,material:P.mats.wheels,side:1,
      name:'strv122SuppliedWheelFacesRight',appearanceRole:'wheelDish'}],
    wheelZs:[...d.roadZ],xc:d.trackAxisAbsX,xcLeft:d.trackAxisLeftAbsX,
    roadWheelOutsetRightM:d.roadAxisAbsX-d.trackAxisAbsX,
    roadWheelOutsetLeftM:d.roadAxisLeftAbsX-d.trackAxisLeftAbsX,
    trackW:d.trackWidth,trackCarrierWidthM:.540,trackTh:.022,botY:.054,topY:1.155,
    sprocket:d.rear,idler:d.front,rollers,returnRollerWidthM:.19,returnRollerInsetM:.17,
    loopPoints:loop,linkPitchM:.143,rigidLinkChords:true,
    // Keep the fitted course, national tread recipe and physical dimensions;
    // share quality-aware link stock instead of repeating full-detail links
    // at LOW detail as well as HIGH.
    trackShoeBuilder:buildFleetTrackShoe,
    trackShoeDimensions:{padHeight:.030,grouserHeight:.010,webHeight:.025,hornHeight:.070,pinRadius:.009,pinCentreY:0},
    arms:true,coveredTop:true,paintedEnds:true,
    // Concealed inferred arms must clear the independently seated left wheel
    // as well as the right. The former symmetric arm intersected the left
    // bowl by16mm. Move the forged web45mm inboard, retain all source axles,
    // and use a receiving spindle joining that web to both actual wheel backs.
    suspensionDimensions:{armWidthM:.070,armHeightM:.100,armAxleHeightM:.070,
      armCenterAbsXM:1.046,armAxialShearM:.050,anchorBossWidthM:.078,
      anchorBossRadiusM:.048,anchorBossCenterAbsXM:1.009,axleBossWidthM:.106,
      axleBossRadiusM:.045,axleBossCenterAbsXM:1.125,anchorLiftM:.135,anchorTrailM:.185},
  });
}
