import {Matrix4,Mesh,MeshStandardMaterial,Vector4,type Material,type Object3D} from 'three';
import {tagUnlitVehiclePixels} from './vehicleOcclusion.ts';
import {lightTune} from './lightModelCore.ts';
interface ThermalActor {
  id?:string;team?:string;networkVisible?:boolean;
  combat?:{destroyed?:boolean}|null;
  visual?:{root?:Object3D|null}|null;
  /** (fx-ir-hull-heat-229) the hull's length and its engine module (the damage model's box, in the hull's frame) */
  spec?:{dims?:{hullLengthM?:number}|null;armor?:{modules?:ReadonlyArray<{module?:string;min?:ArrayLike<number>;max?:ArrayLike<number>}>|null}|null}|null;
  /** (fx-ir-hull-heat-229) its ground speed (m/s): the running gear warms by it */
  state?:{speed?:number}|null;
}
/** (ac130-fx-228 follow-up, the coordinator: "a killed vehicle goes dark at once in thermal") a destroyed hull keeps its
 * heat and cools: its stand-in's emission falls as exp(-age / WRECK_COOL_S) from the battle (sim) time it was first
 * seen destroyed, in WRECK_HEAT_LEVELS steps, until under 1 / WRECK_HEAT_LEVELS it is the cold wreck's own material.
 * Render-only and deterministic: the age is the simulation clock's. */
export const WRECK_COOL_S = 20;
export const WRECK_HEAT_LEVELS = 12;
/** The wreck's heat share (0..1, quantised; 0 = cold) `ageS` seconds after it was destroyed. */
export function wreckHeatLevel(ageS:number):number{
  if(!(ageS>=0))return 0;
  const level=Math.round(Math.exp(-ageS/WRECK_COOL_S)*WRECK_HEAT_LEVELS);
  return level>=1?level/WRECK_HEAT_LEVELS:0;
}
/** (fx-ir-hull-heat-229, the coordinator: "close up a live hull is a flat white slab: the heat signal saturates") a hull's
 * heat map in the heat lens, in emission (the grade reads 1.55 .. 3.1 as cold .. white-hot): the engine deck and its
 * exhaust end hottest (round the damage model's engine box, up through the deck), the running gear warm by the drive
 * heat, the barrel by the gun heat, the hull sides and turret cooler. A hull small on the screen keeps the old flat
 * white-hot (HEAT_FAR): the map fades in from HEAT_NEAR_A to HEAT_NEAR_B of the screen's height along its length. */
export const HEAT_FAR = 4;
export const HEAT_HULL = 2.2;
export const HEAT_ENGINE = 4.6;
export const HEAT_ENGINE_R = 0.7;
export const HEAT_GEAR_COLD = 1.5, HEAT_GEAR_HOT = 2.8;
export const HEAT_GUN_COLD = 1.7, HEAT_GUN_HOT = 3.4;
export const HEAT_NEAR_A = 0.06, HEAT_NEAR_B = 0.13;
/** a friendly hull's share of a hostile's heat (the old 2.2 against 4) */
export const HEAT_FRIENDLY = 0.55;
/** The drive heat (0..1): the running gear warms toward |speed| / DRIVE_HOT_MPS over DRIVE_WARM_S and cools over
 * DRIVE_COOL_S — one exact exponential per frame on the simulation clock. */
export const DRIVE_HOT_MPS = 8, DRIVE_WARM_S = 25, DRIVE_COOL_S = 90;
export function driveHeatStep(heat:number,speedMps:number,dtS:number):number{
  if(!(dtS>0))return heat;
  const target=Math.min(1,Math.abs(speedMps||0)/DRIVE_HOT_MPS);
  return target+(heat-target)*Math.exp(-dtS/(target>heat?DRIVE_WARM_S:DRIVE_COOL_S));
}
/** The gun heat (0..1): each shot adds GUN_SHOT_HEAT (and more for a heavier calibre), cooling over GUN_COOL_S — in
 * closed form on the shots' own simulation times (`shell:fired`'s timeS). */
