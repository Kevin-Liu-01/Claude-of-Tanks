import * as THREE from 'three';
import { cloneVehicleMaterial, releaseVehicleMaterial, runVehicleHookChain } from '../vehicles/materials.ts';
import { programVariantOrigin, splitProgramVariants } from '../engine/programVariants.ts';

interface Surface {mesh:THREE.Mesh;original:THREE.Material|THREE.Material[];highlight:THREE.Material|THREE.Material[]}
const IMPACT_COUNT=6;
const IMPACT_DURATION=1.2;
interface Impact {anchor:THREE.Object3D|null;local:THREE.Vector3;sample:THREE.Vector4}
export interface TankEnergyStyle { readonly color: number; readonly pattern: number; readonly name: string }
export const TANK_ENERGY = Object.freeze({
  juggernaut: Object.freeze({color:0x35aaff,pattern:0,name:'Juggernaut surface highlight'}),
  flagOwn: Object.freeze({color:0x6fe887,pattern:1,name:'Flag carrier surface highlight'}),
  flagEnemy: Object.freeze({color:0xf26a62,pattern:1,name:'Flag carrier surface highlight'}),
  infected: Object.freeze({color:0x80ef35,pattern:2,name:'Infected surface highlight'}),
});
interface Shield {
  preview:boolean;
  /** a role lights the tank now; false: the battle's dormant skin (zero strength, no ripples, no rescans) */
  lit:boolean;
  /** the skin went onto the live tank's surfaces (its first scan) */
  installed:boolean;
  surfaces:Surface[];materials:Map<THREE.Material,THREE.Material>;
  style:TankEnergyStyle;color:{value:THREE.Color};pattern:{value:number};
  strength:{value:number};time:{value:number};rootInverse:{value:THREE.Matrix4};
  impacts:Impact[];activeHits:{value:number};hitPositions:{value:THREE.Vector4[]};nextImpact:number;
  dispose:()=>void;refresh:()=>void;refreshIn:number;
}
// (mode-sheen-perf-243) everything a skin adds sits under its strength uniform, the hull-frame position included, so a
// dormant battle skin (strength 0) is exactly its paint, as the Garage's paused one is: lighting, pausing and a role
// change differ only in uniforms. The Garage's preview omits the combat ripples (its own program key).
const ENERGY_PROGRAM_KEY='|tank-mode-energy-v7',ENERGY_PREVIEW_PROGRAM_KEY='|tank-mode-energy-preview-v2';
const ENERGY_IMPACT_FRAGMENT = `
        for(int i = 0; i < ${IMPACT_COUNT}; i++) {
          if(i >= juggernautActiveHits) break;
          float age = juggernautHits[i].w;
          if(age >= 0.0 && age < ${IMPACT_DURATION}) {
            vec3 offset = shieldSurface - juggernautHits[i].xyz;
            float d = length(offset);
            vec3 direction = offset / max(d, 0.0001);
            // Smooth 3-D lobes avoid a circular stamp or an angular seam.
            float rippleWarp = (sin(direction.x * 7.0 + direction.y * 5.0 + age * 10.0) * 0.15
              + sin(direction.z * 9.0 - direction.y * 6.0 - age * 7.0) * 0.10)
              * smoothstep(0.0, 0.28, age);
            float ring = 1.0 - smoothstep(0.0, 0.24, abs(d - max(0.0, age * 2.4 + rippleWarp)));
            float core = (1.0 - smoothstep(0.0, 0.45, d)) * (1.0 - smoothstep(0.0, 0.4, age));
            float fade = 1.0 - smoothstep(0.25, ${IMPACT_DURATION}, age);
            hitGlow += (ring + core) * fade;
          }
        }
        hitGlow = min(hitGlow, 2.0);
`;
const scales=new WeakMap<THREE.Object3D,number>();
const shields=new WeakMap<THREE.Object3D,Shield>();
// Wreck/repair snapshots can retain a highlight after its live effect is gone.
// Weak ownership receipts let the Garage unwrap those saved materials later.
const highlightSources=new WeakMap<THREE.Material,THREE.Material>();
function originalMaterial(material:THREE.Material):THREE.Material {
  return highlightSources.get(material)??material;
}

