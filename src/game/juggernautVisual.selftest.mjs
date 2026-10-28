import assert from 'node:assert/strict';
import * as T from 'three';
import {syncJuggernautVisual,pulseJuggernautImpact,clearJuggernautVisual,parkGarageTankEnergyVisual,prepareGarageTankEnergyVisual,hasGarageTankEnergyVisual,syncTankEnergyVisual} from './juggernautVisual.ts';
import {createThermalVehicles} from '../engine/thermalVehicles.ts';
const dims={widthM:3,hullLengthM:7,heightM:2.6};
const scene=new T.Group(),root=new T.Group(),turret=new T.Group();scene.add(root);root.add(turret);root.scale.set(2,2,2);
const geometry=new T.BoxGeometry(),source=new T.MeshStandardMaterial({color:0x465734,alphaTest:.5});
const liveBurn={value:-1};source.userData.__burnU={uBurnT:liveBurn};
let hookCalls=0;source.onBeforeCompile=shader=>{hookCalls++;shader.uniforms.originalHook={value:1};};source.customProgramCacheKey=()=> 'original-camo-shadow-hook';
const hull=new T.Mesh(geometry,source),gun=new T.Mesh(geometry,source),tracks=new T.InstancedMesh(geometry,source,2);
root.add(hull,tracks);turret.add(gun);
const batch=new T.BatchedMesh(2,24,36,source);batch.addInstance(batch.addGeometry(geometry));root.add(batch);
const neighbor=new T.Mesh(geometry,source);scene.add(neighbor);
const glass=new T.Mesh(geometry,new T.MeshStandardMaterial({transparent:true,opacity:.3}));root.add(glass);const glassMaterial=glass.material;
const originalObjectCount=(()=>{let n=0;root.traverse(()=>n++);return n;})();
const update=(hp=100,scale=1.12,dt=.016)=>syncJuggernautVisual(root,dims,scale,hp,100,dt);
update();const material=hull.material;
assert.equal(material.userData.__burnU,source.userData.__burnU,'live burn driver identity preserved');
assert.ok(material !== source);assert.ok(gun.material === material);assert.ok(tracks.material === material);assert.ok(batch.material === material);
assert.ok(neighbor.material === source,'another tank sharing this paint stays unchanged');assert.ok(glass.material === glassMaterial);
assert.equal(material.alphaTest,.5);assert.equal(material.depthTest,true);assert.equal(material.depthWrite,true);
assert.ok(hull.geometry === geometry);assert.ok(tracks.geometry === geometry);
assert.ok(root.getObjectByName('Juggernaut energy shield') === undefined,'no enclosing shell');
let count=0;root.traverse(()=>count++);assert.equal(count,originalObjectCount,'no extra objects or draw calls');
const shader={vertexShader:T.ShaderLib.standard.vertexShader,fragmentShader:T.ShaderLib.standard.fragmentShader,uniforms:{}};
material.onBeforeCompile(shader,{});assert.equal(hookCalls,1);assert.equal(shader.uniforms.originalHook.value,1);
assert.match(shader.fragmentShader,/outgoingLight \+=/);assert.match(material.customProgramCacheKey(),/^original-camo-shadow-hook\|/);
assert.equal(source.name,'');assert.equal(source.emissive.getHex(),0);
turret.name='rig_turret';turret.rotation.y=1.1;gun.position.z=3;root.updateMatrixWorld(true);const position=gun.getWorldPosition(new T.Vector3());
update();assert.ok(hull.material === material,'reuse materials across frames');assert.ok(gun.getWorldPosition(new T.Vector3()).equals(position),'articulation preserved');
const lateDetail=new T.Mesh(geometry,source);turret.add(lateDetail);update(100,1.12,.3);assert.ok(lateDetail.material === material,'newly resident detail receives the same highlight');
tracks.visible=false;update();assert.equal(tracks.visible,false,'hidden/destroyed tracks stay hidden');
const hits=shader.uniforms.juggernautHits.value;
const hitWorld=new T.Vector3(.3,.4,.2);turret.localToWorld(hitWorld);
assert.equal(pulseJuggernautImpact(root,hitWorld.toArray(),'turret'),true);
assert.equal(shader.uniforms.juggernautActiveHits.value,1,'one impact bounds the shader loop to one slot');
assert.equal(hits[0].w,0);assert.ok(hits.slice(1).every(h=>h.w<0),'one hit lights only one contact');
const originalHit=hits[0].clone();turret.rotation.y+=.6;root.position.set(17,0,29);root.rotation.y=.9;update(80);
const expected=root.worldToLocal(turret.localToWorld(new T.Vector3(.3,.4,.2)));
assert.ok(expected.distanceTo(new T.Vector3(hits[0].x,hits[0].y,hits[0].z))<1e-6,'contact follows turret and moving/turning hull');
assert.notEqual(originalHit.x,hits[0].x,'turret motion changes hit coordinate in hull space');
const beforePause=hits[0].w,time=shader.uniforms.juggernautTime.value;update(80,1.12,0);assert.equal(hits[0].w,beforePause);assert.equal(shader.uniforms.juggernautTime.value,time,'waves pause with presentation');
assert.equal(pulseJuggernautImpact(root,[NaN,0,0]),false);assert.equal(pulseJuggernautImpact(neighbor,[0,0,0]),false);
for(let i=0;i<20;i++)pulseJuggernautImpact(root,[i,1,0]);
assert.equal(hits.length,6,'rapid hits use a bounded reusable pool');assert.ok(hits.every(h=>h.w===0));
update(80,1.12,1.3);assert.ok(hits.every(h=>h.w===-1),'all rings expire');
assert.equal(shader.uniforms.juggernautActiveHits.value,0,'idle shader skips the entire hit loop');
assert.doesNotMatch(shader.fragmentShader,/exp\(-pow|exp\(-d \* d/,'impact falloffs avoid expensive Gaussian powers');
update(60);assert.ok(hits.every(h=>h.w===-1),'HP loss without a contact never creates a fake whole-tank pulse');
assert.match(shader.vertexShader,/batchingMatrix \* shieldPoint/);assert.match(shader.vertexShader,/instanceMatrix \* shieldPoint/);
assert.match(shader.fragmentShader,/shieldSurface - juggernautHits/);assert.match(shader.fragmentShader,/rippleWarp/);assert.match(shader.fragmentShader,/juggernautTime \* 2.8/);
const thermal=createThermalVehicles();thermal.begin([{team:'enemy',visual:{root},combat:{}}],true,'ally');assert.ok(hull.material !== material);thermal.end();assert.ok(hull.material === material);
let disposed=0;material.addEventListener('dispose',()=>disposed++);
update(0);assert.ok(hull.material === source,'dead tank stops glowing');assert.equal(disposed,1);assert.ok(gun.material === source);
update();assert.ok(hull.material !== material,'respawn gets a fresh highlight');
const wreck=new T.MeshStandardMaterial({color:0x111111});gun.material=wreck;
update(100,1);assert.ok(hull.material === source);assert.ok(gun.material === wreck,'mode exit never overwrites damage material changes');assert.deepEqual(root.scale.toArray(),[2,2,2]);
gun.material=source;update();let removed=0;hull.material.addEventListener('dispose',()=>removed++);const keptSkin=hull.material;
// (mode-sheen-perf-243) leaving the scene is not the end of a skin (a spotting edge detaches an unseen enemy's root, a warm
// attaches one for a moment): disposing it there freed its programs, and each re-spot linked them again on the frame
root.removeFromParent();assert.equal(removed,0,'a detached root keeps its skin');scene.add(root);update();
assert.ok(hull.material === keptSkin,'and draws the same skin back: no new material, no program');
clearJuggernautVisual(root);assert.equal(removed,1);assert.ok(hull.material === source,'pooled visual is clean on its explicit clear');
scene.add(root);update();assert.equal(root.scale.x,2.24,'rematch never compounds the boss size');update(100,1);
update();pulseJuggernautImpact(root,[0,1,0]);clearJuggernautVisual(root);clearJuggernautVisual(root);
assert.ok(hull.material === source);assert.equal(root.scale.x,2);assert.equal(pulseJuggernautImpact(root,[0,1,0]),false,'garage cleanup removes all live ripple state');
update();const freshShader={uniforms:{},vertexShader:T.ShaderLib.standard.vertexShader,fragmentShader:T.ShaderLib.standard.fragmentShader};hull.material.onBeforeCompile(freshShader,{});
assert.ok(freshShader.uniforms.juggernautHits.value.every(h=>h.w<0),'next match starts without old ripples');clearJuggernautVisual(root);
// Stable models do not incur periodic whole-tree traversal. Material repair
// and streamed attachment groups still join the existing effect.
scene.add(root);let scans=0;const walk=root.traverse.bind(root);
root.traverse=visit=>{scans++;walk(visit);};
update();const initialScans=scans;
for(let i=0;i<120;i++)update(100,1.12,1/60);
assert.equal(scans,initialScans,'stationary topology requires no repeat full-model scans');
hull.material=source;update(100,1.12,.3);
assert.ok(hull.material !== source,'material-only repair is discovered by the flat binding audit');
const detailGroup=new T.Group();detailGroup.add(new T.Mesh(geometry,source));turret.add(detailGroup);
update(100,1.12,.3);
assert.ok(detailGroup.children[0].material === hull.material,'streamed subtrees acquire energy');
clearJuggernautVisual(root);
assert.equal(root._listeners.childadded.length,0,'effect cleanup releases hierarchy observers');

geometry.dispose();batch.dispose();source.dispose();wreck.dispose();glassMaterial.dispose();

// 2026-10-19 (the 229 perf pass, critic r1): a skin a wreck snapshot put back unwraps onto the twin the mesh drew, not the
// original (programVariants.ts). (mode-sheen-perf-243) A twin wears a skin of its own: one skin over the original and its
// twins drew two program variants again, and three re-resolved its program at each flip (every frame, every skinned tank)
{
  const {splitProgramVariants,programVariantOf}=await import('../engine/programVariants.ts');
  const tank=new T.Group(),paint=new T.MeshStandardMaterial({color:0x445533}),box=new T.BoxGeometry();
  const plate=new T.Mesh(box,paint),wheels=new T.InstancedMesh(box,paint,4);tank.add(plate,wheels);
  tank.userData.programVariants=splitProgramVariants(tank);
  const twin=wheels.material;assert.ok(twin !== paint,'the instanced draw has its own twin');
  syncJuggernautVisual(tank,dims,1.12,100,100,.016);
  const skin=plate.material,twinSkin=wheels.material;assert.ok(skin !== paint&&twinSkin !== twin);
  assert.ok(twinSkin !== skin,'the twin wears a skin of its own');
  for(const [mesh,material] of [[plate,skin],[wheels,twinSkin]])assert.equal(programVariantOf(mesh,material),programVariantOf(mesh,mesh===plate?paint:twin),'each skin keeps its mesh\'s variant');
  assert.equal(twinSkin.customProgramCacheKey(),skin.customProgramCacheKey(),'under the one program key (the variant is the mesh\'s)');
  syncJuggernautVisual(tank,dims,1.12,0,100,.016);
  assert.ok(plate.material === paint);assert.ok(wheels.material === twin,'the kill ends the skin: each mesh its own material');
  plate.material=skin;wheels.material=twinSkin; // the wreck snapshot taken while skinned puts the skins back
  clearJuggernautVisual(tank,true);
  assert.ok(plate.material === paint);assert.ok(wheels.material === twin,'the Garage handoff re-seats the twin, never the original');
  box.dispose();paint.dispose();
}

// ---- 2026-10-17 (the wheel-band lane; the owner: "in garage, on all tanks, i can see this weird shadow on wheels"): the
// skin's clones keep the vehicle's cascade registration. A raw clone() reset the defines (USE_CSM, CSM_*, COT_CLOUD_SHADE
// and the vehicle's COT_* switches) and ran the source's CSM hook, which keeps the compiled shader under the SOURCE in
// the cascade registry: every Garage tank pixel (the dormant skin is on every pedestal tank) lit with all four cascade
// suns unshadowed and wrote neither the sun state nor the vehicle tag, and the ground occlusion
// (vehicleGroundOcclusion.ts) took the untagged road wheels for ground under the hull: a dark band below the belly line.
// Real cascade rig (lighting.ts), vehicle registrations (materials.ts) and their later wrappers (the burn mask, the
// weapon wear); the Garage's dormant skin and the battle's live one.
{
  globalThis.window??={localStorage:{getItem:()=>null,setItem(){},removeItem(){}},location:{search:''}};
  const {createLighting}=await import('../engine/lighting.ts');
  const {registerVehicleMaterial,cloneVehicleMaterial,applyBurnHook,makeBurnUniforms,vehicleAmbientFloorHook}=await import('../vehicles/materials.ts');
  const {installWeaponEdgeWear,WEAPON_STEEL_WEAR}=await import('../vehicles/weaponFinish.ts');
  const {prepareGarageTankEnergyVisual,syncTankEnergyVisual}=await import('./juggernautVisual.ts');
  const camera=new T.PerspectiveCamera(60,16/9,.5,4000);camera.position.set(0,3,-8);camera.lookAt(0,1,0);camera.updateMatrixWorld();
  const rig=createLighting(new T.Scene(),camera,new T.Vector3(1,.7,.4).normalize());rig.updateFrustums();
  const csm=rig.csm,engineCtx={setupShadowMaterial:(m,hook)=>rig.setupShadowMaterial(m,hook),releaseShadowMaterial:m=>rig.releaseShadowMaterial(m)};
  const errors=[],consoleError=console.error;console.error=(...a)=>{errors.push(a.join(' '));};
  try{
    const compiled=()=>({uniforms:T.UniformsUtils.clone(T.ShaderLib.standard.uniforms),vertexShader:T.ShaderLib.standard.vertexShader,fragmentShader:T.ShaderLib.standard.fragmentShader});
    const register=(defines={},envMapIntensity=.5)=>{
      const m=new T.MeshStandardMaterial({color:0x4b5a36});m.envMapIntensity=envMapIntensity;m.defines={...m.defines,...defines};
      return registerVehicleMaterial(engineCtx,m,'veh-ambient-floor-v5');
    };
    const burnU=makeBurnUniforms(7);
    const sources={
      paint:register(),
      wheel:register({COT_WHEEL_PAINT_READABILITY:1},.25),
      cavity:register({COT_GEAR_CAVITY:1},.25),
      burning:register(),
      steel:register({},.45),
    };
    assert.equal(applyBurnHook(sources.burning,burnU),true);
    installWeaponEdgeWear(sources.steel,{...WEAPON_STEEL_WEAR,wornColor:[...WEAPON_STEEL_WEAR.wornColor],dustColor:[...WEAPON_STEEL_WEAR.dustColor]});
    // a profile's hook-only material (no cascade registration of its own): its clone keeps its hook, and nothing reports
    const hookOnly=new T.MeshStandardMaterial();hookOnly.onBeforeCompile=vehicleAmbientFloorHook;hookOnly.customProgramCacheKey=()=>'veh-ambient-floor-v2';
    const sourceShaders=new Map();
    for(const m of Object.values(sources)){
      assert.equal(m.defines.USE_CSM,1,'a registered vehicle material compiles the cascade branch');
      const shader=compiled();m.onBeforeCompile(shader,{});sourceShaders.set(m,shader);
      assert.equal(csm.shaders.get(m),shader,'the cascade refreshes the source\'s own compile');
    }
    const box=new T.BoxGeometry(),dims={widthM:3,hullLengthM:7,heightM:2.6};
    const build=()=>{
      const r=new T.Group(),meshes=new Map();
      for(const [k,m] of [...Object.entries(sources),['hookOnly',hookOnly]]){const mesh=new T.Mesh(box,m);r.add(mesh);meshes.set(k,mesh);}
      return {root:r,meshes};
    };
    const check=(label,{meshes},keySuffix)=>{
      const clones=[];
      for(const [k,src] of Object.entries(sources)){
        const clone=meshes.get(k).material,at=`${label}/${k}`;
        assert.ok(clone !== src,`${at}: the skin draws a clone`);clones.push([src,clone]);
        assert.equal(clone.defines.USE_CSM,1,`${at}: the clone compiles the cascade branch (the sun state and the vehicle tag live there)`);
        assert.equal(clone.defines.CSM_CASCADES,src.defines.CSM_CASCADES,`${at}: with the source's cascade count`);
        assert.equal('CSM_FADE' in clone.defines,'CSM_FADE' in src.defines,`${at}: and its cascade fade`);
        assert.equal('COT_CLOUD_SHADE' in clone.defines,'COT_CLOUD_SHADE' in src.defines,`${at}: and its cloud shade`);
        for(const key of ['COT_WHEEL_PAINT_READABILITY','COT_GEAR_CAVITY'])assert.equal(clone.defines[key],src.defines[key],`${at}: the source's ${key}`);
        assert.ok(csm.shaders.has(clone),`${at}: in the cascade registry under its own entry`);
        assert.equal(clone.color,src.color,`${at}: live paint binding kept`);
        const shader=compiled();clone.onBeforeCompile(shader,{});
        assert.equal(csm.shaders.get(clone),shader,`${at}: the cascade refreshes the clone's compile, under the clone`);
        assert.equal(csm.shaders.get(src),sourceShaders.get(src),`${at}: and leaves the source's entry as it was`);
        assert.ok(shader.fragmentShader.includes('gl_FragColor.a += 2.0;'),`${at}: the vehicle tag write`);
        assert.ok(shader.fragmentShader.includes('juggernautStrength'),`${at}: under the skin's rim term`);
        assert.ok(shader.uniforms.CSM_cascades&&shader.uniforms.shadowFar,`${at}: the cascade uniforms bind`);
        assert.equal(clone.customProgramCacheKey(),src.customProgramCacheKey()+keySuffix,`${at}: the source's program key, the skin's suffix`);
        if(k==='burning'){
          assert.equal(shader.uniforms.uBurnT,burnU.uBurnT,`${at}: the source's burn mask still wraps it (its live driver)`);
          assert.match(clone.customProgramCacheKey(),/\|burn-r8\|/);
        }
        if(k==='steel'){
          assert.ok(shader.fragmentShader.includes('uWeaponWornColor'),`${at}: the source's weapon wear still wraps it`);
          assert.match(clone.customProgramCacheKey(),/\|weapon-wear-v3\|/);
        }
      }
      const kept=meshes.get('hookOnly').material;
      assert.ok(!kept.defines?.USE_CSM&&!csm.shaders.has(kept),`${label}: a hook-only source's clone stays as its source`);
      return clones;
    };
    const garage=build();
    prepareGarageTankEnergyVisual(garage.root,dims);
    const garageClones=check('garage dormant skin',garage,'|tank-mode-energy-preview-v2');
    const battle=build();
    syncTankEnergyVisual(battle.root,dims,1.12,100,100,0,false,(await import('./juggernautVisual.ts')).TANK_ENERGY.juggernaut,false);
    const battleClones=check('battle live skin',battle,'|tank-mode-energy-v7');
    // the cascade's refresh reaches the clone's program (its far plane, its splits), not only the source's
    camera.far=3000;camera.updateProjectionMatrix();rig.updateFrustums();
    for(const [,clone] of garageClones)assert.equal(csm.shaders.get(clone).uniforms.shadowFar.value,Math.min(3000,csm.maxFar),'the cascade refresh reaches each clone');
    clearJuggernautVisual(garage.root,true);clearJuggernautVisual(battle.root);
    for(const [src,clone] of [...garageClones,...battleClones]){
      assert.ok(!csm.shaders.has(clone),'a released skin leaves no cascade entry behind');
      assert.equal(csm.shaders.get(src),sourceShaders.get(src),'and the source keeps its own');
    }
    for(const mesh of [...garage.meshes.values(),...battle.meshes.values()])assert.ok(Object.values(sources).includes(mesh.material)||mesh.material===hookOnly,'the paint is restored');
    assert.deepEqual(errors,[],'every skinned source carries a vehicle registration');
    // fail loudly: a cascade material registered outside the vehicle registration cannot pass its registration to a clone
    const stray=new T.MeshStandardMaterial();rig.setupShadowMaterial(stray,vehicleAmbientFloorHook);
    const strayClone=cloneVehicleMaterial(stray);
    assert.equal(errors.length,1,'a clone of an unregistered cascade material is reported');
    assert.match(errors[0],/\[vehicle material\].*registerVehicleMaterial/);
    assert.equal(strayClone.defines.USE_CSM,undefined,'(it lost USE_CSM)');
    cloneVehicleMaterial(stray);assert.equal(errors.length,1,'once per source');
    box.dispose();for(const m of [...Object.values(sources),hookOnly,stray,strayClone])m.dispose();
  }finally{console.error=consoleError;}
}
// ---- (mode-sheen-perf-243; the owner: "that juggernaut/ctf/zombie sheen ... super laggy rn and the first moment u enter it
// if its not loaded in is a guaranteed lag spike"): in a battle whose mode can light any tank the skin goes on dormant at
// the tank's staging, where its programs compile behind the cover, and stays: a role, a kill, a respawn, a spotting edge
// and the ending only write uniforms. No material is made after the staging, so no program links on a battle frame.
{
  const {splitProgramVariants,programVariantOf}=await import('../engine/programVariants.ts');
  const {syncTankEnergyVisual,TANK_ENERGY,pulseJuggernautImpact,clearJuggernautVisual}=await import('./juggernautVisual.ts');
  const {applyBurnHook,makeBurnUniforms}=await import('../vehicles/materials.ts');
  const compiled=()=>({uniforms:{},vertexShader:T.ShaderLib.standard.vertexShader,fragmentShader:T.ShaderLib.standard.fragmentShader});
  const world=new T.Scene(),tank=new T.Group(),paint=new T.MeshStandardMaterial({color:0x445533}),box=new T.BoxGeometry();
  paint.name='hull paint';
  const hull=new T.Mesh(box,paint),wheels=new T.InstancedMesh(box,paint,4),turret=new T.Group(),gun=new T.Mesh(box,paint);
  turret.name='rig_turret';turret.add(gun);tank.add(hull,wheels,turret);world.add(tank);
  tank.userData.programVariants=splitProgramVariants(tank);
  const sync=(scale,hp,dt=.016,style=TANK_ENERGY.flagOwn)=>syncTankEnergyVisual(tank,dims,scale,hp,100,dt,false,style,false,true);
  assert.equal(sync(1,100,0),true,'the staging installs the dormant skin: its programs for the warm to compile');
  const skins=new Map([[hull,hull.material],[wheels,wheels.material],[gun,gun.material]]);
  for(const [mesh,skin] of skins)assert.ok(skin!==paint&&skin.isMeshStandardMaterial,'every opaque surface wears its skin');
  assert.ok(gun.material===hull.material&&wheels.material!==hull.material,'one skin a drawn material (the instanced twin its own)');
  const drawnBy=new Map();
  tank.traverse(o=>{if(!o.isMesh)return;const set=drawnBy.get(o.material)??new Set();set.add(programVariantOf(o,o.material));drawnBy.set(o.material,set);});
  for(const set of drawnBy.values())assert.equal(set.size,1,'every skin draws with one program variant: no per-draw re-resolution');
  const shader=compiled();hull.material.onBeforeCompile(shader,{});
  assert.equal(shader.uniforms.juggernautStrength.value,0,'dormant: zero strength');
  assert.match(shader.fragmentShader,/if \(juggernautStrength > 0\.0\) \{\s+float juggernautRim/,'everything the skin adds sits under its strength: a dormant skin is its paint');
  assert.match(shader.vertexShader,/vJuggernautPosition = vec3\(0\.0\);\s+if \(juggernautStrength > 0\.0\)/,'the hull-frame position too');
  assert.equal(hull.material.name,'hull paint','a dormant skin wears its paint\'s name');
  assert.equal(pulseJuggernautImpact(tank,[0,1,0]),false,'a dormant skin takes no ripple');
  let disposed=0;for(const skin of new Set(skins.values()))skin.addEventListener('dispose',()=>disposed++);
  tank.removeFromParent();sync(1,100);world.add(tank);sync(1,100);
  assert.equal(disposed,0,'a spotting edge never ends the skin');
  assert.equal(sync(1.12,100),false,'a role lights it without a new material');
  for(const [mesh,skin] of skins)assert.ok(mesh.material===skin,'the role lights the skin the tank already wears');
  assert.ok(shader.uniforms.juggernautStrength.value>0,'only its strength moves');
  assert.equal(hull.material.name,TANK_ENERGY.flagOwn.name,'a lit skin wears its style\'s name');
  assert.equal(pulseJuggernautImpact(tank,[0,1,0],'turret'),true,'a lit skin ripples');
  assert.equal(sync(1.12,100,.016,TANK_ENERGY.infected),false,'a style change (a conversion) is uniforms too');
  assert.equal(shader.uniforms.energyPattern.value,TANK_ENERGY.infected.pattern);
  assert.equal(sync(1.12,0),false,'the kill makes nothing');
  for(const [mesh,skin] of skins)assert.ok(mesh.material===skin,'and keeps the skin');
  assert.equal(shader.uniforms.juggernautStrength.value,0);assert.equal(shader.uniforms.juggernautActiveHits.value,0,'its ripples end');
  const burnt=new T.MeshStandardMaterial({color:0x111111});gun.material=burnt;
  sync(1.12,0,1);sync(1,100,1);
  assert.ok(gun.material===burnt,'a dormant skin never rescans: the wreck\'s swaps (and a damage state\'s) are left alone');
  gun.material=skins.get(gun); // the respawn's repair restores what the wreck captured
  assert.equal(sync(1.12,100),false,'the respawn lights the same skins');
  const detail=new T.Mesh(box,paint);turret.add(detail);sync(1.12,100,.3);
  assert.ok(detail.material===hull.material,'a lit skin still takes a newly attached detail, with the skin already made');
  assert.equal(syncTankEnergyVisual(tank,dims,1,0,1,.016,true,TANK_ENERGY.juggernaut,false,true),false,'the ending: dormant, nothing made');
  assert.equal(disposed,0,'a whole battle: no skin disposed');
  clearJuggernautVisual(tank,true);
  assert.equal(disposed,2,'the battle\'s exit ends both skins');
  assert.ok(hull.material===paint&&gun.material===paint&&detail.material===paint&&wheels.material!==paint&&wheels.material.isMeshStandardMaterial,'each mesh its paint (the twin its twin)');
  // a skin ends with its paint when nothing clears it (a visual disposed while parked or detached)
  sync(1,100,0);const orphan=hull.material;let orphanDisposed=0;orphan.addEventListener('dispose',()=>orphanDisposed++);
  tank.removeFromParent();paint.dispose();
  assert.equal(orphanDisposed,1,'the paint\'s disposal ends its skin');
  // one burn mask a program: the staging hooks the skin, the kill's sweep later its paint (a detail mesh still wearing it)
  const paint2=new T.MeshStandardMaterial(),plate=new T.Mesh(box,paint2),other=new T.Group();other.add(plate);
  syncTankEnergyVisual(other,dims,1,100,100,0,false,TANK_ENERGY.juggernaut,false,true);
  const skin=plate.material,burnU=makeBurnUniforms(3);
  assert.equal(applyBurnHook(skin,burnU),true,'the staging burn hook goes onto the skin the mesh wears');
  assert.equal(applyBurnHook(paint2,burnU),true,'and the sweep\'s onto its paint');
  const burnt2=compiled();skin.onBeforeCompile(burnt2,{});
  assert.equal(burnt2.vertexShader.split('varying vec3 vBrnW;').length-1,1,'one burn mask in the skin\'s program');
  assert.equal(burnt2.uniforms.uBurnT,burnU.uBurnT,'driven by the visual\'s own burn');
  assert.match(skin.customProgramCacheKey(),/\|burn-r8\|tank-mode-energy-v7\|burn-r8$/,'its key names both hooks (one text a key)');
  clearJuggernautVisual(other,true);box.dispose();paint2.dispose();burnt.dispose();
}

// transitions-249: a battle start parks the Garage hero's dormant skin (off its meshes, kept with its materials and so
// its programs); the clears on the way back leave it; the Garage's prepare puts the same materials back on; a battle
// mode that lights the tank, or the paint's disposal, ends it as before
{
 const root=new T.Group(),paint=new T.MeshStandardMaterial(),mesh=new T.Mesh(new T.BoxGeometry(),paint);root.add(mesh);
 prepareGarageTankEnergyVisual(root,dims);
 const skin=mesh.material;
 assert.ok(skin!==paint&&hasGarageTankEnergyVisual(root),'the dormant Garage skin');
 let disposed=0;skin.addEventListener('dispose',()=>disposed++);
 parkGarageTankEnergyVisual(root);
 assert.ok(mesh.material===paint,'a parked skin is off the meshes: the battle draws its own paint');
 clearJuggernautVisual(root);clearJuggernautVisual(root,true);
 assert.equal(disposed,0,'the battle-end clears leave a parked skin');
 assert.ok(mesh.material===paint);
 prepareGarageTankEnergyVisual(root,dims);
 assert.ok(mesh.material===skin,'the Garage puts the same skin back: its programs are the ones it linked');
 assert.equal(disposed,0);
 parkGarageTankEnergyVisual(root);
 syncTankEnergyVisual(root,dims,1.12,100,100,.016);
 assert.equal(disposed,1,'a battle mode that lights the tank ends a parked Garage skin');
 clearJuggernautVisual(root,true);
 const other=new T.Group(),otherPaint=new T.MeshStandardMaterial(),otherMesh=new T.Mesh(new T.BoxGeometry(),otherPaint);other.add(otherMesh);
 prepareGarageTankEnergyVisual(other,dims);
 const otherSkin=otherMesh.material;let otherDisposed=0;otherSkin.addEventListener('dispose',()=>otherDisposed++);
 parkGarageTankEnergyVisual(other);otherPaint.dispose();
 assert.equal(otherDisposed,1,'the paint\'s disposal ends a parked skin');
 assert.ok(!hasGarageTankEnergyVisual(other));
 const bare=new T.Group(),bareMesh=new T.Mesh(new T.BoxGeometry(),new T.MeshStandardMaterial());bare.add(bareMesh);
 syncJuggernautVisual(bare,dims,1.12,100,100,.016);
 const aura=bareMesh.material;let auraDisposed=0;aura.addEventListener('dispose',()=>auraDisposed++);
 parkGarageTankEnergyVisual(bare);
 assert.equal(auraDisposed,1,'anything but a Garage skin ends as a clear would');
}
{
 const {readFileSync}=await import('node:fs');
 const main=readFileSync(new URL('../main.ts',import.meta.url),'utf8');
 assert.match(main,/bus\.on\('ui:battleStart', \(\) => \{[\s\S]{0,400}parkGarageTankEnergyVisual\(pedestal\.current\.root\);\s*garageModePreview\.clear\(\);/,
  'a battle start parks the hero\'s Garage skin before the mode preview clears');
 assert.match(main,/releaseVisual: \(visual\) => parkGarageTankEnergyVisual\(visual\.root\)/,'the lend parks it on every entry path');
 const pedestal=readFileSync(new URL('./garagePedestalRuntime.ts',import.meta.url),'utf8');
 assert.match(pedestal,/const revealCached = \(\) => \{[\s\S]{0,400}prepareVisual\?\.\(cached, getSpec\(specId\)\);\s*current = cached;/,
  'a cached hero shown again wears its skin before it shows');
}

console.log('juggernautVisual: exact surfaces, instancing/batching, shared paint isolation, original hooks, articulation, hit pulse, thermal, death, removal and reuse passed; the skins keep the cascade registration; dormant battle skins make no material after staging');
