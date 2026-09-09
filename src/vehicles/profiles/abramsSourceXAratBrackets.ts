// Permanent, finite ERA receivers. Visible cassette positions stay fixed;
// only their short floating mounting stubs extend to the real side armor.
import {planeBoundedArmor, type ArmorPlane} from './abramsSourceXGeometry.ts';

/** A narrow bracket with a sloped inner foot flush to the turret side.
 * The 3mm concealed lap is a native assembly accommodation, not a measured
 * source protection thickness. The rest of each cassette stand-off is air. */
export function abramsAratBracket(side: number, centerX: number, y: number,
  z: number, width: number) {
  const shell: ArmorPlane = side < 0
    ? [-.86164,.507521,0,2.276882]
    : [.861624,.507547,0,2.159152];
  const outer = centerX + side * width / 2;
  const g = planeBoundedArmor([
    [side,0,0,side * outer],
    [-shell[0],-shell[1],0,-shell[3] + .003 * Math.abs(shell[0])],
    [0,1,0,y + .0125], [0,-1,0,-y + .0125],
    [0,0,1,z + .0275], [0,0,-1,-z + .0275],
  ]);
  g.userData.abramsAratBracketRoot = {side,centerX,y,z,width,lapM:.003};
  return g;
}

