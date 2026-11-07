// The Object 195 (release 269; owner 2026-11-04, "make a new russian tank called object 195 ... because it has a 152 mm
// gun"; DECISIONS "2026-11-04 Russian 152 mm line"): UKBTM and Uralvagonzavod's T-95 of OKR "Sovershenstvovanie-88", built
// from its prototypes' photographs (the first prototype in its workshop, Gur Khan 2018, the owner's second image; the
// second prototype at Donguz, btvt) and the published layout (the 2010 patent: crew capsule forward, carousel amidships,
// engine aft). A long, deep hull on seven road wheels of the T-90's pattern, its glacis over a heavy chin between fender
// boxes, bolted blocks on the skirts' front half and a ledge over their plain rear (the owner's renders, 2026-11-07);
// amidships the tall, square unmanned module ("Угловатая, квадратная башня", Khlopotov) carrying the 2A83 on an
// exposed cradle, the gunner's sight block right of it, the 30 mm 2A42 on the left, the commander's panoramic sight on
// its mast and the first prototype's search radar and Shtandart active protection. First-party procedural geometry:
// Kevin B. Liu (NOTICE.md); sources in docs/references/photos/russia-152-20261104.json.
import * as THREE from 'three';
import { KIT, FITTINGS } from './kit.ts';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import { addHullTub, add30mmCannon, sideSolid } from './russia152Kit.ts';
import { slatPanel } from './leopard2A4KitParts.ts';
import { addShtoraEyes } from './shtora.ts';
import { GUN_2A83, build152Gun } from './gun152.ts';
import { OBJECT195_FRAME as F } from '../russia152Frames.ts';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';
import { antennaPart } from './antennaPart.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

const { box, cylX, cylY, cylZ, torus } = KIT;
const ty = (worldY: number) => worldY - F.ringY;
const tz = (worldZ: number) => worldZ - F.ringZ;

/** The hull's levels (owner 2026-11-07, "massively improve the object 195s hull to be more proportional and look better
 * with its turret"; the owner's renders 3 and 4; critics r12: a deeper side and a blunter, heavier nose): the deck stands
 * 10 cm higher (F.roofY), as high as the 2A83's full depression lets it reach round the turntable (the mantlet's lip at
 * -7 degrees passes 1.74 m over the deck 1.9 m from the ring's axis, so the deck falls away past 3.2 m from it: the
 * glacis, the fender boxes' slopes, the stern's steps). The upper hull side stands at XS; the side armour's upper row
 * stands out to XE (the packet's 3.59 m over it) over the lower skirt's face at XK1, the skirt's inner face at XK0
 * outboard of the track (its edge at 1.69); the skirt's steel foot at FOOT, its rubber band under it. The deck runs flat to
 * GL0, the glacis falls 19 degrees to its lower edge over the chin. */
const R = F.roofY, XS = 1.62, XK0 = 1.715, XK1 = 1.735, XE = 1.80, FOOT = .72, LEDGE = 1.40;
const GL0 = 2.45, NOSE_Z = 3.76, NOSE_Y = 1.24;
const glacisY = (z: number) => R - (z - GL0) * ((R - NOSE_Y) / (NOSE_Z - GL0));
const GLACIS_RAKE = Math.atan2(R - NOSE_Y, NOSE_Z - GL0);
/** The upper row's bolted blocks run from the fender boxes back past the turntable (ERA_Z1 to ERA_Z0) in ten columns, its
 * plain panels and ledge behind them to the stern (SKIRT_Z0); the lower skirt and its band run the whole side to the nose,
 * their foot rising over the sprocket. */
const ERA_Z0 = -1.20, ERA_Z1 = 2.40, ERA_N = 10, ERA_TIER = 1.40, SKIRT_Z0 = -3.88, ROW_FOOT = 1.06;
const skirtFoot = (z: number) => z >= -3.25 ? FOOT : FOOT + (-3.25 - z) * ((1.10 - FOOT) / (-3.25 - SKIRT_Z0));
function along(line: readonly (readonly [number, number])[], z: number): number {
  for (let i = 1; i < line.length; i++) {
    const [z0, y0] = line[i - 1], [z1, y1] = line[i];
    if (z <= z1 || i === line.length - 1) return y0 + (y1 - y0) * Math.min(1, Math.max(0, (z - z0) / (z1 - z0)));
  }
  return line[0][1];
}
/** The fender boxes over the idlers (render 3; critics r12, "a deep, blunt nose block ... a level fender top running
 * forward over the idler"): flat with the deck, then 2 cm proud of the glacis down to its middle, then level over the
 * idler to the front's bevel and a full-depth front face ahead of the track; their floors over the track's top run and round the idler's wrap
 * (.qa-dev/r152/track-top.mjs; .qa-dev/r195hull/track-gap.mjs), then down in front of it. The outer corner keeps under the
 * 2A83's depressed line (1.54 m at the front corner). */
const FENDER_Z0 = 2.34, FENDER_Z1 = 3.93, FENDER_X0 = 1.15, FENDER_X1 = XE, FENDER_LEVEL = 1.38;
const FENDER_TOP: readonly (readonly [number, number])[] = [[FENDER_Z0, R], [2.40, R], [3.30, glacisY(3.30) + .02],
  [3.87, FENDER_LEVEL], [FENDER_Z1, FENDER_LEVEL - .05]];
const FENDER_FLOOR: readonly (readonly [number, number])[] = [[FENDER_Z0, 1.235], [3.52, 1.235], [3.62, 1.17],
  [3.70, 1.08], [3.75, 1.02], [3.80, FOOT], [FENDER_Z1, FOOT]];

/** A solid extruded across x from x0 to x1 (x0 < x1) through a side profile of [z, y] points. */
function xSolid(profile: readonly (readonly [number, number])[], x0: number, x1: number): THREE.BufferGeometry {
  let ring = profile.map(([z, y]): [number, number] => [-z, y]);
  let area = 0;
  for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; area += a[0] * b[1] - b[0] * a[1]; }
  if (area < 0) ring = ring.reverse();
  return KIT.xform(sectionSolid([{ z: x0, ring }, { z: x1, ring }]), 0, 0, 0, 0, Math.PI / 2, 0);
}

/** A bent tube rail through `pts`, its ends capped with balls. */
function tubeRail(P: TankBuilderPort, pts: readonly (readonly [number, number, number])[], r = .016): void {
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)), false, 'centripetal');
  P.addEquipment('hullDetail', new THREE.TubeGeometry(curve, 28, r, 8, false));
  for (const p of [pts[0], pts[pts.length - 1]]) P.addEquipment('hullDetail', KIT.sph(r * 1.2, 8), p[0], p[1], p[2]);
}

