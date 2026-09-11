import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import * as THREE from 'three';
import {CSM} from 'three/examples/jsm/csm/CSM.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { CopyShader } from 'three/examples/jsm/shaders/CopyShader.js';
import { WebGLInfo } from 'three/src/renderers/webgl/WebGLInfo.js';
import { WebGLIndexedBufferRenderer } from 'three/src/renderers/webgl/WebGLIndexedBufferRenderer.js';
import { WebGLBufferRenderer } from 'three/src/renderers/webgl/WebGLBufferRenderer.js';
import { optimizeGarageDressing } from './garageDressingOptimization.ts';
import { beginStaticDrawRangeFrame, endStaticDrawRangeFrame, installStaticInstanceRange } from '../engine/staticDrawRange.ts';
import { createPostFrameAccounting } from '../engine/postFrameAccounting.ts';

// Actual optimizer, composer, post finally, native draw-range arithmetic and
// native submission counters. Only WebGL I/O is controlled: this is not pixels
// or GPU-completion evidence and cannot certify a production resource saving.
const native = readFileSync(new URL('../../node_modules/three/src/renderers/WebGLRenderer.js', import.meta.url), 'utf8');
const rangeStart = native.indexOf('const drawRange = geometry.drawRange;');
const rangeEnd = native.indexOf('const drawCount = drawEnd - drawStart;', rangeStart)
  + 'const drawCount = drawEnd - drawStart;'.length;
assert.ok(rangeStart >= 0 && rangeEnd > rangeStart);
const nativeRange = new Function('geometry', 'group',
  `const index = geometry.index, rangeFactor = 1; ${native.slice(rangeStart, rangeEnd)}
   return { start: drawStart, count: drawCount };`);
const postSource = readFileSync(new URL('../engine/post.ts', import.meta.url), 'utf8');
const frameStart = postSource.indexOf('  function renderFrame(');
const frameEnd = postSource.indexOf('\n  // Live preset switching', frameStart);
assert.ok(frameStart >= 0 && frameEnd > frameStart);
const instantiate = new Function('ports', stripTypeScriptTypes(`
  const { renderer, composer, sceneAA, aerial, gtao, lateFx, scene, grade,
    createPostFrameAccounting, beginStaticDrawRangeFrame, endStaticDrawRangeFrame } = ports;
  const dynGovern = () => {}, adaptiveFrameSeconds = dt => dt;
  const updateAerialZoom = () => {}, updateScopeGrade = () => {};
  const updateAerialFogColors = () => {}, updateAerialCameraBasis = () => {};
  const CLOUD_SHADE_DEFAULT = 0, lateTarget = null;
  ${postSource.slice(frameStart, frameEnd)}
`) + '\nreturn frameAccounting;');

