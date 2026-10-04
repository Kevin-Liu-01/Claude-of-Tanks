import * as THREE from 'three';

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
  surfaces:Surface[];materials:Map<THREE.Material,THREE.Material>;
  style:TankEnergyStyle;color:{value:THREE.Color};pattern:{value:number};
  strength:{value:number};time:{value:number};rootInverse:{value:THREE.Matrix4};
  impacts:Impact[];hitPositions:{value:THREE.Vector4[]};nextImpact:number;
  dispose:()=>void;refresh:()=>void;refreshIn:number;
}
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
  if(restoreSavedMaterials)root.traverse(object=>{
    if(!(object instanceof THREE.Mesh))return;
    const current=object.material;
    if(Array.isArray(current)){
      if(current.some(m=>highlightSources.has(m)))object.material=current.map(originalMaterial);
    }else object.material=originalMaterial(current);
  });
}

/** Shade the actual vehicle surfaces: no enclosing geometry, extra draw calls,
 * enlarged silhouette, or highlight through cover. Instancing, batching, moving
 * turrets and hidden/detached modules keep their original geometry and poses. */
export function syncTankEnergyVisual(root:THREE.Object3D,_dims:{widthM:number;hullLengthM:number;heightM:number},scale:number,hp:number,maxHp:number,dt:number,enlarge=true,style:TankEnergyStyle=TANK_ENERGY.juggernaut):void {
  const previous=scales.get(root)??1,visualScale=enlarge?scale:1;
  if(previous!==visualScale){root.scale.multiplyScalar(visualScale/previous);scales.set(root,visualScale);}
  let shield=shields.get(root);
  if(scale<=1||hp<=0){shield?.dispose();return;}
  if(!shield){
    const surfaces:Surface[]=[],materials=new Map<THREE.Material,THREE.Material>();
    const strength={value:0},time={value:0},rootInverse={value:new THREE.Matrix4()};
    const impacts=Array.from({length:IMPACT_COUNT},()=>({anchor:null as THREE.Object3D|null,local:new THREE.Vector3(),sample:new THREE.Vector4(0,0,0,-1)}));
    const dispose=()=>{
      for(const surface of surfaces){
        if(surface.mesh.material===surface.highlight)surface.mesh.material=surface.original;
      }
      // Existing vehicle shader hooks include CSM registrations keyed by the
      // source material. Recompile the restored source to rebind those hooks.
      for(const [source,material] of materials){source.needsUpdate=true;material.dispose();}
      for(const object of watched){
        object.removeEventListener('childadded',markDirty);
        object.removeEventListener('childremoved',markDirty);
      }
      watched.clear();materials.clear();surfaces.length=0;shields.delete(root);
      root.removeEventListener('removed',dispose);
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
    shield={surfaces,materials,strength,time,rootInverse,style,color:{value:new THREE.Color(style.color)},pattern:{value:style.pattern},impacts,hitPositions:{value:impacts.map(i=>i.sample)},nextImpact:0,dispose,refresh:()=>{
      if(topologyDirty){root.traverse(inspect);topologyDirty=false;}
      else for(const surface of surfaces)if(surface.mesh.material!==surface.highlight)inspect(surface.mesh);
    },refreshIn:0};
    shields.set(root,shield);root.addEventListener('removed',dispose);
  }
  if(shield.style!==style){
    shield.style=style;shield.color.value.setHex(style.color);shield.pattern.value=style.pattern;
    for(const material of shield.materials.values())material.name=style.name;
    for(const impact of shield.impacts){impact.anchor=null;impact.sample.w=-1;}
  }
  // Detail groups reattach as tanks approach. Discover those real surfaces at
  // a bounded cadence, without traversing the whole vehicle every frame.
  shield.refreshIn-=dt;
  if(shield.refreshIn<=0){shield.refresh();shield.refreshIn=.25;}
  const elapsed=Number.isFinite(dt)?Math.max(0,dt):0;
  shield.time.value+=elapsed;
  root.updateWorldMatrix(true,false);
  shield.rootInverse.value.copy(root.matrixWorld).invert();
  for(const impact of shield.impacts){
    if(!impact.anchor)continue;
    impact.sample.w+=elapsed;
    if(impact.sample.w>=IMPACT_DURATION){impact.anchor=null;impact.sample.w=-1;continue;}
    // Keep a turret/barrel hit on its moving part, even while the hull turns.
    impact.anchor.updateWorldMatrix(true,false);
    impactPoint.copy(impact.local).applyMatrix4(impact.anchor.matrixWorld).applyMatrix4(shield.rootInverse.value);
    impact.sample.set(impactPoint.x,impactPoint.y,impactPoint.z,impact.sample.w);
  }
  shield.strength.value=.55+.08*Math.sin(shield.time.value*1.8)+.3*Math.max(0,hp/Math.max(1,maxHp));
}

const impactPoint=new THREE.Vector3();
/** Shared solo/network shell events supply the real world-space contact. No
 * damage deduction is needed: ricochets also disturb the shield at contact. */
export function pulseJuggernautImpact(root:THREE.Object3D,pos:readonly number[],frame?:string):boolean {
  const shield=shields.get(root);
  if(!shield||pos.length<3||!Number.isFinite(pos[0])||!Number.isFinite(pos[1])||!Number.isFinite(pos[2]))return false;
  const rig=frame==='turret'?'rig_turret':frame==='gun'||frame==='barrel'?'rig_gun':null;
  const anchor=(rig&&root.getObjectByName(rig))||root;
  const impact=shield.impacts[shield.nextImpact]!;
  shield.nextImpact=(shield.nextImpact+1)%IMPACT_COUNT;
  root.updateWorldMatrix(true,false);anchor.updateWorldMatrix(true,false);
  impact.local.set(pos[0]!,pos[1]!,pos[2]!);anchor.worldToLocal(impact.local);impact.anchor=anchor;
  impactPoint.set(pos[0]!,pos[1]!,pos[2]!);root.worldToLocal(impactPoint);
  impact.sample.set(impactPoint.x,impactPoint.y,impactPoint.z,0);
  return true;
}

function highlightMaterial(source:THREE.Material,shield:Shield):THREE.Material {
  if(!(source instanceof THREE.MeshStandardMaterial)||!source.colorWrite||source.transparent)return source;
  const existing=shield.materials.get(source);if(existing)return existing;
  const material=source.clone();material.name=shield.style.name;
  // Shader drivers (especially the prewarmed burn uniforms) are live objects,
  // not serializable metadata. Preserve their identities when isolating paint.
  material.userData={...source.userData};
  // clone() omits custom shader hooks. Keep camouflage, burn masks, ambient
  // floor and shadow setup; only add a rim contribution to their final light.
  const compile=source.onBeforeCompile,cacheKey=source.customProgramCacheKey.call(source);
  material.onBeforeCompile=function(shader,renderer){
    compile.call(this,shader,renderer);
    shader.uniforms.juggernautStrength=shield.strength;shader.uniforms.juggernautTime=shield.time;
    shader.uniforms.energyColor=shield.color;shader.uniforms.energyPattern=shield.pattern;
    shader.uniforms.juggernautRootInverse=shield.rootInverse;shader.uniforms.juggernautHits=shield.hitPositions;
    shader.vertexShader=shader.vertexShader
      .replace('#include <common>','#include <common>\nuniform mat4 juggernautRootInverse;\nvarying vec3 vJuggernautPosition;')
      .replace('#include <project_vertex>',`#include <project_vertex>
        vec4 shieldPoint = vec4(transformed, 1.0);
        #ifdef USE_BATCHING
          shieldPoint = batchingMatrix * shieldPoint;
        #endif
        #ifdef USE_INSTANCING
          shieldPoint = instanceMatrix * shieldPoint;
        #endif
        vJuggernautPosition = (juggernautRootInverse * modelMatrix * shieldPoint).xyz;
      `);
    shader.fragmentShader=shader.fragmentShader
      .replace('#include <common>',`#include <common>\nuniform float juggernautStrength;\nuniform float juggernautTime;\nuniform vec3 energyColor;\nuniform float energyPattern;\nuniform vec4 juggernautHits[${IMPACT_COUNT}];\nvarying vec3 vJuggernautPosition;`)
      .replace('#include <opaque_fragment>',`
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
        for(int i = 0; i < ${IMPACT_COUNT}; i++) {
          float age = juggernautHits[i].w;
          if(age >= 0.0 && age < ${IMPACT_DURATION}) {
            vec3 offset = shieldSurface - juggernautHits[i].xyz;
            float d = length(offset);
            vec3 direction = offset / max(d, 0.0001);
            // Smooth 3-D lobes avoid a circular stamp or an angular seam.
            float rippleWarp = (sin(direction.x * 7.0 + direction.y * 5.0 + age * 10.0) * 0.15
              + sin(direction.z * 9.0 - direction.y * 6.0 - age * 7.0) * 0.10)
              * smoothstep(0.0, 0.28, age);
            float ring = exp(-pow((d - max(0.0, age * 2.4 + rippleWarp)) / 0.16, 2.0));
            float core = exp(-d * d * 8.0 - age * 7.0);
            float fade = 1.0 - smoothstep(0.25, ${IMPACT_DURATION}, age);
            hitGlow += (ring + core) * fade;
          }
        }
        hitGlow = min(hitGlow, 2.0);
        outgoingLight += energyColor * (0.055 + juggernautRim * 0.65 + wave * 0.6) * juggernautStrength
          + mix(energyColor,vec3(1.0),0.4) * hitGlow * 2.0;
        #include <opaque_fragment>`);
  };
  material.customProgramCacheKey=()=>cacheKey+'|tank-mode-energy-v5';
  highlightSources.set(material,source);
  shield.materials.set(source,material);return material;
}

/** Existing boss integration shares the same owned material lifecycle. */
export const syncJuggernautVisual = syncTankEnergyVisual;
