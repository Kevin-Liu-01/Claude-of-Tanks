// Independently authored upper CROWS forms. Principal circles, bearing axes,
// plate planes and sparse stations measured from source87/88/90/92; no source
// mesh connectivity or sampled vertex arrays are used by the runtime.
import * as THREE from 'three';
import { closedSectionLoft, planeBoundedArmor, profiledTube, type XYZ, type XY } from './abramsSourceXGeometry.ts';

export type CrowsEmitter = (name: string, geometry: THREE.BufferGeometry, glass?: boolean) => void;

function slab(emit: CrowsEmitter, name: string, size: XYZ, center: XYZ): void {
  emit(name, new THREE.BoxGeometry(...size).translate(...center));
}

function extrude(shape: THREE.Shape, z: number, depth: number, q: number): THREE.BufferGeometry {
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: q ? 12 : 8 })
    .translate(0, 0, z);
}

function disk(radius: number, z0: number, z1: number, x: number, y: number, count: number): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(radius, radius, z1 - z0, count).rotateX(Math.PI / 2)
    .translate(x, y, (z0 + z1) / 2);
}

function clippedCircle(x: number, y: number, radius: number, crown: number, count: number): XY[] {
  // A principal circular extrusion with the independently measured flat rear
  // crown. The front lip has the complete circle, not an enlarged rectangle.
  return Array.from({ length: count }, (_, i) => {
    const a = i * 2 * Math.PI / count;
    return [x + radius * Math.cos(a), Math.min(crown, y + radius * Math.sin(a))] as XY;
  });
}

function largeOptic(emit: CrowsEmitter, q: number): void {
  const x = -.70773, y = 2.965755, count = q ? 40 : 20;
  const flat = clippedCircle(x, y, .08497, 3.034485, count);
  const full = clippedCircle(x, y, .08497, Infinity, count);
  emit('LargeBody', closedSectionLoft([{ z: .715965, ring: flat }, { z: .911615, ring: flat },
    { z: .923865, ring: full }]));
  emit('LargeLip', profiledTube([{ z: .923865, r: .08497 }, { z: .988685, r: .08497 }],
    .07886, count).translate(x, y, 0));
  // The complete source has actual92 optical glass before the88 recess rear
  // wall. Keep the supported pane distinct from empty approach depth.
  emit('LargeLens', disk(.07886, .970607, .972607, x, y, count), true);
}

function smallOptic(emit: CrowsEmitter, q: number): void {
  const x = -.813475, y = 3.11889;
  const count = q ? 32 : 12;
  emit('SmallBody', disk(.049855, .917555, .985405, x, y, count));
  emit('SmallLip', profiledTube([{ z: .985405, r: .049855 }, { z: 1.020475, r: .04627 },
    { z: 1.026795, r: .03424 }], .03038, count).translate(x, y, 0));
  emit('SmallRecessRear', disk(.03038, .999305, 1.001305, x, y, count));
  emit('SmallLens', disk(.03038, 1.016945, 1.018945, x, y, count), true);
}

function twinOutline(): THREE.Shape {
  // Two unequal rounded lobes and the relieved lower bridge. This fresh
  // curve construction uses fitted crown/side/fillet rulers, not the source's
  // thirty-edge front contour. Three optical/recess openings are separate.
  const s = new THREE.Shape();
  s.moveTo(-.70813, 3.116555);
  s.quadraticCurveTo(-.7075, 3.147415, -.67733, 3.147415);
  s.quadraticCurveTo(-.664, 3.147415, -.65628, 3.13735);
  s.lineTo(-.62933, 3.13735);
  s.quadraticCurveTo(-.625, 3.146245, -.61347, 3.146245);
  s.lineTo(-.58804, 3.146245);
  s.quadraticCurveTo(-.57218, 3.145, -.57218, 3.137055);
  s.lineTo(-.57218, 3.109625);
  s.lineTo(-.57497, 3.090585);
  s.quadraticCurveTo(-.576, 3.069285, -.59627, 3.069285);
  s.quadraticCurveTo(-.604, 3.069285, -.60690, 3.072125);
  s.lineTo(-.62595, 3.092845);
  s.lineTo(-.64825, 3.092845);
  s.quadraticCurveTo(-.657, 3.092845, -.657, 3.080515);
  s.quadraticCurveTo(-.661, 3.073655, -.66830, 3.073655);
  s.lineTo(-.678, 3.0727);
  s.quadraticCurveTo(-.688, 3.0665, -.697, 3.072);
  s.quadraticCurveTo(-.70634, 3.078, -.70634, 3.087595);
  s.lineTo(-.70813, 3.116555);
  return s;
}

