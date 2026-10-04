import assert from 'node:assert/strict';
import * as T from 'three';
import { createGarageModePreview } from './garageModePreview.ts';
import '../vehicles/tankFactory.ts';
import { TANK_SPECS } from '../vehicles/specs.ts';
import { missionAttachmentFor } from '../sim/missionAttachment.ts';
const preview=createGarageModePreview();
const geometry=new T.BoxGeometry(), paint=new T.MeshStandardMaterial();
function tank(id){
 const root=new T.Group(),turret=new T.Group(),mesh=new T.Mesh(geometry,paint);
 turret.name='rig_turret';root.add(mesh,turret);return {root,mesh,spec:TANK_SPECS[id]};
}
for(const id of ['m1a2','kf41_lynx_x','strv103']){
 const a=tank(id),b=tank(id);
 preview.update(a.root,a.spec,'juggernaut',.016);
 assert.notEqual(a.mesh.material,paint);
 assert.equal(a.root.scale.x,1,'showroom keeps its calibrated floor seating');
 preview.update(b.root,b.spec,'juggernaut',.016);
 assert.equal(a.mesh.material,paint,'cached previous tank loses its preview');
 assert.notEqual(b.mesh.material,paint,'new selection gets energy');
 preview.update(b.root,b.spec,'drone',.016);
 assert.equal(b.mesh.material,paint);
 const rail=b.root.getObjectByName('Reusable mission payload rail');
 assert.ok(rail.getObjectByName('Docked FPV mission payload').visible);
 const seat=missionAttachmentFor(b.spec);
 assert.equal(rail.parent,seat.frame==='turret'?b.root.getObjectByName('rig_turret'):b.root);
 preview.update(b.root,b.spec,'capture_the_flag',.016);
 assert.equal(b.root.getObjectByName('Docked FPV mission payload'),undefined);
 assert.ok(b.root.getObjectByName('Capture flag assembly'));
 const banner=b.root.getObjectByName('Woven team banner');
 const shader={uniforms:{},vertexShader:T.ShaderLib.standard.vertexShader,fragmentShader:T.ShaderLib.standard.fragmentShader};
 banner.material.onBeforeCompile(shader,{});
 const time=shader.uniforms.flagTime.value;
 preview.update(b.root,b.spec,'capture_the_flag',.04);
 assert.ok(shader.uniforms.flagTime.value>time,'cloth animation advances');
 assert.match(shader.vertexShader,/objectNormal = normalize/,'lighting follows cloth deformation');
 preview.update(b.root,b.spec,'infected',.016);
 assert.equal(b.mesh.material.name,'Infected surface highlight');
 assert.equal(b.root.getObjectByName('Capture flag assembly'),undefined);
 preview.update(b.root,b.spec,'standard',.016);
 assert.equal(b.root.getObjectByName('Reusable mission payload rail'),undefined);
 preview.update(b.root,b.spec,'juggernaut',.016);preview.clear();
 assert.equal(b.mesh.material,paint,'entry hands a clean vehicle to battle');
 preview.update(b.root,b.spec,'juggernaut',.016);
 assert.notEqual(b.mesh.material,paint,'return recreates selected-mode preview');
 preview.clear();preview.clear();
}
geometry.dispose();paint.dispose();
console.log('garageModePreview: tank changes, turret/hull mounts, mode changes, cloth animation and clean battle/return lifecycle pass');
