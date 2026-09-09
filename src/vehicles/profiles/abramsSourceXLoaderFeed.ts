// Independently constructed source99 holder /100 container /101 feed.
// Sparse design planes, part axes and six-sided cartridge recipes only;
// no source vertices or triangle connectivity are loaded by this module.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { planeBoundedArmor, roundMember, type ArmorPlane, type XY, type XYZ } from './abramsSourceXGeometry.ts';

interface FeedStock { name: string; geometry: THREE.BufferGeometry }
const SIDE: ArmorPlane = [.3232827581, -.0429859427, .9453255878, .04795366353];
const OTHER: ArmorPlane = [-.3232837053, .0429941249, -.9453248918, .02807106488];
const FORE: ArmorPlane = [-.9396320031, -.1313922954, .3159553188, -.15814056275];
const AFT: ArmorPlane = [.9396362975, .1310063687, -.3161027676, .41814608673];
const BOTTOM: ArmorPlane = [.1105090881, -.9903854337, -.0832131847, .15451777173];
const FLOOR: ArmorPlane = [-.1105413852, .9904562844, .0823222374, -.00142624318];
const LID_TOP: ArmorPlane = [.0224489306, .9990283978, .03792500435, .07688416433];

function add(parts: FeedStock[], name: string, geometry: THREE.BufferGeometry, owner: string): void {
  const label = `LoaderSourceFeedAssembly${name}`;
  geometry.userData = { abramsLoaderStock: label, sourceOwner: owner };
  parts.push({ name: label, geometry });
}

function opposite(p: ArmorPlane): ArmorPlane { return [-p[0], -p[1], -p[2], -p[3]]; }

function bounded(parts: FeedStock[], name: string, planes: readonly ArmorPlane[], owner: string): void {
  add(parts, name, planeBoundedArmor(planes), owner);
}

function sideProfile(points: readonly XY[], x0: number, x1: number): THREE.BufferGeometry {
  return new THREE.ExtrudeGeometry(new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(-z, y))),
    { depth: x1 - x0, bevelEnabled: false, steps: 1 }).rotateY(Math.PI / 2).translate(x0, 0, 0);
}

function container(parts: FeedStock[]): void {
  const plan = [SIDE, OTHER, FORE, AFT];
  bounded(parts, 'ContainerLower', [...plan, BOTTOM, FLOOR], '100/6');
  const lipRight: ArmorPlane = [-.1169172892, .9911020281, .0636169577, .01444783466];
  const lipLeft: ArmorPlane = [-.1169203284, .9911022462, .0636079748, .01595903350];
  const inner = [
    [-.3232004511, .0400229995, -.9454838063, -.04602203278],
    [.3238528187, -.0458784243, .9449944561, -.02598999857],
    [.9397012259, .1320076365, -.3154926148, .16017942995],
    [-.9396382975, -.1314861808, .3158975373, -.41612028068],
  ] as const;
  for (let i = 0; i < 4; i++) bounded(parts, `ContainerRim${i}`,
    [...plan, opposite(FLOOR), i === 1 ? lipLeft : lipRight, inner[i]], '100/6');
  // The source lower face floats1.208mm above its tray here. Only this
  // approved8mm hidden foot reaches1.5mm below it; all adjacent air remains.
  const yaw = Math.atan2(.829, .559);
  const foot = KIT.cylY(.004, .004, .00175, 12)
    .translate(.89, 2.559507063691122 - .0015 + .00175 / 2, -.235)
    .translate(-.840, -2.69153, .06037).rotateY(-yaw);
  add(parts, 'ContainerSeatAccommodation', foot, 'authored:container-seat');
}

function lid(parts: FeedStock[]): void {
  const plan: readonly ArmorPlane[] = [
    [.3234390501, -.0436524196, .9452415813, .05142156466],
    [-.3233583690, .0435791848, -.9452725638, .03155019900],
    [-.9458097502, .0097361228, .3245752985, -.14443191691],
    [.9458542948, -.0079599917, -.3244939007, .42155688756],
  ];
  bounded(parts, 'LidTop', [...plan, LID_TOP,
    [-.0223303182, -.9990607385, -.0371348569, -.07490835811]], '100/60');
  // Two genuine downturned long flanges surround a hollow lid; its full
  // height is not filled. The separate body rim remains inside the skirts.
  bounded(parts, 'LidFlangeRight', [...plan, LID_TOP,
    [-.3237538370, .0433418366, -.9451481039, -.04954528650],
    [.0807669147, -.9944082739, -.0680359488, -.01423140220]], '100/60');
  bounded(parts, 'LidFlangeLeft', [...plan, LID_TOP,
    [.3235029094, -.0405887493, .9453562403, -.02938637782],
    [.0804974781, -.9944368532, -.0679374784, -.01466625019]], '100/60');
  handle(parts);
  hinge(parts);
}

