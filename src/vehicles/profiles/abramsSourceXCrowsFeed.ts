// Source-owned CROWS feed: independently authored guide courses and cartridge
// axes/sections. No reference mesh, vertices or connectivity are loaded here.
import * as THREE from 'three';

type Emit = (name: string, geometry: THREE.BufferGeometry) => void;
type Course = readonly [number, number, number, number, number];
// Physical part census: id, base XYZ, unit axis XYZ, four axial stations,
// four mean ring radii, and six-sided case phase. Source91 is slightly warped;
// these are measured scalar profiles, not an exported source mesh.
const ROUNDS: readonly (readonly number[])[] = [
  [60, -0.574135, 3.28933994, 0.60397734, -0.03772735, -0.09380712, 0.9948753, 0.06750551, 0.06888471, 0.11888415, 0.12232554, 0.01249132, 0.01196947, 0.00913853, 0.00367171, 2.20842179],
  [64, -0.600855, 3.28965326, 0.60298717, -0.03470866, -0.09221647, 0.99513388, 0.06749481, 0.06887553, 0.11887193, 0.122303, 0.01211629, 0.0120543, 0.00924982, 0.00367884, 2.17776932],
  [68, -0.62789333, 3.28754989, 0.60211533, -0.03454781, -0.09289336, 0.99507652, 0.06749507, 0.06893597, 0.11890187, 0.12234305, 0.01212282, 0.01205925, 0.00924283, 0.00366743, 1.0813657],
  [72, -0.65449166, 3.28571494, 0.60132683, -0.03470651, -0.09337783, 0.99502565, 0.06749666, 0.06891806, 0.11890162, 0.12240704, 0.01211887, 0.01206496, 0.00922788, 0.00366379, 1.08851653],
  [76, -0.683235, 3.28534826, 0.60051732, -0.03469418, -0.09221794, 0.99513425, 0.06752314, 0.0689467, 0.11888237, 0.12235405, 0.01209903, 0.01204412, 0.00921517, 0.00365949, 1.02252197],
  [80, -0.71270999, 3.28454828, 0.59958916, -0.03471749, -0.09094658, 0.99525043, 0.06753229, 0.06892942, 0.11888858, 0.12241727, 0.01209501, 0.01203444, 0.00922953, 0.00365482, 2.1070048],
  [84, -0.461485, 3.29050656, 0.61595166, -0.04029225, -0.05597394, 0.99761889, 0.06290281, 0.06432088, 0.11429823, 0.11776474, 0.01203742, 0.01195946, 0.00916818, 0.00365234, -0.96617071],
  [88, -0.48390834, 3.28995991, 0.61322018, -0.10967493, -0.06058242, 0.99211954, 0.06414543, 0.06554829, 0.11555254, 0.11909434, 0.01204522, 0.01199749, 0.00918761, 0.00365391, -0.97013692],
  [92, -0.51365998, 3.29125992, 0.60751883, -0.08017828, -0.06793412, 0.99446287, 0.06723488, 0.06861767, 0.1186153, 0.1221033, 0.01284899, 0.01189719, 0.00905844, 0.00315126, -0.93661284],
  [96, -0.54415332, 3.29084659, 0.60545367, -0.07108781, -0.10003108, 0.99244159, 0.0675498, 0.06899245, 0.11900568, 0.12247809, 0.01210669, 0.01204895, 0.00924348, 0.00366484, 1.09876452],
  [100, -0.38764334, 3.32703161, 0.57974501, 0.86015226, 0.10328477, 0.49947007, 0.07742226, 0.07900901, 0.13074032, 0.1342243, 0.01165273, 0.0105642, 0.00874474, 0.00364635, -2.89554475],
  [104, -0.39483501, 3.31157827, 0.60031533, 0.65113029, 0.04767551, 0.75746709, 0.07894802, 0.08071011, 0.13242995, 0.13584839, 0.01198698, 0.01095254, 0.00918022, 0.00363565, 0.50322984],
  [108, -0.40948667, 3.30306657, 0.60982351, 0.3423472, -0.0534456, 0.93805222, 0.07031558, 0.07177461, 0.12414096, 0.12763842, 0.0116092, 0.01224193, 0.00913278, 0.0036428, 2.2366807],
  [112, -0.38933666, 3.34983162, 0.40889683, 0.99845045, 0.05558663, -0.00261436, 0.07801637, 0.08058089, 0.13449156, 0.13840111, 0.01041928, 0.00840361, 0.00808191, 0.00346624, 1.68439264],
  [116, -0.38654833, 3.35814822, 0.43092517, 0.99860854, 0.02153347, 0.04813835, 0.07640801, 0.07888219, 0.13360682, 0.13730939, 0.01148893, 0.00840172, 0.00728022, 0.00353825, 2.24828535],
  [120, -0.385465, 3.21572828, 0.33113583, 0.99922044, 0.0058963, -0.03903514, 0.07473822, 0.07617204, 0.1282094, 0.13169765, 0.01202218, 0.01206131, 0.0092369, 0.00377777, 0.51673553],
  [124, -0.38522333, 3.24140994, 0.32967883, 0.99731133, 0.01146157, -0.07237913, 0.07454621, 0.07599582, 0.12786972, 0.13130638, 0.01156529, 0.01220831, 0.00927523, 0.00361058, 0.53459162],
  [128, -0.38850833, 3.31866491, 0.36107516, 0.99988998, 0.01410359, -0.00459421, 0.07501306, 0.07647383, 0.12903935, 0.13259291, 0.01127252, 0.00852779, 0.00769659, 0.00358979, 1.50036856],
  [132, -0.38664833, 3.33941162, 0.38540883, 0.9981039, 0.01475485, -0.05975698, 0.07639054, 0.07844421, 0.13149479, 0.13509447, 0.01089306, 0.00835971, 0.00789471, 0.00353309, 1.5269704],
  [136, -0.38539833, 3.18987489, 0.33688267, 0.99889538, 0.00606464, -0.04659651, 0.07484667, 0.07625702, 0.1284662, 0.13193408, 0.01210938, 0.01203845, 0.00920624, 0.00365493, 0.52443991],
  [140, -0.38522333, 3.26861993, 0.33356351, 0.99788085, 0.01093398, -0.06414253, 0.07456079, 0.07602334, 0.12779615, 0.13123144, 0.01179235, 0.01231367, 0.00931574, 0.00371089, 0.68445958],
  [144, -0.38522333, 3.29303658, 0.34218233, 0.99731396, 0.01110602, -0.07239831, 0.07456408, 0.07600179, 0.1278698, 0.13130603, 0.01165713, 0.01224471, 0.00928736, 0.00368939, 0.57790579],
  [148, -0.38478, 3.35772165, 0.45902051, 0.99912472, 0.03977212, -0.01296006, 0.07380078, 0.07539523, 0.1273959, 0.13082449, 0.0121244, 0.01061684, 0.00886895, 0.00371878, -0.60181261],
  [152, -0.38487, 3.35863491, 0.48159567, 0.99849106, 0.0533597, -0.01297471, 0.07403228, 0.07547678, 0.12755384, 0.13099766, 0.01205166, 0.01061636, 0.00885135, 0.00364693, -0.46094631],
  [156, -0.38482166, 3.35603325, 0.50441366, 0.99855904, 0.05207396, -0.01296692, 0.07399171, 0.07542507, 0.12753081, 0.13100044, 0.01202084, 0.01084202, 0.00900443, 0.00374741, -0.29775043],
  [160, -0.38463667, 3.35154494, 0.52672534, 0.99694767, 0.07700794, -0.01285018, 0.07380337, 0.07530122, 0.12729285, 0.13076582, 0.01186221, 0.0107333, 0.00884633, 0.00367375, -0.43560109],
  [164, -0.38398333, 3.34648657, 0.54329382, 0.9874175, 0.07042888, 0.14158553, 0.07396909, 0.07550559, 0.1274788, 0.13089026, 0.01178001, 0.01056511, 0.00880283, 0.00363029, -0.48724321],
  [168, -0.38444666, 3.33531324, 0.56291233, 0.952596, 0.08806217, 0.29121456, 0.07431313, 0.07579445, 0.12788452, 0.13129034, 0.01175133, 0.01047518, 0.00874995, 0.00367119, -0.49245624],
  [172, -0.43088167, 3.29576993, 0.61473919, -0.04262641, -0.07441195, 0.99631614, 0.06427173, 0.06569539, 0.11566589, 0.11913568, 0.01207514, 0.0120183, 0.0092062, 0.00364698, 0.02986762],
];
// Source88 guide bend, in canonical coordinates. A course records the lower
// central sheet center and the horizontal cartridge axis. The narrow sides
// and returns leave the entire inside of the bend genuinely open.
const COURSE: readonly Course[] = [
  [-.61911,3.27755,.6641,0,1],[-.600,3.27765,.66460,0,1],
  [-.550,3.2784,.6667,0,1],[-.500,3.27965,.6700,0,1],
  [-.460,3.2815,.6736,0,1],[-.420,3.2860,.6744,.10,.995],
  [-.385,3.2941,.6670,.36,.933],[-.360,3.30165,.6522,.57,.822],
  [-.3405,3.3129,.6300,.81,.586],[-.3260,3.3292,.5860,.975,.222],
  [-.31915,3.34130,.5500,1,0],[-.31730,3.34910,.4800,1,0],
  [-.31940,3.33905,.4000,1,0],[-.32130,3.25820,.3400,1,0],
  [-.32255,3.20905,.33750,1,0],
];

