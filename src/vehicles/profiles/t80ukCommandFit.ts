// The T-80UK command fit on the complete T-80U source-X build (buildT80UX): the parts the commander's version carries
// that the line tank lacks. 267 (blind critics on grey close-ups, both FIX; coordinator brief): the real T-80UK adds the
// R-163-50U / R-163-50K radio pair (inside the turret; outside, two whip antennas on insulated mounts at the turret
// rear), the Shtora-1 laser-warning heads on the turret roof front, the DVE-BS crosswind sensor mast at the rear of the
// roof, and the AB-1-P/30 auxiliary power unit in an armoured box on the left rear fender; the field stowage basket and
// its canvas roll ride the turret rear. The commander's sight is the twin's own (t80uX.ts commanderSightHead), so no
// second sensor head stands on the roof. Every part is seated on what carries it by a ray onto that stock, its foot
// SEAT_M into it. Turret parts in the turret frame (the ring centre, the casting raised T80U_X_RING_RAISE_M with it),
// hull parts in the hull frame. First-party construction: Kevin B. Liu (NOTICE.md).
import * as THREE from 'three';
import {KIT} from './kit.ts';
import {beamBetween} from './measuredPrimitives.ts';
import {sectionSolid,type SectionPoint} from './sectionSolid.ts';
import {antennaPart} from './antennaPart.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
type Point=readonly[number,number,number];
const {box,cylX,cylZ}=KIT;
const cylY=(r:number,h:number,n=16,r2?:number)=>KIT.cylY(r,r2??r,h,n);
/** How far a part's foot stands into the stock that carries it. */
const SEAT_M=.008;

/** The stock a part may seat on: the rig's own buckets as raycast meshes (reactive cassettes left out). */
function stock(P:TankBuilderPort,buckets:readonly string[]):{meshes:THREE.Mesh[];dispose:()=>void}{
  const mat=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),meshes:THREE.Mesh[]=[];
  P.forEachBucketPart([...buckets],g=>{if(g.userData.eraHitFaceVertexStarts)return;const m=new THREE.Mesh(g,mat);m.updateMatrixWorld();meshes.push(m);});
  return {meshes,dispose:()=>mat.dispose()};
}
/** The first stock surface along a ray (the rig frame), or a thrown error naming the part. */
function hit(meshes:THREE.Mesh[],from:Point,dir:Point,what:string,id:string):THREE.Vector3{
  const h=new THREE.Raycaster(new THREE.Vector3(...from),new THREE.Vector3(...dir).normalize()).intersectObjects(meshes)[0];
  if(!h)throw new Error(`${id}: T-80UK command fit finds no seat for ${what}`);
  return h.point;
}
const TURRET_STOCK=['turret','turretDetail','turretEquipment','turretDark'] as const;
const HULL_STOCK=['hull','hullDetail'] as const;
const lathe=(profile:readonly(readonly[number,number])[],n=20)=>new THREE.LatheGeometry(profile.map(([r,y])=>new THREE.Vector2(r,y)),n);

// ---- turret roof ------------------------------------------------------------------------------------------------------

/** A prism standing on the roof: rings [x, -z] at rising y stations. */
const upright=(stations:readonly{y:number;ring:readonly SectionPoint[]}[])=>sectionSolid(stations.map(s=>({z:s.y,ring:s.ring})))
  .applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(1,0,0),new THREE.Vector3(0,0,-1),new THREE.Vector3(0,1,0)));

/** The four corners a levelling pad reads the roof at: (x -/+ hx, z - hz), then (x -/+ hx, z + hz). */
const padCorners=(hx:number,hz:number)=>[[-hx,-hz],[hx,-hz],[-hx,hz],[hx,hz]] as const;
/** A pad level on top at `top`, its underside fitted to the sloping roof (`under`: the roof's height at padCorners) and
 * SEAT_M into it. */
const levelPad=(x:number,z:number,hx:number,hz:number,under:readonly number[],top:number)=>sectionSolid([0,1].map(k=>({z:z+(k?hz:-hz),
  ring:[[x-hx,under[k*2]-SEAT_M],[x+hx,under[k*2+1]-SEAT_M],[x+hx,top],[x-hx,top]] as SectionPoint[]})));

/** A Shtora-1 TShU-1-11 laser-warning head: a squat octagonal housing, its top chamfered into facets, its three detector
 * windows on the forward facets and a lens on top, on a short bracket (two cheeks and a web) whose foot plate, level on
 * top and fitted underneath to the sloping roof, is bolted to it. 0.15 m across the flats. `corners` is the roof's height
 * under the foot's corners (x -/+ 0.065 at z - 0.055, then at z + 0.055). */
