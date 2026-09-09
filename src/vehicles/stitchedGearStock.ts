import * as THREE from 'three';

export type StitchedGearStation = readonly [radiusM:number, axleXM:number, segments:number];
type Ring = { start:number; count:number };
export type GearAngularStations = (radiusM:number, axleXM:number, segments:number)=>readonly number[];
type AngularRing = Ring & { fractions?:readonly number[] };

function stitch(a:Ring,b:Ring,indices:number[]):void {
  if(a.count===1){for(let j=0;j<b.count;j++)indices.push(a.start,b.start+(j+1)%b.count,b.start+j);return;}
  if(b.count===1){for(let i=0;i<a.count;i++)indices.push(a.start+i,a.start+(i+1)%a.count,b.start);return;}
  let i=0,j=0;
  while(i<a.count||j<b.count){
    const av=a.start+i%a.count,bv=b.start+j%b.count;
    const nextA=(i+1)*b.count,nextB=(j+1)*a.count;
    if(nextA<=nextB){indices.push(av,a.start+(i+1)%a.count,bv);i++;}
    if(nextB<=nextA){indices.push(a.start+i%a.count,b.start+(j+1)%b.count,bv);j++;}
  }
}

function stitchAngular(a:AngularRing,b:AngularRing,indices:number[]):void {
  if(a.count===1||b.count===1){stitch(a,b,indices);return;}
  // Start immediately before the shared angular origin. Each event consumes
  // exactly one real ring edge, including its cyclic closing edge. Different
  // rings need not begin at the same angle or have equal angular spacing.
  let i=0,j=0;
  while(i<a.count||j<b.count){
    const av=a.start+(i+a.count-1)%a.count,bv=b.start+(j+b.count-1)%b.count;
    const nextA=i<a.count?a.fractions![i]:Infinity,nextB=j<b.count?b.fractions![j]:Infinity;
    if(nextA<=nextB){indices.push(av,a.start+i,bv);i++;}
    if(nextB<=nextA){indices.push(a.start+(i+a.count-1)%a.count,b.start+j,bv);j++;}
  }
}

function angularFractions(r:number,x:number,n:number,source:GearAngularStations):readonly number[] {
  if(r===0)return[0];
  const values=source(r,x,n);
  if(values.length!==n||values.some((v,i)=>!Number.isFinite(v)||v<0||v>=1||(i>0&&v<=values[i-1])))
    throw new RangeError('Gear angular stations require a strictly increasing full-cycle fraction list');
  return values;
}

/** Closed radial stock with independently chosen angular density per section.
 * Integer angular ordering stitches every shared edge, including transitions;
 * it introduces neither T junctions nor artificially inset section seams.
 * The axial function expresses a physical pressing, not a camera/LOD offset. */
export function stitchedGearStock(
  stations:readonly StitchedGearStation[],
  axial:(radius:number,axle:number,angle:number)=>number=(r,x)=>x,
  side:1|-1=1,
  angularStations?:GearAngularStations,
):THREE.BufferGeometry {
  if(stations.length<3||stations[0][0]!==0||stations.at(-1)?.[0]!==0
    ||stations.some(([r,x,n])=>!Number.isFinite(r)||!Number.isFinite(x)||r<0
      ||!Number.isInteger(n)||n<4||n>128)||Math.abs(side)!==1)
    throw new RangeError('Stitched gear stock requires finite closed axis sections');
  return stitchedSurface(stations,axial,side,false,angularStations);
}

/** Closed annular stock. The cyclic profile has no duplicated last ring;
 * angular transitions are stitched just like the axis-ended pressing. */
export function stitchedGearAnnulus(stations:readonly StitchedGearStation[],side:1|-1=1):THREE.BufferGeometry {
  if(stations.length<3||stations.some(([r,x,n])=>!Number.isFinite(r)||!Number.isFinite(x)||r<=0
    ||!Number.isInteger(n)||n<4||n>128)||Math.abs(side)!==1)
    throw new RangeError('Stitched gear annulus requires finite positive cyclic sections');
  return stitchedSurface(stations,(r,x)=>x,side,true);
}

function stitchedSurface(stations:readonly StitchedGearStation[],
  axial:(radius:number,axle:number,angle:number)=>number,side:1|-1,cyclic:boolean,
  angularStations?:GearAngularStations):THREE.BufferGeometry {
  const positions:number[]=[],uv:number[]=[],indices:number[]=[],rings:AngularRing[]=[];
  for(const [row,[r,x,segments]] of stations.entries()){
    const count=r===0?1:segments,fractions=angularStations?angularFractions(r,x,segments,angularStations):undefined;
    const start=positions.length/3;rings.push(fractions?{start,count,fractions}:{start,count});
    for(let i=0;i<count;i++){
      // Keep the exact old arithmetic order when there is no angular opt-in.
      const angle=angularStations?-fractions![i]*Math.PI*2:-i*Math.PI*2/count,actualX=axial(r,x,angle);
      if(!Number.isFinite(actualX))throw new RangeError('Nonfinite gear pressing');
      positions.push(actualX,r*Math.sin(angle),r*Math.cos(angle));
      uv.push(i/count,row/(stations.length-1));
    }
  }
  for(let row=1;row<rings.length;row++){
    if(angularStations)stitchAngular(rings[row-1],rings[row],indices);
    else stitch(rings[row-1],rings[row],indices);
  }
  if(cyclic)stitch(rings.at(-1)!,rings[0],indices);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();
  if(side<0)g.rotateY(Math.PI);return g;
}

