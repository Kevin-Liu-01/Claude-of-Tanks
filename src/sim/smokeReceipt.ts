import { Euler, Matrix4, Vector3 } from 'three';
import { auxiliaryCapabilities } from '../vehicles/auxiliaryInventory.ts';
import { smokeCloudBanks, SMOKE_LAUNCH_SPEED_MPS, type SmokeCanister } from './smokeBallistics.ts';
import type { SmokeScreen } from './smokeScreen.ts';
/** spec, hull origin/attitude, turret bearing and pivot. No current actor state. */
export type SmokeSource = readonly [string, number, number, number, number, number, number, number, number, number, number];
const packed = new WeakMap<SmokeScreen,SmokeScreen>();
const restored = new Map<string,SmokeScreen>();
/** (FX lane 2026-10-17) the flight times' compact text: a width digit (2 or 3), then each time in milliseconds as that
 *  many characters of a 64-letter alphabet that JSON never escapes — 2 bytes a canister where the array took ~5, so the
 *  biggest full-salvo match stays far under the snapshot's 32 KB smoke text (smokeWind.selftest pins 80 %). */
const TIMES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
export function packFlightTimes(ms: readonly number[]): string {
  const width = ms.every((v) => v >= 0 && v < 4096) ? 2 : 3;
  let out = String(width);
  for (const value of ms) {
    const v = Math.max(0, Math.min(262143, Math.round(value)));
    for (let k = width - 1; k >= 0; k--) out += TIMES[(v >> (6 * k)) & 63];
  }
  return out;
}
export function unpackFlightTimes(text: string): number[] | null {
  const width = text.charCodeAt(0) - 48;
  if ((width !== 2 && width !== 3) || (text.length - 1) % width !== 0) return null;
  const out: number[] = [];
  for (let i = 1; i < text.length; i += width) {
    let v = 0;
    for (let k = 0; k < width; k++) {
      const d = TIMES.indexOf(text[i + k]!);
      if (d < 0) return null;
      v = v * 64 + d;
    }
    out.push(v);
  }
  return out;
}
/** Send one compact launch frame and contact times, not 28 duplicate world transforms. (FX lane 2026-10-17) the drift
 *  never crosses the wire: it is the map's (smokeWindForMap), and every client knows the map it plays, so it restores
 *  the screen with its own map's drift, the same numbers the authority stamped. */
export function packSmokeScreen(screen: SmokeScreen): SmokeScreen {
  if(!screen.canisters||!screen.source)return screen;
  const cached=packed.get(screen);if(cached)return cached;
  const round=(n:number)=>Math.round(n*10000)/10000;
  const source=screen.source.map(v=>typeof v==='number'?round(v):v) as unknown as SmokeSource;
  // (the launch time to the millisecond: a match clock of sixtieths printed 17 digits)
  const receipt:SmokeScreen={x:round(screen.x),y:round(screen.y),z:round(screen.z),yaw:round(screen.yaw),born:Math.round(screen.born*1000)/1000,
    source,f:packFlightTimes(screen.canisters.map(s=>s[6]*1000))};
  // (2026-10-09) a canister that struck a wall sends its bounces (already to the millimetre: the authority rounds them),
  // a walled bank its walls; the open field sends neither
  const paths=screen.canisters.map(s=>s.length>7?s.slice(7):0);
  if(paths.some(p=>p))receipt.paths=paths;
  if(screen.clip?.some(c=>c))receipt.clip=screen.clip;
  // (the authority's banks with them: the walls are per bank, and a client's own grouping of bounced rests could split
  // a bank at the 2.5 m / 0.4 s line)
  if(receipt.paths||receipt.clip)receipt.banks=screen.banks;
  packed.set(screen,receipt);return receipt;
}
/** `wind`: the client's map's drift (smokeWindForMap), stamped on a screen that carries none. */
export function restoreSmokeScreen(screen:SmokeScreen,wind?:readonly [number,number]|null):SmokeScreen {
  // (an older authority's packet carries the times as an array)
  const flightMs=typeof screen.f==='string'?unpackFlightTimes(screen.f):screen.flightMs ?? null;
  if(screen.canisters||!screen.source||!flightMs)return screen;
  const key=JSON.stringify(screen)+(wind?`|${wind[0]},${wind[1]}`:''),cached=restored.get(key);if(cached)return cached;
  const s=screen.source,kit=auxiliaryCapabilities({id:s[0]});
  if(!kit||kit.smoke.length!==flightMs.length)return screen;
  const hull=new Matrix4().makeRotationFromEuler(new Euler(-s[6],s[4],s[7],'YXZ')).setPosition(s[1],s[2],s[3]);
  const turret=hull.clone().multiply(new Matrix4().makeRotationY(s[5]).setPosition(s[8],s[9],s[10]));
  const position=new Vector3(),direction=new Vector3();
  const canisters=kit.smoke.map((socket,index):SmokeCanister=>{
    const frame=socket.owner==='hull'?hull:turret;
    position.fromArray(socket.position).applyMatrix4(frame);direction.fromArray(socket.direction).transformDirection(frame).multiplyScalar(SMOKE_LAUNCH_SPEED_MPS);
    const path=screen.paths?.[index];
    return [position.x,position.y,position.z,direction.x,direction.y,direction.z,flightMs[index]!/1000,...(path||[])];
  });
  const result={...screen,canisters,banks:screen.banks??smokeCloudBanks(canisters),...(!screen.wind&&wind?{wind:[wind[0],wind[1]] as const}:{})};
  restored.set(key,result);if(restored.size>84)restored.delete(restored.keys().next().value!);
  return result;
}

