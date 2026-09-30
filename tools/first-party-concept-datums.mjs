import assert from 'node:assert/strict';
import {conceptDesignReady} from './first-party-concept-policy.mjs';
import {shellAmmunitionCapacity} from '../src/sim/ammunition.ts';

// Spatial values are composed through dimension ratios as well as literal
// factors. Accept only a few IEEE-754 rounding steps, not a geometric tolerance.
function sameMetres(actual, expected, label) {
  assert.ok(Number.isFinite(actual) && Number.isFinite(expected), `${label}: finite metres`);
  const roundoff = 8 * Number.EPSILON * Math.max(1, Math.abs(actual), Math.abs(expected));
  assert.ok(Math.abs(actual - expected) <= roundoff, `${label}: ${actual} != ${expected}`);
}
function samePoint(actual, expected, label) {
  assert.ok(Array.isArray(actual) && actual.length === 3 && expected.length === 3, label);
  actual.forEach((value, axis) => sameMetres(value, expected[axis], `${label}[${axis}]`));
}

/** Spec agreement accompanies, and never substitutes for, the native profile fixture. */
export function assertConceptDatums(spec,design) {
  assert.ok(conceptDesignReady(design.id),'Complete design envelope is pending measurement/freeze');
  samePoint(spec.armor.turretPivot,design.ring,'declared turret ring');
  samePoint(spec.armor.gunPivot,design.gunLocal,'declared local gun trunnion');
  sameMetres(spec.armor.gunBarrel.lengthM,design.barrelLengthM,'declared barrel length');
  sameMetres(spec.armor.gunBarrel.radiusM,design.barrelRadiusM,'declared barrel radius');
  // Some retained designs publish hull/body dimensions separately from the
  // complete equipment envelope. Both declarations remain pinned exactly.
  const dims=design.specDimensions??design;
  sameMetres(spec.dims.hullLengthM,dims.hullLengthM,'declared hull length');
  sameMetres(spec.dims.widthM,dims.widthM,'declared complete width');
  sameMetres(spec.dims.overallLengthM,dims.overallLengthM,'declared complete length');
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
  if (design.weaponSystem === 'conventional-cannon') {
    assert.ok(shells.length>0,'working cannon inventory');
    assert.ok(shells.every(shell=>!shell.guided && !shell.launcherTubes
      && shell.caliberMm===design.mainCaliberMm),'only declared conventional cannon rounds');
    // Conventional rounds normally inherit the shared per-type capacity.
    // Reject malformed explicit counts before the runtime fallback normalizes them.
    assert.ok(shells.every(shell=>shell.count == null
      || (Number.isInteger(shell.count)&&shell.count>0)), 'valid authored cannon capacities');
    assert.ok(shells.every(shell=>Number.isInteger(shellAmmunitionCapacity(shell))
      && shellAmmunitionCapacity(shell)>0),'finite nonempty cannon inventory');
    return;
  }
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
  if (design.weaponSystem === 'guided-missile-carrier') {
    assert.equal(shells.length,1,'one missile feed');
    assert.equal(shells[0].guided,true); assert.equal(shells[0].caliberMm,design.mainCaliberMm);
    assert.equal(shells[0].count,design.guidedAmmoTotal); assert.equal(shells[0].launcherTubes,design.cells);
    assert.equal(shells[0].reloadS,design.reloadS); return;
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