export const GUN_SHOT_HEAT = 0.12, GUN_SHOT_CALIBRE_HEAT = 0.25, GUN_COOL_S = 40;
export function gunShotHeat(caliberMm:number):number{
  return GUN_SHOT_HEAT+GUN_SHOT_CALIBRE_HEAT*Math.min(1,Math.max(0,((caliberMm||0)-30)/122));
}
export function gunHeatAt(heat:number,shotAtS:number,timeS:number):number{
  const age=timeS-shotAtS;
  return age>=0?heat*Math.exp(-age/GUN_COOL_S):0;
}
/** A mesh's part in the heat map: 0 the hull and turret, 1 the running gear, 2 the gun (its recoiling barrel). */
const GEAR_NAME=/gear|track|wheel|sprocket|idler|roller|bogie|suspension|tire|tyre/i;
/** the hull's own plates over the running gear (track guards, fenders, skirts) and the fittings stowed on it */
const HULL_OVER_GEAR=/guard|fender|skirt|mudflap/i;
export function heatPartOf(mesh:Object3D,root:Object3D):number{
  let gear=false,hull=false;
  for(let o:Object3D|null=mesh;o&&o!==root;o=o.parent){
    const n=o.name||'';
    if(n==='rig_gun'||n==='rig_recoil'||n==='rig_muzzle')return 2;
    if(n==='rig_turret'||n.startsWith('fitting')||HULL_OVER_GEAR.test(n))hull=true;
    if(GEAR_NAME.test(n))gear=true;
  }
  return gear&&!hull?1:0;
}
const f=(v:number):string=>v.toFixed(3);
const HEAT_VERTEX_PARS=`uniform mat4 uHeatInv;
uniform vec4 uHeatK;
varying vec3 vHeatP;
varying float vHeatNear;`;
const HEAT_VERTEX=`
  {
    vec4 heatW = vec4( transformed, 1.0 );
    #ifdef USE_BATCHING
      heatW = batchingMatrix * heatW;
    #endif
    #ifdef USE_INSTANCING
      heatW = instanceMatrix * heatW;
    #endif
    vHeatP = ( uHeatInv * modelMatrix * heatW ).xyz;
    // the hull's length on the screen (a share of its height): the map fades in as the hull grows
    float heatSpan = 0.5 * projectionMatrix[ 1 ][ 1 ] * uHeatK.w / max( -mvPosition.z, 1.0 );
    vHeatNear = smoothstep( ${f(HEAT_NEAR_A)}, ${f(HEAT_NEAR_B)}, heatSpan );
  }`;
const HEAT_FRAGMENT_PARS=`uniform vec4 uHeatEng0;
uniform vec4 uHeatEng1;
uniform vec4 uHeatK;
uniform float uHeatPart;
varying vec3 vHeatP;
varying float vHeatNear;
float cotHeatEmission() {
  float e;
  if ( uHeatPart > 1.5 ) e = ${f(HEAT_GUN_COLD)} + ${f(HEAT_GUN_HOT)} * uHeatK.y;
  else if ( uHeatPart > 0.5 ) e = ${f(HEAT_GEAR_COLD)} + ${f(HEAT_GEAR_HOT)} * uHeatK.x;
  else {
    // round the engine box in plan, up through the deck above it (to 0.6 m over its top), cooling below it
    vec3 c = 0.5 * ( uHeatEng0.xyz + uHeatEng1.xyz ), h = 0.5 * ( uHeatEng1.xyz - uHeatEng0.xyz );
    vec2 dxz = max( abs( vHeatP.xz - c.xz ) - h.xz, 0.0 );
    float dy = max( uHeatEng0.y - vHeatP.y, 0.0 ) + max( vHeatP.y - uHeatEng1.y - 0.6, 0.0 );
    e = ${f(HEAT_HULL)} + ${f(HEAT_ENGINE)} * exp( -( dot( dxz, dxz ) + dy * dy ) / ${f(HEAT_ENGINE_R * HEAT_ENGINE_R)} );
  }
  return mix( ${f(HEAT_FAR)}, e, vHeatNear ) * uHeatK.z;
}`;
/** One vehicle's heat state and the uniforms its stand-ins share. */
interface HeatRecord {
  inv:{value:Matrix4};eng0:{value:Vector4};eng1:{value:Vector4};k:{value:Vector4};
  /** per source material: its stand-ins by part (hull, gear, gun) */
  materials:Map<Material,Material[]>;
  drive:number;clockS:number;lengthM:number;
}
/** The heat stand-ins' one program (every vehicle's and part's alike: only the uniforms differ). */
function installHeatProgram(m:MeshStandardMaterial,rec:HeatRecord,part:number):void {
  const partU={value:part};
  m.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,{uHeatInv:rec.inv,uHeatEng0:rec.eng0,uHeatEng1:rec.eng1,uHeatK:rec.k,uHeatPart:partU});
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\n'+HEAT_VERTEX_PARS)
      .replace('#include <project_vertex>','#include <project_vertex>'+HEAT_VERTEX);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\n'+HEAT_FRAGMENT_PARS)
      .replace('#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n totalEmissiveRadiance = vec3( cotHeatEmission() ) * ( 0.62 + 0.38 * abs( normal.z ) );');
    // 2026-10-18 (the wheel-band lane, round 3): the heat stand-ins write the vehicle alpha (tagUnlitVehiclePixels),
    // or the aerial pass's ground occlusion took a hot hull's running gear under the belly line for ground and
    // cooled it below a straight edge at the belly + 2 cm
    tagUnlitVehiclePixels(shader);
  };
  m.customProgramCacheKey=()=> 'thermal-vehicle-v3';
}
/** Temporary render-only materials: preserve geometry, depth, alpha cutouts and
 * spotting visibility. Never change a shared fleet material or reveal an actor. */
