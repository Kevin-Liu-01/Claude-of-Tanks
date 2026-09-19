import assert from 'node:assert/strict';
import { BoxGeometry, BufferGeometry, Float32BufferAttribute, Matrix4, Mesh, MeshBasicMaterial } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { provesClosedMeshSeparation as prove } from './track-band-separation.mjs';

const stock = (size = [1,1,1], position = [0,0,0]) => {
  const mesh = new Mesh(new BoxGeometry(...size), new MeshBasicMaterial());
  mesh.position.fromArray(position);mesh.updateMatrixWorld(true);return mesh;
};
let checks = 0;
const check = (condition, message) => { assert(condition, message); checks++; };
const box = stock(), separated = stock([1,1,1],[1.0074,0,0]);
const pass = prove(box,[separated]);
check(pass.separated,'7.4 mm air must prove separated despite shared 2 cm voxel');
assert.equal(pass.trianglePairs,144);assert.equal(pass.evidence.exactCoordinateWelding,true);
check(!prove(box,[stock([1,1,1],[1,0,0])]).separated,'touching retains failure');
check(!prove(box,[stock([1,1,1],[.98,0,0])]).separated,'crossing retains failure');
check(!prove(box,[stock([1,1,1],[1.0000005,0,0])]).separated,'sub-micron ambiguity retains failure');
check(!prove(stock([4,4,4]),[box]).separated,'band contained in candidate retains failure');
check(!prove(box,[stock([4,4,4])]).separated,'candidate contained in band retains failure');
check(!prove(box,[separated,stock([1,1,1],[0,.2,0])]).separated,'every supplied band must be checked');
check(!prove(box,[]).separated,'empty bands cannot pass');
check(!prove(box,[separated,separated]).separated,'duplicate band input cannot pass');
// Mutable BufferAttribute.count can lie about backing storage. Clearing the
// groups reproduces the original negative-count vacuous-pass witness.
for(const malformedCount of [-3,0,39,3600000000]) {
  const malformed=stock();malformed.geometry.clearGroups();malformed.geometry.index.count=malformedCount;
  check(!prove(malformed,[separated]).separated,`candidate index count ${malformedCount} rejected`);
  check(!prove(box,[malformed]).separated,`band index count ${malformedCount} rejected`);
}
// Disconnected components cannot borrow a safe witness from a remote shell.
const compound=stock();compound.geometry=mergeGeometries([
  new BoxGeometry(4,4,4),new BoxGeometry(1,1,1).translate(8,0,0),
]);
check(!prove(compound,[box]).separated,'each closed candidate component needs its own containment witness');
check(!prove(box,[compound]).separated,'each band component needs its own reverse witness');
const open=stock();open.geometry=open.geometry.toNonIndexed();
open.geometry.setAttribute('position',new Float32BufferAttribute(open.geometry.attributes.position.array.slice(9),3));
check(!prove(open,[separated]).separated,'open candidate rejected');
check(!prove(box,[open]).separated,'open band rejected');
const degenerate=stock();degenerate.geometry=degenerate.geometry.toNonIndexed();
const dp=degenerate.geometry.attributes.position;dp.setXYZ(1,dp.getX(0),dp.getY(0),dp.getZ(0));
check(!prove(degenerate,[separated]).separated,'degenerate triangles rejected');
const nonfinite=stock();nonfinite.geometry.attributes.position.setX(0,NaN);
check(!prove(nonfinite,[separated]).separated,'nonfinite vertex rejected');
const zeroScale=stock();zeroScale.scale.x=0;zeroScale.updateMatrixWorld(true);
check(!prove(zeroScale,[separated]).separated,'singular transform rejected');
const badMatrix=stock();badMatrix.matrixWorld.elements[12]=Infinity;
check(!prove(badMatrix,[separated]).separated,'nonfinite world transform rejected');
const perspective=stock();perspective.matrixWorld.elements[3]=.1;
check(!prove(perspective,[separated]).separated,'non-affine transform rejected');
const partial=stock();partial.geometry.setDrawRange(0,3);
check(!prove(partial,[separated]).separated,'partial draw stock rejected');
const badIndex=stock();badIndex.geometry.index.setX(0,9999);
check(!prove(badIndex,[separated]).separated,'invalid index rejected');
const winding=stock();const wi=winding.geometry.index,old=wi.getX(0);wi.setX(0,wi.getX(1));wi.setX(1,old);
check(!prove(winding,[separated]).separated,'inconsistent edge winding rejected');
const unsupported=stock();unsupported.isInstancedMesh=true;
check(!prove(unsupported,[separated]).separated,'instanced stock unsupported rather than partly inspected');
// Exact welding refuses a tiny open seam instead of silently closing it.
const seam=stock();seam.geometry=seam.geometry.toNonIndexed();
seam.geometry.attributes.position.setX(0,seam.geometry.attributes.position.getX(0)+1e-7);
check(!prove(seam,[separated]).separated,'nearly closed seams cannot receive an approximate-topology waiver');
const partialGroups=stock();partialGroups.geometry.clearGroups();partialGroups.geometry.addGroup(0,3,0);
check(!prove(partialGroups,[separated]).separated,'partial material-group stock rejected');
const overlappingGroups=stock();overlappingGroups.geometry.addGroup(0,3,0);
check(!prove(overlappingGroups,[separated]).separated,'overlapping groups rejected');
const huge=stock([1,1,1],[1e12,0,0]);
check(!prove(huge,[separated]).separated,'unrepresentable micron proof margin rejected');
// Reversed orientation and rigid placement preserve the geometric proof.
const reversed=stock();reversed.applyMatrix4(new Matrix4().makeScale(-1,1,1));reversed.updateMatrixWorld(true);
check(prove(reversed,[separated]).separated,'consistent reversed orientation is valid closed stock');
const empty=new Mesh(new BufferGeometry(),new MeshBasicMaterial());
check(!prove(empty,[separated]).separated,'empty candidate cannot pass');
console.log(`track-band-separation: ${checks} conservative separation, contact, containment and malformed-input cases pass`);
