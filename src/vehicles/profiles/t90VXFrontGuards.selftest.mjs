import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { addT90VFrontGuard } from './t90VXFrontGuards.ts';

const near = (actual, expected, tolerance, label) => assert.ok(Number.isFinite(actual)
  && Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected} ±${tolerance}`);
const cast = (mesh, x, z) => new THREE.Raycaster(new THREE.Vector3(x, 2, z),
  new THREE.Vector3(0, -1, 0), 0, 2).intersectObject(mesh, false);

// Held-out canonical-source rays, not samples of the native section table.
// The longitudinal witnesses enforce the nearly-flat → rounded → steep nose
// sequence that the former single planar ramp missed by as much as 162 mm.
const crowns = [
  [3.35,1.28749536,.9986,.0533], [3.55,1.27674887,.9985,.0538],
  [3.675,1.24604552,.9408,.3389], [3.725,1.22803119,.9408,.3390],
  [3.79,1.18587089,.6677,.7444], [3.84,1.13013203,.6677,.7444],
];
const folds = [
  [1.16,3.35,1.28753379], [1.16,3.55,1.27674887], [1.71,3.35,1.26608855],
  [1.71,3.55,1.25584100], [1.16,3.675,1.24604552], [1.71,3.675,1.23545996],
  [1.16,3.725,1.21330076], [1.71,3.725,1.21902899], [1.16,3.79,1.12812627],
  [1.71,3.79,1.06707848], [1.16,3.84,.98748702], [1.25,3.84,1.11508036],
  [1.60,3.84,1.11822637], [1.25,3.89,1.01605106], [1.60,3.89,1.02468927],
];

function closedSkin(geometry) {
  const p = geometry.attributes.position, index = geometry.index, edges = new Map();
  let volume = 0;
  for (let i = 0; i < (index?.count ?? p.count); i += 3) {
    const points = [0,1,2].map(k => new THREE.Vector3().fromBufferAttribute(p, index ? index.getX(i+k) : i+k));
    volume += points[0].dot(points[1].clone().cross(points[2])) / 6;
    for (let k = 0; k < 3; k++) {
      const a = points[k].toArray().map(v => v.toFixed(6)).join(',');
      const b = points[(k+1)%3].toArray().map(v => v.toFixed(6)).join(',');
      const key = [a,b].sort().join('|'), row = edges.get(key) ?? [0,0];
      row[0]++; row[1] += a < b ? 1 : -1; edges.set(key,row);
    }
  }
  assert.ok(volume > 0 && volume < .04, 'thin positive closed fabrication, not a solid wheel-well fill');
  assert.ok([...edges.values()].every(([count,winding]) => count === 2 && winding === 0), 'every guard edge has two opposing faces');
  assert.equal(geometry.attributes.uv.count, p.count, 'native UVs survive merging');
}

function jointChecks(side) {
  const meshes = [], material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  addT90VFrontGuard({ addMudguard(label, bucket, geometry) {
    assert.equal(bucket,'hull','the actual guard remains permanent hull fabrication');
    closedSkin(geometry);
    const mesh = new THREE.Mesh(geometry,material); mesh.name = label; mesh.updateMatrixWorld(true); meshes.push(mesh);
  } }, side, 'guard');
  try {
    for (const [a,b,z] of [[0,1,3.156],[1,2,3.61525]]) {
      const ranges = [a,b].map(index => cast(meshes[index],side*1.43,z).map(h=>h.point.y));
      assert.ok(ranges.every(row=>row.length >= 2), 'both sides of each joint are closed skins');
      const overlap = Math.min(...ranges.map(row=>Math.max(...row))) - Math.max(...ranges.map(row=>Math.min(...row)));
      assert.ok(overlap > .0001, 'real positive lap contact, not just intersecting AABBs');
    }
    const aft = cast(meshes[0],side*1.43,2.672).map(h=>h.point.y);
    assert.ok(Math.min(...aft) < 1.344 && Math.max(...aft) > 1.284,
      'bridge penetrates the retained 60 mm longitudinal roof at its actual end');
  } finally { for (const mesh of meshes) mesh.geometry.dispose(); material.dispose(); }
}

for (const quality of ['high','low']) {
  const tank = createTank('t90a_vladimir_x',null,{ quality, proceduralOnly:true, geometryReceipt:true, batchStatic:false });
  try {
    tank.root.updateMatrixWorld(true);
    const hull = tank.root.getObjectByName('hull');
    const seats = tank.root.userData.mudguardFenderSeats.filter(row=>row.label.includes('vladimir-x-bow'));
    assert.equal(seats.length,6,'bridge, upper cover and crowned nose are present on both sides');
    assert.ok(seats.every(row=>row.supported),'guard chain stays hull-supported');
    for (const side of [-1,1]) {
      // The rounded plan narrows after Z3.83: X1.25 then belongs to the
      // descending inner fold below, not to the flat center-crown plane.
      for (const [z,y,ny,nz] of crowns) for (const x of z < 3.83 ? [1.25,1.43] : [1.43]) {
        const ray = cast(hull,side*x,z)[0];
        near(ray?.point.y,y,.003,`${quality}: source crown depth`);
        near(ray?.face.normal.y,ny,.003,`${quality}: source crown normal Y`);
        near(ray?.face.normal.z,nz,.003,`${quality}: source crown normal Z`);
      }
      for (const [x,z,y] of folds) near(cast(hull,side*x,z)[0]?.point.y,y,.010,
        `${quality}: held-out rolled transverse edge (sub-centimetre section approximation)`);
      const air = new THREE.Raycaster(new THREE.Vector3(side*1.43,.95,3.78),new THREE.Vector3(0,0,-1),0,.05)
        .intersectObject(hull,false);
      assert.equal(air.length,0,'real air below the source crown is not filled by the removed ramp');
      assert.equal(cast(hull,side*1.78,3.85).length,0,'rounded nose plan edge does not become a rectangular leaf');
      jointChecks(side);
    }
  } finally { tank.dispose(); }
}
console.log('t90VXFrontGuards: high/low source crowns/normals and transverse folds, rounded plan air, closed skins and actual lap joints pass');
