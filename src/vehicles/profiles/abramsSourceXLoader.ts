// Source97/98/99/102 loader stocks, independently authored from sparse
// sections. Coordinates are in the unchanged loader-weapon rest frame.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { closedSectionLoft, roundMember, planeBoundedArmor, type XY, type XYZ } from './abramsSourceXGeometry.ts';

export interface LoaderStock { name: string; geometry: THREE.BufferGeometry; glass?: boolean }
const YAW = Math.atan2(.829, .559);

function add(parts: LoaderStock[], name: string, geometry: THREE.BufferGeometry): void {
  geometry.userData = { ...geometry.userData, abramsLoaderStock: name };
  parts.push({ name: `LoaderSource${name}`, geometry });
}

function box(parts: LoaderStock[], name: string, lo: XYZ, hi: XYZ): void {
  add(parts, name, KIT.box(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2])
    .translate((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2));
}

function sideProfile(points: readonly XY[], x0: number, x1: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(-z, y)));
  return new THREE.ExtrudeGeometry(shape, { depth: x1 - x0, bevelEnabled: false, steps: 1 })
    .rotateY(Math.PI / 2).translate(x0, 0, 0);
}

function toCanonical(parts: LoaderStock[]): LoaderStock[] {
  for (const part of parts) part.geometry.rotateY(YAW).translate(.840, 2.69153, -.06037);
  return parts;
}

function mountBase(parts: LoaderStock[]): void {
  // Source98/230 is a thin chamfered base with two downturned end returns.
  // The source's32mm overall height is not a solid32mm rectangular pad.
  const outline: XY[] = [[-.14263, -.05372], [-.071, -.18214], [.075, -.18214],
    [.14688, -.05372], [.11953, -.02103], [-.11493, -.02103]];
  const plate = new THREE.ExtrudeGeometry(new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, -z))),
    { depth: .009629, bevelEnabled: false, steps: 1 }).rotateX(-Math.PI / 2).translate(0, -.291545, 0);
  add(parts, 'Base98', plate);
  box(parts, 'BaseRearReturn98', [-.071, -.313955, -.18214], [.075, -.291545, -.149158]);
  box(parts, 'BaseFrontReturn98', [-.11493, -.313955, -.05372], [.11953, -.291545, -.02103]);
  box(parts, 'BaseFrontLip98', [-.11493, -.313955, -.01271], [.11953, -.282235, -.007895]);
  box(parts, 'BaseFrontFold98', [-.11493, -.286811, -.02169], [.11953, -.282235, -.007895]);
  // The actual twelve-sided source98/48 bearing overlaps both the base and
  // the separate6.14mm source97 fork floor. Its slight source lean is retained.
  const bearing = KIT.cylY(.0308, .0308, .05606, 12).rotateZ(-.0115)
    .translate(.002275, -.257715, -.07305);
  add(parts, 'Bearing98', bearing);
  for (const [i, x, z] of [[0, -.0931, -.03934], [1, .0977, -.03944],
    [2, -.0285, -.16958], [3, .0331, -.16963]]) {
    add(parts, `BaseHead98_${i}`, KIT.cylY(.0109, .0109, .01013, 6).translate(x, -.27756, z));
  }
  const arm: XY[] = [[-.0381, -.2586], [.0558, -.2158], [.0705, -.2104],
    [.0795, -.2357], [.0562, -.2441], [.0416, -.2494], [.0284, -.2437], [-.0357, -.2654]];
  add(parts, 'BaseLever98', sideProfile(arm, -.0092, .0009));
  add(parts, 'BaseRearHandle98', roundMember([.022, -.2447, -.146], [.160, -.2447, -.214], .0083, 10));
  box(parts, 'BaseRearHandleSeat98', [-.0265, -.26815, -.16958], [.0317, -.235825, -.10958]);
}

function mountingFork(parts: LoaderStock[]): void {
  box(parts, 'ForkFloor97', [-.0829, -.231065, -.11510], [.0829, -.224925, -.03284]);
  // Twin source97/1040 ears surround—not fill—the pivot lane.
  const edge: XY[] = [[-.11510, -.22493], [-.03284, -.22493], [-.0598, .010],
    [-.0622, .019], [-.067, .0245], [-.0739, .026545], [-.081, .0245],
    [-.086, .019], [-.0882, .010]];
  for (const [i, x0, x1] of [[0, -.0829, -.0754], [1, .0753, .0829]]) {
    add(parts, `ForkEar97_${i}`, sideProfile(edge, x0, x1));
  }
  // Source99/763,785 are real separate transverse pins spanning the ear/
  // cradle clearance, not an inferred vertical pintle continuing through it.
  for (const [i, a, b] of [[0, -.087438, -.055337], [1, .053076, .085166]]) {
    add(parts, `PivotPin99_${i}`, roundMember([a, .01253, -.07388], [b, .01253, -.07388], .007795, 12));
  }
}

