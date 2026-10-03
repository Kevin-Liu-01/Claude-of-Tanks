import type { AerialView } from '../sim/aerialCombat.ts';
import { AERIAL_RULES } from '../sim/matchRuleset.ts';
import { minimapAngleForDirection } from './minimapOrientation.ts';
interface Point {x:number;z:number}
/** Aircraft position and ground carrier are separate tactical objects. */
export function drawAerialMinimap(ctx:CanvasRenderingContext2D,view:AerialView,carrier:Point,aim:Point|null|undefined,forward:Point,project:(x:number,z:number)=>number[],pixelsPerMeter:number):void {
 const origin=project(0,0),cx=origin[0]!,cy=origin[1]!,size=cx*2;
 const edge=(v:number)=>Math.max(9,Math.min(size-9,v));
 const p=project(view.x,view.z),x=edge(p[0]!),y=edge(p[1]!);
 ctx.save();ctx.strokeStyle='#e5f8f2';ctx.fillStyle='#e5f8f2';ctx.lineWidth=1.3;
 if(view.kind==='gunship'){
  ctx.setLineDash([3,4]);ctx.beginPath();ctx.arc(cx,cy,AERIAL_RULES.gunship.radiusM*pixelsPerMeter,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
 }else{
  const base=project(carrier.x,carrier.z),bx=base[0]!,by=base[1]!;
  ctx.strokeStyle='#e9b75c';ctx.strokeRect(bx-3,by-4,6,8);ctx.setLineDash([2,4]);ctx.beginPath();ctx.moveTo(bx,by);ctx.lineTo(x,y);ctx.stroke();ctx.setLineDash([]);ctx.strokeStyle='#e5f8f2';
 }
 if(aim&&Number.isFinite(aim.x)&&Number.isFinite(aim.z)){
  const target=project(aim.x,aim.z),tx=edge(target[0]!),ty=edge(target[1]!);
  ctx.strokeStyle='#f6bd64';ctx.beginPath();ctx.arc(tx,ty,5,0,Math.PI*2);ctx.moveTo(tx-8,ty);ctx.lineTo(tx+8,ty);ctx.moveTo(tx,ty-8);ctx.lineTo(tx,ty+8);ctx.stroke();
 }
 const angle=minimapAngleForDirection(forward.x,forward.z);
 ctx.fillStyle='rgba(224,250,240,.17)';ctx.beginPath();ctx.moveTo(x,y);ctx.arc(x,y,30,angle-.38,angle+.38);ctx.closePath();ctx.fill();
 ctx.translate(x,y);ctx.rotate(minimapAngleForDirection(Math.sin(view.yaw),Math.cos(view.yaw))+Math.PI/2);ctx.strokeStyle='#e5f8f2';ctx.fillStyle='#112322';
 if(view.kind==='gunship'){
  ctx.beginPath();ctx.moveTo(0,-8);ctx.lineTo(2,-1);ctx.lineTo(9,3);ctx.lineTo(2,3);ctx.lineTo(2,7);ctx.lineTo(-2,7);ctx.lineTo(-2,3);ctx.lineTo(-9,3);ctx.lineTo(-2,-1);ctx.closePath();ctx.fill();ctx.stroke();
 }else{
  ctx.beginPath();ctx.moveTo(-4,-4);ctx.lineTo(4,4);ctx.moveTo(-4,4);ctx.lineTo(4,-4);ctx.stroke();
  for(const rx of[-4,4])for(const ry of[-4,4]){ctx.beginPath();ctx.arc(rx,ry,2.7,0,Math.PI*2);ctx.fill();ctx.stroke();}
 }
 ctx.restore();
}
