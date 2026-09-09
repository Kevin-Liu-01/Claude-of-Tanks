// Source59 rack stocks and source79 folded aft screen. This is independently
// authored stock, not an opaque basket envelope or reference triangle payload.
import * as THREE from 'three';
import { closedSectionLoft, roundMember, type XY, type XYZ } from './abramsSourceXGeometry.ts';

interface RackPart { name: string; geometry: THREE.BufferGeometry }
const part = (name: string, geometry: THREE.BufferGeometry, owner = 59): RackPart => {
  geometry.userData.sourceOwner = `selectedOBJ:${owner}`;
  return { name: `SourceRack${name}`, geometry };
};
function box(name: string, min: XYZ, max: XYZ, owner = 59): RackPart {
  return part(name,new THREE.BoxGeometry(max[0]-min[0],max[1]-min[1],max[2]-min[2])
    .translate((max[0]+min[0])/2,(max[1]+min[1])/2,(max[2]+min[2])/2),owner);
}
function ccw(ring: XY[]): XY[] {
  const area=ring.reduce((sum,a,i)=>{const b=ring[(i+1)%ring.length];return sum+a[0]*b[1]-a[1]*b[0];},0);
  return area>0?ring:ring.reverse();
}
function uPath(left: number, right: number, rear: number, radius: number, front: number): XY[] {
  const points: XY[]=[[left,-front],[left,-rear-radius]];
  for(let i=1;i<=8;i++){
    const a=Math.PI-i*Math.PI/16;
    points.push([left+radius+radius*Math.cos(a),-rear-radius+radius*Math.sin(a)]);
  }
  points.push([right-radius,-rear]);
  for(let i=1;i<=8;i++){
    const a=Math.PI/2-i*Math.PI/16;
    points.push([right-radius+radius*Math.cos(a),-rear-radius+radius*Math.sin(a)]);
  }
  points.push([right,-front]);
  return points;
}

/** Source59/1564 curved lower receiving strip: only ~5mm stock. */
export function sourceMainRackStrip(): RackPart {
  const outer=uPath(-1.56495,1.436,-2.799245,.20625,-2.291675);
  const inner=uPath(-1.55997,1.43102,-2.794265,.20127,-2.291675);
  const ring=ccw([...outer,...inner.reverse()]);
  return part('MainLowerStrip',closedSectionLoft([
    {z:1.912785,ring},{z:2.028185,ring},
  ]).rotateX(-Math.PI/2));
}

/** Three formed receiving ribs, not six round posts across rounded corners. */
function mainReceivingRib(name: string, x: number, center: boolean): RackPart {
  // Source59/4432,4878,4968: sparse Y/Z manufacturing sections. The rear
  // stem slopes forward by28mm; its top curl contacts the upper U course.
  const rear: XY[]=[
    [1.859015,-2.736985],[1.861495,-2.760775],[1.873165,-2.781165],
    [1.892575,-2.794155],[1.914675,-2.795725],[2.310315,-2.795485],
    [2.318705,-2.790505],[2.320525,-2.779825],[2.313965,-2.768905],
    [2.299225,-2.763205],[1.926135,-2.735285],[1.922045,-2.733225],
    [1.920005,-2.729095],
  ];
  const nose: XY[]=center?[
    [1.919935,-2.211325],[1.914235,-2.190455],[1.898915,-2.175165],
    [1.877985,-2.169575],[1.857115,-2.175285],[1.841795,-2.190575],
    [1.836255,-2.211455],
  ]:[
    [1.919935,-2.273475],[1.901915,-2.273475],[1.884765,-2.282815],
    [1.869515,-2.298235],[1.860175,-2.315345],
  ];
  const ring=ccw([...rear,...nose].map(([y,z])=>[-z,y]));
  return part(name,closedSectionLoft([{z:x-.00688,ring},{z:x+.00688,ring}]).rotateY(Math.PI/2));
}