function cradle(parts: LoaderStock[]): void {
  // Sparse local-YZ side-section extrema bound the actual rounded lower
  // receiving lobe. The inner101mm-wide channel remains open above its floor.
  const stations = [[-.22720, -.1178], [-.222, -.1403], [-.2085, -.1537],
    [-.190, -.1668], [-.166, -.1800], [-.1363, -.1919], [-.107, -.2021],
    [-.0638, -.2136], [-.0176, -.21805], [.026, -.2128], [.062, -.2013],
    [.0885, -.1875], [.1085, -.1708], [.125, -.1500], [.1275, -.1408]];
  const side: XY[] = [...stations.map<XY>(([z, y]) => [z, y]), [.121, -.066475], [-.2272, -.094465]];
  add(parts, 'CradleSide99_0', sideProfile(side, -.06905, -.05080));
  add(parts, 'CradleSide99_1', sideProfile(side, .04990, .06795));
  // The floor ends at the actual intersection with the curved lower wall;
  // it must not be extended underneath the open ends of the U channel.
  const floor = (z: number) => -.149077 + z * .01560;
  const bottom: XY[] = [];
  for (let i = 1; i < stations.length; i++) {
    const a = stations[i - 1], b = stations[i], da = a[1] - floor(a[0]), db = b[1] - floor(b[0]);
    if ((da < 0) !== (db < 0)) {
      const t = da / (da - db), z = a[0] + (b[0] - a[0]) * t;
      bottom.push([z, floor(z)]);
    }
    if (db < 0) bottom.push([b[0], b[1]]);
  }
  add(parts, 'CradleFloor99', sideProfile(bottom, -.0510, .0502));
  // Measured receiving saddles and side lugs connect the weapon's lower
  // stock to the cradle; none spans the full clear channel as a generic box.
  box(parts, 'RearSaddle99', [-.05021, -.082645, -.194528], [.05203, -.043945, -.166917]);
  box(parts, 'ForwardSaddle99', [-.05079, -.076875, .031283], [.04948, -.071755, .12858]);
  foldedLugs(parts);
  for (const [i, a, b] of [[0, -.05689, -.02471], [1, .01813, .05023]]) {
    add(parts, `ForePin99_${i}`, roundMember([a, -.0492, .10746], [b, -.0492, .10746], .00871, 12));
  }
  // Distinct source99/67,75 raising feet and437,453 transverse receiving
  // eyes provide the actual saddle-to-weapon chain beneath those pins.
  for(const [i,x0,x1,a,b]of [[0,-.048346,-.037904,-.048426,-.025707],
    [1,.035664,.045956,.023696,.046268]]){
    box(parts,`ForeFoot99_${i}`,[x0,-.071845,.1053],[x1,-.059785,.12077]);
    add(parts,`ForeEye99_${i}`,roundMember([a,-.049095,.107395],[b,-.049095,.107395],.01512,16));
  }
}

function foldedLugs(parts: LoaderStock[]): void {
  // Source99/135 is a sub-millimetre inclined leaf with an upright return,
  // not a solid prism between its overall extrema. Sparse bend intersections
  // retain the large clear area below source99/165's horizontal crown.
  const rear: XY[] = [[-.11103, -.068655], [-.053889, -.001125],
    [-.053889, .033975], [-.05305, .033975], [-.05305, -.001375],
    [-.11048, -.069165]];
  add(parts, 'RearFold99', sideProfile(rear, -.06258, -.03080));
  box(parts, 'RearFoldSide99', [-.067237, -.023755, -.11996], [-.06600, .002725, -.06978]);
  const forward: XY[] = [[-.053889, .028684], [-.01458, .028684],
    [-.014714, -.03472], [-.014025, -.03472], [-.014025, .02975], [-.053889, .02975]];
  add(parts, 'ForwardFold99', sideProfile(forward, -.06450, -.03080));
  // Separate source99/510 open-sided receiver guide; source135/165's
  // folded leaves sit inside this guide, not in an invented solid side slab.
  box(parts, 'SideGuideWall99', [-.07059, -.0282, -.15048], [-.06790, .022915, -.00008]);
  box(parts, 'SideGuideFloor99', [-.07050, -.05465, -.1504], [-.03634, -.05025, -.00008]);
  for (const [i, z0, z1] of [[0, -.15048, -.14725], [1, -.0027, -.00008]]) {
    box(parts, `SideGuideReturn99_${i}`, [-.0691, -.0510, z0], [-.03634, .0227, z1]);
  }
  // Actual rear transverse handle forks and sloped grips, retained as
  // distinct rod/stock elements around the open rear approach.
  for (const side of [-1, 1]) {
    const x = side < 0 ? -.09506 : .09392;
    add(parts, `RearHandle99_${side}`, roundMember([x, -.0480, -.3025], [x, .0340, -.3093], .0124, 12));
    add(parts, `RearHandleArm99_${side}`, roundMember([side * .048, -.0648, -.222],
      [x, -.0658, -.296], .0068, 10));
  }
}

