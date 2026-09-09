import * as T from 'three';

const visible=o=>{for(let p=o;p;p=p.parent)if(!p.visible)return false;return true;};
const materials=o=>(Array.isArray(o.material)?o.material:[o.material]);
const materialDraws=m=>!!m&&m.visible!==false&&m.colorWrite!==false&&(m.opacity??1)>0;
function drawReceipt(o){
 const g=o.geometry,total=g.index?.count??g.attributes.position.count,start=g.drawRange.start;
 const end=Math.min(total,start+g.drawRange.count),mats=materials(o);
 const groups=Array.isArray(o.material)?g.groups:[{start:0,count:total,materialIndex:0}];
 let effectiveElements=0;
 for(const group of groups)if(materialDraws(mats[group.materialIndex]))
  effectiveElements+=Math.max(0,Math.min(end,group.start+group.count)-Math.max(start,group.start));
 const count=o.isInstancedMesh?o.count:1;
 return{totalElements:total,drawRange:{start,count:Number.isFinite(g.drawRange.count)?g.drawRange.count:'Infinity'},
  instanceCount:count,effectiveElements,drawable:visible(o)&&!o.userData.shadowOnly&&count>0&&effectiveElements>=3};
}
const drawable=o=>drawReceipt(o).drawable;
const hitDraws=hit=>materialDraws(materials(hit.object)[hit.face?.materialIndex??0]);
const v=new T.Vector3(),instance=new T.Matrix4(),up=new T.Vector3(0,1,0),down=new T.Vector3(0,-1,0),ray=new T.Raycaster();
function proxy(mesh,index){
 const p=new T.Mesh(mesh.geometry,mesh.material);p.matrixAutoUpdate=false;
 p.matrix.copy(mesh.matrixWorld);if(mesh.isInstancedMesh){mesh.getMatrixAt(index,instance);p.matrix.multiply(instance);}
 p.matrixWorld.copy(p.matrix);p.name=mesh.name;p.userData.sourceInstance=index;return p;
}
function gapAt(roller,axis,stocks){
 let gap=Infinity,owner=null,point=null;
 for(const x of[-.035,0,.035])for(let j=-8;j<=8;j++){
  ray.set(v.set(axis.x+x,axis.y+.3,axis.z+j*.005),down);
  const top=ray.intersectObject(roller,false).find(hitDraws);if(!top)continue;
  ray.set(top.point.clone().addScaledVector(up,1e-7),up);
  const hit=ray.intersectObjects(stocks,false).find(hitDraws);
  if(hit&&hit.distance+1e-7<gap){gap=hit.distance+1e-7;owner=hit.object.name;point={roller:top.point.toArray(),track:hit.point.toArray()};}
 }
 return{gap,owner,point};
}
/**
 * Test-only native render-state/finite-surface audit, not a GPU pixel capture.
 * State and driver belong to the caller's actual constructed tank. Results
 * report a sampled support-gap MAXIMUM, never a nonpenetration minimum.
 * Keep the fixed 6 mm gate and the shoe-only counterfactual distinct.
 */
export function auditVisibleReturnRollerContact(tank,gear,state,{radiusM,distancesM=[15,75,200]}){
 if(!Number.isFinite(radiusM)||radiusM<=0||!distancesM.length||distancesM.some(d=>!Number.isFinite(d)||d<=0))
  throw new RangeError('Contact audit requires a positive actual radius and nonempty finite distances');
 const rows=[];
 tank.root.updateMatrixWorld(true);const hull=tank.root.getObjectByName('rig_hull'),receipt=hull.userData.runningGearReceipts[0];
 const tires=hull.getObjectByName('gearReturnRollerTires'),camera=new T.PerspectiveCamera(50,1,.01,1000);
 if(!tires?.isInstancedMesh||!drawable(tires))throw new Error('Contact requires submitted physical roller instances');
 const p=tires.geometry.attributes.position;let actualRadius=0;
 for(let i=0;i<p.count;i++)actualRadius=Math.max(actualRadius,Math.hypot(p.getY(i),p.getZ(i)));
 if(Math.abs(actualRadius-radiusM)>2e-7)throw new Error('Contact phase radius must match actual roller stock');
 const scrolls=[...Array.from({length:24},(_,i)=>i*receipt.shoePitchM*4/24),radiusM*Math.PI/8,radiusM*Math.PI/12,radiusM*Math.PI/24];
 for(const distance of distancesM){
  camera.position.set(0,0,distance);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
  tank.syncFromState(state,1/60,distance);tank.root.traverse(o=>{if(o.isLOD)o.update(camera);});tank.root.updateMatrixWorld(true);
  if(!drawable(tires))throw new Error('Physical rollers must remain submitted after actual LOD selection');
  const surfaces=['gearTrackBandL','gearTrackBandR','gearTrackPads','gearTrackPadsSimplified'].map(name=>hull.getObjectByName(name));
  const eligibility=surfaces.map(o=>({name:o.name,visible:visible(o),shadowOnly:!!o.userData.shadowOnly,
   materials:materials(o).map(m=>({name:m.name,visible:m.visible,colorWrite:m.colorWrite,opacity:m.opacity,side:m.side})),...drawReceipt(o)}));
  let maximum=-Infinity,shoeOnlyMaximum=-Infinity,worst=null;
  for(const scroll of scrolls){
   gear.update(scroll,-scroll,1/60);tank.root.updateMatrixWorld(true);
   for(let i=0;i<tires.count;i++){
    const roller=proxy(tires,i),axis=new T.Vector3().setFromMatrixPosition(roller.matrixWorld),stocks=[];
    for(const mesh of surfaces)if(drawable(mesh)){
     if(!mesh.isInstancedMesh){if(Math.sign(mesh.position.x)===Math.sign(axis.x))stocks.push(proxy(mesh,0));continue;}
     for(let j=0;j<mesh.count;j++){
      mesh.getMatrixAt(j,instance);const c=new T.Vector3().setFromMatrixPosition(instance).applyMatrix4(mesh.matrixWorld);
      if(Math.sign(c.x)===Math.sign(axis.x)&&Math.abs(c.z-axis.z)<.35&&c.y>axis.y)stocks.push(proxy(mesh,j));
     }
    }
    const result=gapAt(roller,axis,stocks);
    if(result.gap>maximum){maximum=result.gap;worst={roller:i,scroll,...result};}
    if(distance<150){const shoe=gapAt(roller,axis,stocks.filter(s=>!s.name.startsWith('gearTrackBand')));shoeOnlyMaximum=Math.max(shoeOnlyMaximum,shoe.gap);}
   }
  }
  rows.push({distance,eligibility,phases:scrolls.length,maximumVisibleSupportGapM:maximum,
   shoeOnlyMaximumGapM:distance<150?shoeOnlyMaximum:null,contact:Number.isFinite(maximum)&&maximum<=.006?'PASS':'FAIL',worst});
 }
 return rows;
}
