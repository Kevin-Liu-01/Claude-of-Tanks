// Instructional captures only. Coordinates are world metres; all imagery is rendered by Studio.
export const FIELD_GUIDE_SCENES = [
  {id:'maps',camera:{pos:[180,240,220],lookAt:[0,0,0],groundRel:false,fov:48}},
  {id:'dossier',offset:[8,5,9],aim:[0,1.2,0],fov:38},
  {id:'equipment',offset:[-8,6,10],aim:[0,1.3,0],fov:39},
  {id:'performance',offset:[11,4,1],aim:[0,1.1,0],fov:46},
  {id:'special',offset:[6,8,6],aim:[0,1.5,0],fov:38},
  {id:'armament',offset:[11,3,3],aim:[0,1.6,1],fov:43,gunDeg:-5},
  {id:'protection',offset:[7,5,10],aim:[0,1.2,0],fov:38,overlay:'armor'},
  {id:'modules',offset:[10,8,1],aim:[0,1,0],fov:40,overlay:'modules'},
  {id:'crew',offset:[8,10,5],aim:[0,1.2,0],fov:36,overlay:'crew'},
  {id:'ammunition',offset:[10,5,10],aim:[0,1.3,2],fov:45,fire:true},
  {id:'camo',offset:[17,11,25],aim:[-3,1,-2],fov:44},
  {id:'smoke',offset:[25,18,21],aim:[-1,1,10],fov:47,smoke:6},
  {id:'smoke-launch',offset:[25,18,21],aim:[-1,1,10],fov:47,smoke:.65},
];

/** Called only inside the authoring browser; never imported by game boot. */
export async function stageFieldGuide(job) {
  const S=window.__STUDIO,D=window.__DEBUG;
  if(!S?.active||!D)throw new Error('Field guide capture requires Studio and explicit debug intent');
  window.__fieldGuideOverlay?.clear();window.__fieldGuideOverlay=null;
  const scene={map:'verdant',seed:5126,timeOfDay:'day',actors:[{id:'m1a2_x',name:'hero',pos:[-56,-14],facingDeg:0,turretDeg:-12,gunDeg:job.gunDeg??0,camo:'summer',camoSeed:261}],effects:job.fire?[{type:'fire',actor:'hero',tMs:100,params:{slot:0,tracer:true,recoil:true}}]:[],fxTime:job.fire?155:0,timeScale:0};
  await S.load(scene);
  D.post.pinDynScale?.(1);
  const {awaitMapCaptureReadiness}=await import('/src/dev/mapCaptureReadiness.ts');
  const textures=await awaitMapCaptureReadiness(D.world,()=>D.world);
  const a=S._internal.findActor('hero');
  const y=D.world.heightField.getHeightAt(-56,-14);
  const camera=job.camera??{pos:[-56+job.offset[0],y+job.offset[1],-14+job.offset[2]],lookAt:[-56+job.aim[0],y+job.aim[1],-14+job.aim[2]],groundRel:false,fov:job.fov};
  S.setCamera(camera);
  let overlayCount=0;
  if(job.overlay){const {createInspectionOverlay}=await import('/src/gallery/overlays.ts');window.__fieldGuideOverlay=createInspectionOverlay(a.spec,a.visual,job.overlay);overlayCount=window.__fieldGuideOverlay.count;}
  let smoke=null;
  if(job.smoke){
    const {requestAuxiliary}=await import('/src/sim/auxiliarySystems.ts');
    const entity={id:a.uid,spec:a.spec,state:a.state,combat:{}};
    D.fx.resetAll();D.fx.resetSeed(5126);D.game.timeS=0;
    if(!requestAuxiliary(entity,'smoke',0,(x,z)=>D.world.heightField.getHeightAt(x,z)))throw new Error('No smoke launch');
    smoke=entity.combat.auxiliary.smoke;
    D.bus.emit('auxiliary:smokeScreens',{screens:[smoke]});D.fx.setFrozen(false);
    for(let i=0;i<=Math.round(job.smoke*60);i++){D.game.timeS=i/60;D.fx.update(1/60,[],D.camera);}
    D.fx.setFrozen(true);
  }
  // Projection uses the export aspect, not Studio's split workspace viewport.
  const oldAspect=D.camera.aspect;D.camera.aspect=1600/900;D.camera.updateProjectionMatrix();D.camera.updateMatrixWorld(true);
  const {Vector3}=await import('three');
  const project=p=>{const v=new Vector3(...p).project(D.camera);return [+(50+v.x*50).toFixed(2),+(50-v.y*50).toFixed(2)];};
  const arcs=[];
  if(smoke){const {smokeCanisterPosition}=await import('/src/sim/smokeBallistics.ts');for(const index of [0,smoke.canisters.length-1]){const shot=smoke.canisters[index],v=new Vector3();arcs.push(Array.from({length:17},(_,i)=>{smokeCanisterPosition(shot,shot[6]*i/16,v);return project(v.toArray());}));}}
  D.camera.aspect=oldAspect;D.camera.updateProjectionMatrix();
  return {scene,camera,textures,overlay:job.overlay??null,overlayCount,smoke,arcs,vehicle:{id:a.spec.id,name:a.spec.name},map:'Verdant Fields'};
}
