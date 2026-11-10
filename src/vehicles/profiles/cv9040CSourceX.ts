import { addVehicleGhillieSuit } from '../ghillieSuit.ts';
// The Swedish Stridsfordon 9040C: the Strf 9040 brought to the C standard for international missions (Liberia from
// 2005, then Afghanistan), and the same vehicle as Sweden gave it to Ukraine (from 2023, `ukrainian`).
//
// Round 269 (the owner 2026-11-05: "ALSO UPDATE THE CV 9040CS TO LOOK A LOT BETTER TOO"; the owner's 2026-11-02 rule: a
// vehicle that is a fleet tank is built ON that tank's builder): the C is the measured Strf 9040 of profiles/cv90.ts (the
// hull loft, the two bolted side-armour courses, the stern, seven road wheels and the front sprocket, the two-man
// turret, the Bofors 40 mm), composed through its exports at real size (no 90 % concept scale: this spec's frame was
// always metres), carrying the C kit: the bolted tile applique over the glacis and the thick nose block between the lamp
// boxes, the turret's side applique, six Galix launchers on the smoke banks' seat, the air-conditioning housing across
// the turret rear, the coaxial Ksp 58C, and no roof weapon station. Reference packets (real photographs, published
// dimensions, the kit and where it sits): ~/cot-lanes/cv9040c-269-ev/research/cv9040c/ and research/ua_cv9040c/.
// Authoring frame: metres, +Z forward, +X the vehicle's left, ground y 0.
import * as THREE from 'three';
import { sectionSolid } from './sectionSolid.ts';
import { KIT, FITTINGS, convexSlab } from './kit.ts';
import { mountRotated as mount } from './fittingMount.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { buildFleetTrackShoe } from './abramsSourceXTrackShoe.ts';
import {
  CV90_HULL, cv90RoofY, chamferedBox, buildCv90Hull, buildCv90RunningGear, cv90TurretShell, buildCv90Gun,
  cv90TurretRoof, type CvBuilderPort,
} from './cv90.ts';

const d = CV90_HULL;
const roof = (z: number): number => cv90RoofY(d, z);
/** The upper glacis' fall (rad): the tiles, their bolts and the cable lie in its plane. */
const GLACIS_TILT = Math.atan2(d.roofY - d.noseTopY, d.noseZ - 0.04 - d.glacisBreakZ);
/** The applique tiles stand this far proud of the glacis (seated 12 mm into it). */
const TILE_PROUD_M = 0.055;
const tileTop = (z: number): number => roof(z) + TILE_PROUD_M;

/** One bolted applique tile over the upper glacis between x0..x1 and z0..z1, with a fixing bolt near each corner. */
function glacisTile(P: TankBuilderPort, x0: number, x1: number, z0: number, z1: number): void {
  const half = (x1 - x0) / 2, xc = (x0 + x1) / 2;
  P.addExternalArmor('hull', chamferedBox([z0, z1].map((z) => [z, half, roof(z) - 0.012, tileTop(z), 0.012] as const)),
    xc, 0, 0);
  const bolt = KIT.box(0.036, 0.014, 0.036);
  for (const x of [x0 + 0.08, x1 - 0.08]) for (const z of [z0 + 0.08, z1 - 0.08]) {
    P.add('hullDetail', bolt.clone(), x, tileTop(z) + 0.003, z, GLACIS_TILT, 0, 0);
  }
  bolt.dispose();
}

