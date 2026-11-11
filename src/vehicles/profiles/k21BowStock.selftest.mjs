// Measure historical source witnesses in their original metre frame.
// Installed 0.90 size and unit-scale rigs are checked by vehicleSize.selftest.
// 2026-11-02 (italy-korea-bmp-267 r268b round 2; the coordinator, after both blind critics flagged "the upper glacis
// 2 x 6 grid of appliqué tiles" against the photographs' plain sloped plate): the fourteen clamped glacis blocks are two
// plain plates on the blocks' own top plane, closed to the deck (k21DeckKit.ts addK21GlacisPlates). Every source
// witness ray keeps its value; the block/clamp seat checks become the plates' deck seats, with the same negative control.
import assert from 'node:assert/strict';
import * as T from 'three';
import {createTank} from '../tankFactory.ts';
import {registerProfiledBuilders} from '../tankFactoryCore.ts';
import {KIT} from './kit.ts';
import {buildK21X as candidate} from './k21X.ts';
import {ensureInteriorFills,hasInteriorFills} from '../interiorFills.ts';
await ensureInteriorFills(['k21']);
assert.ok(hasInteriorFills('k21'),'verify the actual generated interior stock');
const baseline=candidate;
import {getSpec} from '../specs.ts';import {createTankState} from '../../sim/movement.ts';
import {isTrackShoeMesh} from '../../../tools/track-clip-classification.mjs';
const material=new T.MeshBasicMaterial({side:T.DoubleSide}),front=new T.MeshBasicMaterial({side:T.FrontSide});
const ray=new T.Raycaster();
function contains(mesh,p,axis='x'){const d=new T.Vector3();d[axis]=1;ray.set(new T.Vector3(...p).addScaledVector(d,-12),d);ray.near=0;ray.far=24;const h=ray.intersectObject(mesh).filter((h,i,a)=>!i||Math.abs(h.distance-a[i-1].distance)>1e-7),a=h.filter(h=>h.distance<12-1e-6).at(-1),b=h.find(h=>h.distance>12+1e-6);return !!a&&!!b&&a.face.normal.dot(d)<-.001&&b.face.normal.dot(d)>.001;}
function triangles(g){const p=g.attributes.position,idx=g.index,a=[];for(let i=0;i<(idx?.count??p.count);i+=3)a.push(new T.Triangle(...[0,1,2].map(k=>new T.Vector3().fromBufferAttribute(p,idx?idx.getX(i+k):i+k))));return a;}
function build(builder,quality){const parts=[];registerProfiledBuilders({k21(P){const add=P.add;P.add=(bucket,g,...tr)=>{const geo=KIT.xform(g.clone(),...tr),mesh=new T.Mesh(geo,material);geo.computeBoundingBox();mesh.updateMatrixWorld(true);parts.push({bucket,mesh,b:geo.boundingBox});return add(bucket,g,...tr)};builder(P)}});let tank;try{tank=createTank('k21',null,{proceduralOnly:true,quality,camoSeed:4242,geometryReceipt:true,deferStaticBatch:true});}finally{registerProfiledBuilders({k21:baseline})}tank.root.scale.setScalar(1 / .90);tank.root.traverse(o=>{if(o.isLOD){o.autoUpdate=false;o.levels.forEach((l,i)=>l.object.visible=i===0)}if(o.isMesh){if(o.userData.shadowOnly)o.visible=false;else o.material=front;}});tank.root.updateMatrixWorld(true);return{tank,parts,dispose(){tank.dispose();for(const p of parts)p.mesh.geometry.dispose()}};}
function first(root,p,d,far=20){ray.set(new T.Vector3(...p),new T.Vector3(...d));ray.near=0;ray.far=far;return ray.intersectObject(root,true).find(h=>{for(let o=h.object;o;o=o.parent)if(!o.visible)return false;return !h.object.userData.shadowOnly;});}
const sourceWitnesses=[
 ...[-.76,0].flatMap(x=>[[1.95,1.93563167],[2.2,x?1.86317763:1.86290187],[2.47,x?1.82857013:1.78419707],[2.65,x?1.77622815:1.77634661],[2.88,1.83243068],[3.05,1.78343528],[3.2,1.74020340],[3.4,1.51348188]].map(([z,y])=>({p:[x,2.2,z],d:[0,-1,0],expected:[x,y,z]}))),
 ...[-.76,.76].flatMap(x=>[[1,3.501948],[1.1,3.568097],[1.2,3.604322],[1.3,3.640545],[1.4,3.676770]].map(([y,z])=>({p:[x,y,4.5],d:[0,0,-1],expected:[x,y,z]}))),
];
function stockProof(built){let residual=0;for(const w of sourceWitnesses){const hit=first(built.tank.root,w.p,w.d);assert.ok(hit,`source stock ${w.p}`);const r=hit.point.distanceTo(new T.Vector3(...w.expected));assert.ok(r<.002,`source first-hit ${w.p}: ${r}`);residual=Math.max(residual,r)}return residual;}
const seats=[
 ['tow forging/hull L',[-.648035,.806,3.009]],['tow forging/hull R',[.650315,.806,3.009]],
 ['shackle/receiver L',[-.648035,.694,3.025]],['shackle/receiver R',[.650315,.694,3.025]],
 ['upper/lower fold',[0,.934,3.434]],['fascia/rolled strap',[0,1.414,3.6438]],
 ['strap/hull',[0,1.4204,3.5736]],['strap/barrel',[0,1.3931,3.6156]],
 ['deck/hull',[0,1.8044,2.35]],['service lid/rim',[-.7918,1.61334,3.1692]],
 ['service rim/deck',[-.7973,1.57954,3.17196]],
 ['port hood/receiver',[-.87195,1.50405,3.41893]],
 ['starboard receiver/hull',[1.4755,1.4581,3.54495]],
 ['starboard hood/receiver',[1.4819,1.56,3.45]],
 ['rear glacis plate/deck',[-1.0,1.70488,2.7235]],
];
function seatsProof(parts){for(const [name,p]of seats)assert.ok(parts.filter(r=>contains(r.mesh,p)).length>=2,`${name}: finite common material`);}
function allArmorSeats(parts){const pitch=Math.atan2(.27694,.96089),c=Math.cos(pitch),s=Math.sin(pitch);let count=0;for(const [x0,x1] of[[-1.1058,.370],[.385,1.4977]]){const plate=parts.find(r=>Math.abs(r.b.min.x-x0)<1e-4&&Math.abs(r.b.max.x-x1)<1e-4&&r.b.min.z>2.6);assert.ok(plate);const x=(x0+x1)/2,stock=[x,1.7423055,2.9944655],foot=[x,1.7423055-.111*c,2.9944655-.111*s];assert.ok(contains(plate.mesh,stock),'every glacis plate is closed stock');assert.ok(contains(plate.mesh,foot)&&parts.some(r=>r!==plate&&contains(r.mesh,foot)),'each glacis plate foot reaches receiving deck');count+=2;}return count;}
function airProof(built){for(const x of[-.648035,.650315]){const h=first(built.tank.root,[x,.600,3.15],[0,0,-1],.24);assert.equal(h,undefined,'shackle has an actual open center');}for(const p of[[-1.178335,1.62,3.615],[1.274565,1.62,3.615]])assert.ok(built.parts.every(r=>!contains(r.mesh,p)),'original hood mouth retains air');}
function clearance(built,intrude=false){const stock=built.parts.filter(r=>r.bucket.startsWith('hull')).flatMap(r=>triangles(r.mesh.geometry)).filter(t=>Math.min(t.a.z,t.b.z,t.c.z)>1.838);const shoes=[];built.tank.root.traverse(o=>{if(isTrackShoeMesh(o))shoes.push(o)});assert.ok(shoes.length);const state=createTankState(getSpec('k21'),new T.Vector3(),0),instance=new T.Matrix4(),world=new T.Matrix4();let checks=0;for(const phase of[0,.023,.057,.101,.149]){state.trackScroll.l=phase;state.trackScroll.r=phase;built.tank.syncFromState(state,1);built.tank.root.updateMatrixWorld(true);for(const shoe of shoes){shoe.geometry.computeBoundingBox();for(let i=0;i<shoe.count;i++){shoe.getMatrixAt(i,instance);world.multiplyMatrices(shoe.matrixWorld,instance);const b=shoe.geometry.boundingBox.clone().applyMatrix4(world);if(b.max.z<1.838)continue;checks++;if(intrude){const p=b.getCenter(new T.Vector3());stock.push(new T.Triangle(p.clone().add(new T.Vector3(.001,0,0)),p.clone().add(new T.Vector3(0,.001,0)),p.clone().add(new T.Vector3(0,0,.001))));intrude=false;}for(const t of stock)assert.equal(b.intersectsTriangle(t),false,`actual shoe bounds ${shoe.name}/${i} at phase ${phase} clear changed bow`);}}}return checks;}
// The frozen pre-correction stock digests (non-hull parts, hull behind .81 m, running gear) are retired:
// whole-tank change detection of k21 is the fleet geometry ledger's.
const report=[];try{for(const quality of['high','low']){const b=build(candidate,quality);try{const maxResidual=stockProof(b);seatsProof(b.parts);const armorSeats=allArmorSeats(b.parts);airProof(b);const receivers=b.parts.filter(r=>r.b.min.y<.71&&r.b.max.y>.8&&r.b.max.z<3.1&&r.b.min.z>2.9&&r.b.max.x<0);assert.equal(receivers.length,2);try{for(const r of receivers){r.mesh.position.y+=.3;r.mesh.updateMatrixWorld(true);}assert.throws(()=>seatsProof(b.parts),assert.AssertionError,'moving the real receiver off the bow is rejected');}finally{for(const r of receivers){r.mesh.position.y-=.3;r.mesh.updateMatrixWorld(true);}}const oneBlock=b.parts.find(r=>Math.abs(r.b.max.x-r.b.min.x-1.4758)<1e-4&&r.b.min.z>2.6);assert.ok(oneBlock);try{oneBlock.mesh.position.y+=.2;oneBlock.mesh.updateMatrixWorld(true);assert.throws(()=>allArmorSeats(b.parts),assert.AssertionError,'a floating glacis plate cannot reach the deck');}finally{oneBlock.mesh.position.y-=.2;oneBlock.mesh.updateMatrixWorld(true);}let tri=0;b.tank.root.traverseVisible(o=>{if(o.isMesh)tri+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1)});assert.ok(tri<=80000);const checks=clearance(b);assert.throws(()=>clearance(b,true),assert.AssertionError,'actual shoe-stock intrusion is rejected');report.push({quality,maxResidual,witnesses:sourceWitnesses.length,seats:seats.length,armorSeats,shoeBounds:checks,triangles:tri});}finally{b.dispose()}}assert.ok(report[1].triangles<=.75*report[0].triangles);console.log('K21 source bow fixture PASS',JSON.stringify(report));}finally{material.dispose();front.dispose();registerProfiledBuilders({k21:baseline})}
