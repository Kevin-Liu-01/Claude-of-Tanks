// Closed first-party folds from independent source plane/width measurements.
// The left cover is uninterrupted; the narrower right cover has a depressed
// central channel. Neither is a transverse shelf or copied source topology.
import type * as THREE from 'three';
import { sectionSolid } from './sectionSolid.ts';

type Row = readonly [z: number, left: number, right: number, roof: number];

function foldedSkin(rows: readonly Row[], depth: number): THREE.BufferGeometry {
  return sectionSolid(rows.map(([z,left,right,roof])=>({z,ring:[
    [left,roof-depth],[right,roof-depth],[right,roof],[left,roof],
  ]})));
}

function roof(z: number): number {
  return (3.864979+.979054*z)/.203599;
}

function upperReturn(left: number,right: number): THREE.BufferGeometry {
  return foldedSkin([
    [-3.633285,left,right,1.511774],[-3.608537,left,right,1.506627],
    [-3.602664,left,right,1.533695],
  ],.030);
}

export function merkava4RearFoldSolids(): THREE.BufferGeometry[] {
  return [
    // The raised sheets overlap the lower fold by positive volume at the
    // forward return; the short low edge remains genuinely in front of it.
    foldedSkin([[-3.681697,-1.610235,-1.069568,1.278970],
      [-3.633285,-1.610235,-1.069568,1.511774]],.032),
    upperReturn(-1.610235,-1.069568),
    // Right recessed channel. Its rim widens inward as the channel narrows;
    // four closed skins retain the sloping floor and the actual upper step.
    foldedSkin([[-3.681697,1.276554,1.610235,1.278970],
      [-3.674698,1.276554,1.610235,1.312067]],.030),
    foldedSkin([[-3.674698,1.276554,1.319616,roof(-3.674698)],
      [-3.640149,1.276554,1.35785,roof(-3.640149)]],.032),
    foldedSkin([[-3.674698,1.567173,1.610235,roof(-3.674698)],
      [-3.640149,1.52894,1.610235,roof(-3.640149)]],.032),
    foldedSkin([[-3.674698,1.319616,1.567173,1.312067],
      [-3.630202,1.369097,1.517691,1.375017]],.032),
    foldedSkin([[-3.640149,1.276554,1.610235,1.478676],
      [-3.633285,1.276554,1.610235,1.511774]],.032),
    upperReturn(1.276554,1.610235),
  ];
}
