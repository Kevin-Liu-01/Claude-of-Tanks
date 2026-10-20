import {Mesh,MeshStandardMaterial,type Material,type Object3D} from 'three';
import {tagUnlitVehiclePixels} from './vehicleOcclusion.ts';
interface ThermalActor {
  team?:string;networkVisible?:boolean;
  combat?:{destroyed?:boolean}|null;
  visual?:{root?:Object3D|null}|null;
}
/** (ac130-fx-228 follow-up, the coordinator: "a killed vehicle goes dark at once in thermal") a destroyed hull keeps its
 * heat and cools: its stand-in's emission falls as exp(-age / WRECK_COOL_S) from the battle (sim) time it was first
 * seen destroyed, in WRECK_HEAT_LEVELS steps (the same heat program: no new link), until under 1 / WRECK_HEAT_LEVELS it is
 * the cold wreck's own material. Render-only and deterministic: the age is the simulation clock's. */
export const WRECK_COOL_S = 20;
export const WRECK_HEAT_LEVELS = 12;
/** The wreck's heat share (0..1, quantised; 0 = cold) `ageS` seconds after it was destroyed. */
export function wreckHeatLevel(ageS:number):number{
  if(!(ageS>=0))return 0;
  const level=Math.round(Math.exp(-ageS/WRECK_COOL_S)*WRECK_HEAT_LEVELS);
  return level>=1?level/WRECK_HEAT_LEVELS:0;
}
/** The heat stand-ins' one program (the live variants' and the cooling wrecks' alike). */
function installHeatProgram(m:MeshStandardMaterial):void {
  // 2026-10-18 (the wheel-band lane, round 3): the heat stand-ins write the vehicle alpha (tagUnlitVehiclePixels),
  // or the aerial pass's ground occlusion took a hot hull's running gear under the belly line for ground and
  // cooled it below a straight edge at the belly + 2 cm
  m.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n totalEmissiveRadiance *= 0.62 + 0.38 * abs(normal.z);');
    tagUnlitVehiclePixels(shader);
  };
  m.customProgramCacheKey=()=> 'thermal-vehicle-v2';
}
/** Temporary render-only materials: preserve geometry, depth, alpha cutouts and
 * spotting visibility. Never change a shared fleet material or reveal an actor. */
export function createThermalVehicles(){
  const meshes=new WeakMap<Object3D,Mesh[]>();
  let warmed = new WeakSet<Object3D>();
  const materials=new WeakMap<Material,[Material,Material]>();
  /** (follow-up) a wreck's cooling stand-ins, per source material and side: index = the level - 1 */
  const wreckMaterials=new WeakMap<Material,[Material[],Material[]]>();
  /** (follow-up) the battle time each hull was first seen destroyed */
  const destroyedAt=new WeakMap<Object3D,number>();
  const changed:Mesh[]=[];const originals:Array<Material|Material[]>=[];
  function variant(source:Material,enemy:boolean):Material {
    if(!(source instanceof MeshStandardMaterial)||!source.colorWrite)return source;
    let pair=materials.get(source);
    if(!pair){
      pair=[source.clone(),source.clone()];
      for(let i=0;i<2;i++){
        const m=pair[i] as MeshStandardMaterial;
        m.name='Thermal vehicle '+(i?'hostile':'friendly');m.color.setRGB(.035,.035,.035);
        m.emissive.setRGB(i?4:2.2,i?4:2.2,i?4:2.2);m.emissiveIntensity=1;m.emissiveMap=null;
        m.metalness=0;m.roughness=1;
        installHeatProgram(m);
      }
      const owned=pair;
      source.addEventListener('dispose',()=>{for(const m of owned)m.dispose();});
      materials.set(source,pair);
    }
    return pair[enemy?1:0]!;
  }
  /** a wreck's stand-in at heat share `heat` (one of the quantised levels): the live variant's emission scaled */
  function wreckVariant(source:Material,enemy:boolean,heat:number):Material {
    const live=variant(source,enemy);
    if(live===source)return source;
    let sets=wreckMaterials.get(source);
    if(!sets){sets=[[],[]];wreckMaterials.set(source,sets);}
    const list=sets[enemy?1:0]!,index=Math.round(heat*WRECK_HEAT_LEVELS)-1;
    let m=list[index];
    if(!m){
      const cooled=(live as MeshStandardMaterial).clone();
      // a clone shares its onBeforeCompile and program key: the same heat program, only the emission differs
      cooled.name=(live as MeshStandardMaterial).name+' (cooling)';
      installHeatProgram(cooled); // Material.copy() carries no onBeforeCompile: the clone takes the same heat program
      cooled.emissive.multiplyScalar(heat);
      list[index]=m=cooled;
      source.addEventListener('dispose',()=>cooled.dispose());
    }
    return m;
  }
  function meshList(root:Object3D):Mesh[] {
    let list=meshes.get(root);
    if(!list){list=[];root.traverse(o=>{if(o instanceof Mesh)list!.push(o);});meshes.set(root,list);}
    return list;
  }
  function apply(root:Object3D,enemy:boolean,heat=1):void {
    for(const mesh of meshList(root)) {
      if(Array.isArray(mesh.material))continue;
      const material=heat<1?wreckVariant(mesh.material,enemy,heat):variant(mesh.material,enemy);
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
              apply(root,actor.team!==team);
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
        if(!active||!root.visible||!root.parent||actor.networkVisible===false)continue;
        if(!destroyed){apply(root,actor.team!==team);continue;}
        if(!clocked)continue;
        const heat=wreckHeatLevel(timeS-(destroyedAt.get(root)??timeS));
        if(heat>0)apply(root,actor.team!==team,heat);
      }
    },
    end,
  };
}
