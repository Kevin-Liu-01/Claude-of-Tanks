// Original closed hull and sheetwork from the older file's scalar planes.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import { addLeclercClassicXHullEquipment } from './leclercClassicXHullEquipment.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
const { box, cylX, cylY } = KIT;
type Row = readonly [z: number, bottom: number, top: number];

function slab(rows: readonly Row[], a: number, b: number) {
  return sectionSolid(rows.map(([z, low, high]) => ({ z,
    ring: [[a, low], [b, low], [b, high], [a, high]],
  })));
}

function centralHull(P: TankBuilderPort): void {
  // Independently selected scalar fold stations. Tiny source underfloor
  // corrugations between -2.04 and -.69 are bounded construction estimates.
  P.add('hull', slab([
    [-3.30698, 1.017, 1.672369], [-2.948852, .451396, 1.66992],
    [-2.592913, .345496, 1.66749], [-2.04363, .322815, 1.66374],
    [-1.75044, .302, 1.653687], [-1.66926, .305, 1.654683],
    [-1.38496, .305593, 1.646498], [-.8665, .309, 1.6467],
    [-.8655, .309, 1.62876], [-.68969, .307375, 1.575083],
    [.399819, .304165, 1.572337], [1.918395, .2997, 1.520278],
    [2.25591, .3118, 1.493134], [2.5212, .31664, 1.440507],
    [2.99912, .498601, 1.353638], [3.318516, .687504, 1.29558],
    [3.50171, 1.2612, 1.262282],
  ], -.982178, .937559));
  // Inner fixed bearing: measured center, genuinely open center rather than
  // a solid roof disk. Thickness of the unseen inner wall is inferred.
  const ring = new THREE.LatheGeometry([[.69, -.137873], [.802316, -.137873],
    [.802316, .137873], [.69, .137873], [.69, -.137873]]
    .map(([r, y]) => new THREE.Vector2(r, y)), 64);
  P.add('hull', ring, -.016284, 1.476981, .561125);
}

function carrier(P: TankBuilderPort, side: -1 | 1): void {
  const a = side < 0 ? -1.655157 : .9365;
  const b = side < 0 ? -.981 : 1.627224;
  const roof: readonly [number, number][] = [
    [-3.310211, 1.666777], [-3.153998, 1.664634], [-2.366795, 1.677315],
    [-2.18623, 1.670728], [-2.115304, 1.583102], [-.808615, 1.559985],
    [2.241472, 1.509528], [2.979211, 1.36899], [3.479118, 1.25819],
  ];
  // The outer skirts and inner vertical walls are separate from this raised
  // roof. The measured return course has real air under the central span.
  P.add('hull', slab(roof.map(([z, y]) => [z, Math.min(y - .018, 1.278), y]), a, b));
  const edge = side < 0 ? a : b;
  P.add('hull', slab([
    [-3.310211, 1.02, 1.666777], [-2.155381, .779963, 1.57933],
    [1.304696, .779963, 1.5250], [2.241472, .7511, 1.509528],
    [2.979211, .7511, 1.36899], [3.479118, 1.20, 1.25819],
  ], side < 0 ? edge : edge - .006, side < 0 ? edge + .006 : edge));
}

function skirtSheets(P: TankBuilderPort, side: -1 | 1): void {
  const x = side < 0 ? -1.680053 : 1.637831;
  const spans = [[-3.296311, -2.155381], [-2.139705, -1.287892],
    [-1.27162, -.419807], [-.387823, .463991], [.484075, 1.304696]];
  for (const [rear, front] of spans) {
    P.addExternalArmor('hull', box(.028682, .474581, front - rear),
      x, 1.0172535, (rear + front) / 2);
    for (const z of [rear + .06, front - .06])
      P.addEquipment('hullDetail', cylX(.011, .009, 8),
        x + side * .018, 1.207, z);
  }
  const inner = side < 0 ? -1.675824 : 1.633821;
  P.addMudguard('leclerc-classic-inner-flexible-sheet', 'hullRubber',
    box(.006, .737680, 3.435026), inner, .885208, -.426659);
  P.add('hull', slab([[-2.154105, 1.268095, 1.616495],
    [-.6674, 1.263431, 1.54], [1.293568, 1.263431, 1.54]],
  side < 0 ? -1.679 : 1.627224, side < 0 ? -1.650 : 1.66472));
}