/** Canonical turret-owned source mounting stock; no new articulation rig. */
export function sourceLoaderMount(): LoaderStock[] {
  const parts: LoaderStock[] = [];
  mountBase(parts); mountingFork(parts); cradle(parts);
  return toCanonical(parts);
}

function receiver(parts: LoaderStock[]): void {
  box(parts, 'LowerReceiver102', [-.02354, -.043355, -.30334], [.02354, -.030735, .045365]);
  for (const [i, a, b] of [[0, -.02101, -.01731], [1, .01760, .02134]]) {
    box(parts, `ReceiverWall102_${i}`, [a, -.03949, -.310975], [b, .023985, -.052458]);
  }
  box(parts, 'ReceiverWeb102', [-.021026, -.03949, -.052458], [.021324, -.006295, .029891]);
  for (const [i, a, b] of [[0, -.024285, -.020886], [1, .020986, .024254]]) {
    box(parts, `FeedWall102_${i}`, [a, -.013005, -.07892], [b, .033755, .05829]);
  }
  const ring = (top: number): XY[] => [[-.02335, .023985], [.02414, .023985], [.02414, top], [-.02335, top]];
  add(parts, 'RearReceiverCrown102', closedSectionLoft([
    {z: -.217529, ring: ring(.043385)}, {z: -.102348, ring: ring(.043465)},
    {z: -.086198, ring: ring(.050025)},
  ]));
  const cover = (right: number): XY[] => [[-.024146, .018295], [-.021957, .018295],
    [-.021956, .03314], [.024201, .033444], [Math.max(.026391, right - .00777), .034125],
    [right, .041855], [right - .00237, .047695], [right - .00777, .050025], [-.024146, .050025]];
  add(parts, 'FormedFeedCover102', closedSectionLoft([
    {z: -.086198, ring: cover(.036)}, {z: -.039229, ring: cover(.058233)},
    {z: .009771, ring: cover(.058233)}, {z: .02989, ring: cover(.058233)},
  ]));
  box(parts, 'FeedCoverFore102', [-.02104, .02369, .02989], [.02132, .050025, .071822]);
  box(parts, 'FeedCoverSpine102', [-.009, .0500, -.039229], [.009, .057175, -.008888]);
  const fore: XY[] = [[.02989, -.03949], [.13, -.06113], [.20411, -.04905],
    [.20411, -.008817], [.118302, -.009434], [.118302, .03132], [.09670, .03303],
    [.08384, .041635], [.071822, .050025], [.02989, .033755]];
  add(parts, 'ForeReceiver102', sideProfile(fore, -.02104, .02131));
  // This short source collar receives the retained original barrel. It does
  // not replace, translate, extend, or scale that barrel's geometry.
  const collar = Array.from({length:16},(_,i):XY=>[
    .02038*Math.cos(i*Math.PI/8), .01094+.02038*Math.sin(i*Math.PI/8)]);
  add(parts, 'BarrelSeat102', closedSectionLoft([{z:.118301,ring:collar},{z:.143431,ring:collar}]));
  // Actual small side strips and vertical fore receiving cheek. Their
  // exposed first surfaces are outside the central receiver wall.
  box(parts, 'LeftReceiverStrip102', [-.029394, -.030665, -.11242], [-.02028, -.021905, .05968]);
  add(parts, 'LeftForeStrip102', KIT.cylZ(1, .12332, 16).scale(.005317, .00936, 1)
    .translate(-.02847, -.03256, .12886));
  box(parts, 'RightForeSeat102', [.01886, -.029855, .10495], [.02815, .023175, .11807]);
  box(parts, 'CrownHead102', [.00262, .04331, -.17784], [.02228, .048935, -.15745]);
  const grip: XY[] = [[-.2786, -.043355], [-.2863, -.0551], [-.2764, -.0657],
    [-.2719, -.0703], [-.2657, -.0958], [-.2639, -.097565], [-.2276, -.0974],
    [-.2249, -.0930], [-.2270, -.0777], [-.2229, -.0698], [-.214, -.0657], [-.1658, -.0657],
    [-.1658, -.0471], [-.1602, -.043355]];
  add(parts, 'LowerGrip102', sideProfile(grip, -.01672, .01670));
}

