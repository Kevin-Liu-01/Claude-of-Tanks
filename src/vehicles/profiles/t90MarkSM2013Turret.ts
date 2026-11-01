// The T-90SM obr. 2013 (`t90sm_2013`) turret package: the character of its pre-rebuild welded turret, laid as equipment on
// the T-90SM source turret (t90X.ts buildT90SMXTurret, datum S). 2026-10-31 (lane t90-family-266; the owner: "make 2013,
// 2006, and 2004 turrets look more like they were before just on the new base", then "the new turrets have to be properly
// inspired from bases of the turrets from the ones that were there in the new verisons. like they should properly look
// distinguished like what was done with the other tanks but upholding the new level of visual quality").
// Then (the ADDENDUM): "see the 2022 is the level of innovation i want in our reworked t90s. same but fresh and different
// take". The old turret read long, flat and low; the package carries that in five signature groups: broad diamond cheek
// wraps over the source Relikt course; long shoulders (raked skins over the flank cases and long flat lidded bins on
// them); the long bustle wrapped in a slat stowage cage, floored, with its systems box; the hot-climate export kit (water
// cans in the cage and a pale sun tarp on it, beside the kit's air conditioner and sight hood); and the flat roof, a raised
// crown plate with the roof line of a crew bin, the backup sight and the stowed OPVT pipe. Each piece is measured on the
// source stock (rays, plane sections and vertex scans in the builder frame) and buried 5-15 mm into what carries it;
// nothing enters the gun's sweep, the roof station's traverse, the sights' and vision blocks' view or the hatches' swing,
// and nothing hangs lower than 1.69 m (the hull's highest part under the turret's sweep is 1.63 m).
import * as THREE from 'three';
import {KIT,orientedSlab} from './kit.ts';
import {sectionSolid,type SolidSection} from './sectionSolid.ts';
import {T90_X_DATUMS} from './t90X.ts';
import {fabricRollParts} from '../accessoryPrimitives.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';

type Point=readonly[number,number,number];
type XY=readonly[number,number];
const V=new THREE.Vector3();
const YAW=T90_X_DATUMS.t90sm.yaw;
const {box,cylX,cylY,cylZ}=KIT;
// Every turret bucket the source build lays (the ERA, cupolas, hatches and the stations' stock included).
const STOCK=['turret','turretDetail','turretDark','turretCupola','turretHatch','turretExternalArmor','turretEquipment',
  'turretPermanentMarkingSurface','turretPaintedDetail','turretGlass','turretOpenLattice','turretOpenLatticeDark'];

/** The source turret's stock as it stood before the package: first hits of builder-frame rays. */
class Stock {
  private readonly parts:{mesh:THREE.Mesh;box:THREE.Box3}[]=[];
  private readonly material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  private readonly ray=new THREE.Raycaster();
  constructor(P:TankBuilderPort) {
    P.forEachBucketPart(STOCK,(g,box)=>{
      if(!box||box.isEmpty())return;
      const mesh=new THREE.Mesh(g,this.material);mesh.updateMatrixWorld();this.parts.push({mesh,box:box.clone()});
    });
  }
  hit(from:Point,dir:Point,far=6):THREE.Vector3|null {
    const ray=this.ray;
    ray.set(new THREE.Vector3(from[0]-YAW[0],from[1]-YAW[1],from[2]-YAW[2]),new THREE.Vector3(...dir).normalize());
    ray.far=far;
    // the stock has no spatial index: test parts in the order the ray enters their bounds and stop once a hit lies
    // nearer than the next part's bounds
    const order:{t:number;mesh:THREE.Mesh}[]=[];
    for(const p of this.parts) {
      const e=ray.ray.intersectBox(p.box,V);
      if(e){const t=e.distanceTo(ray.ray.origin);if(t<=far)order.push({t,mesh:p.mesh});}
    }
    order.sort((a,b)=>a.t-b.t);
    let best:THREE.Intersection|null=null;
    const hits:THREE.Intersection[]=[];
    for(const {t,mesh} of order) {
      if(best&&t>best.distance)break;
      hits.length=0;mesh.raycast(ray,hits);
      for(const h of hits)if(!best||h.distance<best.distance)best=h;
    }
    return best?best.point.clone().add(new THREE.Vector3(...YAW)):null;
  }
  /** Outermost stock surface on a side (signed x) over a height band at a station: the stock's triangles cut by the
   * station's plane and clipped to the band, which is what a column of inward rays would meet. */
  reach(side:number,z:number,low:number,high:number):number|null {
    const zt=z-YAW[2],y0=low-YAW[1],y1=high-YAW[1],a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
    let best=-Infinity;
    const cut=(p:THREE.Vector3,q:THREE.Vector3,out:number[]):void=>{
      const dp=p.z-zt,dq=q.z-zt;
      if((dp<0&&dq<0)||(dp>0&&dq>0)||dp===dq)return;
      const t=dp/(dp-dq);out.push(p.x+(q.x-p.x)*t,p.y+(q.y-p.y)*t);
    };
    for(const {mesh,box} of this.parts) {
      if(box.min.z>zt||box.max.z<zt||box.max.y<y0||box.min.y>y1)continue;
      const g=mesh.geometry,pos=g.getAttribute('position'),idx=g.getIndex(),n=idx?idx.count:pos.count;
      for(let i=0;i<n;i+=3) {
        a.fromBufferAttribute(pos,idx?idx.getX(i):i);b.fromBufferAttribute(pos,idx?idx.getX(i+1):i+1);
        c.fromBufferAttribute(pos,idx?idx.getX(i+2):i+2);
        const seg:number[]=[];cut(a,b,seg);cut(b,c,seg);cut(c,a,seg);
        if(seg.length<4)continue;
        // the section segment, clipped to the band
        let [px,py,qx,qy]=seg;
        if(py>qy)[px,py,qx,qy]=[qx,qy,px,py];
        if(qy<y0||py>y1)continue;
        const at=(y:number):number=>qy===py?px:px+(qx-px)*(y-py)/(qy-py);
        const lo=Math.max(py,y0),hi=Math.min(qy,y1);
        best=Math.max(best,side*at(lo),side*at(hi));
      }
    }
    return Number.isFinite(best)?side*best+YAW[0]:null;
  }
  /** The most any stock vertex inside a plan region stands above a surface over it (or -Infinity): the clearance a plate
   * laid on that surface needs so that no narrow strip or seam the ray grids passed between pokes through it. */
  highestAbove(x0:number,x1:number,z0:number,z1:number,inside:(x:number,z:number)=>boolean,surface:(x:number,z:number)=>number):number {
    let best=-Infinity;
    this.vertices(x0,x1,z0,z1,(x,y,z)=>{if(inside(x,z))best=Math.max(best,y-surface(x,z));});
    return best;
  }
  /** Every stock vertex (builder frame) of the parts whose bounds meet a plan box. */
  vertices(x0:number,x1:number,z0:number,z1:number,visit:(x:number,y:number,z:number)=>void):void {
    const v=new THREE.Vector3();
    for(const {mesh,box} of this.parts) {
      if(box.max.x+YAW[0]<x0||box.min.x+YAW[0]>x1||box.max.z+YAW[2]<z0||box.min.z+YAW[2]>z1)continue;
      const pos=mesh.geometry.getAttribute('position');
      for(let i=0;i<pos.count;i++){v.fromBufferAttribute(pos,i);visit(v.x+YAW[0],v.y+YAW[1],v.z+YAW[2]);}
    }
  }
  /** The stock's face met by an inward ray (signed x), or throws. */
  wall(side:number,y:number,z:number,what:string):number {
    const h=this.hit([side*3,y,z],[-side,0,0]);
    if(!h)throw new Error(`t90sm_2013: no ${what} at y ${y} z ${z}`);
    return h.x;
  }
  /** The stock's top under a point. */
  top(x:number,z:number,what:string):number {
    const h=this.hit([x,4,z],[0,-1,0]);
    if(!h)throw new Error(`t90sm_2013: no ${what} under ${x},${z}`);
    return h.y;
  }
  /** The stock's underside over a point, searching up from below the turret. */
  under(x:number,z:number):number|null {return this.hit([x,1.5,z],[0,1,0])?.y??null;}
  dispose():void {this.material.dispose();}
}

