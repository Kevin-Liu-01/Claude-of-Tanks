import assert from 'node:assert/strict';
import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { findCoplanarSurfaceOverlaps } from './coplanar-surface-overlap.ts';
import { closedCircularCapOffsets } from './closed-circular-caps.ts';

const material = new T.MeshBasicMaterial();
const cylinder = (radius = .32, length = .8, segments = 24) => new T.CylinderGeometry(radius, radius, length, segments);
function scene(...geometries) {
  const root = new T.Group();
  root.add(...geometries.map(g => new T.Mesh(g, material)));
  return root;
}
const audit = root => findCoplanarSurfaceOverlaps(root, { circularCapsOnly: true });
const bad = (root, label) => assert.ok(audit(root).findings.length > 0, label);
const good = (root, label) => assert.equal(audit(root).findings.length, 0, label);

const body = cylinder(), overlay = cylinder(.325, .03).translate(0, .385, 0);
assert.equal(closedCircularCapOffsets(body).size, 48);
bad(scene(body, overlay), 'historical same-plane capped overlay');
bad(scene(mergeGeometries([body, overlay])), 'same-material merged buffer cannot hide caps');
bad(scene(mergeGeometries([body.toNonIndexed(), overlay.toNonIndexed()])), 'nonindexed merged caps');
bad(scene(body, cylinder(.20, .03, 12).translate(0, .385, 0)), 'smaller nested disc, different triangulation');
bad(scene(body, cylinder(.32, .03, 12).translate(0, .385, 0)), 'equal radius, different triangulation');
bad(scene(body, cylinder(.32, .03).rotateY(.017).translate(0, .385, 0)), 'rotated tessellation');
bad(scene(body, cylinder(.32, .03).translate(.35, .385, 0)), 'partially overlapping discs');
bad(scene(mergeGeometries([body, overlay]).rotateX(.41).rotateZ(.29).translate(2, 1, -3)), 'baked arbitrary rotation and translation');
const transformed = scene(body, overlay);transformed.rotation.set(.12, .82, .31);transformed.scale.set(1.2, .7, 1.5);
bad(transformed, 'world transform and nonuniform scale');
const layered = scene(body, overlay);layered.children.forEach((m, i) => {m.material=material.clone();m.material.polygonOffset=true;m.material.polygonOffsetUnits=-i-1;m.userData.coplanarDepthLayer=i+1;});
bad(layered, 'depth offsets do not excuse two closed discs');
const instanced = new T.InstancedMesh(body, material, 2);instanced.setMatrixAt(0,new T.Matrix4());instanced.setMatrixAt(1,new T.Matrix4());
const instances = new T.Group();instances.add(instanced);bad(instances, 'coincident instanced caps');
instanced.setMatrixAt(1,new T.Matrix4().makeTranslation(0,2,0));good(instances, 'separated instances');
good(scene(body), 'one closed cylinder');
good(scene(body, cylinder().translate(.64,0,0)), 'tangent discs');
good(scene(body, cylinder().translate(1,0,0)), 'disjoint discs in same plane');
good(scene(body, overlay.clone().translate(0,.002,0)), 'separated cap planes');
good(scene(body, cylinder().translate(0,.8,0)), 'opposite-facing internal end-to-end contact');
const hidden = scene(body,overlay);hidden.children[1].visible=false;good(hidden,'hidden overlay');
const hiddenMat=scene(body,overlay);hiddenMat.children[1].material=material.clone();hiddenMat.children[1].material.visible=false;good(hiddenMat,'hidden material');
const partial=cylinder();partial.setDrawRange(0,144);assert.equal(closedCircularCapOffsets(partial).size,0);good(scene(body,partial),'caps outside draw range');
const annulus=new T.RingGeometry(.32,.34,24).rotateX(-Math.PI/2).translate(0,.4,0);
assert.equal(closedCircularCapOffsets(annulus).size,0);good(scene(body,annulus),'hollow annulus is not a filled cap');
const incomplete=new T.CircleGeometry(.32,24,0,Math.PI).rotateX(-Math.PI/2).translate(0,.4,0);
assert.equal(closedCircularCapOffsets(incomplete).size,0);good(scene(body,incomplete),'half fan is not a closed circular face');
const grouped = mergeGeometries([body,overlay],true);const groupedRoot=new T.Group();groupedRoot.add(new T.Mesh(grouped,[material,material]));bad(groupedRoot,'visible material groups');
groupedRoot.children[0].material=[material,material.clone()];groupedRoot.children[0].material[1].visible=false;good(groupedRoot,'hidden material group');
grouped.clearGroups();good(groupedRoot,'ungrouped triangles with material array are not drawn');
console.log('circular-cap-overlap: merged/instanced/rotated/nested caps rejected; single caps, seams, hollow rims and hidden stock accepted');

// The gate must fail and retain actionable evidence, not just compute a list.
const {createCircularCapAudit}=await import('./circular-cap-audit.mjs');
const {mkdtempSync,readFileSync,rmSync}=await import('node:fs');
const {tmpdir}=await import('node:os');
const {join}=await import('node:path');
const dir=mkdtempSync(join(tmpdir(),'cot-circular-caps-'));
try{
 const gate=createCircularCapAudit({quality:'high',out:join(dir,'bad.json')});
 gate.check('old-merged-drum',{root:scene(mergeGeometries([body,overlay]))});
 gate.check('valid-drum',{root:scene(body)});
 assert.throws(()=>gate.finish(),/old-merged-drum: 1 overlapping cap groups/);
 const report=JSON.parse(readFileSync(join(dir,'bad.json')));
 assert.equal(report.tanks,2,'scan continues past a failure');
 assert.equal(report.affectedTanks,1);
 assert(report.rows[0].findings[0].surfaces.every(s=>Number.isInteger(s.triangleIndex)),'actionable native face indices');
 const unsupported=new T.Group();unsupported.add(new T.BatchedMesh(2,1000,1000,material));
 const blocked=createCircularCapAudit({quality:'low',out:join(dir,'unsupported.json')});blocked.check('batched',{root:unsupported});
 assert.throws(()=>blocked.finish(),/unsupported meshes 1/,'unsupported geometry is not a clean bill of health');
 const clean=createCircularCapAudit({quality:'low',out:join(dir,'good.json')});clean.check('valid-drum',{root:scene(body)});assert.equal(clean.finish().affectedTanks,0);
}finally{rmSync(dir,{recursive:true,force:true});}
const buried=scene(body,overlay,new T.BoxGeometry(2,2,2));good(buried,'opaque stock in front buries duplicate caps');
const invisibleCover=scene(body,overlay,new T.BoxGeometry(2,2,2));invisibleCover.children[2].material=material.clone();invisibleCover.children[2].material.visible=false;bad(invisibleCover,'invisible material cannot hide a cap defect');
const paired=scene(new T.CircleGeometry(.3,24),new T.CircleGeometry(.3,24).rotateY(Math.PI));
good(paired,'opposite-facing single-sided discs');paired.children.forEach(m=>{m.material=material.clone();m.material.side=T.DoubleSide;});bad(paired,'opposite winding double-sided discs still compete');
