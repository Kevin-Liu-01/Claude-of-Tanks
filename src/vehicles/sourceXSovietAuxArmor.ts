// Boot-light collision outlines for the already authored second-wave Soviet
// skirts/screens. These are scalar first-party profile recipes, not source
// topology or new visual geometry. Nominal protection remains donor balance.
import type {FleetTankSpec} from './specContracts.ts';
import type {ArmorPlate, Vec3Tuple} from './specHelpers.ts';

type Point = Vec3Tuple;
type Course = readonly [z: number, low: number, top: number];
type Hem = readonly [z: number, low: number, outer: number];
type Rail = readonly [low: number, high: number];
type Emit = (points: readonly Point[], group: string) => void;
export const SOVIET_AUX_IDS = ['t62mv1_x', 't72b_1987_x', 't80u_x', 't72b3_x',
  't72b3m_x', 't72bu_x', 't90_x', 't90a_burlak_x', 't90ms_x'] as const;

function sub(a: Point, b: Point): Point { return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }
function cross(a: Point, b: Point): Point {
  return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
}
function dot(a: Point, b: Point): number { return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]; }

function emitter(out: ArmorPlate[], seed: ArmorPlate): Emit {
  const add = (points: readonly Point[], group: string): void => {
    out.push({...seed, verts: points.map(p => [...p]), convexPolygon: true,
      surfaceGroup: group, gunFollow: false});
  };
  return (points, group) => {
    const normal = cross(sub(points[1],points[0]),sub(points[2],points[0]));
    if (points.length===4 && Math.abs(dot(normal,sub(points[3],points[0])))>1e-10) {
      // Same diagonal as sectionSolid's longitudinal edge. A warped loft is
      // two real planar facets, never a flattened protective rectangle.
      add([points[0],points[1],points[2]],group);
      add([points[0],points[2],points[3]],group);
    } else add(points,group);
  };
}

function sideQuad(emit: Emit, side: number, lowA: Point, topA: Point,
  lowB: Point, topB: Point, group: string): void {
  const points = [lowA,topA,topB,lowB];
  emit(side<0 ? points.reverse() : points,group);
}

function flatPanel(emit: Emit, side: number, x: number, a: number, b: number,
  low: number, top: number, group: string): void {
  sideQuad(emit,side,[x,low,a],[x,top,a],[x,low,b],[x,top,b],group);
}

function straightCourse(emit: Emit, side: number, x: number,
  rows: readonly Course[], group: string): void {
  for(let i=1;i<rows.length;i++) {
    const [a,al,at]=rows[i-1],[b,bl,bt]=rows[i];
    sideQuad(emit,side,[x,al,a],[x,at,a],[x,bl,b],[x,bt,b],group);
  }
}

function t62(emit: Emit, side: number): void {
  for(let i=0;i<10;i++) {
    const a=-1.52442+i*.284,b=a+.281;
    sideQuad(emit,side,[side*1.650,.492,a],[side*1.548,1.25229,a],
      [side*1.650,.492,b],[side*1.548,1.25229,b],`t62-skirt-${side}-${i}`);
  }
}

function t72b1987(emit: Emit, side: number): void {
  straightCourse(emit,side,side*1.7185,[[-3.36854,.992,1.112],[-3.05,.904,1.229],
    [-2.80,.848,1.229],[-1.38,.655,1.231],[2.55,.655,1.216],
    [3.01,.874,1.195],[3.36,.899,.946]],`t72b1987-skirt-${side}`);
}

function t80(emit: Emit, side: number): void {
  const rows: readonly Course[]=[[-2.882,.886,1.414],[-2.45,.815,1.458],
    [-1.22,.782,1.504],[1.75,.762,1.449],[2.886,.782,1.418]];
  for(let i=1;i<rows.length;i++) {
    const [a,al,at]=rows[i-1],[b,bl,bt]=rows[i];
    sideQuad(emit,side,[side*1.8,al,a],[side*1.685,at,a],
      [side*1.8,bl,b],[side*1.685,bt,b],`t80-skirt-${side}`);
  }
}

function t72b3(emit: Emit, side: number): void {
  const x=side<0?-1.779:1.791;
  straightCourse(emit,side,x,[[-3.023,.851,1.238],[-2.84,.721,1.128],
    [2.90,.719,1.128],[3.459,.782,1.123]],`t72b3-lower-${side}`);
  flatPanel(emit,side,side<0?-1.669:1.683,-3.019,2.601,1.240,1.440,
    `t72b3-inner-apron-${side}`);
}

const B3M_PANELS: readonly (readonly [number,number,number,number])[]=[
  [-3.153,-2.559,1.53164,.79919],[-2.217,-1.73,1.53257,.79949],
  [-1.389,-.795,1.53164,.79919],[-.785,-.19,1.53164,.79919],[-.18,.415,1.53164,.79919],
  [.423,1.018,1.53164,.79919],[1.029,1.624,1.53164,.79919],[1.637,2.232,1.52077,.79884],
  [2.242,3.182,1.47615,.7984]];