/** A part authored in the builder frame, moved into the turret rig frame. */
function put(P:TankBuilderPort,bucket:string,g:THREE.BufferGeometry,x=0,y=0,z=0,rx=0,ry=0,rz=0):void {
  P.addEquipment(bucket,g,x-YAW[0],y-YAW[1],z-YAW[2],rx,ry,rz);
}

/** A straight bar of rectangular section between two builder-frame points (its `w` across in plan, `h` tall), placed in the
 * builder frame. */
function barGeometry(a:Point,b:Point,w:number,h:number):THREE.BufferGeometry {
  const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],len=Math.hypot(dx,dy,dz);
  const g=box(w,h,len);
  g.rotateX(-Math.atan2(dy,Math.hypot(dx,dz)));
  g.rotateY(Math.atan2(dx,dz));
  return g.translate((a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2);
}

function bar(P:TankBuilderPort,bucket:string,a:Point,b:Point,w:number,h:number):void {put(P,bucket,barGeometry(a,b,w,h));}

/** A closed ring, counter-clockwise from +Z, whatever order its points were measured in. */
function ccw(ring:readonly XY[]):readonly XY[] {
  let a=0;
  for(let i=0;i<ring.length;i++){const p=ring[i],q=ring[(i+1)%ring.length];a+=p[0]*q[1]-q[0]*p[1];}
  return a>0?ring:ring.slice().reverse();
}

const fit=(zs:readonly number[],vs:readonly number[]):((z:number)=>number)=>{
  const n=zs.length,mz=zs.reduce((s,v)=>s+v,0)/n,mv=vs.reduce((s,v)=>s+v,0)/n;
  let sxy=0,sxx=0;for(let i=0;i<n;i++){sxy+=(zs[i]-mz)*(vs[i]-mv);sxx+=(zs[i]-mz)**2;}
  const k=sxx>0?sxy/sxx:0;return (z)=>mv+k*(z-mz);
};

// ---- Diamond cheek modules --------------------------------------------------------------------------------------------
// The old turret's front: long, low and flat, with sharp broad diamond cheeks swept forward and outward well ahead of the
// roof. Each module here is add-on spaced armour hung over the source cheek (its Relikt course, corner and centre plates
// stay underneath, untouched): a flat top plate over a diamond plan whose nose runs from beside the mantlet across the
// cheek front and then sweeps back to an apex at the source cheek's outer corner, standing 15-30 cm ahead of the source
// faces; under-cut nose plates that meet the top in a sharp edge; a raked outer end plate and an inner plate facing the
// mantlet; framing brackets down to the source cheek and gussets back onto the roof; bolt rows and weld beads. The top
// plate lies 10 mm over the highest source part under its plan (a vertex scan), the nose plates' feet are buried in the
// source cheek; the plan stays outboard of the mantlet and the gun cover through the gun's whole elevation, inside the
// hull's width, in front of the roof armour courses and ahead of the smoke launchers' lanes, and the plate stays 6-8
// degrees under the gunner's sight window and the cupola's vision blocks.
type XZ=readonly[number,number];
// the plan (+x side, mirrored for the left): nose N beside the mantlet, knee K at the cheek front's corner, apex O at the
// source cheek's outer corner, then the back edge B over the source covers' rear edges
const MOD_N:XZ=[.46,2.38],MOD_K:XZ=[1.15,2.13],MOD_O:XZ=[1.92,1.08],MOD_BO:XZ=[1.88,.99],MOD_BM:XZ=[1.40,1.12],MOD_BI:XZ=[.50,1.62];
const MOD_XMAX=1.84,MOD_T=.035,MOD_FOOT=1.80,MOD_UNDERCUT=.26,MOD_FRONT_T=.030,MOD_SET=.022;

/** A vertical prism over a plan polygon (builder frame x, z) between two heights. */
function prism(plan:readonly XZ[],y0:number,y1:number):THREE.BufferGeometry {
  const ring=ccw(plan.map(([x,z])=>[x,-z] as const));
  return sectionSolid([{z:y0,ring},{z:y1,ring}]).rotateX(-Math.PI/2);
}

/** Unit normal (in plan) of an edge a->b pointing toward a point inside the module. */
function inwardTo(a:XZ,b:XZ,c:XZ):XZ {
  const dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz);
  let nx=dz/l,nz=-dx/l;
  if(nx*(c[0]-a[0])+nz*(c[1]-a[1])<0){nx=-nx;nz=-nz;}
  return [nx,nz];
}