function fixture(castShadow = false, fragmented = false) {
  const scene = new THREE.Scene(), root = new THREE.Group(), owner = new THREE.Group();
  owner.userData.sourceVehicleId = 'static_display_fixture';
  scene.add(root); root.add(owner);
  const material = new THREE.MeshBasicMaterial();
  const sections = fragmented ? 65 : 3;
  for (let bay = 0; bay < sections; bay++) {
    const section = new THREE.Group();
    section.position.x = (bay - 1) * 8;
    owner.add(section);
    for (const x of [-0.6, 0.6]) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), material);
      mesh.position.set(x, 0, -10);
      mesh.castShadow = castShadow;
      section.add(mesh);
    }
  }
  const receipt = optimizeGarageDressing(root, { staticDisplayOwners: [owner] });
  assert.equal(receipt.displayMergeBatches, 1);
  assert.equal(receipt.displayMeshesMerged, sections * 2);
  const mesh = owner.getObjectByName('workshop_display_merge_1');
  assert.ok(mesh?.isMesh);
  const geometry = mesh.geometry;
  const bytes = () => JSON.stringify({
    index: [...geometry.index.array],
    attributes: Object.fromEntries(Object.entries(geometry.attributes).map(([name, attribute]) => [name, [...attribute.array]])),
    groups: geometry.groups,
  });
  const original = bytes(), originalGeometry = geometry, originalMaterial = mesh.material;
  const camera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 40);
  camera.updateMatrixWorld();
  const draws = [];
  let fail = false, target = null;
  const gl = { TRIANGLES: 4, LINES: 1, POINTS: 0,
    drawElements(mode, count, type, offset) { draws.push({ mode, count, offset, indexed: true }); },
    drawArrays(mode, start, count) { draws.push({ mode, count, start, indexed: false }); } };
  const info = new WebGLInfo(gl);
  const indexed = new WebGLIndexedBufferRenderer(gl, {}, info);
  const flat = new WebGLBufferRenderer(gl, {}, info);
  indexed.setMode(gl.TRIANGLES); indexed.setIndex({ type: 5123, bytesPerElement: 2 });
  flat.setMode(gl.TRIANGLES);
  const renderer = {
    info, autoClear: true, autoClearColor: true, autoClearDepth: true, autoClearStencil: false,
    getPixelRatio: () => 1, getRenderTarget: () => target,
    setRenderTarget(value) { target = value; }, clear() {},
    render(object, view) {
      object.updateMatrixWorld(true); view.updateMatrixWorld(true);
      const frustum = new THREE.Frustum().setFromProjectionMatrix(
        new THREE.Matrix4().multiplyMatrices(view.projectionMatrix, view.matrixWorldInverse));
      object.traverseVisible(draw => {
        if (!draw.isMesh || !draw.layers.test(view.layers)
          || (draw.frustumCulled && !frustum.intersectsObject(draw))) return;
        draw.onBeforeRender(renderer, scene, view, draw.geometry, draw.material, null);
        // A native render failure skips onAfterRender; production finally must
        // still restore borrowed range state, not just the successful path.
        if (fail && draw === mesh) throw new Error('native draw failure');
        const range = nativeRange(draw.geometry, null);
        if (draw === mesh) selected = range;
        if (draw.geometry.index) indexed.render(range.start, range.count);
        else flat.render(range.start, range.count);
        draw.onAfterRender(renderer, scene, view, draw.geometry, draw.material, null);
      });
    },
  };
  let selected = null;
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(8, 8));
  const sceneAA = new RenderPass(scene, camera), aerial = new ShaderPass(CopyShader);
  const gtao = new ShaderPass(CopyShader), lateFx = new ShaderPass(CopyShader);
  const final = new ShaderPass(CopyShader);
  sceneAA.beginMatrixFrame = () => {}; sceneAA.endMatrixFrame = () => {};
  aerial.uniforms.uCloudShade = { value: 0 };
  aerial.beginDirectColorFrame = () => {}; aerial.endDirectColorFrame = () => {};
  gtao.enabled = false; lateFx.softState = { isActive: () => false };
  for (const pass of [sceneAA, aerial, gtao, lateFx, final]) composer.addPass(pass);
  const post = instantiate({ renderer, composer, sceneAA, aerial, gtao, lateFx, scene,
    grade: { uniforms: { uExposure: { value: 1 } } }, createPostFrameAccounting,
    beginStaticDrawRangeFrame, endStaticDrawRangeFrame });
  return {
    scene, root, owner, mesh, camera, renderer, composer, draws,
    render() { draws.length = 0; selected = null; post.render(1 / 60); return { ...post.lastCompletedFrame, selected }; },
    fail(value) { fail = value; },
    assertRestored() {
      assert.deepEqual(geometry.drawRange, { start: 0, count: Infinity });
      assert.equal(bytes(), original, 'every position/normal/UV/index/group byte remains unchanged');
      assert.strictEqual(mesh.geometry, originalGeometry);
      assert.strictEqual(mesh.material, originalMaterial);
      assert.equal(owner.children.length, 1, 'no additional mesh/draw owners');
    },
    dispose() { geometry.dispose(); material.dispose(); for (const pass of composer.passes) pass.dispose(); composer.dispose(); },
  };
}

// Independent conservative primitive oracle: a triangle can intersect the clip
// volume unless all three vertices lie beyond the same clip plane. Comparing
// full and selected source IDs detects any removed potentially visible surface.
function potentialTriangles(f, range = { start: 0, count: f.mesh.geometry.index.count }) {
  const geometry = f.mesh.geometry, projection = new THREE.Matrix4()
    .multiplyMatrices(f.camera.projectionMatrix, f.camera.matrixWorldInverse).multiply(f.mesh.matrixWorld);
  const position = geometry.getAttribute('position'), index = geometry.index;
  const visible = [];
  for (let offset = range.start; offset < range.start + range.count; offset += 3) {
    const vertices = [0, 1, 2].map(corner => {
      const vertex = index.getX(offset + corner);
      return new THREE.Vector4(position.getX(vertex), position.getY(vertex), position.getZ(vertex), 1).applyMatrix4(projection);
    });
    const planes = [v => v.x + v.w, v => v.w - v.x, v => v.y + v.w,
      v => v.w - v.y, v => v.z + v.w, v => v.w - v.z];
    if (!planes.some(plane => vertices.every(vertex => plane(vertex) < 0))) visible.push(offset / 3);
  }
  return visible;
}