const LWR_FOOT=padCorners(.065,.055);
function laserWarningHead(P:TankBuilderPort,x:number,z:number,corners:readonly number[]):void{
  const ytop=Math.max(...corners)+.006,hy=ytop+.044,ap=.075,R=ap/Math.cos(Math.PI/8);
  P.addEquipment('turretDetail',levelPad(x,z,.065,.055,corners,ytop));
  for(const dx of [-.050,.050])for(const dz of [-.040,.040])P.addEquipment('turretDark',cylY(.0065,.006,6).translate(x+dx,ytop+.002,z+dz));
  for(const dx of [-.038,.038])P.addEquipment('turretDetail',box(.012,.052,.078).translate(x+dx,ytop+.024,z));
  P.addEquipment('turretDetail',box(.064,.040,.012).translate(x,ytop+.020,z-.024));
  const oct=(s:number)=>Array.from({length:8},(_,k)=>{const a=Math.PI/8+k*Math.PI/4;return [x+R*s*Math.cos(a),-z+R*s*Math.sin(a)] as SectionPoint;});
  P.addEquipment('turretDetail',upright([{y:hy,ring:oct(1)},{y:hy+.060,ring:oct(1)},{y:hy+.086,ring:oct(.60)}]));
  for(const a of [-Math.PI/4,0,Math.PI/4])
    P.addEquipment('turretDark',box(.044,.030,.006).rotateY(a).translate(x+(ap+.001)*Math.sin(a),hy+.032,z+(ap+.001)*Math.cos(a)));
  P.addEquipment('turretDark',cylY(.022,.004,16).translate(x,hy+.087,z));
}

/** The DVE-BS crosswind sensor: a folding mast on a hinge block at the rear of the roof; on its head the sensor, a small
 * vertical cylinder with a domed cap and two window bands, inside a guard of two rings on four posts with a cross over the
 * top; under the guard the vane, a tail fin aft on an arm with its counterweight forward. The mast and everything on it
 * take the antenna seat role (antennaPart): a thin mast is not the turret's body. */
function windSensorMast(P:TankBuilderPort,x:number,z:number,roof:number,slope:readonly[number,number]):void{
  const y0=roof-SEAT_M,hinge=y0+.055,top=hinge+.52,ant=(bucket:string,g:THREE.BufferGeometry)=>P.addEquipment(bucket,antennaPart(g));
  // the hinge block, its underside following the roof's slope (`slope`: the roof at z -/+ 0.045)
  P.addEquipment('turretDetail',sectionSolid([0,1].map(k=>{const b=slope[k]-SEAT_M;return {z:z+(k?.045:-.045),ring:[[x-.040,b],[x+.040,b],
    [x+.040,y0+.040],[x+.024,y0+.070],[x-.024,y0+.070],[x-.040,y0+.040]] as SectionPoint[]};})));
  P.addEquipment('turretDark',cylX(.012,.096,10),x,hinge,z);
  ant('turretDetail',cylY(.017,top-hinge,12,.021).translate(x,(hinge+top)/2,z));
  const h0=top+.006,gr=.082,g0=top+.004,g1=h0+.200;
  ant('turretDetail',cylY(.034,.016,16).translate(x,top,z));
  ant('turretDetail',lathe([[0,h0],[.040,h0],[.040,h0+.150],[.034,h0+.166],[.018,h0+.174],[0,h0+.176]],20).translate(x,0,z));
  for(const dy of [.045,.105])ant('turretDark',cylY(.0415,.016,20).translate(x,h0+dy,z));
  for(const y of [g0,g1])ant('turretDetail',new THREE.TorusGeometry(gr,.0065,6,24).rotateX(Math.PI/2).translate(x,y,z));
  for(let k=0;k<4;k++){const a=Math.PI/4+k*Math.PI/2,px=x+gr*Math.cos(a),pz=z+gr*Math.sin(a);
    ant('turretDetail',beamBetween([px,g0,pz],[px,g1,pz],.0065,6));
    ant('turretDetail',beamBetween([x+.026*Math.cos(a),top,z+.026*Math.sin(a)],[px,g0,pz],.006,6));}
  for(const a of [Math.PI/4,3*Math.PI/4])
    ant('turretDetail',beamBetween([x-gr*Math.cos(a),g1,z-gr*Math.sin(a)],[x+gr*Math.cos(a),g1,z+gr*Math.sin(a)],.006,6));
  const vy=top-.090;
  ant('turretDetail',cylY(.026,.032,12).translate(x,vy,z));
  ant('turretDetail',beamBetween([x,vy,z+.095],[x,vy,z-.205],.006,6));
  ant('turretDark',cylZ(.016,.040,10).translate(x,vy,z+.105));
  ant('turretDetail',foreAft([x-.0025,x+.0025].map(sx=>({x:sx,ring:ccw([[-z+.190,vy-.028],[-z+.330,vy-.048],[-z+.330,vy+.062],[-z+.190,vy+.030]])}))));
}

/** An R-163 whip on its insulated mount: a bolted flange, the cylindrical insulator base, the conical insulator, the
 * coil-spring foot and the cable gland, then the whip in three sections with joint collars and a tip cap, leaning
 * back WHIP_LEAN, the whole mount standing level on a wedge pad fitted to the sloping rear roof. The gland faces forward and its cable runs down onto the roof and forward along it, under a bolted
 * clip, into a roof entry boss: away from the stowed snorkel behind. The whip takes the antenna seat role (antennaPart).
 * `cableRoof` is the roof's height where the cable meets the roof, at its clip and at its boss (z + 0.110, 0.135, 0.170),
 * the boss short of the loader's hatch ring. */