function twinOptic(emit: CrowsEmitter, q: number): void {
  const s = twinOutline();
  // Apertures are machined into the last11.77mm of the double-lobed face;
  // they must not be dark marks on a full flat front cap.
  for (const [x, y, r] of [[-.67842, 3.121555, .01979], [-.68945, 3.08898, .00839],
    [-.66783, 3.08639, .00584]]) {
    const hole = new THREE.Path(); hole.absarc(x, y, r, 0, Math.PI * 2, true); s.holes.push(hole);
    emit(`TwinLens${x}`, disk(r, 1.08470, 1.08670, x, y, q ? 24 : 8), true);
  }
  emit('TwinBody', extrude(twinOutline(), .917075, .16421, q));
  emit('TwinFace', extrude(s, 1.081285, .01177, q));
  // Separate source92 right-hand optical face sits slightly proud of the
  // cast face, unlike the recessed circular upper-left optical opening.
  const right = new THREE.Shape();
  right.moveTo(-.620, 3.090); right.lineTo(-.581, 3.090); right.lineTo(-.581, 3.136);
  right.lineTo(-.620, 3.136); right.closePath();
  emit('TwinRightLens', extrude(right, 1.093055, .001657, q), true);
}

function carrierLobe(left: boolean): THREE.Shape {
  const s = new THREE.Shape();
  if (left) {
    s.moveTo(-.7469, 3.191485); s.lineTo(-.75234, 3.186525); s.lineTo(-.78619, 3.186525);
    s.lineTo(-.86094, 3.173385); s.quadraticCurveTo(-.895, 3.166, -.89048, 3.143405);
    s.quadraticCurveTo(-.889, 3.133, -.88471, 3.125605); s.lineTo(-.8395, 3.043315);
    s.quadraticCurveTo(-.830, 3.035, -.79954, 3.030395);
    s.lineTo(-.79496, 3.016755); s.lineTo(-.7775, 3.020695);
    s.quadraticCurveTo(-.762, 3.040, -.74723, 3.044555); s.lineTo(-.7469, 3.191485);
  } else {
    s.moveTo(-.67547, 3.165215); s.lineTo(-.67547, 3.048055);
    s.lineTo(-.6446, 3.026745); s.lineTo(-.62661, 3.041045); s.lineTo(-.61772, 3.030395);
    s.lineTo(-.57988, 3.041485); s.quadraticCurveTo(-.544, 3.050, -.54396, 3.086135);
    s.quadraticCurveTo(-.533, 3.143, -.56468, 3.156535);
    s.quadraticCurveTo(-.576, 3.163, -.58625, 3.161205); s.lineTo(-.67142, 3.161205);
    s.lineTo(-.67547, 3.165215);
  }
  return s;
}

function carrier(emit: CrowsEmitter, q: number): void {
  // Separate front lobes retain the real central relief; the shelf beneath
  // them seats on the flat rear crown of the large round optical housing.
  emit('CarrierLeft', extrude(carrierLobe(true), .873135, .009470, q));
  emit('CarrierRight', extrude(carrierLobe(false), .874835, .007770, q));
  slab(emit, 'CarrierShelf', [.16649, .01094, .14212], [-.711845, 3.042505, .791755]);
  // The source shelf is2.55mm above the large body at its centre; its two
  // side folded webs (not an invented whole-width pedestal) receive it.
  for (const [name, x, top] of [['Left', -.790, 3.116], ['Right', -.633, 3.10]] as const) {
    const shape = new THREE.Shape();
    const foot = name === 'Left' ? x + .014 : x;
    shape.moveTo(foot - .005, 2.999395); shape.lineTo(foot + .005, 2.999395);
    shape.lineTo(x + .005, 3.047);
    shape.lineTo(x + .005, top); shape.lineTo(x - .005, top); shape.closePath();
    emit(`CarrierFold${name}`, extrude(shape, .780, .099, q));
  }
  // Actual intermediate optic backing plates; stock stays behind the
  // optical bodies and does not replace their forward apertures.
  for (const [name, x, y, w, h, back, front] of [
    ['Left', -.813475, 3.11889, .10, .10, .88250, .917555],
    ['Right', -.622, 3.110, .096, .091, .88250, .917075],
  ] as const) slab(emit, `CarrierSeat${name}`, [w, h, front - back], [x, y, (back + front) / 2]);
}

