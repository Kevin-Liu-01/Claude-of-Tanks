// Original optical casing and recessed panes, based on independently read
// source face dimensions. The windows are actual pockets, not paint decals.
import * as THREE from 'three';
import {KIT} from './kit.ts';
import {sectionSolid} from './sectionSolid.ts';
import {T90MS_X_SOURCE_DATUMS} from '../t90msXArmor.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
const PIVOT=T90MS_X_SOURCE_DATUMS.turretPivot;
const CENTER=.69120;
function add(P:TankBuilderPort,g:THREE.BufferGeometry,glass=false):void {
  P.addEquipment(glass?'turretGlass':'turretDetail',g,-PIVOT[0],-PIVOT[1],-PIVOT[2]);
}
function front(x:number):number {
  const dx=Math.abs(x-CENTER);
  return .25589-Math.min(dx,.12261)*.283-Math.max(0,dx-.12261)*1.566;
}
function frontStrip(P:TankBuilderPort,xs:readonly number[],low:number,high:number):void {
  add(P,sectionSolid(xs.map(x=>({z:x,ring:[[-front(x),low],[-.164,low],
    [-.164,high],[-front(x),high]] as Array<readonly[number,number]>}))).rotateY(Math.PI/2));
}
function housing(P:TankBuilderPort):void {
  const rows=[[-.11971,.10155,2.29059],[-.04241,.15795,2.42779],
    [.04519,.19315,2.42779],[.12619,.18490,2.42779],[.170,.157,2.42779]];
  add(P,sectionSolid(rows.map(([z,w,roof])=>({z,ring:[[CENTER-w,2.11579],
    [CENTER+w,2.11579],[CENTER+w,roof],[CENTER-w,roof]] as Array<readonly[number,number]>}))));
  const xs=[.535,.56859,.580,CENTER,.810,.81381,.8474];
  frontStrip(P,xs,2.11579,2.15579);
  frontStrip(P,xs,2.35259,2.42779);
  frontStrip(P,[.535,.56859,.580],2.15579,2.35259);
  frontStrip(P,[.810,.81381,.8474],2.15579,2.35259);
  frontStrip(P,[.6505,.6575],2.15579,2.35259);
  // The separate short brow crosses the tall primary pane; its shallow
  // ledge does not erase the recessed glass below and above it.
  add(P,KIT.box(.224,.016,.037).translate(CENTER,2.304,.19968));
}
function pane(P:TankBuilderPort,xs:readonly number[],low:number,high:number,zAt:(x:number)=>number):void {
  const g=sectionSolid(xs.map(x=>({z:x,ring:[[-zAt(x),low],[-zAt(x)+.002,low],
    [-zAt(x)+.002,high],[-zAt(x),high]] as Array<readonly[number,number]>}))).rotateY(Math.PI/2);
  add(P,g,true);
  // Concealed retaining stock reaches the casing but stops behind the pane.
  add(P,sectionSolid(xs.map(x=>({z:x,ring:[[-zAt(x)+.002,low],[-.168,low],
    [-.168,high],[-zAt(x)+.002,high]] as Array<readonly[number,number]>}))).rotateY(Math.PI/2));
}
function panes(P:TankBuilderPort):void {
  pane(P,[.59675,.62375,.64895],2.15579,2.29299,x=>.19621146+(x-.6)*.283536);
  pane(P,[.65775,.67145,.79205,.80035],2.15629,2.35259,x=>.20981349-(x-.69)*.1011606);
}
function adjacentSocket(P:TankBuilderPort):void {
  const x=.94925,z=-.40681;
  add(P,KIT.cylY(.0317,.0317,.2847,16).translate(x,2.29424,z));
  add(P,KIT.box(.1137,.019,.114).translate(.9490,2.44609,-.40691));
  add(P,KIT.box(.1079,.0069,.1082).translate(.9490,2.45754,-.40691));
  add(P,KIT.cylY(.0415,.0415,.0229,8).translate(x,2.47244,z));
  add(P,KIT.cylY(.0361,.0415,.0069,8).translate(x,2.48734,z));
}
export function addT90MSOpticalHead(P:TankBuilderPort):void {
  housing(P);panes(P);adjacentSocket(P);
}