const WHIP_LEAN=.10,WHIP_SECTIONS=[[.0115,1.05],[.0085,1.00],[.0055,.95]] as const;
const MOUNT_PAD=padCorners(.075,.075);
function antennaMount(P:TankBuilderPort,x:number,z:number,under:readonly number[],cableRoof:readonly[number,number,number]):void{
  // the mount stands level on a pad fitted to the roof's slope (`under`: the roof at MOUNT_PAD), its flange 3 mm into it
  const padTop=Math.max(...under)+.010,y0=padTop-.003;
  P.addEquipment('turretDetail',levelPad(x,z,.075,.075,under,padTop));
  P.addEquipment('turretDetail',lathe([[0,y0],[.068,y0],[.068,y0+.012],[.062,y0+.016],[.046,y0+.016],[.046,y0+.080],
    [.040,y0+.086],[.040,y0+.090],[.020,y0+.160],[.016,y0+.166],[0,y0+.166]],24),x,0,z);
  for(let k=0;k<6;k++){const a=k*Math.PI/3+Math.PI/6;
    P.addEquipment('turretDark',cylY(.0075,.007,6),x+.057*Math.cos(a),y0+.0155,z+.057*Math.sin(a));}
  // the gland, the cable along the roof, its clip and the entry boss
  const [r1,r2,r3]=cableRoof,cr=.0085;
  P.addEquipment('turretDark',cylZ(.016,.050,10).translate(x,y0+.045,z+.060));
  P.addEquipment('turretDark',new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(x,y0+.045,z+.082),
    new THREE.Vector3(x,y0+.038,z+.096),new THREE.Vector3(x,r1+cr-.002,z+.110),new THREE.Vector3(x,r2+cr-.002,z+.135),
    new THREE.Vector3(x,r3+.012,z+.170)]),16,cr,8));
  const clip:THREE.Vector3[]=[];
  for(let i=0;i<=8;i++){const a=Math.PI*i/8;clip.push(new THREE.Vector3(x+(cr+.004)*Math.cos(a),r2+cr-.002+(cr+.004)*Math.sin(a),z+.135));}
  P.addEquipment('turretDetail',new THREE.TubeGeometry(new THREE.CatmullRomCurve3(clip),10,.003,5));
  for(const sx of [-1,1])P.addEquipment('turretDetail',box(.016,.005,.014).translate(x+sx*(cr+.012),r2-SEAT_M+.0025+.002,z+.135));
  P.addEquipment('turretDark',cylY(.0055,.005,6).translate(x+cr+.012,r2+.004,z+.135));
  P.addEquipment('turretDetail',cylY(.021,.030,12).translate(x,r3-SEAT_M+.015,z+.170));
  P.addEquipment('turretDark',cylY(.025,.010,6).translate(x,r3+.012,z+.170));
  // the coil-spring foot over the insulator, then the whip, both turned back WHIP_LEAN about the spring's foot
  const foot=new THREE.Vector3(x,y0+.164,z),lean=new THREE.Matrix4().makeRotationX(-WHIP_LEAN),turns=6,coilH=.090;
  const coil:THREE.Vector3[]=[];
  for(let i=0;i<=turns*16;i++){const t=i/16*Math.PI*2;coil.push(new THREE.Vector3(.019*Math.cos(t),coilH*i/(turns*16),.019*Math.sin(t)));}
  const place=(g:THREE.BufferGeometry)=>g.applyMatrix4(lean).translate(foot.x,foot.y,foot.z);
  P.addEquipment('turretDark',place(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coil),turns*16,.0055,6)));
  P.addEquipment('turretDark',place(cylY(.014,.020,12).translate(0,coilH+.006,0)));
  let y=coilH+.016;
  WHIP_SECTIONS.forEach(([r,len],i)=>{
    P.addEquipment('turretDark',antennaPart(place(cylY(r,len,8,r*1.3).translate(0,y+len/2,0))));
    y+=len;
    if(i<WHIP_SECTIONS.length-1)P.addEquipment('turretDark',antennaPart(place(cylY(r*1.6,.032,8).translate(0,y,0))));
  });
  P.addEquipment('turretDark',antennaPart(place(new THREE.SphereGeometry(.013,10,6).translate(0,y+.004,0))));
}

// ---- turret rear: the stowage basket and its canvas roll --------------------------------------------------------------

