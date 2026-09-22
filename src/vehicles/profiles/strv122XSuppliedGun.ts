// Native pitch/recoil split with the measured oversized source sleeves. The
// final stepped muzzle had real open walls and a separately recessed stock
// until 2026-09-22 (owner: holes are added, not carved, to save triangles);
// it is now closed at the source tip and the fleet mouth disc is the bore.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid } from './sectionSolid.ts';
import { STRV122_SUPPLIED_DATUMS as D } from './strv122XSuppliedFrame.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
const {box} = KIT;

function tube(rows: readonly (readonly [number,number])[],segments:number):THREE.BufferGeometry {
  return new THREE.LatheGeometry(rows.map(([r,z])=>new THREE.Vector2(r,z-D.trunnion[2])),segments)
    .rotateX(Math.PI/2);
}

function mount(P: TankBuilderPort):void {
  const stock=sectionSolid([
    {z:.76,ring:[[-.227,1.742],[.227,1.742],[.227,2.397],[-.227,2.397]]},
    {z:1.76,ring:[[-.224,1.754],[.224,1.754],[.224,2.291],[-.224,2.291]]},
    {z:2.13,ring:[[-.212,1.868],[.232,1.868],[.232,2.237],[-.212,2.237]]},
  ]).translate(-D.trunnion[0],-D.trunnion[1],-D.trunnion[2]);
  P.add('gunMount',stock);
  P.add('gunMount',tube([[.217,2.07],[.223,2.19],[.200,2.26],[.149,2.35],
    [.139,2.35],[.139,2.07],[.217,2.07]],48));
}

function eccentricEvacuator(P: TankBuilderPort): void {
  const rows=[[2.78,.147,.147,0],[2.90,.202,.188,.048],
    [3.145,.199,.188,.048],[3.30,.139,.132,.014],[3.415,.124,.124,0]];
  const sections=rows.map(([z,rx,ry,dy])=>({z:z-D.trunnion[2],
    ring:Array.from({length:48},(_,i)=>{
      const a=i*Math.PI/24;return [Math.cos(a)*rx,Math.sin(a)*ry+dy] as [number,number];
    }),
  }));
  P.add('gun',sectionSolid(sections));
}

export function addStrv122XSuppliedGun(P: TankBuilderPort):void {
  mount(P);
  // Owner 2026-09-22 ("the point of adding holes instead of carving them into the barrel is that we
  // save on triangles"): the lathe now ends on the axis at the source tip (a flat cap). Until then it
  // turned into the open 120 mm bore ([.069,5.48842252],[.052,5.451],[.049,5.145]) with a hidden
  // blind seat disc at 5.141 — the fused source is solid by Z5.0 but hollow at 5.2, and that seat was
  // inferred inside the bracket, never an exposed end face. Both stay recorded here and in
  // strv122XSupplied.selftest.mjs; the factory's dark mouth disc at the tube edge hid the recess.
  P.add('gun',tube([[.145,2.285],[.147,2.73],[.141,2.84],[.132,3.29],
    [.1125,3.49],[.1155,5.12],[.088,5.19],[.088,5.455],
    [.082,5.48842252],[0,5.48842252]],48));
  eccentricEvacuator(P);
  for(const z of [3.54,4.405,5.133])
    P.add('gun',tube([[.117,z-.014],[.121,z-.011],[.121,z+.011],
      [.117,z+.014],[.112,z+.014],[.112,z-.014],[.117,z-.014]],32));
  // Small muzzle sleeve fastener, distinct from the open firing bore.
  P.add('gun',box(.026,.029,.053),.082,.037,5.327-D.trunnion[2]);
  P.muzzleZ=D.muzzleZ-D.trunnion[2];
}
