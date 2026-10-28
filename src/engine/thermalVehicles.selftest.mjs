import assert from 'node:assert/strict';
import {Group,Mesh,BoxGeometry,MeshStandardMaterial,ShaderLib} from 'three';
import {createThermalVehicles,HEAT_FRIENDLY,heatStandIn} from './thermalVehicles.ts';
// (fx-ir-hull-heat-229) a stand-in's heat uniforms, through its compile hook on three's standard shaders
const heatOf=(m)=>{const sh={uniforms:{},vertexShader:ShaderLib.standard.vertexShader,fragmentShader:ShaderLib.standard.fragmentShader};m.onBeforeCompile(sh,{});return sh.uniforms.uHeatK.value;};
const scene=new Group(),source=new MeshStandardMaterial({color:0x476234,alphaTest:.5}),geometry=new BoxGeometry();
const actors=Array.from({length:5},(_,i)=>{
 const root=new Group(),mesh=new Mesh(geometry,source);root.add(mesh);scene.add(root);
 return {team:i?'enemy':'ally',visual:{root},combat:{destroyed:i===3},networkVisible:i!==2,mesh};
});
actors[4].visual.root.visible=false;
const heat=createThermalVehicles();
heat.begin(actors,false,'ally');assert.ok(actors[1].mesh.material === source);
heat.begin(actors,true,'ally');
const enemy=actors[1].mesh.material,ally=actors[0].mesh.material;
assert.ok(enemy !== source);assert.ok(heatOf(enemy).z===1&&heatOf(ally).z===HEAT_FRIENDLY,'a hostile hull hotter than a friend');
assert.equal(enemy.alphaTest,.5);assert.equal(enemy.depthTest,true,'heat respects wall and terrain occlusion');
for(const i of [2,3,4])assert.ok(actors[i].mesh.material === source,'unseen, destroyed and hidden actors get no hot treatment');
assert.equal(source.emissive.r,0,'original shared material remains untouched');
heat.end();for(const actor of actors)assert.ok(actor.mesh.material === source);
heat.begin(actors,true,'ally');assert.ok(actors[1].mesh.material === enemy,'cached material reused');heat.end();
let disposed=0;enemy.addEventListener('dispose',()=>disposed++);source.dispose();assert.equal(disposed,1,'cache follows source lifetime');geometry.dispose();
console.log('thermalVehicles: visibility, depth, cutouts, friends, original restoration, reuse and disposal passed');

// Cold loading primes the exact owner later used by battle frames, including
// locally staged hidden opponents without exposing them at a checkpoint.
{
 const source=new MeshStandardMaterial(), root=new Group(), mesh=new Mesh(new BoxGeometry(),source);
 new Group().add(root);root.add(mesh);root.visible=false;
 const actor={team:'enemy',networkVisible:false,visual:{root}}, heat=createThermalVehicles();
 let prepared=0, warmedMaterial;
 function* prepare(node){
  assert.ok(node === root);assert.equal(root.visible,true);
  assert.equal(mesh.frustumCulled,false,'off-camera tanks exercise draw-time bindings too');
  assert.ok(mesh.material !== source);warmedMaterial=mesh.material;
  prepared++;yield;
  assert.ok(mesh.material === warmedMaterial,'same variant on continuation');
 }
 const steps=heat.warmSteps([actor],'ally',prepare);
 for(const _ of steps){
  assert.equal(root.visible,false);assert.ok(mesh.material === source);
  assert.equal(mesh.frustumCulled,true);
  heat.begin([actor],true,'ally');assert.ok(mesh.material === source);heat.end();
 }
 root.visible=true;actor.networkVisible=true;
 heat.begin([actor],true,'ally');assert.ok(mesh.material === warmedMaterial,'first live infrared frame makes no stand-in: the warmed one');heat.end();
 assert.equal([...heat.warmSteps([actor],'ally',prepare)].length,0,'completed warm reused');
 heat.invalidateWarm();root.visible=false;
 const cancelled=heat.warmSteps([actor],'ally',prepare);cancelled.next();cancelled.return();
 assert.equal(root.visible,false);assert.ok(mesh.material === source);
 assert.throws(()=>[...heat.warmSteps([actor],'ally',function*(){throw Error('GPU failure');})],/GPU failure/);
 assert.equal(root.visible,false);assert.ok(mesh.material === source);assert.equal(mesh.frustumCulled,true);
 [...heat.warmSteps([actor],'ally',prepare)];
 assert.equal(prepared,3,'context restore and cancelled warm can retry');
 root.visible=true;heat.begin([actor],true,'ally');assert.ok(mesh.material === warmedMaterial,'context restore retains CPU material cache');heat.end();
 source.dispose();mesh.geometry.dispose();
}
console.log('thermalVehicles: cold preparation, zero switch-time clones, hidden actors, cancellation, failure and context restore passed');