const V=(p:Point)=>new THREE.Vector3(p[0],p[1],p[2]);
const pt=(v:THREE.Vector3):Point=>[v.x,v.y,v.z];
/** A flat bar from a to b, `w` wide along `across` (squared to the bar) and `t` thick. */
function bar(a:Point,b:Point,w:number,t:number,across:Point=[0,1,0]):THREE.BufferGeometry{
  const A=V(a),B=V(b),ax=B.clone().sub(A),len=ax.length();ax.normalize();
  const u=V(across);u.addScaledVector(ax,-u.dot(ax)).normalize();
  const s=new THREE.Vector3().crossVectors(u,ax);
  return box(t,w,len).applyMatrix4(new THREE.Matrix4().makeBasis(s,u,ax).setPosition(A.add(B).multiplyScalar(.5)));
}
/** A Y-axis part turned so its +Y runs along `n`, centred at `c`. */
const along=(g:THREE.BufferGeometry,n:THREE.Vector3,c:THREE.Vector3)=>
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),n.clone().normalize())).translate(c.x,c.y,c.z);
/** A ring wound counter-clockwise. */
const ccw=(ring:SectionPoint[])=>ring.reduce((a,p,i)=>{const q=ring[(i+1)%ring.length];return a+p[0]*q[1]-q[0]*p[1];},0)<0?ring.reverse():ring;
/** A solid drawn in the (rearward, up) plane, its rings [u = -z, y] at x stations: a plate standing fore-and-aft. */
function foreAft(stations:readonly{x:number;ring:readonly SectionPoint[]}[]):THREE.BufferGeometry{
  return sectionSolid(stations.map(s=>({z:s.x,ring:s.ring})))
    .applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(0,0,-1),new THREE.Vector3(0,1,0),new THREE.Vector3(1,0,0)));
}
/** Webbing: a flat band `w` wide along `axis` through points lying in (near) planes square to it, `t` thick; the cut
 * ends are closed. */
function webbing(points:readonly THREE.Vector3[],w:number,t:number,closed=false,axis=new THREE.Vector3(1,0,0)):THREE.BufferGeometry{
  const n=points.length,pos:number[]=[],idx:number[]=[],X=axis.clone().normalize();
  for(let i=0;i<n;i++){
    const prev=points[closed?(i-1+n)%n:Math.max(0,i-1)],next=points[closed?(i+1)%n:Math.min(n-1,i+1)];
    const nrm=new THREE.Vector3().crossVectors(X,next.clone().sub(prev)).normalize();
    for(const [a,b] of [[-1,-1],[1,-1],[1,1],[-1,1]]){const p=points[i].clone().addScaledVector(X,a*w/2).addScaledVector(nrm,b*t/2);pos.push(p.x,p.y,p.z);}
  }
  for(let i=0;i<(closed?n:n-1);i++){const a=i*4,b=((i+1)%n)*4;
    for(let k=0;k<4;k++){const k2=(k+1)%4;idx.push(a+k,b+k,b+k2,a+k,b+k2,a+k2);}}
  if(!closed){const e=(n-1)*4;idx.push(0,1,2,0,2,3,e,e+2,e+1,e,e+3,e+2);}
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);
  const flat=g.toNonIndexed();g.dispose();
  flat.setAttribute('uv',new THREE.Float32BufferAttribute(new Array(flat.getAttribute('position').count*2).fill(0),2));
  flat.computeVertexNormals();
  return flat;
}

/** The basket: an arc concentric with the turret ring round the casting's rear, behind the stowed OPVT snorkel (its back at
 * z -1.741, its end mounts out to x 0.995): inner radius ri, outer ro, from -half to +half about the rear centre line, its
 * ends radial. Turret frame, the ring centre at the origin. */
const BASKET={ri:2.04,ro:2.42,half:40*Math.PI/180,floor:.088,height:.34} as const;
const polar=(r:number,phi:number,y:number)=>new THREE.Vector3(r*Math.sin(phi),y,-r*Math.cos(phi));
const tangentAt=(phi:number):Point=>[Math.cos(phi),0,Math.sin(phi)];
const radialAt=(phi:number):Point=>[Math.sin(phi),0,-Math.cos(phi)];
/** Where the brackets run out from the casting: two under the snorkel, clear of its saddle struts (x 0.61-0.80), and one
 * near each end, in front of the snorkel's end mounts, whose stay reaches the inner top rail. */