/** The C's hull kit on the Strf 9040 hull: the glacis tiles, the nose block, the lamp boxes and the stowed tow cable. */
function cHullKit(P: TankBuilderPort): void {
  // Tile applique over the upper glacis (photos 5-7): three tiles across ahead of the driver's vision blocks (they look
  // forward over them), a fourth over the engine deck on the right; the grille and the driver's hatch stay bare.
  for (const [x0, x1] of [[-1.47, -0.51], [-0.49, 0.49], [0.51, 1.47]] as const) glacisTile(P, x0, x1, 2.34, 3.04);
  glacisTile(P, -1.47, -0.27, 1.64, 2.32);
  // The nose block (photos 1, 6): a thick bolted block across the nose between the lamp boxes, its top 2 cm proud of the
  // tiles, its chamfered lip overhanging an undercut lower face; inboard of the tracks' inner edge (x 1.05).
  const NOSE: readonly (readonly [number, number, number, number, number])[] = [
    [3.00, 1.04, 1.36, roof(3.00) + 0.075, 0.015],
    [3.24, 1.04, 1.00, roof(3.24) + 0.075, 0.02],
    [3.37, 1.04, 0.99, 1.405, 0.035],
    [3.44, 1.00, 1.10, 1.385, 0.03],
  ];
  P.addExternalArmor('hull', chamferedBox(NOSE));
  const noseTop = (z: number): number => {
    const i = NOSE.findIndex(([zs]) => zs >= z), [z0, , , t0] = NOSE[i - 1], [z1, , , t1] = NOSE[i];
    return THREE.MathUtils.lerp(t0, t1, (z - z0) / (z1 - z0));
  };
  for (const side of [-1, 1]) {
    // lamp boxes at the nose corners: a visor over each headlamp pair and an outer cheek, both seated in the nose
    P.addExternalArmor('hull', KIT.box(0.40, 0.035, 0.20), side * 1.27, 1.349, 3.30);
    P.addExternalArmor('hull', KIT.box(0.03, 0.30, 0.20), side * 1.455, 1.20, 3.31);
    // the block's fixing bolts along its top
    for (const x of [0.30, 0.90]) for (const z of [3.08, 3.30]) {
      P.add('hullDetail', KIT.box(0.036, 0.012, 0.036), side * x, noseTop(z) + 0.002, z);
    }
  }
  // the troop door's hinge pillar on the rear plate (seated 1 cm into it), between the door's hinge edge (x -0.50) and
  // the right corner bin's step, under the base vehicle's hinge knuckles (it closes the 5 cm well between them that the
  // top-down coverage read as a hole)
  P.add('hullDark', KIT.box(0.062, 0.80, 0.06), -0.531, 1.18, -3.27);
  // the tow cable, stowed in a loop on the right-front tile (the C's tiles cover the base vehicle's cable run)
  KIT.towCable(P, [[-1.36, 2.46], [-0.92, 2.58], [-0.66, 2.52], [-0.64, 2.86], [-1.10, 2.95], [-1.38, 2.84]]
    .map(([x, z]) => [x, tileTop(z) + 0.018, z]));
}

/** Six Galix 13 launchers (80 mm), three a bank, on the base turret's smoke-bank seat (photo 4: high on the rear sides). */
const GALIX_BANKS = Object.freeze({ count: 3, r: 0.045, len: 0.24, spacing: 0.10, seed: 9040 });

/** The C's turret kit: the trunnion housings in the gun channel, the side applique, the AC housing and the whips. */
function cTurretKit(P: TankBuilderPort): void {
  const { box, cylY } = KIT;
  for (const side of [-1, 1]) {
    // trunnion housings between the rocking mask and the cheeks: the fixed seats of the gun's pitch axis
    P.add('turret', box(0.095, 0.24, 0.30), side * 0.3025, 0.39, 1.12);
    // bolted applique on the upper side panel ahead of the Galix bank, laid on its 24 degree inward rake (photo 4/5)
    const n = [0.913, 0.409], h40 = (z: number): number => 1.05 + 0.02 * (z + 0.96) / 1.18;
    const panelX = (y: number, z: number): number => h40(z) - 0.17 * (y - 0.40) / 0.38;
    const corner = (y: number, z: number, out: number): number[] =>
      [side * (panelX(y, z) + n[0] * out), y + n[1] * out, z];
    const pts: number[][] = [];
    for (const z of [-0.42, 0.20]) for (const y of [0.43, 0.74]) for (const out of [-0.01, 0.07]) pts.push(corner(y, z, out));
    P.addExternalArmor('turret', convexSlab(...pts));
    const bolt = box(0.014, 0.036, 0.036);
    for (const z of [-0.35, 0.13]) for (const y of [0.49, 0.68]) {
      const [x, yy, zz] = corner(y, z, 0.073);
      P.add('turretDetail', bolt.clone(), x, yy, zz, 0, 0, side * 0.42);
    }
    bolt.dispose();
  }
  // The air-conditioning housing across the turret rear (the C's mission AC), its louvred rear face and two fans on top.
  P.addEquipment('turret', chamferedBox([[-1.40, 0.76, 0.13, 0.66, 0.04], [-1.02, 0.76, 0.13, 0.66, 0.04]]));
  P.add('turretDark', box(1.24, 0.34, 0.02), 0, 0.40, -1.405);
  for (let i = 0; i < 5; i++) P.add('turretDetail', box(1.20, 0.025, 0.035), 0, 0.28 + i * 0.06, -1.418, 0.5, 0, 0);
  for (const x of [-0.32, 0.32]) {
    P.add('turret', cylY(0.16, 0.16, 0.04, P.q ? 20 : 12), x, 0.675, -1.21);
    P.add('turretDark', cylY(0.13, 0.13, 0.012, P.q ? 20 : 12), x, 0.697, -1.21);
  }
  // the whips at their service length: the tall one's tip at the published 4.17 m envelope (docs/references/photos/
  // ifvs-20260925.json, tallestM)
  for (const [x, height, seed] of [[-0.78, 1.55, 9055], [0.80, 1.35, 9056]] as const) {
    P.add('turretDark', cylY(0.040, 0.050, 0.08, 10), x, 0.76, -0.92);
    mount(P, 'turret', FITTINGS.antennaWhip({ mats: P.mats, h: height, r: 0.010, seed }), x, 0.80, -0.92);
  }
}

