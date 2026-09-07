// Source-seated replacement of inherited auxiliary hit surfaces only. These
// seven models retain their untouched main cells, ERA, tracks and renderers.
import type {FleetTankSpec} from './specContracts.ts';
import type {ArmorPlate} from './specHelpers.ts';
import {auxiliaryFace,auxiliaryQuad,auxiliaryRectangle,type AuxPoint} from './sourceXAuxArmorPrimitives.ts';
import {type10AuxiliarySkirts} from './sourceXType10AuxArmor.ts';
import {exposedAuxiliaryCourse} from './sourceXAuxArmorExposure.ts';
import {memoizedAuxiliaryShapes} from './sourceXAuxArmorCache.ts';
const IDS=new Set(['k1a1_x','amx30_x','leclerc_x','leclerc_classic_x','type10_x','type90_x','amx40_x']);
type Span=readonly [number,number];

function outerPanels(template:ArmorPlate,id:string,side:number,x:number,spans:readonly Span[],
  bottom:number,top:number):ArmorPlate[] {
  return spans.map(([a,b],i)=>auxiliaryRectangle(template,`${id}_${side}_outer_${i}`,x,a,b,bottom,top));
}
function exposedBacking(template:ArmorPlate,id:string,side:number,x:number,back:number,front:number,
  bottom:number,top:number,outerBottom:number,spans:readonly Span[]):ArmorPlate[] {
  const out=[auxiliaryRectangle(template,`${id}_${side}_backing_lower`,x,back,front,bottom,outerBottom)];
  for(let i=0;i<spans.length-1;i++){
    const a=Math.max(back,spans[i][1]),b=Math.min(front,spans[i+1][0]);
    if(b>a)out.push(auxiliaryRectangle(template,`${id}_${side}_backing_gap_${i}`,x,a,b,outerBottom,top));
  }
  return out;
}
function leclercRear(template:ArmorPlate,side:number,classic:boolean):ArmorPlate[] {
  const id=classic?'leclerc_classic_x':'leclerc_x';
  const spans:readonly Span[]=classic?[[-3.296311,-2.155381],[-2.139705,-1.287892],[-1.27162,-.419807],[-.387823,.463991],[.484075,1.304696]]:
    [[-3.1594,-2.0659],[-2.0508,-1.2344],[-1.2188,-.4024],[-.3717,.4447],[.4640,1.2505]];
  const x=classic?(side<0?-1.694394:1.652172):(side<0?-1.69355:1.68009);
  const bottom=classic?.779963:.747570,top=classic?1.254544:1.202440;
  const inner=classic?(side<0?-1.678824:1.636821):(side<0?-1.68082:1.6676);
  return [...outerPanels(template,id,side,x,spans,bottom,top),
    ...exposedBacking(template,id,side,inner,classic?-2.144172:-2.05512,classic?1.290854:1.23724,
      classic?.516368:.49492,classic?1.254048:1.20196,bottom,spans)];
}
function charCrown(course:number,z:number,x=1.8):number {
  if(course===0||course===1&&z<=2.1519151)return (1.8933474174-.2884405*x-.0152960*z)/.9573756;
  if(course===1)return Math.max((2.1762882237-.2848769*x-.1574641*z)/.9455423,(1.9773350731-.1979219*x-.1199676*z)/.9728487);
  if(z<3.221041)return Math.max((2.0528522367-.1836468*x-.1614767*z)/.9696387,(1.6454823372+.0046061*x-.1223872*z)/.9924717);
  return Math.max((1.7727332998+.0045779*x-.1642679*z)/.9864051,(1.5829695150+.0386588*x-.1222973*z)/.9917403);
}
function charFloor(course:number,z:number,x=1.8):number {
  if(course===0||course===1&&z<=2.1447914)return(.8750352*x-1.1111632071)/.4840593;
  if(course===1)return(.8750322*x+.0022954*z-1.1160813461)/.4840593;
  return(.8750326*x+.0024275*z-1.1164122622)/.4840578;
}
type FrontPoint=(z:number,top:boolean,x?:number)=>AuxPoint;
function leclercFolds(template:ArmorPlate,side:number,classic:boolean,group:string,
  row:number,inner:number,z0:number,z1:number,point:FrontPoint):ArmorPlate[] {
  const out:ArmorPlate[]=[];
  for(const top of[false,true])for(let band=0;band<(top&&!classic?8:1);band++){
    const steps=top&&!classic?8:1,x0=inner+(1.8-inner)*band/steps;
    const x1=inner+(1.8-inner)*(band+1)/steps;
    const points=[point(z0,top,x0),point(z0,top,x1),point(z1,top,x1),point(z1,top,x0)];
    if(top)points.reverse();
    // Char reflects completed triangles; Classic reverses station rings.
    if(classic&&side<0)points.reverse();
    const faces=auxiliaryQuad(template,`${group}_${top?'crown':'fold'}`,row*8+band,points,side);
    // auxiliaryFace makes X outward; retain only true roof/up or
    // underside/down faces, not a back-facing fold reflected into armor.
    out.push(...faces.filter(face=>{
      const[a,b,c]=face.verts,ny=(b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2]);
      return top?ny>0:ny<0;
    }));
  }
  return out;
}
function leclercFront(template:ArmorPlate,side:number,classic:boolean):ArmorPlate[] {
  const out:ArmorPlate[]=[],id=classic?'leclerc_classic_x':'leclerc_x';
  const spans:readonly Span[]=classic?[[1.298949,1.995990],[2.045418,2.601897],[2.648623,3.44716]]:
    [[1.245,1.9130917],[1.960467,2.4938338],[2.5386198,3.303991]];
  const classicRows=[[1.524253,1.513117,.715028,.715028],[1.512233,1.449739,.715028,.716776],[1.441197,1.30968,.716990,.72099]];
  const inner=classic?1.650179:1.6489669;
  spans.forEach(([a,b],i)=>{
    const stations=classic?[a,b]:Array.from({length:25},(_,n)=>a+(b-a)*n/24);
    if(!classic&&i===1)stations.push(2.1447914,2.1519151);
    if(!classic&&i===2)stations.push(3.221041);
    stations.sort((x,y)=>x-y);
    for(let j=0;j<stations.length-1;j++){
      const point=(z:number,top:boolean,x=1.8):AuxPoint=>{
        const t=(z-a)/(b-a),r=classicRows[i];
        const widthT=(x-inner)/(1.8-inner);
        const y=classic?(top?r[0]+(r[1]-r[0])*t-.02985*widthT:r[2]+(r[3]-r[2])*t+.284853*widthT):
          top?charCrown(i,z,x):charFloor(i,z,x);
        return[side*x,y,z];
      };
      const z0=stations[j],z1=stations[j+1];
      out.push(...auxiliaryQuad(template,`${id}_${side}_front_${i}`,j,
        [point(z0,false),point(z0,true),point(z1,true),point(z1,false)],side));
      out.push(...leclercFolds(template,side,classic,`${id}_${side}_front_${i}`,j,inner,z0,z1,point));
    }
  });
  return out;
}
function charToe(template:ArmorPlate,side:number):ArmorPlate[] {
  const x=1.8,back=3.303991,tip=3.3410528;
  const lowerA=(z:number)=>(.2231951*x+.9669226*z-3.4774219100)/.1234689;
  const lowerB=(z:number)=>(.0025862*x+.9977933*z-3.2551161574)/.0663463;
  const upperA=(z:number)=>(1.7727332998+.0045779*x-.1642679*z)/.9864051;
  const upperB=(z:number)=>(1.5829695150+.0386588*x-.1222973*z)/.9917403;
  const crease=(a:(z:number)=>number,b:(z:number)=>number)=>{
    const d=a(back)-b(back),slope=a(back+1)-b(back+1)-d;
    return Math.max(back+.00001,Math.min(tip-.00001,back-d/slope));
  };
  const lower=crease(lowerA,lowerB),upper=crease(upperA,upperB);
  const points:AuxPoint[]=[[side*x,charFloor(2,back),back],[side*x,charCrown(2,back),back],
    [side*x,charCrown(2,upper),upper],[side*x,charCrown(2,tip),tip],
    [side*x,Math.max(lowerA(lower),lowerB(lower)),lower]];
  return [[0,1,2],[0,2,4],[2,3,4]].map((indices,i)=>auxiliaryFace(template,
    `leclerc_x_${side}_toe`,i,indices.map(n=>points[n]),side));
}
function type90(template:ArmorPlate,side:number):ArmorPlate[] {
  const x=side*1.786824,out:ArmorPlate[]=[];
  const rear=[[-3.5,1.103646],[-3,1.103646],[-2.54,.694]];
  for(let i=0;i<rear.length-1;i++)out.push(auxiliaryFace(template,`type90_x_${side}_rear`,i,
    [[x,rear[i][1],rear[i][0]],[x,1.377,rear[i][0]],[x,1.377,rear[i+1][0]],[x,rear[i+1][1],rear[i+1][0]]],side));
  for(const[i,[a,b,low]]of [[-2.54,-1.60,.694],[-1.60,-.56,.694],[-.56,.49,.694],
    [.49,1.55,.694],[1.55,2.57,.694],[2.57,3.40,.8456]].entries())
    out.push(auxiliaryRectangle(template,`type90_x_${side}_${i}`,x,a+.007,b-.007,low,1.377));
  return out;
}
function amxLower(z:number):number {
  if(z< -2.7634)return .7561+(-2.7634-z)*1.006;
  if(z>2.7748)return .7577+(z-2.7748)*1.2256;
  return .7561+(z+2.7634)*.000289;
}
function amxPoint(side:number,rear:boolean,z:number,band:number):AuxPoint {
  const floor=amxLower(z),top=1.2901;
  const fold=Math.max(floor+.0005,Math.min(top-.0005,(.014696+.00268174*z)/.00963499));
  const y=[floor,fold,top][band];
  const x=rear?Math.max(1.643014+.00005944*y+.00081759*z,1.657710-.00957555*y+.00349933*z):1.6805;
  return[side<0?-x+.0025:x,y,z];
}
function amx40(template:ArmorPlate,side:number):ArmorPlate[] {
  const out:ArmorPlate[]=[];
  for(const rear of[true,false]){
    const zs=rear?[-3.29,-2.7634,-2.2,-1.5,-.846]:[-.846,0,1.5,2.7595,2.7748,3.188];
    for(let i=0;i<zs.length-1;i++)for(let band=0;band<2;band++){
      const points=[amxPoint(side,rear,zs[i],band),amxPoint(side,rear,zs[i],band+1),
        amxPoint(side,rear,zs[i+1],band+1),amxPoint(side,rear,zs[i+1],band)];
      if(side<0)points.reverse(); // Match the reflected native ruled-cell diagonal.
      out.push(...auxiliaryQuad(template,`amx40_x_${side}_${rear?'rear':'front'}`,i*2+band,points,side));
    }
  }
  return out;
}
function replacements(id:string,template:ArmorPlate,side:number):ArmorPlate[] {
  if(id==='leclerc_x'||id==='leclerc_classic_x')return exposedAuxiliaryCourse(
    [...leclercRear(template,side,id==='leclerc_classic_x'),...leclercFront(template,side,id==='leclerc_classic_x'),
      ...(id==='leclerc_x'?charToe(template,side):[])],side,`${id}_${side}_installed_course`);
  if(id==='type90_x')return type90(template,side);
  if(id==='amx40_x')return exposedAuxiliaryCourse(amx40(template,side),side,`${id}_${side}_installed_course`);
  if(id==='type10_x')return exposedAuxiliaryCourse([...type10AuxiliarySkirts(template,side),
    auxiliaryRectangle(template,`type10_x_${side}_fascia`,side*1.574517,-2.4807,3.5897,.7593,1.222),
    auxiliaryRectangle(template,`type10_x_${side}_rear_fascia`,side*1.574517,-3.44004,-2.4807,.75772,1.16422)],
    side,`type10_x_${side}_installed_course`);
  // K1's real panels already own calibrated hull cells. AMX30's supplied
  // vehicle has open road gear, not the donor's full-length hanging skirts.
  return [];
}
export function applySourceXOtherAuxArmor(spec:FleetTankSpec,id:string):void {
  if(!IDS.has(id))return;
  const old=spec.armor.hullPlates.filter(p=>p.kind==='spaced'&&/^skirt_[RL]$/.test(p.name)&&!p.era&&!p.gunFollow);
  if(!old.length)return; // Repeated startup application is an identity no-op.
  spec.armor.hullPlates=spec.armor.hullPlates.filter(p=>!old.includes(p));
  for(const template of old){
    const side=template.name.endsWith('_L')?-1:1;
    spec.armor.hullPlates.push(...memoizedAuxiliaryShapes(`${id}/${side}`,template,()=>replacements(id,template,side)));
  }
}