/** End the effect before a surviving battle visual is adopted by the Garage. */
export function clearJuggernautVisual(root:THREE.Object3D,restoreSavedMaterials=false):void {
  shields.get(root)?.dispose();
  const scale=scales.get(root)??1;
  if(scale!==1)root.scale.multiplyScalar(1/scale);
  scales.delete(root);
  if(!restoreSavedMaterials)return;
  root.traverse(object=>{
    if(!(object instanceof THREE.Mesh))return;
    const current=object.material;
    if(Array.isArray(current)){
      if(current.some(m=>highlightSources.has(m)))object.material=current.map(originalMaterial);
    }else object.material=originalMaterial(current);
  });
  // (2026-10-19, the 229 perf pass) a saved skin unwraps to the material it replaced: a battle build re-seats the
  // program-variant twins its meshes drew (only materials its build split: the shared shadow-proxy material stays whole),
  // or they would flip programs again and fall out of their depth layers
  if(root.userData.programVariants)splitProgramVariants(root,{onlyAlreadySplit:true});
}

/** Keep compiled Garage materials resident across mode switches. A zero
 * strength is exactly the original paint, without disposing/linking shaders. */
export function pauseGarageTankEnergyVisual(root:THREE.Object3D):void {
  const shield=shields.get(root);
  if(!shield?.preview)return;
  shield.strength.value=0;
  nameSkins(shield,false);
}

/** Install the dormant skin before the Garage's ordinary first shader submission.
 * The first aura selection then changes uniforms, just like changing paint. */
export function prepareGarageTankEnergyVisual(root:THREE.Object3D,dims:{widthM:number;hullLengthM:number;heightM:number}):void {
  if(shields.get(root)?.preview)return;
  syncTankEnergyVisual(root,dims,1.12,1,1,0,false,TANK_ENERGY.juggernaut,true);
  pauseGarageTankEnergyVisual(root);
}
export function hasGarageTankEnergyVisual(root:THREE.Object3D):boolean {
  return shields.get(root)?.preview===true;
}

/** A lit skin wears its style's name; a paused or dormant one its paint's (what a material census reads). */
function nameSkins(shield:Shield,lit:boolean):void {
  for(const [source,material] of shield.materials)material.name=lit?shield.style.name:source.name;
}

/** Shade the actual vehicle surfaces: no enclosing geometry, extra draw calls,
 * enlarged silhouette, or highlight through cover. Instancing, batching, moving
 * turrets and hidden/detached modules keep their original geometry and poses.
 *
 * `dormant` (a battle whose mode can light any tank: sim/matchRuleset.ts modeLightsTanks): while no role lights the tank
 * (scale ≤ 1 or hp ≤ 0) its skin stays installed at zero strength instead of being removed, so the programs compile
 * where the tank's first one does (its staging, behind the cover) and lighting, a role change, a kill or a respawn only
 * writes uniforms. Leaving the scene (a spotting edge, a warm's private attach) never ends a skin: an explicit clear
 * (clearJuggernautVisual) or its paint's disposal does. Returns true when this call made skin materials (programs a warm
 * compiles). */
