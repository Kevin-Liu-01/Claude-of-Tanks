// Source-canted APS protective shells, including the open lower cavity.
import * as THREE from 'three';
import {sectionSolid} from './sectionSolid.ts';
import {beamBetween} from './measuredPrimitives.ts';
import {KIT} from './kit.ts';
import {T90_AW_X_SOURCE_DATUMS} from '../t90AwXArmor.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
type P2=readonly[number,number];
const U=new THREE.Vector3(.5812381937,0,-.8137334712),R=new THREE.Vector3(.8137334712,0,.5812381937);
const CENTER=-.2829921,HALF=.14047;
const ROOF:readonly P2[]=[[1.37684,2.11288],[1.39445,2.151126],[1.40173,2.158526],[1.41255,2.163826],
  [1.45160,2.16770],[1.53744,2.17678],[1.86718,2.03078]];
const SIDE:readonly P2[]=[[1.40461,2.06108],[1.45160,2.16408],[1.53744,2.17678],[1.86718,2.03078],
  [1.83808,1.87508],[1.82234,1.87728]];
function slab(profile:readonly P2[],a:number,b:number):THREE.BufferGeometry{
  const ring=profile.map(([r,y])=>[r,y] as [number,number]);
  const area=ring.reduce((n,p,i)=>n+p[0]*ring[(i+1)%ring.length][1]-ring[(i+1)%ring.length][0]*p[1],0);if(area<0)ring.reverse();
  return sectionSolid([{z:a,ring},{z:b,ring}]).applyMatrix4(new THREE.Matrix4().makeBasis(R,new THREE.Vector3(0,1,0),U.clone().negate()));
}
function mirrored(g:THREE.BufferGeometry,side:number):THREE.BufferGeometry{
  if(side>0)return g;
  // A geometric reflection must reverse winding exactly once. Rebuild the
  // primitive's own non-indexed draw order, never supplied source topology.
  g.scale(-1,1,1).translate(-.00189995765686,0,0);
  if(g.index){const a=g.index.array;for(let i=0;i<a.length;i+=3){const b=a[i+1];a[i+1]=a[i+2];a[i+2]=b;}g.computeVertexNormals();return g;}
  const p=g.getAttribute('position'),n=g.getAttribute('normal'),uv=g.getAttribute('uv');
  for(let i=0;i<p.count;i+=3)for(const a of [p,n,uv])if(a)for(let k=0;k<a.itemSize;k++){
    const tmp=a.array[(i+1)*a.itemSize+k];a.array[(i+1)*a.itemSize+k]=a.array[(i+2)*a.itemSize+k];a.array[(i+2)*a.itemSize+k]=tmp;
  }
  g.computeVertexNormals();return g;
}
function shell(P:TankBuilderPort,side:number):void{
  const pivot=T90_AW_X_SOURCE_DATUMS.turretPivot;
  const put=(g:THREE.BufferGeometry)=>P.addEquipment('turretDetail',mirrored(g,side),-pivot[0],-pivot[1],-pivot[2]);
  // Independently closed thin stock retains the complete source outer roof;
  // the hidden 3 mm underside closes a source surface, not a filled box.
  put(slab([...ROOF,...[...ROOF].reverse().map(([r,y])=>[r,y-.003] as const)],-CENTER-HALF,-CENTER+HALF));
  for(const c of [-CENTER-HALF+.004,-CENTER+HALF-.004])put(slab(SIDE,c-.0015,c+.0015));
  put(slab([[1.86718,2.03078],[1.85596,2.01278],[1.85296,2.01278],[1.86418,2.03078]],-CENTER-HALF+.004,-CENTER+HALF-.004));
  put(slab([[1.85596,2.01278],[1.83808,1.87508],[1.82234,1.87728],[1.845,2.01128]],-CENTER-HALF+.004,-CENTER+HALF-.004));
  put(slab([[1.40461,2.06108],[1.45160,2.16408],[1.44860,2.16408],[1.40161,2.06108]],-CENTER-HALF+.005,-CENTER+HALF-.005));
}
function mounts(P:TankBuilderPort,side:number):void{
  const pivot=T90_AW_X_SOURCE_DATUMS.turretPivot,put=(g:THREE.BufferGeometry)=>P.addEquipment('turretDetail',mirrored(g,side),-pivot[0],-pivot[1],-pivot[2]);
  // Two actual small inclined hinge rods, not the former central diagonal
  // pedestal. Their narrow upper continuation closes the hidden pivot seat.
  for(const[a,b,c]of [[[.96734,1.903,.89306],[1.00996,2.022,.92365],[1.049,2.073,.952]],
    [[.82744,1.903,1.08939],[.86987,2.022,1.12175],[.909,2.073,1.150]]] as const){
    put(beamBetween(a,b,.0077,12));put(beamBetween(b,c,.0077,12));
  }
  // Source's small flexible side lead, measured through complete cross-section
  // centres; it curls back into the inboard fold instead of ending in air.
  const path=[[.876,1.729,1.3192],[.87774,1.8,1.31390],[.91150,1.91,1.29158],[.92250,1.94,1.27853],
    [.91322,1.98,1.24076],[.88261,2.01,1.19104],[.87377,2.02,1.17523],[.87201,2.06,1.14011],
    [.88650,2.08,1.13451],[.90521,2.10,1.13213],[.92604,2.12,1.13080],[.952,2.136,1.131],[.962,2.132,1.132]];
  const curve=new THREE.CatmullRomCurve3(path.map(p=>new THREE.Vector3(...p)),false,'centripetal');
  put(new THREE.TubeGeometry(curve,64,.008,10,false));
  for(const p of [path[0],path.at(-1)!])put(new THREE.SphereGeometry(.008,10,6).translate(p[0],p[1],p[2]));
}
function retentionFrame(P:TankBuilderPort,side:number):void{
  const pivot=T90_AW_X_SOURCE_DATUMS.turretPivot,put=(g:THREE.BufferGeometry)=>P.addEquipment('turretDetail',mirrored(g,side),-pivot[0],-pivot[1],-pivot[2]);
  const outer:readonly P2[]=[[-.23335,-.12045],[-.16845,-.20275],[-.05125,-.19595],[.05125,-.19595],[.16795,-.20275],
    [.23345,-.12045],[.23345,.14917],[.22770,.16917],[.22124,.17917],[.20865,.18917],[.18292,.19417],
    [.114405,.19917],[.05125,.20285],[-.05125,.20285],[-.114405,.19917],[-.18292,.19417],[-.20865,.18917],
    [-.22124,.17917],[-.22770,.16917],[-.23335,.14917]];
  const inner:readonly P2[]=[[-.21045,-.11545],[-.16845,-.16845],[-.05125,-.17655],[.05125,-.17655],[.16795,-.16845],
    [.20995,-.11545],[.20995,.11545],[.16795,.16845],[.05125,.17645],[-.05125,.17645],[-.16845,.16845],[-.21045,.11545]];
  const shape=new THREE.Shape(outer.map(p=>new THREE.Vector2(...p))),hole=new THREE.Path(inner.map(p=>new THREE.Vector2(...p)));
  shape.holes.push(hole);put(new THREE.ExtrudeGeometry(shape,{depth:.0341,bevelEnabled:false}).translate(.876,1.77083,1.49947));
  for(const y of [1.580,1.962])put(KIT.box(.0517,.06296,.0332).translate(.876,y,1.51697));
  // Independent source clamp feet bridge the real open frame to the unchanged
  // IR projector's roof/floor. They do not fill the broad central aperture.
  // A 0.5 mm hidden overlap into the unchanged body closes rounding at the
  // exact source joint, without changing the exposed clamp crown.
  for(const y of [1.61528,1.92633])put(KIT.box(.0728,.0435,.0683).translate(.87575,y,1.51702));
}
export function addT90AWApsHousings(P:TankBuilderPort):void{
  for(const side of [-1,1]){shell(P,side);mounts(P,side);retentionFrame(P,side);}
}
