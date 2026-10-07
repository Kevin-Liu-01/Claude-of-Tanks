import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {createTank} from '../src/vehicles/tankFactory.ts';
import {createTankState} from '../src/sim/movement.ts';
import {getSpec} from '../src/vehicles/specs.ts';
import {createM1A1FillClearance,sweptTriangleSolid} from './m1a1-fill-clearance.mjs';

const unit=[[0,0,0],[1,0,0],[0,1,0]];
const swept=sweptTriangleSolid(unit,[0,0,-1]);
assert.ok(swept.intersects([.1,.1,-.51],[.2,.2,-.49]),'a voxel wholly inside the recoil prism is blocked');
assert.ok(!swept.intersects([.8,.8,-.51],[.9,.9,-.49]),'triangle prism is not its enclosing AABB');
assert.ok(sweptTriangleSolid([[.2,.2,.5],[.3,.2,.5],[.2,.3,.5]])
  .intersects([0,0,0],[1,1,1]),'a completely buried triangle is detected');
assert.ok(!swept.intersects([1.01,0,-.5],[1.02,.1,-.4]),'unrelated nearby stock is retained');
assert.ok(sweptTriangleSolid(unit,[0,0,-1],.021).intersects([1.01,0,-.5],[1.02,.1,-.4]),
  'continuous angular chord padding protects the full cell, including its edge');
assert.equal(createM1A1FillClearance('m1a2_x',null),null,'modern Abrams does not receive the legacy policy');

const tank=createTank('m1a1',null,{proceduralOnly:true,quality:'high',geometryReceipt:true,batchStatic:false});
try {
  const root=tank.root,gun=root.getObjectByName('rig_gun'),recoil=root.getObjectByName('rig_recoil');
  root.updateMatrixWorld(true);
  const origin=gun.getWorldPosition(new Vector3()).toArray(),voxel=.025,nx=80,ny=56,nz=64;
  const grid={voxel,nx,ny,nz,origin:origin.map((v,k)=>v-[1,.7,.6][k]),
    groups:['hullInteriorFill','turretInteriorFill','gunInteriorFill'],shell:new Uint16Array(nx*ny*nz)};
  const components=new Uint8Array(grid.shell.length);
  function put(local,owner) {
    const c=local.map((v,k)=>Math.floor((v+origin[k]-grid.origin[k])/voxel));
    const i=(c[2]*ny+c[1])*nx+c[0];components[i]=owner;grid.shell[i]=owner;return {i,c};
  }
  const blockedRecoil=put([0,0,-.12],3);
  const blockedRotor=put([.168,.138,-.232],2);
  const safeTurret=put([.7,.1,-.4],2);
  const safeGun=put([.18,.18,.35],3);
  const hull=put([.01,.01,-.17],1); // even a coincident hull voxel is outside this repair's ownership
  const sourceCell=put([-.65,.65,.55],0);grid.shell[sourceCell.i]=7;
  const policy=createM1A1FillClearance('m1a1',root);
  const receipt=policy.apply(grid,components,()=>components[safeTurret.i]===2
    ?[[...safeTurret.c,...safeTurret.c]]:[]);
  assert.equal(components[blockedRecoil.i],0,'old rear fill cap cannot obstruct the returning barrel');
  assert.equal(components[blockedRotor.i],0,'old turret fill cannot intersect the pitching rotor');
  assert.equal(components[safeTurret.i],2,'unrelated fixed interior closure remains');
  assert.equal(components[safeGun.i],3,'safe gun-owned interior closure remains');
  assert.equal(components[hull.i],1,'hull closure ownership remains exact');
  assert.equal(grid.shell[hull.i],1,'hull closure shell remains exact');
  assert.equal(grid.shell[sourceCell.i],7,'authored shell remains exact');
  assert.ok(receipt.recoilRemoved>0&&receipt.turretRemoved>0);
  // Check the prescribed envelope against the actual runtime, so a future
  // recoil timing/amplitude or kick change cannot silently stale the rule.
  const state=createTankState(getSpec('m1a1'),new Vector3(),0);state.gunPitch=20*Math.PI/180;
  tank.recoilKick(.12,1);tank.syncFromState(state,0);
  assert.ok(Math.abs(recoil.position.z+receipt.recoilMeters)<1e-9);
  assert.ok(Math.abs(-gun.rotation.x*180/Math.PI-receipt.pitchDegrees[1])<1e-7);
  console.log('M1 fill clearance: buried stock, finite recoil prism, rotated throat, untouched hull/source stock, retained safe fills and native runtime envelope PASS');
} finally {tank.dispose();}