function inclinedArms(emit: CrowsEmitter, q: number): void {
  // The source's pair of transverse-raked channel walls replaces the old
  // round fore/aft diagonal rails. Its open centre and turned rear returns
  // are assembled from independently closed plates, never a solid fork box.
  for (const [name, n, d, thickness] of [
    ['Left', [.98527675, -.17074574, .00869566], -1.38856692, .007],
    ['Right', [-.97689641, -.20834222, -.04761220], -.13431520, .0095],
  ] as const) {
    emit(`Arm${name}`, planeBoundedArmor([[...n, d], [-n[0], -n[1], -n[2], -d + thickness],
      [0, -1, 0, -2.8569], [0, 1, 0, 3.1655], [0, 0, -1, -.565716], [0, 0, 1, .696926]]));
  }
  for (const [name, outer, inner] of [
    ['Left', [-.98427847, .17656240, .00464985, 1.45177868],
      [.98527675, -.17074574, .00869566, -1.38856692]],
    ['Right', [.97692399, .21337195, -.00958815, .14671549],
      [-.97689641, -.20834222, -.04761220, -.13431520]],
  ] as const) emit(`Arm${name}LowerStock`, planeBoundedArmor([outer, inner,
    [0, -1, 0, -2.8569], [0, 1, 0, 3.024365], [0, 0, -1, -.568145], [0, 0, 1, .696926]]));
  for (const [name, x0, x1, n, d] of [
    ['Left', -.90, -.826364, [0, .11532308, -.99332804], -.17600040],
    ['Right', -.599805, -.535, [0, .10064119, -.99492279], -.21876350],
  ] as const) emit(`Arm${name}RearReturn`, planeBoundedArmor([
    [1, 0, 0, x1], [-1, 0, 0, -x0], [...n, d], [-n[0], -n[1], -n[2], -d + .0055],
    [0, -1, 0, -2.8569], [0, 1, 0, 3.112495],
  ]));
  emit('LeftBearing', new THREE.CylinderGeometry(.082, .082, .09818, q ? 40 : 12).rotateZ(Math.PI / 2)
    .translate(-.875455, 3.237465, .635081));
  emit('LeftBearingInnerSeat', new THREE.CylinderGeometry(.063, .063, .0072, q ? 32 : 12).rotateZ(Math.PI / 2)
    .translate(-.82277, 3.237465, .635081));
  emit('RightBearing', new THREE.CylinderGeometry(.0475, .0475, .052, q ? 32 : 12).rotateZ(Math.PI / 2)
    .translate(-.579805, 3.213235, .635081));
}

