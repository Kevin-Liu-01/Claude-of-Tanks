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
  // A repeated frame at the same presentation time (paused, pinned or re-rendered) holds the stabilizer: the attitude
  // is a function of elapsed time, never of how many times a frame was drawn.
  if(state.initialized&&!(dt>0)){hoverAt(state,heading,timeS,phase);return;}
  const step=Math.max(1/240,dt),s=Math.sin(heading),c=Math.cos(heading);
  const ax=state.initialized?(velocity.x-state.vx)/step:0,az=state.initialized?(velocity.z-state.vz)/step:0;
  const forward=velocity.x*s+velocity.z*c,side=velocity.x*c-velocity.z*s;
  // A flight controller holds a level hover and leans into speed (about 18 degrees at full forward speed).
  const pitch=clamp((ax*s+az*c)*.01+forward*.0075,.43);
  const roll=clamp(-(ax*c-az*s)*.01-side*.0075,.4);
  const correction=1-Math.exp(-step*8);
  state.pitch+=(pitch-state.pitch)*correction;state.roll+=(roll-state.roll)*correction;
  state.vx=velocity.x;state.vz=velocity.z;state.initialized=true;
  hoverAt(state,heading,timeS,phase);
}
/** Stable hover: a few centimetres of altitude hunting and a degree of heading correction, never a bounce. */
function hoverAt(state:DroneAttitude,heading:number,timeS:number,phase:number):void {
  state.heading=heading;
  state.yaw=heading+.012*Math.sin(timeS*2.1+phase);
  state.bob=.045*Math.sin(timeS*2.7+phase)+.012*Math.sin(timeS*7.3+phase*2);
}
export function droneWobblePitch(timeS:number,phase:number):number {
  return .018*Math.sin(timeS*3.2+phase)+.007*Math.sin(timeS*8.7+phase*2);
}
export function droneWobbleRoll(timeS:number,phase:number):number {
  return .024*Math.sin(timeS*2.6+phase)+.008*Math.sin(timeS*9.1+phase);
}