/** Open floor frame and actual three bracket stocks shared by the family. */
export function sourceMainRackSupports(): RackPart[] {
  const outer=uPath(-1.54723,1.40885,-2.789785,.1960,-2.291195);
  const inner=uPath(-1.52672,1.38834,-2.769275,.17549,-2.311765);
  const ring=ccw([...outer,...inner.reverse()]);
  return [
    part('MainFloorFrame',closedSectionLoft([{z:1.91861,ring},{z:1.92481,ring}]).rotateX(-Math.PI/2)),
    mainReceivingRib('MainReceivingCenter',-.068828,true),
    mainReceivingRib('MainReceivingLeft',-.585513,false),
    mainReceivingRib('MainReceivingRight',.447697,false),
    part('MainFloorCrossRear',roundMember([-1.5267,1.910915,-2.615765],[1.39842,1.910915,-2.615765],.01033,8)),
    part('MainFloorCrossFore',roundMember([-1.09568,1.910915,-2.451645],[.958167,1.910915,-2.451645],.01033,8)),
  ];
}

/** Thin upright with its small, chamfered top return, not its filled AABB. */
function foreUpright(name: string, left: number, right: number, mirrored = false): RackPart {
  const ring=(rear: number): XY[]=>ccw([
    [2.796095,1.888705],[2.796095,2.289595],
    [2.797185,2.293465],[2.801065,2.295065],
    [-rear,2.295065],[-rear,2.288105],
    [2.803495,2.288105],[2.803495,1.888705],
  ]);
  const stations=mirrored
    ?[{z:left,ring:ring(-2.808105)},{z:left+.01653,ring:ring(-2.826925)},{z:right,ring:ring(-2.826925)}]
    :[{z:left,ring:ring(-2.826925)},{z:right-.01653,ring:ring(-2.826925)},{z:right,ring:ring(-2.808105)}];
  return part(name,closedSectionLoft(stations).rotateY(Math.PI/2));
}

function foreReceiver(name: string, x: number): RackPart {
  // Source59/697,1352: 6.79mm stem and a rounded-tip upper hook.
  const rows=[[-.01311,-2.815875],[-.01166,-2.809205],[-.0073,-2.805195],
    [0,-2.803855],[.0073,-2.805195],[.01166,-2.809205],[.01311,-2.815875]];
  return part(name,closedSectionLoft(rows.map(([dx,tip])=>({z:x+dx,ring:ccw([
    [2.840395,2.062985],[2.847185,2.062985],[2.847185,2.277545],
    [2.845615,2.282795],[2.840395,2.284475],[-tip,2.284475],
    [-tip,2.277545],[2.840395,2.277545],
  ])}))).rotateY(Math.PI/2));
}

function extendedFrame(): RackPart[] {
  const parts=[
    box('ExtensionRearSill',[-1.10333,1.886655,-3.306815],[.964417,1.931675,-3.301355]),
    box('ExtensionRearBand',[-1.1089,1.930065,-3.311305],[.970056,1.992515,-3.306335]),
  ];
  for(const [i,x]of[-1.1008,.96195].entries()){
    parts.push(box(`ExtensionSideSill${i}`,[x-.00265,1.886655,-3.306815],[x+.00265,1.931675,-2.800945]));
    parts.push(box(`ExtensionRearStile${i}`,[x-.00265,1.930,-3.306815],[x+.00265,2.299885,-3.264095]));
    parts.push(foreUpright(`ExtensionForeStile${i}`,i===0?-1.12006:.942906,i===0?-1.08189:.981017,i===1));
    // The side courses meet separate fore receiver stocks, not a panel that
    // fills the side opening between the three bars.
    parts.push(foreReceiver(`ExtensionForeReceiver${i}`,i===0?-1.10097:.961997));
    for(const [j,y]of[2.076225,2.175815,2.267295].entries()){
      parts.push(part(`ExtensionSideCourse${i}_${j}`,roundMember([x,y,-3.285],[x,y,-2.844],.01295,8)));
    }
  }
  parts.push(foreUpright('ExtensionForeCenterStile',-.088414,-.050303));
  // Actual source59/6810,4753,747 hex pins carry the upper hooked receivers.
  // Preserve the fine forward-tip seam instead of filling it to the upright.
  for(const [i,[x,y0,y1]]of[
    [-1.100375,2.197295,2.288125],[-.069724,2.197305,2.288135],
    [.961396,2.197305,2.288135],
  ].entries())parts.push(part(`ExtensionForePin${i}`,roundMember([x,y0,-2.813995],[x,y1,-2.813995],.00516,6)));
  for(const [i,y]of[2.07619,2.17567,2.26730].entries()){
    parts.push(part(`ExtensionRearCourse${i}`,roundMember([-1.1008,y,-3.284855],[.96195,y,-3.284855],.013,8)));
  }
  // Actual59/3217 and8792 are narrow U receivers, not broad floors.
  for(const [i,x0]of[-1.06489,-.031653].entries()){
    const x1=x0+.957567;
    parts.push(box(`ExtensionInnerFore${i}`,[x0+.0237,1.88819,-2.803375],[x1-.0237,1.917445,-2.797305]));
    for(const [j,x]of[x0,x1-.0061].entries()){
      parts.push(box(`ExtensionInnerSide${i}_${j}`,[x,1.88819,-3.136415],[x+.0061,1.917445,-2.797305]));
    }
  }
  parts.push(part('ExtensionFloorCross',roundMember([-1.05885,1.90274,-3.12203],[.920277,1.90274,-3.12203],.01295,8)));
  return parts;
}