function forwardGuard(P: TankBuilderPort, side: -1 | 1): void {
  // Source692 contains three separated outer guard blocks per side, all
  // outside X1.650179. Their lower bevel does NOT span the wheel bay.
  const ring = (z: number, top: number, low: number): SolidSection => {
    const points: [number, number][] = [[1.650179, low], [1.8, low + .284853],
      [1.8, top - .02985], [1.650179, top]];
    return { z, ring: side < 0 ? points.map(([x, y]) => [-x, y] as [number, number]).reverse() : points };
  };
  for (const [rear, front, topRear, topFront, lowRear, lowFront] of [
    [1.298949, 1.995990, 1.524253, 1.513117, .715028, .715028],
    [2.045418, 2.601897, 1.512233, 1.449739, .715028, .716776],
    [2.648623, 3.44716, 1.441197, 1.30968, .716990, .72099],
  ]) P.add('hull', sectionSolid([ring(rear, topRear, lowRear), ring(front, topFront, lowFront)]));
  // Folded forward web: both independently measured front/rear planes lean
  // with height. It is not an axis-aligned box extended aft over the idler.
  // The source's hidden rear plane penetrates its own track by41mm at
  // X1.4/Y.98. Keep the external planes but close an8mm front/roof shell,
  // not the source's physically intersecting120mm solid stock.
  const shape = new THREE.Shape([[3.43916, .913619], [3.44716, .913619],
    [3.485827, 1.302523], [3.360615, 1.323375],
    [3.360615, 1.315265], [3.47767, 1.29575]]
    .map(([z, y]) => new THREE.Vector2(-side * z, y)));
  const web = new THREE.ExtrudeGeometry(shape, {depth:.394568, bevelEnabled:false, steps:1});
  web.rotateY(side * Math.PI / 2).translate(side * 1.255611, 0, 0);
  P.addMudguard('leclerc-classic-forward-web', 'hull', web);
  frontLip(P, side);
}

function frontLip(P: TankBuilderPort, side: -1 | 1): void {
  // Independent intersection of source694/712's flat rear/bottom planes,
  // shallow upper slope and steep downturned face with its13mm rim.
  const section = [[3.485751, .904853], [3.642173, .904853],
    [3.701414, 1.211948], [3.714326, 1.209458], [3.719638, 1.236996],
    [3.706726, 1.239486], [3.485751, 1.307801]];
  const shape = new THREE.Shape(section.map(([z, y]) => new THREE.Vector2(-side * z, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: .713203, bevelEnabled: false });
  g.rotateY(side * Math.PI / 2).translate(side < 0 ? -.938989 : .928177, 0, 0);
  P.addMudguard('leclerc-classic-front-lip', 'hullRubber', g);
}

function bow(P: TankBuilderPort): void {
  // Object231 and287 are two genuine canted courses. Their AABB lowY is
  // the lower rear-facing skin, not the front roof of a single wedge.
  const slope = .17156534831837172 / .9851727418358647;
  const course = (rear: number, front: number, low: number, top: number,
    left: number, right: number) => slab([rear, front].map(z =>
      [z, low - slope * (z - 3), top - slope * (z - 3)]), left, right);
  P.add('hull', course(2.24148, 3.502410, 1.353731471, 1.388428270, -1.648889, 1.623778));
  P.add('hull', course(2.34853, 3.490369, 1.374389755, 1.392771444, -1.440173, 1.422004));
  // The source driver's window is inset behind its own raised frame.
  P.addHatch('hull', box(.850255, .024, .607723), .5594245, 1.50, 1.9047535, .178);
  P.addEquipment('hullDetail', box(.850255, .028, .15), .5594245, 1.606, 1.781, .178);
  P.addEquipment('hullDetail', box(.085, .116, .24), .178, 1.565, 1.988, .178);
  P.addEquipment('hullDetail', box(.085, .116, .24), .940, 1.565, 1.988, .178);
  P.addEquipment('hullGlass', box(.628987, .003, .244), .580878, 1.563, 1.9953, .467);
  for (const x of [-.720, .458]) {
    P.addEquipment('hullDetail', box(.918, .15, .118), x + .230, 1.17, 3.516);
  }
  // Separate pin faces; no broad fictitious front block or closed tow disk.
  for (const x of [-.928, -.5103, -.07546, .05587, .47362, .90844])
    P.addEquipment('hullDetail', KIT.cylZ(.018815, .037631, 12), x, 1.269364, 3.491175);
  for (const side of [-1, 1]) {
    const eye = new THREE.TorusGeometry(.044, .012, 8, 20);
    P.addEquipment('hullDetail', eye, side < 0 ? -.482503 : .439425,
      .8218985, side < 0 ? 3.374327 : 3.368175, 0, Math.PI / 2, 0);
  }
}

function engine(P: TankBuilderPort): void {
  for (const x of [-.5192125, .4710695]) {
    P.addEquipment('hullDetail', cylY(.4333455, .4333455, .018, 48), x, 1.672, -2.6482855);
    for (let i = -15; i <= 15; i++) {
      const dx = i * .02498, half = Math.sqrt(Math.max(0, .419 ** 2 - dx ** 2));
      P.addEquipment('hullDark', box(.0126, .009, 2 * half), x + dx, 1.688, -2.6482855);
    }
  }
  P.addEquipment('hullDetail', box(1.871613, .01946, .115098), -.0152595, 1.673625, -2.089473);
  for (const x of [-1.2586985, 1.2725165])
    P.addEquipment('hullDetail', box(.269375, .032, .668472), x, 1.689, -2.873397);
  for (let i = 0; i < 18; i++)
    P.addEquipment('hullDetail', box(1.88, .01715, .04507), -.023, 1.182 + i * .027,
      -3.3282735);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 13; i++)
      P.addEquipment('hullDetail', box(.045065, .01715, .788),
        side < 0 ? -1.67330 : 1.64536, 1.3146 + i * .024, -2.9366);
    P.addMudguard('leclerc-classic-rear-flexible-guard', 'hullRubber',
      box(.653465, .283212, .015), side < 0 ? -1.314717 : 1.290715,  .972035, -3.340);
  }
}

