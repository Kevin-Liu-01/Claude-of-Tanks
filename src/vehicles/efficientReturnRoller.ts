import * as THREE from 'three';

export interface EfficientReturnRollerOptions {
  quality: 'high' | 'low';
  radiusM: number;
  axialWidthM: number;
  spindleRadiusM: number;
  spindleLengthM: number;
}

/** Local X is the axle. Rotor materials are [rubber, painted wheel metal].
 * The complete rotor is ONE closed solid: its material groups are not
 * independent open shells. The caller owns both buffers and shaft placement.
 * This authoring leaf does not register a profile or choose wheel stations. */
export function efficientReturnRoller(options: EfficientReturnRollerOptions): {
  rotor: THREE.BufferGeometry;
  spindle: THREE.BufferGeometry;
} {
  const {quality,radiusM,axialWidthM,spindleRadiusM,spindleLengthM}=options;
  if(quality!=='high'&&quality!=='low')throw new RangeError('Invalid return-roller quality');
  for(const value of[radiusM,axialWidthM,spindleRadiusM,spindleLengthM])
    if(!Number.isFinite(value)||value<=0)throw new RangeError('Return-roller dimensions must be positive and finite');
  if(spindleRadiusM>=radiusM*.5)throw new RangeError('Spindle must fit inside the roller crown');
  const hubSegments=quality==='high'?8:4;
  const crownSegments=hubSegments*3;
  const spindleSegments=quality==='high'?8:4;
  const half=axialWidthM/2,crownHalf=half*.50/.69;
  // A raised hub remains wide enough to receive the finite spindle, unlike
  // an infinitely thin disk or a painted cap hiding an empty wheel center.
  // The finite entry polygon must contain the stationary shaft through a
  // full relative revolution. Circumradius alone does not establish this:
  // a four-sector LOW hub's inradius is only cos(pi/4) times its radius.
  const hubRadius=Math.max(radiusM*.30,spindleRadiusM*1.05/Math.cos(Math.PI/hubSegments));
  const xs=[-half,-crownHalf,crownHalf,half];
  const rs=[hubRadius,radiusM,radiusM,hubRadius];
  const positions:number[]=[],indices:number[]=[],uvs:number[]=[];
  const segments=[hubSegments,crownSegments,crownSegments,hubSegments],starts:number[]=[];
  for(let ring=0;ring<4;ring++){
    starts.push(positions.length/3);
    for(let i=0;i<segments[ring]!;i++){
      const angle=i*Math.PI*2/segments[ring]!;
      positions.push(xs[ring]!,Math.cos(angle)*rs[ring]!,Math.sin(angle)*rs[ring]!);
    }
  }
  const rotor=new THREE.BufferGeometry();
  // Dense contact crown, sparse hubs: LOW's twelve crown sectors keep
  // worst rotating tangent separation below 6 mm without enlarging stock.
  for(let i=0;i<crownSegments;i++){
    const j=(i+1)%crownSegments,a=starts[1]!+i,b=starts[1]!+j;
    indices.push(a,starts[2]!+j,starts[2]!+i,a,b,starts[2]!+j);
  }
  rotor.addGroup(0,indices.length,0);
  const paintedStart=indices.length;
  for(const [hub,crown,reverse] of [[0,1,false],[3,2,true]] as const){
    for(let i=0;i<hubSegments;i++){
      const a=starts[hub]!+i,b=starts[hub]!+(i+1)%hubSegments;
      const c=(k:number)=>starts[crown]!+(i*3+k)%crownSegments;
      const face=(u:number,v:number,w:number)=>{if(reverse)indices.push(u,w,v);else indices.push(u,v,w);};
      for(let k=1;k<=3;k++)face(a,c(k),c(k-1));
      face(a,b,c(3));
    }
  }
  for(const end of[0,3]){
    const center=positions.length/3;positions.push(xs[end]!,0,0);
    for(let i=0;i<hubSegments;i++){
      const a=starts[end]!+i,b=starts[end]!+(i+1)%hubSegments;
      if(end===0)indices.push(center,b,a);else indices.push(center,a,b);
    }
  }
  rotor.addGroup(paintedStart,indices.length-paintedStart,1);
  // Axle-normal projection is non-degenerate on every painted shoulder/hub
  // triangle. Rubber alone has no texture and does not use the collapsed
  // axial crown projection. Never leave painted stock with implicit UV=0.
  for(let i=0;i<positions.length;i+=3)
    uvs.push(.5+positions[i+1]!/(2*radiusM),.5+positions[i+2]!/(2*radiusM));
  rotor.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  rotor.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  rotor.setIndex(indices);rotor.computeVertexNormals();
  rotor.computeBoundingBox();rotor.computeBoundingSphere();
  rotor.name='efficientReturnRollerRotor';
  const spindle=new THREE.CylinderGeometry(spindleRadiusM,spindleRadiusM,spindleLengthM,spindleSegments,1,false);
  spindle.rotateZ(Math.PI/2);spindle.computeBoundingBox();spindle.computeBoundingSphere();
  spindle.name='efficientReturnRollerSpindle';
  return {rotor,spindle};
}