const f = fixture();
try {
  const initial = f.render();
  assert.deepEqual(initial.selected, { start: 72, count: 72 }, 'only middle bay is submitted');
  assert.equal(initial.calls, 4, 'one indexed workshop draw and three fullscreen draws');
  assert.equal(initial.triangles, 27);
  assert.deepEqual(potentialTriangles(f, initial.selected), potentialTriangles(f));
  f.assertRestored();
  assert.deepEqual(f.render(), { ...initial, serial: 2 }, 'unchanged camera reuses selection');

  f.camera.position.x = 8;
  const moved = f.render();
  assert.deepEqual(moved.selected, { start: 144, count: 72 });
  assert.deepEqual(potentialTriangles(f, moved.selected), potentialTriangles(f));
  f.owner.position.x = 8; f.owner.updateMatrix();
  assert.deepEqual(f.render().selected, { start: 72, count: 72 }, 'owner-only movement invalidates cached selection');
  f.owner.rotation.y = Math.PI; f.owner.scale.set(2, 1, 0.5); f.owner.position.z = -15; f.owner.updateMatrix();
  const transformed = f.render();
  assert.deepEqual(potentialTriangles(f, transformed.selected), potentialTriangles(f), 'rotated/scaled owner preserves clip-visible primitives');
  f.owner.position.set(0, 0, 0); f.owner.rotation.set(0, 0, 0); f.owner.scale.set(1, 1, 1); f.owner.updateMatrix();
  f.camera.position.x = 0;
  f.camera.left = -20; f.camera.right = 20; f.camera.updateProjectionMatrix();
  const all = f.render();
  assert.deepEqual(all.selected, { start: 0, count: 216 });
  assert.equal(all.calls, initial.calls); assert.equal(all.triangles, 75);

  f.camera.left = -2; f.camera.right = 2; f.camera.position.x = 5.1; f.camera.updateProjectionMatrix();
  const edge = f.render();
  assert.ok(edge.selected.count > 0, 'partially intersecting edge bay cannot disappear');
  assert.deepEqual(potentialTriangles(f, edge.selected), potentialTriangles(f));
  assert.notDeepEqual(potentialTriangles(f, { start: 0, count: 0 }), potentialTriangles(f),
    'negative control detects a deliberately removed visible bay');

  f.fail(true);
  assert.throws(() => f.render(), /native draw failure/);
  f.assertRestored();
  f.fail(false);
  assert.deepEqual(f.render().selected, edge.selected, 'throw→recovery retains current-camera selection');
  f.assertRestored();
  f.draws.length = 0;
  f.renderer.render(f.scene, f.camera);
  assert.equal(f.draws[0].count, 216, 'standalone warm/debug draw stays complete after post failure/recovery');
} finally { f.dispose(); }

