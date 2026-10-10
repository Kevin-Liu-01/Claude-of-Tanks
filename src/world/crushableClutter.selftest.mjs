import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BoxGeometry, InstancedMesh, Matrix4, MeshBasicMaterial, Vector3} from 'three';
import {CrushableClutter, bindClutterBatch, isLooseSurfaceRock} from './crushableClutter.ts';
import {mergePropsMaterialGeometrySteps} from './propsMaterialGeometry.ts';
import {createHeadlessCollisionWorld} from './headlessCollisionWorld.ts';
import {rayCollisionRecord, shellPassesThroughCollisionRecord} from './collision.ts';
import {decodeCollisionManifest} from '../../server/collisionManifestCodec.ts';
import {createAuthoritativeMatch} from '../sim/authoritativeMatch.ts';
import '../vehicles/tankFactory.ts';

for (const [scale, sink, tactical, expected] of [
  [1.24,.2,false,false], [1.25,.2,false,true], [1.8,.5,false,true],
  [1.81,.2,false,false], [1.5,.6,false,false], [1.5,.2,true,false],
]) assert.equal(isLooseSurfaceRock(scale,sink,tactical), expected);

const obstacle = kind => ({kind,min:[0,0,0],max:[1,1,1]});
const obs = Array.from({length:3},()=>obstacle('hedgehog'));
const cols = obs.map(ob=>structuredClone(ob));
const owner = new CrushableClutter('hedgehog',0,0,0,1,2,obs,cols);
assert.equal(owner.activate(7),true);
assert.ok([...obs,...cols].every(r=>r.propIdx===7&&r.crushMin===0&&r.crushKeep===1&&r.crushable));
const sources = [new BoxGeometry(1,2,1),new BoxGeometry(1,3,1).translate(4,2,0).toNonIndexed(),new BoxGeometry(1,4,1).translate(8,2,0)];
owner.ownPiece(sources[1]); owner.ownPiece(sources[2]);
const iterator=mergePropsMaterialGeometrySteps(sources,'dark',()=>0);
let result; do {result=iterator.next();} while(!result.done);
const merged=result.value;
bindClutterBatch(sources,merged);
const positions=merged.attributes.position.array.slice(), normals=merged.attributes.normal.array.slice();
owner.setCrushed(true);
assert.ok([...obs,...cols].every(r=>r.crushed));
assert.ok(cols.every(r=>r.dead));
const untouched=sources[0].index.count*3;
assert.deepEqual(merged.attributes.position.array.slice(0,untouched),positions.slice(0,untouched));
assert.ok(merged.attributes.position.array.slice(untouched).some((v,i)=>v!==positions[i+untouched]));
const flat=merged.attributes.position.array.slice(); owner.setCrushed(true);
assert.deepEqual(merged.attributes.position.array,flat,'repeat events never compound deformation');
owner.setCrushed(false);
assert.deepEqual(merged.attributes.position.array,positions,'rematch restores exact geometry');
assert.deepEqual(merged.attributes.normal.array,normals,'rematch restores exact normals');
assert.ok([...obs,...cols].every(r=>!r.crushed)&&cols.every(r=>!r.dead));
const donor=new CrushableClutter('rubble',0,0,0,2,1,[obstacle('waterworks')],[obstacle('waterworks')]);
assert.equal(donor.activate(8),false,'repurposed structures stay solid');
assert.equal(donor.obstacles[0].propIdx,undefined);

const rockShell=obstacle('small-rock');
const rock=new CrushableClutter('small-rock',3,10,4,1.5,2,[obstacle('small-rock')],[rockShell]);
// (the hitbox lane, 2026-10-08) a standing stone stops a shell (collision.ts names small rocks dense cover); the moment
// it is crushed its shell record is dead and the solo raycast (map.ts nearestPropHit skips dead records) passes it
const soloShell=(records)=>{const origin=new Vector3(-5,0.5,0.5),dir=new Vector3(1,0,0),normal=new Vector3();
  for(const r of records) if(!r.dead&&rayCollisionRecord(origin,dir,r,20,normal)>=0) return r; return null;};
assert.equal(shellPassesThroughCollisionRecord(rockShell),false,'a stone is dense cover: shells stop at it');
assert.equal(soloShell([rockShell]),rockShell,'solo: a shell meets the standing stone');
const mesh=new InstancedMesh(new BoxGeometry(),new MeshBasicMaterial(),2);
mesh.setMatrixAt(0,new Matrix4().makeTranslation(50,50,50));
mesh.setMatrixAt(1,new Matrix4().makeTranslation(3,9.7,4).scale(new Vector3(1.5,1.8,1.5)));
rock.bindInstance(mesh,1);
const matrices=mesh.instanceMatrix.array.slice();
rock.setCrushed(true);
assert.equal(soloShell([rockShell]),null,'solo: the crushed stone stops no shell');
assert.deepEqual(mesh.instanceMatrix.array.slice(0,16),matrices.slice(0,16),'neighbour instance unchanged');
assert.ok(Math.abs(mesh.instanceMatrix.array[29]-10.02)<1e-5);
rock.setCrushed(false);assert.deepEqual(mesh.instanceMatrix.array,matrices);
assert.equal(soloShell([rockShell]),rockShell,'solo: a rematch stands the stone and its cover again');

