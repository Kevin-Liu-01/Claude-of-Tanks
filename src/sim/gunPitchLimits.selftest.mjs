import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {minimumMechanicalGunPitch} from './gunPitchLimits.ts';
import {createTankState,updateTank,SIM_DT} from './movement.ts';
const D=Math.PI/180,near=(a,b)=>assert(Math.abs(a-b)<1e-10,`${a} != ${b}`);
const curve=[[0,-9],[22,-9],[30,-6],[35,-5],[42,-7],[47,-9],[120,-9],[130,-7],[135,-5],[145,0],[160,1],[170,2],[180,2]];
const spec={name:'mechanical-clearance-fixture',dims:{hullLengthM:7,overallLengthM:9,widthM:4,heightM:2.4},
  enginePowerHp:1200,weightTons:60,topSpeedKmh:65,reverseSpeedKmh:25,hullTraverseDegS:30,
  turretTraverseDegS:60,gunPitchDegS:1,gunDepressionDeg:9,gunElevationDeg:20,
  terrainResistance:{hard:1,medium:1,soft:1.5},gun:{aimTimeS:2,baseAccuracy:.3,caliberMm:120,reloadS:7,bloom:{move:.1,hullRot:.1,turret:.1,afterShot:1}},
  armor:{turretPivot:[0,1.46,.37],gunPivot:[0,.39,1.13],gunBarrel:{lengthM:4.13}},gunPitchByYawDeg:curve};
for(const [yaw,pitch] of [[0,-9],[22,-9],[26,-7.5],[30,-6],[35,-5],[40,-45/7],[42,-7],[47,-9],[90,-9],[120,-9],[125,-8],[140,-2.5],[180,2]])
  for(const sign of [-1,1])for(const turns of [-2,0,3])near(minimumMechanicalGunPitch(spec,(sign*yaw+turns*360)*D),pitch*D);
near(minimumMechanicalGunPitch({gunPitchByYawDeg:curve},0),0);
near(minimumMechanicalGunPitch({gunPitchByYawDeg:curve},Math.PI),2*D);
const plain={...spec,gunPitchByYawDeg:undefined};
for(const yaw of [-10,-Math.PI,0,2,Math.PI,30,NaN])assert.equal(minimumMechanicalGunPitch(plain,yaw),-plain.gunDepressionDeg*D,'undeclared vehicles preserve exact old arithmetic');
for(const invalid of [[],[[0,-9]],[[1,-9],[180,1]],[[0,-9],[179,1]],[[0,-9],[30,-5],[25,-9],[180,1]],[[0,-9],[180,NaN]]])
  assert.throws(()=>minimumMechanicalGunPitch({...spec,gunPitchByYawDeg:invalid},0),RangeError);
assert.throws(()=>minimumMechanicalGunPitch(spec,NaN),RangeError);
near(minimumMechanicalGunPitch({...spec,gunPitchByYawDeg:[[0,-20],[180,-20]]},Math.PI),-9*D);
const field={getHeightAt:()=>-20,getGroundType:()=> 'dirt',getNormalAt:()=>new Vector3(0,1,0)};
function entity(s){return{spec:s,state:createTankState(s,new Vector3(0,0,0),0),input:{throttle:0,steer:0,brake:false,aimPoint:null},combat:null};}
const e=entity(spec);e.state.turretYaw=169.5*D;e.state.gunPitch=-9*D;e.input.aimPoint=new Vector3(0,-100,-300);
updateTank(e,field,SIM_DT);
assert(e.state.turretYaw>169.5*D,'actual turret chases rear target');
near(e.state.gunPitch,minimumMechanicalGunPitch(spec,e.state.turretYaw));
assert(e.state.gunPitch>0,'clearance clamps immediately despite slow1deg/s pitch drive');
assert(e.state.atGunLimit,'blocked aim reports mechanical stop');
for(const locked of [false,true]){const held=entity(spec);held.state.turretYaw=Math.PI;held.state.gunPitch=-9*D;held.input.aimLocked=locked;updateTank(held,field,SIM_DT);near(held.state.gunPitch,2*D);}
const old=entity(plain);old.state.turretYaw=Math.PI;old.state.gunPitch=-9*D;old.input.aimPoint=new Vector3(0,80,-300);updateTank(old,field,SIM_DT);assert(old.state.gunPitch<-8.9*D);
for(const sign of [-1,1]){const moving=entity(spec);moving.state.turretYaw=sign*110*D;moving.state.gunPitch=-9*D;moving.input.aimPoint=new Vector3(0,-100,-300);
  for(let i=0;i<180;i++){updateTank(moving,field,SIM_DT);assert(moving.state.gunPitch>=minimumMechanicalGunPitch(spec,moving.state.turretYaw)-1e-12);}}
const side=entity(spec);side.state.turretYaw=90*D;side.state.gunPitch=-9*D;updateTank(side,field,SIM_DT);near(side.state.gunPitch,-9*D);
const corner=entity(spec);corner.state.turretYaw=35*D;corner.state.gunPitch=-9*D;corner.input.aimLocked=true;updateTank(corner,field,SIM_DT);near(corner.state.gunPitch,-5*D);
console.log('gunPitchLimits: measured piecewise stops, signed/wrapped yaw, exact legacy arithmetic, invalid-curve negatives and actual chase/held-state clearance PASS');