export function syncTankEnergyVisual(root:THREE.Object3D,_dims:{widthM:number;hullLengthM:number;heightM:number},scale:number,hp:number,maxHp:number,dt:number,enlarge=true,style:TankEnergyStyle=TANK_ENERGY.juggernaut,preview=false,dormant=false):boolean {
  const previous=scales.get(root)??1,visualScale=enlarge?scale:1;
  if(previous!==visualScale){root.scale.multiplyScalar(visualScale/previous);scales.set(root,visualScale);}
  let shield=shields.get(root);
  if(shield&&shield.preview!==preview){shield.dispose();shield=undefined;}
  const lit=scale>1&&hp>0;
  if(!lit&&(preview||!dormant)){shield?.dispose();return false;}
  const created=!shield,skins=shield?.materials.size??0;
  if(!shield){
    const surfaces:Surface[]=[],materials=new Map<THREE.Material,THREE.Material>();
    const strength={value:0},time={value:0},rootInverse={value:new THREE.Matrix4()};
    const impacts=Array.from({length:IMPACT_COUNT},()=>({anchor:null as THREE.Object3D|null,local:new THREE.Vector3(),sample:new THREE.Vector4(0,0,0,-1)}));
    const activeHits={value:0};
    const dispose=()=>{
      for(const surface of surfaces){
        if(surface.mesh.material===surface.highlight)surface.mesh.material=surface.original;
      }
      // a skin a wreck snapshot kept (restored before clearJuggernautVisual unwraps it) draws as its paint
      strength.value=0;activeHits.value=0;
      // Each skin clone holds its own cascade registration (cloneVehicleMaterial): release it before the clone goes.
      // The restored source still recompiles, as it did when the clone compiled through the source's CSM entry.
      for(const [source,material] of materials){source.removeEventListener('dispose',dispose);source.needsUpdate=true;releaseVehicleMaterial(material);material.dispose();}
      for(const object of watched){
        object.removeEventListener('childadded',markDirty);
        object.removeEventListener('childremoved',markDirty);
      }
      watched.clear();materials.clear();surfaces.length=0;shields.delete(root);
    };
    const bindings=new WeakMap<THREE.Mesh,Surface>();
    // Topology changes are rare. Track them rather than rescanning every part
    // of every glowing tank four times per second.
    const watched=new Set<THREE.Object3D>();
    let topologyDirty=true;
    const markDirty=()=>{topologyDirty=true;};
    const watch=(object:THREE.Object3D)=>{
      if(watched.has(object))return;
      watched.add(object);
      object.addEventListener('childadded',markDirty);
      object.addEventListener('childremoved',markDirty);
    };
    const inspect=(object:THREE.Object3D)=>{
      watch(object);
      if(!(object instanceof THREE.Mesh))return;
      for(let part:THREE.Object3D|null=object;part&&part!==root;part=part.parent)if(part.userData.excludeModeEnergy)return;
      const bound=bindings.get(object);
      if(bound&&object.material===bound.highlight)return;
      const current=object.material;
      const original=Array.isArray(current)?current.map(originalMaterial):originalMaterial(current);
      const highlight=Array.isArray(original)?original.map(m=>highlightMaterial(m,shield!)):highlightMaterial(original,shield!);
      if(Array.isArray(original)?!(highlight as THREE.Material[]).some((m,i)=>m!==original[i]):highlight===original)return;
      if(bound){bound.original=original;bound.highlight=highlight;}
      else {const surface={mesh:object,original,highlight};surfaces.push(surface);bindings.set(object,surface);}
      object.material=highlight;
    };
    // Cached Garage roots are detached while parked, battle roots while unspotted: their skins stay resident until an
    // explicit clear (a battle's exit, the Garage handoff) or their paint's disposal (highlightMaterial).
    shield={preview,lit,installed:false,surfaces,materials,strength,time,rootInverse,style,color:{value:new THREE.Color(style.color)},pattern:{value:style.pattern},impacts,activeHits,hitPositions:{value:impacts.map(i=>i.sample)},nextImpact:0,dispose,refresh:()=>{
      shield!.installed=true;
      if(topologyDirty){root.traverse(inspect);topologyDirty=false;}
      else for(const surface of surfaces)if(surface.mesh.material!==surface.highlight)inspect(surface.mesh);
    },refreshIn:0};
    shields.set(root,shield);
  }
  if(shield.style!==style){
    shield.style=style;shield.color.value.setHex(style.color);shield.pattern.value=style.pattern;
    if(shield.lit)nameSkins(shield,true);
    for(const impact of shield.impacts){impact.anchor=null;impact.sample.w=-1;}
  }
  if(!lit){
    // the dormant skin: installed once on the live tank (a wreck is never skinned), then left as it is: a wreck's swaps,
    // a damage state or a parked detail group are not rescanned until a role lights the tank again
    if(!shield.installed&&hp>0)shield.refresh();
    if(shield.lit||created){
      shield.lit=false;shield.strength.value=0;shield.activeHits.value=0;shield.refreshIn=0;
      for(const impact of shield.impacts){impact.anchor=null;impact.sample.w=-1;}
      nameSkins(shield,false);
    }
    return shield.materials.size>skins;
  }
  if(!shield.lit){shield.lit=true;shield.refreshIn=0;nameSkins(shield,true);}
  // Detail groups reattach as tanks approach. Discover those real surfaces at
  // a bounded cadence, without traversing the whole vehicle every frame.
  shield.refreshIn-=dt;
  if(shield.refreshIn<=0){shield.refresh();shield.refreshIn=.25;}
  const elapsed=Number.isFinite(dt)?Math.max(0,dt):0;
  shield.time.value+=elapsed;
  root.updateWorldMatrix(true,false);
  shield.rootInverse.value.copy(root.matrixWorld).invert();
  shield.activeHits.value=0;
  for(let index=0;index<shield.impacts.length;index++){
    const impact=shield.impacts[index]!;
    if(!impact.anchor)continue;
    impact.sample.w+=elapsed;
    if(impact.sample.w>=IMPACT_DURATION){impact.anchor=null;impact.sample.w=-1;continue;}
    shield.activeHits.value=index+1;
    // Keep a turret/barrel hit on its moving part, even while the hull turns.
    impact.anchor.updateWorldMatrix(true,false);
    impactPoint.copy(impact.local).applyMatrix4(impact.anchor.matrixWorld).applyMatrix4(shield.rootInverse.value);
    impact.sample.set(impactPoint.x,impactPoint.y,impactPoint.z,impact.sample.w);
  }
  if(shield.preview&&shield.strength.value===0)nameSkins(shield,true);
  shield.strength.value=.55+.08*Math.sin(shield.time.value*1.8)+.3*Math.max(0,hp/Math.max(1,maxHp));
  return shield.materials.size>skins;
}