function fuelChannel(P: TankBuilderPort, offset: number): void {
  // Four actual repeated carry stocks, not four empty bounding boxes. Two
  // broad cheeks surround the measured92.583mm stepped center channel.
  const rows: readonly Row[] = [[-3.719638, 1.350760, 1.531569],
    [-3.608153, 1.338873, 1.558044], [-3.496668, 1.364131, 1.621665],
    [-3.314396, 1.440856, 1.621665]];
  for (const [left, right] of [[-.503618, -.418699], [-.327116, -.238115]])
    P.addEquipment('hullDetail', slab(rows, left + offset, right + offset));
  const floor: readonly [number, number][] = [[-3.719638, 1.460790],
    [-3.608153, 1.462576], [-3.552109, 1.463477], [-3.552107, 1.447642],
    [-3.496668, 1.479279], [-3.485722, 1.485526], [-3.485720, 1.492460],
    [-3.325343, 1.492460], [-3.314396, 1.621665]];
  const bottom = (z: number) => {
    const i = Math.min(rows.length - 2, rows.findIndex(r => r[0] >= z) - 1);
    const a = rows[Math.max(0, i)], b = rows[Math.max(0, i) + 1];
    return a[1] + (b[1] - a[1]) * (z - a[0]) / (b[0] - a[0]);
  };
  P.addEquipment('hullDetail', slab(floor.map(([z, y]) => [z, bottom(z), y]),
    -.419199 + offset, -.326616 + offset));
  P.addEquipment('hullDark', box(.078898, .115493, .104306),
    -.372591 + offset, 1.4693275, -3.663436);
}

function rearCarry(P: TankBuilderPort): void {
  for (const offset of [0, -.472281, .670426, 1.164037]) fuelChannel(P, offset);
  P.addEquipment('hullDetail', box(.133789, .181773, .174044), -.0236555, 1.5389975, -3.443642);
}

export function addLeclercClassicXHull(P: TankBuilderPort): void {
  centralHull(P);
  for (const side of [-1, 1] as const) {
    carrier(P, side); skirtSheets(P, side); forwardGuard(P, side);
  }
  bow(P); engine(P); rearCarry(P); addLeclercClassicXHullEquipment(P);
}
