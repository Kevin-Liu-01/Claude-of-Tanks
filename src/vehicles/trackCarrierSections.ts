export interface TrackCarrierWidthStation {z:number;widthM:number;}
type CoursePoint=[number,number];

export function validateCarrierSections(stations:readonly TrackCarrierWidthStation[],fullWidth:number):void {
  let previous=-Infinity;
  if(stations.length<2)throw new RangeError('Carrier taper needs at least two stations');
  for(const {z,widthM} of stations) {
    if(!Number.isFinite(z)||z<=previous||!Number.isFinite(widthM)||widthM<=0||widthM>fullWidth)
      throw new RangeError('Invalid carrier width station');
    previous=z;
  }
}

export function carrierWidthAt(z:number,stations:readonly TrackCarrierWidthStation[]):number {
  if(z<=stations[0].z)return stations[0].widthM;
  for(let i=1;i<stations.length;i++) {
    const a=stations[i-1],b=stations[i];
    if(z<=b.z)return a.widthM+(b.widthM-a.widthM)*(z-a.z)/(b.z-a.z);
  }
  return stations[stations.length-1].widthM;
}

/** Insert collinear width-transition sections into the one native course.
 * This prevents a long tangent span spreading a tooth recess over the
 * return-roller lane. No extra disconnected cover and no second shoe loop. */
export function splitCarrierSections(points:CoursePoint[],stations:readonly TrackCarrierWidthStation[]):void {
  const output:CoursePoint[]=[];
  for(let i=0;i<points.length;i++) {
    const a=points[i],b=points[(i+1)%points.length];output.push(a);
    const cuts=stations.map(s=>s.z).filter(z=>z>Math.min(a[0],b[0])+1e-7&&z<Math.max(a[0],b[0])-1e-7)
      .sort((x,y)=>b[0]>a[0]?x-y:y-x);
    for(const z of cuts)output.push([z,a[1]+(b[1]-a[1])*(z-a[0])/(b[0]-a[0])]);
  }
  points.splice(0,points.length,...output);
}
