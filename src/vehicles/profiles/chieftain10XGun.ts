// First-party Mk10 gun primitives. All dimensions below are scalar sections of
// the local comparison source, not imported mesh vertices or topology.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { addChieftain10XGunCarriage } from './chieftain10XGunCarriage.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type Point = readonly [number, number, number];
type TubeRow = readonly [z: number, radiusX: number, centerY: number, radiusY: number, centerX?: number];
const { box, cylZ } = KIT;

function gunPart(P: TankBuilderPort, pivot: Point, bucket: string,
  g: THREE.BufferGeometry, x: number, y: number, z: number): void {
  P.add(bucket, g, x - pivot[0], y - pivot[1], z - pivot[2]);
}

function outerTube(rows: readonly TubeRow[], pivot: Point): THREE.BufferGeometry {
  const positions: number[] = [], uv: number[] = [], indices: number[] = [];
  const segments = 48;
  for (const [j, [z, rx, cy, ry, cx = .000026]] of rows.entries()) {
    for (let i = 0; i <= segments; i++) {
      const angle = 2 * Math.PI * i / segments;
      positions.push(cx + Math.sin(angle) * rx - pivot[0],
        cy + Math.cos(angle) * ry - pivot[1], z - pivot[2]);
      uv.push(i / segments, z);
      if (j && i < segments) {
        const a = (j - 1) * (segments + 1) + i, b = a + segments + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

function barrel(P: TankBuilderPort, pivot: Point, muzzleZ: number): void {
  // Rear asymmetric sleeve, tapered middle tube, and the separate forward
  // evacuator are at their measured stations. In particular there is no
  // invented 330 mm diameter cylinder at Z 4.64–4.99.
  const rows: readonly TubeRow[] = [
    [1.550505, .11460, 1.911753, .11460], [2.168, .11460, 1.911753, .11460],
    [2.169, .13197, 1.911758, .131985], [2.225, .13197, 1.911758, .131985],
    [2.25, .14365, 1.910501, .144348, .000969],
    [2.40, .145235, 1.900934, .150254, .003254],
    [2.50, .141429, 1.900687, .152749, .002404],
    [2.60, .142095, 1.907814, .147471, .001416],
    [2.635, .13609, 1.913175, .13609], [2.72298, .136194, 1.913175, .136198],
    [2.72299, .12251, 1.911758, .12250], [2.85, .118325, 1.911758, .11826],
    [3.0, .116962, 1.911758, .116923], [4.60, .107535, 1.911758, .107505],
    [4.86940, .107535, 1.911758, .107505], [4.86941, .12162, 1.911712, .121648],
    [4.88185, .12162, 1.911712, .121648], [4.88186, .140255, 1.911669, .140235],
    [4.95686, .140255, 1.911669, .140235], [4.95687, .126195, 1.911669, .126215],
    [5.45823, .126195, 1.911669, .126215], [5.45824, .13732, 1.911646, .137326],
    [5.50, .135124, 1.911642, .135124], [5.53, .10404, 1.91168, .10404],
    [6.0, .099271, 1.911762, .099261], [6.50, .094608, 1.911859, .094600],
    [6.70, .093606, 1.911885, .093605],
    [6.80646, .09411, 1.91193, .09405], [6.80647, .08472, 1.911938, .08468],
    [muzzleZ, .08232, 1.912199, .08232],
  ];
  P.add('gun', outerTube(rows, pivot));
  const bore = new THREE.CylinderGeometry(.060, .060, .32, 48, 1, true);
  bore.rotateX(Math.PI / 2);
  gunPart(P, pivot, 'gunDark', bore, pivot[0], pivot[1], muzzleZ - .16);
  gunPart(P, pivot, 'gun', new THREE.RingGeometry(.060, .08232, 48),
    pivot[0], pivot[1], muzzleZ);
  gunPart(P, pivot, 'gunDark', cylZ(.060, .006, 48), pivot[0], pivot[1], muzzleZ - .323);
  gunPart(P, pivot, 'gun', box(.13, .030, .25), 0, 2.004199, 6.925);
  gunPart(P, pivot, 'gun', cylZ(.022, .29, 16), 0, 2.037199, 6.925);
}

function rearBreech(P: TankBuilderPort, pivot: Point): void {
  // The actual rear block has a deep rearward-facing U cavity. Its floor and
  // front web are separate solids: a dark box would erase source air.
  gunPart(P, pivot, 'gun', box(.434650, .199497, .365870),
    -.000004, 1.735121, .550210);
  for (const [x, width] of [[-.149629, .135400], [.149860, .134922]]) {
    gunPart(P, pivot, 'gun', box(width, .275573, .365870), x, 1.972656, .550210);
  }
  gunPart(P, pivot, 'gun', box(.164309, .275573, .135790),
    .0002255, 1.972656, .665250);
  // Open-ended stock, with a small downward/right cast lobe. The source has
  // open axial ends; these are not incorrectly capped as a second breech.
  const shell = new THREE.CylinderGeometry(.13822, .13822, .8548, 40, 1, true);
  shell.rotateX(Math.PI / 2);
  gunPart(P, pivot, 'gun', shell, -.000284, 1.915013, 1.156635);
  const lobe = new THREE.CylinderGeometry(.0790, .0790, .5948, 28, 1, true);
  lobe.rotateX(Math.PI / 2);
  gunPart(P, pivot, 'gun', lobe, .14373, 1.820193, 1.026635);
}

function recoilGuides(P: TankBuilderPort, pivot: Point): void {
  // Fixed cradle and guides pitch with the gun; the tube and breech above
  // belong to the recoil child. Their supported overlaps are intentional.
  gunPart(P, pivot, 'gunMount', cylZ(.164, .30, 32), 0, 1.912199, 1.700505);
  for (const [x, width] of [[-.166449, .10086], [.169761, .10426]]) {
    gunPart(P, pivot, 'gunMount', box(width, .17394, .398), x, 1.920403, 1.616795);
  }
  for (const [z, length, radius] of [[.975870, .22589, .076455],
    [1.191280, .20493, .10826], [1.367505, .14752, .076455]]) {
    gunPart(P, pivot, 'gunMount', cylZ(radius, length, 24), -.170104, 2.057443, z);
  }
  gunPart(P, pivot, 'gunMount', cylZ(.04754, .34379, 20), -.017604, 2.104498, 1.168650);
  gunPart(P, pivot, 'gunMount', box(.46583, .078, .07767), -.011524, 2.085723, .786090);
  gunPart(P, pivot, 'gunMount', box(.06265, .09313, .5124), .093886, 2.144588, 1.154885);
  gunPart(P, pivot, 'gunMount', box(.12185, .02998, .07111), .094976, 2.189643, 1.241710);
  gunPart(P, pivot, 'gunMount', box(.04977, .48961, .25089), .306916, 1.833878, .684250);
  gunPart(P, pivot, 'gunMount', box(.17245, .14857, .53895), .372886, 1.952688, 1.143430);
  gunPart(P, pivot, 'gunMount', box(.05702, .126841, .24852), -.386869, 2.001693, .569485);
  gunPart(P, pivot, 'gunMount', box(.04139, .13385, .16023), -.262404, 1.804828, 1.443850);
  gunPart(P, pivot, 'gunMount', box(.16513, .14856, .04693), -.286894, 1.816893, 1.489320);
}

function lowerControls(P: TankBuilderPort, pivot: Point): void {
  // Three-sided low guard: an empty center, not its filled bounding box.
  gunPart(P, pivot, 'gunMount', box(.03765, .19310, .745), .2560665, 1.605793, .782105);
  gunPart(P, pivot, 'gunMount', box(.46962, .047, .060), .0400815, 1.532743, 1.124605);
  gunPart(P, pivot, 'gunMount', box(.037, .155, .273), -.176229, 1.612, .546105);
  // Source thin diagonal control lever, 28–30 mm deep, anchored to the
  // fixed guide rather than an invented full-height pedestal.
  const outline = new THREE.Shape();
  outline.moveTo(1.129325, 1.013063);
  outline.lineTo(1.156362, 1.013063);
  outline.lineTo(1.265409, 1.60);
  outline.lineTo(1.388455, 1.745);
  outline.lineTo(1.359, 1.772763);
  outline.lineTo(1.237234, 1.60);
  outline.closePath();
  const lever = new THREE.ExtrudeGeometry(outline, { depth: .03330, steps: 1, bevelEnabled: false });
  lever.rotateY(-Math.PI / 2);
  lever.translate(-.245279, 0, 0);
  lever.translate(-pivot[0], -pivot[1], -pivot[2]);
  P.add('gunMount', lever);
}

export function addChieftain10XGun(P: TankBuilderPort, pivot: Point, muzzleZ: number): void {
  P.muzzleZ = muzzleZ - pivot[2];
  barrel(P, pivot, muzzleZ);
  rearBreech(P, pivot);
  recoilGuides(P, pivot);
  lowerControls(P, pivot);
  addChieftain10XGunCarriage(P, pivot);
}