/** The Ukrainian CV9040C's service kit (release 265, the owner's photograph of a 21st Mechanized Brigade CV90, 2024): the
 *  white tactical triangle on each flank under the turret's rear, and a dusty maroon tarpaulin draped over the load on the
 *  troop roof, from its rear edge to the turret's sweep, its edges hanging over the side armour and the rear, strapped
 *  down; the net over its turret is its ghillie suit.
 *  (ua2, the ua1 critics, both, on the photograph: the tarp read as an orange crate with posts through it, short of the
 *  turret; the triangle sat forward, small and hairline.) 269: reseated on the Strf 9040 hull (a flat troop roof at
 *  1.76 m, the side courses' tops 15 mm over it) and turret (the net's heap on the AC housing). */
function addUkrainianKit(P: TankBuilderPort): void {
  // (ua4, the ua3 critics: its apex met the roof edge) the triangle whole on the upper course's panel under the turret's
  // rear (z -1.13 to -0.11, y 1.04 to 1.775), clear of its fixing bolts
  for(const side of [-1,1])P.decal('hull','flag','ua-triangle',.64,[side*1.665,1.40,-.62],side*Math.PI/2);
  // the troop roof is flat at 1.76 from its rear edge (z -3.25) to the turret's sweep (the AC housing's corners reach
  // z -2.06): the load runs from -3.32 to -2.17
  // (ua3, the ua2 critics, both: a stiff faceted cushion; lumps, its edges down over the rear plate and the rear corners,
  // crossing cords, a duller grey-brown; its front tucked in, where a corner stood out as a beak. ua4, the ua3 critics:
  // its ridge a row of pyramids, the sheet stopping at the roof's edges: one soft load, its lumps swelling and settling
  // along it, hanging over the side edges (269: over the side courses' tops, 1.775 to 1.66 out) and over the rear)
  const RING: readonly [number, number, number][] = [ // x, height over the base, the lump's weight
    [1.70, -.10, 0], [1.685, .02, 0], [1.60, .07, .01], [1.46, .12, .02], [1.30, .19, .03], [1.02, .26, -.03],
    [.62, .30, .04], [.20, .33, -.02], [-.25, .32, .04], [-.68, .31, -.03], [-1.06, .25, .04], [-1.32, .17, -.02],
    [-1.46, .12, .02], [-1.60, .07, .01], [-1.685, .02, 0], [-1.70, -.10, 0],
    [-1.64, -.08, 0], [-1.44, -.02, 0], [0, -.03, 0], [1.44, -.02, 0], [1.64, -.08, 0],
  ];
  const base = d.roofY;
  const drape=(z: number, k: number, s=1, w=1): {z: number; ring: [number, number][]}=>({z,
    ring:RING.map(([x,h,wt])=>[Math.abs(x)>1.6?x:x*w,base+(h>0?(h+wt*k)*s:h)] as [number, number])});
  const stations=[drape(-3.32,0,.62),drape(-3.20,.5),drape(-3.05,.9),drape(-2.89,.6),drape(-2.73,0),drape(-2.57,.5),
    drape(-2.42,.9),drape(-2.28,.5,1.0,.98),drape(-2.17,0,.55,.96)];
  // the sheet's upper courses one surface (its hems and underside keep their edges)
  P.addEquipment('hullCanvasPale',sectionSolid(stations,{smoothSideEdges:[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14]}));
  // its rear edge hanging over the roof's in three folds: the middle one steep and short, over the door but clear of its
  // swing (the door's top at 1.60, reserved to 1.65), the outer two laid back over the corner bins' lids (1.68)
  for (const [x,w,len,tilt] of [[0,1.0,.11,.45],[-1.30,.62,.20,1.2],[1.30,.62,.20,1.2]] as const)
    P.addEquipment('hullCanvasPale',box2(w,len),x,base+.008-len/2*Math.cos(tilt),d.rearZ-.005-len/2*Math.sin(tilt),tilt,0,0);
  // crossing cords, laid over it station to station
  const RIDGE=[3,5,6,7,8,9,10,12];
  for(const dir of [1,-1]) for(let i=1;i+1<stations.length-1;i++) {
    const j=dir>0?RIDGE[i-1]:RIDGE[RIDGE.length-i];
    const k=dir>0?RIDGE[i]:RIDGE[RIDGE.length-i-1];
    if(j===undefined||k===undefined)continue;
    const [x0,y0]=stations[i].ring[j],[x1,y1]=stations[i+1].ring[k],z0=stations[i].z,z1=stations[i+1].z;
    const len=Math.hypot(x1-x0,y1-y0,z1-z0);
    const cord=KIT.box(.02,.012,len);
    cord.lookAt(new THREE.Vector3(x1-x0,y1-y0,z1-z0));
    P.addEquipment('hullCloth',cord,(x0+x1)/2,(y0+y1)/2+.014,(z0+z1)/2);
  }
  // (ua4, a shade lighter toward the photograph's faded rust)
  P.mats.canvasPale.color.setHex(0x5a4842);
  // ua4 (the ua3 critics, both: the turret's net "a hollow hoop", daylight under it; the photograph's a closed heap): the
  // net bundled on the turret's rear, a filled heap the suit lies on (ghillieFleetSuits.ts). 269: on the AC housing's top
  // (0.66, |x| 0.76, z -1.40 to -1.02) and the roof's rear lip, behind the whip feet and the Lyran block (z -0.95), its
  // edges rolled down the housing's sides and the turret's walls; the roof carries no other load under it (decorations.ts)
  const HEAP: readonly [number, number][] = [ // across the half-width, height over the roof as a share of the crown
    [1, NaN], [.95, .14], [.84, .46], [.64, .75], [.38, .93], [.10, 1], [-.20, .93], [-.48, 1], [-.74, .71], [-.90, .39],
    [-.97, .11], [-1, NaN], [-.5, NaN], [.5, NaN],
  ];
  const heap=(z: number, w: number, crown: number, edge: number): {z: number; ring: [number, number][]}=>({z,
    ring:HEAP.map(([x,h],i)=>[x*w,Number.isNaN(h)?edge-(i>11?.01:0):.74+h*crown] as [number, number])});
  P.addEquipment('turretCloth',sectionSolid([heap(-1.43,.60,.03,.62),heap(-1.38,.72,.10,.63),heap(-1.30,.80,.17,.64),
    heap(-1.20,.82,.22,.64),heap(-1.10,.84,.24,.65),heap(-1.03,.86,.20,.66),heap(-.99,.84,.10,.68)],
  {smoothSideEdges:[0,1,2,3,4,5,6,7,8,9,10]}));
}