function addHull(P: TankBuilderPort): void {
  // [z, roof, bottom, outer, inner, sponson floor]: the deck flat from the stern's steps to the glacis, the glacis down to
  // its lower edge; the sponsons end inside the fender boxes, so ahead of them the tub is the glacis between the boxes.
  // The sponson floors clear the track's top run and its shoes (1.27 m at most on the run: .qa-dev/r152/track-top.mjs;
  // the release gate's track-clip stage)
  addHullTub(P, [
    [-3.95, R - .20, .86, 1.20, 1.04, 1.28],
    [-3.80, R - .10, .66, 1.58, 1.08, 1.28],
    [-3.45, R - .04, .50, XS, 1.10, 1.285],
    [-2.90, R, .45, XS, 1.10, 1.285],
    [2.36, R, .45, XS, 1.10, 1.285],
    [2.37, R, .45, FENDER_X0 + .01, 1.10, 1.285],
    [GL0, R, .45, FENDER_X0 + .01, 1.10, 1.285],
    [3.05, glacisY(3.05), .47, FENDER_X0 + .01, 1.10, 1.20],
    [3.62, glacisY(3.62), .56, FENDER_X0 + .01, 1.06, 1.00],
    [NOSE_Z, NOSE_Y, .70, FENDER_X0 + .01, 1.02, .96],
  ]);
  // the chin (render 4): the heavy lower plate hung ahead of the nose between the tracks, a thick block raked back and
  // narrowing to its foot, two rows of strips across its top
  P.add('hull', KIT.slab([-1.07, .44, 3.87], [1.07, .44, 3.87], [1.07, .44, 3.60], [-1.07, .44, 3.60],
    [-1.15, 1.12, 3.98], [1.15, 1.12, 3.98], [1.15, 1.12, 3.62], [-1.15, 1.12, 3.62]));
  for (const y of [1.02, .96]) for (const x of [-.82, -.27, .27, .82]) {
    P.addEquipment('hullDetail', box(.50, .036, .02), x, y, 3.87 + (y - .44) * (.11 / .68) + .012);
  }
  // the row of bolted blocks over the glacis' lower edge, wrapping the nose down onto the chin
  const noseBlock: [number, number][] = [[3.58, glacisY(3.58) + .045], [3.90, glacisY(3.90) + .045], [3.955, 1.14],
    [3.955, 1.10], [3.74, 1.10], [3.58, glacisY(3.58) - .03]];
  for (let k = 0; k < 8; k++) {
    const x0 = -1.14 + k * .285;
    P.add('hull', xSolid(noseBlock, x0 + .006, x0 + .279));
    for (const dx of [.07, .21]) {
      P.addEquipment('hullDark', cylY(.018, .018, .014, 8), x0 + dx, glacisY(3.72) + .052, 3.72, GLACIS_RAKE, 0, 0);
    }
  }
  // the fender boxes (render 3): a box each side from the deck's edge, its level top over the idler, its bevelled front
  // and its full-depth front face down to the skirts' foot ahead of the track, the outer top edge chamfered
  const fenderZs = [...new Set([...FENDER_TOP, ...FENDER_FLOOR].map(([z]) => z))].sort((p, q) => p - q);
  const fender = fenderZs.map((z): SolidSection => {
    const top = along(FENDER_TOP, z), floor = along(FENDER_FLOOR, z);
    return { z, ring: [[FENDER_X0, floor], [FENDER_X1, floor], [FENDER_X1, top - .04], [FENDER_X1 - .04, top], [FENDER_X0, top]] };
  });
  for (const s of [-1, 1]) {
    P.add('hull', sideSolid(fender, s));
    // the front face's two bolted plates and its lower edge's rubber strip
    for (const y of [1.17, .90]) P.addEquipment('hullDark', box(.56, .012, .012), s * 1.475, y, FENDER_Z1 + .004);
    for (const dx of [-.22, .22]) for (const y of [1.25, 1.04, .82]) {
      P.addEquipment('hullDetail', cylZ(.018, .012, 8), s * 1.475 + dx, y, FENDER_Z1 + .006);
    }
    P.addMudguard('object195-front-flap', 'hullRubber', box(.60, .12, .03), s * 1.475, FOOT - .05, FENDER_Z1 - .02);
  }
  // the crew capsule's three hatches side by side on the deck ahead of the turntable (render 4): each a raised rim, its
  // lid and handle, a hinge at its back, two periscope blocks ahead of it along the glacis' top edge; all under the 2A83's
  // depressed line (1.76 m there)
  const HZ = 2.08;
  const rim = [[.235, R - .01], [.31, R - .01], [.31, R + .03], [.295, R + .045], [.235, R + .045], [.235, R - .01]];
  for (const x of [-.70, 0, .70]) {
    P.add('hull', KIT.lathe(rim, 28), x, 0, HZ);
    P.addHatch('hullDetail', cylY(.225, .235, .035, 22), x, R + .03, HZ);
    P.addEquipment('hullDark', cylY(.10, .10, .006, 16), x, R + .049, HZ);
    P.addEquipment('hullDetail', box(.16, .018, .03), x, R + .054, HZ + .10);
    for (const dx of [-.11, .11]) P.addEquipment('hullDetail', cylX(.026, .09, 10), x + dx, R + .022, HZ - .29);
    P.addEquipment('hullDark', box(.26, .025, .05), x, R + .0125, HZ - .29);
    for (const dx of [-.15, .15]) {
      P.addEquipment('hullDetail', box(.13, .04, .11), x + dx, R + .018, 2.38);
      P.addEquipment('hullGlass', box(.10, .026, .01), x + dx, R + .02, 2.437);
      P.addEquipment('hullDark', box(.135, .006, .115), x + dx, R + .039, 2.38);
    }
  }
  // the deck's plate seams and the collar round the turntable's foot (the deck now stands over the disc's lower half)
  for (const z of [1.30, 2.34]) P.addEquipment('hullDark', box(3.00, .004, .012), 0, R + .002, z);
  const collar = [[1.46, R - .02], [1.56, R - .02], [1.56, R + .04], [1.54, R + .06], [1.46, R + .06], [1.46, R - .02]];
  P.add('hull', KIT.lathe(collar, 64), 0, 0, F.ringZ);
  // the engine deck: the grille field under the bustle, 2 m and more from the ring's axis where the mantlet's lip passes
  // 1.74 m over the deck at full depression (tools/gun-depression-sweep.mjs), its slats, and the louvred covers over the
  // radiators
  P.addEquipment('hullDark', box(2.20, .02, .60), 0, R - .005, -2.62);
  for (let k = 0; k < 5; k++) P.addEquipment('hullDetail', box(2.14, .016, .04), 0, R + .008, -2.36 - k * .13);
  const sternDeck = (z: number) => R - (-2.90 - z) * (.04 / .55), sternRake = -Math.atan2(.04, .55);
  for (const s of [-1, 1]) {
    P.addEquipment('hullDark', box(.60, .02, .46), s * .62, sternDeck(-3.18) - .004, -3.18, sternRake, 0, 0);
    for (let k = 0; k < 4; k++) {
      const z = -3.00 - k * .12;
      P.addEquipment('hullDetail', box(.56, .014, .03), s * .62, sternDeck(z) + .007, z, sternRake, 0, 0);
    }
  }
  // the engine access plates on the stern's last step, their handles, and the fuel fillers at the deck's rear corners
  const sternStep = -Math.atan2(.06, .35), stepY = R - .07;
  for (const s of [-1, 1]) {
    P.addEquipment('hullDetail', box(.72, .014, .30), s * .52, stepY + .006, -3.625, sternStep, 0, 0);
    P.addEquipment('hullDark', box(.14, .012, .03), s * .52, stepY + .016, -3.60, sternStep, 0, 0);
    P.addEquipment('hullDetail', cylY(.06, .06, .012, 14), s * 1.30, R, -2.95);
  }
  // the stern plate: the engine's access panel, its tow hooks, and the number on the upper row's plain panels
  P.addEquipment('hullDark', box(1.30, .30, .04), 0, 1.16, -3.97);
  for (const s of [-1, 1]) P.addEquipment('hullDetail', torus(.06, .018, 10, 6), s * .70, .95, -3.99, Math.PI / 2, 0, 0);
  P.decal('hull', 'number', P.spec.visual.number || '', .26, [XE + .004, 1.26, -2.55], Math.PI / 2);
  P.decal('hull', 'number', P.spec.visual.number || '', .26, [-XE - .004, 1.26, -2.55], -Math.PI / 2);
}

/** The hull's kit (owner 2026-11-07; the owner's renders 3 and 4): the glacis' hinged panels, its two tow-hook recesses
 * and lifting eyes, the bent tube rails up the glacis' edges onto the deck, the guarded headlights standing on the fender
 * boxes' front corners, the stowage bins on the plain sides' ledges and the louvred exhaust over the left one, the stern's
 * bins and the unditching log. Every part on the deck stays under the 2A83's depressed line
 * (.qa-dev/r195hull/gun-envelope.mjs; tools/gun-depression-sweep.mjs). */