const BRACKET_PHI=[-38.5,-12,12,38.5].map(d=>d*Math.PI/180);
function rearBasket(P:TankBuilderPort,meshes:THREE.Mesh[]):void{
  const {ri,ro,half,floor:yf,height:H}=BASKET,yt=yf+H,id=P.spec.id;
  const det=(g:THREE.BufferGeometry)=>P.addEquipment('turretDetail',g),dark=(g:THREE.BufferGeometry)=>P.addEquipment('turretDark',g);
  const N=18,phis=Array.from({length:N+1},(_,i)=>-half+2*half*i/N);
  // the top rails: the outer and inner arcs, the radial end rails; the corner posts
  for(const r of [ri,ro])det(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(phis.map(p=>polar(r,p,yt))),36,.014,8));
  for(const s of [-1,1]){const p=s*half;det(beamBetween(pt(polar(ri,p,yt)),pt(polar(ro,p,yt)),.014,8));
    for(const r of [ri,ro])det(beamBetween(pt(polar(r,p,yf-.022)),pt(polar(r,p,yt+.014)),.016,8));}
  // welded flat strap all round: the bottom frame on edge, two horizontal straps, the uprights
  const arcBar=(r:number,y:number,w:number,t:number)=>{for(let i=0;i<N;i++){const A=polar(r,phis[i],y),B=polar(r,phis[i+1],y),d=B.clone().sub(A).normalize().multiplyScalar(.003);
    det(bar(pt(A.sub(d)),pt(B.add(d)),w,t));}};
  for(const r of [ri,ro]){arcBar(r,yf,.036,.006);for(const f of [1/3,2/3])arcBar(r,yf+H*f,.024,.005);}
  for(const s of [-1,1]){const p=s*half;
    det(bar(pt(polar(ri,p,yf)),pt(polar(ro,p,yf)),.036,.006));
    for(const f of [1/3,2/3])det(bar(pt(polar(ri,p,yf+H*f)),pt(polar(ro,p,yf+H*f)),.024,.005));
    for(const f of [1/3,2/3]){const r=ri+(ro-ri)*f;det(bar(pt(polar(r,p,yf-.018)),pt(polar(r,p,yt)),.026,.005,radialAt(p)));}}
  const U=22;for(let i=1;i<U;i++){const p=-half+2*half*i/U;for(const r of [ri,ro])det(bar(pt(polar(r,p,yf-.018)),pt(polar(r,p,yt)),.026,.005,tangentAt(p)));}
  // the slatted floor: radial slats on the bottom frame and two bearer arcs
  const S=34;for(let i=0;i<S;i++){const p=-half+2*half*(i+.5)/S;det(bar(pt(polar(ri+.004,p,yf)),pt(polar(ro-.004,p,yf)),.05,.006,tangentAt(p)));}
  for(const r of [ri+.09,ro-.09])for(let i=0;i<N;i++)det(bar(pt(polar(r,phis[i]-.002,yf-.015)),pt(polar(r,phis[i+1]+.002,yf-.015)),.024,.008));
  // the brackets, each drawn on its own radial line (local -z outward from the ring centre): a block welded to the casting
  // (its back fitted to the wall, four bolts in its face), a flat-bar arm on edge under the floor out to the outer side, a
  // gusset on the arm at the block, the arm's end turned up the outer side to the top rail and bolted to the frame and the
  // straps, a knee outside the outer side between the arm's end and the upturn; at the ends a second, higher block and a flat-bar stay from it to the inner top rail
  for(const phi of BRACKET_PHI){
    const Mx=new THREE.Matrix4().makeRotationY(-phi),inv=Mx.clone().invert(),inward=pt(new THREE.Vector3(0,0,1).transformDirection(Mx));
    const wallU=(sx:number,y:number)=>-hit(meshes,pt(new THREE.Vector3(sx,y,-2.6).applyMatrix4(Mx)),inward,'a basket bracket',id).applyMatrix4(inv).z;
    const block=(ys:readonly number[],w:number)=>{
      const st=[-w,w].map(sx=>{const u=ys.map(y=>wallU(sx,y)),front=Math.max(...u)+.012,k=ys.length-1;
        return {x:sx,front,ring:[[u[0]-SEAT_M,ys[0]],[front,ys[0]],[front,ys[k]],...ys.slice(1).reverse().map((y,i)=>[u[k-i]-SEAT_M,y] as SectionPoint)] as SectionPoint[]};});
      det(foreAft(st).applyMatrix4(Mx));
      return (sx:number)=>st[0].front+(st[1].front-st[0].front)*(sx-st[0].x)/(st[1].x-st[0].x);};
    const local=(g:THREE.BufferGeometry)=>g.applyMatrix4(Mx);
    const front=block([.030,.065,.100,.135,.170],.06);
    for(const dx of [-.036,.036])for(const y of [.052,.148])dark(local(cylZ(.0085,.008,6).translate(dx,y,-front(dx)-.003)));
    det(local(bar([0,.060,-front(0)+.004],[0,.060,-(ro+.045)],.050,.014)));
    const knee=[[ro+.0085,.035],[ro+.045,.035],[ro+.0085,.130]] as SectionPoint[];
    det(local(foreAft([{x:-.005,ring:knee},{x:.005,ring:knee}])));
    const g=[[front(0)-.002,yf-.004],[front(0)+.090,yf-.004],[front(0)-.002,yf+.062]] as SectionPoint[];
    det(local(foreAft([{x:-.005,ring:g},{x:.005,ring:g}])));
    det(local(bar([0,.035,-(ro+.0055)],[0,yt+.014,-(ro+.0055)],.046,.008,[1,0,0])));
    for(const y of [yf,yf+H/3,yf+H*2/3])dark(local(cylZ(.0085,.007,6).translate(0,y,-(ro+.0055+.0065))));
    if(Math.abs(phi)>.5){
      const high=block([.20,.24,.28],.04);
      for(const dx of [-.022,.022])dark(local(cylZ(.008,.008,6).translate(dx,.24,-high(dx)-.003)));
      det(local(bar([0,.24,-high(0)+.004],[0,yt-.006,-(ri-.012)],.040,.010,[1,0,0])));
    }
  }
}

