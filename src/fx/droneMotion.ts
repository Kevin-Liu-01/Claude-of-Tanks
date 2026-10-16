/** Presentation-only stabilization: bounded body attitude and rotor-wash motion.
 * The authoritative projectile stays the collision/spotting position. */
export interface DroneAttitude {
  vx:number;vz:number;pitch:number;roll:number;yaw:number;heading:number;rotorSpin:number;bob:number;seen:number;initialized:boolean;
}
export function createDroneAttitude():DroneAttitude {
  return {vx:0,vz:0,pitch:0,roll:0,yaw:0,heading:0,rotorSpin:0,bob:0,seen:0,initialized:false};
}
const clamp=(value:number,limit:number)=>Math.max(-limit,Math.min(limit,value));
const clamp01=(value:number)=>Math.max(0,Math.min(1,value));
const smoothstep=(a:number,b:number,x:number)=>{const t=clamp01((x-a)/(b-a));return t*t*(3-2*t);};
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
/** Stable hover held by a flight controller (round 3; round 5: the corrections read at a glance — critics saw a
 * rigid, dead-level airframe): a few centimetres of altitude hunting under quick corrections and about a degree of
 * heading trim; never a bounce, never drift that accumulates. */
function hoverAt(state:DroneAttitude,heading:number,timeS:number,phase:number):void {
  state.heading=heading;
  state.yaw=heading+.012*Math.sin(timeS*2.9+phase)+.006*Math.sin(timeS*11.1+phase*2);
  state.bob=.018*Math.sin(timeS*1.9+phase)+.01*Math.sin(timeS*9.7+phase*2)+.005*Math.sin(timeS*17.3+phase*3);
}
/** Attitude trim the controller keeps correcting: quick, about two degrees, in both axes. */
export function droneWobblePitch(timeS:number,phase:number):number {
  return .022*Math.sin(timeS*5.3+phase)+.014*Math.sin(timeS*12.7+phase*2)+.006*Math.sin(timeS*19.1+phase*3);
}
export function droneWobbleRoll(timeS:number,phase:number):number {
  return .026*Math.sin(timeS*4.7+phase)+.014*Math.sin(timeS*13.9+phase*1.7)+.006*Math.sin(timeS*21.7+phase*2.3);
}
/** Horizontal station-keeping: the airframe wanders a centimetre and is caught again (metres, world x and z). */
export function droneHoverDrift(timeS:number,phase:number,out:{x:number;z:number}):typeof out {
  out.x=.01*Math.sin(timeS*1.3+phase)+.0045*Math.sin(timeS*8.1+phase*2);
  out.z=.009*Math.sin(timeS*1.1+phase*3)+.0045*Math.sin(timeS*7.3+phase);
  return out;
}
/** The lift-off's character, presentation only (round 3). Inside the carrier's kit envelope (the first `clearM` of
 * the certified launch column) the airframe holds the dock's exact attitude; above it, quick trim corrections in pitch
 * and roll and a nose-down lean that anticipates forward flight near the top of the climb. As the authority's climb
 * ends, a short vertical overshoot of the launch height settles in a few quick corrections. `liftM` is the climb's
 * height above the dock, `u` its fraction (0 seated, 1 at the launch height). Pitch and roll in radians (positive pitch
 * puts the nose down), lift in metres along the world's up. */
// Round 5 (critics, waves 411b/420: "rigid and dead level, no pitch into the climb, no overshoot and settle"): the
// character starts a metre up the column (attitude only: the position stays the authority's, and a tilted airframe's
// footprint stays inside the column's), the lean builds from early in the climb, and the overshoot is larger and
// slower so it reads in 0.1 s stills.
export const DRONE_CLIMB = Object.freeze({ clearM: 1, lean: .22, overshootM: .9, overshootRadS: 6, overshootDecay: 3.4 });
export function droneClimbCharacter(ageS:number,launchS:number,u:number,liftM:number,phase:number,out:{pitch:number;roll:number;lift:number}):typeof out {
  const free=smoothstep(DRONE_CLIMB.clearM,DRONE_CLIMB.clearM+1,liftM);
  out.pitch=(DRONE_CLIMB.lean*smoothstep(.15,.6,u)+.045*Math.sin(ageS*13.1+phase)+.018*Math.sin(ageS*23.7+phase*2))*free;
  out.roll=(.04*Math.sin(ageS*11.3+phase*1.7)+.016*Math.sin(ageS*19.9+phase))*free;
  const tau=ageS-launchS;
  out.lift=tau>0?DRONE_CLIMB.overshootM*Math.exp(-DRONE_CLIMB.overshootDecay*tau)*Math.sin(DRONE_CLIMB.overshootRadS*tau):0;
  return out;
}