/** Where two plan lines (point, direction) meet. */
function meet(p:XZ,d:XZ,q:XZ,e:XZ):XZ {
  const den=d[0]*e[1]-d[1]*e[0],t=((q[0]-p[0])*e[1]-(q[1]-p[1])*e[0])/den;
  return [p[0]+d[0]*t,p[1]+d[1]*t];
}

function cheekModule(P:TankBuilderPort,S:Stock,side:number,pushes?:readonly[number,number]):readonly[number,number] {
  const m=([x,z]:XZ):XZ=>[side*x,z];
  let N=m(MOD_N),K=m(MOD_K),O=m(MOD_O);
  let BO=m(MOD_BO);
  const BM=m(MOD_BM),BI=m(MOD_BI),C:XZ=m([1.15,1.55]);
  const inward=(a:XZ,b:XZ):XZ=>inwardTo(a,b,C);
  const highUnder=(plan:readonly XZ[]):number=>{
    const xs=plan.map((p)=>p[0]),zs=plan.map((p)=>p[1]);
    const inside=(x:number,z:number):boolean=>{
      let sign=0;
      for(let i=0;i<plan.length;i++){const a=plan[i],b=plan[(i+1)%plan.length],c=(b[0]-a[0])*(z-a[1])-(b[1]-a[1])*(x-a[0]);
        if(Math.abs(c)<1e-9)continue;const sg=Math.sign(c);if(sign===0)sign=sg;else if(sg!==sign)return false;}
      return true;
    };
    return S.highestAbove(Math.min(...xs),Math.max(...xs),Math.min(...zs),Math.max(...zs),inside,()=>0);
  };
  // the nose lines move ahead of every source vertex under them (rib ends, cover noses) by the under-cut face's own
  // set-back at that vertex's height plus 12 mm, so nothing of the source cheek shows through the nose plates
  const yt0=highUnder([N,K,O,BO,BM,BI])+.010+MOD_T;
  const push=(a:XZ,b:XZ):number=>{
    const [ix,iz]=inward(a,b),ex=b[0]-a[0],ez=b[1]-a[1],L=Math.hypot(ex,ez);
    let need=0;
    S.vertices(Math.min(a[0],b[0])-.4,Math.max(a[0],b[0])+.4,Math.min(a[1],b[1])-.4,Math.max(a[1],b[1])+.4,(x,y,z)=>{
      if(y<MOD_FOOT||y>yt0)return;
      const s=((x-a[0])*ex+(z-a[1])*ez)/L,d=-((x-a[0])*ix+(z-a[1])*iz);
      if(s<-.02||s>L+.02||d<-(MOD_UNDERCUT+.30))return;
      need=Math.max(need,d+(yt0-y)/(yt0-MOD_FOOT)*MOD_UNDERCUT+.012);
    });
    return need;
  };
  const own:readonly[number,number]=[push(N,K),push(K,O)];
  if(!pushes)return own;
  const [p1,p2]=pushes;
  {
    const [i1x,i1z]=inward(N,K),[i2x,i2z]=inward(K,O);
    const n1:XZ=[N[0]-i1x*p1,N[1]-i1z*p1],k1:XZ=[K[0]-i1x*p1,K[1]-i1z*p1];
    const k2:XZ=[K[0]-i2x*p2,K[1]-i2z*p2],o2:XZ=[O[0]-i2x*p2,O[1]-i2z*p2];
    K=meet(n1,[k1[0]-n1[0],k1[1]-n1[1]],k2,[o2[0]-k2[0],o2[1]-k2[1]]);N=n1;O=o2;
    // the apex stays within the source cheek's own width (the hull's), sliding back along its nose line
    if(Math.abs(O[0])>MOD_XMAX){const t=(side*MOD_XMAX-K[0])/(O[0]-K[0]);O=[K[0]+(O[0]-K[0])*t,K[1]+(O[1]-K[1])*t];}
    BO=[side*(MOD_XMAX-.04),O[1]-.09];
  }
  const high=Math.max(yt0-.010-MOD_T,highUnder([N,K,O,BO,BM,BI]));
  const yb=high+.010,yt=yb+MOD_T;
  // the top plate, its nose edges set back so the nose plates rise to the top surface in a sharp edge
  const setBack=(a:XZ,b:XZ):[XZ,XZ]=>{const [ix,iz]=inward(a,b);return [[a[0]+ix*MOD_SET,a[1]+iz*MOD_SET],[b[0]+ix*MOD_SET,b[1]+iz*MOD_SET]];};
  const [n1]=setBack(N,K),[k1,o1]=setBack(K,O),[,k0]=setBack(N,K);
  const kSet:XZ=[(k0[0]+k1[0])/2,(k0[1]+k1[1])/2];
  put(P,'turretPaintedDetail',prism([n1,kSet,o1,BO,BM,BI],yb,yt));
  // the under-cut nose plates: outer face from the nose edge at the top surface down and back to their buried foot
  const nosePlate=(a:XZ,b:XZ):void=>{
    const [ix,iz]=inward(a,b),u=MOD_UNDERCUT,dy=yt-MOD_FOOT,l=Math.hypot(u,dy),t=MOD_FRONT_T;
    const A=[a[0],yt,a[1]],B=[b[0],yt,b[1]],Bf=[b[0]+ix*u,MOD_FOOT,b[1]+iz*u],Af=[a[0]+ix*u,MOD_FOOT,a[1]+iz*u];
    // the inner face is the outer face moved along its normal (into the module, inward and up); its top edge slides down
    // that face to the top surface, so the plate meets the top flush in a sharp edge
    const nx=ix*dy/l*t,ny=u/l*t,nz=iz*dy/l*t,slide=u*t/dy,sx=ix*u/l*slide,sy=-dy/l*slide,sz=iz*u/l*slide;
    const innerTop=(p:number[]):number[]=>[p[0]+nx+sx,p[1]+ny+sy,p[2]+nz+sz];
    const innerFoot=(p:number[]):number[]=>[p[0]+nx,p[1]+ny,p[2]+nz];
    put(P,'turretPaintedDetail',orientedSlab(A,B,Bf,Af,innerTop(A),innerTop(B),innerFoot(Bf),innerFoot(Af)));
  };
  nosePlate(N,K);nosePlate(K,O);
  // the raked outer end plate from the apex back to the back corner, and the inner plate facing the mantlet
  {
    const [ix,iz]=inward(O,BO),u=.17,t=.028;
    const A=[O[0],yt,O[1]],B=[BO[0],yt,BO[1]],Bf=[BO[0]+ix*u,MOD_FOOT+.05,BO[1]+iz*u],Af=[O[0]+ix*u,MOD_FOOT+.05,O[1]+iz*u];
    const inner=(p:number[]):number[]=>[p[0]+ix*t,p[1]-.012,p[2]+iz*t];
    put(P,'turretPaintedDetail',orientedSlab(A,B,Bf,Af,inner(A),inner(B),inner(Bf),inner(Af)));
  }
  {
    const t=.028,ix=side;
    const A=[N[0],yt,N[1]],B=[BI[0],yt,BI[1]],Bf=[BI[0],MOD_FOOT+.04,BI[1]],Af=[N[0]+side*.004,MOD_FOOT+.04,N[1]-MOD_UNDERCUT*.6];
    const inner=(p:number[]):number[]=>[p[0]+ix*t,p[1],p[2]];
    put(P,'turretPaintedDetail',orientedSlab(A,B,Bf,Af,inner(A),inner(B),inner(Bf),inner(Af)));
  }
  // framing brackets: under the top plate behind each nose plate, a post down to the source cheek (seated by a ray) and a
  // strut from the nose plate's foot back to the post's foot
  for(const [a,b] of [[N,K],[K,O]] as const) for(const f of [.22,.55,.85]) {
    const [ix,iz]=inward(a,b),px=a[0]+(b[0]-a[0])*f+ix*.34,pz=a[1]+(b[1]-a[1])*f+iz*.34;
    const seat=S.hit([px,yb-.005,pz],[0,-1,0],.6);
    if(!seat)continue;
    const low=seat.y-.010;
    put(P,'turretDark',box(.030,yb-low+.006,.08),px,(yb+low)/2,pz,0,Math.atan2(b[0]-a[0],b[1]-a[1]),0);
    const fx=a[0]+(b[0]-a[0])*f+ix*(MOD_UNDERCUT+.01),fz=a[1]+(b[1]-a[1])*f+iz*(MOD_UNDERCUT+.01);
    bar(P,'turretDark',[fx-ix*.015,MOD_FOOT+.02,fz-iz*.015],[px,low+.03,pz],.022,.022);
  }
  // gusset blocks from the top plate's back edge down onto the roof, at three stations
  for(const f of [.12,.5,.88]) {
    const [a,b]=f<.5?[BI,BM]:[BM,BO],g=f<.5?f/.5:(f-.5)/.5;
    const [ix,iz]=inward(b,a),x=a[0]+(b[0]-a[0])*g+ix*.03,z=a[1]+(b[1]-a[1])*g+iz*.03;
    const roof=S.hit([x,yb,z],[0,-1,0],.6);
    if(!roof)continue;
    put(P,'turretDark',box(.05,yb-roof.y+.016,.10),x,(yb+roof.y)/2-.002,z,0,Math.atan2(ix,iz),0);
  }
  // bolt rows along both nose edges and the back edge (each row one part), and weld beads along the nose and the knee
  const boltRow=(pts:readonly XZ[]):void=>put(P,'turretDark',KIT.mergeAll(pts.map(([x,z])=>cylY(.013,.013,.012,8).translate(x,yt+.004,z))));
  for(const [a,b,n] of [[N,K,5],[K,O,6]] as const) {
    const [ix,iz]=inward(a,b);
    boltRow(Array.from({length:n},(_,i)=>{const f=(i+.5)/n;return [a[0]+(b[0]-a[0])*f+ix*.07,a[1]+(b[1]-a[1])*f+iz*.07] as const;}));
    bar(P,'turretDark',[a[0]+ix*.03,yt+.003,a[1]+iz*.03],[b[0]+ix*.03,yt+.003,b[1]+iz*.03],.010,.008);
  }
  for(const [a,b,n] of [[BI,BM,4],[BM,BO,3]] as const) {
    const [ix,iz]=inward(b,a);
    boltRow(Array.from({length:n},(_,i)=>{const f=(i+.5)/n;return [a[0]+(b[0]-a[0])*f+ix*.05,a[1]+(b[1]-a[1])*f+iz*.05] as const;}));
  }
  bar(P,'turretDark',[K[0]-side*.03,yt+.003,K[1]-.02],[BM[0],yt+.003,BM[1]+.03],.010,.008);
  return own;
}