for (const [caster, fragmented] of [[true, false], [false, true]]) {
  const excluded = fixture(caster, fragmented);
  try {
    const result = excluded.render();
    if (caster) assert.equal(result.selected.count, excluded.mesh.geometry.index.count,
      'shadow casters retain full range');
    else {
      assert.ok(excluded.mesh.userData.staticDrawRangeRuns <= 64, 'fragmented displays retain bounded metadata');
      assert.ok(result.selected.count < excluded.mesh.geometry.index.count, 'fragmented displays still trim offscreen ends');
      assert.deepEqual(potentialTriangles(excluded, result.selected), potentialTriangles(excluded),
        'bounded partitions preserve every potentially visible source triangle');
    }
    excluded.assertRestored();
  } finally { excluded.dispose(); }
}
// Instance trimming changes only the draw count after attributes are uploaded.
// Keep every original matrix/color and the entire prefix through the last
// intersecting instance, including an invisible gap before a visible instance.
{
  const geometry = new THREE.BoxGeometry(1,1,1), material = new THREE.MeshBasicMaterial();
  const mesh = new THREE.InstancedMesh(geometry,material,4), matrix = new THREE.Matrix4();
  for (const [i,x] of [0,50,1,100].entries()) {
    mesh.setMatrixAt(i,matrix.makeTranslation(x,0,0));
    mesh.setColorAt(i,new THREE.Color(i/4,.25,.75));
  }
  const matrices = mesh.instanceMatrix.array.slice(), colors = mesh.instanceColor.array.slice();
  installStaticInstanceRange(mesh);
  const camera = new THREE.OrthographicCamera(-2,2,2,-2,.1,20);
  camera.position.z=10;camera.updateMatrixWorld();mesh.updateMatrixWorld();
  const marker=beginStaticDrawRangeFrame();
  mesh.onBeforeRender(null,null,camera);
  assert.equal(mesh.count,3,'invisible interior instance remains in the authored prefix');
  assert.deepEqual(mesh.instanceMatrix.array,matrices);assert.deepEqual(mesh.instanceColor.array,colors);
  endStaticDrawRangeFrame(marker);
  assert.equal(mesh.count,4,'production finally restores instance count even without after-render');
  mesh.onBeforeRender(null,null,camera);
  assert.equal(mesh.count,4,'standalone captures/warm draws retain every instance');
  const moved=beginStaticDrawRangeFrame();
  mesh.instanceMatrix.needsUpdate=true;
  mesh.onBeforeRender(null,null,camera);
  assert.equal(mesh.count,4,'unexpected instance mutation fails closed');
  endStaticDrawRangeFrame(moved);
  mesh.dispose();geometry.dispose();material.dispose();
}
{
  const root=new THREE.Group(),owner=new THREE.Group();
  owner.name='garage_verdant_interior_clutter';owner.userData.sourceVehicleId='static_clutter_fixture';root.add(owner);
  const geometry=new THREE.SphereGeometry(.3,16,12),material=new THREE.MeshStandardMaterial();
  const reference=[];
  for(let i=0;i<100;i++) {
    const mesh=new THREE.Mesh(geometry.clone(),material);mesh.position.set(i*4,0,-10);owner.add(mesh);
    mesh.updateMatrix();reference.push(geometry.clone().applyMatrix4(mesh.matrix));
  }
  const camera=new THREE.PerspectiveCamera(40,1,.1,400);
  const csm=new CSM({camera,parent:new THREE.Scene(),cascades:3,maxFar:1000});
  csm.setupMaterial(material);
  const originalShader={uniforms:{},vertexShader:'void main() {}'};
  material.onBeforeCompile(originalShader,null);
  optimizeGarageDressing(root,{staticDisplayOwners:[owner],bakedMaterialLifecycle:{
    setup:m=>csm.setupMaterial(m),release:m=>{csm.shaders.delete(m);},
  }});
  const batch=owner.getObjectByName('workshop_display_merge_1');
  assert.ok(batch.isBatchedMesh && batch.perObjectFrustumCulled);
  assert.equal(batch.sortObjects,false,'original palette piece order retained');
  const privateShader={uniforms:{},vertexShader:'void main() {}'};
  batch.material.onBeforeCompile(privateShader,null);
  assert.equal(csm.shaders.size,2);
  assert.strictEqual(csm.shaders.get(material),originalShader);
  assert.strictEqual(csm.shaders.get(batch.material),privateShader);
  camera.far=180;camera.near=.2;csm.updateFrustums();
  for(const shader of [originalShader,privateShader]) {
    assert.equal(shader.uniforms.shadowFar.value,180);
    assert.equal(shader.uniforms.cameraNear.value,.2);
  }
  let offset=0;
  for(const source of reference) {
    const actual=batch.geometry.getAttribute('position').array;
    assert.deepEqual(actual.slice(offset,offset+source.attributes.position.array.length),source.attributes.position.array,
      'native batch retains exact previously baked positions');
    offset+=source.attributes.position.array.length;source.dispose();
  }
  const resources=[batch.geometry,batch._matricesTexture,batch._indirectTexture,batch.material];
  const counts=resources.map(()=>0);
  resources.forEach((resource,i)=>resource.addEventListener('dispose',()=>counts[i]++));
  for(let repeat=0;repeat<2;repeat++)for(const resource of root.userData.optimizationDisposables)resource.dispose();
  assert.deepEqual(counts,[1,1,1,1],'geometry, native control textures and private baked material release exactly once');
  assert.equal(csm.shaders.size,1);assert.strictEqual(csm.shaders.get(material),originalShader);
  csm.dispose();csm.remove();geometry.dispose();material.dispose();
}
{
  const root=new THREE.Group(),owner=new THREE.Group();owner.name='garage_verdant_interior_clutter';
  owner.userData.sourceVehicleId='mutable-accent-control';root.add(owner);
  const material=new THREE.MeshStandardMaterial({color:0x8a7420});
  for(let i=0;i<100;i++)owner.add(new THREE.Mesh(new THREE.SphereGeometry(.3,16,12),material));
  optimizeGarageDressing(root,{staticDisplayOwners:[owner],bakedMaterialLifecycle:{
    canClone:m=>m!==material,setup:()=>assert.fail('mutable material cannot be cloned'),release:()=>{},
  }});
  const batch=owner.getObjectByName('workshop_display_merge_1');
  assert.ok(batch&&!batch.isBatchedMesh);assert.strictEqual(batch.material,material);
  material.color.setHex(0xff9900);assert.equal(batch.material.color.getHex(),0xff9900);
  for(const resource of root.userData.optimizationDisposables)resource.dispose();material.dispose();
}
console.log('garageDressingDrawRange.selftest: exact buffers, camera/owner/edge parity, native counts, instance-prefix, native clutter ownership and production-finally restoration pass');
