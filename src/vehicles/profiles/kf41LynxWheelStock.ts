// Source-measured KF41 wheel stock. All geometry is independently authored.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { lathedWheelSection, type AxialWheelStation } from './lathedWheelStock.ts';
import { mirrorX } from './europeSourcePrimitives.ts';

/** A fastener with a visible front and sides, seated into the preceding stock.
 * Its omitted back face is wholly buried; the washer and hex head stay distinct.
 */
function seatedFastener(radius: number, length: number, segments: number, x: number,
  y: number, z: number): THREE.BufferGeometry {
  return KIT.mergeAll([
    new THREE.CylinderGeometry(radius, radius, length, segments, 1, true)
      .rotateZ(-Math.PI / 2).translate(x, y, z),
    new THREE.CircleGeometry(radius, segments).rotateY(Math.PI / 2)
      .translate(x + length / 2, y, z),
  ]);
}

/** Discard only zero-area axis triangles emitted by the general lathe. */
function wheelSection(section: readonly AxialWheelStation[], segments: number): THREE.BufferGeometry {
  const geometry = lathedWheelSection(section, segments), index = geometry.index!;
  const positions = geometry.getAttribute('position'), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const kept: number[] = [];
  for (let i = 0; i < index.count; i += 3) {
    const ia = index.getX(i), ib = index.getX(i + 1), ic = index.getX(i + 2);
    a.fromBufferAttribute(positions, ia); b.fromBufferAttribute(positions, ib); c.fromBufferAttribute(positions, ic);
    if (b.sub(a).cross(c.sub(a)).lengthSq() > 1e-20) kept.push(ia, ib, ic);
  }
  geometry.setIndex(kept);
  return geometry;
}

export function kf41LynxWheelStock(high: boolean) {
  const segments = high ? 32 : 24;
  // The source's inboard axle back is flat at -.1643 through R.120, not a
  // duplicate raised outer hub. Both stamped webs and their central air remain.
  const outboard: AxialWheelStation[] = [
    [-.1643,0],[.198,0],[.198,.050],[.184,.080],[.1547,.100],
    [.080,.120],[.0595,.132],[.0595,.180],[.0620,.200],
    [.0709,.220],[.0700,.240],[.0614,.260],[.0595,.280],
    [.0595,.290],[.070,.301],[.095,.309],[.0345,.309],
    [.0345,.125],[-.1643,.120],
  ];
  const inboard: AxialWheelStation[] = [
    [-.0347,.120],[-.0597,.125],[-.0597,.180],[-.0613,.200],
    [-.0688,.220],[-.0693,.240],[-.0612,.260],[-.0618,.290],
    [-.0748,.301],[-.095,.309],[-.0347,.309],
  ];
  // At HIGH,32 samples keep the rim outside the26-sample tire opening.
  // LOW uses24 samples aligned with its12-sample tire: no faceted rim gap.
  const paint = [wheelSection(outboard, segments), wheelSection(inboard, segments)];
  const dark: THREE.BufferGeometry[] = [];
  // All source connected fastener components are outboard: eight web bolts
  // and four hub bolts. No mirrored inboard fasteners are present in the source.
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4, y = Math.sin(a) * .1622, z = Math.cos(a) * .1622;
    paint.push(seatedFastener(.0192,.004,high?8:6,.0614,y,z));
    paint.push(seatedFastener(.0168,.0132,6,.0700,y,z));
    dark.push(seatedFastener(.0092,.0041,6,.07845,y,z));
  }
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2, y = Math.sin(a) * .1003, z = Math.cos(a) * .1003;
    // The hub washer partly overhangs the sloped shoulder: retain its back.
    paint.push(KIT.cylX(.0102,.0094,high?8:6).translate(.1557,y,z));
    dark.push(seatedFastener(.0085,.0042,6,.1625,y,z));
  }
  const steel = KIT.mergeAll(paint), heads = KIT.mergeAll(dark);
  return {
    // Small physical axle core sits wholly inside both side-specific assemblies.
    core: KIT.cylX(.055,.0694,high?12:8),
    faces: [
      { side: 1 as const, steel, dark: heads },
      { side: -1 as const, steel: mirrorX(steel.clone()), dark: mirrorX(heads.clone()) },
    ],
  };
}