function rearStock(parts: LoaderStock[], high: boolean): void {
  const crown = (w: number, top: number): XY[] => [[-w, .021505], [w, .021505],
    [w, .03445], [w * .65, top - .001], [w * .33, top], [-w * .33, top], [-w * .65, top - .001], [-w, .03445]];
  add(parts, 'RearCrown102', closedSectionLoft([
    {z: -.312679, ring: crown(.0237, .040055)}, {z: -.294229, ring: crown(.0236, .043975)},
    {z: -.25, ring: crown(.0233, .04388)}, {z: -.216307, ring: crown(.0233, .04383)},
  ]));
  box(parts, 'RearCrownRail102', [-.007786, .050825, -.288649], [.008751, .063745, -.219108]);
  box(parts, 'RearCrownRailSeat102', [-.010574, .04385, -.295448], [.010537, .051045, -.216309]);
  const rearBody: XY[] = [[-.36778, .00085], [-.3638, -.0283], [-.3192, -.0242],
    [-.3161, -.0272], [-.3069, -.0457], [-.30152, -.0457], [-.31268, .040035],
    [-.3168, .0392], [-.3213, .0124], [-.3234, .0089], [-.3628, .0035]];
  add(parts, 'RearBody102', sideProfile(rearBody, -.02357, .02369));
  // Distinct thin rear return (102/281) and bent side stock (102/4098),
  // not one solid butt block filling their enclosed negative space.
  const rear: XY[] = [[-.3497, -.0653], [-.3297, -.07783], [-.2909, -.0943],
    [-.27348, -.101715], [-.24036, -.101715], [-.2293, -.084355], [-.2293, -.073775],
    [-.243, -.079], [-.272, -.0976], [-.29, -.0883], [-.32155, -.062945]];
  add(parts, 'RearReturn102', sideProfile(rear, -.023, -.0185));
  box(parts, 'RearReturnLip102', [-.022, -.101715, -.27348], [.02152, -.097715, -.24036]);
  box(parts, 'RearReturnRight102', [.01825, -.101715, -.27348], [.02169, -.073775, -.22930]);
  const loop = new THREE.Shape();
  loop.absellipse(-.0380, -.0242, .0096, .0165, 0, Math.PI * 2, false, 0);
  const hole = new THREE.Path();
  hole.absellipse(-.0380, -.0242, .0070, .0129, 0, Math.PI * 2, true, 0);
  loop.holes.push(hole);
  add(parts, 'RearReturnEye102', new THREE.ExtrudeGeometry(loop,
    { depth: .016, bevelEnabled: false, steps: 1, curveSegments: 12 }).translate(0, 0, -.348));
  add(parts, 'RearReturnEyeLink102', planeBoundedArmor([
    [.874999,.470473,-.114160,-.009404], [-.874999,-.470473,.114160,.01265],
    [0,1,0,-.0395], [0,-1,0,.0675], [0,0,1,-.326], [0,0,-1,.341],
  ]));
  // Seven independently measured centre stations describe the source4098
  // curved 5.2mm rod; its AABB is emphatically not a filled side plate.
  const rod: XYZ[] = [[-.0434, -.0818, -.387], [-.04253, -.07068, -.380],
    [-.03908, -.03514, -.350], [-.03526, -.01664, -.300],
    [-.03257, -.00999, -.250], [-.03174, -.00964, -.200],
    [-.03180, -.01177, -.150], [-.03165, -.01514, -.127]];
  for (let i = 1; i < rod.length; i++) add(parts, `BentSideRod102_${i}`,
    roundMember(rod[i - 1], rod[i], .00260, 10));
  box(parts, 'LoopNeck102', [-.04885, -.125505, -.418155], [-.041424, -.096975, -.395464]);
  box(parts, 'LoopUpperLink102', [-.048785, -.100915, -.400553], [-.038364, -.080415, -.383564]);
  rearLoop(parts, high);
}

function rearLoop(parts: LoaderStock[], high: boolean): void {
  // Original analytic spline through sparse branch centres, not source mesh
  // vertices. Its sloping out-of-plane course preserves the v=-43mm air lane.
  const yz: XY[] = [[-.4005, -.1120], [-.4140, -.1237], [-.4300, -.1410],
    [-.4500, -.1692], [-.4600, -.1900], [-.4630, -.2150],
    [-.4550, -.2312], [-.4420, -.2315], [-.4300, -.2220],
    [-.4140, -.1950], [-.4010, -.1580]];
  const curve = new THREE.CatmullRomCurve3(yz.map(([u, y]) =>
    new THREE.Vector3(-.051 + (u + .45) * .15, y, u)), true, 'centripetal');
  add(parts, 'RearLoop102', new THREE.TubeGeometry(curve, high ? 64 : 32, .00415, high ? 10 : 6, true));
}

/** Weapon-local stocks; caller retains the exact existing group and barrel. */
export function sourceLoaderWeapon(high = true): LoaderStock[] {
  const parts: LoaderStock[] = [];
  receiver(parts); rearStock(parts, high);
  return parts;
}

