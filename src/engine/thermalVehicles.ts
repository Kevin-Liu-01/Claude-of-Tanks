import {Mesh,MeshStandardMaterial,type Material,type Object3D} from 'three';
interface ThermalActor {
  team?:string;networkVisible?:boolean;
  combat?:{destroyed?:boolean}|null;
  visual?:{root?:Object3D|null}|null;
}
/** Temporary render-only materials: preserve geometry, depth, alpha cutouts and
 * spotting visibility. Never change a shared fleet material or reveal an actor. */
export function createThermalVehicles(){
  const meshes=new WeakMap<Object3D,Mesh[]>();
  let warmed = new WeakSet<Object3D>();
  const materials=new WeakMap<Material,[Material,Material]>();
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
        m.onBeforeCompile=shader=>{
          shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',
            '#include <emissivemap_fragment>\n totalEmissiveRadiance *= 0.62 + 0.38 * abs(normal.z);');
        };
        m.customProgramCacheKey=()=> 'thermal-vehicle-v1';
      }
      const owned=pair;
      source.addEventListener('dispose',()=>{for(const m of owned)m.dispose();});
      materials.set(source,pair);
    }
    return pair[enemy?1:0]!;
  }
  function meshList(root:Object3D):Mesh[] {
    let list=meshes.get(root);
    if(!list){list=[];root.traverse(o=>{if(o instanceof Mesh)list!.push(o);});meshes.set(root,list);}
    return list;
  }
  function apply(root:Object3D,enemy:boolean):void {
    for(const mesh of meshList(root)) {
      if(Array.isArray(mesh.material))continue;
      const material=variant(mesh.material,enemy);
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
    begin(actors:Iterable<ThermalActor>,active:boolean,team?:string){
      if(!active)return;
      for(const actor of actors){
        const root=actor.visual?.root;
        if(!root||!root.visible||!root.parent||actor.networkVisible===false||actor.combat?.destroyed)continue;
        apply(root,actor.team!==team);
      }
    },
    end,
  };
}
