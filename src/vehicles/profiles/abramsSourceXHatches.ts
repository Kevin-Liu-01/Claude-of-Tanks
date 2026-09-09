// First-party roof stock from sparse source96 design planes and principal
// dimensions. No source connectivity, vertex cloud or texture is retained.
import * as THREE from 'three';

/** Closed commander lid with a shallow dished underside and rolled edge.
 * The measured lid is 529.05 × 485.59 mm, not a circular cylinder. */
export function abramsCommanderLid(high: boolean): THREE.BufferGeometry {
  const profile = [[0, 2.612065], [.259735, 2.612065], [.264525, 2.607615],
    [.264525, 2.559225], [.254550, 2.554775], [.220, 2.570175],
    [.130, 2.589425], [.072, 2.606215], [0, 2.606215], [0, 2.612065]];
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), high ? 48 : 32)
    .scale(1, 1, .242795 / .264525).translate(-.5084, 0, -.322517);
}

/** Source96's raised polygonal cap is carried by a narrow transverse stock.
 * Air on either side of that crossbar is intentional; never use a full-size
 * pedestal or grow the hatch cylinder to the cap's height. */
export function abramsCommanderCap(): { name: string; geometry: THREE.BufferGeometry }[] {
  // Symmetric design stations: aft bevel, narrow neck, widened forward ears,
  // then 45-degree corners terminating in the short straight front edge.
  const centerX = -.50816;
  const stations = [
    [-.531903, .152805], [-.443043, .242075], [-.312372, .242075],
    [-.291582, .300935], [-.225122, .300935], [-.057797, .133690],
  ];
  const outline = [...stations.map(([z, half]) => new THREE.Vector2(centerX - half, -z)),
    ...[...stations].reverse().map(([z, half]) => new THREE.Vector2(centerX + half, -z))];
  const cap = new THREE.ExtrudeGeometry(new THREE.Shape(outline), { depth: .017860, bevelEnabled: false })
    .rotateX(-Math.PI / 2).translate(0, 2.695435, 0);
  const receivingStock = new THREE.BoxGeometry(.482690, .086890, .048880)
    .translate(-.508160, 2.652520, -.321572);
  return [{ name: 'HatchR5CommanderCap', geometry: cap },
    { name: 'HatchR5CommanderCrossbar', geometry: receivingStock }];
}