function gunCradle(emit: CrowsEmitter, q: number): void {
  // Source88/218: unequal side ears surrounding the actual receiver. The
  // central bed is lower than the weapon; a clear under-receiver interval
  // remains rather than filling its entire bounding box.
  slab(emit, 'GunBed', [.10973, .01831, .11530], [-.712945, 3.14541, .610615]);
  for (const [name, x0, x1, top] of [['Left', -.81925, -.77093, 3.281215],
    ['Right', -.65449, -.60630, 3.252325]] as const) {
    const s = new THREE.Shape();
    s.moveTo(x0, 3.145); s.lineTo(x1, 3.145); s.lineTo(x1, top - .010);
    s.quadraticCurveTo(x1, top, x1 - .010, top); s.lineTo(x0 + .010, top);
    s.quadraticCurveTo(x0, top, x0, top - .010); s.closePath();
    emit(`GunEar${name}`, extrude(s, .552965, .15511, q));
  }
  // The long aft saddle has a genuine63mm central opening. The two thin
  // edges and lower floor carry the receiver at its measured sides.
  slab(emit, 'GunSaddleFloor', [.13947, .01802, .18388], [-.712675, 3.147015, .429465]);
  for (const x of [-.7530, -.6724]) slab(emit, `GunSaddleRail${x}`,
    [.0175, .04968, .25779], [x, 3.163165, .51182]);
  slab(emit, 'GunSaddleForeStep', [.10807, .02313, .04963], [-.712705, 3.16766, .683495]);
  // Source88/410 narrow stepped link: real lower relief rises32mm beneath
  // the fore portion. Separate side walls preserve its upper channel.
  const edge: XY[] = [[.660735, 3.005515], [.687316, 3.005515], [.699945, 3.013475],
    [.699945, 3.043015], [.707955, 3.051045], [.758805, 3.051045], [.808805, 3.085255],
    [.869495, 3.085255], [.872405, 3.176165], [.762686, 3.176165], [.739386, 3.164265],
    [.660735, 3.091165]];
  const s = new THREE.Shape(edge.map(([z, y]) => new THREE.Vector2(-z, y)));
  for (const x of [-.74650, -.66292]) emit(`SteppedLinkSide${x}`,
    new THREE.ExtrudeGeometry(s, { depth: .00896, bevelEnabled: false })
      .rotateY(Math.PI / 2).translate(x, 0, 0));
  // The two large outer side planes do not imply a filled centre: a complete
  // source ray throughX−.71/Y3.1 passes unobstructedZ.75… .874.
  const floor: XY[] = [[.707955, 3.051045], [.758805, 3.051045], [.808805, 3.085255],
    [.869495, 3.085255], [.869495, 3.0920], [.808805, 3.0920], [.758805, 3.058], [.707955, 3.058]];
  emit('SteppedLinkFloor', new THREE.ExtrudeGeometry(new THREE.Shape(floor.map(([z, y]) =>
    new THREE.Vector2(-z, y))), { depth: .09168, bevelEnabled: false })
    .rotateY(Math.PI / 2).translate(-.74650, 0, 0));
  slab(emit, 'SteppedLinkForeLip', [.10967, .01190, .010], [-.707795, 3.170215, .867405]);
}

/** All outputs remain in the same canonical turret frame as the frozen lower
 * mount. SEP v3's shorter upper support is an explicitly inferred LP layout. */
export function buildAbramsSourceXCrows(emit: CrowsEmitter, q: boolean, drop: number): void {
  const placed: CrowsEmitter = (name, geometry, glass) => {
    // Compress only the new support above its fixed contact datum; heads and
    // weapon share the final upper offset. This does not move lower contacts.
    if (drop && /^(Arm|LeftBearing|RightBearing)/.test(name)) {
      const p = geometry.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i), fraction = Math.min(1, Math.max(0, (y - 2.857365) / .30));
        p.setY(i, y - drop * fraction);
      }
      geometry.computeVertexNormals();
    } else if (drop) geometry.translate(0, -drop, 0);
    emit(`CrowsR3${name}`, geometry, glass);
  };
  inclinedArms(placed, Number(q)); gunCradle(placed, Number(q)); carrier(placed, Number(q));
  largeOptic(placed, Number(q)); smallOptic(placed, Number(q)); twinOptic(placed, Number(q));
}

/** Source90 receiver's stepped underside in local M2 coordinates. Only the
 * source CROWS weapon uses this body; local/A1/counter-assault guns retain
 * their independently inferred old construction. */
export function abramsCrowsReceiver(): THREE.BufferGeometry {
  const section = (z: number, bottom: number, half: number) => ({ z,
    ring: [[-half, bottom], [half, bottom], [half, .04435], [.04662, .04435],
      [.04662, .069495], [-.04662, .069495], [-.04662, .04435], [-half, .04435]] as XY[] });
  // The93.24mm extreme is the upper cover: the actual fore receiver below
  // it is58.42mm wide. A full93mm box incorrectly occupies both cradle gaps.
  return closedSectionLoft([section(-.293533, -.06945, .03525), section(-.008312, -.06945, .03525),
    section(.00795, -.053115, .02921), section(.293533, -.053115, .02921)]);
}

