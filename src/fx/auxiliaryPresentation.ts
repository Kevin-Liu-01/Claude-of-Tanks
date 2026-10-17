import { restoreSmokeScreen } from '../sim/smokeReceipt.ts';
import * as THREE from 'three';
import { auxiliaryCapabilities, SMOKE_DURATION_S, type AuxiliaryState, type SmokeScreen } from '../sim/auxiliarySystems.ts';
import {smokeVolume, smokeBankCount, smokeBankBase, smokeHoldInside, smokeScreenWind, SMOKE_CLIP_DIRS, type SmokeVolume} from '../sim/smokeScreen.ts';
import { smokeCanisterPosition, smokeCanisterVelocity, SMOKE_GRAVITY_MPS2, SMOKE_SEGMENT, type SmokeCanister } from '../sim/smokeBallistics.ts';
import type { BlastContext } from './blastRecipes.ts';
import {
  puffRandom, slotSeed, smokeBankBody, smokeBankLobe, smokeBankSkirt, smokeBankWisp, smokeCanisterStrike, smokeDecayHaze,
  smokeErosionWisp, smokeGrenadeBurst, smokeGrenadeWisp, smokeLaunchPuff, smokeScreenHaze, type SmokeLobeInput,
} from './atmosRecipes.ts';

export interface AuxiliaryVisualEntity {
  id: string;
  team?: string;
  spec?: {id: string} | null;
  visual?: {root?: THREE.Object3D | null} | null;
  combat?: {destroyed?: boolean; auxiliary?: AuxiliaryState} | null;
  networkVisible?: boolean;
  state?: { roofGunYaw?: number; roofGunPitch?: number } | null;
}
interface Ports {
  entities(): Iterable<AuxiliaryVisualEntity>;
  visible?(entity:AuxiliaryVisualEntity):boolean;
  time(): number;
  report(id:string,position:THREE.Vector3,caliber:number):void;
  flash(position: THREE.Vector3, direction: THREE.Vector3, caliber: number): void;
  /** `wind`: a screen's drift (m/s, world xz: its own, sim/smokeScreen.ts), or none for a launch's or a trail's puff */
  smoke(position: THREE.Vector3, scale: number, density?:number, life?:number, wind?:{ x: number; z: number } | null): void;
  ground(x:number,z:number): number;
  /** The media layer (desktop tiers): when given, screens are drawn as simulated smoke (atmosRecipes.ts) and the pooled
   *  `smoke` port is not used for them. The phone tier passes none and keeps the pooled sprites. */
  blast?: BlastContext | null;
}

// ---- the media screen's schedule (atmospherics lane, 2026-10-08) -----------------------------------------------
// Each bank's puffs are emitted at fixed times of its own life (seconds after its grenade lands: the simulation's
// growth clock), each from its own seeded stream: the same screen draws the same cloud at any frame rate, and a screen
// first seen late (a joiner, a frame hitch, a killcam cut) is filled in with every puff still alive, backdated.
/** in flight: a wisp behind each bank's lead grenade this often (s of flight); (fx 8m, wave 337: "strings of
 *  hard-edged near-white balls") about a wisp's own size apart (0.84 m at the launch's 14 m/s), so a trail is a thread */
const WISP_EVERY_S = 0.045;
/** at most this many banks trail wisps (a 24-tube salvo's arcs overlap: a few trails read as all of them) */
const WISP_BANKS = 3;
/** a wisp's longest life (atmosRecipes.ts smokeGrenadeWisp): a late first frame backdates none that had died */
const WISP_LIFE_S = 1.2;
/** (fx 8m, wave 337: "no visible strike or bounce at the wall") a receipt that struck a wall carries one group of
 *  SMOKE_SEGMENT numbers per bounce after its launch's seven (sim/smokeBallistics.ts: the time it left the wall, where,
 *  and its velocity after); the strike's puffs live under this long */
const STRIKE_LIFE_S = 2;
/** bloom: lobes are born this far apart, the foot lobes first with a crown every third (any prefix mixes both) */
const LOBE_EVERY_S = 0.09;
/** body puffs keep the wall dense while the lobes age; wisps tear off its top in the scene's wind */
const BODY_START_S = 2.4, BODY_EVERY_S = 1.6, BODIES = 6;
const TOP_START_S = 3.0, TOP_EVERY_S = 2.4, TOPS = 4;
/** the screen's own end on its age (the simulation's density reaches 0 at 18 s): nothing outlives it */
const SCREEN_END_S = SMOKE_DURATION_S - 0.2;
/** (r2, wave 311: "see-through by 15 s") the wall holds dense while the simulation's density does; (fx 8l, wave 354a: "a
 *  full-bodied wall at 15 s that's gone at 18 s, a hard switch-off") a lobe's last wisps are gone by 18.4 s and the
 *  wall's remains go on as the decay haze below; (fx 9) the erosion by role is EROSION's */
const LOBE_END_S = 18.4;
/** (fx 9, wave 403's critics: "after 15 s the whole bank fades evenly over about 5 s; it should erode from its crowns and
 *  flanks over tens of seconds"; the coordinator: erosion from ~8-10 s, the core dense until the sim stops blocking)
 *  the wall erodes by role: its crowns (the top) from 8.5 s, gone by 15.5 s; the feet at the row's ends (its flanks)
 *  from 10 s, gone by 16.8 s; the feet in the row's middle (its core) from 13.5 s, gone by LOBE_END_S. Each eroding crown
 *  and flank foot sheds a wisp the scene's wind carries off (smokeErosionWisp), lingering 12-18 s. */
const EROSION = Object.freeze({ crownStart: 8.5, crownEnd: 15.5, flankStart: 10.0, flankEnd: 16.8, coreStart: 13.5,
  wispLife: [12, 18] as const });
/** the bodies thin from 12.5 s and are gone by 18.6 s; (fx 9) one with more room than this by a wall (m) drifts */
const BODY_ERODE_S = 12.5, BODY_END_S = 18.6, BODY_DRIFT_ROOM_M = 4;
/** (fx 8l) the decay haze: broad thin veils born in the eroding bank that the scene's wind takes, lingering 10-20 s
 *  past the sight block (cosmetic: thin, the gameplay duration untouched) */
const DECAY_START_S = 9.5, DECAY_EVERY_S = 1.6, DECAYS = 4, DECAY_LIFE_S = [13, 20] as const;
/** the veil (the haze tail) outlives the screen by this much */
const HAZE_LINGER_S = 9;
/** the haze tail: a thin, see-through veil left inside each bank as the wall erodes, drifting with the simulation's
 *  breeze until the screen's end (it hides nothing: the density no longer blocks sight by then) */
const HAZE_START_S = 13.2, HAZE_EVERY_S = 0.8, HAZES = 2;
/** banks closer than this share their lobes and body puffs (one wall, not a stack of cards) */
const CROWD_M = 12;
/** (r2, wave 311: "a gap exactly where the tank stands") the banks of a salvo, in their order across the launcher's arc,
 *  draw one continuous wall: each bank's foot lobes stand along its own stretch of the row (half way to each neighbour,
 *  at most WALL_REACH_M: never past what its envelope covers; the row's ends reach WALL_END_M), one lobe per
 *  WALL_PITCH_M, so a bank beside a wide gap fills it and a bank among close neighbours does not pile up */
const WALL_REACH_M = 7, WALL_END_M = 6, WALL_PITCH_M = 2.2;
/** (fx 8r, the w5 film: "a row of separate white puffs ... before it merges") the skirt: one low puff per this much of a
 *  bank's stretch, born this long after its landing (one after another), living this long */