// both modules take the larger of the two sides' nose pushes, so they stay mirror images
function cheekModules(P:TankBuilderPort,S:Stock):void {
  const l=cheekModule(P,S,-1),r=cheekModule(P,S,1),both:readonly[number,number]=[Math.max(l[0],r[0]),Math.max(l[1],r[1])];
  cheekModule(P,S,-1,both);cheekModule(P,S,1,both);
}

// The cheeks sweep back into the shoulders: a smooth cap over each folded side carrier behind its cheek corner, from under
// the cheek module's apex back to 0.4 m ahead of its smoke launchers' mouths (out of their line of fire). Each station's
// cap is a plate over the carrier's crossfall (downward rays across it, lifted 10 mm over the highest), its outer edge
// turned down over the carrier's rim and buried in it.
type CapRun=readonly[side:number,rear:number,front:number];
const CAP_RUNS:readonly CapRun[]=[[-1,.55,.84],[1,.42,.84]];

function carrierCap(P:TankBuilderPort,S:Stock,[side,rear,front]:CapRun):void {
  const zs:number[]=[];for(let z=rear;z<=front+1e-9;z+=.09)zs.push(Math.min(front,z));
  if(zs[zs.length-1]<front-1e-6)zs.push(front);
  const rows:SolidSection[]=[];
  for(const z of zs) {
    const outer=S.reach(side,z,1.86,2.16);
    if(outer===null)throw new Error(`t90sm_2013: no side carrier at z ${z}`);
    // across the carrier from its rim inward to where it meets the turret side (rays that find no carrier are skipped)
    const xo=Math.abs(outer);
    const samples=Array.from({length:9},(_,i)=>{const x=xo-.012-.28*i/8,h=S.hit([side*x,4,z],[0,-1,0]);return h&&h.y>1.85?[x,h.y] as const:null;})
      .filter((p):p is readonly[number,number]=>p!==null);
    if(samples.length<5)throw new Error(`t90sm_2013: the side carrier at z ${z} was not found`);
    const xi=samples[samples.length-1][0],yi=samples[samples.length-1][1],yo=samples[0][1],k=(yo-yi)/(xo-.012-xi);
    const lift=Math.max(...samples.map(([x,y])=>y-(yi+k*(x-xi))))+.010;
    const topAt=(x:number):number=>yi+k*(x-xi)+lift;
    const rim=S.under(side*(xo-.025),z)??(yo-.06);
    rows.push({z,ring:ccw([[side*xi,topAt(xi)-.030],[side*(xo+.012),Math.max(rim+.010,yo-.07)],[side*(xo+.012),topAt(xo)],[side*xi,topAt(xi)]])});
  }
  put(P,'turretPaintedDetail',sectionSolid(rows));
}

