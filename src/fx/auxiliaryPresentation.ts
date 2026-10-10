import { restoreSmokeScreen } from '../sim/smokeReceipt.ts';
import * as THREE from 'three';
import { auxiliaryCapabilities, SMOKE_DURATION_S, type AuxiliaryState, type SmokeScreen } from '../sim/auxiliarySystems.ts';
import {smokeVolume, smokeBankCount, SMOKE_WIND_X, SMOKE_WIND_Z, type SmokeVolume} from '../sim/smokeScreen.ts';
import { smokeCanisterPosition, SMOKE_GRAVITY_MPS2, type SmokeCanister } from '../sim/smokeBallistics.ts';
import type { BlastContext } from './blastRecipes.ts';
import {
  puffRandom, slotSeed, smokeBankBody, smokeBankLobe, smokeBankWisp, smokeGrenadeBurst, smokeGrenadeWisp, smokeLaunchPuff,
  smokeScreenHaze, type SmokeLobeInput,
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
  smoke(position: THREE.Vector3, scale: number, density?:number, life?:number, wind?:boolean): void;
  ground(x:number,z:number): number;
  /** The media layer (desktop tiers): when given, screens are drawn as simulated smoke (atmosRecipes.ts) and the pooled
   *  `smoke` port is not used for them. The phone tier passes none and keeps the pooled sprites. */
  blast?: BlastContext | null;
}

// ---- the media screen's schedule (atmospherics lane, 2026-10-08) -----------------------------------------------
// Each bank's puffs are emitted at fixed times of its own life (seconds after its grenade lands: the simulation's
// growth clock), each from its own seeded stream: the same screen draws the same cloud at any frame rate, and a screen
// first seen late (a joiner, a frame hitch, a killcam cut) is filled in with every puff still alive, backdated.
/** in flight: a wisp behind each bank's lead grenade this often (s of flight) */
const WISP_EVERY_S = 0.1;
/** at most this many banks trail wisps (a 24-tube salvo's arcs overlap: a few trails read as all of them) */
const WISP_BANKS = 6;
/** bloom: lobes are born this far apart, the foot lobes first with a crown every third (any prefix mixes both) */
const LOBE_EVERY_S = 0.09;
/** body puffs keep the wall dense while the lobes age; wisps tear off its top in the scene's wind */
const BODY_START_S = 2.4, BODY_EVERY_S = 1.6, BODIES = 6;
const TOP_START_S = 3.0, TOP_EVERY_S = 2.4, TOPS = 4;
/** the screen's own end on its age (the simulation's density reaches 0 at 18 s): nothing outlives it */
const SCREEN_END_S = SMOKE_DURATION_S - 0.2;
/** (r2, wave 311: "see-through by 15 s") the wall holds dense while the simulation's density does (to 13.5 s), and its
 *  lobes erode away as the density falls to the sight-blocking floor (0.22 at ~16.6 s): what blocks sight looks dense,
 *  and what no longer blocks is gone */
const LOBE_END_S = 16.6, LOBE_ERODE_S = 13.5;
/** the bodies thin from the same age */
const BODY_ERODE_S = 14.0;
/** the haze tail: a thin, see-through veil left inside each bank as the wall erodes, drifting with the simulation's
 *  breeze until the screen's end (it hides nothing: the density no longer blocks sight by then) */
const HAZE_START_S = 13.2, HAZE_EVERY_S = 0.8, HAZES = 2;
/** banks closer than this share their lobes and body puffs (one wall, not a stack of cards) */
const CROWD_M = 12;
/** (r2, wave 311: "a gap exactly where the tank stands") the banks of a salvo, in their order across the launcher's arc,
 *  draw one continuous wall: each bank's foot lobes stand along its own stretch of the row (half way to each neighbour,
 *  at most WALL_REACH_M: never past what its envelope covers; the row's ends reach WALL_END_M), one lobe per
 *  WALL_PITCH_M, so a bank beside a wide gap fills it and a bank among close neighbours does not pile up */