// 2026-10-18 (the wheel-band lane, round 3): a heat stand-in writes the vehicle alpha on an opaque draw, or the aerial
// pass's ground occlusion takes a hot hull's running gear under the belly line for ground (a cold band at the belly
// + 2 cm in the sensor view); a blended stand-in keeps its alpha
{
 const fragmentOf=(material)=>{
  const shader={vertexShader:ShaderLib.standard.vertexShader,fragmentShader:ShaderLib.standard.fragmentShader,uniforms:{}};
  material.onBeforeCompile(shader,{});return shader.fragmentShader;
 };
 const opaque=new MeshStandardMaterial(),glass=new MeshStandardMaterial({transparent:true,opacity:.4});
 const root=new Group();root.add(new Mesh(new BoxGeometry(),opaque),new Mesh(new BoxGeometry(),glass));new Group().add(root);
 const heat=createThermalVehicles();heat.begin([{team:'enemy',visual:{root}}],true,'ally');
 const [hot,hotGlass]=root.children.map((mesh)=>mesh.material);
 assert.ok(hot !== opaque);assert.ok(hotGlass !== glass);
 assert.match(fragmentOf(hot),/#ifdef OPAQUE\s*gl_FragColor\.a = 5\.0;\s*#endif/,'the heat stand-in writes the unlit vehicle tag (2 + sun 1 + tag 2) on opaque draws');
 assert.match(fragmentOf(hot),/totalEmissiveRadiance = vec3\( cotHeatEmission\(\) \) \* \( 0\.62 \+ 0\.38 \* abs\( normal\.z \) \)/,'and keeps its heat falloff (fx-ir-hull-heat-229: on the hull\'s heat map)');
 assert.equal(hot.customProgramCacheKey(),'thermal-vehicle-v3');
 assert.equal(hotGlass.transparent,true,'a blended stand-in stays blended (no OPAQUE define: its alpha stays its own)');
 heat.end();opaque.dispose();glass.dispose();
}
console.log('thermalVehicles: the heat stand-ins write the vehicle alpha on opaque draws passed');

// (battle-spikes-253) a stand-in carries what the heat picture and the silhouette read, nothing that only tints its
// 0.035-grey diffuse: sources that differ in albedo, roughness, metalness, occlusion, environment and vertex colours
// make stand-ins with the same program features (one program, one GPU pipeline), while the cutouts, the normal detail,
// the side, the blending and the depth state carry over
{
 const {Texture,DoubleSide,MeshPhysicalMaterial}=await import('three');
 const normal=new Texture(),alpha=new Texture();
 const plain=new MeshStandardMaterial({normalMap:normal,alphaMap:alpha,alphaTest:.4,side:DoubleSide});
 const rich=new MeshPhysicalMaterial({normalMap:normal,alphaMap:alpha,alphaTest:.4,side:DoubleSide,map:new Texture(),roughnessMap:new Texture(),
   metalnessMap:new Texture(),aoMap:new Texture(),envMap:new Texture(),vertexColors:true,clearcoat:1,color:0x447733});
 const a=heatStandIn(plain,0),b=heatStandIn(rich,0);
 const features=(m)=>({type:m.type,map:!!m.map,rough:!!m.roughnessMap,metal:!!m.metalnessMap,ao:!!m.aoMap,env:!!m.envMap,vc:m.vertexColors,
   normal:m.normalMap,alpha:m.alphaMap,alphaTest:m.alphaTest,side:m.side,transparent:m.transparent,flat:m.flatShading,emissiveMap:!!m.emissiveMap});
 assert.deepEqual(features(b),features(a),'two sources that differ only in what the heat cannot show: one stand-in program');
 assert.equal(b.type,'MeshStandardMaterial','a physical source\'s stand-in is a standard material');
 assert.ok(b.normalMap === normal,'the normal detail carries (the heat shades by normal.z)');
 assert.ok(b.alphaMap===alpha&&b.alphaTest===.4&&b.side===DoubleSide,'the cutouts and faces carry');
 assert.ok(Math.abs(b.color.r-.035)<1e-9&&b.emissive.r===1&&b.roughness===1&&b.metalness===0,'the heat stand-in\'s own surface');
 const glass=heatStandIn(new MeshStandardMaterial({transparent:true,opacity:.3,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}),0);
 assert.ok(glass.transparent&&glass.opacity===.3&&glass.depthWrite===false&&glass.polygonOffset&&glass.polygonOffsetFactor===-1,'the blending and depth state carry');
 console.log('thermalVehicles: a stand-in carries the heat picture and the silhouette only (one program across the fleet\'s tints) passed');
}