function carrierCaps(P:TankBuilderPort,S:Stock):void {for(const run of CAP_RUNS)carrierCap(P,S,run);}

// The old roof's raised centre crown plate: a flat welded plinth over the roof's front crown between the gunner's sight,
// the mantlet's sweep and the cupola, its floor following the roof and the source's roof armour courses under it (rays
// on a grid, buried 10 mm), its top flat 15 mm over the highest of them. It keeps 70 mm behind the cradle cover's reach
// at full elevation (z 1.26), clear of the gunner's sight window and the cupola's vision blocks, and ahead of the
// loader's hatch, which hinges at its rear.
const CROWN={x0:-.40,x1:.30,z0:.51,z1:1.17,chamfer:.12} as const;

function crownPlate(P:TankBuilderPort,S:Stock):void {
  const {x0,x1,z0,z1,chamfer}=CROWN;
  let high=0;
  for(let i=0;i<=8;i++)for(let j=0;j<=10;j++){const h=S.top(x0+(x1-x0)*i/8,z0+(z1-z0)*j/10,'roof crown');high=Math.max(high,h);}
  high=Math.max(high,S.highestAbove(x0,x1,z0,z1,(x,z)=>x>=x0&&x<=x1&&z>=z0&&z<=z1,()=>0));
  const topY=high+.015;
  const zs=[z0,(z0+z1-chamfer)/2,z1-chamfer,z1];
  const rows:SolidSection[]=zs.map((z)=>{
    // the front corners are chamfered in plan, the old crown plate's cut corners
    const cut=z>z1-chamfer?(z-(z1-chamfer)):0,l=x0+cut,r=x1-cut;
    const bl=S.top(l+.02,z,'roof')-.010,br=S.top(r-.02,z,'roof')-.010,bm=S.top((l+r)/2,z,'roof')-.010;
    return {z,ring:ccw([[l,bl],[(l+r)/2,bm],[r,br],[r,topY],[l,topY]])};
  });
  put(P,'turretPaintedDetail',sectionSolid(rows));
  // a weld bead round its foot along both sides, two lifting eyes and a bolted inspection cover on the top
  for(const x of [x0+.004,x1-.004])bar(P,'turretDark',[x,S.top(x,z0+.05,'roof')+.004,z0+.05],[x,S.top(x,z1-chamfer,'roof')+.004,z1-chamfer],.010,.010);
  for(const x of [x0+.10,x1-.10])put(P,'turretDark',KIT.torus(.026,.007,10,6),x,topY+.020,z0+.12);
  put(P,'turretDark',box(.26,.008,.20),(x0+x1)/2,topY+.003,(z0+z1)/2+.05);
  for(const dx of [-.11,.11])for(const dz of [-.08,.08])put(P,'turretDark',cylY(.012,.012,.010,8),(x0+x1)/2+dx,topY+.010,(z0+z1)/2+.05+dz);
}

// ---- Shoulder skins ---------------------------------------------------------------------------------------------------
// The old turret's broad low diamond cheek skins swept back from the cheeks into long shoulders, its flank cassettes
// pitched onto the side slope rather than standing as upright boxes. The source turret carries narrow upright cases and
// launcher shelves on its flanks; each skin here is one welded wedge raked over a run of them: its foot buried in the
// turret wall at 1.76 m, its outer face rising at about 30 degrees to just under the cases' top edge (which stays visible
// as a lip), its head buried in the cases. Both ends taper in, so the shoulder sweeps out of the carrier ahead of it and
// back into the stowage cage behind it. The skins stay under the smoke launchers and out of their line of fire.
const SKIN_FOOT=1.76,SKIN_RAKE=.23,SKIN_LIP=.028;
type SkinRun=readonly[side:number,rear:number,front:number,band:number];
const SKIN_RUNS:readonly SkinRun[]=[
  [-1,-1.45,.15,2.10],   // the left case, launcher shelf and forward case
  [1,-1.28,-.42,2.12],   // the right case
];

function shoulderSkin(P:TankBuilderPort,S:Stock,[side,rear,front,band]:SkinRun):void {
  const zs:number[]=[];for(let z=rear;z<=front+1e-9;z+=.05)zs.push(+z.toFixed(4));
  const reach:number[]=[],top:number[]=[],wall:number[]=[];
  for(const z of zs) {
    const r=S.reach(side,z,1.84,band);
    if(r===null)throw new Error(`t90sm_2013: no flank case at z ${z}`);
    reach.push(r);top.push(Math.min(band+.05,S.top(r-side*.03,z,'flank case')));
    wall.push(S.wall(side,SKIN_FOOT,z,'turret wall'));
  }
  // straight welded edges: the head runs at or outside every measured case face, under the lowest measured case top,
  // and the foot at or inside every measured wall station, so both stay buried along the whole run
  const reachFit=fit(zs,reach),wallFit=fit(zs,wall);
  const out=Math.max(...zs.map((z,i)=>side*(reach[i]-reachFit(z))));
  const inn=Math.max(...zs.map((z,i)=>side*(wallFit(z)-wall[i])));
  const head=Math.min(...top)-SKIN_LIP;
  const rows:SolidSection[]=[];
  const stations=[rear,rear+.16,front-.30,front];
  stations.forEach((z,i)=>{
    const rake=SKIN_RAKE*(i===0?.55:i===3?.12:1);
    const edge=reachFit(z)+side*out,foot=wallFit(z)-side*(inn+.012);
    rows.push({z,ring:ccw([[foot,SKIN_FOOT],[edge+side*rake,SKIN_FOOT],[edge-side*.006,head],[edge-side*.07,head-.03]])});
  });
  put(P,'turretPaintedDetail',sectionSolid(rows));
  // a stiffening rib along the face and four bolts on it: the appliqué plate's own furniture
  const faceAt=(z:number,t:number):Point=>{
    const edge=reachFit(z)+side*out,rake=SKIN_RAKE;
    return [edge+side*rake*(1-t)-side*.006*t+side*.008,SKIN_FOOT+(head-SKIN_FOOT)*t,z];
  };
  bar(P,'turretPaintedDetail',faceAt(rear+.20,.42),faceAt(front-.34,.42),.018,.022);
  const bolts=Math.max(2,Math.round((front-rear-.66)/.36)+1);
  for(let i=0;i<bolts;i++) {
    const z=rear+.26+(front-.40-(rear+.26))*i/(bolts-1),[x,y]=faceAt(z,.74);
    put(P,'turretDark',cylX(.016,.022,8),x,y,z,0,0,side*.48);
  }
  // the foot's weld bead along the wall
  const footAt=(z:number):Point=>[wallFit(z)-side*(inn+.004),SKIN_FOOT+.004,z];
  bar(P,'turretDark',footAt(rear+.02),footAt(front-.02),.012,.012);
}