/** The crew's canvas roll lying in the basket along its arc, about 0.3 m through: soft and settled (its section an oval
 * flattened where it rests), its outer layer's edge running along it, its ends dished with the rolled layers showing as
 * a spiral, cinched hard by three webbing straps with buckles whose tails wrap the basket's outer and inner top rails. */
const ROLL={length:1.18,radius:.15,layer:.010,straps:[-.36,0,.36],flapAt:.9} as const;
function canvasRoll(P:TankBuilderPort):void{
  const {length:L,radius:R,layer:tL,straps,flapAt:tf}=ROLL,{floor:yf,ri,ro,height:H}=BASKET,yt=yf+H;
  const rm=(ri+ro)/2,yc=yf+.003+.70*R-.005,TAU=Math.PI*2,NT=24,NS=28,K=4,dish=.020;
  // the roll follows the basket's arc: s along it is the angle s/rm, rho outward from its centre line
  const map=(s:number,y:number,rho:number)=>polar(rm+rho,s/rm,y);
  const radius=(s:number,th:number,phase:number)=>{const d=L/2-Math.abs(s);
    const shoulder=d<.04?.9+.1*Math.sqrt(1-((.04-d)/.04)**2):1;
    const pinch=1-straps.reduce((m:number,q:number)=>m+.14*Math.exp(-(((s-q)/.028)**2)),0);
    return R*(1-tL/R*phase)*shoulder*pinch*(1+.015*Math.sin(3*th+4*s)+.010*Math.sin(5*th-7*s));};
  const section=(r:number,th:number)=>{let dy=r*.84*Math.cos(th);const flat=-.64*r;if(dy<flat)dy=flat+(dy-flat)*.3;return {dy,rho:r*1.06*Math.sin(th)};};
  const pos=(sr:number,sa:number,th:number,phase:number,scale=1,lift=0)=>{const c=section(radius(sr,th,phase)*scale+lift,th);return map(sa,yc+c.dy,c.rho);};
  const at=(s:number,j:number)=>pos(s,s,tf+TAU*j/NT,j/NT);
  const vs:number[]=[],idx:number[]=[],push=(v:THREE.Vector3)=>{vs.push(v.x,v.y,v.z);return vs.length/3-1;};
  const grid:number[][]=[];
  for(let i=0;i<=NS;i++){const s=-L/2+L*i/NS;grid.push(Array.from({length:NT+1},(_,j)=>push(at(s,j))));}
  for(let i=0;i<NS;i++)for(let j=0;j<NT;j++){const a=grid[i][j],b=grid[i+1][j],c=grid[i+1][j+1],d=grid[i][j+1];idx.push(a,b,c,a,c,d);}
  // the outer layer's edge: the step from its thinned end back up to its full thickness at the flap
  for(let i=0;i<NS;i++){const a=grid[i][NT],b=grid[i+1][NT],c=grid[i+1][0],d=grid[i][0];idx.push(a,b,c,a,c,d);}
  // the ends, dished in toward the core
  for(const end of [-1,1]){const s=end*L/2,rings:number[][]=[];
    for(let k=0;k<K;k++){const f=1-k/K,ax=s-end*dish*(k/K)**.7;rings.push(Array.from({length:NT+1},(_,j)=>push(pos(s,ax,tf+TAU*j/NT,j/NT,f))));}
    const centre=push(map(s-end*dish,yc,0));
    for(let k=0;k<K;k++)for(let j=0;j<NT;j++){const a=rings[k][j],b=rings[k][j+1];
      const c=k<K-1?rings[k+1][j+1]:centre,d=k<K-1?rings[k+1][j]:centre;
      if(end<0){idx.push(a,b,c);if(k<K-1)idx.push(a,c,d);}else{idx.push(a,c,b);if(k<K-1)idx.push(a,d,c);}}
  }
  const roll=new THREE.BufferGeometry();
  roll.setAttribute('position',new THREE.Float32BufferAttribute(vs,3));
  roll.setAttribute('uv',new THREE.Float32BufferAttribute(new Array(vs.length/3*2).fill(0),2));
  roll.setIndex(idx);roll.computeVertexNormals();
  P.addEquipment('turretCloth',roll);
  // the rolled layers on each end: a spiral from the core out to the flap, standing just proud of the dished end
  const phaseOf=(th:number)=>((th-tf)/TAU%1+1)%1;
  for(const end of [-1,1]){const s=end*L/2,turns=3,pts:THREE.Vector3[]=[];
    for(let i=0;i<=turns*16;i++){const ph=i/(turns*16),f=.14+.80*ph,th=tf+TAU*turns*ph;
      pts.push(pos(s,s-end*(dish*(1-f)**.7-.0025),th,phaseOf(th),f));}
    P.addEquipment('turretCloth',new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),turns*16,.0042,5));
  }
  // the straps: a webbing band biting into the roll, its buckle on top, its tails wrapping the outer and inner top rails
  const Y=new THREE.Vector3(0,1,0);
  for(const q of straps){
    const phq=q/rm,X=V(tangentAt(phq)),out=V(radialAt(phq));
    const ring=Array.from({length:NT},(_,j)=>{const th=tf+TAU*j/NT;return pos(q,q,th,j/NT,1,.0015);});
    P.addEquipment('turretDark',webbing(ring,.040,.004,true,X));
    const thb=.40,p=pos(q,q,thb,phaseOf(thb),1,.005),nb=p.clone().sub(map(q,yc,0)).normalize();
    const tb=pos(q,q,thb+.01,phaseOf(thb+.01)).sub(pos(q,q,thb-.01,phaseOf(thb-.01))).normalize();
    for(const sx of [-1,1])P.addEquipment('turretDark',bar(pt(p.clone().addScaledVector(X,sx*.025).addScaledVector(tb,-.022)),pt(p.clone().addScaledVector(X,sx*.025).addScaledVector(tb,.022)),.007,.005,pt(nb)));
    for(const st of [-1,1])P.addEquipment('turretDark',bar(pt(p.clone().addScaledVector(X,-.029).addScaledVector(tb,st*.019)),pt(p.clone().addScaledVector(X,.029).addScaledVector(tb,st*.019)),.007,.005,pt(nb)));
    P.addEquipment('turretDark',bar(pt(p.clone().addScaledVector(nb,.001)),pt(p.clone().addScaledVector(tb,.019).addScaledVector(nb,.001)),.004,.004,pt(nb)));
    for(const [th,railR,sense] of [[1.15,ro,-1],[-1.15,ri,1]] as const){
      const start=pos(q,q,th,phaseOf(th),1,.0015),c=polar(railR,phq,yt),inward=out.clone().multiplyScalar(sense);
      const from=start.clone().lerp(c,.5).add(new THREE.Vector3(0,.012,0)),rel=from.clone().sub(c);
      const a0=Math.atan2(rel.dot(Y),rel.dot(inward)),pts=[start,from];
      for(let i=0;i<=14;i++){const a=a0+(TAU+.7)*i/14,rho=.0175+.0045*i/14;
        pts.push(c.clone().addScaledVector(Y,rho*Math.sin(a)).addScaledVector(inward,rho*Math.cos(a)));}
      P.addEquipment('turretDark',webbing(pts,.036,.003,false,X));
    }
  }
}

