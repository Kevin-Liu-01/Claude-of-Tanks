// Original turned/ruled solids for the supplied file's non-weapon cupola.
// Source Objects9–11/19 supply scalar sections only; no source buffers ship.
import * as THREE from 'three';
import {KIT} from './kit.ts';
import {sectionSolid, type SolidSection} from './sectionSolid.ts';
import {strvSourceTurret as add} from './strv122XSuppliedFrame.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
const {box}=KIT;

function part(P:TankBuilderPort,name:string,g:THREE.BufferGeometry,
  bucket='turretDetail'):void {
  g.userData.strvSuppliedCupolaPiece=name;add(P,bucket,g);
}

function turned(rows:readonly (readonly [number,number])[],x:number,z:number,
  xScale=1,zScale=1,start=0,sweep=Math.PI*2):THREE.BufferGeometry {
  return new THREE.LatheGeometry(rows.map(([r,y])=>new THREE.Vector2(r,y)),64,start,sweep)
    .scale(xScale,1,zScale).translate(x,0,z);
}

function outerBand(P:TankBuilderPort):void {
  // The real broad, flattened rim is not a thin round handrail. Its inner
  // opening and air below the band remain open; no cylinder fills the gap.
  const g=turned([[.73,2.558],[.985,2.558],[1,2.567],[1,2.578],
    [.98,2.586],[.77,2.590],[.73,2.578],[.73,2.558]],.654,-.408,.454,.434);
  const a=g.attributes.position;
  for(let i=0;i<a.count;i++)a.setY(i,a.getY(i)-.012*(a.getX(i)-.654)
    +.018*Math.max(0,-a.getZ(i)-.40)-.0015);
  g.computeVertexNormals();part(P,'OuterBand',g);
  // Nine separate thin radial feet are present in independent Y2.52 source
  // sections. Keep the wide intervals between them genuinely empty.
  for(const [x,z,w,d,yaw]of [[1.0525,-.3918,.0777,.0291,0],
    [.9922,-.6017,.078,.029,.58],[.9936,-.1796,.078,.029,-.58],
    [.7709,-.7734,.030,.074,0],[.5346,-.7629,.034,.081,0],
    [.3130,-.5974,.073,.029,-.55],[.2566,-.3655,.0766,.0328,0],
    [.3252,-.1565,.073,.029,.55],[.5325,-.0078,.031,.0755,0]]){
    const bottom=z>-.25?2.457:2.481;
    part(P,'BandFoot',box(w,2.575-bottom,d).rotateY(yaw)
      .translate(x,(2.575+bottom)/2,z));
  }
}

function innerHatch(P:TankBuilderPort):void {
  part(P,'CupolaBase',turned([[0,2.460],[.438,2.460],[.444,2.484],
    [.420,2.492],[0,2.492],[0,2.460]],.654,-.407,1,.97));
  // The lower receiver is also an annulus, not a filled cylinder. Its front
  // centre stays below the open break in the raised hatch.
  part(P,'HatchReceiver',turned([[.73,2.479],[1,2.479],[1,2.530],
    [.96,2.555],[.75,2.569],[.72,2.572],[.70,2.549],[.73,2.479]],.633,-.407,.320,.315));
  part(P,'HatchFloor',turned([[0,2.481],[.252,2.481],[.250,2.503],
    [.194,2.539],[0,2.539],[0,2.481]],.646,-.410,1,.76));
  // Forward break is visible in the source. A full raised ring would fill it.
  const start=Math.PI/4,sweep=Math.PI*1.5;
  const rim=turned([[.173,2.538],[.230,2.538],[.215,2.597],
    [.179,2.602],[.173,2.589],[.173,2.538]],.646,-.410,1,.82,start,sweep);
  part(P,'HatchRim',rim);
  // Close the two radial ends of the partial rim with small original ruled
  // faces, rather than leaving an open-backed lathe shell.
  for(const a of [start,start+sweep]){
    const shape=new THREE.Shape([[.173,2.538],[.230,2.538],[.215,2.597],
      [.179,2.602],[.173,2.589]].map(([r,y])=>new THREE.Vector2(r,y)));
    const cap=new THREE.ExtrudeGeometry(shape,{depth:.001,bevelEnabled:false});
    cap.translate(0,0,-.0005).rotateY(a-Math.PI/2).scale(1,1,.82).translate(.646,0,-.410);
    part(P,'HatchRimEnd',cap);
  }
  for(const x of [.496,.792])
    part(P,'HatchBridgeFoot',box(.039,.074,.041).translate(x,2.548,-.392));
  part(P,'HatchBridge',box(.335,.036,.041).translate(.644,2.587,-.388));
}

