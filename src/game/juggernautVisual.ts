import * as THREE from 'three';

interface Surface {mesh:THREE.Mesh;original:THREE.Material|THREE.Material[];highlight:THREE.Material|THREE.Material[]}
interface Shield {
  surfaces:Surface[];materials:Map<THREE.Material,THREE.Material>;
  strength:{value:number};pulse:{value:number};age:number;hp:number;
  dispose:()=>void;refresh:()=>void;refreshIn:number;
}
const scales=new WeakMap<THREE.Object3D,number>();
const shields=new WeakMap<THREE.Object3D,Shield>();

/** Shade the actual vehicle surfaces: no enclosing geometry, extra draw calls,
 * enlarged silhouette, or highlight through cover. Instancing, batching, moving
 * turrets and hidden/detached modules keep their original geometry and poses. */
export function syncJuggernautVisual(root:THREE.Object3D,_dims:{widthM:number;hullLengthM:number;heightM:number},scale:number,hp:number,maxHp:number,dt:number):void {
  const previous=scales.get(root)??1;
  if(previous!==scale){root.scale.multiplyScalar(scale/previous);scales.set(root,scale);}
  let shield=shields.get(root);
  if(scale<=1||hp<=0){shield?.dispose();return;}
  if(!shield){
    const surfaces:Surface[]=[],materials=new Map<THREE.Material,THREE.Material>();
    const strength={value:0},pulse={value:0};
    const dispose=()=>{
      for(const surface of surfaces){
        if(surface.mesh.material===surface.highlight)surface.mesh.material=surface.original;
      }
      // Existing vehicle shader hooks include CSM registrations keyed by the
      // source material. Recompile the restored source to rebind those hooks.
      for(const [source,material] of materials){source.needsUpdate=true;material.dispose();}
      materials.clear();surfaces.length=0;shields.delete(root);
      root.removeEventListener('removed',dispose);
    };
    const bindings=new WeakMap<THREE.Mesh,Surface>();
    const inspect=(object:THREE.Object3D)=>{
      if(!(object instanceof THREE.Mesh))return;
      const bound=bindings.get(object);
      if(bound&&object.material===bound.highlight)return;
      const original=object.material;
      const highlight=Array.isArray(original)?original.map(m=>highlightMaterial(m,shield!)):highlightMaterial(original,shield!);
      if(Array.isArray(original)?!(highlight as THREE.Material[]).some((m,i)=>m!==original[i]):highlight===original)return;
      if(bound){bound.original=original;bound.highlight=highlight;}
      else {const surface={mesh:object,original,highlight};surfaces.push(surface);bindings.set(object,surface);}
      object.material=highlight;
    };
    shield={surfaces,materials,strength,pulse,age:0,hp,dispose,refresh:()=>root.traverse(inspect),refreshIn:0};
    shields.set(root,shield);root.addEventListener('removed',dispose);
  }
  // Detail groups reattach as tanks approach. Discover those real surfaces at
  // a bounded cadence, without traversing the whole vehicle every frame.
  shield.refreshIn-=dt;
  if(shield.refreshIn<=0){shield.refresh();shield.refreshIn=.25;}
  shield.age+=dt;
  if(hp<shield.hp)shield.pulse.value=1;
  shield.hp=hp;shield.pulse.value=Math.max(0,shield.pulse.value-dt*2.4);
  shield.strength.value=.55+.08*Math.sin(shield.age*1.8)+.3*Math.max(0,hp/Math.max(1,maxHp));
}

function highlightMaterial(source:THREE.Material,shield:Shield):THREE.Material {
  if(!(source instanceof THREE.MeshStandardMaterial)||!source.colorWrite||source.transparent)return source;
  const existing=shield.materials.get(source);if(existing)return existing;
  const material=source.clone();material.name='Juggernaut surface highlight';
  // Shader drivers (especially the prewarmed burn uniforms) are live objects,
  // not serializable metadata. Preserve their identities when isolating paint.
  material.userData={...source.userData};
  // clone() omits custom shader hooks. Keep camouflage, burn masks, ambient
  // floor and shadow setup; only add a rim contribution to their final light.
  const compile=source.onBeforeCompile,cacheKey=source.customProgramCacheKey.call(source);
  material.onBeforeCompile=function(shader,renderer){
    compile.call(this,shader,renderer);
    shader.uniforms.juggernautStrength=shield.strength;shader.uniforms.juggernautPulse=shield.pulse;
    shader.fragmentShader=shader.fragmentShader
      .replace('#include <common>','#include <common>\nuniform float juggernautStrength;\nuniform float juggernautPulse;')
      .replace('#include <opaque_fragment>',`
        float juggernautRim = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.4);
        outgoingLight += mix(vec3(0.03, 0.48, 1.0), vec3(0.4, 0.85, 1.0), juggernautPulse)
          * (0.055 + juggernautRim * 1.6) * (juggernautStrength + juggernautPulse * 1.5);
        #include <opaque_fragment>`);
  };
  material.customProgramCacheKey=()=>cacheKey+'|juggernaut-surface-v1';
  shield.materials.set(source,material);return material;
}