// ---- hull: the auxiliary power unit ------------------------------------------------------------------------------------

/** The AB-1-P/30 auxiliary power unit's armoured box on the left rear fender's deck plate (top 1.542, x 1.103-1.597):
 * a closed box chamfered along its outboard top edge, its hinged lid with two knuckles inboard, two latches and a lifting
 * handle, the exhaust out of its outboard face with its elbow turned aft, a louvred intake on its rear face, and the
 * cable conduit from its inboard face into a bolted gland on the hull roof. Everything stays under the box's top, which
 * the gun's published floor already clears. */
const APU={x0:1.14,x1:1.56,z0:-2.72,z1:-2.26,top:1.80} as const;
function auxiliaryPowerUnit(P:TankBuilderPort,meshes:THREE.Mesh[]):void{
  const {x0,x1,z0,z1,top}=APU;
  const seat=Math.min(...[[x0+.03,z0+.03],[x1-.03,z0+.03],[x0+.03,z1-.03],[x1-.03,z1-.03]].map(([x,z])=>
    hit(meshes,[x,2.5,z],[0,-1,0],'the APU box',P.spec.id).y)),y0=seat-SEAT_M;
  const body:SectionPoint[]=[[x0,y0],[x1,y0],[x1,top-.055],[x1-.050,top],[x0+.012,top],[x0,top-.012]];
  P.addEquipment('hullDetail',sectionSolid([{z:z0,ring:body},{z:z1,ring:body}]));
  // the lid, 3 mm into the box top, and its hinge knuckles along the inboard edge
  const lid:SectionPoint[]=[[x0+.020,top-.003],[x1-.060,top-.003],[x1-.060,top+.009],[x0+.026,top+.009],[x0+.020,top+.006]];
  P.addEquipment('hullDetail',sectionSolid([{z:z0+.025,ring:lid},{z:z1-.025,ring:lid}]));
  for(const z of [z0+.12,z1-.12])P.addEquipment('hullDark',cylZ(.011,.075,10),x0+.018,top+.004,z);
  // the latches on the outboard face, the lifting handle on the lid
  for(const z of [z0+.14,z1-.14]){
    P.addEquipment('hullDark',box(.016,.050,.042),x1+.005,top-.085,z);
    P.addEquipment('hullDark',cylX(.008,.020,8),x1+.012,top-.068,z);
  }
  const zm=(z0+z1)/2,xh=(x0+x1)/2-.03;
  P.addEquipment('hullDark',new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(xh,top+.006,zm-.09),
    new THREE.Vector3(xh,top+.045,zm-.07),new THREE.Vector3(xh,top+.050,zm),new THREE.Vector3(xh,top+.045,zm+.07),
    new THREE.Vector3(xh,top+.006,zm+.09)]),16,.007,6));
  // the exhaust: a stub out of the outboard face 0.20 m ahead of the rear face (the intake's), its elbow turned up and its
  // collared mouth (dark inside) under the box's chamfered edge; a clamp strap holds the pipe to the box. Not at the
  // face's front end, where the gun's published floor passes low beside the box (yaw 143, -5 degrees).
  const ey=top-.175,ez=z0+.20,exX=x1+.055,mouth=top-.080;
  P.addEquipment('hullDark',new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(x1-.012,ey,ez),
    new THREE.Vector3(x1+.030,ey,ez),new THREE.Vector3(exX-.003,ey+.022,ez),new THREE.Vector3(exX,ey+.060,ez),
    new THREE.Vector3(exX,mouth,ez)]),16,.026,12));
  P.addEquipment('hullDark',lathe([[.0235,-.011],[.031,-.011],[.031,.011],[.0235,.011],[.0235,-.011]],14).translate(exX,mouth-.008,ez));
  P.addEquipment('hullDark',cylY(.0245,.004,12).translate(exX,mouth-.022,ez));
  P.addEquipment('hullDark',bar([x1-.004,mouth-.040,ez],[exX,mouth-.040,ez],.020,.006,[0,0,1]));
  // the louvred intake on the rear face: a frame and four slats
  P.addEquipment('hullDetail',box(.24,.12,.010).translate((x0+x1)/2,y0+.13,z0-.002));
  for(let i=0;i<4;i++)P.addEquipment('hullDark',box(.21,.010,.022).rotateX(.6).translate((x0+x1)/2,y0+.09+i*.027,z0-.010));
  // the cable conduit: a gland nut on the inboard face, the ribbed armoured hose bending inboard and down onto the hull
  // roof beside the box, and the bolted hull gland it enters (2.55 m from the turret's axis, outside the basket's sweep)
  const cz=z1-.07,cy=y0+.13,gx=.95,gz=z1-.03;
  const deck=hit(meshes,[gx,2.5,gz],[0,-1,0],'the APU conduit gland',P.spec.id),gy=deck.y-SEAT_M;
  P.addEquipment('hullDark',cylX(.024,.026,12),x0-.011,cy,cz);
  P.addEquipment('hullDark',cylX(.028,.010,6),x0-.028,cy,cz);
  P.addEquipment('hullDetail',cylY(.042,.016,16),gx,gy+.008,gz);
  for(let k=0;k<4;k++){const a=Math.PI/4+k*Math.PI/2;P.addEquipment('hullDark',cylY(.0065,.007,6),gx+.031*Math.cos(a),gy+.0185,gz+.031*Math.sin(a));}
  P.addEquipment('hullDark',cylY(.024,.040,12,.028),gx,gy+.036,gz);
  P.addEquipment('hullDark',cylY(.028,.012,6),gx,gy+.060,gz);
  const hose=new THREE.CatmullRomCurve3([new THREE.Vector3(x0-.030,cy,cz),new THREE.Vector3(x0-.085,cy-.004,cz+.012),
    new THREE.Vector3(gx+.035,gy+.140,gz-.050),new THREE.Vector3(gx+.004,gy+.100,gz-.008),new THREE.Vector3(gx,gy+.062,gz)]);
  P.addEquipment('hullDark',new THREE.TubeGeometry(hose,20,.0155,8));
  for(let i=1;i<=6;i++){const t=i/7;P.addEquipment('hullDark',along(cylY(.0195,.008,10),hose.getTangentAt(t),hose.getPointAt(t)));}
}