function hinge(parts: FeedStock[]): void {
  // Independent measured hinge basis q/r, with the actual43mm/m axial
  // lean. Thin leaves and six alternating rolled knuckles, not an AABB.
  const q = new THREE.Vector3(.3238188025, 0, .9461191168);
  const r = new THREE.Vector3(.9461191168, 0, -.3238188025);
  const frame = new THREE.Matrix4().set(r.x, 0, q.x, 0, 0, 1, -.04295, 0,
    r.z, 0, q.z, 0, 0, 0, 0, 1);
  const section = (name: string, points: readonly XY[], start: number, end: number, owner: string) => {
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y))),
      { depth: end - start, bevelEnabled: false, steps: 1 }).translate(0, 0, start).applyMatrix4(frame);
    add(parts, name, g, owner);
  };
  section('HingeBodyLeaf', [[.41634, .041136], [.41834, .041354], [.416174, .057793],
    [.416828, .059912], [.414910, .060796], [.414159, .057844]], -.02544, .05097, '100/0');
  section('HingeLidLeaf', [[.40537, .07325], [.42206, .07310], [.42206, .06864],
    [.424057, .06864], [.424081, .07510], [.40537, .07525]], -.02520, .05090, '100/82');
  const ranges = [
    [-.02500397, -.01570301, 82], [-.01512995, -.00575876, 0],
    [.00328143, .01264188, 82], [.01321376, .02253028, 0],
    [.03157057, .04087565, 82], [.04144376, .05081709, 0],
  ];
  for (let i = 0; i < ranges.length; i++) {
    const [a, b, owner] = ranges[i];
    add(parts, `HingeKnuckle${i}`, roundMember([.42032, .064384, a],
      [.42032, .064384, b], .00372, 16).applyMatrix4(frame), `100/${owner}`);
    if (owner === 82) section(`HingeLidNeck${i}`,
      [[.42206, .064384], [.42404, .064384], [.42406, .06865], [.42206, .06865]], a, b, '100/82');
    else section(`HingeBodyNeck${i}`,
      [[.414910, .060796], [.416828, .059912], [.41950, .06130], [.41750, .06380]], a, b, '100/0');
  }
  // Complete143-source seam rays in KB31ut confirm there is no axle.
  // This one approved0.8mm-radius concealed pin connects the knuckles;
  // all0.57mm cap seams stay open outside the narrow internal core.
  add(parts, 'HingeAxleAccommodation', roundMember([.42032, .064384, -.0251],
    [.42032, .064384, .0508], .0008, 10).applyMatrix4(frame), 'authored:hinge-axle');
}

function handle(parts: FeedStock[]): void {
  // Source100/98 is a shallow closed raised loop, not a cylindrical handle.
  // Four narrow independent sheets preserve its central under-handle air.
  const side: ArmorPlane = [.3230, -.043, .9454, .02070];
  const other: ArmorPlane = [-.3230, .043, -.9454, -.00004];
  const ends: readonly ArmorPlane[] = [
    [-.9458, .0097, .3246, -.2403], [.9458, -.0097, -.3246, .3315],
  ];
  const upper: ArmorPlane = [.0229972075, .9990002959, .0383345428, .0839072318];
  const lower: ArmorPlane = [-.0229972075, -.9990002959, -.0383345428, -.0822072318];
  for (const [i, edge, back] of [
    [0, side, [-.3230, .043, -.9454, -.0188]],
    [1, other, [.3230, -.043, .9454, .00186]],
  ] as const) bounded(parts, `HandleRail${i}`, [edge, back, ...ends, upper, lower], '100/98');
  for (const [i, edge, back] of [
    [0, ends[0], [.9458, -.0097, -.3246, .2423]],
    [1, ends[1], [-.9458, .0097, .3246, -.3295]],
  ] as const) bounded(parts, `HandleFoot${i}`, [side, other, edge, back, upper, opposite(LID_TOP)], '100/98');
}

