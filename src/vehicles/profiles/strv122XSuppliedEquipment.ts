// Independent source-frame fittings. Recesses, cupola gaps and the aft cage
// are modeled with individual supported walls/bars, not opaque proxy boxes.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid } from './sectionSolid.ts';
import { addStrv122XSuppliedRoofWeapon } from './strv122XSuppliedRoofWeapon.ts';
import { addStrv122XSuppliedCupola } from './strv122XSuppliedCupola.ts';
import { strvSourceTurret as add,
  type StrvPoint } from './strv122XSuppliedFrame.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
const {box,cylY,cylZ,torus} = KIT;

function bar(a:StrvPoint,b:StrvPoint,r:number):THREE.BufferGeometry {
  const from=new THREE.Vector3(...a),to=new THREE.Vector3(...b);
  return cylY(r,r,from.distanceTo(to),10).applyQuaternion(new THREE.Quaternion()
    .setFromUnitVectors(new THREE.Vector3(0,1,0),to.clone().sub(from).normalize()))
    .translate(...from.add(to).multiplyScalar(.5).toArray());
}

function cupola(P:TankBuilderPort,x:number,z:number,r:number):void {
  // Source has a raised outer hoop and visible air below it, not a solid
  // cylinder extending to the hoop. Individual feet land on the roof.
  add(P,'turretDetail',cylY(r-.129,r-.110,.034,48),x,2.507,z);
  add(P,'turretDetail',torus(r,.017,48,10),x,2.577,z);
  add(P,'turretDetail',cylY(r-.169,r-.157,.033,40),x,2.555,z);
  for(let i=0;i<8;i++){
    const a=i*Math.PI/4,px=x+Math.sin(a)*r,pz=z+Math.cos(a)*r;
    add(P,'turretDetail',box(.025,.097,.024),px,2.531,pz,0,a);
  }
  for(const a of [0,Math.PI])add(P,'turretDetail',box(.062,.045,.063),
    x+Math.sin(a)*(r-.11),2.590,z+Math.cos(a)*(r-.11));
}

function sight(P:TankBuilderPort,x:number,y:number,z:number,w:number,h:number,d:number):void {
  // The rear wall is recessed inside a true four-sided armor hood.
  const wall=Math.min(.018,d*.15),back=Math.min(.022,d*.18);
  add(P,'turretDetail',box(w,h,back),x,y,z-d*.5+back/2);
  add(P,'turretDark',box(w-wall*2,h-wall*2,.002),x,y,z-d*.5+back+.001);
  add(P,'turretGlass',box(w-wall*3,h-wall*3,.002),x,y,z-d*.5+back+.003);
  for(const side of [-1,1]){
    add(P,'turretDetail',box(wall,h,d),x+side*(w-wall)*.5,y,z);
    add(P,'turretDetail',box(w,wall,d),x,y+side*(h-wall)*.5,z);
  }
}

function forwardLid(P:TankBuilderPort):void {
  // The supplied file has a low round lid and a50mm post, not a broad tall
  // optical box. The published vehicle's fixtures are not substituted here.
  add(P,'turretDetail',new THREE.LatheGeometry([
    [0,2.453],[.160,2.453],[.169,2.481],[.161,2.5085],[0,2.5085],[0,2.453],
  ].map(([r,y])=>new THREE.Vector2(r,y)),40).scale(1,1,1.03),.014,0,.263);
  add(P,'turretDetail',cylY(.025,.025,.141,32),-.1252,2.6055,.3155);
  add(P,'turretDetail',cylY(.025,.047,.044,32),-.1252,2.528,.3155);
  add(P,'turretDetail',box(.052,.043,.061),.015,2.529,.245);
}

function forwardHood(P:TankBuilderPort):void {
  // Source wide low carrier, separate front visor/jambs and two raised loops.
  // The old290mm-wide210mm-high solid missed the wide foot and filled its air.
  add(P,'turretDetail',sectionSolid([
    {z:.735,ring:[[-1.055,2.396],[-.580,2.396],[-.600,2.422],[-1.035,2.422]]},
    {z:.806,ring:[[-1.055,2.389],[-.580,2.389],[-.595,2.527],[-1.040,2.527]]},
    {z:.998,ring:[[-1.055,2.385],[-.580,2.385],[-.595,2.531],[-1.040,2.531]]},
  ]));
  add(P,'turretDark',new THREE.BoxGeometry(.424,.068,.018),-.8175,2.461,1.005);
  add(P,'turretGlass',new THREE.BoxGeometry(.399,.050,.002),-.8175,2.461,1.014);
  add(P,'turretDetail',box(.470,.034,.083),-.8175,2.517,1.0135);
  for(const x of [-1.043,-.592])
    add(P,'turretDetail',box(.026,.147,.092),x,2.4585,1.021);
  for(const [x,rx,ry]of [[-.854,.060,.037],[-.701,.043,.019]]){
    const points=Array.from({length:17},(_,i)=>new THREE.Vector3(
      x+rx*Math.cos(i*Math.PI/16),2.535+ry*Math.sin(i*Math.PI/16),.940));
    add(P,'turretDetail',new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),24,.012,8,false));
  }
  add(P,'turretDetail',box(.045,.017,.042),-.778,2.5365,.927);
}