const SKIRT_PITCH_M = 3.0, SKIRT_START_S = 0.1, SKIRT_EVERY_S = 0.06, SKIRT_LIFE_S = [3.6, 4.6] as const;
// ---- (fx 9) the walls as the screen's presentation meets them ------------------------------------------------------
// Waves 404/405's critics: "the cloud stops in a dead-straight vertical edge exactly on the house corner ... cut off by
// it instead of banking and spilling round the corner", "the house's front wall shows through the middle of the screen
// as a crisp, pale rectangle ... the screen is thinnest exactly in the tank's line of fire", "small puffs sit right in
// the window openings and the windows go pale". A puff held right at the wall is half faded by the soft depth fade where
// the wall stands close behind it and whole where a window or the open sky does (the wall's outline printed into the
// smoke), and the simulation's twelve bearings carry a wall past its corner as a straight line out to the reading's far
// end. The presentation reads the same clip as the walls' outline (bankWalls), keeps each puff its own standoff off it
// (a ragged edge, never one line, and far enough that the fade never prints the wall), piles what would have gone in up
// in front of the wall and slides it along the facade, round the corner past a wall's end. The simulation's reach,
// walls and sight blocking are untouched: nothing enters a building, nothing blocks sight through a wall.
/** a clip reading this far (m) found nothing (smokeScreen.ts reads to 14.2 m and keeps that for the open) */
const CLIP_OPEN_M = 14.0;
const CLIP_SECTOR = Math.PI * 2 / SMOKE_CLIP_DIRS;
/** a puff keeps this far off a wall (m), each its own way between the two by a per-puff hash */
const WALL_STANDOFF_M = [0.6, 1.5] as const;
/** a stopped puff piles up in front of the wall by this share of how far it would have gone in, and slides along the
 *  facade (away from its bank's middle) by this share; a puff carried past a wall's end comes round it by this share of
 *  how far past it went (at most WALL_WRAP_M) */
const WALL_PILE_K = 0.35, WALL_SLIDE_K = 0.6, WALL_WRAP_K = 0.8, WALL_WRAP_M = 2;
/** (a place drawn far behind a wall: the row of banks running into the house) piled and slid no farther than this (m) */
const WALL_PILE_MAX_M = 1.5, WALL_SLIDE_MAX_M = 2.5;
/** the simulation's margin off a wall (smokeScreen.ts WALL_MARGIN_M): a puff's room is counted from it */
const WALL_ROOM_MARGIN_M = 0.3;
/** the burst and the lobes' births keep this share of a puff's standoff off the wall; a burst this near a wall (m) throws
 *  nothing into it */
const BIRTH_STANDOFF_K = 0.6, BURST_WALL_M = 2.5;
const burstWall={x:0,z:0};
/**
 * A walled bank's walls in plan (m from its canister's rest, rx/rz): per sector between neighbouring clip bearings a
 * segment from the first bearing's ray (a) to the next's (b) and its kind — 0 open (both bearings free), 1 a flat wall
 * (both stopped: the simulation's own interpolation, exact for a flat wall between them), 2 a wall's end on the
 * sector's far ray, 3 on its near ray. A wall's end is its line carried on from the stopped bearing to the free one's
 * ray (along the chord from its neighbour's hit, or square to the bearing for a lone hit): the corner stands between
 * the two rays, so the smoke stays out of that wedge, and past the free ray it may come round the corner. Every sector
 * stops at least where the simulation's reach does: the outline is conservative (the house stands behind it).
 */
interface BankWalls { rx:number; rz:number; seg:Float32Array }
const _wallRest={x:0,y:0,z:0};
function bankWalls(screen:SmokeScreen,bank:number):BankWalls|null{
  const index=screen.banks?.[bank] ?? -1;
  const clip=screen.clip?.[index],shot=screen.canisters?.[index];
  if(!clip||!shot)return null;
  smokeCanisterPosition(shot,shot[6],_wallRest);
  const n=SMOKE_CLIP_DIRS,d=new Float32Array(n),hx=new Float32Array(n),hz=new Float32Array(n);
  for(let k=0;k<n;k++){d[k]=clip[k]!/10;hx[k]=Math.cos(k*CLIP_SECTOR)*d[k]!;hz[k]=Math.sin(k*CLIP_SECTOR)*d[k]!;}
  const walled=(k:number)=>d[(k+n)%n]!<CLIP_OPEN_M;
  const seg=new Float32Array(n*5);
  for(let k=0;k<n;k++){
    const j=(k+1)%n,o=k*5,wk=walled(k),wj=walled(j);
    if(wk===wj){
      if(wk){seg[o]=hx[k]!;seg[o+1]=hz[k]!;seg[o+2]=hx[j]!;seg[o+3]=hz[j]!;seg[o+4]=1;}
      continue;
    }
    // a wall's end: the stopped bearing w, the free one f, the stopped bearing's other neighbour q
    const w=wk?k:j,f=wk?j:k,q=wk?(k-1+n)%n:(j+1)%n;
    const ux=Math.cos(f*CLIP_SECTOR),uz=Math.sin(f*CLIP_SECTOR);
    let px=-Math.sin(w*CLIP_SECTOR),pz=Math.cos(w*CLIP_SECTOR);
    if(px*ux+pz*uz<0){px=-px;pz=-pz;}
    let dx=px,dz=pz;
    if(walled(q)){
      let ex=hx[w]!-hx[q]!,ez=hz[w]!-hz[q]!;
      const el=Math.hypot(ex,ez);
      if(el>1e-3){ex/=el;ez/=el;if(ex*px+ez*pz>.26){dx=ex;dz=ez;}}
    }
    // where that line meets the free ray (h + s d = t u); else the simulation's own line to the free ray's far reading
    let cx=ux*d[f]!,cz=uz*d[f]!;
    const cr=dx*uz-dz*ux;
    if(Math.abs(cr)>1e-4){
      const sp=-(hx[w]!*uz-hz[w]!*ux)/cr,tx=hx[w]!+dx*sp,tz=hz[w]!+dz*sp,t=tx*ux+tz*uz;
      if(sp>0&&t>0&&t<d[f]!){cx=tx;cz=tz;}
    }
    if(wk){seg[o]=hx[k]!;seg[o+1]=hz[k]!;seg[o+2]=cx;seg[o+3]=cz;seg[o+4]=2;}
    else{seg[o]=cx;seg[o+1]=cz;seg[o+2]=hx[j]!;seg[o+3]=hz[j]!;seg[o+4]=3;}
  }
  return {rx:_wallRest.x,rz:_wallRest.z,seg};
}
/** a segment's frame: its unit front normal (toward the rest) nx/nz, its unit direction (a to b) tx/tz, its length */
const _wf={nx:0,nz:0,tx:0,tz:0,len:0};
function wallFrame(seg:Float32Array,o:number):void{
  const ax=seg[o]!,az=seg[o+1]!,ex=seg[o+2]!-ax,ez=seg[o+3]!-az,l=Math.hypot(ex,ez)||1;
  let nx=-ez/l,nz=ex/l;
  if(nx*ax+nz*az>0){nx=-nx;nz=-nz;}
  _wf.nx=nx;_wf.nz=nz;_wf.tx=ex/l;_wf.tz=ez/l;_wf.len=l;
}
function wallSector(qx:number,qz:number):number{
  let a=Math.atan2(qz,qx);
  if(a<0)a+=Math.PI*2;
  return Math.floor(a/CLIP_SECTOR)%SMOKE_CLIP_DIRS;
}
/** whether a point (from the rest) stands behind its sector's wall or nearer it than `margin` (m) */
function wallBlocks(W:BankWalls,qx:number,qz:number,margin:number):boolean{
  const o=wallSector(qx,qz)*5;
  if(W.seg[o+4]===0)return false;
  wallFrame(W.seg,o);
  return (qx-W.seg[o]!)*_wf.nx+(qz-W.seg[o+1]!)*_wf.nz<margin;
}
/** How far a point (from the rest) stands from the walls' outline (m): the segments and, past each wall's end, the line
 *  square to the wall going back from it (the house's side at the farthest it can stand); Infinity with no wall. With
 *  `own` false (another bank's puff) only the flat walls between two stopped bearings count: a wall's end and the line
 *  back from it are the bank's own view's bounds (they run on through the house, or out into the open) */
