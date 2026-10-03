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
  return {
    begin(actors:Iterable<ThermalActor>,active:boolean,team?:string){
      if(!active)return;
      for(const actor of actors){
        const root=actor.visual?.root;
        if(!root||!root.visible||!root.parent||actor.networkVisible===false||actor.combat?.destroyed)continue;
        let list=meshes.get(root);
        if(!list){list=[];root.traverse(o=>{if(o instanceof Mesh)list!.push(o);});meshes.set(root,list);}
        for(const mesh of list){
          // Multi-material foliage and transparent custom effects retain their authored treatment.
          if(Array.isArray(mesh.material))continue;
          const material=variant(mesh.material,actor.team!==team);
          if(material===mesh.material)continue;
          changed.push(mesh);originals.push(mesh.material);mesh.material=material;
        }
      }
    },
    end(){for(let i=0;i<changed.length;i++)changed[i]!.material=originals[i]!;changed.length=originals.length=0;},
  };
}
