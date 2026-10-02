import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';
import { near } from '../../../tools/receipt-kit.test-support.mjs';

// The replayed pre-repair hull (literal legacy section rows) and the comparisons against it (untouched meshes,
// forward triangles, lower keel, track contact) are retired: whole-tank change detection of merkava4_x is the
// fleet geometry ledger's. The held-out source rays, folded air and seating proofs stay.

// Held-out canonical-source rays, not evaluated from builder stations. The
// source hull was never turret-unposed: only turret/equipment used the -25°
// correction documented in merkava4_x.md. All values below are world metres.
const SOURCE=[
  [-1.5,-3.790,1.046670],[1.5,-3.775,1.126309],
  [-1.1,-3.700,1.224095],[1.5,-3.715,1.224095],
  [-1.5,-3.665,1.359263],[-1.1,-3.655,1.407351],
  [-1.5,-3.645,1.455439],[1.1,-3.655,1.28350],
  [1.3,-3.655,1.40730],[1.5,-3.655,1.339935],
  [1.5,-3.645,1.354082],[-1.5,-3.625,1.510051],
  [1.5,-3.625,1.510051],[-1.5,-3.580,1.533695],
  [1.5,-3.400,1.533695],[-1.5,-3.250,1.565644],
  [1.5,-3.100,1.577793],[-1.5,-2.750,1.606141],
  [1.5,-2.750,1.606141],
];
const hit=(object,x,z,y=1.79,up=false)=>new THREE.Raycaster(
  new THREE.Vector3(x,y,z),new THREE.Vector3(0,up?1:-1,0),0,3,
).intersectObject(object,false)[0];

function sourceAndAir(tank,quality) {
  const hull=tank.root.getObjectByName('hull');
  for(const [x,z,y]of SOURCE)near(hit(hull,x,z)?.point.y,y,.0035,`${quality} source rear ${x}/${z}`);
  const ramp=hit(hull,1.5,-3.1).face.normal.clone().transformDirection(hull.matrixWorld);
  assert.ok(ramp.dot(new THREE.Vector3(0,.9967360764,-.0807291396))>.99999,
    `${quality}: rising shoulder is the actual source plane`);
  for(const x of[-1.5,-1.1,1.1,1.5]){
    const air=new THREE.Raycaster(new THREE.Vector3(x,1.42,-3.79),new THREE.Vector3(0,0,1),0,.075)
      .intersectObject(hull,false);
    assert.equal(air.length,0,`${quality}: air above the low rear landing ${x}`);
  }
  // The right stamping is genuinely lower in the center, not a solid bounding
  // rectangle. Both side rims remain attached to the continuous folded skin.
  near(hit(hull,1.5,-3.65)?.point.y,1.347009,.001,`${quality}: recessed right channel floor`);
  assert.ok(hit(hull,1.3,-3.65).point.y-hit(hull,1.5,-3.65).point.y>.08,
    `${quality}: real right channel upper air`);
  assert.ok(hit(hull,-1.3,-3.65).point.y-hit(hull,1.5,-3.65).point.y>.08,
    `${quality}: left cover is not incorrectly mirrored from the recess`);
  // The basket floor carries camouflage through the painted-detail bucket (2026-09-11).
  const basket=tank.root.getObjectByName('turretPaintedDetail');
  near(hit(basket,0,-3.50,1.9)?.point.y,1.82628,.001,`${quality}: aligned basket floor stays fixed`);
  assert.equal(new THREE.Raycaster(new THREE.Vector3(0,1.7,-3.55),new THREE.Vector3(0,0,1),0,.10)
    .intersectObject(hull,false).length,0,`${quality}: genuine space below basket remains air`);
  // The return makes physical contact with the body, rather than a raised
  // detached lamina. At this held-out station it overlaps by 26 mm vertically.
  const returns=new THREE.Raycaster(new THREE.Vector3(-1.3,1.6,-3.604),new THREE.Vector3(0,-1,0),0,.2)
    .intersectObject(hull,false).map(h=>h.point.y);
  assert.ok(returns.length>=2&&Math.max(...returns)-Math.min(...returns)<.004,
    `${quality}: cover return is seated into the lower fold`);
}

for(const quality of['high','low']){
  const tank=createTank('merkava4_x',null,{quality,proceduralOnly:true,geometryReceipt:true,camoSeed:4242});
  try{
    tank.root.updateMatrixWorld(true);
    sourceAndAir(tank,quality);
    console.log(`merkava4XRearHull ${quality}: ${SOURCE.length} source rays, folded air and seating PASS`);
  }finally{tank.dispose();}
}