function wallsRoom(W:BankWalls,qx:number,qz:number,own=true):number{
  let room=Infinity;
  const seg=W.seg;
  for(let k=0;k<SMOKE_CLIP_DIRS;k++){
    const o=k*5,kind=seg[o+4]!;
    if(kind===0||(!own&&kind!==1))continue;
    const ax=seg[o]!,az=seg[o+1]!,ex=seg[o+2]!-ax,ez=seg[o+3]!-az,ll=ex*ex+ez*ez;
    const u=ll>1e-9?Math.min(1,Math.max(0,((qx-ax)*ex+(qz-az)*ez)/ll)):0;
    room=Math.min(room,Math.hypot(qx-ax-ex*u,qz-az-ez*u));
    if(own&&kind>=2){
      wallFrame(seg,o);
      const cx=kind===2?ax+ex:ax,cz=kind===2?az+ez:az;
      if((qx-cx)*_wf.nx+(qz-cz)*_wf.nz<0)room=Math.min(room,Math.abs((qx-cx)*_wf.tx+(qz-cz)*_wf.tz));
    }
  }
  return room;
}
/** a puff's room by the walls (m past the simulation's margin; Infinity in the open): its own bank's outline, and the
 *  walls every other bank of its screen saw (a bank's stretch reaches past what its own rest saw); its size, fade and
 *  density by it */
function mediaRoom(Ws:readonly (BankWalls|null)[],own:number,x:number,z:number):number{
  let room=Infinity;
  for(let i=0;i<Ws.length;i++){const W=Ws[i];if(W)room=Math.min(room,wallsRoom(W,x-W.rx,z-W.rz,i===own));}
  return Math.max(0,room-WALL_ROOM_MARGIN_M);
}
/** the front normal (into _wf) of the wall nearest a point, and its distance (m); Infinity with no wall */
function nearestWall(W:BankWalls,x:number,z:number):number{
  const qx=x-W.rx,qz=z-W.rz;
  let best=Infinity,bo=-1;
  for(let k=0;k<SMOKE_CLIP_DIRS;k++){
    const o=k*5;
    if(W.seg[o+4]===0)continue;
    const ax=W.seg[o]!,az=W.seg[o+1]!,ex=W.seg[o+2]!-ax,ez=W.seg[o+3]!-az,ll=ex*ex+ez*ez;
    const u=ll>1e-9?Math.min(1,Math.max(0,((qx-ax)*ex+(qz-az)*ez)/ll)):0;
    const dd=Math.hypot(qx-ax-ex*u,qz-az-ez*u);
    if(dd<best){best=dd;bo=o;}
  }
  if(bo>=0)wallFrame(W.seg,bo);
  return best;
}
function wallHash(key:number,x:number,z:number):number{
  const h=Math.sin(key*12.9898+Math.round(x*8)*.371+Math.round(z*8)*.719)*43758.5453;
  return h-Math.floor(h);
}
/**
 * Hold a puff's place (out) off a bank's walls the way smoke meets a wall: at least its own standoff in front of the
 * wall (WALL_STANDOFF_M scaled by `reach`, by a hash of its key and place). With `pile`, a puff that would have stood
 * nearer or gone in piles up in front (WALL_PILE_K of how far) and slides along the facade away from its bank's middle
 * (WALL_SLIDE_K), and one carried past a wall's end comes round the corner. Returns how far the wall stopped it (m; 0
 * when free): the puff piles up by it. A place still behind a wall falls back to the simulation's own hold.
 */
function holdOffWalls(W:BankWalls|null,screen:SmokeScreen,b:number,volume:SmokeVolume,out:{x:number;z:number},key:number,
  pile=true,reach=1):number{
  if(!W)return 0;
  const qx=out.x-W.rx,qz=out.z-W.rz,o=wallSector(qx,qz)*5,kind=W.seg[o+4]!;
  if(kind===0)return 0;
  wallFrame(W.seg,o);
  const nx=_wf.nx,nz=_wf.nz,tx=_wf.tx,tz=_wf.tz,len=_wf.len,ax=W.seg[o]!,az=W.seg[o+1]!;
  const s=(qx-ax)*nx+(qz-az)*nz,h=wallHash(key,out.x,out.z);
  const standoff=(WALL_STANDOFF_M[0]+(WALL_STANDOFF_M[1]-WALL_STANDOFF_M[0])*h)*reach;
  if(s>=standoff)return 0;
  const depth=standoff-s,side=(out.x-volume.x)*tx+(out.z-volume.z)*tz;
  const sgn=Math.abs(side)>.2?Math.sign(side):(h<.5?-1:1);
  const push=depth+(pile?Math.min(depth*WALL_PILE_K,WALL_PILE_MAX_M):0),slide=pile?Math.min(depth*WALL_SLIDE_K,WALL_SLIDE_MAX_M)*sgn:0;
  let px=qx+nx*push+tx*slide,pz=qz+nz*push+tz*slide;
  if(pile&&kind>=2){
    // carried past the wall's end: round the corner, behind the wall's line (still past the free ray, off the house)
    const along=(px-ax)*tx+(pz-az)*tz,past=kind===2?along-len:-along;
    if(past>standoff){
      const wrap=Math.min(past-standoff,WALL_WRAP_M)*WALL_WRAP_K,wx=px-nx*wrap,wz=pz-nz*wrap;
      if(!wallBlocks(W,wx,wz,WALL_ROOM_MARGIN_M)&&wallsRoom(W,wx,wz)>=standoff){px=wx;pz=wz;}
    }
  }
  if(wallBlocks(W,px,pz,WALL_ROOM_MARGIN_M)){
    px=qx+nx*push;pz=qz+nz*push;
    if(wallBlocks(W,px,pz,WALL_ROOM_MARGIN_M)){smokeHoldInside(screen,b,volume,out);return depth;}
  }
  out.x=W.rx+px;out.z=W.rz+pz;
  return depth;
}
/** (fx 9) a puff's density by its room to the wall: full in the open, fading over the last metre or so before the wall */
function wallDensity(room:number):number{
  const t=Math.min(1,Math.max(0,(room-.2)/1.2));
  return .55+.45*t*t*(3-2*t);
}
/** (fx 8r) a puff this near a wall fades into it more softly (the media's feather scale, 1 in the open); (fx 9) only a
 *  little: the puffs stand off the wall now, and a wide fade printed the wall's windows into them (wave 404) */
function wallFeather(room:number):number{
  if(!(room<2))return 1;
  const t=Math.min(1,Math.max(0,(room-.3)/1.7));
  return 1+.25*(1-t*t*(3-2*t));
}

