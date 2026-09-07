// Original closed station solids in the supplied-file frame. The permanent
// forward cheeks are real stock, not floating damage-only ERA over empty air.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid } from './sectionSolid.ts';
import { strvSourceTurret as add } from './strv122XSuppliedFrame.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
const {box,cylY} = KIT;
type Row = readonly [z:number,width:number,bottom:number,roof:number];

function mainStock(P: TankBuilderPort): void {
  // Independent complete-source side sections expose a continuous flare, not
  // the former sudden 160mm width jump near Z−1.20. Widths on this stock are
  // measured at Y2.17; the side wall also slopes inward slightly toward roof.
  const rows: readonly Row[]=[[-2.83,.54,1.901,2.421],[-2.51,1.19,1.844,2.459],
    [-2.21,1.24,1.844,2.493],[-1.80,1.25177,1.844,2.48963],
    [-1.48,1.29255,1.844,2.487],[-1.35,1.30911,1.82125,2.487929],
    [-1.20,1.32875,1.795,2.489],[-.65,1.40075,1.738642,2.486284],
    [-.39,1.42553,1.712,2.485],[0,1.48483,1.712,2.462939],
    [.60,1.49266,1.712,2.429],[.825,1.49266,1.730,2.412]];
  add(P,'turret',sectionSolid(rows.map(([z,x,bottom,roof])=>{
    const low=x+.03*(2.17-bottom-.055),high=x-.03*(roof-.118-2.17);
    return {z,ring:[[-x+.04,bottom],[x-.04,bottom],[low,bottom+.055],
      [high,roof-.118],[x-.15,roof],[-x+.15,roof],[-high,roof-.118],[-low,bottom+.055]]};
  })),.011);
  add(P,'turret',cylY(.895,.895,.078,64),0,1.731,-.12);
}

function foreCheek(P: TankBuilderPort,side:-1|1): void {
  // Upper and lower frontal planes meet at a sharp lip. A real central throat
  // remains for the pitching sleeve; no cross-turret slab caps that opening.
  const rows: readonly Row[]=[[.78,1.505,1.692,2.416],[1.13,1.525,1.672,2.380],
    [1.48,1.193,1.672,2.341],[1.80,.831,1.676,2.307],
    [2.048,.441,1.868,2.021]];
  const inner=.228;
  add(P,'turret',sectionSolid(rows.map(([z,x,bottom,roof])=>{
    // The large diagonal front plane is measured independently at three
    // source rays, not inferred from a generic constant roof-edge inset.
    // That inset formerly overfilled X1.30/Z1.10 by more than120mm.
    const edgeRoof=Math.min(roof-.036,3.919-.680*x-.747*z);
    const roofX=Math.max(inner+.009,Math.min(x-.047,(3.919-.747*z-roof)/.680));
    const ring: [number,number][]=[[inner,bottom],[x-.047,bottom+.055],[x,edgeRoof-.039],
      [x-.017,edgeRoof],[roofX,roof],[inner,roof]];
    return {z,ring:side<0?ring.map(([px,y])=>[-px,y] as [number,number]).reverse():ring};
  })));
  // The cheek seam is surface relief whose support is the full stock above.
  for(const z of [.94,1.24,1.53]){
    const x=1.42-(z-.94)*1.02;
    add(P,'turretDetail',box(.018,.018,.023),side*x,1.928,z);
  }
}

function roofCovers(P: TankBuilderPort): void {
  for(const side of [-1,1]){
    add(P,'turretDetail',box(.63,.023,.68),side*.39,2.502,-2.15);
    add(P,'turretDetail',box(.93,.022,.31),side*.57,2.4975,-1.65);
  }
  add(P,'turretDetail',box(2.07,.025,.29),0,2.405,.92, .109);
  add(P,'turretDetail',box(.36,.018,.69),0,2.456,.23,.093);
}

export function addStrv122XSuppliedTurret(P: TankBuilderPort): void {
  mainStock(P);roofCovers(P);
  for(const side of [-1,1] as const)foreCheek(P,side);
}