function shoulderSkins(P:TankBuilderPort,S:Stock):void {for(const run of SKIN_RUNS)shoulderSkin(P,S,run);}

// The old turret's long flat shoulder bins with their dark lids, here on the flank cases and launcher shelf behind each
// shoulder skin: one long low bin per side, its plan parallel to the cases' outer line, its floor following their tops
// (rays at both long edges, buried 10 mm), its lid flat at 2.33 m so the shoulder reads as one long flat line from the
// smoke launchers back to the cage. Each stops short of its launchers' bases and stays inside the roof station's sweep
// height, the cupola's sight line and the laser-warning heads' clearance.
type BinRun=readonly[side:number,rear:number,front:number];
const BIN_RUNS:readonly BinRun[]=[[-1,-1.40,-.50],[1,-1.17,-.50]];
const BIN_W=.27,BIN_LID=2.315;

function shoulderBin(P:TankBuilderPort,S:Stock,[side,rear,front]:BinRun):void {
  const zs=[rear,(rear+front)/2,front],reach=zs.map((z)=>S.reach(side,z,1.84,2.20));
  if(reach.some((r)=>r===null))throw new Error('t90sm_2013: no flank case under the shoulder bin');
  const outerFit=fit(zs,reach as number[]);
  const outer=(z:number):number=>outerFit(z)-side*.022,inner=(z:number):number=>outer(z)-side*BIN_W;
  const sections:SolidSection[]=[];
  for(const z of zs) {
    const yo=S.top(outer(z)-side*.012,z,'flank case')-.010,yi=S.top(inner(z)+side*.012,z,'flank shelf')-.010;
    sections.push({z,ring:ccw([[inner(z),yi],[outer(z),yo],[outer(z),BIN_LID],[inner(z),BIN_LID]])});
  }
  put(P,'turretPaintedDetail',sectionSolid(sections));
  // the dark lid over a lip all round, its hinge along the inner edge and two hasps on the outer face
  const lid:SolidSection[]=[rear-.008,front+.008].map((z)=>({z,ring:ccw([[inner(z)-side*.008,BIN_LID-.004],[outer(z)+side*.008,BIN_LID-.004],
    [outer(z)+side*.008,BIN_LID+.014],[inner(z)-side*.008,BIN_LID+.014]])}));
  put(P,'turretDark',sectionSolid(lid));
  bar(P,'turretDark',[inner(rear+.06)-side*.010,BIN_LID+.004,rear+.06],[inner(front-.06)-side*.010,BIN_LID+.004,front-.06],.014,.014);
  const ry=Math.atan2(outerFit(front)-outerFit(rear),front-rear);
  for(const t of [.25,.75]) {
    const z=rear+(front-rear)*t;
    put(P,'turretDark',box(.012,.050,.030),outer(z)+side*.006,BIN_LID-.035,z,0,ry,0);
  }
}

function shoulderBins(P:TankBuilderPort,S:Stock):void {for(const run of BIN_RUNS)shoulderBin(P,S,run);}

// ---- Bustle stowage cage ----------------------------------------------------------------------------------------------
// The old turret's long bustle was wrapped in a slat stowage cage with its systems boxes inside. Here a welded cage of
// on-edge flat bars wraps the source bustle's sides and rear from the shoulder skins back past the source basket, which
// it encloses: nine slat levels from just over its floor to a capping rail, posts about every 0.35 m, a floored tray
// (closed in plan, no see-through cell) and front returns into the stock. Its floor stays at 1.73 m and over (the hull's
// highest part under the bustle's sweep is 1.63 m) and its top at 2.27 m, under the roof station's sweep.
const CAGE_FLOOR=[1.728,1.750] as const,CAGE_TOP=2.255;
const CAGE_LEVELS=Array.from({length:9},(_,i)=>1.778+i*.0595);
const CAGE_REAR=-2.98,CAGE_FRONT:Readonly<Record<number,number>>={[-1]:-1.50,[1]:-1.36},CAGE_GAP=.20;
const BAR_W=.012,BAR_H=.030,POST_W=.040,POST_T=.014;

/** The cage's half-width on a side: the gap clear of the outermost stock over its run and height band. */
function cageX(S:Stock,side:number):number {
  let reach=0;
  for(let z=CAGE_REAR;z<=CAGE_FRONT[side]+1e-9;z+=.05)reach=Math.max(reach,Math.abs(S.reach(side,z,CAGE_FLOOR[0],CAGE_TOP+.02)??0));
  return reach+CAGE_GAP;
}