/** A thin cloth panel (the tarp's hanging folds). */
function box2(w: number, len: number): THREE.BufferGeometry {
  return KIT.box(w, len, .02);
}

/** The CV9040C (release 265: `ukrainian` builds the Ukrainian one, ukraineCv90Specs.ts). */
export function buildCv9040CX(P: TankBuilderPort & CvBuilderPort, kit: { readonly ukrainian?: boolean } = {}): void {
  buildCv90Hull(P, { glacisTowCable: false });
  cHullKit(P);
  // the Strf 9040's run, laid with the fleet's shared shoe (the C's own before 269: its quality-aware LOW tread)
  buildCv90RunningGear(P, { trackShoe: buildFleetTrackShoe });
  cv90TurretShell(P, { smoke: GALIX_BANKS });
  // 271 (Main 2026-11-08, the photo packet's 7.0 m overall with the gun): the Bofors at 3.00 m from the trunnion, its
  // muzzle 0.37 m ahead of the nose plate over the published 6.55 m hull (the cv90 authoring 3.12 read 7.27 m, 4 % long);
  // the spec's barrelLenM (ifvReplicaSpecs.ts) carries the same length
  buildCv90Gun(P, 3.00);
  // the coaxial Ksp 58C beside the cannon, out of the cradle cover's right front
  P.addGunExtraDark(KIT.cylZ(0.020, 0.36, 10), -0.15, 0.07, 1.02);
  cv90TurretRoof(P);
  cTurretKit(P);
  P.topY = 1.03;
  if (kit.ukrainian) addUkrainianKit(P);
  P.additionalShadowSources = { hull: ['hullExternalArmor', 'hullHatch'], turret: ['turretExternalArmor', 'turretHatch'] };
  if (P.geometryReceipt) {
    P.hullG.userData.cv9040cConstructionReceipt = Object.freeze({
      id: P.spec.id, firstPartyProceduralOnly: true, externalGeometryLoaded: false,
      baseVehicleBuilder: 'cv90', baseVehicleFrame: 'strf9040-measured-real-size',
      cKit: Object.freeze(['glacis-tiles-4', 'nose-block', 'lamp-boxes', 'turret-side-applique', 'galix-6',
        'ac-housing', 'coax-ksp58c']),
      roofWeaponStation: false, roadWheelsPerSide: 7, frontDrive: true, ukrainianKit: !!kit.ukrainian,
    });
  }
  // 2026-10-09 (owner): the field net and garnish (ghillieFleetSuits.ts)
  addVehicleGhillieSuit(P);
}