const WALL_REACH_M = 7, WALL_END_M = 6, WALL_PITCH_M = 2.8;

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
  seen: boolean;
}
interface Actor {
  root: THREE.Object3D;
  gun: THREE.Object3D | null;
  weapon: THREE.Object3D | null;
  rest: THREE.Quaternion;
  restWeapon: THREE.Vector3;
  muzzle: THREE.Vector3;
  shots: number;
  smokeBorn: number;
  recoil: number;
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
  function prepare(entity:AuxiliaryVisualEntity,root:THREE.Object3D):Actor{
    const kit=auxiliaryCapabilities(entity.spec), mount=kit?.guns[0];
    const gun=mount ? root.getObjectByName(mount.name)??null : null;
    const actor:Actor={root,gun,weapon:gun?.getObjectByName('auxiliaryWeaponPitch')??null,rest:gun?.quaternion.clone()??new THREE.Quaternion(),
      restWeapon:new THREE.Vector3(),muzzle:new THREE.Vector3(...(mount?.muzzle as [number,number,number]??[0,.35,1.22])),shots:entity.combat?.auxiliary?.shots??0,smokeBorn:-1,recoil:0};
    if(actor.weapon)actor.restWeapon.copy(actor.weapon.position);actors.set(entity.id,actor);return actor;
  }
  function animateRoofWeapon(entity:AuxiliaryVisualEntity,actor:Actor,state:AuxiliaryState,visible:boolean,dt:number){
    if(actor.gun){
      actor.gun.quaternion.copy(actor.rest).multiply(turn.setFromAxisAngle(yAxis,state.gunYaw));
      actor.recoil=Math.max(0,actor.recoil-dt*4);
      if(actor.weapon){actor.weapon.rotation.x=-state.gunPitch;actor.weapon.position.z=actor.restWeapon.z-actor.recoil*.025;}
      if(visible&&state.shots!==actor.shots){
        actor.gun.updateWorldMatrix(true,true);
        position.copy(actor.muzzle);
        // The muzzle rotates around the weapon's authored trunnion, not the floor of the pedestal.
        if(actor.weapon){position.sub(actor.restWeapon);actor.weapon.localToWorld(position);}
        else actor.gun.localToWorld(position);
        direction.set(0,0,1).applyQuaternion((actor.weapon??actor.gun).getWorldQuaternion(q));
        const caliber=auxiliaryCapabilities(entity.spec)?.guns[0]?.caliberMm??12.7;
        ports.flash(position,direction,caliber);ports.report(entity.id,position,caliber);
        position.addScaledVector(direction,-Math.max(.3,actor.muzzle.z-.2));eject(position,direction);actor.recoil=1;
      }
    }
  }
  function actorFrame(entity:AuxiliaryVisualEntity,dt:number){
    const root=entity.visual?.root;if(!root)return;
    const actor=actors.get(entity.id)?.root===root?actors.get(entity.id)!:prepare(entity,root);
    const state=entity.combat?.auxiliary;
    if (entity.state) { entity.state.roofGunYaw=state?.gunYaw ?? 0; entity.state.roofGunPitch=state?.gunPitch ?? 0; }
    if(!state){
      if(actor.gun)actor.gun.quaternion.copy(actor.rest);
      if(actor.weapon){actor.weapon.rotation.x=0;actor.weapon.position.copy(actor.restWeapon);}
      actor.shots=0;actor.recoil=0;actor.smokeBorn=-1;
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
  function puff(screen:SmokeScreen,time:number){
    const age=time-screen.born;if(age<.85||age>SMOKE_DURATION_S-.3)return;
    for(let bank=-2;bank<smokeBankCount(screen)-2;bank++){
      smokeVolume(screen,time,bank,volume,ports.ground);
      if(volume.density<.015)continue;
      // Different-height rolling lobes overlap the shared sight-blocking volume.
      const phase=age*1.7+bank*2.4+screen.born;
      position.set(volume.x+Math.sin(phase)*.65,volume.y+Math.sin(phase*.7)*.5,volume.z+Math.cos(phase)*.65);
      ports.smoke(position,volume.radius/5.6,volume.density,Math.min(4.8,SMOKE_DURATION_S-age),true);
    }
  }

  function smokeFrame(screen:SmokeScreen,now:number,trail:boolean,count:number):number{
    const age=now-screen.born;
    for(const shot of screen.canisters??[]){
      if(age<0||age>shot[6]+.5||count>=256)continue;
      smokeCanisterPosition(shot,age,position);
      direction.set(shot[3],shot[4]-SMOKE_GRAVITY_MPS2*Math.min(age,shot[6]),shot[5]).normalize();
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
  const lobe:SmokeLobeInput={x0:0,y0:0,z0:0,tx:0,ty:0,tz:0,size:1,life:1,fadeOut:.5,crown:false,bo:0};

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
    return {emittedTo:-1,share,wisps,wall:wallStretches(screen,xs,zs),seen:true};
  }
  /** Each bank's stretch of the wall: the banks ordered across the launcher's arc (their flights' bearings off its
   *  facing; a legacy arc's by bank), each reaching half way to its neighbours along the row. */
  function wallStretches(screen:SmokeScreen,xs:Float32Array,zs:Float32Array):Float32Array{
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
    const share=st.share[bank]!;
    // 0. (r2, wave 311: "rows of tiny black dots") the launch: a white puff at every bank's tube as its grenade leaves
    if(shot&&.02>from&&.02<=to){
      smokeCanisterPosition(shot,.02,landing);
      smokeLaunchPuff(C,puffRandom(slotSeed(born,lx,lz,bank,0)),landing.x,landing.y,landing.z,shot[3],shot[4],shot[5],.02-to);
    }
    // 1. the wisps behind the lead grenades in flight
    if(shot&&st.wisps[bank]){
      for(let k=1;k*WISP_EVERY_S<tLand;k++){
        const t=k*WISP_EVERY_S;
        if(!(t>from&&t<=to)||t+1.7<to)continue;
        smokeCanisterPosition(shot,t,landing);
        smokeGrenadeWisp(C,puffRandom(slotSeed(born,lx,lz,bank,k)),landing.x,landing.y,landing.z,t-to);
      }
    }
    // 2. the burst where it lands
    if(tLand>from&&tLand<=to&&tLand+3.9>=to){
      smokeGrenadeBurst(C,puffRandom(slotSeed(born,lx,lz,bank,50)),lx,ports.ground(lx,lz),lz,share,tLand-to);
    }
    // the bank's settled centre (its full growth, 2.2 s after landing, drifted as the simulation drifts it)
    smokeVolume(screen,born+tLand+2.2,bank-2,volume,ports.ground);
    const cx=volume.x,cz=volume.z;
    // the bank's stretch of the wall (wallStretches): back toward one neighbour, ahead toward the other
    const w=st.wall,o=bank*6,back=w[o+2]!,ahead=w[o+5]!,span=back+ahead;
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
      lobe.x0=lx;lobe.y0=ly+.6;lobe.z0=lz;
      lobe.tx=at.x;lobe.tz=at.z;
      lobe.ty=ports.ground(lobe.tx,lobe.tz)+(crown?3.0+R()*.6:1.8+R()*.9);
      lobe.size=crown?8.6+R()*1.4:9.6+R()*2.0;
      lobe.life=LOBE_END_S-t;
      lobe.fadeOut=Math.min(.9,Math.max(.3,(LOBE_ERODE_S-t)/lobe.life));
      lobe.crown=crown;lobe.bo=t-to;
      smokeBankLobe(C,R,lobe);
    }
    // 4. the body: puffs swelling in inside the (drifting) bank, keeping it dense while the lobes age
    const bodies=Math.max(1,Math.round(BODIES*share)),bodyEvery=BODY_EVERY_S*BODIES/bodies;
    for(let j=0;j<bodies;j++){
      const t=tLand+BODY_START_S+j*bodyEvery;
      if(!(t>from&&t<=to)||t>=SCREEN_END_S)continue;
      const life=Math.min(7.2,SCREEN_END_S-t);
      if(t+life<to)continue;
      const R=puffRandom(slotSeed(born,lx,lz,bank,200+j));
      smokeVolume(screen,born+t,bank-2,volume,ports.ground);
      spot(w,o,-back+R()*span,(R()-.5)*.3*volume.radius,volume.x,volume.z);
      const x=at.x,z=at.z;
      smokeBankBody(C,R,x,ports.ground(x,z)+1.5+R()*2.0,z,8+R()*2.5,life,Math.min(.75,Math.max(.3,(BODY_ERODE_S-t)/life)),t-to);
    }
    // 5. wisps torn off its top into the scene's wind
    const tops=Math.max(1,Math.round(TOPS*share)),topEvery=TOP_EVERY_S*TOPS/tops;
    for(let j=0;j<tops;j++){
      const t=tLand+TOP_START_S+j*topEvery;
      if(!(t>from&&t<=to)||t+6.5<to||t>=SCREEN_END_S-4)continue;
      const R=puffRandom(slotSeed(born,lx,lz,bank,300+j));
      smokeVolume(screen,born+t,bank-2,volume,ports.ground);
      const a=R()*Math.PI*2,rho=R()*.4*volume.radius;
      const x=volume.x+Math.cos(a)*rho,z=volume.z+Math.sin(a)*rho;
      smokeBankWisp(C,R,x,ports.ground(x,z)+4.6+R()*1.0,z,t-to);
    }
    // 6. (r2) the haze tail: as the wall erodes, a thin veil left in the bank drifts on with the simulation's breeze
    const hazes=Math.max(1,Math.round(HAZES*share));
    for(let j=0;j<hazes;j++){
      const t=Math.max(tLand+4,HAZE_START_S+j*HAZE_EVERY_S*HAZES/hazes);
      if(!(t>from&&t<=to)||t>=SCREEN_END_S-1)continue;
      const R=puffRandom(slotSeed(born,lx,lz,bank,400+j));
      smokeVolume(screen,born+t,bank-2,volume,ports.ground);
      spot(w,o,-back+R()*span,(R()-.5)*.25*volume.radius,volume.x,volume.z);
      const x=at.x,z=at.z;
      smokeScreenHaze(C,R,x,ports.ground(x,z)+2.0+R()*1.2,z,SMOKE_WIND_X,SMOKE_WIND_Z,SCREEN_END_S-t,t-to);
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