function holder(parts: FeedStock[]): void {
  const fore: ArmorPlane = [-.94007449, -.13141260, .31462784, -.1160711313];
  const side: ArmorPlane = [.32295895, -.04319931, .94542654, .0551605142];
  const other: ArmorPlane = [-.32392578, .04409506, -.94505434, .0397970268];
  const bottom: ArmorPlane = [.11074773, -.99044220, -.08221426, .1582304562];
  const top: ArmorPlane = [-.11099436, .99035636, .08291277, -.1557768162];
  const end: ArmorPlane = [.93965, .1312, -.3159, .2024];
  bounded(parts, 'TrayFloor', [fore, side, other, bottom, top, end], '99/17');
  const crown: ArmorPlane = [.0110214, .9989761, .0438780, .01568129];
  const fall: ArmorPlane = [.820, .5105, -.265, .1435];
  bounded(parts, 'TrayForeWall', [fore, side, other, bottom, crown,
    [.93992243, .13131089, -.31512423, .1181915576]], '99/17');
  bounded(parts, 'TrayRightWall', [fore, side, bottom, crown, fall, end,
    [-.32413814, .04399263, -.94498630, -.0526920107]], '99/17');
  bounded(parts, 'TrayLeftWall', [fore, other, bottom, crown, fall, end,
    [.32427071, -.043912, .94494457, -.0369406918]], '99/17');
  // The tray's narrow inward return reaches the separate right cradle
  // strip. Its central underside stays open; this is not a pedestal.
  bounded(parts, 'TrayUpperArm', [crown,
    [-.0031108, -.9990217, -.0441130, -.01350750],
    [-1, 0, 0, -.0648], [1, 0, 0, .1279],
    [0, 0, 1, .01805], [0, 0, -1, .06976],
    [-.34, 0, -1, .0368]], '99/17');
  add(parts, 'TrayInwardFold', sideProfile([
    [-.04606, -.004975], [.018056, -.004975], [.018056, .01236],
    [-.04606, .01236],
  ], .05923, .06077), '99/17');
  // The actual elbow is a small folded sheet rising outward into the arm.
  bounded(parts, 'TrayElbow', [[0, 0, 1, .018056], [0, 0, -1, .04606],
    [-1, 0, 0, -.0605], [1, 0, 0, .0655],
    [-.70710678, .70710678, 0, -.0336],
    [.70710678, -.70710678, 0, .0350]], '99/17');
  // Source17's small raised quarter-turn guide physically receives the
  // cartridge tails above the otherwise open tray arm. Its central pocket
  // remains empty; the rounded bend is an analytic sparse-form approximation.
  const arc = (r: number, i: number) => new THREE.Vector2(
    .07183 + r * Math.cos(i * Math.PI / 16), .07740 - r * Math.sin(i * Math.PI / 16));
  const guide = [...Array.from({ length: 9 }, (_, i) => arc(.02335, i)),
    ...Array.from({ length: 9 }, (_, i) => arc(.02125, 8 - i))];
  add(parts, 'TrayCurvedFeedGuide', new THREE.ExtrudeGeometry(new THREE.Shape(guide),
    { depth: .01725, bevelEnabled: false, steps: 1 }).rotateX(-Math.PI / 2).translate(0, .0152, 0), '99/17');
  receivingStrip(parts);
}

function receivingStrip(parts: FeedStock[]): void {
  // The lower leg seats on source99's existing rear saddle. It folds
  // outward through a narrow angled web into the source17 receiving arm.
  add(parts, 'ReceivingLower', sideProfile([
    [-.23996, -.108375], [-.223515, -.108375], [-.223515, -.09465],
    [.095689, -.092865], [.09571, -.03997], [-.15531, -.03902],
    [-.15782, -.046965], [-.160223, -.060955], [-.233127, -.061053], [-.239822, -.067825],
  ], .0418, .04612), '99/101');
  // Sparse design breakpoints of the outward return; measured inclined
  // sheet stock, including its two small bend transitions.
  const fold: XY[] = [[.0419, -.0472], [.0427, -.0396], [.0452, -.034725],
    [.05353, -.025175], [.0553, -.0190], [.05963, -.0202],
    [.05765, -.026685], [.04885, -.035735], [.0463, -.04077], [.04612, -.0472]];
  const geometry = new THREE.ExtrudeGeometry(new THREE.Shape(fold.map(([x, y]) => new THREE.Vector2(x, y))),
    { depth: .2431, bevelEnabled: false, steps: 1 }).translate(0, 0, -.1516);
  add(parts, 'ReceivingBend', geometry, '99/101');
  add(parts, 'ReceivingUpper', sideProfile([
    [-.13101, -.027341], [.050826, -.030449], [.043287, -.025192],
    [.017779, .003395], [-.056239, .007745], [-.061120, .020325],
    [-.070457, .026855], [-.081884, .025005], [-.119634, -.019214], [-.129215, -.026445],
  ], .05527, .05963), '99/101');
}

