// Kevin B. Liu — fitted M256 rotor, tapered cover and concentric cradle.
import type * as THREE from 'three';
import {KIT} from './kit.ts';
import {sectionSolid, type SectionPoint} from './sectionSolid.ts';

interface GunMountPort {
  readonly q: boolean;
  add(slot: string, geometry: THREE.BufferGeometry, x?: number, y?: number, z?: number): void;
  addGunExtra(geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addGunExtraDark(geometry: THREE.BufferGeometry, ...transform: number[]): void;
}

function clippedRing(w: number, bottom: number, top: number, bevel: number): SectionPoint[] {
  return [[-w+bevel,bottom],[w-bevel,bottom],[w,bottom+bevel],[w,top-bevel],
    [w-bevel,top],[-w+bevel,top],[-w,top-bevel],[-w,bottom+bevel]];
}

/** The wide raked shield is supplied by the turret's articulated throat.
 * This narrower forged cover joins it to a round, non-recoiling barrel cradle. */
export function buildM1A1GunMount(P: GunMountPort, searchlight: boolean): void {
  const segments=P.q?32:20;
  P.addGunExtra(KIT.cylX(.255,1.20,segments),0,0,-.045);
  P.addGunExtra(sectionSolid([
    {z:-.12,ring:clippedRing(.36,-.23,.25,.075)},
    {z:.18,ring:clippedRing(.32,-.19,.22,.065)},
    {z:.44,ring:clippedRing(.20,-.145,.155,.055)},
  ]));
  P.addGunExtra(KIT.cylZ(.145,.40,segments),0,0,.59);
  P.add('gunMountCanvasSkin',KIT.cylZ(.148,.045,segments),0,0,.47);
  P.addGunExtra(KIT.cylZ(.154,.035,segments),0,0,.505);
  P.addGunExtra(KIT.cylZ(.151,.027,segments),0,0,.77);
  P.addGunExtra(KIT.cylZ(.049,.17,16),.27,.09,.25);
  P.addGunExtraDark(KIT.cylZ(.027,.10,12),.27,.09,.37);
  if(searchlight){
    const bracket=sectionSolid([
      {z:.10,ring:clippedRing(.22,-.12,.19,.045)},
      {z:.47,ring:clippedRing(.18,-.09,.16,.035)},
    ]);
    bracket.translate(-.44,0,0);
    P.addGunExtra(bracket);
  }
}
