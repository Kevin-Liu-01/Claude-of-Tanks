import * as THREE from 'three';

export function jagdpanzerFixedCollar():THREE.BufferGeometry {
  // The fixed housing is an oblique eight-corner plate with a circular
  // trunnion opening, not another forward-pointing conical gun bell.
  const shape=new THREE.Shape(),cx=-.0048,cy=2.39373,halfW=.80532,halfH=.62717;
  const corners=[[-halfW,-halfH+.087],[-halfW+.109,-halfH],[halfW-.109,-halfH],
    [halfW,-halfH+.087],[halfW,halfH-.087],[halfW-.109,halfH],
    [-halfW+.109,halfH],[-halfW,halfH-.087]];
  corners.forEach(([x,y],i)=>i?shape.lineTo(cx+x,cy+y):shape.moveTo(cx+x,cy+y));
  shape.closePath();
  const hole=new THREE.Path();
  hole.absellipse(.0016,2.38656,.6365,.489,.0,Math.PI*2,true,0);
  shape.holes.push(hole);
  const g=new THREE.ExtrudeGeometry(shape,{depth:.127214,bevelEnabled:false,curveSegments:24});
  const p=g.attributes.position;
  for(let i=0;i<p.count;i++) {
    const front=(1.212762-.506720064*p.getY(i))/.862110652;
    p.setZ(i,front-.127214+p.getZ(i));
  }
  g.computeVertexNormals();return g;
}

export function jagdpanzerBearingDome():THREE.BufferGeometry {
  // The source's permanent ball seat is a closed ellipsoidal hemisphere
  // ahead of the inclined mounting plate. It is not empty when the separate
  // pitching bell moves away; only that moving bell has the rear cavity.
  const profile=[new THREE.Vector2(0,0),new THREE.Vector2(1,0)];
  for(let i=1;i<=24;i++) {
    const a=i*Math.PI/48;
    profile.push(new THREE.Vector2(Math.cos(a),Math.sin(a)));
  }
  return new THREE.LatheGeometry(profile,48).scale(.6365,.46655,.565)
    .rotateX(Math.PI/2-.53135).translate(.0016,2.38656,.00371);
}

// Scalar casting stations measured on the complete source gun. The back of
// the bell is a slant-cut cavity, not the first draft's solid vertical cap.
const PROFILE=[
  [.050,.552,.566],[.124,.610,.605],[.32,.505,.483],[.64,.391,.389],
  [.78,.3543,.3407],[1,.3079,.303],[1.28,.2796,.2796],
  [1.50,.2684,.2684],[1.55465,.24664,.24664],
] as const;
function radii(z:number):[number,number] {
  let k=1;while(k<PROFILE.length-1&&PROFILE[k][0]<z)k++;
  const a=PROFILE[k-1],b=PROFILE[k],t=Math.max(0,Math.min(1,(z-a[0])/(b[0]-a[0])));
  return[a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
}
function rearCut(angle:number):number {
  let low=.050,high=.38;
  for(let i=0;i<22;i++) {
    const z=(low+high)/2,y=2.3351+Math.sin(angle)*radii(z)[1];
    if(y+1.86*z>=2.4385)high=z;else low=z;
  }
  return high;
}

export function jagdpanzerBell():THREE.BufferGeometry {
  const rings:number[][][]=[],inner:number[][][]=[],count=48,steps=20;
  for(let j=0;j<=steps;j++) {
    const t=j/steps,outerRow:number[][]=[],innerRow:number[][]=[];
    for(let i=0;i<count;i++) {
      const a=i*Math.PI*2/count,back=rearCut(a),z=back+(1.55465-back)*t;
      const [rx,ry]=radii(z),[brx,bry]=radii(back);
      outerRow.push([Math.cos(a)*rx,Math.sin(a)*ry+2.3351-2.33805,z-.20]);
      const cavityZ=back+(.878-back)*t;
      innerRow.push([Math.cos(a)*((brx-.043)*(1-t)+.082*t),
        Math.sin(a)*((bry-.043)*(1-t)+.082*t)+2.3351-2.33805,cavityZ-.20]);
    }
    rings.push(outerRow);inner.push(innerRow);
  }
  const positions:number[]=[];
  const tri=(a:number[],b:number[],c:number[])=>positions.push(...a,...b,...c);
  for(let j=0;j<steps;j++)for(let i=0;i<count;i++) {
    const n=(i+1)%count;
    tri(rings[j][i],rings[j][n],rings[j+1][n]);tri(rings[j][i],rings[j+1][n],rings[j+1][i]);
    tri(inner[j][i],inner[j+1][n],inner[j][n]);tri(inner[j][i],inner[j+1][i],inner[j+1][n]);
  }
  for(let i=0;i<count;i++) {
    const n=(i+1)%count;
    tri(rings[0][i],inner[0][n],rings[0][n]);tri(rings[0][i],inner[0][i],inner[0][n]);
    tri(rings[steps][i],rings[steps][n],[0,2.3351-2.33805,1.55465-.20]);
    tri(inner[steps][n],inner[steps][i],[0,2.3351-2.33805,.878-.20]);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  const uv:number[]=[];for(let i=0;i<positions.length;i+=3)uv.push(positions[i],positions[i+2]);
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();return g;
}