function addHullKit(P: TankBuilderPort): void {
  // the glacis' six hinged panels (render 4), 2.5 cm proud of the plate with their hinge knuckles along the top
  const z0 = GL0 + .06, z1 = 3.54, len = Math.hypot(z1 - z0, glacisY(z0) - glacisY(z1)), zc = (z0 + z1) / 2;
  for (let k = 0; k < 6; k++) {
    const x = -.85 + k * .34;
    P.add('hull', box(.32, .025, len), x, glacisY(zc) + .012, zc, GLACIS_RAKE, 0, 0);
    for (const dx of [-.09, .09]) {
      P.addEquipment('hullDark', cylX(.016, .07, 8), x + dx, glacisY(z0 + .04) + .03, z0 + .04);
    }
  }
  // the tow-hook recesses (render 4's dark teardrops) with their hooks, and two lifting eyes
  for (const s of [-1, 1]) {
    const z = 3.18, y = glacisY(z) + .025;
    const recess = KIT.xform(KIT.sph(.12, 14), 0, 0, 0, 0, 0, 0, [.75, .30, 1.35]);
    P.addEquipment('hullDark', recess, s * .51, y, z, GLACIS_RAKE, 0, 0);
    P.addEquipment('hullDetail', torus(.05, .016, 10, 5), s * .51, y + .03, z + .06, GLACIS_RAKE + Math.PI / 2, 0, 0);
    P.addEquipment('hullDetail', torus(.045, .012, 10, 5), s * .17, glacisY(2.80) + .045, 2.80, GLACIS_RAKE, 0, 0);
  }
  // the bent tube rails (renders 3 and 4): from the glacis' lower corner straight up its edge, over the deck's edge and
  // back along the deck beside the hatches, on stand-offs
  for (const s of [-1, 1]) {
    const x = s * 1.07;
    tubeRail(P, [[x, glacisY(3.56) + .042, 3.56], [x, glacisY(3.10) + .042, 3.10], [x, glacisY(2.62) + .042, 2.62],
      [x, R + .018, 2.36], [x, R + .018, 2.10], [x, R + .006, 2.00]]);
    for (const z of [3.36, 2.86]) P.addEquipment('hullDetail', box(.02, .042, .02), x, glacisY(z) + .021, z, GLACIS_RAKE, 0, 0);
  }
  // the headlights (render 3): a round lamp standing on each fender box's level top at its front outer corner, on a
  // base, its lens, a cage of bars round it; under the 2A83's depressed line there (1.57 m)
  for (const s of [-1, 1]) {
    const x = s * 1.56, z = 3.72, y = FENDER_LEVEL + .085;
    P.addEquipment('hullDetail', box(.18, .03, .16), x, FENDER_LEVEL + .015, z - .02);
    P.addEquipment('hullDetail', box(.05, .05, .06), x, FENDER_LEVEL + .045, z - .04);
    P.addEquipment('hullDetail', cylZ(.065, .12, 18), x, y, z);
    P.addEquipment('hullDark', cylZ(.056, .02, 18), x, y, z + .055);
    P.addEquipment('hullGlass', markVehicleNightLens(cylZ(.052, .008, 18), 'headlight'), x, y, z + .063);
    for (const dx of [-.085, .085]) P.addEquipment('hullDetail', box(.014, .15, .014), x + dx, FENDER_LEVEL + .075, z + .08);
    P.addEquipment('hullDetail', box(.184, .014, .014), x, FENDER_LEVEL + .148, z + .08);
    for (const dx of [-.085, .085]) P.addEquipment('hullDetail', box(.014, .014, .16), x + dx, FENDER_LEVEL + .148, z);
  }
  // the stowage bins on the plain sides' ledges (render 3's rear quarter), their lids and straps; the louvred exhaust over
  // the left ledge between them
  const bin = (s: number, z0: number, z1: number) => {
    const zc = (z0 + z1) / 2, l = z0 - z1, x = s * (XS + .07);
    P.addEquipment('hullDetail', box(.14, .21, l), x, LEDGE + .105, zc);
    P.addEquipment('hullDark', box(.15, .025, l + .01), x, LEDGE + .215, zc);
    for (const dz of [-.3, .3]) P.addEquipment('hullDark', box(.146, .215, .03), x, LEDGE + .105, zc + dz * l);
    P.addEquipment('hullDark', box(.02, .04, .08), s * (XS + .145), LEDGE + .17, zc);
  };
  for (const s of [-1, 1]) {
    bin(s, -1.30, -2.10);
    if (s < 0) bin(s, -2.20, -3.00);
    else {
      P.addEquipment('hullDark', box(.03, .18, .78), XS + .012, LEDGE + .12, -2.60);
      for (let k = 0; k < 4; k++) {
        P.addEquipment('hullDetail', box(.05, .03, .76), XS + .03, LEDGE + .05 + k * .042, -2.60, 0, 0, .35);
      }
    }
    bin(s, -3.08, -3.52);
  }
  // the stern: a bin at each corner over the track's end, its rear flap under it, a tail lamp; the unditching log between
  // them below the deck's edge (the 2A83 keeps its full depression over the stern: tools/gun-depression-sweep.mjs)
  for (const s of [-1, 1]) {
    P.addEquipment('hullDetail', box(.48, .28, .30), s * 1.46, 1.36, -4.01);
    P.addEquipment('hullDark', box(.49, .025, .31), s * 1.46, 1.505, -4.01);
    for (const dx of [-.14, .14]) P.addEquipment('hullDark', box(.03, .285, .305), s * 1.46 + dx, 1.36, -4.01);
    P.addEquipment('hullDark', box(.08, .06, .02), s * 1.62, 1.40, -4.165);
    P.addMudguard('object195-rear-flap', 'hullRubber', box(.48, .26, .03), s * 1.46, 1.10, -4.10);
  }
  const log = FITTINGS.unditchingLog({ mats: P.mats, len: 2.20, r: .13, straps: 2, seed: 195 });
  log.position.set(0, 1.36, -4.10);
  P.hullG.add(log);
}

/** The side armour (owner 2026-11-07; render 3; critics r12: "a heavy upper row of bolted blocks standing clearly proud
 * of a lower skirt", the skirt's foot over the road wheels' tops): the lower skirt plate and its rubber band the whole
 * length from the stern to the nose; over it the upper row standing 6.5 cm proud with an undercut foot, from the fender
 * box back past the turntable as bolted blocks in two tiers (the lower upright, the upper leaning in to the deck's edge),
 * behind them as plain panels under a ledge to the stern; their seams, bolt rows and handles. */
function addSkirts(P: TankBuilderPort): void {
  const skirtZs = [SKIRT_Z0, -3.70, -3.50, -3.25, FENDER_Z1];
  const plate = skirtZs.map((z): SolidSection => {
    const y = skirtFoot(z), top = z > ERA_Z1 ? 1.25 : ROW_FOOT + .08;
    return { z, ring: [[XK0, y], [XK1, y], [XK1, top], [XK0, top]] };
  });
  const band = skirtZs.map((z): SolidSection => {
    const y = skirtFoot(z), x0 = XK0 + .005, x1 = XK1 + .008;
    return { z, ring: [[x0, y - .12], [x1, y - .12], [x1, y + .012], [x0, y + .012]] };
  });
  // the upper row's sections: its undercut foot over the skirt, its face, the bolted blocks' upper tier leaning in to the
  // deck's edge or the plain panels' ledge; the inner ledge over the sponson's floor clears the track's top run
  const era: [number, number][] = [[XK0, ROW_FOOT], [XE, ROW_FOOT + .06], [XE, ERA_TIER], [1.64, 1.68], [XS, 1.68],
    [XS, 1.29], [XK0, 1.29]];
  const panels: [number, number][] = [[XK0, ROW_FOOT], [XE, ROW_FOOT + .06], [XE, LEDGE], [XS, LEDGE], [XS, 1.29], [XK0, 1.29]];
  const lip: [number, number][] = [[XK0, ROW_FOOT], [XE, ROW_FOOT + .06], [XE, 1.26], [XK0, 1.26]];
  const col = (ERA_Z1 - ERA_Z0) / ERA_N, upper = Math.atan2(XE - 1.64, 1.68 - ERA_TIER);
  const upLen = Math.hypot(XE - 1.64, 1.68 - ERA_TIER);
  // a point t of the way up the upper tier's face (left side), and its outward normal
  const up = (t: number): [number, number] => [XE - (XE - 1.64) * t, ERA_TIER + (1.68 - ERA_TIER) * t];
  const nx = Math.cos(upper), ny = Math.sin(upper);
  for (const s of [-1, 1]) {
    P.add('hull', sideSolid(plate, s));
    P.add('hullRubber', sideSolid(band, s));
    P.add('hull', sideSolid([{ z: ERA_Z0, ring: era }, { z: ERA_Z1, ring: era }], s));
    P.add('hull', sideSolid([{ z: SKIRT_Z0, ring: panels }, { z: ERA_Z0, ring: panels }], s));
    // the row's foot carried on under the fender box to the nose, so its shadow line runs the hull's length
    P.add('hull', sideSolid([ERA_Z1 - .02, 3.80].map((z): SolidSection => ({ z, ring: lip })), s));
    // the blocks' seams down both tiers, two bolt rows and a handle on each block
    for (let k = 0; k <= ERA_N; k++) {
      const z = ERA_Z0 + k * col;
      if (k > 0 && k < ERA_N) {
        P.addEquipment('hullDark', box(.01, ERA_TIER - ROW_FOOT - .10, .018), s * (XE + .002), (ERA_TIER + ROW_FOOT + .06) / 2, z);
        const [mx, my] = up(.5);
        P.addEquipment('hullDark', box(.01, upLen - .04, .018), s * (mx + nx * .002), my + ny * .002, z, 0, 0, s * upper);
      }
      if (k === ERA_N) break;
      const zc = z + col / 2;
      const [bx, by] = up(.30), [hx, hy] = up(.62);
      for (const dz of [-.10, .10]) {
        for (const y of [ROW_FOOT + .12, ERA_TIER - .07]) P.addEquipment('hullDetail', cylX(.018, .012, 8), s * (XE + .004), y, zc + dz);
        P.addEquipment('hullDetail', cylX(.018, .012, 8), s * (bx + nx * .004), by + ny * .004, zc + dz, 0, 0, s * upper);
      }
      P.addEquipment('hullDetail', box(.014, .014, .10), s * (hx + nx * .03), hy + ny * .03, zc, 0, 0, s * upper);
      for (const dz of [-.05, .05]) {
        P.addEquipment('hullDetail', box(.03, .014, .014), s * (hx + nx * .014), hy + ny * .014, zc + dz, 0, 0, s * upper);
      }
    }
    // the plain panels' seams, their bolt row under the ledge and their handles
    for (const z of [-2.10, -3.00]) {
      P.addEquipment('hullDark', box(.01, LEDGE - ROW_FOOT - .10, .018), s * (XE + .002), (LEDGE + ROW_FOOT + .06) / 2, z);
    }
    for (let z = ERA_Z0 - .15; z > -3.80; z -= .30) {
      P.addEquipment('hullDetail', cylX(.018, .012, 8), s * (XE + .004), LEDGE - .05, z);
    }
    for (const z of [-1.65, -2.55, -3.45]) P.addEquipment('hullDark', box(.012, .05, .16), s * (XE + .004), ROW_FOOT + .15, z);
    // the lower skirt's joint straps, its bolts under the upper row's foot and its handles, the length of the side
    for (const z of [-2.80, -1.50, -.20, 1.10, 2.40, 3.30]) {
      P.addEquipment('hullDetail', box(.012, ROW_FOOT - FOOT - .02, .05), s * (XK1 + .006), (ROW_FOOT + FOOT) / 2, z);
    }
    for (let z = 3.70; z > -3.30; z -= .325) P.addEquipment('hullDetail', cylX(.016, .012, 8), s * (XK1 + .004), ROW_FOOT - .05, z);
    for (const z of [-2.15, -.85, .45, 1.75]) P.addEquipment('hullDark', box(.012, .045, .15), s * (XK1 + .004), FOOT + .10, z);
  }
}