function geometry(positions: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const uv: number[] = [];
  for (let i=0;i<positions.length;i+=3) uv.push(positions[i],positions[i+2]);
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.computeVertexNormals(); return g;
}
function triangle(out: number[],a: THREE.Vector3,b: THREE.Vector3,c: THREE.Vector3): void {
  out.push(...a.toArray(),...b.toArray(),...c.toArray());
}
function connect(out: number[],a: THREE.Vector3[],b: THREE.Vector3[]): void {
  for(let i=0;i<a.length;i++){const j=(i+1)%a.length;triangle(out,a[i],a[j],b[j]);triangle(out,a[i],b[j],b[i]);}
}
function close(out: number[],ring: THREE.Vector3[],reverse: boolean): void {
  for(let i=1;i<ring.length-1;i++){
    if(reverse)triangle(out,ring[0],ring[i+1],ring[i]);
    else triangle(out,ring[0],ring[i],ring[i+1]);
  }
}
function cartridge(r: readonly number[]): THREE.BufferGeometry {
  const origin=new THREE.Vector3(r[1],r[2],r[3]),axis=new THREE.Vector3(r[4],r[5],r[6]).normalize();
  const right=new THREE.Vector3(Math.abs(axis.x)>.8?0:1,0,Math.abs(axis.x)>.8?1:0);
  right.addScaledVector(axis,-right.dot(axis)).normalize();
  const up=new THREE.Vector3().crossVectors(axis,right),out:number[]=[],rings:THREE.Vector3[][]=[];
  for(let k=0;k<4;k++){const t=k===0?0:r[6+k],radius=r[11+k];rings.push(Array.from({length:6},(_,i)=>{
    const angle=r[15]+i*Math.PI/3;return origin.clone().addScaledVector(axis,t)
      .addScaledVector(right,Math.cos(angle)*radius).addScaledVector(up,Math.sin(angle)*radius);
  }));}
  close(out,rings[0],true);
  for(let i=1;i<rings.length;i++)connect(out,rings[i-1],rings[i]);
  const tip=origin.clone().addScaledVector(axis,r[10]),last=rings[3];
  for(let i=0;i<6;i++)triangle(out,last[i],last[(i+1)%6],tip);
  return geometry(out);
}
function rail(course: readonly Course[],offset: number,low: number,width: number,height: number): THREE.BufferGeometry {
  const out:number[]=[],rings=course.map(([x,y,z,ax,az])=>{
    const a=new THREE.Vector3(ax,0,az).normalize();
    return [[offset-width/2,low],[offset+width/2,low],[offset+width/2,low+height],[offset-width/2,low+height]]
      .map(([r,h])=>new THREE.Vector3(x,y+h,z).addScaledVector(a,r)).reverse();
  });
  close(out,rings[0],true);for(let i=1;i<rings.length;i++)connect(out,rings[i-1],rings[i]);close(out,rings[rings.length-1],false);
  return geometry(out);
}
function guidedFeed(emit: Emit): void {
  emit('CenterSheet',rail(COURSE,0,0,.018,.002));
  for(const sign of [-1,1]){
    emit(`Edge${sign}`,rail(COURSE,sign*.068,.008,.002,.008));
    emit(`TopReturn${sign}`,rail(COURSE,sign*.054,.020,.008,.002));
    // The source lower return is an unclosed one-sided sheet. Its authored
    // 0.6mm closure is entirely below that measured receiving surface.
    emit(`LowerReturn${sign}`,rail(COURSE,sign*.054,-.0006,.008,.0006));
  }
}
function bandLink(emit: Emit,index: number,a: Course,b: Course): void {
  const middle:Course=[(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2,(a[3]+b[3])/2,(a[4]+b[4])/2];
  const axis=new THREE.Vector3(middle[3],0,middle[4]).normalize(),side=new THREE.Vector3(axis.z,0,-axis.x);
  const start=new THREE.Vector3(middle[0],middle[1],middle[2]).addScaledVector(side,-.004);
  const end=start.clone().addScaledVector(side,.008);
  const course:Course[]=[[start.x,start.y,start.z,axis.x,axis.z],[end.x,end.y,end.z,axis.x,axis.z]];
  // Four independently closed thin leaves, never a solid rectangular filler.
  emit(`Link${index}Lower`,rail(course,0,-.001,.144,.002));
  emit(`Link${index}Upper`,rail(course,0,.024,.144,.002));
  emit(`Link${index}A`,rail(course,-.071,0,.002,.024));
  emit(`Link${index}B`,rail(course,.071,0,.002,.024));
}

export function buildAbramsSourceXCrowsFeed(emit: Emit,drop=0): void {
  if(!Number.isFinite(drop)||drop<0||drop>.3)throw new Error('Invalid CROWS feed height');
  const add:Emit=(name,g)=>{g.translate(0,-drop,0);g.userData={abramsCrowsFeed:name};emit(`CrowsSourceFeed${name}`,g);};
  guidedFeed(add);
  // The clamp cadence follows the bent guide, not a filled swept volume.
  for(let i=0;i<COURSE.length-1;i++)bandLink(add,i,COURSE[i],COURSE[i+1]);
  for(const row of ROUNDS)add(`Cartridge${row[0]}`,cartridge(row));
}

