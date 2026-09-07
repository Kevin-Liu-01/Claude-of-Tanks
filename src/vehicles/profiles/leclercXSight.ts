// First-party closed panoramic sight from independently measured source
// planes. In particular, the two broad triangular rain guards are not bars.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type Pivot = readonly [number, number, number];

function block(P: TankBuilderPort, pivot: Pivot, bucket: string,
  x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): void {
  P.addEquipment(bucket, KIT.box(x1 - x0, y1 - y0, z1 - z0),
    (x0 + x1) / 2 - pivot[0], (y0 + y1) / 2 - pivot[1], (z0 + z1) / 2 - pivot[2]);
}

function rainGuard(P: TankBuilderPort, pivot: Pivot, side: -1 | 1): void {
  const outer = side < 0 ? .335975 : .736716;
  const crest = side < 0 ? .430618 : .642073;
  const inner = side < 0 ? .446453 : .626238;
  const bottom = side < 0 ? 2.365708 : 2.365246;
  const top = side < 0 ? 2.767056 : 2.766593;
  const outline = new THREE.Shape();
  outline.moveTo(outer, 1.061364);
  outline.lineTo(crest, 1.115636);
  outline.lineTo(inner, 1.065581);
  outline.closePath();
  const geometry = new THREE.ExtrudeGeometry(outline,
    { depth: top - bottom, bevelEnabled: false, steps: 1 });
  geometry.rotateX(Math.PI / 2).translate(0, top, 0);
  // Source broad faces lean about 2 mm longitudinally over their height.
  const positions = geometry.getAttribute('position');
  for (let i = 0; i < positions.count; i++) positions.setZ(i,
    positions.getZ(i) - side * .0047 * (positions.getY(i) - (top + bottom) / 2));
  geometry.computeVertexNormals();
  geometry.translate(-pivot[0], -pivot[1], -pivot[2]);
  P.addEquipment('turretDetail', geometry);
}

export function addLeclercXPanoramicSight(P: TankBuilderPort, pivot: Pivot): void {
  // Actual cylinder ground-to-cap extent; the previous short generic pedestal
  // omitted its lower seated body. The source floor overlaps this cap by 3 mm.
  P.addEquipment('turretDetail', KIT.cylY(.249694, .249694, .504423, 32),
    .52044 - pivot[0], 2.1166025 - pivot[1], .951705 - pivot[2]);
  block(P, pivot, 'turretDetail', .352293, .721271, 2.370676, 2.764521, .752944, .875133);
  block(P, pivot, 'turretDark', .35795, .712173, 2.365708, 2.404726, .82615, 1.054583);
  block(P, pivot, 'turretDark', .357563, .707295, 2.404726, 2.742685, .82615, .875133);
  for (const [x0, x1] of [[.352293, .446378], [.681750, .721271]]) {
    block(P, pivot, 'turretDetail', x0, x1, 2.404726, 2.753827, .87512, 1.061728);
  }
  block(P, pivot, 'turretDark', .446378, .681750, 2.721766, 2.753827, .87512, 1.061728);
  block(P, pivot, 'turretDark', .371495, .702092, 2.753827, 2.764521, .838715, 1.04252);
  block(P, pivot, 'turretGlass', .446378, .681750, 2.425645, 2.721766, 1.051515, 1.064890);
  rainGuard(P, pivot, -1);
  rainGuard(P, pivot, 1);
}