export function createThermalVehicles(){
  const meshes=new WeakMap<Object3D,Mesh[]>();
  const parts=new WeakMap<Object3D,Uint8Array>();
  let warmed = new WeakSet<Object3D>();
  const records=new WeakMap<Object3D,HeatRecord>();
  /** (follow-up) the battle time each hull was first seen destroyed */
  const destroyedAt=new WeakMap<Object3D,number>();
  /** (fx-ir-hull-heat-229) each shooter's gun heat at its last shot and that shot's simulation time */
  const shots=new Map<string,{heat:number;atS:number}>();
  const changed:Mesh[]=[];const originals:Array<Material|Material[]>=[];
  function record(root:Object3D,actor:ThermalActor):HeatRecord {
    let rec=records.get(root);
    if(!rec){
      rec={inv:{value:new Matrix4()},eng0:{value:new Vector4()},eng1:{value:new Vector4()},k:{value:new Vector4(0,0,1,7)},
        materials:new Map(),drive:0,clockS:NaN,lengthM:7};
      const length=actor.spec?.dims?.hullLengthM;
      if(typeof length==='number'&&length>0)rec.lengthM=length;
      // the engine: the damage model's module box (hull frame: metres, +Z forward); without one, the rear third
      const engine=actor.spec?.armor?.modules?.find(m=>m.module==='engine');
      if(engine?.min&&engine.max){
        rec.eng0.value.set(engine.min[0]!,engine.min[1]!,engine.min[2]!,0);
        rec.eng1.value.set(engine.max[0]!,engine.max[1]!,engine.max[2]!,0);
      } else {const half=rec.lengthM/2;rec.eng0.value.set(-1,.5,-half,0);rec.eng1.value.set(1,1.5,-half/3,0);}
      records.set(root,rec);
    }
    return rec;
  }
  function variant(source:Material,rec:HeatRecord,part:number):Material {
    if(!(source instanceof MeshStandardMaterial)||!source.colorWrite)return source;
    let set=rec.materials.get(source);
    if(!set){set=[];rec.materials.set(source,set);}
    let m=set[part];
    if(!m){
      const own=source.clone();
      own.name='Thermal vehicle '+['hull','running gear','gun'][part];own.color.setRGB(.035,.035,.035);
      own.emissive.setRGB(1,1,1);own.emissiveIntensity=1;own.emissiveMap=null;
      own.metalness=0;own.roughness=1;
      installHeatProgram(own,rec,part); // Material.copy() carries no onBeforeCompile: each stand-in takes the heat program
      set[part]=m=own;
      source.addEventListener('dispose',()=>own.dispose());
    }
    return m;
  }
  function meshList(root:Object3D):Mesh[] {
    let list=meshes.get(root);
    if(!list){
      list=[];root.traverse(o=>{if(o instanceof Mesh)list!.push(o);});meshes.set(root,list);
      const kinds=new Uint8Array(list.length);
      for(let i=0;i<list.length;i++)kinds[i]=heatPartOf(list[i]!,root);
      parts.set(root,kinds);
    }
    return list;
  }
  /** every battle frame, lens or not: the drive heat by the hull's speed on the simulation clock (a new battle's clock,
   *  earlier than the last, or the first sight starts it cold) */
  function drive(rec:HeatRecord,actor:ThermalActor,destroyed:boolean,timeS:number):void {
    const dt=timeS-rec.clockS;
    rec.drive=dt>=0?driveHeatStep(rec.drive,destroyed?0:actor.state?.speed??0,dt):0;
    rec.clockS=timeS;
  }
  /** this frame's heat for a hull: its frame, gun heat and scale (side x wreck heat) beside its drive heat */
  function apply(root:Object3D,actor:ThermalActor,enemy:boolean,heat=1,timeS?:number):void {
    const rec=record(root,actor);
    rec.inv.value.copy(root.matrixWorld).invert();
    const shot=typeof timeS==='number'&&actor.id?shots.get(actor.id):undefined;
    // the QA hook's THERMAL_HULL_MAP 0 lays no map (no span on the screen: the old flat white-hot) for a same-build A/B
    rec.k.value.set(rec.drive,shot?gunHeatAt(shot.heat,shot.atS,timeS!):0,(enemy?1:HEAT_FRIENDLY)*heat,
      lightTune('THERMAL_HULL_MAP',1)>0?rec.lengthM:0);
    const list=meshList(root),kinds=parts.get(root)!;
    for(let i=0;i<list.length;i++) {
      const mesh=list[i]!;
      if(Array.isArray(mesh.material))continue;
      const material=variant(mesh.material,rec,kinds[i]!);
      if(material===mesh.material)continue;
      changed.push(mesh);originals.push(mesh.material);mesh.material=material;
    }
  }
  function end():void {
    for(let i=0;i<changed.length;i++)changed[i]!.material=originals[i]!;
    changed.length=originals.length=0;
  }
  return {
    /** Compile and first-bind heat variants during loading/countdown. Every
     * checkpoint restores visible materials, even on cancellation or failure.
     * The supplied renderer must target a private offscreen buffer. */
    *warmSteps(actors:Iterable<ThermalActor>,team:string|undefined,
      prepare:(root:Object3D)=>Generator<object|void,object|void,void>):Generator<void> {
      for(const actor of actors) {
        const root=actor.visual?.root;
        if(!root || actor.combat?.destroyed || warmed.has(root))continue;
        const list=meshList(root);
        const culling=list.map(mesh=>mesh.frustumCulled);
        const steps=prepare(root);
        try {
          for(;;) {
            const visible=root.visible;
            let done=false;
            try {
              root.visible=true;
              for(const mesh of list)mesh.frustumCulled=false;
              apply(root,actor,actor.team!==team);
              done=!!steps.next().done;
            } finally {
              end();root.visible=visible;
              for(let i=0;i<list.length;i++)list[i]!.frustumCulled=culling[i]!;
            }
            if(done)break;
            yield;
          }
          warmed.add(root);
        } finally {steps.return(undefined);}
        yield;
      }
    },
    invalidateWarm(){warmed=new WeakSet<Object3D>();},
    /** (fx-ir-hull-heat-229) a shot (`shell:fired`): the shooter's gun heats by its calibre at the shot's simulation time */
    noteShot(shooterId:string|null|undefined,timeS:number,caliberMm:number){
      if(!shooterId||!Number.isFinite(timeS))return;
      let shot=shots.get(shooterId);
      if(!shot){shot={heat:0,atS:timeS};shots.set(shooterId,shot);}
      // a shot on an earlier clock than the last (a new battle) starts the gun cold
      const before=timeS>=shot.atS?gunHeatAt(shot.heat,shot.atS,timeS):0;
      shot.heat=Math.min(1,before+gunShotHeat(caliberMm));shot.atS=timeS;
    },
    /** `timeS`: the battle's simulation clock (wrecks cool by it; without it a wreck is cold, as before) */
    begin(actors:Iterable<ThermalActor>,active:boolean,team?:string,timeS?:number){
      const clocked=typeof timeS==='number'&&Number.isFinite(timeS);
      // nothing to light and no battle clock to note kills by (the garage, a menu): no walk at all, as before
      if(!actors||(!active&&!clocked))return;
      for(const actor of actors){
        const root=actor.visual?.root;
        if(!root)continue;
        const destroyed=!!actor.combat?.destroyed;
        // every frame, lens or not: the time a hull is first seen destroyed (its wreck cools from there)
        if(destroyed&&clocked&&!destroyedAt.has(root))destroyedAt.set(root,timeS);
        else if(!destroyed&&destroyedAt.has(root))destroyedAt.delete(root);
        if(clocked)drive(record(root,actor),actor,destroyed,timeS);
        if(!active||!root.visible||!root.parent||actor.networkVisible===false)continue;
        if(!destroyed){apply(root,actor,actor.team!==team,1,clocked?timeS:undefined);continue;}
        if(!clocked)continue;
        const heat=wreckHeatLevel(timeS-(destroyedAt.get(root)??timeS));
        if(heat>0)apply(root,actor,actor.team!==team,heat,timeS);
      }
    },
    end,
  };
}