function screenReceiver(name: string, left: number, right: number): RackPart {
  // Sparse manufacturing profile of the inclined strip and its upper curl.
  // Source79 omits only the long aft stem face; close that 4.61mm stock here.
  const profile: XY[]=[
    [1.987225,-3.314295],[1.987155,-3.309685],[2.259495,-3.304345],
    [2.269495,-3.299615],[2.272775,-3.289175],[2.267305,-3.279585],
    [2.256575,-3.277275],[2.255705,-3.272665],[2.270075,-3.275945],
    [2.277445,-3.288685],[2.272995,-3.302765],[2.259575,-3.308955],
  ];
  const ring=ccw(profile.map(([y,z])=>[-z,y]));
  return part(name,closedSectionLoft([{z:left,ring},{z:right,ring}]).rotateY(Math.PI/2),79);
}

function foldedScreen(): RackPart[] {
  // Each source79 strip is a zero-thickness folded sheet. Give it a concealed
  // 2.5mm forward backing, leaving every measured aft face and fold unchanged.
  const rows=[
    [1.827235,-3.320975,1.928425,-3.343915,1.931195,-3.318665],
    [1.929375,-3.319155,2.034725,-3.341725,2.037645,-3.316485],
    [2.033705,-3.317085,2.139855,-3.339665,2.142765,-3.314415],
    [2.139345,-3.315025,2.245055,-3.337605,2.247895,-3.312355],
    [2.244545,-3.312965,2.350185,-3.335535,2.353025,-3.310295],
  ];
  const parts=rows.map(([y0,z0,y1,z1,y2,z2],i)=>{
    const ring=ccw([[-z0,y0],[-z1,y1],[-z2,y2],[-z2-.0025,y2],[-z1-.0025,y1],[-z0-.0025,y0]]);
    return part(`AftScreenFold${i}`,closedSectionLoft([
      {z:-.440649,ring},{z:.329981,ring},
    ]).rotateY(Math.PI/2),79);
  });
  // Source79/2346 is the real thin receiving sheet behind the five folds.
  // Its upper106mm remains visible above them; keep the folded lower edge.
  const backing: XY[]=[
    [1.824465,-3.346465],[1.823955,-3.321335],[2.458735,-3.308955],
    [2.458595,-3.303495],[1.814985,-3.316115],[1.815635,-3.351195],
    [1.833365,-3.350955],[1.833295,-3.346465],
  ];
  const backingRing=ccw(backing.map(([y,z])=>[-z,y]));
  parts.push(part('AftScreenBacking',closedSectionLoft([
    {z:-.445899,ring:backingRing},{z:.335291,ring:backingRing},
  ]).rotateY(Math.PI/2),79));
  // Three actual79 receiving strips run behind the screen and overlap the
  // rear rack courses. The sheet is not left floating in front of its rack.
  for(const [i,[left,right]]of[[-.368759,-.332779],[-.073629,-.037649],[.221511,.257561]].entries()){
    parts.push(screenReceiver(`AftScreenReceiver${i}`,left,right));
  }
  return parts;
}

export function sourceExtendedRack(): RackPart[] {
  return [...extendedFrame(),...foldedScreen()];
}