/** Lay the T-80UK command fit (after buildT80UX). */
export function addT80UKCommandFit(P:TankBuilderPort):void{
  const turret=stock(P,TURRET_STOCK),hull=stock(P,HULL_STOCK);
  try{
    const roof=(x:number,z:number,what:string)=>hit(turret.meshes,[x,1.6,z],[0,-1,0],what,P.spec.id).y;
    // every turret seat is read before any part is laid, so no part seats on another
    const lwr=[-1,1].map(s=>({x:s*.50,z:.548,corners:LWR_FOOT.map(([dx,dz])=>roof(s*.50+dx,.548+dz,'a laser-warning head'))}));
    const wind={x:0,z:-1.172,y:roof(0,-1.172,'the DVE-BS mast'),slope:[-.045,.045].map(dz=>roof(0,-1.172+dz,'the DVE-BS hinge')) as [number,number]};
    const whips=[-1,1].map(s=>({x:s*.50,z:-1.072,under:MOUNT_PAD.map(([dx,dz])=>roof(s*.50+dx,-1.072+dz,'an antenna mount')),
      cable:[.110,.135,.170].map(dz=>roof(s*.50,-1.072+dz,'an antenna cable')) as [number,number,number]}));
    rearBasket(P,turret.meshes);
    for(const h of lwr)laserWarningHead(P,h.x,h.z,h.corners);
    windSensorMast(P,wind.x,wind.z,wind.y,wind.slope);
    for(const w of whips)antennaMount(P,w.x,w.z,w.under,w.cable);
    canvasRoll(P);
    auxiliaryPowerUnit(P,hull.meshes);
  }finally{turret.dispose();hull.dispose();}
}
