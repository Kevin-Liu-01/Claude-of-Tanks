// Kevin B. Liu — finite-surface regression for articulated gun assemblies.
// Project each real moving triangle onto the finite upward hull faces. This
// catches crossings between vertices, including the aft hatch at oblique yaw.
import {Matrix4,Vector3} from 'three';

function triangles(group,frame){
  const result=[],inverse=frame.matrixWorld.clone().invert();
  group.traverse(mesh=>{
    if(!mesh.isMesh||mesh.userData.shadowOnly||mesh.userData.authoredShadowProxy)return;
    let recoil=false;
    for(let owner=mesh;owner;owner=owner.parent){
      if(!owner.visible)return;
      if(owner.name==='rig_recoil')recoil=true;
    }
    const pos=mesh.geometry.attributes.position,index=mesh.geometry.index;
    const matrix=new Matrix4().multiplyMatrices(inverse,mesh.matrixWorld);
    const vertices=Array.from({length:pos.count},(_,i)=>new Vector3().fromBufferAttribute(pos,i).applyMatrix4(matrix).toArray());
    const {start,count}=mesh.geometry.drawRange;
    for(let i=start;i<Math.min(index?.count??pos.count,start+count);i+=3)
      result.push({name:mesh.name,recoil,v:[0,1,2].map(k=>vertices[index?index.getX(i+k):i+k])});
  });
  return result;
}
const bounds=v=>[Math.min(...v.map(p=>p[0])),Math.max(...v.map(p=>p[0])),Math.min(...v.map(p=>p[2])),Math.max(...v.map(p=>p[2]))];
function clip(poly,n,d){
  const out=[];
  for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length];
    const da=a[0]*n[0]+a[2]*n[2]-d,db=b[0]*n[0]+b[2]*n[2]-d;
    if(da<=1e-10)out.push(a);
    if((da<=1e-10)!==(db<=1e-10)){
      const t=da/(da-db);out.push(a.map((value,k)=>value+(b[k]-value)*t));
    }
  }
  return out;
}

export function measureGunHullClearance(tank,{
  minimumHullY=0, movingFilter=null, fixedFilter=null, yawDegrees, pitchDegrees,
  recoilDistances, pivotOverride=null,
}){
  const root=tank.root,turret=root.getObjectByName('rig_turret'),gun=root.getObjectByName('rig_gun');
  turret.rotation.y=0;gun.rotation.x=0;root.getObjectByName('rig_recoil').position.z=0;root.updateMatrixWorld(true);
  const moving=triangles(gun,gun).filter(t=>!movingFilter||movingFilter(t)),grid=new Map(),cell=.2;
  let hullMax=-Infinity;
  for(const face of triangles(root.getObjectByName('rig_hull'),root)){
    if(fixedFilter&&!fixedFilter(face))continue;
    const [a,b,c]=face.v;
    const normal=new Vector3().fromArray(b).sub(new Vector3().fromArray(a))
      .cross(new Vector3().fromArray(c).sub(new Vector3().fromArray(a)));
    face.maxY=Math.max(...face.v.map(p=>p[1]));
    if(normal.y<1e-9||face.maxY<minimumHullY)continue;
    hullMax=Math.max(hullMax,face.maxY);
    face.yA=-normal.x/normal.y;face.yB=-normal.z/normal.y;
    face.yC=a[1]-face.yA*a[0]-face.yB*a[2];face.bounds=bounds(face.v);face.planes=[];
    for(let j=0;j<3;j++){
      const a=face.v[j],b=face.v[(j+1)%3],c=face.v[(j+2)%3],n=[b[2]-a[2],0,a[0]-b[0]];
      let d=n[0]*a[0]+n[2]*a[2];
      if(n[0]*c[0]+n[2]*c[2]>d){n[0]*=-1;n[2]*=-1;d*=-1;}
      face.planes.push([n,d]);
    }
    for(let x=Math.floor(face.bounds[0]/cell);x<=Math.floor(face.bounds[1]/cell);x++)
      for(let z=Math.floor(face.bounds[2]/cell);z<=Math.floor(face.bounds[3]/cell);z++){
        const key=`${x},${z}`;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(face);
      }
  }
  const yaws=yawDegrees,pitches=pitchDegrees,recoils=recoilDistances;
  function* sampledPoses(){
    if(typeof pitches==='function'){
      for(const yaw of yaws)for(const pitch of pitches(yaw))for(const recoil of recoils)
        yield {yaw,pitch,recoil};
    }else{
      // Preserve the original iteration order and tie-breaking witnesses.
      for(const pitch of pitches)for(const recoil of recoils)for(const yaw of yaws)
        yield {yaw,pitch,recoil};
    }
  }
  const pivot=pivotOverride??gun.position.toArray();
  let minimum=Infinity,witness=null,poses=0;
  for(const {pitch,recoil,yaw} of sampledPoses()){
    poses++;
    const cp=Math.cos(pitch*Math.PI/180),sp=Math.sin(pitch*Math.PI/180),cy=Math.cos(yaw*Math.PI/180),sy=Math.sin(yaw*Math.PI/180);
    for(const triangle of moving){
      const v=triangle.v.map(([x,y,z])=>{
        z-=triangle.recoil?recoil:0;
        const py=cp*y+sp*z+pivot[1],pz=cp*z-sp*y+pivot[2],px=x+pivot[0];
        return[cy*px+sy*pz+turret.position.x,py+turret.position.y,-sy*px+cy*pz+turret.position.z];
      });
      const minY=Math.min(...v.map(p=>p[1]));if(minY-hullMax>minimum)continue;
      const b=bounds(v),seen=new Set();
      for(let x=Math.floor(b[0]/cell);x<=Math.floor(b[1]/cell);x++)for(let z=Math.floor(b[2]/cell);z<=Math.floor(b[3]/cell);z++)
        for(const face of grid.get(`${x},${z}`)??[]){
          if(seen.has(face))continue;seen.add(face);
          if(minY-face.maxY>minimum||b[0]>face.bounds[1]||b[1]<face.bounds[0]||b[2]>face.bounds[3]||b[3]<face.bounds[2])continue;
          let poly=v;for(const[n,d]of face.planes){poly=clip(poly,n,d);if(!poly.length)break;}
          for(const p of poly){
            const gap=p[1]-(face.yA*p[0]+face.yB*p[2]+face.yC);
            if(gap<minimum){minimum=gap;witness={pitch,yaw,recoil,gun:triangle.name,hull:face.name,gap};}
          }
        }
    }
  }
  return {minimum,witness,poses};
}

// Preserve the original Bradley regression's poses and low-pivot control.
export function measureBradleyGunClearance(tank,{negativeControl=false}={}){
  return measureGunHullClearance(tank,{
    minimumHullY:1.7,
    yawDegrees:negativeControl?[0,180]:[...Array.from({length:72},(_,i)=>i*5),163.55,196.45],
    pitchDegrees:negativeControl?[-9]:[-9,0,15,30,30+.014*180/Math.PI],
    recoilDistances:negativeControl?[0]:[0,.03,.06],
    pivotOverride:negativeControl?[-.06,.252,.66]:null,
  });
}