interface MediaScreenState {
  /** the screen age (s) the schedule has been emitted up to */
  emittedTo: number;
  /** per bank: its share of the lobes and bodies (1 alone, ~0.25 in a long row of banks) */
  share: Float32Array;
  /** per bank: whether it trails wisps in flight */
  wisps: Uint8Array;
  /** (r2) per bank: its stretch of the wall, from its landing toward its neighbours along the row (m, unit direction):
   *  back (lx, lz, extent) and ahead (rx, rz, extent) */
  wall: Float32Array;
  /** (fx 9) per bank: how near the row's end it stands (0 the middle bank, 1 an end bank or a bank alone) */
  edge: Float32Array;
  /** (fx 9) per bank: its walls' outline as the presentation meets them (bankWalls), or null in the open */
  walls: (BankWalls | null)[];
  seen: boolean;
}
/** One roof station's moving stock (VH.02: a multi-station vehicle has one per gun). */
interface StationActor {
  gun: THREE.Object3D | null;
  weapon: THREE.Object3D | null;
  rest: THREE.Quaternion;
  restWeapon: THREE.Vector3;
  muzzle: THREE.Vector3;
  caliberMm: number;
  shots: number;
  recoil: number;
}
interface Actor extends StationActor {
  root: THREE.Object3D;
  smokeBorn: number;
  /** The second and later stations (guns[1..]), driven by AuxiliaryState.stations. */
  stations: StationActor[];
}
/** Fixed pools for brass and full-size smoke canisters; no per-frame construction. */
export function createAuxiliaryPresentation(parent: THREE.Group, ports: Ports) {
  const casings=new THREE.InstancedMesh(new THREE.CylinderGeometry(.014,.014,.085,6),new THREE.MeshStandardMaterial({color:0xbfa35f,metalness:.7,roughness:.38}),96);
  casings.name='auxiliaryEjectedCases';casings.count=0;casings.frustumCulled=false;parent.add(casings);
  // (r2, wave 311: "rows of tiny black dots") a 76 mm grenade at its own size, not twice it
  const grenades=new THREE.InstancedMesh(new THREE.CylinderGeometry(.038,.038,.2,8),
    new THREE.MeshStandardMaterial({color:0xa8ad8f,metalness:.35,roughness:.6}),256);
  grenades.name='auxiliarySmokeCanisters';grenades.count=0;grenades.frustumCulled=false;parent.add(grenades);
  const pool=Array.from({length:96},()=>({p:new THREE.Vector3(),v:new THREE.Vector3(),age:9}));
  const actors=new Map<string,Actor>();let cursor=0,lastTime=-1,lastPuff=-1,lastTrail=-1;
  let networkScreens: readonly SmokeScreen[] | null=null;
  const position=new THREE.Vector3(),direction=new THREE.Vector3(),q=new THREE.Quaternion(),turn=new THREE.Quaternion();
  const matrix=new THREE.Matrix4(),scale=new THREE.Vector3(),yAxis=new THREE.Vector3(0,1,0),rotation=new THREE.Euler();
  const color=new THREE.Color();
  const volume:SmokeVolume={x:0,y:0,z:0,radius:0,height:0,density:0};
  function eject(p:THREE.Vector3,d:THREE.Vector3){
    const item=pool[cursor++%pool.length]!;item.p.copy(p);item.age=0;
    item.v.set(d.z*2.4,1.7,-d.x*2.4);
  }
  function stationActor(root:THREE.Object3D,mount:NonNullable<ReturnType<typeof auxiliaryCapabilities>>['guns'][number]|undefined,shots:number):StationActor{
    const gun=mount ? root.getObjectByName(mount.name)??null : null;
    const station:StationActor={gun,weapon:gun?.getObjectByName('auxiliaryWeaponPitch')??null,rest:gun?.quaternion.clone()??new THREE.Quaternion(),
      restWeapon:new THREE.Vector3(),muzzle:new THREE.Vector3(...(mount?.muzzle as [number,number,number]??[0,.35,1.22])),
      caliberMm:mount?.caliberMm??12.7,shots,recoil:0};
    if(station.weapon)station.restWeapon.copy(station.weapon.position);return station;
  }
  function prepare(entity:AuxiliaryVisualEntity,root:THREE.Object3D):Actor{
    const guns=auxiliaryCapabilities(entity.spec)?.guns??[],state=entity.combat?.auxiliary;
    const actor:Actor={...stationActor(root,guns[0],state?.shots??0),root,smokeBorn:-1,
      stations:guns.slice(1).map((mount,i)=>stationActor(root,mount,state?.stations?.[i]?.shots??0))};
    actors.set(entity.id,actor);return actor;
  }
  function restStation(station:StationActor){
    if(station.gun)station.gun.quaternion.copy(station.rest);
    if(station.weapon){station.weapon.rotation.x=0;station.weapon.position.copy(station.restWeapon);}
    station.shots=0;station.recoil=0;
  }
  /** One station's yaw, pitch and recoil, and on a new shot its flash, report and ejected case. */
  function animateStation(entity:AuxiliaryVisualEntity,actor:StationActor,yaw:number,pitch:number,shots:number,visible:boolean,dt:number){
    if(!actor.gun)return;
    actor.gun.quaternion.copy(actor.rest).multiply(turn.setFromAxisAngle(yAxis,yaw));
    actor.recoil=Math.max(0,actor.recoil-dt*4);
    if(actor.weapon){actor.weapon.rotation.x=-pitch;actor.weapon.position.z=actor.restWeapon.z-actor.recoil*.025;}
    if(visible&&shots!==actor.shots){
      actor.gun.updateWorldMatrix(true,true);
      position.copy(actor.muzzle);
      // The muzzle rotates around the weapon's authored trunnion, not the floor of the pedestal.
      if(actor.weapon){position.sub(actor.restWeapon);actor.weapon.localToWorld(position);}
      else actor.gun.localToWorld(position);
      direction.set(0,0,1).applyQuaternion((actor.weapon??actor.gun).getWorldQuaternion(q));
      ports.flash(position,direction,actor.caliberMm);ports.report(entity.id,position,actor.caliberMm);
      position.addScaledVector(direction,-Math.max(.3,actor.muzzle.z-.2));eject(position,direction);actor.recoil=1;
    }
  }
  function animateRoofWeapon(entity:AuxiliaryVisualEntity,actor:Actor,state:AuxiliaryState,visible:boolean,dt:number){
    animateStation(entity,actor,state.gunYaw,state.gunPitch,state.shots,visible,dt);
    for(let i=0;i<actor.stations.length;i++){
      const station=actor.stations[i]!,s=state.stations?.[i];
      animateStation(entity,station,s?.gunYaw??0,s?.gunPitch??0,s?.shots??station.shots,visible,dt);
      station.shots=s?.shots??station.shots;
    }
  }
  function actorFrame(entity:AuxiliaryVisualEntity,dt:number){
    const root=entity.visual?.root;if(!root)return;
    const actor=actors.get(entity.id)?.root===root?actors.get(entity.id)!:prepare(entity,root);
    const state=entity.combat?.auxiliary;
    if (entity.state) { entity.state.roofGunYaw=state?.gunYaw ?? 0; entity.state.roofGunPitch=state?.gunPitch ?? 0; }
    if(!state){
      restStation(actor);for(let i=0;i<actor.stations.length;i++)restStation(actor.stations[i]!);
      actor.smokeBorn=-1;
      return;
    }
    const visible=(ports.visible?.(entity)??true)&&entity.networkVisible!==false&&root.visible&&!!root.parent&&!entity.combat?.destroyed;
    animateRoofWeapon(entity,actor,state,visible,dt);
    actor.shots=state.shots;
    if(visible&&state.smoke&&state.smoke.born!==actor.smokeBorn){
      // the media screen draws its own launch puffs (its schedule); the phone tier keeps these
      if(!blast&&ports.time()-state.smoke.born<.6){
        for(const shot of state.smoke.canisters??[]){
          position.set(shot[0],shot[1],shot[2]);
          ports.smoke(position,.12,.3,.65);
        }
      }
      actor.smokeBorn=state.smoke.born;
    }
  }
  /** (FX lane 2026-10-17) a screen's drift, read into this scratch (its map's wind, sim/smokeScreen.ts) */
  const _drift={x:0,z:0};
  function puff(screen:SmokeScreen,time:number){
    const age=time-screen.born;if(age<.85||age>SMOKE_DURATION_S-.3)return;
    for(let bank=-2;bank<smokeBankCount(screen)-2;bank++){
      smokeVolume(screen,time,bank,volume,ports.ground);
      if(volume.density<.015)continue;
      // Different-height rolling lobes overlap the shared sight-blocking volume.
      const phase=age*1.7+bank*2.4+screen.born;
      position.set(volume.x+Math.sin(phase)*.65,volume.y+Math.sin(phase*.7)*.5,volume.z+Math.cos(phase)*.65);
      ports.smoke(position,volume.radius/5.6,volume.density,Math.min(4.8,SMOKE_DURATION_S-age),smokeScreenWind(screen,_drift));
    }
  }

  function smokeFrame(screen:SmokeScreen,now:number,trail:boolean,count:number):number{
    const age=now-screen.born;
    for(const shot of screen.canisters??[]){
      if(age<0||age>shot[6]+.5||count>=256)continue;
      smokeCanisterPosition(shot,age,position);
      // (2026-10-09) along its own flight segment: a canister that bounced off a wall turns with its new path
      smokeCanisterVelocity(shot,age,direction);direction.normalize();
      q.setFromUnitVectors(yAxis,direction);scale.setScalar(1);
      matrix.compose(position,q,scale);grenades.setMatrixAt(count++,matrix);
      if(trail&&age<shot[6])ports.smoke(position,.09,.4,.75);
    }
    return count;
  }

  // ---- the media screen (desktop tiers): see the schedule above and atmosRecipes.ts ---------------------------------
  const blast=ports.blast??null;
  const mediaScreens=new Map<SmokeScreen,MediaScreenState>();
  const landing={x:0,y:0,z:0};
  const lobe:SmokeLobeInput={x0:0,y0:0,z0:0,tx:0,ty:0,tz:0,size:1,life:1,fadeOut:.5,crown:false,bo:0,feather:1,densityK:1};

  /** A bank's lead grenade and where it lands (`landing`), or null for a receipt without flights (the legacy arc). */
  function bankLanding(screen:SmokeScreen,bank:number):SmokeCanister|null{
    const shot=screen.canisters?.[screen.banks?.[bank] ?? -1] ?? null;
    if(shot){smokeCanisterPosition(shot,shot[6],landing);return shot;}
    smokeVolume(screen,screen.born+bankLandAge(screen,bank),bank-2,volume,ports.ground);
    landing.x=volume.x;landing.z=volume.z;landing.y=ports.ground(volume.x,volume.z);
    return null;
  }
  /** The screen age a bank's growth starts at: its grenade's contact, or the legacy arc's stagger. */
  function bankLandAge(screen:SmokeScreen,bank:number):number{
    const shot=screen.canisters?.[screen.banks?.[bank] ?? -1];
    return shot ? shot[6] : .85+Math.abs(bank-2)*.06;
  }
  function mediaState(screen:SmokeScreen):MediaScreenState{
    const n=smokeBankCount(screen);
    const xs=new Float32Array(n),zs=new Float32Array(n);
    for(let i=0;i<n;i++){bankLanding(screen,i);xs[i]=landing.x;zs[i]=landing.z;}
    const share=new Float32Array(n),wisps=new Uint8Array(n);
    const stride=Math.max(1,Math.ceil(n/WISP_BANKS));
    for(let i=0;i<n;i++){
      let crowd=1;
      for(let j=0;j<n;j++)if(j!==i)crowd+=Math.max(0,1-Math.hypot(xs[i]!-xs[j]!,zs[i]!-zs[j]!)/CROWD_M);
      share[i]=1/crowd;wisps[i]=i%stride===0&&screen.canisters?1:0;
    }
    const edge=new Float32Array(n);
    const walls=Array.from({length:n},(_,i)=>bankWalls(screen,i));
    return {emittedTo:-1,share,wisps,wall:wallStretches(screen,xs,zs,edge),edge,walls,seen:true};
  }
  /** Each bank's stretch of the wall: the banks ordered across the launcher's arc (their flights' bearings off its
   *  facing; a legacy arc's by bank), each reaching half way to its neighbours along the row. */
  function wallStretches(screen:SmokeScreen,xs:Float32Array,zs:Float32Array,edge?:Float32Array):Float32Array{
    const n=xs.length,wall=new Float32Array(n*6);
    const bearing=(i:number)=>{
      const shot=screen.canisters?.[screen.banks?.[i] ?? -1];
      if(!shot)return i;
      let a=Math.atan2(shot[3],shot[5])-screen.yaw;
      while(a>Math.PI)a-=2*Math.PI;while(a<=-Math.PI)a+=2*Math.PI;
      return a;
    };
    const order=Array.from({length:n},(_,i)=>i).sort((a,b)=>bearing(a)-bearing(b)||a-b);
    for(let k=0;k<n;k++){
      const i=order[k]!,p=k>0?order[k-1]!:-1,q=k<n-1?order[k+1]!:-1;
      if(edge)edge[i]=n>1?Math.abs(2*k/(n-1)-1):1;
      // across the bank's own flight, for a row's end (or a bank alone)
      const shot=screen.canisters?.[screen.banks?.[i] ?? -1];
      let fx=Math.sin(screen.yaw),fz=Math.cos(screen.yaw);
      if(shot){const h=Math.hypot(shot[3],shot[5]);if(h>1e-3){fx=shot[3]/h;fz=shot[5]/h;}}
      let bx=fz,bz=-fx,be=WALL_END_M,ax=-fz,az=fx,ae=WALL_END_M;
      const dq=q>=0?Math.hypot(xs[q]!-xs[i]!,zs[q]!-zs[i]!):0,dp=p>=0?Math.hypot(xs[p]!-xs[i]!,zs[p]!-zs[i]!):0;
      if(q>=0&&dq>.05){ax=(xs[q]!-xs[i]!)/dq;az=(zs[q]!-zs[i]!)/dq;ae=Math.min(WALL_REACH_M,dq/2);}
      if(p>=0&&dp>.05){bx=(xs[p]!-xs[i]!)/dp;bz=(zs[p]!-zs[i]!)/dp;be=Math.min(WALL_REACH_M,dp/2);}
      // a row's end continues its neighbour's line outward
      if(p<0&&q>=0&&dq>.05){bx=-ax;bz=-az;}
      if(q<0&&p>=0&&dp>.05){ax=-bx;az=-bz;}
      wall.set([bx,bz,be,ax,az,ae],i*6);
    }
    return wall;
  }
  /** A place on a bank's stretch of the wall (into `at`): `along` the row from (x0, z0), back (< 0) or ahead (> 0), and
   *  `deep` across it (toward the launcher or away, along the row's normal there: its two directions turned a quarter). */
  const at={x:0,z:0};
  function spot(w:Float32Array,o:number,along:number,deep:number,x0:number,z0:number):void{
    const ux=along<0?w[o]!:w[o+3]!,uz=along<0?w[o+1]!:w[o+4]!,d=Math.abs(along);
    const nx=w[o+4]!-w[o+1]!,nz=w[o]!-w[o+3]!,nl=Math.hypot(nx,nz)||1;
    at.x=x0+ux*d+nx/nl*deep;at.z=z0+uz*d+nz/nl*deep;
  }
  /** Emit one bank's schedule over screen ages (from, to]: births backdated to their own times (to = now). */
  function mediaBank(C:BlastContext,screen:SmokeScreen,bank:number,st:MediaScreenState,from:number,to:number){
    const born=screen.born,tLand=bankLandAge(screen,bank);
    const shot=bankLanding(screen,bank);
    const lx=landing.x,ly=landing.y,lz=landing.z;
    const share=st.share[bank]!,walls=st.walls[bank] ?? null;
    // 0. (r2, wave 311: "rows of tiny black dots") the launch: a white puff at every bank's tube as its grenade leaves
    if(shot&&.02>from&&.02<=to){
      smokeCanisterPosition(shot,.02,landing);
      smokeLaunchPuff(C,puffRandom(slotSeed(born,lx,lz,bank,0)),landing.x,landing.y,landing.z,shot[3],shot[4],shot[5],.02-to);
    }
    // 1. the wisps behind the lead grenades in flight
    if(shot&&st.wisps[bank]){
      for(let k=1;k*WISP_EVERY_S<tLand;k++){
        const t=k*WISP_EVERY_S;
        if(!(t>from&&t<=to)||t+WISP_LIFE_S<to)continue;
        smokeCanisterPosition(shot,t,landing);
        smokeGrenadeWisp(C,puffRandom(slotSeed(born,lx,lz,bank,k)),landing.x,landing.y,landing.z,t-to);
      }
    }
    // the bank's settled centre (its full growth, 2.2 s after landing, drifted as the simulation drifts it)
    smokeVolume(screen,born+tLand+2.2,bank-2,volume,ports.ground);
    // 2. the burst where it lands; (fx 9, wave 404: "small puffs sit right in the window openings") by a wall, it bursts
    //    a little way off the wall's face and throws nothing into it (smokeGrenadeBurst's `wall`: its front normal)
    if(tLand>from&&tLand<=to&&tLand+3.9>=to){
      at.x=lx;at.z=lz;
      holdOffWalls(walls,screen,bank-2,volume,at,50,false,BIRTH_STANDOFF_K);
      const bx=at.x,bz=at.z,near=walls?nearestWall(walls,bx,bz):Infinity;
      if(near<BURST_WALL_M){burstWall.x=_wf.nx;burstWall.z=_wf.nz;}
      smokeGrenadeBurst(C,puffRandom(slotSeed(born,lx,lz,bank,50)),bx,smokeBankBase(screen,bank-2,bx,bz,ports.ground),bz,share,tLand-to,
        near<BURST_WALL_M?burstWall:null);
    }
    const cx=volume.x,cz=volume.z;
    // the bank's stretch of the wall (wallStretches): back toward one neighbour, ahead toward the other
    const w=st.wall,o=bank*6,back=w[o+2]!,ahead=w[o+5]!,span=back+ahead;
    // 2b. (fx 8r) the skirt: low wide puffs born along the bank's stretch right after its landing, swelling within a
    //     second, so the row closes before the lobes have travelled out to it (held off the walls as the lobes are)
    const skirts=Math.max(1,Math.round(span/SKIRT_PITCH_M));
    for(let k=0;k<skirts;k++){
      const t=tLand+SKIRT_START_S+k*SKIRT_EVERY_S;
      const life=SKIRT_LIFE_S[0]+(SKIRT_LIFE_S[1]-SKIRT_LIFE_S[0])*((k*0.618)%1);
      if(!(t>from&&t<=to)||t+life<to)continue;
      const R=puffRandom(slotSeed(born,lx,lz,bank,700+k));
      spot(w,o,-back+(k+.5)*span/skirts+(R()-.5)*.8,(R()-.5)*1.2,lx,lz);
      smokeVolume(screen,born+tLand+2.2,bank-2,volume,ports.ground);
      holdOffWalls(walls,screen,bank-2,volume,at,700+k);
      const x=at.x,z=at.z,room=mediaRoom(st.walls,bank,x,z);
      const size=Math.min(5.2+R()*1.6,Math.max(1.6,2*(room+1)));
      smokeBankSkirt(C,R,x,smokeBankBase(screen,bank-2,x,z,ports.ground)+1.0+R()*.4,z,size,life,.55,t-to,wallFeather(room),wallDensity(room));
    }
    // 3. the bloom: lobes out of the burst to their places along the bank's stretch of the wall, crowns over its middle
    const feet=Math.max(1,Math.round(span/WALL_PITCH_M)),crowns=Math.max(1,Math.round(2*share)),lobes=feet+crowns;
    for(let j=0,foot=0,crowned=0;j<lobes;j++){
      const crown=crowned<crowns&&(j%3===2||foot>=feet);
      const slot=crown?crowned++:foot++;
      const t=tLand+.04+j*LOBE_EVERY_S;
      if(!(t>from&&t<=to)||LOBE_END_S<=to)continue;
      const R=puffRandom(slotSeed(born,lx,lz,bank,100+j));
      const along=crown?(R()-.5)*Math.min(4,span*.5):-back+(slot+.5)*span/feet+(R()-.5)*1.2;
      spot(w,o,along,crown?(R()-.5)*1.5:(R()-.5)*3.2,cx,cz);
      // (2026-10-09) no lobe of a bank past the walls its smoke stopped at (the settled volume's reach, smokeScreen.ts);
      // (fx 9) held the way smoke meets a wall (holdOffWalls): a ragged edge off it, piled up in front of it, slid along
      // the facade and round its corner
      const bite=holdOffWalls(walls,screen,bank-2,volume,at,100+j);
      lobe.tx=at.x;lobe.tz=at.z;
      // (fx 9) born from the burst a little way off the wall's face, as the burst is
      at.x=lx;at.z=lz;
      holdOffWalls(walls,screen,bank-2,volume,at,100+j,false,BIRTH_STANDOFF_K);
      lobe.x0=at.x;lobe.y0=ly+.6;lobe.z0=at.z;
      // (fx 8m, wave 337: "a flat grey mass with little billow") the crowns stand on the feet, their tops a metre and
      // more over the feet's line (a lumpy, sunlit top), every centre inside the envelope's 4.2 m
      lobe.ty=smokeBankBase(screen,bank-2,lobe.tx,lobe.tz,ports.ground)+(crown?3.55+R()*.55:1.6+R()*.8)+(crown?0:Math.min(1.2,bite*.5));
      // (fx 8l) more, smaller lobes of mixed size (WALL_PITCH_M 2.8 -> 2.2): a cauliflower wall, not a row of balls;
      // (fx 8m) the crowns smaller than the feet they stand on, so they read as its bumps
      lobe.size=crown?5.2+R()*1.2:7.2+R()*2.0;
      // (2026-10-10) a lobe by a wall no wider than its room there and a metre (it neither spreads through the wall nor
      // over the roof); the open field keeps every size
      const lobeRoom=mediaRoom(st.walls,bank,lobe.tx,lobe.tz);
      lobe.size=Math.min(lobe.size,Math.max(1.6,2*(lobeRoom+1)));
      lobe.feather=wallFeather(lobeRoom);
      lobe.densityK=wallDensity(lobeRoom);
      // (fx 9) erosion by role: the crowns first, the row's flanks next, its core last (EROSION)
      const flank=crown?0:Math.pow(st.edge[bank]!,1.5);
      const erodeAt=crown?EROSION.crownStart:EROSION.coreStart+(EROSION.flankStart-EROSION.coreStart)*flank;
      const endAt=crown?EROSION.crownEnd:LOBE_END_S+(EROSION.flankEnd-LOBE_END_S)*flank;
      lobe.life=endAt-t;
      lobe.fadeOut=Math.min(.9,Math.max(.25,(erodeAt-t)/lobe.life));
      lobe.crown=crown;lobe.bo=t-to;
      smokeBankLobe(C,R,lobe);
    }
    // 3b. (fx 9) each eroding crown and flank foot sheds a wisp the scene's wind carries off, born inside it as it
    //     starts to thin (its place re-drawn from the lobe's own seeded stream: the same four draws the bloom took)
    for(let j=0,foot=0,crowned=0;j<lobes;j++){
      const crown=crowned<crowns&&(j%3===2||foot>=feet);
      const slot=crown?crowned++:foot++;
      const flank=crown?0:Math.pow(st.edge[bank]!,1.5);
      if(!crown&&!(flank>.5))continue;
      const erodeAt=crown?EROSION.crownStart:EROSION.coreStart+(EROSION.flankStart-EROSION.coreStart)*flank;
      const tw=tLand+erodeAt-1.2;
      const W=puffRandom(slotSeed(born,lx,lz,bank,800+j));
      const wl=EROSION.wispLife[0]+W()*(EROSION.wispLife[1]-EROSION.wispLife[0]);
      if(!(tw>from&&tw<=to)||tw+wl<to)continue;
      const R=puffRandom(slotSeed(born,lx,lz,bank,100+j));
      const along=crown?(R()-.5)*Math.min(4,span*.5):-back+(slot+.5)*span/feet+(R()-.5)*1.2;
      spot(w,o,along,crown?(R()-.5)*1.5:(R()-.5)*3.2,cx,cz);
      const bite=holdOffWalls(walls,screen,bank-2,volume,at,100+j);
      const ty=smokeBankBase(screen,bank-2,at.x,at.z,ports.ground)+(crown?3.55+R()*.55:1.6+R()*.8)+(crown?0:Math.min(1.2,bite*.5));
      const size=Math.min(crown?5.2+R()*1.2:7.2+R()*2.0,Math.max(1.6,2*(mediaRoom(st.walls,bank,at.x,at.z)+1)));
      // (fx 9) a wisp torn off by a wall stays off it and grows no wider than its room there (it spreads as it goes)
      at.x+=(W()-.5)*size*.3;at.z+=(W()-.5)*size*.3;
      holdOffWalls(walls,screen,bank-2,volume,at,800+j,false);
      smokeErosionWisp(C,W,at.x,ty+(crown?size*.25:size*.1),at.z,size*.6,wl,tw-to,Math.max(1.6,2*(mediaRoom(st.walls,bank,at.x,at.z)+1)));
    }
    // 4. the body: puffs swelling in inside the (drifting) bank, keeping it dense while the lobes age
    const bodies=Math.max(1,Math.round(BODIES*share)),bodyEvery=BODY_EVERY_S*BODIES/bodies;
    for(let j=0;j<bodies;j++){
      const t=tLand+BODY_START_S+j*bodyEvery;
      if(!(t>from&&t<=to)||t>=SCREEN_END_S)continue;
      const life=Math.min(8.4,BODY_END_S-t);
      if(t+life<to)continue;
      const R=puffRandom(slotSeed(born,lx,lz,bank,200+j));
      smokeVolume(screen,born+t,bank-2,volume,ports.ground);
      spot(w,o,-back+R()*span,(R()-.5)*.3*volume.radius,volume.x,volume.z);
      const bodyBite=holdOffWalls(walls,screen,bank-2,volume,at,200+j);
      const x=at.x,z=at.z;
      const bodyRoom=mediaRoom(st.walls,bank,x,z);
      const y=smokeBankBase(screen,bank-2,x,z,ports.ground)+1.5+R()*2.0+Math.min(1.2,bodyBite*.35),size=Math.min(8+R()*2.5,Math.max(1.6,2*(bodyRoom+1)));
      // (fx 9) in the open it drifts on the simulation's breeze as the blocking volume does; by a wall it stays
      const drift=bodyRoom>BODY_DRIFT_ROOM_M?1:0;
      smokeBankBody(C,R,x,y,z,size,life,Math.min(.75,Math.max(.25,(BODY_ERODE_S-t)/life)),t-to,wallFeather(bodyRoom),wallDensity(bodyRoom),
        smokeScreenWind(screen,_drift).x*drift,_drift.z*drift);
    }
    // 5. wisps torn off its top into the scene's wind
    const tops=Math.max(1,Math.round(TOPS*share)),topEvery=TOP_EVERY_S*TOPS/tops;
    for(let j=0;j<tops;j++){
      const t=tLand+TOP_START_S+j*topEvery;
      if(!(t>from&&t<=to)||t+6.5<to||t>=SCREEN_END_S-4)continue;
      const R=puffRandom(slotSeed(born,lx,lz,bank,300+j));
      smokeVolume(screen,born+t,bank-2,volume,ports.ground);
      const a=R()*Math.PI*2,rho=R()*.4*volume.radius;
      at.x=volume.x+Math.cos(a)*rho;at.z=volume.z+Math.sin(a)*rho;
      holdOffWalls(walls,screen,bank-2,volume,at,300+j);
      const x=at.x,z=at.z;
      smokeBankWisp(C,R,x,smokeBankBase(screen,bank-2,x,z,ports.ground)+4.6+R()*1.0,z,t-to,Math.max(1.6,2*(mediaRoom(st.walls,bank,x,z)+1)));
    }
    // 6. (r2) the haze tail: as the wall erodes, a thin veil left in the bank drifts on with the simulation's breeze
    const hazes=Math.max(1,Math.round(HAZES*share));
    for(let j=0;j<hazes;j++){
      const t=Math.max(tLand+4,HAZE_START_S+j*HAZE_EVERY_S*HAZES/hazes);
      if(!(t>from&&t<=to)||t>=SCREEN_END_S-1)continue;
      const R=puffRandom(slotSeed(born,lx,lz,bank,400+j));
      smokeVolume(screen,born+t,bank-2,volume,ports.ground);
      spot(w,o,-back+R()*span,(R()-.5)*.25*volume.radius,volume.x,volume.z);
      holdOffWalls(walls,screen,bank-2,volume,at,400+j);
      const x=at.x,z=at.z;
      smokeScreenWind(screen,_drift);
      smokeScreenHaze(C,R,x,smokeBankBase(screen,bank-2,x,z,ports.ground)+2.0+R()*1.2,z,_drift.x,_drift.z,SCREEN_END_S-t+HAZE_LINGER_S,t-to,Math.max(1.6,2*(mediaRoom(st.walls,bank,x,z)+1)),SMOKE_DURATION_S-t);
    }
    // 7. (fx 8l) the decay: the eroding wall's top and edges taken by the scene's wind, thinning for 10-20 s past the
    //    sight block (born inside the drifting bank while the simulation still blocks)
    const decays=Math.max(1,Math.round(DECAYS*share));
    for(let j=0;j<decays;j++){
      const t=Math.max(tLand+5,DECAY_START_S+j*DECAY_EVERY_S*DECAYS/decays);
      if(!(t>from&&t<=to)||t>=SCREEN_END_S)continue;
      const R=puffRandom(slotSeed(born,lx,lz,bank,500+j));
      smokeVolume(screen,born+t,bank-2,volume,ports.ground);
      spot(w,o,-back+R()*span,(R()-.5)*.5*volume.radius,volume.x,volume.z);
      // (fx 8m, over fix/smoke-collision) held inside the walls its bank stopped at, no wider than its room by a wall
      holdOffWalls(walls,screen,bank-2,volume,at,500+j);
      const x=at.x,z=at.z;
      const life=DECAY_LIFE_S[0]+R()*(DECAY_LIFE_S[1]-DECAY_LIFE_S[0]);
      // (EF.03, the SSOT rule) past the 18 s sight block a veil only fades: its fade is under way by then
      smokeDecayHaze(C,R,x,smokeBankBase(screen,bank-2,x,z,ports.ground)+2.6+R()*2.4,z,life,t-to,Math.max(1.6,2*(mediaRoom(st.walls,bank,x,z)+1)),SMOKE_DURATION_S-t);
    }
  }
  /** (fx 8m, wave 337: "no visible strike or bounce at the wall") every canister's strikes on its way, over screen ages
   *  (from, to]: where it left the wall, the wall's normal from the turn the bounce made (the velocity after less the
   *  velocity it struck with: the reflection turns the speed into the wall out of it). Receipts without bounces (the
   *  launch's seven numbers) strike nothing. */
  function mediaStrikes(C:BlastContext,screen:SmokeScreen,from:number,to:number){
    const shots=screen.canisters;if(!shots)return;
    for(let i=0;i<shots.length;i++){
      const shot=shots[i]!;
      for(let o=7,b=0;o+SMOKE_SEGMENT-1<shot.length;o+=SMOKE_SEGMENT,b++){
        const t=shot[o]!;
        if(!(t>from&&t<=to)||t+STRIKE_LIFE_S<to)continue;
        // the velocity it struck with: the segment before this bounce's, at the bounce
        const p=o-SMOKE_SEGMENT,t0=p>=7?shot[p]!:0,v=p>=7?p+4:3;
        let nx=shot[o+4]!-shot[v]!,ny=shot[o+5]!-(shot[v+1]!-SMOKE_GRAVITY_MPS2*(t-t0)),nz=shot[o+6]!-shot[v+2]!;
        const nl=Math.hypot(nx,ny,nz);
        if(nl>1e-6){nx/=nl;ny/=nl;nz/=nl;}else{nx=0;ny=1;nz=0;}
        const x=shot[o+1]!,y=shot[o+2]!,z=shot[o+3]!;
        smokeCanisterStrike(C,puffRandom(slotSeed(screen.born,x,z,i,600+b)),x,y,z,nx,ny,nz,t-to);
      }
      // (fx 9, wave 404: "no strip shows a grenade ... dropping back outside") a grenade that struck a wall trails its
      // fuse's thread from the knock down to where it rests (every one that bounced, not only the lead grenades)
      if(shot.length>7){
        const first=shot[7]!,end=shot[6]!;
        for(let k=1;first+k*WISP_EVERY_S<end;k++){
          const t=first+k*WISP_EVERY_S;
          if(!(t>from&&t<=to)||t+WISP_LIFE_S<to)continue;
          smokeCanisterPosition(shot,t,landing);
          smokeGrenadeWisp(C,puffRandom(slotSeed(screen.born,landing.x,landing.z,i,900+k)),landing.x,landing.y,landing.z,t-to);
        }
      }
    }
  }
  function mediaScreen(screen:SmokeScreen,now:number){
    let st=mediaScreens.get(screen);
    if(!st){st=mediaState(screen);mediaScreens.set(screen,st);}
    st.seen=true;
    const age=Math.min(now-screen.born,SCREEN_END_S);
    if(!(age>st.emittedTo))return;
    const from=st.emittedTo;st.emittedTo=age;
    for(let bank=0;bank<smokeBankCount(screen);bank++)mediaBank(blast!,screen,bank,st,from,age);
    mediaStrikes(blast!,screen,from,age);
  }
  /** Screens no longer published are forgotten (the match list keeps 18 s; a rematch clears it). */
  function pruneMediaScreens(){
    for(const [screen,st] of mediaScreens){if(!st.seen)mediaScreens.delete(screen);else st.seen=false;}
  }

  /** One screen this frame: its grenades in flight, then its smoke (the media's schedule, else the pooled puffs). */
  function screenFrame(screen:SmokeScreen,now:number,trail:boolean,emitPuff:boolean,count:number):number{
    count=smokeFrame(screen,now,trail&&!blast,count);
    if(blast)mediaScreen(screen,now);
    else if(emitPuff)puff(screen,now);
    return count;
  }

  function updateCasings(dt:number){
      let count=0;
      for(const item of pool){
        item.age+=dt;if(item.age>2.5)continue;
        item.v.y-=9.81*dt;item.p.addScaledVector(item.v,dt);
        const ground=ports.ground(item.p.x,item.p.z)+.025;
        if(item.p.y<ground){item.p.y=ground;item.v.multiplyScalar(.35);item.v.y=Math.abs(item.v.y);}
        q.setFromEuler(rotation.set(item.age*12,item.age*7,item.age*9));scale.setScalar(1);
        matrix.compose(item.p,q,scale);casings.setMatrixAt(count,matrix);casings.setColorAt(count,color.setHex(0xbfa35f));count++;
      }
      casings.count=count;casings.instanceMatrix.needsUpdate=true;if(casings.instanceColor)casings.instanceColor.needsUpdate=true;
  }

  return {
    setNetworkScreens(screens:readonly SmokeScreen[]){
      // Solo already owns expanded receipts and publishes them each sim step.
      // Decode only compact network receipts, never clone the solo list per frame.
      let compact=false;
      for(const screen of screens)if(!screen.canisters&&screen.source){compact=true;break;}
      networkScreens=compact?screens.map(restoreSmokeScreen):screens;
    },
    update(){
      const now=ports.time();if(now===lastTime)return;const dt=lastTime<0?0:Math.min(.1,Math.max(0,now-lastTime));lastTime=now;
      for(const entity of ports.entities())actorFrame(entity,dt);
      const emitPuff=now-lastPuff>.4, trail=now-lastTrail>.075;
      if(emitPuff)lastPuff=now;if(trail)lastTrail=now;
      let count=0;
      if(networkScreens)for(const screen of networkScreens){
        count=screenFrame(screen,now,trail,emitPuff,count);
      }else for(const entity of ports.entities()){
        const screen=entity.combat?.auxiliary?.smoke;if(!screen)continue;
        count=screenFrame(screen,now,trail,emitPuff,count);
      }
      if(blast)pruneMediaScreens();
      grenades.count=count;if(count)grenades.instanceMatrix.needsUpdate=true;
      updateCasings(dt);
    },
    reset(){
      for(const a of actors.values()){if(a.gun)a.gun.quaternion.copy(a.rest);if(a.weapon){a.weapon.rotation.x=0;a.weapon.position.copy(a.restWeapon);}}
      actors.clear();networkScreens=null;mediaScreens.clear();lastTime=-1;lastPuff=-1;lastTrail=-1;grenades.count=0;for(const item of pool)item.age=9;casings.count=0;
    },
  };
}
