// Owner-requested connected upper shoulders. These narrow folded aprons join
// the existing deck edge to the existing skirt tops; the running-gear lane and
// lower wheel faces remain open. They are new first-party stock, not source
// evidence or a full-height box hidden behind the skirts.
import {foldedShoulderReturn, type FoldedShoulderLayout} from './foldedShoulderReturn.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';

const RETURNS: Readonly<Record<'merkava4_x'|'merkava3d_x', FoldedShoulderLayout>> = {
  merkava4_x: {outerX:1.8384,skirtTop:1.25,offsetY:0,offsetZ:0,rows:[
    [-2.980,1.73,1.587512],[-2.700,1.73,1.610190],[-2.670,1.73,1.612620],
    [-2.640,1.73,1.601641],[-2.000,1.73,1.604],[1.963,1.73,1.604],
    [2.800,1.73,1.347],[3.002,1.308686,1.31064],
  ]},
  merkava3d_x: {outerX:1.92,skirtTop:1.416,offsetY:.02034,offsetZ:.2258175,rows:[
    [-3.490,1.805,1.651233],[-2.960,1.825,1.734],[-2.210,1.825,1.687],
    [.580,1.825,1.687],[2.180,1.825,1.490],[2.690,1.825,1.440],
    [2.976,1.825,1.428327],
  ]},
};

export function addMerkavaXShoulderReturns(P: TankBuilderPort, id: keyof typeof RETURNS): void {
  const layout = RETURNS[id];
  for (const side of [-1,1]) {
    const geometry = foldedShoulderReturn(layout, side);
    geometry.userData.merkavaUpperShoulderReturn = `${id}:${side}`;
    P.add('hull',geometry);
  }
}