function bustleCage(P:TankBuilderPort,S:Stock):void {
  const X={[-1]:cageX(S,-1),[1]:cageX(S,1)} as Record<number,number>;
  const back=CAGE_REAR,floorMid=(CAGE_FLOOR[0]+CAGE_FLOOR[1])/2;
  // the floor: a tray across the back and down both sides; its inner edge is buried in the stock met at floor height
  // where the bustle boxes reach that low, and otherwise closes on a kick plate hung from the rear box's bottom
  const rearBox=S.hit([0,1.90,-3.5],[0,0,1]);
  const rearBottom=S.under(.5,-2.55);
  if(!rearBox||rearBottom===null)throw new Error('t90sm_2013: no bustle rear box for the cage');
  put(P,'turretPaintedDetail',box(X[-1]+X[1]+.02,CAGE_FLOOR[1]-CAGE_FLOOR[0],rearBox.z-back+.012),(X[1]-X[-1])/2,floorMid,(back+rearBox.z)/2);
  for(const s of [-1,1]) {
    const front=CAGE_FRONT[s],rows:SolidSection[]=[];
    const n=Math.round((front-rearBox.z)/.10);
    const faceAt=(z:number):number=>{const h=S.hit([s*3,floorMid,z],[-s,0,0]);return h&&Math.abs(h.x)>.5?Math.abs(h.x)-.012:.80;};
    for(let i=0;i<=n;i++) {
      const z=rearBox.z+(front-rearBox.z)*i/n;
      const xi=Math.min(faceAt(Math.max(rearBox.z,z-.05)),faceAt(z),faceAt(Math.min(front,z+.05))),xo=X[s]+.010;
      rows.push({z,ring:ccw([[s*xi,CAGE_FLOOR[0]],[s*xo,CAGE_FLOOR[0]],[s*xo,CAGE_FLOOR[1]],[s*xi,CAGE_FLOOR[1]]])});
    }
    put(P,'turretPaintedDetail',sectionSolid(rows));
    // the kick plate from the floor up into the rear box's bottom, along its side where no box reaches the floor
    const kz0=rearBox.z,kz1=Math.min(front,-2.36);
    put(P,'turretPaintedDetail',box(.012,rearBottom+.008-CAGE_FLOOR[1]+.004,kz1-kz0),s*.79,(CAGE_FLOOR[1]-.004+rearBottom+.008)/2,(kz0+kz1)/2);
  }
  // slats: the back wall, both sides and each side's front return into the stock, each wall's slats one welded part
  const back9:THREE.BufferGeometry[]=[],sides:Record<number,THREE.BufferGeometry[]>={[-1]:[],[1]:[]},returns:Record<number,THREE.BufferGeometry[]>={[-1]:[],[1]:[]};
  for(const y of CAGE_LEVELS) {
    back9.push(barGeometry([-X[-1],y,back],[X[1],y,back],BAR_W,BAR_H));
    for(const s of [-1,1]) {
      const front=CAGE_FRONT[s];
      sides[s].push(barGeometry([s*X[s],y,back],[s*X[s],y,front],BAR_W,BAR_H));
      // a level that clears the stock ahead ends at the front post
      const h=S.hit([s*X[s],y,front],[-s,0,0],1.0);
      if(h)returns[s].push(barGeometry([s*(X[s]+BAR_W/2),y,front],[s*(Math.abs(h.x)-.010),y,front],BAR_W,BAR_H));
    }
  }
  put(P,'turretOpenLattice',KIT.mergeAll(back9));
  for(const s of [-1,1]){put(P,'turretOpenLattice',KIT.mergeAll(sides[s]));if(returns[s].length)put(P,'turretOpenLattice',KIT.mergeAll(returns[s]));}
  // the capping rail round the top, the floor's turned-down lip, and the posts under caps
  const cap=(a:Point,b:Point)=>bar(P,'turretOpenLattice',a,b,.030,.022);
  cap([-X[-1],CAGE_TOP,back],[X[1],CAGE_TOP,back]);
  const lip=(a:Point,b:Point)=>bar(P,'turretOpenLattice',a,b,.010,.040);
  lip([-X[-1],CAGE_FLOOR[0]+.012,back-.004],[X[1],CAGE_FLOOR[0]+.012,back-.004]);
  const postLow=CAGE_FLOOR[1]-.008,postHigh=CAGE_TOP+.006;
  const post=(x:number,z:number,ry:number):void=>{
    put(P,'turretOpenLattice',box(POST_T,postHigh-postLow,POST_W),x,(postLow+postHigh)/2,z,0,ry,0);
    put(P,'turretOpenLatticeDark',box(POST_T+.012,.014,POST_W+.012),x,postHigh+.004,z,0,ry,0);
  };
  for(const s of [-1,1]) {
    const front=CAGE_FRONT[s];
    cap([s*X[s],CAGE_TOP,back],[s*X[s],CAGE_TOP,front]);
    lip([s*(X[s]+.004),CAGE_FLOOR[0]+.012,back],[s*(X[s]+.004),CAGE_FLOOR[0]+.012,front]);
    const n=Math.max(2,Math.round((front-back)/.36)+1);
    for(let i=0;i<n;i++)post(s*X[s],back+(front-back)*i/(n-1),0);
  }
  const nb=Math.max(2,Math.round((X[-1]+X[1])/.40)+1);
  for(let i=1;i<nb-1;i++)post(-X[-1]+(X[1]+X[-1])*i/(nb-1),back,Math.PI/2);
}

// A systems box on the left cage floor under the flank equipment case (the old bustle's cell boxes): between the case's
// two struts, buried in the bustle box beside it and the case over it.
function cageSystemsBox(P:TankBuilderPort,S:Stock):void {
  const z0=-2.16,z1=-1.81,zc=(z0+z1)/2,low=CAGE_FLOOR[1]-.005;
  const wall=Math.abs(S.wall(-1,1.80,zc,'bustle box'));
  const over=S.under(-.80,zc);
  if(over===null||over>1.95)throw new Error('t90sm_2013: no equipment case over the systems box');
  const inner=wall-.010,outer=1.02,high=over+.006,x=-(inner+outer)/2,w=outer-inner;
  put(P,'turretPaintedDetail',box(w,high-low,z1-z0),x,(low+high)/2,zc);
  put(P,'turretDark',box(.006,(high-low)*.62,(z1-z0)*.74),-outer-.002,(low+high)/2-.004,zc);           // inset service door
  for(const dz of [-.11,.11])put(P,'turretDark',box(.014,.034,.022),-outer-.006,(low+high)/2+.02,zc+dz);  // its latches
  put(P,'turretDark',cylZ(.010,(z1-z0)*.50,8),-outer-.010,low+.026,zc);                                   // hinge pin
}