type RoundRow = readonly [number, number, number, number, number, number, number, number, number, number, number];
// Part datum, tail centre, bore-axis direction, six-sided ring phase, length.
const ROUNDS: readonly RoundRow[] = [
  [4,.107737474,.030973225,-.058697650,.259604112,.009978015,.965663577,-.933484759,.263818350,.242911679,.067306516],
  [54,.137062759,.040996970,-.069824221,.363564011,-.021878639,.931312265,-.667248759,-.708927108,.228476363,.067277887],
  [104,.127853369,.039119908,-.066361660,.322750954,-.014639392,.946370704,.327511536,-.934793700,-.137466114,.067291444],
  [154,.117831121,.035086621,-.062519766,.291768525,.002943896,.956484428,.946394044,-.157089188,-.282243336,.067381537],
  [204,.097645029,.028724858,-.055485441,.227121318,.000000590,.973866473,.845083184,-.493939046,-.204593818,.067300854],
  [254,.087601712,.027749965,-.053258379,.194949767,.019839466,.980612556,.820420014,-.548434046,-.161651161,.067287364],
  [304,.077558294,.029196569,-.051684964,.163716938,.000569553,.986507192,-.847524791,-.510958029,.143609264,.067256124],
  [354,.067508090,.029076565,-.050226166,.130499538,.013201904,.991360469,.903128337,-.414897137,-.110542172,.067289356],
  [404,.057276184,.028116573,-.048507751,.098013855,.005772384,.995168309,.848950545,-.520850501,-.089430013,.067262447],
  [454,.149406139,.037646601,-.074613837,.353530868,-.030615649,.934921712,-.934518518,-.081959513,.346349214,.067340886],
  [504,.160516600,.032251586,-.078998977,.353962993,-.030675175,.934756243,.930910969,.071575788,-.358164313,.067370837],
  [554,.045691128,.028346568,-.047419084,.062071196,-.000914498,.998071305,.850114399,.522728561,-.063720955,.067306607],
  [604,.035744447,.028709917,-.047423764,.002744614,-.011662047,.999928229,.940872445,-.338522245,-.012717348,.067304970],
];

function cartridge(row: RoundRow): THREE.BufferGeometry {
  const origin = new THREE.Vector3(row[1], row[2], row[3]);
  const axis = new THREE.Vector3(row[4], row[5], row[6]).normalize();
  const radial = new THREE.Vector3(row[7], row[8], row[9]);
  radial.addScaledVector(axis, -radial.dot(axis)).normalize();
  const across = new THREE.Vector3().crossVectors(axis, radial);
  const profile = [[0, .00475], [.04210, .00475], [.04260, .00340], [.06354, .00208]];
  const rings = profile.map(([z, r]) => Array.from({ length: 6 }, (_, i) => origin.clone()
    .addScaledVector(axis, z * row[10] / .06730)
    .addScaledVector(radial, r * Math.cos(i * Math.PI / 3))
    .addScaledVector(across, r * Math.sin(i * Math.PI / 3))));
  const vertices: number[] = [];
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => vertices.push(...a.toArray(), ...b.toArray(), ...c.toArray());
  for (let k = 0; k < 3; k++) for (let i = 0; i < 6; i++) {
    const j = (i + 1) % 6;
    tri(rings[k][i], rings[k][j], rings[k + 1][j]);
    tri(rings[k][i], rings[k + 1][j], rings[k + 1][i]);
  }
  for (let i = 1; i < 5; i++) tri(rings[0][0], rings[0][i + 1], rings[0][i]);
  const tip = origin.clone().addScaledVector(axis, row[10]);
  for (let i = 0; i < 6; i++) tri(rings[3][i], rings[3][(i + 1) % 6], tip);
  const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(vertices.flatMap((v, i) => i % 3 === 1 ? [] : [v]), 2));
  g.computeVertexNormals();
  return g;
}