/** The road wheels' radius (owner 2026-11-07, round 10's critics: "the road wheels read small and widely spaced"; the
 * references' seven wheels nearly touching): 42 cm on the T-90's stations, 2 cm apart. */
const WHEEL_R = .42;

function addRunningGear(P: TankBuilderPort): void {
  // seven road wheels a side on the T-90's pattern (btvt: «катки аналогичны применяемым на танке Т-90»), larger than the
  // T-90's, torsion bars, the sprocket aft and the idler forward; the T-90's own shoe and roller measures
  // (profiles/t90AwX.ts)
  P.gear = KIT.buildRunningGear(P, {
    style: 'rubber', wheelR: WHEEL_R, wheelY: WHEEL_R + .0544, wheelW: .4106,
    wheelZs: [-2.58, -1.72, -.86, 0, .86, 1.72, 2.58], xc: 1.4426, trackW: .4942, trackTh: .030,
    idler: { z: 3.38, y: .8773, r: .2617, trackR: .251 }, sprocket: { z: -3.42, y: .8285, r: .385, trackR: .347 },
    rollers: [{ z: -2.15, y: 1.07865, r: .12335 }, { z: -.43, y: 1.07865, r: .12335 }, { z: 1.29, y: 1.07865, r: .12335 }],
    rollerR: .12335, returnRollerWidthM: .0982, returnRollerInsetM: .1086, topY: 1.221, botY: .045,
    arms: true, coveredTop: true, paintedEnds: true, sprocketDepthScale: .82, idlerDepthScale: .82, linkPitchM: .138,
    trackShoeDimensions: { padHeight: .036, grouserHeight: .010, webHeight: .018, hornHeight: .040, pinRadius: .009, pinCentreY: 0 },
  });
  addSkirts(P);
  // a slat cage across the stern plate under the log, on posts from the plate
  for (let k = 0; k < 3; k++) P.addEquipment('hullDetail', box(2.20, .03, .016), 0, .84 + k * .12, -4.10);
  for (const x of [-1.05, -.35, .35, 1.05]) {
    P.addEquipment('hullDetail', box(.03, .40, .03), x, 1.00, -4.10);
    for (const y of [.88, 1.12]) P.addEquipment('hullDark', box(.025, .025, .14), x, y, -4.03);
  }
}

/** The module's turntable (owner 2026-11-05: "the object 195 should also be on a rotating disc thing"; the second
 * prototype at Donguz and the owner's renders): a wide armoured disc on the ring, and on it a thick drum ring, open ahead
 * for the gun's cradle, a pedestal inside it carrying the module, the Shtandart's launcher clusters on the drum's flanks
 * and lamp domes across its front. All of it turns with the module. */
function addTurntable(P: TankBuilderPort): void {
  P.add('turret', KIT.lathe([[0, 0], [1.30, 0], [1.34, .04], [1.34, .13], [1.27, .20], [1.10, .22], [0, .22]], 56));
  P.addEquipment('turretDark', torus(1.335, .012, 56, 4), 0, .085, 0);
  // the drum ring: 300 degrees of it round the back, its ends capped either side of the gun's 60-degree opening
  const OPEN = Math.PI / 6;
  P.add('turret', new THREE.LatheGeometry([[1.10, .20], [1.40, .20], [1.43, .24], [1.43, .40], [1.39, .44], [1.10, .44], [1.10, .20]]
    .map(([r, y]) => new THREE.Vector2(r, y)), 50, OPEN, Math.PI * 2 - 2 * OPEN));
  for (const s of [-1, 1]) P.add('turret', box(.35, .25, .02), s * Math.sin(OPEN) * 1.265, .32, Math.cos(OPEN) * 1.265 - .01, 0, s * OPEN, 0);
  P.add('turret', cylY(1.10, 1.10, .24, 48), 0, .32, 0);
  // the drum's top seam and its foot bead
  P.addEquipment('turretDark', torus(1.432, .010, 50, 4), 0, .40, 0);
  // the Shtandart's launchers (critics, round 9: the even ring of tubes read as a cogwheel): four clusters of three short
  // tubes on bosses close to the drum's rim on its flanks, under the module's lower tier, and across its front either side
  // of the gun's opening four lamp domes (the first prototype's photograph)
  for (const s of [-1, 1]) {
    for (const deg of [70, 102]) {
      const a = s * deg * Math.PI / 180, x = Math.sin(a), z = Math.cos(a), cx = Math.cos(a), cz = -Math.sin(a);
      P.addEquipment('turretDetail', box(.32, .14, .10), x * 1.46, .32, z * 1.46, 0, a, 0);
      for (const t of [-.10, 0, .10]) {
        P.addEquipment('turretDetail', cylZ(.045, .14, 12), x * 1.53 + cx * t, .335, z * 1.53 + cz * t, -.21, a, 0);
        P.addEquipment('turretDark', cylZ(.036, .01, 12), x * 1.60 + cx * t, .35, z * 1.60 + cz * t, -.21, a, 0);
      }
    }
    for (const deg of [37, 48]) {
      const a = s * deg * Math.PI / 180, x = Math.sin(a), z = Math.cos(a);
      P.addEquipment('turretDetail', cylZ(.10, .05, 16), x * 1.445, .32, z * 1.445, 0, a, 0);
      P.addEquipment('turretGlass', KIT.sph(.075, 14), x * 1.47, .32, z * 1.47);
    }
  }
}

/** The module's levels (turret frame): its floor and roof (the roof 2.98 m over the ground: the 2A42's deck), the core's
 * half-width, the bustle's, the line between the module's two tiers, how far the armour round the core stands further out
 * than round round 2's narrower core (owner 2026-11-06, "use the old version of the turret just make it wider": W), and
 * the bustle rack (its sides, floor rail, low top rail, the tall cage's top, its front and tail). */
const TOP = 1.38, LOW = .42, HC = 1.02, HB = .90, TIER = .84, W = .12;
const RACK = { x: 1.12, y0: .58, y1: 1.24, cage: 1.58, z0: -1.22, z1: -2.40 } as const;

/** A hard-edged core station (owner 2026-11-06, "squarish": flat faces and crisp bevels, not the old body's broad
 * rounded corners): a vertical wall `half` out from the floor to the shoulder, then the upper wall raked in to the roof's
 * edge `roofHalf` out (the T-14's tumblehome), a 4 cm bevel along the roof's edge and a 5 cm one along the floor's. */
