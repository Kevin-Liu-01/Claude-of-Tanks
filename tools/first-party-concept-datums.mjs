import assert from 'node:assert/strict';
import {conceptDesignReady} from './first-party-concept-policy.mjs';

/** Spec agreement accompanies, and never substitutes for, the native profile fixture. */
export function assertConceptDatums(spec,design) {
  assert.ok(conceptDesignReady(design.id),'Complete design envelope is pending measurement/freeze');
  assert.deepEqual(spec.armor.turretPivot,design.ring,'declared turret ring');
  assert.deepEqual(spec.armor.gunPivot,design.gunLocal,'declared local gun trunnion');
  assert.equal(spec.armor.gunBarrel.lengthM,design.barrelLengthM);
  assert.equal(spec.armor.gunBarrel.radiusM,design.barrelRadiusM);
  assert.equal(spec.dims.hullLengthM,design.hullLengthM,'declared hull length');
  assert.equal(spec.dims.widthM,design.widthM,'declared complete width');
  assert.equal(spec.dims.overallLengthM,design.overallLengthM,'declared complete length');
  assert.equal(spec.gunElevationDeg,design.pitchDeg[1]);
  assert.equal(spec.gunDepressionDeg,-design.pitchDeg[0]);
  assertConceptWeapons(spec.gun.shells,design);
  if (design.weaponSystem === 'unguided-rocket-battery') {
    assert.equal(spec.gun.fixedLaunchCanisters,true,'fixed physical rocket battery');
    assert.equal(spec.gun.launcherMuzzles?.length,design.cells,'one physical origin per cell');
    assert.equal(new Set(spec.gun.launcherMuzzles.map(m => JSON.stringify(m))).size,design.cells,'distinct cell origins');
    assert.deepEqual(spec.gun.autoloader,{magazineSize:design.magazineSize,intraClipS:design.intraClipS,fullReloadS:design.fullReloadS},'declared salvo and rack cycle');
  }
}

export function assertConceptWeapons(shells,design) {
  if (design.weaponSystem === 'unguided-rocket-battery') {
    assert.equal(shells.length,1,'one shared rocket inventory');
    const rocket=shells[0];
    assert.equal(rocket.guided??false,false,'unguided target');
    assert.equal(rocket.type,'HE','declared blast role');
    assert.equal(rocket.caliberMm,design.mainCaliberMm);
    assert.equal(rocket.launcherTubes,design.cells);
    assert.equal(rocket.count,design.ammoTotal);
    return;
  }
  const caliber=design.mainCaliberMm??design.backupCaliberMm;
  assert.ok(shells.some(s=>!s.guided&&s.caliberMm===caliber),'declared working cannon ammunition caliber');
  const missiles=shells.filter(s=>s.guided);
  assert.ok(missiles.length>0&&missiles.every(s=>s.launcherTubes===design.cells),'all missile modes share the declared cells');
  if(design.guidedAmmoTotal!==undefined) {
    assert.ok(missiles.every(s=>Number.isInteger(s.count)&&s.count>=0),'finite missile inventories');
    assert.equal(missiles.reduce((sum,s)=>sum+s.count,0),design.guidedAmmoTotal,'declared total guided inventory');
  }
}