// Hot-climate water: 20-litre cans standing in the cage's right rear corner behind the right bustle box, clear of
// the source basket's side bars, held by a strap bar across their handles.
function waterCans(P:TankBuilderPort,S:Stock):void {
  const x=1.205,low=CAGE_FLOOR[1]-.004,h=.47,w=.165,d=.34;
  // the right bustle box's rear face, under the source basket's lowest bar
  const face=S.hit([.95,1.90,-3.5],[0,0,1]);
  if(!face)throw new Error('t90sm_2013: no right bustle box behind the water cans');
  const zEnd=face.z-.015;
  let cans=0;
  for(let i=0;i<4;i++) {
    const z=CAGE_REAR+.035+w/2+i*(w+.012);
    if(z+w/2>zEnd)break;
    cans++;
    put(P,'turretFittingPaint',box(d,h,w),x,low+h/2,z);
    put(P,'turretDark',box(d*.42,.034,.03),x+.02,low+h+.017,z);                                          // handle
    put(P,'turretDark',box(.012,h*.62,w*.84),x+d/2+.003,low+h*.46,z);                                     // pressed panel
  }
  bar(P,'turretDark',[x,low+h-.04,CAGE_REAR+.03],[x,low+h-.04,CAGE_REAR+.035+cans*(w+.012)],.024,.012);
}

// ---- Roof line --------------------------------------------------------------------------------------------------------
// The old roof laid its furniture in one long line down the turret: here a crew bin on the left roof shoulder behind the
// mast, the backup sight's pedestal at the bustle front and the OPVT pipe stowed on the bustle roof, all clear of the roof
// station's traverse (radius 0.79 m about x 0.58, z -0.97 above 2.50 m; 0.43 m above 2.25 m).
function roofBin(P:TankBuilderPort,S:Stock):void {
  const x0=-.70,x1=-.38,z0=-1.40,z1=-1.10,lid=2.385;
  // the bin's floor follows the roof's crossfall under both its long edges, buried 10 mm
  const sections:SolidSection[]=[];
  for(const z of [z0,(z0+z1)/2,z1]) {
    const yo=S.top(x0+.01,z,'roof shoulder')-.010,yi=S.top(x1-.01,z,'roof')-.010;
    sections.push({z,ring:ccw([[x0,yo],[x1,yi],[x1,lid],[x0,lid]])});
  }
  put(P,'turretPaintedDetail',sectionSolid(sections));
  const xc=(x0+x1)/2,zc=(z0+z1)/2;
  put(P,'turretPaintedDetail',box(x1-x0+.016,.018,z1-z0+.016),xc,lid+.007,zc);                         // lid
  put(P,'turretDark',box(x1-x0+.018,.006,.010),xc,lid-.004,z1+.001);                                   // lid seam
  for(const dx of [-.10,.10]) {
    put(P,'turretDark',box(.026,.044,.012),xc+dx,lid-.020,z1+.010);                                    // hasps
    put(P,'turretDark',box(.020,.010,z1-z0+.03),xc+dx,lid+.019,zc);                                     // tie-down straps
  }
  put(P,'turretDark',cylX(.008,.24,8),xc,lid+.006,z0-.010);                                            // lid hinge
}

function backupSight(P:TankBuilderPort,S:Stock):void {
  // the backup sight's armoured pedestal on the bustle roof, its window looking forward over the crown between the
  // station's base and the mast; its hood stays under 2.42 m inside the station's sweep
  const x=.06,z=-1.63,base=S.top(x,z,'bustle roof')-.010,h=.165,w=.17,d=.17;
  put(P,'turretPaintedDetail',box(w,h,d),x,base+h/2,z);
  put(P,'turretPaintedDetail',KIT.xform(box(w+.03,.016,d*.62),0,0,0,-.16,0,0),x,base+h+.010,z+d*.22);   // sun hood
  put(P,'turretDark',box(w*.78,.072,.010),x,base+h-.052,z+d/2+.003);                                   // window frame
  put(P,'turretGlass',box(w*.62,.050,.006),x,base+h-.052,z+d/2+.008);
  put(P,'turretDark',box(w+.03,.012,d+.03),x,base+.006,z);                                             // bolted foot flange
}

function opvtPipe(P:TankBuilderPort,S:Stock):void {
  // the OPVT snorkel section stowed lengthwise on the bustle roof right of the air conditioner, on two saddles and strapped
  const x=.43,z0=-2.30,z1=-1.64,r=.056,zc=(z0+z1)/2,roof=Math.max(S.top(x,z0+.08,'bustle roof'),S.top(x,z1-.08,'bustle roof'));
  const y=roof+.018+r;
  put(P,'turretDetail',cylZ(r,z1-z0,16),x,y,zc);
  for(const z of [z0+.012,z1-.012])put(P,'turretDark',cylZ(r+.008,.024,16),x,y,z);                      // flanged ends
  for(const z of [z0+.16,z1-.16]) {
    put(P,'turretPaintedDetail',box(.15,.034,.06),x,roof+.012,z);                                       // saddles
    put(P,'turretDark',cylZ(r+.005,.028,16),x,y,z);                                                     // strap bands
    for(const s of [-1,1])put(P,'turretDark',box(.010,.050,.026),x+s*(r+.003),roof+.030,z);             // strap tails
  }
}

// ---- Hot-climate kit ---------------------------------------------------------------------------------------------------
// The export tank's sun gear beside the source-kit air conditioner and the gunner's sight hood: a pale canvas sun tarp
// rolled on the cage's back rail and strapped to it.
function sunTarp(P:TankBuilderPort,S:Stock):void {
  const r=.085,len=1.62,z=CAGE_REAR+.02,rail=S.top(.30,z+.04,'basket rear rail');
  const y=Math.max(CAGE_TOP+.011,rail)+r-.012;
  const {body,ends}=fabricRollParts(len,r,[-.52,.52]);
  put(P,'turretCanvasPale',body,0,y,z);
  for(const e of ends)put(P,'turretCanvasPale',e,0,y,z);
  for(const x of [-.52,.52]) {
    put(P,'turretDark',KIT.torus(r+.004,.007,14,6).rotateZ(Math.PI/2),x,y,z);                       // straps round the roll
    put(P,'turretDark',box(.026,.060,.012),x,CAGE_TOP-.020,z-.010);                                 // and down onto the rail
  }
}

export function addT90MarkSM2013Turret(P:TankBuilderPort):void {
  const S=new Stock(P);
  try {
    carrierCaps(P,S);cheekModules(P,S);crownPlate(P,S);shoulderSkins(P,S);shoulderBins(P,S);
    bustleCage(P,S);
    cageSystemsBox(P,S);
    waterCans(P,S);
    roofBin(P,S);
    backupSight(P,S);
    opvtPipe(P,S);
    sunTarp(P,S);
  } finally {S.dispose();}
}
