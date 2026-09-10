import assert from 'node:assert/strict';
import {KIT} from './tankFactoryCore.ts';

// Exact inverse of the eight owner-requested annular-tire opt-ins. This is
// only for retaining pre-repair whole-model goldens; the actual candidate
// still runs physical armor, air, projectile and visible-wheel tests.
const OPENINGS=Object.freeze({amx30_x:.314,t72b_1987_x:.3103,t72b3_x:.30685,
  t72bu_x:.32690,t90a_burlak_x:.33888,t90_x:.33888,
  t90ms_x:.33402,t62mv1_x:.33679});

export function withHistoricalClosedWheelFaces(id,build) {
  assert.ok(Object.hasOwn(OPENINGS,id),'only the explicitly repaired wheel IDs have an inverse');
  const original=KIT.buildRunningGear;let calls=0;
  KIT.buildRunningGear=(P,config)=>{
    assert.equal(P.spec.id,id,'no other vehicle may be rewritten by this historical witness');
    assert.equal(config.wheelTireInnerRadiusM,OPENINGS[id],'exact declared annular repair, not a generic geometry exclusion');
    calls++;
    const {wheelTireInnerRadiusM,...prior}=config;
    return original(P,prior);
  };
  try {
    const tank=build();
    try {assert.equal(calls,1,'exactly one native gear build is restored');return tank;}
    catch(error){tank.dispose();throw error;}
  } finally {KIT.buildRunningGear=original;}
}

export function hasRepairedWheelFaces(id){return Object.hasOwn(OPENINGS,id);}