function headStem():THREE.BufferGeometry {
  // Offset lower receiver, gently leaning neck, and concentric upper cap.
  // These are independent elliptical sections, not sampled source topology.
  const rows=[
    [2.456,.098,.087,-.041],[2.523,.100,.090,-.045],
    [2.540,.102,.099,-.035],[2.561,.102,.099,-.035],
    [2.584,.105,.104,-.084],[2.610,.097,.103,-.084],
    [2.650,.094,.092,-.055],[2.670,.089,.106,-.021],
    [2.690,.089,.0886,-.0043],[2.697,.089,.088,-.004],[2.703,.100,.100,-.0035],
    [2.76845,.1005,.1005,-.0035],
  ];
  const sections:SolidSection[]=rows.map(([y,rx,rz,z])=>({z:y,
    ring:Array.from({length:64},(_,i)=>{
      const a=-i*Math.PI/32;return [.8615+rx*Math.cos(a),-(z+rz*Math.sin(a))] as const;
    }),
  }));
  return sectionSolid(sections).rotateX(-Math.PI/2);
}

function headReceiver(P:TankBuilderPort):void {
  part(P,'HeadStem',headStem());
  // Measured separate flanking stock, rear tie, and narrow raised ears. The
  // centre-front setback and above-stock intervals are deliberately unfilled.
  for(const [x,w]of [[.738,.061],[.989,.071]]){
    part(P,'ReceiverWing',box(w,.055,.194).translate(x,2.5835,-.053));
    part(P,'ReceiverEar',box(w*.55,.060,.031).translate(x,2.638,.022));
  }
  part(P,'ReceiverRearTie',box(.267,.054,.043).translate(.866,2.583,-.1815));
  // These are short receiving feet, with an11mm concealed extension to the
  // retained planar roof. The source's softly fused foot/root is not copied.
  for(const [x,z]of [[.738,-.105],[.989,-.105]])
    part(P,'ReceiverFoot',box(.045,.097,.058).translate(x,2.5115,z));
}

function frontSight(P:TankBuilderPort):void {
  // Separate190mm hood. Its real front face is27mm behind the forward jambs;
  // the large existing periscope hood farther forward remains untouched.
  part(P,'FrontSightBase',sectionSolid([
    {z:.166,ring:[[-.877,2.448],[-.633,2.448],[-.668,2.500],[-.850,2.500]]},
    {z:.347,ring:[[-.877,2.441],[-.633,2.441],[-.668,2.508],[-.850,2.508]]},
    {z:.365,ring:[[-.860,2.440],[-.649,2.440],[-.668,2.508],[-.850,2.508]]},
  ]));
  const x=-.757;
  part(P,'FrontSightBack',box(.178,.090,.066).translate(x,2.550,.3065));
  part(P,'FrontSightGlass',box(.111,.053,.002).translate(-.762,2.551,.3395), 'turretGlass');
  for(const [outer,inner,foreInner]of [[-.852,-.817,-.826],[-.662,-.707,-.676]]){
    const ring=(a:number,b:number)=>[[Math.min(a,b),2.503],[Math.max(a,b),2.503],
      [Math.max(a,b),2.595],[Math.min(a,b),2.595]] as const;
    part(P,'FrontSightJamb',sectionSolid([{z:.265,ring:ring(outer,inner)},
      {z:.340,ring:ring(outer,inner)},{z:.367,ring:ring(outer,foreInner)}]));
  }
  part(P,'FrontSightRoof',sectionSolid([
    {z:.259,ring:[[-.848,2.576],[-.666,2.576],[-.680,2.588],[-.834,2.588]]},
    {z:.299,ring:[[-.851,2.584],[-.663,2.584],[-.680,2.603],[-.834,2.603]]},
    {z:.335,ring:[[-.844,2.577],[-.670,2.577],[-.684,2.590],[-.830,2.590]]},
  ]));
}

export function addStrv122XSuppliedCupola(P:TankBuilderPort):void {
  outerBand(P);innerHatch(P);headReceiver(P);frontSight(P);
}
