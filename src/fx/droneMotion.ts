/** Presentation-only stabilization: bounded body attitude and rotor-wash motion.
 * The authoritative projectile stays the collision/spotting position. */
export interface DroneAttitude {
  vx:number;vz:number;pitch:number;roll:number;yaw:number;heading:number;rotorSpin:number;bob:number;seen:number;initialized:boolean;
}
export function createDroneAttitude():DroneAttitude {
  return {vx:0,vz:0,pitch:0,roll:0,yaw:0,heading:0,rotorSpin:0,bob:0,seen:0,initialized:false};
}
const clamp=(value:number,limit:number)=>Math.max(-limit,Math.min(limit,value));
export function updateDroneAttitude(state:DroneAttitude,velocity:{x:number;y:number;z:number},heading:number,timeS:number,dt:number,phase:number):void {
  const step=Math.max(1/240,dt),s=Math.sin(heading),c=Math.cos(heading);
  const ax=state.initialized?(velocity.x-state.vx)/step:0,az=state.initialized?(velocity.z-state.vz)/step:0;
  const forward=velocity.x*s+velocity.z*c,side=velocity.x*c-velocity.z*s;
  const pitch=clamp((ax*s+az*c)*.006+forward*.004,.34);
  const roll=clamp(-(ax*c-az*s)*.006-side*.004,.3);
  const correction=1-Math.exp(-step*8);
  state.pitch+=(pitch-state.pitch)*correction;state.roll+=(roll-state.roll)*correction;
  state.vx=velocity.x;state.vz=velocity.z;state.initialized=true;
  state.heading=heading;
  state.yaw=heading+.009*Math.sin(timeS*2.1+phase);
  state.bob=.035*Math.sin(timeS*2.7+phase)+.012*Math.sin(timeS*7.3+phase*2);
}
export function droneWobblePitch(timeS:number,phase:number):number {
  return .013*Math.sin(timeS*3.2+phase)+.006*Math.sin(timeS*8.7+phase*2);
}
export function droneWobbleRoll(timeS:number,phase:number):number {
  return .018*Math.sin(timeS*2.6+phase)+.005*Math.sin(timeS*9.1+phase);
}
