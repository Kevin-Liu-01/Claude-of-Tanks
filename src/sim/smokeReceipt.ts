import { Euler, Matrix4, Vector3 } from 'three';
import { auxiliaryCapabilities } from '../vehicles/auxiliaryInventory.ts';
import { smokeCloudBanks, SMOKE_LAUNCH_SPEED_MPS, type SmokeCanister } from './smokeBallistics.ts';
import type { SmokeScreen } from './smokeScreen.ts';
/** spec, hull origin/attitude, turret bearing and pivot. No current actor state. */
export type SmokeSource = readonly [string, number, number, number, number, number, number, number, number, number, number];
const packed = new WeakMap<SmokeScreen,SmokeScreen>();
const restored = new Map<string,SmokeScreen>();
/** Send one compact launch frame and contact times, not 28 duplicate world transforms. */
export function packSmokeScreen(screen: SmokeScreen): SmokeScreen {
  if(!screen.canisters||!screen.source)return screen;
  const cached=packed.get(screen);if(cached)return cached;
  const round=(n:number)=>Math.round(n*10000)/10000;
  const source=screen.source.map(v=>typeof v==='number'?round(v):v) as unknown as SmokeSource;
  const receipt:SmokeScreen={x:round(screen.x),y:round(screen.y),z:round(screen.z),yaw:round(screen.yaw),born:screen.born,
    source,flightMs:screen.canisters.map(s=>Math.round(s[6]*1000))};
  packed.set(screen,receipt);return receipt;
}
export function restoreSmokeScreen(screen:SmokeScreen):SmokeScreen {
  if(screen.canisters||!screen.source||!screen.flightMs)return screen;
  const key=JSON.stringify(screen),cached=restored.get(key);if(cached)return cached;
  const s=screen.source,kit=auxiliaryCapabilities({id:s[0]});
  if(!kit||kit.smoke.length!==screen.flightMs.length)return screen;
  const hull=new Matrix4().makeRotationFromEuler(new Euler(-s[6],s[4],s[7],'YXZ')).setPosition(s[1],s[2],s[3]);
  const turret=hull.clone().multiply(new Matrix4().makeRotationY(s[5]).setPosition(s[8],s[9],s[10]));
  const position=new Vector3(),direction=new Vector3();
  const canisters=kit.smoke.map((socket,index):SmokeCanister=>{
    const frame=socket.owner==='hull'?hull:turret;
    position.fromArray(socket.position).applyMatrix4(frame);direction.fromArray(socket.direction).transformDirection(frame).multiplyScalar(SMOKE_LAUNCH_SPEED_MPS);
    return [position.x,position.y,position.z,direction.x,direction.y,direction.z,screen.flightMs![index]!/1000];
  });
  const result={...screen,canisters,banks:smokeCloudBanks(canisters)};
  restored.set(key,result);if(restored.size>84)restored.delete(restored.keys().next().value!);
  return result;
}

