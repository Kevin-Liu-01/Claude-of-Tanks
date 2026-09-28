import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { Box3, Vector3 } from 'three';
import { createTank } from './tankFactory.ts';
import { getSpec, PRODUCTION_TANK_IDS } from './specs.ts';
import { tierNumeral } from './tier.ts';
import { decorManifestFor } from './decorations.ts';
import { censusEquipment } from '../../tools/source-equipment-policy.mjs';

for (const [id, tier, caliber, turretCrew] of [['amx10p','IX',20,2],['amx10p_25','X',25,1]]) {
  assert(PRODUCTION_TANK_IDS.includes(id), `${id}: playable roster`);
  const spec=getSpec(id);
  assert.equal(tierNumeral(id),tier); assert.equal(spec.nation,'France');
  assert.equal(spec.gun.caliberMm,caliber);
  assert.deepEqual(decorManifestFor(spec,()=>0),[],'native game uses authored fittings, without random roof guns');
  assert.equal(spec.gun.shells.some(shell=>shell.guided),false,'no donor Bradley missile');
  assert.equal(spec.gun.launcherMuzzles,undefined);
  assert.equal(spec.armor.crew.length,3);
  assert.equal(spec.armor.crew.filter(member=>member.turretLocal).length,turretCrew,'Toucan two-man / Dragar one-man topology');
  for (const quality of ['high','low']) {
    const tank=createTank(id,null,{quality,proceduralOnly:true,geometryReceipt:true,decor:false});
    try {
      tank.root.updateMatrixWorld(true);
      const box=new Box3().setFromObject(tank.root), size=box.getSize(new Vector3());
      const fittedWidth=id==='amx10p_25'?3.50:2.83;
      assert(Math.abs(size.x-fittedWidth)<fittedWidth*.03,'published chassis / owner-authored armor-kit envelope');
      assert(Math.abs(size.z-5.98)<.18,'compact amphibious hull envelope');
      const wheels=tank.root.getObjectByName('rig_hull').userData.wheelPatternReceipts;
      assert.equal(wheels.length,1); assert.equal(wheels[0].stations,5,'five physical road-wheel stations');
      assert.equal(wheels[0].nationStandard.donor,'amx40','French wheel stock; own axle positions');
      assert.equal(censusEquipment(tank.root).mg,0,'French turret/coax configuration');
      const gun=tank.root.getObjectByName('rig_gun');
      if (id === 'amx10p_25') {
        const skirts=tank.root.getObjectByName('hullExternalArmor');
        const cage=tank.root.getObjectByName('hullOpenLattice');
        assert(skirts && cage,'bilateral physical skirt armor and open cages');
        assert.equal(skirts.userData.combatHitboxRole,'externalArmor','skirts retain the external armor role');
        const skirtsBox=new Box3().setFromObject(skirts);
        assert(skirtsBox.min.x < -1.70 && skirtsBox.max.x > 1.70 && skirtsBox.max.z-skirtsBox.min.z>5.2,
          'both massive skirt assemblies span the hull sides');
        const triangleKey=vertices=>vertices.map(vertex=>vertex.map(value=>value.toFixed(5)).join(',')).sort().join('|');
        const skirtPositions=skirts.geometry.attributes.position, renderedTriangles=new Set();
        for(let i=0;i<skirtPositions.count;i+=3)
          renderedTriangles.add(triangleKey([0,1,2].map(offset=>[
            skirtPositions.getX(i+offset),skirtPositions.getY(i+offset),skirtPositions.getZ(i+offset)])));
        const protection=spec.armor.hullPlates.filter(plate=>plate.name.startsWith('skirt_'));
        assert(protection.length>0,'standoff armor has combat surfaces');
        for(const plate of protection) {
          assert(renderedTriangles.has(triangleKey(plate.verts)),'combat armor follows an actual rendered skirt facet');
          assert(plate.verts.every(point=>point[1]>=1.10),'open lower slats have no invisible solid armor');
        }
        const cagePositions=cage.geometry.attributes.position;
        for(let i=0;i<cagePositions.count;i++) {
          const y=cagePositions.getY(i);
          if(y<1.12) assert(Math.abs(cagePositions.getX(i))>1.48,'lower cage stays outside moving running gear');
        }
        const turretRig=tank.root.getObjectByName('rig_turret');
        const pivot=turretRig.getWorldPosition(new Vector3());
        const point=new Vector3(); let sweptRadius=0;
        turretRig.traverse(mesh=>{
          if(!mesh.isMesh) return;
          for(let parent=mesh;parent!==turretRig;parent=parent.parent) if(parent===gun) return;
          const positions=mesh.geometry.attributes.position;
          for(let i=0;i<positions.count;i++) {
            point.fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld).sub(pivot);
            sweptRadius=Math.max(sweptRadius,Math.hypot(point.x,point.z));
          }
        });
        const station=new Box3().setFromObject(tank.root.getObjectByName('hullCupola'));
        station.getCenter(point).sub(pivot);
        const stationRadius=Math.max(station.max.x-station.min.x,station.max.z-station.min.z)/2;
        assert(Math.hypot(point.x,point.z)-stationRadius>sweptRadius+.06,
          'hull commander station must clear the complete dressed turret throughout a full rotation');
        // The yaw-image audit's generous ring disc also covers the new tall
        // hull cargo. Prove those intentionally static parts lie beyond the
        // actual turret sweep; never move hull-mounted bags onto the turret.
        const candidateBounds=new Box3();
        for(const name of ['hullCloth','hullOpenLattice','hullDark']) {
          const fitting=tank.root.getObjectByName(name), positions=fitting.geometry.attributes.position;
          for(let i=0;i<positions.count;i+=3) {
            candidateBounds.makeEmpty();
            for(let vertex=0;vertex<3;vertex++) {
              point.fromBufferAttribute(positions,i+vertex).applyMatrix4(fitting.matrixWorld).sub(pivot);
              candidateBounds.expandByPoint(point);
            }
            if(candidateBounds.max.y<.20) continue;
            const nearestX=Math.max(candidateBounds.min.x,Math.min(0,candidateBounds.max.x));
            const nearestZ=Math.max(candidateBounds.min.z,Math.min(0,candidateBounds.max.z));
            assert(Math.hypot(nearestX,nearestZ)>sweptRadius+.04,
              `${name}: tall hull cargo clears the full rotating turret by at least 40 mm`);
          }
        }
        for(const name of ['turretOpenLattice','turretCloth']) {
          const fitting=tank.root.getObjectByName(name);
          assert(fitting,`${quality}: physical ${name} present`);
          for(let parent=fitting;parent;parent=parent.parent) {
            assert.notEqual(parent,gun,'stowage must not pitch with the autocannon');
            if(parent===turretRig) break;
            assert(parent.parent,'turret equipment must remain owned by the yaw rig');
          }
        }
      }
      assert.equal(tank.root.getObjectByName('gunMount').parent,gun,'mantlet pitches with gun');
      const before=new Vector3(),after=new Vector3(); tank.gunMuzzleWorld(before);
      gun.rotation.x=-.30; tank.root.updateMatrixWorld(true); tank.gunMuzzleWorld(after);
      assert(after.y>before.y+.40,'muzzle follows elevated barrel');
      assert.notEqual(tank.root.userData.externalGeometryLoaded,true,'first-party procedural construction');
      console.log(JSON.stringify({id,quality,size:size.toArray(),turretCrew}));
    } finally { tank.dispose(); }
  }
}
assert(getSpec('amx10p_25').gun.shells[0].pen100Mm>getSpec('amx10p').gun.shells[0].pen100Mm,'upgrade trades rate for penetration');
assert(getSpec('amx10p_25').gun.reloadS>getSpec('amx10p').gun.reloadS);
console.log('AMX-10P family: IX/X roster, distinct weapons, manned stations, physical envelope and gun articulation PASS');

// A separate process is essential: the eager audit factory above would mask
// missing demand-loaded anatomy/marking records in the actual game route.
execFileSync(process.execPath, ['--input-type=module', '-e', `
  import assert from 'node:assert/strict';
  import {ensureTankBuilders,isTankBuilderReady,createTank} from './src/vehicles/fleetFactory.ts';
  const ids=['amx10p','amx10p_25'];
  await ensureTankBuilders(ids);
  for(const id of ids){
    assert(isTankBuilderReady(id),id+': complete lazy readiness');
    const tank=createTank(id,null,{proceduralOnly:true,quality:'low',geometryReceipt:true});
    assert.equal(tank.specId,id);tank.dispose();
  }
`], {cwd: new URL('../../', import.meta.url), stdio:'pipe'});
console.log('AMX-10P family: isolated game-loader construction PASS');