const impactPoint=new THREE.Vector3();
/** Shared solo/network shell events supply the real world-space contact. No
 * damage deduction is needed: ricochets also disturb the shield at contact. */
export function pulseJuggernautImpact(root:THREE.Object3D,pos:readonly number[],frame?:string):boolean {
  const shield=shields.get(root);
  if(!shield||shield.preview||!shield.lit||pos.length<3||!Number.isFinite(pos[0])||!Number.isFinite(pos[1])||!Number.isFinite(pos[2]))return false;
  const rig=frame==='turret'?'rig_turret':frame==='gun'||frame==='barrel'?'rig_gun':null;
  const anchor=(rig&&root.getObjectByName(rig))||root;
  const impact=shield.impacts[shield.nextImpact]!;
  shield.activeHits.value=Math.max(shield.activeHits.value,shield.nextImpact+1);
  shield.nextImpact=(shield.nextImpact+1)%IMPACT_COUNT;
  root.updateWorldMatrix(true,false);anchor.updateWorldMatrix(true,false);
  impact.local.set(pos[0]!,pos[1]!,pos[2]!);anchor.worldToLocal(impact.local);impact.anchor=anchor;
  impactPoint.set(pos[0]!,pos[1]!,pos[2]!);root.worldToLocal(impactPoint);
  impact.sample.set(impactPoint.x,impactPoint.y,impactPoint.z,0);
  return true;
}