function roof(P:TankBuilderPort):void {
  cupola(P,-.60,-.40,.414);addStrv122XSuppliedCupola(P);
  // Source's aft-left round optical head, supported above its small carrier.
  add(P,'turretDetail',box(.249,.103,.248),-.613,2.539,-1.30);
  add(P,'turretDetail',cylY(.083,.095,.158,32),-.613,2.663,-1.30);
  add(P,'turretDetail',cylY(.117,.105,.11,32),-.613,2.769,-1.30);
  sight(P,-.613,2.768,-1.185,.130,.065,.018);
  forwardHood(P);forwardLid(P);
  add(P,'turretDetail',box(.117,.124,.101),1.055,2.438,1.03);
  sight(P,1.055,2.459,1.084,.088,.061,.031);
  for(const [x,z]of [[-.957,-1.218],[.820,-1.155]]){
    add(P,'turretDetail',box(.263,.025,.40),x,2.51,z);
    for(const dx of [-.075,.075])add(P,'turretDetail',box(.020,.041,.063),x+dx,2.543,z-.125);
  }
}

function antenna(P:TankBuilderPort,x:number,z:number,tip:number,r:number):void {
  if(z<-2){
    // Source aft feet are narrow collars receiving the spindle directly on
    // the bevel. The old broad cone stopped26mm above that receiving roof.
    add(P,'turretDetail',new THREE.LatheGeometry([
      [0,2.453],[.059,2.453],[.066,2.477],[.058,2.484],
      [.045,2.495],[.036,2.6105],[0,2.6105],[0,2.453],
    ].map(([radius,y])=>new THREE.Vector2(radius,y)),32),x,0,z);
  }else{
    // Measured separate circular receiver: the short central mast has a
    //150mm-radius foot; the tall outboard aerial has a smaller rolled flange.
    const profile=x<.1?[[0,2.482],[.149,2.482],[.153,2.550],
      [.145,2.559],[0,2.559],[0,2.482]]:
      [[0,2.482],[.103,2.482],[.108,2.510],[.104,2.526],
        [.095,2.530],[.070,2.533],[0,2.533],[0,2.482]];
    add(P,'turretDetail',new THREE.LatheGeometry(profile.map(([radius,y])=>
      new THREE.Vector2(radius,y)),40),x,0,z);
    add(P,'turretDetail',cylY(.05,.071,.115,24),x,2.553,z);
  }
  add(P,'turretDark',cylY(.027,.036,.123,20),x,2.663,z);
  const start=2.710;
  add(P,'turretDark',cylY(r*.54,r,tip-start,12),x,(tip+start)/2,z);
}

function smokeTube(P:TankBuilderPort,end:StrvPoint,direction:StrvPoint,r:number,
  stockRadius=r*.92):THREE.Vector3 {
  // Original stepped canister with a rounded closed cap. Source axis rays do
  // not reveal the deep bores that the earlier generic helper invented.
  const axis=new THREE.Vector3(...direction).normalize();
  const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),axis);
  const profile=[[stockRadius,-.187],[stockRadius,-.160],[r*.70,-.146],
    [r*.70,-.045],[r*.97,-.027],[r,-.014],[r*.85,.005],
    [r*.60,.020],[r*.32,.025],[r*.22,.022],[0,.022],[0,-.187],[stockRadius,-.187]];
  const shell=new THREE.LatheGeometry(profile.map(([radius,z])=>new THREE.Vector2(radius,z)),32)
    .rotateX(Math.PI/2).applyQuaternion(q);
  add(P,'turretDetail',shell,...end);
  return new THREE.Vector3(...end).addScaledVector(axis,-.176);
}

function smokeX(side:-1|1,x:number):number {
  // The supplied left and right sides are offset, not exact mirrors.
  return side===1?x:-x+.021;
}

function aftSmokeBank(P:TankBuilderPort,side:-1|1):void {
  // Six aft tubes: three upper and three staggered lower, not a2×4 array.
  for(const[x,y,z]of [[1.410,2.304,-1.937],[1.411,2.299,-1.720],
    [1.443,2.298,-1.502],[1.388,2.074,-1.961],
    [1.412,2.076,-1.769],[1.441,2.073,-1.547]]){
    const direction:StrvPoint=y>2.2?[side*.66,.75,.10]:[side*.62,.74,.25];
    const foot=smokeTube(P,[smokeX(side,x),y,z],direction,.056);
    // Individual stocks and short mounting webs preserve air between tubes.
    const wall=1.239+Math.max(0,foot.z+1.94)*.145;
    const inner=smokeX(side,wall-.008),outer=foot.x;
    add(P,'turretDetail',box(Math.abs(outer-inner)+.018,.038,.084),
      (inner+outer)/2,foot.y-.012,foot.z);
  }
}