function t72b3m(emit: Emit, side: number): void {
  const lane=side<0?-1.962:1.958;
  B3M_PANELS.forEach(([a,b,top,low],i)=>{
    flatPanel(emit,side,lane-side*.0095,a,b,low,top,`b3m-fixed-backing-${side}-${i}`);
    if(a>-1.4 && b<2.24)flatPanel(emit,side,lane-side*.0075,a+.003,b-.003,
      .5206,.7976,`b3m-lower-curtain-${side}-${i}`);
  });
  flatPanel(emit,side,lane-side*.007,2.2445,3.1795,.6296,.7996,`b3m-front-curtain-${side}`);
  flatPanel(emit,side,lane-side*.007,-2.5555,-1.7305,.660,.800,`b3m-rear-curtain-${side}`);
}

function t72bu(emit: Emit, side: number): void {
  const x=side<0?-1.7605:1.7475;
  const rows: readonly (readonly [number,number,number])[]=[[-2.85,-1.90,.736],
    [-1.89,-.91,.741],[-.90,.10,.745],[.11,1.09,.751],[1.10,2.1,.757],[2.11,3.18,.764]];
  rows.forEach(([a,b,low],i)=>flatPanel(emit,side,x,a,b,low,
    1.388+(a>1.7?-.061*(a-1.7):.008*a),`t72bu-skirt-${side}-${i}`));
}

function awCourse(emit: Emit, side: number, rows: readonly Hem[], group: string,
  inner=1.669,crownOuter=1.77735): void {
  const ring=([z,low,original]: Hem): Point[]=>{
    const offset=side<0?.0019:0,outer=original+offset,crown=Math.min(outer,crownOuter+offset);
    return [[side*outer,low,z],[side*crown,1.235,z],[side*(crown-.006),1.26,z],
      [side*(crown-.028),1.28,z],[side*(inner+offset+.018),1.300,z],[side*(inner+offset),1.3057,z]];
  };
  for(let s=1;s<rows.length;s++) {
    const a=ring(rows[s-1]),b=ring(rows[s]);
    for(let i=1;i<a.length;i++)sideQuad(emit,side,a[i-1],a[i],b[i-1],b[i],group);
  }
}

function t90aw(emit: Emit, side: number): void {
  const rear: readonly Hem[]=side<0?[[-3.043,1.008,1.77935],[-2.798,.982,1.77964],
    [-2.553,.929,1.77992],[-2.308,.879,1.78020],[-2.063,.843,1.78658],[-1.819,.820,1.79929],
    [-1.574,.797,1.80992],[-1.329,.766,1.80330],[-1.084,.7305,1.77935]]:
    [[-3.043,.7256,1.78035],[-1.084,.7256,1.78035]];
  awCourse(emit,side,rear,`aw-rear-sheet-${side}`,side<0?1.67285:1.668,1.78035);
  awCourse(emit,side,[[-1.083,.7256,1.77635],[-.7711,.7475,1.77685],[-.45925,.7455,1.77951],
    [-.1474,.7295,1.82225],[.008525,.7275,1.80781],[.16455,.7256,1.77635]],`aw-middle-sheet-${side}`);
  awCourse(emit,side,[[.16895,.7256,1.77445],[1.59765,.7256,1.77445]],`aw-straight-sheet-${side}`);
  awCourse(emit,side,[[1.60055,.7256,1.77445],[1.94655,.7360,1.77297],[2.29245,.7256,1.77242],
    [2.63835,.7286,1.79411],[2.81130,.7292,1.80016],[2.98435,.7256,1.78126]],
  `aw-front-sheet-${side}`,1.669,1.77242);
}

function burlak(emit: Emit, side: number): void {
  const rows: readonly (readonly [number,number])[]=[[-2.06345,1.959],[-.45925,1.2476],
    [.8833,1.4287],[2.29245,1.3838]];
  rows.forEach(([z,d],i)=>flatPanel(emit,side,side*1.7375,z-(d-.01)/2,z+(d-.01)/2,
    .72595,1.30605,`burlak-skirt-${side}-${i}`));
}

function msCurtains(emit: Emit, side: number): void {
  const rows: readonly (readonly [number,number])[]=[[-.669,.67],[-.001,.655],[.662,.650],
    [1.328,.655],[1.999,.661],[2.659,.634]];
  rows.forEach(([z,d],i)=>flatPanel(emit,side,side*1.7765,z-(d-.005)/2,z+(d-.005)/2,
    .437,.759,`ms-curtain-${side}-${i}`));
  straightCourse(emit,side,side<0?-1.78805:1.77735,[[-3.04395,side<0?1.0166:1.0127,1.2305],
    [-1.00495,side<0?.5244:.5205,1.2305]],`ms-inner-sheet-${side}`);
}