function coreRing(half: number, low: number, top: number, shoulder: number, roofHalf: number): [number, number][] {
  return [[-half + .05, low], [half - .05, low], [half, low + .05], [half, shoulder], [roofHalf + .04, top - .04],
    [roofHalf, top], [-roofHalf, top], [-roofHalf - .04, top - .04], [-half, shoulder], [-half, low + .05]];
}
/** The core's shoulder and roof edge, and its wall's distance out at height y. */
const SHOULDER = 1.02, ROOF_HALF = .82;
const coreX = (y: number) => y <= SHOULDER ? HC : HC - (y - SHOULDER) * (HC - ROOF_HALF - .04) / (TOP - .04 - SHOULDER);

/** A bar between two corners, axis-aligned (frames, rails, posts, brackets). */
function bar(P: TankBuilderPort, slot: string, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
  P.addEquipment(slot, box(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)), (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
}

/** A TShU laser-warning head: a squat drum with its dark sensor band and a bevelled cap, on a post from `foot`. */
function warningHead(P: TankBuilderPort, x: number, foot: number, z: number, post: number): void {
  P.addEquipment('turretDetail', cylY(.035, .035, .015, 10), x, foot + .0075, z);
  P.addEquipment('turretDetail', cylY(.016, .016, post, 8), x, foot + post / 2, z);
  const y = foot + post;
  P.addEquipment('turretDetail', cylY(.05, .05, .05, 14), x, y + .025, z);
  P.addEquipment('turretDark', cylY(.053, .053, .035, 14), x, y + .068, z);
  P.addEquipment('turretDetail', cylY(.03, .05, .025, 14), x, y + .098, z);
}

/** A cluster of the Shtora's grenade launchers (the owner's renders 3 and 4: 2 x 2 and 3 x 2 groups of round tubes on
 * the cheeks and flanks under the upper armour): `rows` banks of `cols` tubes stacked on a mounting block, the block's
 * face square to the tubes, aimed `aim` radians off the bow towards side s. */
function launcherCluster(P: TankBuilderPort, s: number, x: number, y: number, z: number, cols: number, rows: number, aim: number, seed: number): void {
  const pitch = .12, yaw = s * aim, back = .19;
  P.addEquipment('turretDetail', box(cols * pitch + .03, rows * pitch + .03, .18), x - Math.sin(yaw) * back, y + (rows - 1) * pitch / 2, z - Math.cos(yaw) * back, 0, yaw, 0);
  for (let r = 0; r < rows; r++) {
    const tubes = FITTINGS.smokeBank({ mats: P.mats, count: cols, r: .048, len: .22, pitch: -.18, splay: 0, arc: 0, spacing: pitch, base: false, seed: seed + r });
    tubes.position.set(x, y + r * pitch, z);
    tubes.rotation.y = yaw;
    P.turretG.add(tubes);
  }
}

/** A flank wedge's stations (left side), `k` 0 at its ends and 1 at its middle: the lower layer from the tier line out
 * along its underside and up its lower facet to the ridge, a narrow ledge over the ridge and in to the core's wall; the
 * upper layer set in on that ledge, its own outer face, its top facet rising to the core's raked wall under the roof's
 * edge. */
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
function flankLower(k: number): [number, number][] {
  return [[.80, TIER], [lerp(.94, .98, k) + W, TIER], [lerp(1.02, 1.14, k) + W, lerp(.94, .98, k)], [lerp(1.01, 1.12, k) + W, lerp(1.02, 1.06, k)], [.80, lerp(1.06, 1.08, k)]];
}
function flankUpper(k: number): [number, number][] {
  return [[.78, 1.04], [lerp(.94, 1.00, k) + W, 1.04], [lerp(.96, 1.02, k) + W, lerp(1.08, 1.10, k)], [lerp(.90, .94, k) + W, lerp(1.18, 1.22, k)], [.76, lerp(1.28, 1.30, k)]];
}

/** A small sensor box with a glass face towards `yaw` (the renders' corner cameras and vision blocks). */
function sensorBox(P: TankBuilderPort, x: number, y: number, z: number, yaw: number): void {
  P.addEquipment('turretDetail', box(.12, .09, .10), x, y, z, 0, yaw, 0);
  P.addEquipment('turretGlass', box(.08, .05, .01), x + Math.sin(yaw) * .052, y + .005, z + Math.cos(yaw) * .052, 0, yaw, 0);
  P.addEquipment('turretDark', box(.13, .012, .05), x + Math.sin(yaw) * .04, y + .05, z + Math.cos(yaw) * .04, 0, yaw, 0);
}

/** The core, the bustle, and the module's two tiers (owner 2026-11-06, "we need more layers to the turret and match the
 * photo a lot better"; the owner's renders 3 and 4): a square-sectioned core over the breech run with a raked upper wall
 * and the narrower bustle stepped in behind it; on the gun line, the lower tier's cheek blocks either side of the gun's
 * slot (the Shtora's dazzlers on their noses, launcher clusters on their flanks); over them the upper tier's chiselled
 * armour wedges, each a pyramid of facets bulging out over the cheek and narrowing to a nose, stepped back and up from the
 * lower tier so each layer casts its own edge; and the lintel over the slot. */
function addModuleCore(P: TankBuilderPort): void {
  const core = coreRing(HC, LOW, TOP, SHOULDER, ROOF_HALF);
  P.add('turret', sectionSolid([{ z: -1.30, ring: core }, { z: .62, ring: core }]));
  P.add('turret', sectionSolid([
    { z: -2.12, ring: coreRing(HB - .08, .68, TOP - .18, SHOULDER - .04, ROOF_HALF - .20) },
    { z: -1.96, ring: coreRing(HB, .60, TOP, SHOULDER, ROOF_HALF - .10) },
    { z: -1.40, ring: coreRing(HB, .48, TOP, SHOULDER, ROOF_HALF - .10) },
    { z: -1.26, ring: coreRing(HB, .45, TOP, SHOULDER, ROOF_HALF - .10) },
  ]));
  const lowerCheek: SolidSection[] = [
    { z: .60, ring: [[.40, LOW + .02], [.96 + W, LOW + .02], [.98 + W, LOW + .04], [.98 + W, TIER + .02], [.40, TIER + .02]] },
    { z: 1.30, ring: [[.40, LOW + .04], [.82 + W, LOW + .04], [.86 + W, LOW + .08], [.86 + W, TIER + .02], [.40, TIER + .02]] },
    { z: 1.40, ring: [[.40, LOW + .08], [.74 + W, LOW + .08], [.78 + W, LOW + .12], [.78 + W, TIER - .02], [.40, TIER - .02]] },
  ];
  // the upper wedge: a pyramid of facets bulging over the lower block and closing to a narrow nose over the gun's slot,
  // its top 10 cm under the roof at the core's face (the roof tier steps up behind it)
  const upperCheek: SolidSection[] = [
    { z: .58, ring: [[.40, TIER], [.98 + W, TIER], [1.04 + W, .92], [1.04 + W, 1.14], [.90 + W, 1.28], [.40, 1.28]] },
    { z: .90, ring: [[.40, TIER + .02], [1.00 + W, TIER + .02], [1.16 + W, .98], [1.10 + W, 1.14], [.82 + W, 1.24], [.40, 1.24]] },
    { z: 1.36, ring: [[.40, TIER + .12], [.52, TIER + .12], [.64, .99], [.64, 1.03], [.54, 1.06], [.40, 1.06]] },
  ];
  for (const s of [-1, 1]) {
    P.add('turret', sideSolid(lowerCheek, s));
    P.add('turret', sideSolid(upperCheek, s));
    // the lower block's nose bolts and a lifting eye on the upper wedge's crown
    for (const y of [.56, .76]) P.addEquipment('turretDark', cylZ(.02, .016, 6), s * .45, y, 1.405);
    P.addEquipment('turretDetail', torus(.035, .01, 10, 5), s * .72, 1.255, .80);
    // the vision blocks in the core's face over the upper wedge (v10)
    P.addEquipment('turretDark', box(.22, .07, .02), s * .62, 1.33, .628);
    P.addEquipment('turretGlass', box(.18, .04, .01), s * .62, 1.33, .637);
  }
  // the roof's plate seams (flush: the 2A42 sweeps the roof's right and front)
  for (const x of [-.24, .24]) P.addEquipment('turretDark', box(.012, .003, 1.84), x, TOP + .0015, -.34);
  for (const z of [.10, -.75]) P.addEquipment('turretDark', box(1.60, .003, .012), 0, TOP + .0015, z);
  // the lintel over the gun's slot (down to the gun block at full elevation), from the core's face to the cheeks' noses,
  // its front raked back, and its brow
  const lintel = (top: number): [number, number][] => [[-.40, 1.06], [.40, 1.06], [.40, top], [-.40, top]];
  P.add('turret', sectionSolid([{ z: .60, ring: lintel(TOP) }, { z: 1.14, ring: lintel(TOP) }, { z: 1.36, ring: lintel(1.17) }]));
  P.addEquipment('turretDetail', box(.84, .05, .10), 0, 1.08, 1.35);
}

/** The flanks' two tiers (render 4's right flank, render 3's left): on the upper tier two chiselled wedges a side, each
 * bulging to a ridge at its middle and narrowing to both ends, the gap between them carrying the Shtandart's sensor dome
 * on its arm; on the left the front wedge's place taken by render 3's mesh grille box under the sight tower; on the lower
 * tier, in their shadow, the launcher clusters and the number. Under the 2A42's lines on the right (its depression table:
 * the wedges top out 13 cm or more under its lowest barrel line). */
function addModuleFlanks(P: TankBuilderPort): void {
  const layer = (ring: (k: number) => [number, number][], z0: number, z1: number): SolidSection[] =>
    [{ z: z0, ring: ring(0) }, { z: (z0 + z1) / 2, ring: ring(1) }, { z: z1, ring: ring(0) }];
  const wedge = (s: number, z0: number, z1: number) => {
    P.add('turret', sideSolid(layer(flankLower, z0, z1), s));
    P.add('turret', sideSolid(layer(flankUpper, z0 + .06, z1 - .06), s));
  };
  for (const s of [-1, 1]) {
    if (s < 0) wedge(s, -.30, .54);
    else {
      // the mesh grille box (render 3): a box off the core's wall, its outer face a framed mesh over a dark recess
      P.add('turret', box(.16, .38, .74), .94 + W, TIER + .21, .13);
      P.addEquipment('turretDark', box(.012, .30, .64), 1.022 + W, TIER + .21, .13);
      for (let k = 0; k <= 10; k++) P.addEquipment('turretDetail', box(.012, .30, .012), 1.032 + W, TIER + .21, -.19 + k * .064);
      for (let k = 0; k <= 4; k++) P.addEquipment('turretDetail', box(.012, .012, .64), 1.034 + W, TIER + .07 + k * .07, .13);
      for (const y of [TIER + .02, TIER + .40]) P.addEquipment('turretDetail', box(.03, .03, .74), 1.03 + W, y, .13);
      for (const z of [-.23, .49]) P.addEquipment('turretDetail', box(.03, .38, .03), 1.03 + W, TIER + .21, z);
      // a corner camera on the grille box's front corner (v10)
      sensorBox(P, 1.08 + W, TIER + .40 + .045, .44, Math.PI * .25);
    }
    wedge(s, -1.22, -.36);
    // bolt rows along the lower layers' ridges
    for (const [z0, z1] of [[-1.22, -.36], [-.30, .54]] as const) if (s < 0 || z0 < -1) {
      for (const t of [.30, .42, .58, .70]) {
        const k = 1 - Math.abs(t - .5) * 2, z = lerp(z0, z1, t);
        P.addEquipment('turretDark', cylX(.016, .02, 6), s * (lerp(1.015, 1.13, k) + W + .004), lerp(.98, 1.02, k), z);
      }
    }
    // the Shtandart's sensor dome on its arm in the gap between the wedges
    bar(P, 'turretDark', s * (HC - .01), .97, -.35, s * (1.08 + W), 1.01, -.31);
    P.addEquipment('turretDetail', cylX(.075, .06, 16), s * (1.09 + W), .99, -.33);
    P.addEquipment('turretGlass', KIT.sph(.07, 14, Math.PI / 2), s * (1.12 + W), .99, -.33, 0, 0, s * -Math.PI / 2);
    // the lower tier's launcher clusters: a 2 x 2 on the cheek's flank, a 3 x 2 and a 2 x 2 on the module's flank
    launcherCluster(P, s, s * (.99 + W), .55, 1.06, 2, 2, .80, 1950 + s * 10);
    launcherCluster(P, s, s * (1.00 + W + .02), .55, .26, 3, 2, 1.15, 1960 + s * 10);
    launcherCluster(P, s, s * (1.00 + W + .02), .55, -.86, 2, 2, 1.25, 1970 + s * 10);
    // the cable conduit along the lower tier's top on its clamps, under the wedges (v10)
    P.addEquipment('turretDark', cylZ(.022, 1.86, 10), s * (HC + .03), TIER - .04, -.34);
    for (const z of [-1.20, -.62, -.20, .14, .52]) P.addEquipment('turretDetail', box(.05, .05, .03), s * (HC + .02), TIER - .04, z);
  }
  // a row of three launchers on the left upper wedge's crown, aimed ahead and out (v10's row on its left cheek)
  launcherCluster(P, 1, .80, 1.20, 1.04, 3, 1, .35, 1980);
  P.decal('turret', 'number', P.spec.visual.number || '', .26, [HC + .006, .66, -.30], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', .26, [-HC - .006, .66, -.30], -Math.PI / 2);
}

/** The bustle's sides and rack (render 3's angular bustle on the left, render 4's tall slat cage on the right): on the
 * left a chiselled armour block down the bustle's flank, its top edge and tail chamfered and its underside rising aft; on
 * the right a low bay carrying the Shtandart's radar panel, then a tall open cage of square tube and slats round the
 * bustle's after quarter, its top framed across to the sight box on the roof; across the tail a low rack with cans. */
function addModuleRack(P: TankBuilderPort): void {
  const { x: RX, y0: Y0, y1: Y1, cage: YC, z0: Z0, z1: Z1 } = RACK, T = .04;
  // the left bustle armour, its radar panel, a handle and a louvre strip
  P.add('turret', sectionSolid([
    { z: -2.12, ring: [[.60, .82], [.82 + W, .82], [.88 + W, .88], [.88 + W, 1.02], [.80 + W, 1.14], [.60, 1.14]] },
    { z: -1.80, ring: [[.70, .60], [.94 + W, .60], [1.02 + W, .70], [1.02 + W, 1.10], [.92 + W, 1.26], [.70, 1.26]] },
    { z: -1.26, ring: [[.70, .56], [.94 + W, .56], [1.02 + W, .66], [1.02 + W, 1.10], [.92 + W, 1.26], [.70, 1.26]] },
  ]));
  P.addEquipment('turretDetail', box(.03, .40, .36), RX + .03, .88, -1.48);
  P.addEquipment('turretDark', box(.012, .32, .28), RX + .05, .88, -1.48);
  P.addEquipment('turretDark', box(.012, .012, .52), RX + .024, 1.08, -1.54);
  P.addEquipment('turretDark', box(.012, .04, .16), RX + .026, .80, -1.70);
  for (let k = 0; k < 3; k++) P.addEquipment('turretDetail', box(.02, .012, .16), RX + .028, .90 + k * .035, -1.70);
  // the stowage bin on the left bustle's flank on two brackets (v10)
  P.addEquipment('turretDetail', box(.12, .28, .30), RX + .02, .90, -1.98);
  P.addEquipment('turretDark', box(.13, .02, .26), RX + .02, 1.045, -1.98);
  for (const z of [-1.88, -2.08]) bar(P, 'turretDark', RX - .10, .76, z - .02, RX - .04, .80, z + .02);
  // the right side: the low front bay and its radar panel, the tall cage behind it
  // (the cage starts at z -1.95: its front post at x -1.12 stays outside the 2A42's arc, ending it at -162 degrees)
  const ZC = -1.95;
  const posts: [number, number][] = [[Z0, Y1], [ZC, YC], [-2.18, YC], [Z1, YC]];
  for (const [z, top] of posts) bar(P, 'turretDetail', -RX - T / 2, Y0, z - T / 2, -RX + T / 2, top, z + T / 2);
  bar(P, 'turretDetail', -RX - T / 2, Y0 - T / 2, Z1, -RX + T / 2, Y0 + T / 2, Z0);
  bar(P, 'turretDetail', -RX - T / 2, Y1 - T / 2, ZC, -RX + T / 2, Y1 + T / 2, Z0);
  bar(P, 'turretDetail', -RX - T / 2, YC - T / 2, Z1, -RX + T / 2, YC + T / 2, ZC);
  P.add('turret', box(.05, .42, .40), -RX - .01, .92, -1.50);
  P.addEquipment('turretDark', box(.012, .32, .30), -RX - .04, .92, -1.50);
  const slats = [.70, .815, .93, 1.045, 1.16, 1.275, 1.39, 1.505];
  for (const y of slats) bar(P, 'turretDetail', -RX - .008, y - .015, Z1, -RX + .008, y + .015, ZC);
  // the cage's tail face to x -0.40 and its top frame across to the sight box
  bar(P, 'turretDetail', -.42, Y0, Z1 - T / 2, -.38, YC, Z1 + T / 2);
  bar(P, 'turretDetail', -RX, YC - T / 2, Z1 - T / 2, -.38, YC + T / 2, Z1 + T / 2);
  for (const y of slats) if (y > Y1) bar(P, 'turretDetail', -RX, y - .015, Z1 - .008, -.40, y + .015, Z1 + .008);
  bar(P, 'turretDetail', -RX, YC - .015, ZC - .035, -.50, YC + .015, ZC - .005);
  bar(P, 'turretDetail', -.53, TOP - .03, ZC - .035, -.50, YC, ZC - .005);
  // the brackets from the bustle's flank, the floor bars inside the cage and two bins on them
  for (const z of [-1.70, -2.05]) for (const y of [Y0, Y1 - .04]) bar(P, 'turretDark', -(HB - .01), y - .02, z - .02, -(RX - T / 2), y + .02, z + .02);
  for (const x of [.96, 1.04]) bar(P, 'turretDetail', -(x - .015), Y0 - .015, Z1, -(x + .015), Y0 + .015, -1.30);
  for (const z of [-2.06, -2.30]) {
    P.addEquipment('turretDetail', box(.16, .30, .20), -1.01, Y0 + .165, z);
    P.addEquipment('turretDark', box(.17, .02, .16), -1.01, Y0 + .31, z);
  }
  // the left tail bay behind the armour
  for (const z of [-2.12, Z1]) bar(P, 'turretDetail', RX - T / 2, Y0, z - T / 2, RX + T / 2, Y1, z + T / 2);
  for (const y of [Y0, Y1, .86, 1.04]) bar(P, 'turretDetail', RX - T / 2, y - .015, Z1, RX + T / 2, y + .015, -2.12);
  // the tail: its rails, posts and slats across, its floor behind the bustle, a row of cans on it
  for (const y of [Y0, Y1]) bar(P, 'turretDetail', -RX, y - T / 2, Z1 - T / 2, RX, y + T / 2, Z1 + T / 2);
  bar(P, 'turretDetail', .38, Y0, Z1 - T / 2, .42, Y1, Z1 + T / 2);
  for (const x of [-.40, .40]) for (const y of [Y0, 1.10]) bar(P, 'turretDark', x - .02, y - .02, Z1, x + .02, y + .02, -2.10);
  for (const y of [.72, .86, 1.00, 1.12]) bar(P, 'turretDetail', -RX, y - .015, Z1 - .008, RX, y + .015, Z1 + .008);
  for (const z of [-2.20, -2.32]) bar(P, 'turretDetail', -RX, Y0 - .015, z - .015, RX, Y0 + .015, z + .015);
  for (const x of [-.62, -.22, .22, .62]) {
    P.addEquipment('turretDetail', box(.16, .34, .20), x, Y0 + .185, -2.26);
    P.addEquipment('turretDark', box(.05, .03, .06), x - .03, Y0 + .37, -2.26);
  }
}

/** The bustle's own fittings: the ventilation grille on its right flank (seen through the cage), the loading door in its
 * tail, the roof's loading hatch, a fan housing, the bolted roof plates, render 3's T-shaped periscope, the grab rail on
 * the left, the wind sensor and the antennas. */
function addModuleBustleFittings(P: TankBuilderPort): void {
  P.addEquipment('turretDark', box(.02, .26, .62), -(HB + .005), .86, -1.72);
  for (let k = 0; k < 6; k++) P.addEquipment('turretDetail', box(.03, .26, .02), -(HB + .012), .86, -1.99 + k * .108);
  P.addEquipment('turretDark', box(.80, .36, .02), 0, .94, -2.125);
  for (const x of [-.36, .36]) P.addEquipment('turretDetail', box(.03, .30, .03), x, .94, -2.14);
  P.addEquipment('turretDetail', box(.60, .03, .52), -.26, TOP + .015, -1.10);
  P.addEquipment('turretDark', box(.60, .01, .02), -.26, TOP + .033, -1.35);
  P.addEquipment('turretDetail', box(.36, .10, .36), .36, TOP + .05, -1.62);
  for (let k = 0; k < 5; k++) P.addEquipment('turretDark', box(.30, .012, .03), .36, TOP + .104, -1.74 + k * .06);
  for (const [x, z, w, d] of [[.50, -.20, .40, .46], [.45, -1.22, .40, .34]] as const) {
    P.addEquipment('turretDetail', box(w, .016, d), x, TOP + .008, z);
    for (const dx of [-1, 1]) for (const dz of [-1, 1]) P.addEquipment('turretDark', cylY(.012, .012, .012, 6), x + dx * (w / 2 - .04), TOP + .02, z + dz * (d / 2 - .04));
  }
  // render 3's T-shaped periscope on the roof's left
  P.addEquipment('turretDetail', cylY(.05, .06, .03, 12), .22, TOP + .015, -.72);
  P.addEquipment('turretDetail', cylY(.03, .03, .22, 10), .22, TOP + .14, -.72);
  P.addEquipment('turretDetail', box(.16, .06, .07), .22, TOP + .28, -.72);
  P.addEquipment('turretGlass', box(.10, .03, .01), .22, TOP + .28, -.684);
  for (const z of [-.30, -.80, -1.30]) bar(P, 'turretDetail', .70, TOP, z - .012, .725, TOP + .08, z + .012);
  bar(P, 'turretDetail', .70, TOP + .08, -1.31, .725, TOP + .105, -.29);
  // the corner cameras at the roof's rear corners (v10)
  sensorBox(P, .78, TOP + .045, -1.22, Math.PI * .75);
  sensorBox(P, -.66, TOP + .045, -1.90, -Math.PI * .75);
  P.addEquipment('turretDetail', cylY(.03, .04, .03, 10), .45, TOP + .031, -1.30);
  P.addEquipment('turretDetail', cylY(.012, .014, .40, 8), .45, TOP + .24, -1.30);
  P.addEquipment('turretDetail', cylY(.035, .035, .05, 12), .45, TOP + .465, -1.30);
  P.addEquipment('turretDark', box(.012, .06, .10), .45, TOP + .50, -1.36);
  // the whips on the bustle's roof (their tips 3.76 m over the ground, as before)
  for (const [x, h] of [[.48, .70], [-.48, .55]]) {
    P.addEquipment('turretDetail', antennaPart(cylY(.04, .05, .08, 12)), x, TOP + .04, -1.88);
    P.addEquipment('turretDark', antennaPart(cylY(.009, .012, h, 8)), x, TOP + .08 + h / 2, -1.88);
  }
}

/** The roof tier's sights (renders 3 and 4: boxes with glass faces, small heads on posts): the gunner's sight box on its
 * post at the front left, glass on its front and outer faces, its armoured shutter hinged open at the brow, an open slat
 * cage round its outer flank and back and a small sight head on a post on its roof; the commander's sight at the rear
 * right inside the tall cage's top frame, a box with glass faces carrying the panoramic head on its post. */
function addModuleSights(P: TankBuilderPort): void {
  const tx = .58, tz = .48, th = .52;
  P.addEquipment('turretDetail', box(.30, .04, .36), tx, TOP + .02, tz);
  P.add('turret', box(.22, .14, .22), tx, TOP + .10, tz);
  const head: [number, number][] = [[.34, TOP + .16], [.82, TOP + .16], [.82, TOP + .44], [.76, TOP + .50], [.40, TOP + .50], [.34, TOP + .44]];
  P.add('turret', sectionSolid([{ z: .24, ring: head }, { z: .72, ring: head }]));
  P.addEquipment('turretDark', box(.36, .22, .02), tx, TOP + .33, .725);
  P.addEquipment('turretGlass', box(.30, .16, .012), tx, TOP + .33, .733);
  P.addEquipment('turretDark', box(.02, .20, .32), .825, TOP + .31, .48);
  P.addEquipment('turretGlass', box(.012, .15, .26), .832, TOP + .31, .48);
  P.addEquipment('turretDetail', box(.42, .30, .03), tx, TOP + th + .10, tz + .32, -1.05, 0, 0);
  for (const s of [-1, 1]) P.addEquipment('turretDark', box(.02, .05, .18), tx + s * .20, TOP + th, tz + .26, -.55, 0, 0);
  slatPanel(P, 'turret', { sx: 1, faceX: .82, standM: .11, z0: .14, z1: .72, y0: TOP + .02, y1: TOP + .50, rails: 6 });
  for (let k = 0; k < 6; k++) bar(P, 'turretDetail', .36, TOP + .05 + k * .084 - .015, .142, .93, TOP + .05 + k * .084 + .015, .158);
  bar(P, 'turretDetail', .345, TOP, .135, .375, TOP + .50, .165);
  P.addEquipment('turretDetail', cylY(.025, .03, .14, 10), .64, TOP + .57, .36);
  P.addEquipment('turretDetail', box(.16, .10, .15), .64, TOP + .69, .38);
  P.addEquipment('turretGlass', box(.10, .05, .01), .64, TOP + .70, .456);
  // the commander's sight box at the rear right (render 4), its glass faces, its post and panoramic head
  const cx = -.42, cz = -1.60;
  P.add('turret', box(.40, .30, .40), cx, TOP + .15, cz);
  P.addEquipment('turretDark', box(.30, .16, .02), cx, TOP + .17, cz + .205);
  P.addEquipment('turretGlass', box(.24, .11, .01), cx, TOP + .17, cz + .214);
  P.addEquipment('turretDark', box(.02, .16, .28), cx - .205, TOP + .17, cz);
  P.addEquipment('turretGlass', box(.01, .11, .22), cx - .214, TOP + .17, cz);
  P.addEquipment('turretDetail', cylY(.06, .08, .14, 14), cx, TOP + .37, cz);
  P.add('turret', cylY(.14, .14, .18, 18), cx, TOP + .53, cz);
  P.addEquipment('turretDark', cylY(.145, .145, .03, 18), cx, TOP + .635, cz);
  for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    P.addEquipment('turretGlass', box(.10, .07, .012), cx + Math.sin(a) * .142, TOP + .54, cz + Math.cos(a) * .142, 0, a, 0);
  }
}

/** Shtora-1 (owner 2026-11-06: "that object 195 should have shtora"): the two OTShU-1-7 dazzlers on the lower cheek
 * blocks' noses either side of the gun (the fleet's emitter, profiles/shtora.ts) and the TShU-1-11 laser-warning heads:
 * the front pair on the upper wedges' noses (under the 2A42's lines by 10 cm), the rear pair on the left bustle armour and
 * on the tall cage's top. Its grenade launchers are the clusters on the flanks (addModuleFlanks). */
function addModuleShtora(P: TankBuilderPort): void {
  addShtoraEyes({ mats: P.mats, turretG: P.turretG, disposables: P.disposables,
    add: (slot, geometry, x, y, z) => P.addEquipment(slot, geometry, x, y, z),
  }, { x: .57, y: .66, z: 1.44, scale: 1.15, round: true, kit: true });
  for (const s of [-1, 1]) warningHead(P, s * .58, 1.11, 1.20, .03);
  warningHead(P, .90, 1.25, -1.66, .12);
  warningHead(P, -RACK.x, RACK.cage + .02, -2.18, .06);
}

/** The unmanned module on its turntable (owner 2026-11-05, "the object 195 ... turrets look terrible"; 2026-11-06, "too
 * boxy instead of squarish and technical skeletal like the t14 152 ... should have shtora", then "we need more layers to
 * the turret and match the photo a lot better"): the core and its bustle in two tiers of armour, the flanks' wedges and
 * launcher clusters, the bustle's armour and cage, the sights, Shtora-1, and the 2A42 on the roof's right. */
function addModule(P: TankBuilderPort): void {
  addModuleCore(P);
  addModuleFlanks(P);
  addModuleRack(P);
  addModuleBustleFittings(P);
  addModuleSights(P);
  addModuleShtora(P);
  // the 2A42's deck: a plate flush with the roof under its mount, cantilevered out over the raked wall, on a web plate
  // standing on the flank wedges
  P.add('turret', box(.52, .05, .52), -.66, TOP - .025, -.40);
  P.add('turret', box(.04, .12, .36), -.90, TOP - .10, -.40);
  // the 2A42 in its low pod on the roof's right. Its barrel crosses the sight tower and the commander's mast from 37
  // degrees inboard and the bustle's roof kit past 161 degrees outboard (.qa-dev/r152/station-levels.mjs, barrel lines
  // against the module's stock from level to full elevation every 0.05 rad): it turns from a degree short of each; over
  // the cheek, the lintel and the bustle's tail it depresses only as far as the table lets it (each degree the smallest of
  // it and its neighbours)
  add30mmCannon(P, { name: 'object195_2a42', x: -.66, deck: TOP, z: -.40, axisY: TOP + .14, pivotZ: -.40, muzzleZ: 1.75,
    yawArc: [-2.7925, 0.6109],
    depressionByYaw: [[-2.7925, 0.132], [-2.7751, 0.14], [-2.7576, 0.146], [-2.7402, 0.151], [-2.7227, 0.16],
      [-2.7053, 0.165], [-2.6878, 0.171], [-2.6704, 0.177], [-2.6529, 0.18], [-0.4887, 0.18], [-0.4712, 0.177],
      [-0.4538, 0.171], [-0.4363, 0.165], [-0.4189, 0.16], [-0.4014, 0.151], [-0.384, 0.146], [-0.3665, 0.14],
      [-0.3491, 0.132], [-0.3316, 0.126], [-0.3142, 0.12], [-0.2967, 0.112], [-0.2793, 0.106], [-0.2618, 0.098],
      [-0.2443, 0.092], [-0.2269, 0.084], [-0.2094, 0.073], [0.1222, 0.073], [0.1396, 0.053], [0.1571, 0.05],
      [0.2618, 0.05], [0.2793, 0.047], [0.4189, 0.047], [0.4363, 0.045], [0.576, 0.045], [0.5934, 0.047],
      [0.6109, 0.047]] });
}

/** The 2A83 on its exposed cradle: the cradle's shield, the recoil cylinders' housings, the tube. Gun frame. */
function addGun(P: TankBuilderPort): void {
  P.addGunExtra(sectionSolid([
    { z: -.70, ring: [[-.34, -.30], [.34, -.30], [.38, -.10], [.38, .22], [.30, .30], [-.30, .30], [-.38, .22], [-.38, -.10]] },
    { z: .12, ring: [[-.34, -.30], [.34, -.30], [.38, -.10], [.38, .22], [.30, .30], [-.30, .30], [-.38, .22], [-.38, -.10]] },
    { z: .30, ring: [[-.26, -.22], [.26, -.22], [.29, -.08], [.29, .16], [.23, .22], [-.23, .22], [-.29, .16], [-.29, -.08]] },
  ]));
  for (const s of [-1, 1]) P.addGunExtraDark(cylZ(.055, .70, 14), s * .18, .24, -.10);
  // the stepped gun block over the shield (round 6's critics: "a thick stepped gun block"), rising with the gun
  P.addGunExtra(sectionSolid([
    { z: .00, ring: [[-.37, -.24], [.37, -.24], [.37, .36], [.30, .44], [-.30, .44], [-.37, .36]] },
    { z: .34, ring: [[-.37, -.24], [.37, -.24], [.37, .36], [.30, .44], [-.30, .44], [-.37, .36]] },
    { z: .46, ring: [[-.31, -.20], [.31, -.20], [.31, .28], [.25, .34], [-.25, .34], [-.31, .28]] },
  ]));
  // the cradle's big trunnion block across the gun, the round mantlet ahead of the block, and the tube's root collar
  P.addGunExtra(KIT.cylX(.24, .96, 24), 0, 0, -.12);
  P.addGunExtra(cylZ(.30, .26, 28, .27), 0, 0, .56);
  P.addGunExtra(cylZ(.215, .35, 24, .23), 0, 0, .80);
  build152Gun(P, { ...GUN_2A83, len: F.muzzleZ - F.trunnionZ });
}

export function buildObject195X(P: TankBuilderPort): void {
  P.hullG.position.set(0, 0, 0);
  P.turretG.position.set(0, F.ringY, F.ringZ);
  P.gunG.position.set(0, ty(F.trunnionY), tz(F.trunnionZ));
  addHull(P);
  addHullKit(P);
  addRunningGear(P);
  addTurntable(P);
  addModule(P);
  addGun(P);
  P.topY = 1.64;
}

export const OBJECT195_X_PROFILES = { object195: { build: buildObject195X } };