function forwardSmokePair(P:TankBuilderPort,side:-1|1):void {
  // Separate source forward pair leans inward/up. It is not another aft row.
  for(const[x,y,z]of [[1.519,2.290,.410],[1.517,2.254,.570]]){
    const foot=smokeTube(P,[smokeX(side,x),y,z],[-side*.61,.74,.29],.045,.052);
    add(P,'turretDetail',bar([smokeX(side,1.483),foot.y-.027,foot.z],
      [foot.x,foot.y,foot.z],.032));
  }
  // Source transverse stock joins the two feet below their separate shafts.
  add(P,'turretDetail',bar([smokeX(side,1.637),2.176,.320],
    [smokeX(side,1.635),2.160,.510],.028));
}

function smokeSideRail(P:TankBuilderPort,side:-1|1):void {
  // The source's long round linking member stands clear of the side armor.
  const xAt=(z:number)=>smokeX(side,1.410+(z+2.08)*.088);
  add(P,'turretDetail',bar([xAt(-2.045),2.126,-2.045],
    [xAt(-.497),2.126,-.497],.024));
  for(const z of [-2.015,-1.615,-.680,-.530]){
    add(P,'turretDetail',bar([xAt(z-.023),2.126,z-.023],
      [xAt(z+.023),2.126,z+.023],.031));
    const wall=1.225+(z+2.015)*.130;
    add(P,'turretDetail',bar([smokeX(side,wall),2.165,z],
      [xAt(z),2.165,z],.018));
    add(P,'turretDetail',bar([xAt(z),2.165,z],[xAt(z),2.126,z],.018));
  }
}

function smokeBank(P:TankBuilderPort,side:-1|1):void {
  aftSmokeBank(P,side);forwardSmokePair(P,side);smokeSideRail(P,side);
}

function basketCourse(y:number,r:number):THREE.BufferGeometry {
  // Independent rounded rectangular return: true source seven courses,
  //350mm height and2.74m width, not the old narrow six-course rectangle.
  const path=new THREE.CurvePath<THREE.Vector3>();
  const p=(x:number,z:number)=>new THREE.Vector3(x,y,z);
  path.add(new THREE.LineCurve3(p(-1.355,-2.375),p(-1.339,-3.235)));
  path.add(new THREE.QuadraticBezierCurve3(p(-1.339,-3.235),p(-1.312,-3.340),p(-.92,-3.373)));
  path.add(new THREE.LineCurve3(p(-.92,-3.373),p(.94,-3.373)));
  path.add(new THREE.QuadraticBezierCurve3(p(.94,-3.373),p(1.330,-3.340),p(1.356,-3.235)));
  path.add(new THREE.LineCurve3(p(1.356,-3.235),p(1.372,-2.375)));
  return new THREE.TubeGeometry(path,96,r,10,false);
}

function basket(P:TankBuilderPort):void {
  const back=-3.373,front=-2.375;
  for(const [x,z]of [[-1.355,front],[1.372,front],[-1.339,-3.235],
    [1.356,-3.235],[-.55,back],[.57,back]])
    add(P,'turretOpenLattice',bar([x,1.919,z],[x,2.275,z],.018));
  for(const [y,r]of [[1.922,.021],[1.985,.015],[2.046,.015],
    [2.101,.014],[2.158,.009],[2.214,.014],[2.273,.021]])
    add(P,'turretOpenLattice',basketCourse(y,r));
  for(const x of [-.85,-.55,-.25,.05,.35,.65,.95])
    add(P,'turretOpenLattice',bar([x,1.922,back],[x,1.922,front],.012));
  for(const x of [-.89,.91]){
    add(P,'turretDetail',box(.064,.070,.312),x,1.917,-2.60);
    add(P,'turretOpenLattice',bar([x,1.922,-2.60],[x,1.922,back],.021));
  }
}

function aftFittings(P:TankBuilderPort):void {
  // Rear access panels follow the measured center face and its two oblique
  // returns. Individual hinges and handles sit outside those supported skins.
  add(P,'turretDetail',box(.93,.365,.025),0,2.186,-2.839);
  for(const y of [2.027,2.352]){
    add(P,'turretDetail',box(.869,.028,.049),0,y,-2.857);
    for(const x of [-.428,.428])add(P,'turretDetail',cylY(.030,.030,.071,16),x,y,-2.874,0,0,Math.PI/2);
  }
  for(const side of [-1,1]){
    add(P,'turretDetail',box(.513,.353,.025),side*.855,2.177,-2.668,0,-side*.457);
    add(P,'turretDetail',box(.036,.245,.056),side*.434,2.188,-2.873);
    add(P,'turretDetail',box(.165,.027,.050),side*.270,2.200,-2.880);
    for(const dx of [-.065,.065])add(P,'turretDetail',box(.025,.040,.063),
      side*.270+dx,2.186,-2.862);
  }
}

export function addStrv122XSuppliedEquipment(P:TankBuilderPort):void {
  roof(P);basket(P);aftFittings(P);addStrv122XSuppliedRoofWeapon(P);
  antenna(P,.6801,-1.819,5.359131746953,.017);
  antenna(P,.0136,-1.817,3.105099245502,.0226);
  antenna(P,1.0038,-2.4224,3.159506674405,.0208);
  antenna(P,-.9833,-2.4243,2.921656993616,.0170);
  for(const side of [-1,1] as const)smokeBank(P,side);
}
