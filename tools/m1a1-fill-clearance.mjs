// Kevin B. Liu — authoring-only finite clearance for the legacy M256 mounts.
// The body generator still measures every removed cell as raw residual air.
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {collectTriangles} from './tank-surface-collect.mjs';
import {M1A1_GUN_PITCH_BY_YAW} from '../src/vehicles/m1a1GunLimits.ts';
import {getSpec} from '../src/vehicles/specs.ts';
import {createTank} from '../src/vehicles/tankFactory.ts';

const AXES = [[1,0,0],[0,1,0],[0,0,1]];
const STEP = .5 * Math.PI / 180;
const RECOIL = .13;
const KICK = .014;
const EPS = .00002; // includes the generated origin's six-decimal rounding
const sub = (a,b) => a.map((v,k)=>v-b[k]);
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const pitch = ([x,y,z],angle) => [x,Math.cos(angle)*y+Math.sin(angle)*z,Math.cos(angle)*z-Math.sin(angle)*y];

/** Exact SAT for a triangle extruded along a recoil segment, against a full
 * voxel. Face, edge-cross-edge and box axes include degenerate zero-throw
 * triangles. A triangle wholly inside the voxel is deliberately a hit. */
export function sweptTriangleSolid(triangle,shift=[0,0,0],padding=0) {
  const edges = triangle.map((v,i)=>sub(triangle[(i+1)%3],v));
  const vertices = [...triangle,...triangle.map(v=>v.map((n,k)=>n+shift[k]))];
  const axes = [...AXES,cross(edges[0],edges[1]),...edges.map(e=>cross(e,shift)),
    ...[...edges,shift].flatMap(e=>AXES.map(a=>cross(a,e)))];
  return convexSolid(vertices,axes,padding);
}

function convexSolid(vertices,axes,padding) {
  const intervals = axes.filter(a=>dot(a,a)>1e-20).map(axis=>{
    const p=vertices.map(v=>dot(v,axis));
    return {axis,min:Math.min(...p),max:Math.max(...p)};
  });
  return {
    min:AXES.map((_,k)=>Math.min(...vertices.map(v=>v[k]))-padding),
    max:AXES.map((_,k)=>Math.max(...vertices.map(v=>v[k]))+padding),
    intersects(min,max) {
      const center=min.map((v,k)=>(v+max[k])/2),half=min.map((v,k)=>(max[k]-v)/2+padding);
      return intervals.every(({axis,min:lo,max:hi})=>{
        const mid=dot(center,axis),r=dot(half,axis.map(Math.abs));
        return mid+r>=lo && mid-r<=hi;
      });
    },
  };
}

function orientedBoxSolid(min,max,angle,origin,padding) {
  const corners=[];
  for(const x of [min[0],max[0]])for(const y of [min[1],max[1]])for(const z of [min[2],max[2]])
    corners.push(pitch(sub([x,y,z],origin),angle).map((v,k)=>v+origin[k]));
  const axes=AXES.map(a=>pitch(a,angle));
  return convexSolid(corners,[...AXES,...axes,...axes.flatMap(a=>AXES.map(b=>cross(a,b)))],padding);
}

function triangleVertices(t,origin) {
  return [[t.ax,t.ay,t.az],[t.bx,t.by,t.bz],[t.cx,t.cy,t.cz]].map(v=>sub(v,origin));
}

function namesBelow(root) {
  const names=new Set();
  root.traverse(o=>{if(o.isMesh)names.add(o.name||o.type);});
  return names;
}

function assemblyTriangles(root) {
  root.updateMatrixWorld(true);
  const gun=root.getObjectByName('rig_gun'),turret=root.getObjectByName('rig_turret');
  const recoil=root.getObjectByName('rig_recoil');
  assert.ok(gun&&turret&&recoil,'M1 fill clearance requires the actual three rig frames');
  // Generated boxes are authored in the battery tank frame. This policy is
  // deliberately not a generic posed/scaled-rig approximation.
  const e=gun.matrixWorld.elements;
  for(const [i,value] of [[0,1],[1,0],[2,0],[4,0],[5,1],[6,0],[8,0],[9,0],[10,1]])
    assert.ok(Math.abs(e[i]-value)<1e-7,'M1 fill clearance requires an unposed unit gun frame');
  const origin=gun.getWorldPosition(new Vector3()).toArray();
  const movingNames=namesBelow(gun),recoilNames=namesBelow(recoil);
  const all=collectTriangles(turret);
  const moving=[],fixed=[];
  for(const t of all.tris) {
    const name=all.meshes[t.mesh];
    assert.ok(!/InteriorFill$/.test(name),'Clearance must be computed from authored stock, before loading fills');
    const row={vertices:triangleVertices(t,origin),recoil:recoilNames.has(name)};
    (movingNames.has(name)?moving:fixed).push(row);
  }
  assert.ok(moving.some(t=>t.recoil)&&fixed.length,'M1 fill clearance needs real barrel and fixed turret stock');
  return {origin,moving,fixed};
}

function cellBounds(grid,x,y,z) {
  const min=[x,y,z].map((v,k)=>grid.origin[k]+v*grid.voxel);
  return [min,min.map(v=>v+grid.voxel)];
}

/** Remove entire voxels, never only their centers. The hull (component 1)
 * cannot be selected by either caller; its original closure is unchanged. */