type LinkRow = readonly [number, XYZ, XYZ, XYZ, XYZ, number];
// Independent three-station folded-strip centre lines and actual axial span.
const LINKS: readonly LinkRow[] = [
  [0,[.107619294,.027814974,-.020524325],[.112138832,.025404919,-.021618607],[.115719769,.028684963,-.022348346],[.260471566,.010788918,.965421236],.020374790],
  [50,[.141280571,.037149895,-.032114736],[.145560891,.034669865,-.033814160],[.149145986,.037879933,-.034783687],[.354506272,-.031880882,.934509986],.020386169],
  [100,[.130655352,.033979882,-.028471300],[.135270348,.032149900,-.030050898],[.138460400,.035729874,-.030779924],[.322115953,-.014230838,.946593258],.020389200],
  [150,[.119439559,.030544986,-.024473058],[.124084740,.028689851,-.025802238],[.127309447,.032334913,-.026531736],[.292560563,.003430145,.956240844],.020435014],
  [200,[.095673557,.027844895,-.017250858],[.099493432,.024344910,-.018040387],[.103773732,.026604880,-.018769506],[.225361338,0,.974275252],.020313164],
  [250,[.084388585,.028284897,-.015067006],[.087973563,.024564971,-.015611911],[.092423491,.026499976,-.016340783],[.194729091,.021545971,.980620392],.020427054],
  [300,[.073173404,.028285016,-.013614063],[.077023065,.024854888,-.014223429],[.081333225,.027045001,-.014702558],[.162413223,0,.986722831],.020422317],
  [350,[.061952951,.027665008,-.012345089],[.066067893,.024564971,-.012764938],[.070248409,.027189959,-.013064305],[.130230713,.014756132,.991373904],.020325826],
  [400,[.050338152,.027699937,-.010826524],[.054117874,.024129976,-.011126440],[.058532835,.026244987,-.011305288],[.097581310,.007362609,.995200321],.020368498],
  [450,[.153195727,.040394891,-.036603254],[.154991237,.035544862,-.037332750],[.159671259,.035614957,-.038787291],[.354500677,-.032371566,.934495239],.020386491],
  [500,[.164351731,.034959902,-.040971885],[.166141820,.030144919,-.041701319],[.170787322,.030219902,-.043156091],[.354545914,-.032371933,.934478064],.020386259],
  [550,[.037422497,.027114857,-.009978815],[.041402918,.023764838,-.010218093],[.045722438,.026094903,-.010217417],[.061562434,0,.998103235],.020429003],
  [600,[.025607885,.025474895,-.010589961],[.030053188,.022774924,-.010589666],[.033902542,.025764931,-.010279215],[.002822598,-.010780078,.999937910],.020391497],
];

function ribbon(a: XYZ, b: XYZ, width: XYZ, span: number): THREE.BufferGeometry {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
  const along = end.clone().sub(start), across = new THREE.Vector3(...width).normalize();
  const normal = new THREE.Vector3().crossVectors(along, across).normalize();
  if (normal.y < 0) normal.negate();
  const centre = start.clone().add(end).multiplyScalar(.5);
  const forward = new THREE.Vector3().crossVectors(across, normal).normalize();
  // Source101 links are open bent sheets. The0.45mm inward closure is
  // authored stock, retaining every measured exposed fold centre line.
  const normalPlane: ArmorPlane = [...normal.toArray() as [number, number, number], normal.dot(centre)];
  return planeBoundedArmor([normalPlane,
    [-normal.x, -normal.y, -normal.z, .00045 - normal.dot(centre)],
    [across.x, across.y, across.z, across.dot(centre) + span / 2],
    [-across.x, -across.y, -across.z, -across.dot(centre) + span / 2],
    [forward.x, forward.y, forward.z, Math.max(forward.dot(start), forward.dot(end))],
    [-forward.x, -forward.y, -forward.z, -Math.min(forward.dot(start), forward.dot(end))],
  ]);
}

/** Loader-local stocks; the caller retains the existing exact weapon rig. */
export function sourceLoaderFeed(): FeedStock[] {
  const parts: FeedStock[] = [];
  container(parts); lid(parts); holder(parts);
  for (const row of ROUNDS) add(parts, `Cartridge${row[0]}`, cartridge(row), `101/${row[0]}`);
  for (const row of LINKS) for (let side = 0; side < 2; side++) {
    add(parts, `Link${row[0]}_${side}`, ribbon(row[side + 1] as XYZ, row[side + 2] as XYZ, row[4], row[5]), `101/${row[0]}`);
  }
  // Complete source101 has no intersection with99/100/102. At this hidden
  // receiver mouth the cartridge crown2.722943406 and source102 underside
  //2.725654840 leave2.711mm air. The approved2mm pin crosses only that gap;
  // neither the belt nor source receiver is shifted or broadly thickened.
  const pin = KIT.cylY(.001, .001, .00335, 12)
    .translate(.853, 2.72270 + .00335 / 2, -.099)
    .translate(-.840, -2.69153, .06037).rotateY(-Math.atan2(.829, .559));
  add(parts, 'BeltReceiverAccommodation', pin, 'authored:feed-receiver');
  return parts;
}