const MS_LEFT: readonly Rail[]=[[1.459,1.4629],[1.3936,1.3984],[1.3291,1.334],[1.2646,1.2695],
  [1.2002,1.2051],[1.1357,1.1396],[1.0713,1.0752],[1.0068,1.0107],[.9419,.9463],
  [.8774,.8818],[.8125,.8169],[.748,.7524],[.6836,.688]];
const MS_RIGHT: readonly Rail[]=[[1.4541,1.458],[1.3896,1.3945],[1.3262,1.3301],[1.2617,1.2666],
  [1.1982,1.2021],[1.1338,1.1387],[1.0703,1.0742],[1.0059,1.0098],[.9419,.9463],
  [.8779,.8823],[.814,.8184],[.7495,.7539],[.6855,.6899]];

function cageRail(emit: Emit, side: number, a: number, b: number,
  low: number, high: number, group: string): void {
  // One solid stock's exposed faces; no rectangle across neighbouring rails.
  const center=side<0?-1.84615:1.84035,l=center-.0249,r=center+.0249;
  flatPanel(emit,1,r,a,b,low,high,group);flatPanel(emit,-1,l,a,b,low,high,group);
  emit([[l,high,a],[l,high,b],[r,high,b],[r,high,a]],group);
  emit([[l,low,a],[r,low,a],[r,low,b],[l,low,b]],group);
  emit([[l,low,a],[l,high,a],[r,high,a],[r,low,a]],group);
  emit([[l,low,b],[r,low,b],[r,high,b],[l,high,b]],group);
}

function msFrontRails(emit: Emit, side: number): void {
  const rows=side<0?MS_LEFT:MS_RIGHT,back=side<0?-2.17095:-2.16895,front=side<0?-1.00495:-1.01175;
  const lower=side<0?[-1.99515,-1.81345,-1.62895,-1.44725]:[-1.99315,-1.81155,-1.62695,-1.44535];
  rows.forEach(([lo,hi],i)=>{
    const group=`ms-front-rail-${side}-${i}`;
    if(side>0 && i>=3 && i<=5) {
      cageRail(emit,side,back,-1.86425,lo,hi,group+'-back');
      cageRail(emit,side,-1.44335,front,lo,hi,group+'-front');
    } else cageRail(emit,side,i<9?back:lower[i-9],front,lo,hi,group);
  });
}

function msRearRails(emit: Emit, side: number): void {
  const rows: readonly Rail[]=side<0?[[1.458,1.4629],[1.3936,1.3984],[1.3281,1.333],
    [1.2646,1.2695],[1.1992,1.2041],[1.1357,1.1396],[1.0703,1.0752],[1.0068,1.0107]]:
    [[1.4541,1.459],[1.3906,1.3945],[1.3262,1.3301],[1.2627,1.2666],
      [1.1982,1.2021],[1.1338,1.1387],[1.0703,1.0742],[1.0068,1.0107]];
  rows.forEach(([lo,hi],i)=>cageRail(emit,side,-3.08305,-2.17875,lo,hi,`ms-rear-rail-${side}-${i}`));
  for(const z of [-3.078,-2.184])cageRail(emit,side,z-.0025,z+.0025,1.008,1.463,
    `ms-rear-upright-${side}-${z}`);
}

const authors: Readonly<Record<string,(emit: Emit,side: number)=>void>>={
  t62mv1_x:t62,t72b_1987_x:t72b1987,t80u_x:t80,t72b3_x:t72b3,t72b3m_x:t72b3m,
  t72bu_x:t72bu,t90_x:t90aw,t90a_burlak_x:burlak,t90ms_x:msCurtains,
};

/** Called after source dimensions/pivots and authored ERA setup, before the
 * anatomy pass. Unknown/original IDs are untouched. Non-target plates retain
 * their exact object identity, coordinates and combat settings. */
export function applySourceXSovietAuxArmor(spec: FleetTankSpec,id: string): void {
  const author=authors[id];if(!author)return;
  const old=spec.armor.hullPlates;
  const removable=(p: ArmorPlate): boolean=>p.kind==='spaced' && !p.era
    && (/^skirt(?:_rubber)?_[LR]$/.test(p.name)||p.name==='slat_cage');
  const replacements: ArmorPlate[]=[];
  for(const side of [-1,1]) {
    const seed=old.find(p=>removable(p)&&p.name.endsWith(side<0?'_L':'_R'));
    if(!seed)throw new Error(`${id}: explicit donor skirt balance missing`);
    author(emitter(replacements,seed),side);
  }
  if(id==='t90ms_x') {
    const cage=old.find(p=>p.name==='slat_cage'&&removable(p));
    if(!cage)throw new Error('t90ms_x: explicit donor cage balance missing');
    const emit=emitter(replacements,cage);
    for(const side of [-1,1]){msFrontRails(emit,side);msRearRails(emit,side);}
  }
  // BU/AW/Burlak have drums, tow hardware or empty drum cradles, not a rear
  // slat screen. The inherited solid cage rectangle has no physical owner.
  spec.armor.hullPlates=[...old.filter(p=>!removable(p)),...replacements];
}