function removeIntersecting(grid,components,component,solid) {
  const dimensions=[grid.nx,grid.ny,grid.nz];
  const lo=solid.min.map((v,k)=>Math.max(0,Math.floor((v-grid.origin[k])/grid.voxel)));
  const hi=solid.max.map((v,k)=>Math.min(dimensions[k]-1,Math.floor((v-grid.origin[k])/grid.voxel)));
  let removed=0;
  for(let z=lo[2];z<=hi[2];z++)for(let y=lo[1];y<=hi[1];y++)for(let x=lo[0];x<=hi[0];x++) {
    const i=(z*grid.ny+y)*grid.nx+x;
    if(components[i]!==component)continue;
    if(!solid.intersects(...cellBounds(grid,x,y,z)))continue;
    // Generation only claims empty cells. Clearing these leaves every
    // original authored shell voxel and every hull closure intact.
    assert.ok(grid.shell[i]===grid.groups.indexOf(`${component===2?'turret':'gun'}InteriorFill`)+1);
    components[i]=0;grid.shell[i]=0;removed++;
  }
  return removed;
}

function sweepStock(grid,components,component,rows,angles,origin) {
  let removed=0;
  for(const angle of angles)for(const row of rows) {
    const stroke=row.recoil?RECOIL:0;
    const vertices=row.vertices.map(v=>pitch(v,angle).map((n,k)=>n+origin[k]));
    const shift=pitch([0,0,-stroke],angle);
    // Every point between adjacent samples is within this chord distance
    // of its nearest endpoint. Include the recoiled endpoint radius, too.
    const radius=Math.max(...row.vertices.flatMap(v=>[Math.hypot(v[1],v[2]),Math.hypot(v[1],v[2]-stroke)]));
    const padding=EPS+(angles.length>1?2*radius*Math.sin(STEP/4):0);
    removed+=removeIntersecting(grid,components,component,sweptTriangleSolid(vertices,shift,padding));
  }
  return removed;
}

function spanBounds(grid,box) {
  return [box.slice(0,3).map((v,k)=>grid.origin[k]+v*grid.voxel),
    box.slice(3).map((v,k)=>grid.origin[k]+(v+1)*grid.voxel)];
}

function clearFillAgainstFill(grid,components,boxes,angles,origin) {
  let removed=0;
  for(const box of boxes) {
    const [min,max]=spanBounds(grid,box);
    const radius=Math.hypot(Math.max(Math.abs(min[1]-origin[1]),Math.abs(max[1]-origin[1])),
      Math.max(Math.abs(min[2]-origin[2]),Math.abs(max[2]-origin[2])));
    const padding=EPS+2*radius*Math.sin(STEP/4);
    for(const angle of angles)
      removed+=removeIntersecting(grid,components,3,orientedBoxSolid(min,max,-angle,origin,padding));
  }
  return removed;
}

/** Apply only AFTER ordinary closure generation, before the final remesh.
 * This makes hull bytes independent of the clearance rule and lets the
 * normal flood-fill checker report the remaining air without exceptions. */
export function createM1A1FillClearance(id,root) {
  if(!Object.hasOwn(M1A1_GUN_PITCH_BY_YAW,id))return null;
  const spec=getSpec(id);
  assert.equal(spec.gun.caliberMm,120,'M1 recoil prescription changed; remeasure the native stroke');
  assert.equal(spec.gunDepressionDeg,10);
  assert.equal(spec.gunElevationDeg,20);
  const assembly=assemblyTriangles(root),angles=[];
  // LOW's faceted return surfaces are chords inside the HIGH arc. Protect
  // both actual representations rather than assuming one bounds the other.
  const low=createTank(id,null,{proceduralOnly:true,quality:'low',geometryReceipt:true,batchStatic:false});
  try {
    const lower=assemblyTriangles(low.root);
    assert.ok(lower.origin.every((v,k)=>Math.abs(v-assembly.origin[k])<1e-7));
    assembly.moving.push(...lower.moving);assembly.fixed.push(...lower.fixed);
  } finally {low.dispose();}
  const min=-spec.gunDepressionDeg*Math.PI/180,max=spec.gunElevationDeg*Math.PI/180+KICK;
  for(let a=min;a<max;a+=STEP)angles.push(a);
  angles.push(max);
  return {
    apply(grid,components,turretBoxes) {
      const {origin,moving,fixed}=assembly;
      const turretRemoved=sweepStock(grid,components,2,moving,angles,origin);
      const recoilRemoved=sweepStock(grid,components,3,moving.filter(t=>t.recoil),[0],origin);
      const fixedStockRemoved=sweepStock(grid,components,3,fixed.map(t=>({...t,recoil:false})),angles.map(a=>-a),origin);
      const otherFillRemoved=clearFillAgainstFill(grid,components,turretBoxes(),angles,origin);
      return {id,method:'finite triangle recoil prisms and reciprocal pitch sweep; full voxel SAT with continuous chord bound',
        pitchDegrees:[min*180/Math.PI,max*180/Math.PI],stepDegrees:STEP*180/Math.PI,recoilMeters:RECOIL,
        turretRemoved,recoilRemoved,fixedStockRemoved,otherFillRemoved,
        removedVoxels:turretRemoved+recoilRemoved+fixedStockRemoved+otherFillRemoved};
    },
  };
}