function highlightMaterial(drawn:THREE.Material,shield:Shield):THREE.Material {
  if(!(drawn instanceof THREE.MeshStandardMaterial)||!drawn.colorWrite||drawn.transparent)return drawn;
  // (mode-sheen-perf-243) one skin per material a mesh draws, a program-variant twin included: the 229 perf pass gave
  // every further variant of a material its own twin (engine/programVariants.ts: an instanced road wheel and the merged
  // hull of one paint) so each draws with one program; a skin per original drew both variants again, and three
  // re-resolved its program (the whole parameter set, the key, every uniform) at each flip, every frame of every skinned tank
  const existing=shield.materials.get(drawn);if(existing)return existing;
  const source=programVariantOrigin(drawn) as THREE.MeshStandardMaterial;
  // 2026-10-17 (the wheel-band lane; the owner: "in garage, on all tanks, i can see this weird shadow on wheels"): a raw
  // clone() lost the cascade registration (three's copy resets the defines: USE_CSM, CSM_*, COT_CLOUD_SHADE and the
  // vehicle's COT_* switches), so every skinned pixel lit with all four cascade suns unshadowed and wrote neither the
  // sun state nor the vehicle tag: the ground occlusion took the Garage tank's road wheels for ground under the hull
  // (a dark band below the belly line). cloneVehicleMaterial joins the clone to its source's registration under its
  // own cascade entry, which the dispose above releases.
  const material=cloneVehicleMaterial(drawn as THREE.MeshStandardMaterial,clone=>{
    clone.name=shield.lit?shield.style.name:source.name;
    // Camouflage repaints shared texture canvases and retints the factory's
    // fitting colors. The dormant skin must follow those live paint bindings.
    clone.color=source.color;clone.emissive=source.emissive;
    // Shader drivers (especially the prewarmed burn uniforms) are live objects,
    // not serializable metadata. Preserve their identities when isolating paint.
    clone.userData={...source.userData};
  });
  // Keep camouflage, burn masks, weapon wear and every other wrapper of the source's hook chain, compiled over the
  // clone's own registration (runVehicleHookChain); only add a rim contribution to their final light.
  material.onBeforeCompile=function(shader,renderer){
    runVehicleHookChain(source,this,shader,renderer);
    shader.uniforms.juggernautStrength=shield.strength;shader.uniforms.juggernautTime=shield.time;
    shader.uniforms.energyColor=shield.color;shader.uniforms.energyPattern=shield.pattern;
    shader.uniforms.juggernautRootInverse=shield.rootInverse;shader.uniforms.juggernautHits=shield.hitPositions;shader.uniforms.juggernautActiveHits=shield.activeHits;
    shader.vertexShader=shader.vertexShader
      .replace('#include <common>','#include <common>\nuniform mat4 juggernautRootInverse;\nuniform float juggernautStrength;\nvarying vec3 vJuggernautPosition;')
      .replace('#include <project_vertex>',`#include <project_vertex>
        vJuggernautPosition = vec3(0.0);
        if (juggernautStrength > 0.0) {
          vec4 shieldPoint = vec4(transformed, 1.0);
          #ifdef USE_BATCHING
            shieldPoint = batchingMatrix * shieldPoint;
          #endif
          #ifdef USE_INSTANCING
            shieldPoint = instanceMatrix * shieldPoint;
          #endif
          vJuggernautPosition = (juggernautRootInverse * modelMatrix * shieldPoint).xyz;
        }
      `);
    shader.fragmentShader=shader.fragmentShader
      .replace('#include <common>',`#include <common>\nuniform float juggernautStrength;\nuniform float juggernautTime;\nuniform vec3 energyColor;\nuniform float energyPattern;\nuniform int juggernautActiveHits;\nuniform vec4 juggernautHits[${IMPACT_COUNT}];\nvarying vec3 vJuggernautPosition;`)
      .replace('#include <opaque_fragment>',`
        if (juggernautStrength > 0.0) {
        float juggernautRim = 1.0 - abs(dot(normal, normalize(vViewPosition)));
        juggernautRim *= juggernautRim;
        vec3 shieldSurface = vJuggernautPosition;
        float wave;
        if(energyPattern < 0.5) {
          wave = smoothstep(0.78, 1.0, sin(shieldSurface.z * 1.65 + shieldSurface.y * 2.6 - juggernautTime * 2.8
            + sin(shieldSurface.x * 2.4 + juggernautTime * 1.3)
            + sin(shieldSurface.z * 2.1 - juggernautTime * 0.8) * 0.4));
        } else if(energyPattern < 1.5) {
          wave = smoothstep(0.78,1.0,sin(shieldSurface.y*6.0-abs(shieldSurface.x)*3.5-juggernautTime*3.2));
          wave *= 0.7+0.3*sin(shieldSurface.z*3.0+juggernautTime);
        } else {
          float veins = sin(shieldSurface.x*4.2+sin(shieldSurface.z*3.5+juggernautTime))
            + sin(shieldSurface.y*5.6-shieldSurface.z*2.8-juggernautTime*1.6);
          wave = smoothstep(0.8,1.65,veins)*(0.7+0.3*sin(juggernautTime*2.2));
        }
        float hitGlow = 0.0;
        ${shield.preview ? '' : ENERGY_IMPACT_FRAGMENT}
        outgoingLight += energyColor * (0.055 + juggernautRim * 0.65 + wave * 0.6) * juggernautStrength
          + mix(energyColor,vec3(1.0),0.4) * hitGlow * 2.0;
        }
        #include <opaque_fragment>`);
  };
  // the source's key as it stands at each compile (a burn mask the source takes later re-keys the skin with it), and the
  // drawn material's object terms (a twin's instancing) come from the meshes that draw the skin, as for the twin
  const energyKey=shield.preview?ENERGY_PREVIEW_PROGRAM_KEY:ENERGY_PROGRAM_KEY;
  material.customProgramCacheKey=()=>source.customProgramCacheKey.call(source)+energyKey;
  // a skin ends with its paint (the visual's disposal) wherever it is: a parked Garage root, a detached battle root
  drawn.addEventListener('dispose',shield.dispose);
  highlightSources.set(material,drawn);
  shield.materials.set(drawn,material);return material;
}

/** Existing boss integration shares the same owned material lifecycle. */
export const syncJuggernautVisual = syncTankEnergyVisual;