// Drive real captured compound/convex/circle records through the authoritative
// movement + damage + replication path, on level ground to isolate the impact.
const manifest=decodeCollisionManifest(JSON.parse(readFileSync(new URL('../../server/world-collision-manifests/urban.json',import.meta.url))));
let driveCases=0;
const crushedAt=new Map();
for(const kind of ['rubble','hedgehog','small-rock']) {
  const picked=manifest.obstacles.find(r=>r.k===kind&&Math.abs((r.b[2]+r.b[5])/2)<350);
  assert.ok(picked,`native map includes ${kind}`);
  const packet={obstacles:manifest.obstacles.filter(r=>r.p===picked.p),colliders:manifest.colliders.filter(r=>r.p===picked.p)};
  const x=(picked.b[0]+picked.b[3])/2,z=(picked.b[2]+picked.b[5])/2;
  for(const specId of ['m1a2','m551_sheridan']) for(const direction of [1,-1]) for(const throttle of [.15,1]) {
    const ground={getHeightAt:()=>picked.b[1],getGroundType:()=> 'hard',getNormalAt:()=>new Vector3(0,1,0)};
    const world=createHeadlessCollisionWorld({mapId:'verdant',heightField:ground,manifest:packet});
    const match=createAuthoritativeMatch({mapId:'verdant',countdownS:0,worldCollision:world,players:[
      {id:'driver',specId,team:'alpha',spawn:{x,z:z-12*direction,yaw:0}},
      {id:'other',specId:'m1a2',team:'bravo',spawn:{x:x+80,z:z+80,yaw:0}},
    ]});
    match.onMatchReady();
    const tank=match.entityById.get('driver');
    const before=[tank.combat.hp,tank.combat.modules.trackL.hp,tank.combat.modules.trackR.hp];
    const inputs=new Map([['driver',{throttle:throttle*direction,steer:0,brake:false,fire:false,aimYaw:0,aimPitch:0,shellSlot:0}]]);
    const events=[];
    // (the hitbox lane, 2026-10-08) a shell aimed level through the stone's middle: stopped by it while it stands, past it
    // from the very tick the hull crushes it (the authority's world, the one the destruction event replicates)
    const shell=kind==='small-rock'?world.getColliders()[0]:null;
    const shellRay=shell?()=>{const y=(shell.min[1]+shell.max[1])/2,cz=(shell.min[2]+shell.max[2])/2;
      const hit=world.raycast(new Vector3(shell.min[0]-10,y,cz),new Vector3(1,0,0),(shell.max[0]-shell.min[0])+20);
      return hit?.kind==='prop'&&hit.record===shell;}:null;
    if(shellRay) assert.ok(shellRay(),`${kind}/${specId}: a shell meets the standing stone`);
    for(let tick=0;tick<2400;tick++) {
      match.step({dt:1/60,inputs});
      if(shellRay) {
        const crushed=world.getObstacles().every(r=>r.crushed);
        assert.equal(shellRay(),!crushed,`${kind}/${specId} tick ${tick}: the stone stops shells exactly while it stands`);
        if(crushed&&!crushedAt.has(`${specId}/${direction}/${throttle}`)) crushedAt.set(`${specId}/${direction}/${throttle}`,tick);
      }
      assert.deepEqual([tank.combat.hp,tank.combat.modules.trackL.hp,tank.combat.modules.trackR.hp],before,
        `${kind}/${specId}: no transient impact damage during contact`);
      events.push(...match.snapshot({tick,serverTimeMs:tick*1000/60,viewerId:'driver'}).events);
      if((tank.state.pos.z-z)*direction>8) break;
    }
    assert.ok((tank.state.pos.z-z)*direction>8,`${kind}/${specId}/${direction}/${throttle}: crosses debris`);
    assert.deepEqual([tank.combat.hp,tank.combat.modules.trackL.hp,tank.combat.modules.trackR.hp],before,'no hull or track impact damage');
    assert.ok(world.getObstacles().every(r=>r.crushed),'every compound beam clears');
    assert.ok(world.getColliders().every(r=>r.dead||r.crushed),'shell cover clears with movement');
    assert.equal(new Set(events.filter(e=>e.type==='world_prop_destroyed'&&e.propIdx===picked.p).map(e=>JSON.stringify(e))).size,1,'one authoritative destruction event');
    assert.ok(match.snapshot({tick:2400,serverTimeMs:40000,viewerId:'driver'}).meta.destroyedObstacleIndices.length>0,'late join retains destruction');
    driveCases++;
  }
}
for(const geometry of [...sources,merged,mesh.geometry])geometry.dispose();mesh.material.dispose();
assert.ok(crushedAt.size>0,'the stone drives crushed it');
console.log(`crushableClutter.selftest: batched geometry, instance isolation, rematch, permanent cover and ${driveCases} native-record drive/track/replication cases passed; a stone stops shells until the tick it is crushed (${crushedAt.size} drives), solo and authority`);
