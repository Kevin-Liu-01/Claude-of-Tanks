import * as THREE from 'three';
import { KIT } from './kit.ts';
import { mergeAll, xform } from '../factoryGeometry.ts';
import { turnedGearStock } from '../runningGearPrimitives.ts';

// Independent axial sections of canonical Object_34: the drive has two thin
// crown plates and a narrow central barrel; the idler has hollow tread rings.
// A full-width generic end drum incorrectly occupies the source track channel.
const SCALE_X=.972;
const DRIVE_CENTER=1.42144394, IDLER_CENTER=1.41886985;
type Station=readonly [radius: number, worldX: number];
function turned(stations: readonly Station[], center: number, segments: number): THREE.BufferGeometry {
  return turnedGearStock(stations.map(([r,x])=>[r,(x-center)/SCALE_X]),segments);
}
function driveCrowns(worldX: number): THREE.BufferGeometry[] {
  const parts:THREE.BufferGeometry[]=[];
  for(let i=0;i<15;i++){
    const shape=new THREE.Shape();
    for(const [j,[r,a]]of ([[.295,-.10],[.3508,-.043],[.3545,0],[.3508,.043],[.295,.10]] as const).entries()){
      const x=Math.sin(a)*r,y=Math.cos(a)*r;
      if(!j)shape.moveTo(x,y);else shape.lineTo(x,y);
    }
    shape.closePath();
    const g=new THREE.ExtrudeGeometry(shape,{depth:.02564/SCALE_X,bevelEnabled:false,curveSegments:1});
    g.translate(0,0,-.01282/SCALE_X).rotateY(Math.PI/2).rotateX(i*Math.PI*2/15);
    parts.push(xform(g,(worldX-DRIVE_CENTER)/SCALE_X,0,0));
  }
  return parts;
}
function driveStock(high: boolean) {
  const segments=high?24:16,body:THREE.BufferGeometry[]=[],dark:THREE.BufferGeometry[]=[];
  body.push(turned([[0,1.20486],[.223,1.20486],[.235,1.22802],[.202,1.25416],
    [.18,1.33978],[.149,1.38977],[.149,1.45322],[.18,1.50301],
    [.202,1.58863],[.235,1.61486],[.223,1.63803],[0,1.63803],[0,1.20486]],DRIVE_CENTER,segments));
  for(const [inner,outer]of[[1.204861,1.2305],[1.61239,1.638027]]){
    body.push(turned([[.222,inner],[.295,inner],[.295,outer],[.222,outer],[.222,inner]],DRIVE_CENTER,segments));
    dark.push(turned([[.214,inner-.001],[.222,inner-.001],[.222,outer+.001],[.214,outer+.001],[.214,inner-.001]],DRIVE_CENTER,segments));
  }
  dark.push(...driveCrowns(1.21768),...driveCrowns(1.625207));
  return {body:mergeAll(body),dark:mergeAll(dark)};
}
function idlerStock(high: boolean) {
  const segments=high?24:16,body:THREE.BufferGeometry[]=[],dark:THREE.BufferGeometry[]=[];
  for(const side of[-1,1]){
    const ring=turned([[.3095,1.44035],[.3315,1.44035],[.3332,1.54815],
      [.3332,1.575071],[.321,1.575071],[.321,1.5036],
      [.3095,1.47896],[.3095,1.44035]],IDLER_CENTER,segments);
    if(side<0)ring.rotateY(Math.PI);
    body.push(ring);
  }
  body.push(turned([[0,1.340968],[.152,1.340968],[.152,1.3668],[.095,1.519639],
    [0,1.519639],[0,1.340968]],IDLER_CENTER,segments));
  // Ten physical web ribs join the hub and annular rings; preserve the
  // air between them instead of filling the complete cylinder envelope.
  for(let i=0;i<10;i++){
    const angle=i*Math.PI/5;
    const g=KIT.box(.283/SCALE_X,.18,.017).rotateX(angle);
    body.push(xform(g,0,Math.cos(angle)*.229,Math.sin(angle)*.229));
  }
  for(const side of[-1,1])dark.push(xform(KIT.cylX(.0633,.023/SCALE_X,high?12:8),side*.132/SCALE_X,0,0));
  return {body:mergeAll(body),dark:mergeAll(dark)};
}
export function barakEndStock(high: boolean, enabled = true) {
  if(!enabled)return {};
  return {sprocketStockGeometry:driveStock(high),idlerGeometry:idlerStock(high),
    sprocketTeeth:false,linkPitchM:Math.PI*2*.3025/15,
    trackShoeDimensions:{padHeight:.006,grouserHeight:.0035185185,webHeight:.008,
      hornHeight:.034,pinRadius:.0076,pinCentreY:-.006},endRingSpan:.418/.972};
}
