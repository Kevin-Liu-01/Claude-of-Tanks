// FV4030/5 and FV4030/6 — release 262, fictional tanks on a hull rebuilt from the Challenger 1's historical
// references (docs/references/tanks/challenger_x.md). The rebuild began as the Challenger 1 Mk 1 / Mk 2 / Granby
// (owner 2026-10-27: "based on proper historical referrences so they will no longer look so chungus"); the owner then
// ruled the supplied-file Mk 3's turret the real one ("that turret is what it is actually like, and we should just use
// the weird turrets we invented to make nnew tanks like ... X variants", 2026-10-28), so the real marks use that build
// (challenger1X.ts) and these turrets carry new tanks. Hull, running gear and L11A5 keep the Challenger 1's published
// dimensions: hull 8.33 m, overall 11.55 m, 3.52 m over the skirts, six Hydrogas road wheels a side, rear drive. The
// FV4030/5 carries the wide wedge turret (challenger1HistoricTurret.ts) and an applique kit after the Op Granby
// fit (side cassettes, nose package, rear drums); the FV4030/6 carries the sleek turret
// (challenger1SleekTurret.ts) on the plain hull.
import { markVehicleNightLens } from '../vehicleNightLighting.ts';
import { KIT } from './kit.ts';
import { sectionSolid, type SectionPoint } from './sectionSolid.ts';
import { roofSheet } from './measuredPrimitives.ts';
import { addChallenger1HistoricTurret } from './challenger1HistoricTurret.ts';
import { addChallenger1SleekTurret } from './challenger1SleekTurret.ts';
import { CR1_HISTORIC as D, CR1_GRANBY_APPLIQUE, CR1_GRANBY_CASSETTES, CR1_GRANBY_PITCH, CR1_GRANBY_JOINT, CR1_SKIRT, type Challenger1Mark } from './challenger1HistoricFrame.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
const { box, cylX, cylY, cylZ, torus } = KIT;

/** A section ring authored for the left side (+x), mirrored to the right with its winding kept. */
function sided(ring: readonly SectionPoint[], side: number): SectionPoint[] {
  return side > 0 ? [...ring] : ring.map(([x, y]) => [-x, y] as const).reverse();
}
/** Chamfered box section, counter-clockwise from +Z. */
function chamferedBox(w: number, lo: number, hi: number, c: number, cTop = c): SectionPoint[] {
  return [[-w + c, lo], [w - c, lo], [w, lo + c], [w, hi - cTop], [w - cTop, hi], [-w + cTop, hi], [-w, hi - cTop], [-w, lo + c]];
}

// ---------------------------------------------------------------------------------------------------------------
// Hull: the welded Shir 2-derived tub. Centre body between the tracks (+-1.04), sponsons over them to +-1.70, a
// shallow 19-degree upper glacis from the 1.58 m roof to the nose plate, a steep nose plate and a lower nose plate to
// the 0.50 m belly; the engine deck stands 10 cm proud of the turret roof plate behind the bulkhead.
// ---------------------------------------------------------------------------------------------------------------
type TubStation = readonly [z: number, belly: number, top: number];
const TUB: readonly TubStation[] = [
  [-4.12, 1.00, 1.66], [-3.60, 0.50, 1.68], [-1.33, 0.50, 1.68], [-1.29, 0.50, 1.58],
  [2.55, 0.50, 1.58], [3.40, 0.50, 1.29], [3.95, 0.716, 1.10], [4.165, 0.79, 0.84],
];
const SPONSON: readonly TubStation[] = [
  [-4.12, 1.10, 1.66], [-1.33, 1.10, 1.68], [-1.29, 1.10, 1.58], [2.55, 1.10, 1.58], [3.00, 1.10, 1.44],
];

function hullTub(P: TankBuilderPort): void {
  P.add('hull', sectionSolid(TUB.map(([z, lo, hi]) => ({ z, ring: chamferedBox(D.hull.innerHalfW, lo, hi, Math.min(.06, (hi - lo) * .2), .03) }))));
  for (const side of [-1, 1]) {
    const xi = D.hull.innerHalfW - .02, xo = D.hull.sponsonHalfW;
    P.add('hull', sectionSolid(SPONSON.map(([z, lo, hi]) => ({ z, ring: sided([[xi, lo], [xo - .03, lo], [xo, lo + .03], [xo, hi - .025], [xo - .025, hi], [xi, hi]], side) }))));
    // The front mudguard: a folded sheet from the sponson's nose over the idler to the bow, its outer lip turned down
    // (the fender line the headlight clusters stand on), with the rubber flap hung from its front edge.
    const a = Math.min(side * (D.hull.innerHalfW - .01), side * xo), b = Math.max(side * (D.hull.innerHalfW - .01), side * xo);
    P.addMudguard(`cr1-front-guard-${side}`, 'hull', roofSheet([
      [2.95, a, b, 1.46, 1.46], [3.55, a, b, 1.30, 1.30], [4.10, a, b, 1.13, 1.13],
    ], .03));
    P.addMudguard(`cr1-front-guard-lip-${side}`, 'hull', box(.03, .16, 1.15), side * (xo - .015), 1.215, 3.53, .28, 0, 0);
    P.hangMudguard('cr1-front-flap', 'hullRubber', box(.62, .34, .025), side * (xo - .33), .95, 4.105);
    // The rear guard over the sprocket closes the sponson's tail.
    P.addMudguard(`cr1-rear-guard-${side}`, 'hull', box(xo - D.hull.innerHalfW + .02, .03, .44), side * (xo + D.hull.innerHalfW) / 2, 1.645, -3.92);
    P.hangMudguard('cr1-rear-flap', 'hullRubber', box(.58, .30, .025), side * (xo - .33), 1.38, -4.135);
  }
}

function glacisKit(P: TankBuilderPort): void {
  // Driver's hatch at the glacis head (centre line) with his periscope, the splash board across the glacis and the
  // tow points on the nose plate.
  P.addHatch('hullDetail', cylY(.30, .31, .04, P.q ? 24 : 14), 0, 1.60, 2.30);
  // (the periscope on the roof at the glacis head, the splash board's foot on the 19-degree glacis: 1.474 m at z 2.86)
  P.addEquipment('hullDark', box(.20, .06, .07), 0, 1.61, 2.50);
  P.addModuleVisual('optics', 'hullGlass', box(.16, .03, .012), 0, 1.615, 2.538);
  P.addEquipment('hullDetail', box(1.90, .07, .05), 0, 1.505, 2.86, .33, 0, 0);
  for (const side of [-1, 1]) {
    for (const x of [.42, .74]) {
      P.addEquipment('hullDetail', box(.13, .14, .12), side * x, .94, 4.10, -.95, 0, 0);
      P.addEquipment('hullDark', torus(.055, .017, 12, 6), side * x, .89, 4.16, Math.PI / 2, 0, 0);
    }
    // Headlight clusters on the front guards (two lamps in an armoured box), inboard of the guard's lip.
    const lampX = side * (D.hull.innerHalfW + .30), lampZ = 3.72, lampY = 1.255;
    P.addEquipment('hullDetail', box(.36, .15, .17), lampX, lampY + .07, lampZ, .28, 0, 0);
    for (const dx of [-.085, .085]) {
      P.addEquipment('hullGlass', markVehicleNightLens(cylZ(.048, .02, 12), 'headlight'), lampX + dx, lampY + .06, lampZ + .087, .28, 0, 0);
    }
  }
}

function engineDeck(P: TankBuilderPort): void {
  // Two rows of four louvred grilles across the deck (the radiator and air-inlet decks), framed on the plate.
  const deckY = 1.68;
  for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
    const z = -1.72 - i * .58, x = side * .82;
    P.addEquipment('hullDetail', box(1.38, .035, .52), x, deckY + .017, z);
    for (let k = 0; k < (P.q ? 9 : 5); k++) {
      P.addEquipment('hullDark', box(1.30, .012, .022), x, deckY + .036, z - .22 + k * (.44 / ((P.q ? 9 : 5) - 1)));
    }
  }
  // Filler caps and lifting eyes along the deck edge, the engine-access cap at the tail.
  for (const side of [-1, 1]) {
    P.addEquipment('hullDetail', cylY(.08, .08, .03, 14), side * 1.48, deckY + .015, -3.95);
    P.addEquipment('hullDark', torus(.05, .014, 10, 6), side * 1.52, deckY + .03, -1.45);
  }
  P.addEquipment('hullDetail', cylY(.20, .21, .035, 20), .62, deckY + .018, -3.95);
  // Exhaust louvres on the rear plate, the tail lights and the towing pintle.
  for (const side of [-1, 1]) {
    P.addEquipment('hullDark', box(.62, .26, .04), side * .62, 1.42, -4.14);
    for (let k = 0; k < 4; k++) P.addEquipment('hullDetail', box(.60, .014, .05), side * .62, 1.32 + k * .065, -4.16);
    P.addEquipment('hullDetail', box(.16, .10, .06), side * 1.38, 1.52, -4.15);
    P.addEquipment('hullGlass', markVehicleNightLens(box(.11, .05, .012), 'marker'), side * 1.38, 1.52, -4.183);
    P.addEquipment('hullDark', torus(.06, .018, 12, 6), side * .25, 1.06, -4.17, Math.PI / 2, 0, 0);
  }
  P.addEquipment('hullDetail', box(.22, .16, .10), 0, 1.10, -4.16);
  KIT.towCable(P, [[-1.22, 1.70, -3.70], [-1.24, 1.70, -1.90], [-1.30, 1.69, -1.40]]);
}

// Skirts: the armoured front section over the first two stations, run forward under the front guard to the bow with
// its lower front edge raked back over the idler, and five thin rear panels, all hung outside the 1.71 m track edge
// within the 3.52 m width. Their top stops at the 1.42 m track-guard ledge; the sponson wall shows above it to the deck.
const SKIRT_TOP = CR1_SKIRT.top;
function skirts(P: TankBuilderPort, side: number): void {
  const xo = D.hull.skirtOuterX, xs = D.hull.sponsonHalfW;
  P.addExternalArmor('hull', sectionSolid(CR1_SKIRT.front.map(([z, lo, hi]) => ({ z, ring: sided([[xo - .04, lo], [xo, lo], [xo, hi], [xo - .04, hi]], side) }))));
  const { panels, rear: z0, panelFront: z1 } = CR1_SKIRT, pitch = (z1 - z0) / panels;
  for (let i = 0; i < panels; i++) {
    const zc = z0 + pitch * (i + .5), lo = i === 0 ? CR1_SKIRT.firstFoot : CR1_SKIRT.foot;
    P.addExternalArmor('hull', box(.03, SKIRT_TOP - lo, pitch - CR1_SKIRT.gap), side * (xo - .015), (SKIRT_TOP + lo) / 2, zc);
    // panel stiffener along its foot
    P.addEquipment('hullDetail', box(.02, .05, pitch - .07), side * (xo + .004), lo + .06, zc);
  }
  // two bolt rows along the armoured front section
  for (let z = 1.66; z < 2.96; z += .26) for (const y of [.64, SKIRT_TOP - .07]) P.addEquipment('hullDark', cylX(.016, .012, 8), side * (xo + .004), y, z);
  // the track-guard ledge the skirts hang from, from the sponson wall out over the skirt tops, bow to stern
  P.addEquipment('hullDetail', box(xo - xs + .02, .03, 6.55), side * (xs + xo) / 2, SKIRT_TOP + .015, -.25);
  for (const z of [-2.70, -1.75, -.80, .15, 1.10, 2.05, 2.90]) P.addEquipment('hullDark', box(.016, .05, .05), side * (xo + .006), SKIRT_TOP - .04, z);
}

// The FV4030/5's applique kit after the Op Granby fit: bolted cassettes over the skirts, the nose package and two fuel drums.
function granbyKit(P: TankBuilderPort): void {
  const { innerX: xi, outerX: xo, low: lo, high: hi, rear, front } = CR1_GRANBY_APPLIQUE;
  for (const side of [-1, 1]) {
    // six box-section cassettes with deep joints, each a raised bolted cover plate on a flanged box
    for (let i = 0; i < CR1_GRANBY_CASSETTES; i++) {
      const z0 = rear + i * CR1_GRANBY_PITCH, z1 = z0 + CR1_GRANBY_PITCH - CR1_GRANBY_JOINT;
      P.addExternalArmor('hull', sectionSolid([z0, z1].map((z) => ({ z, ring: sided([[xi, lo], [xo, lo], [xo, hi], [xi, hi]], side) }))));
      P.addEquipment('hullDetail', box(.025, hi - lo - .12, z1 - z0 - .10), side * (xo + .012), (lo + hi) / 2, (z0 + z1) / 2);
      for (const y of [lo + .12, (lo + hi) / 2, hi - .12]) for (const dz of [.10, (z1 - z0) / 2, z1 - z0 - .10]) {
        P.addEquipment('hullDark', cylX(.018, .012, 8), side * (xo + .03), y, z0 + dz);
      }
      // the joint backer behind each seam
      if (i > 0) P.addEquipment('hullDark', box(.10, hi - lo - .06, CR1_GRANBY_JOINT + .04), side * (xi + .06), (lo + hi) / 2, z0 - CR1_GRANBY_JOINT / 2);
    }
    // the forward cassette steps up over the idler under the front guard
    const fz = rear + CR1_GRANBY_CASSETTES * CR1_GRANBY_PITCH;
    P.addExternalArmor('hull', sectionSolid([[fz, lo], [2.86, lo], [front, .92]].map(([z, l]) => ({ z, ring: sided([[xi, l], [xo, l], [xo, hi], [xi, hi]], side) }))));
    P.addEquipment('hullDark', box(.10, hi - lo - .06, CR1_GRANBY_JOINT + .04), side * (xi + .06), (lo + hi) / 2, fz - CR1_GRANBY_JOINT / 2);
    // hangers onto the track-guard ledge
    for (let i = 0; i <= CR1_GRANBY_CASSETTES; i++) P.addEquipment('hullDetail', box(.17, .05, .10), side * (xi + .07), hi + .02, rear + .30 + i * CR1_GRANBY_PITCH);
  }
  // Nose package: a row of eight reactive blocks across the nose plate and a second row on the lower nose plate, each on
  // its welded frame.
  for (let i = 0; i < 8; i++) {
    const x = -.875 + i * .25;
    P.addExternalArmor('hull', box(.23, .30, .11), x, .985, 4.105, -.86, 0, 0);
    P.addExternalArmor('hull', box(.23, .26, .10), x, .66, 3.98, 1.05, 0, 0);
  }
  P.addEquipment('hullDetail', box(2.05, .04, .06), 0, 1.13, 4.03, -.86, 0, 0);
  P.addEquipment('hullDetail', box(2.05, .04, .06), 0, .82, 4.10, -.86, 0, 0);
  // Rear fuel drums (two 175 L), each 0.58 m across, centred 0.90 m out, in a cradle bolted to the rear plate with two
  // straps round it.
  for (const side of [-1, 1]) {
    const x = side * .90, y = 1.36, z = -4.48;
    P.addEquipment('hullFittingPaint', cylX(.29, .78, P.q ? 28 : 16), x, y, z);
    for (const dx of [-.25, .25]) P.addEquipment('hullDark', torus(.296, .012, 24, 6).rotateZ(Math.PI / 2), x + dx, y, z);
    for (const dx of [-.28, .28]) {
      P.addEquipment('hullDetail', box(.06, .06, .34), x + dx, y - .30, -4.33);
      P.addEquipment('hullDetail', box(.08, .42, .04), x + dx, y - .12, -4.185);
    }
    P.addEquipment('hullDetail', box(.66, .05, .08), x, y - .30, -4.58);
  }
}

// Native suspension-driven gear: six Hydrogas stations, front idler, high rear sprocket, four return rollers behind the
// skirts carrying the 0.65 m track's upper run.
function runningGear(P: TankBuilderPort): void {
  const G = D.gear;
  const shoeDims = { padHeight: .032, grouserHeight: .010, webHeight: .016, hornHeight: .050, pinRadius: .008, pinCentreY: 0 };
  const botY = KIT.groundSeatBotY(P.spec, { trackTh: .024, trackShoeDimensions: shoeDims });
  const rollers = G.rollerZs.map((z) => ({ z, y: G.rollerY, r: G.rollerR }));
  P.gear = KIT.buildRunningGear(P, {
    style: 'rubber', wheelR: G.wheelR, wheelY: KIT.seatedWheelY(botY, .024, G.wheelR), wheelW: G.wheelW,
    wheelZs: [...G.wheelZs], xc: G.trackXc, trackW: G.trackW, trackTh: .024,
    sprocket: G.sprocket, idler: G.idler, rollers, returnRollerWidthM: .20,
    topY: G.topY, botY, linkPitchM: .16, trackShoeDimensions: shoeDims,
    loopPoints: KIT.trackLoopPoints({
      sprocket: G.sprocket, idler: G.idler, contact: { zF: G.wheelZs[0] + .10, zR: G.wheelZs[G.wheelZs.length - 1] - .10 },
      botY, topY: G.topY, sag: .012,
      endWheels: KIT.endRoadWheels([...G.wheelZs], KIT.seatedWheelY(botY, .024, G.wheelR), G.wheelR),
      supports: rollers.map((r) => ({ z: r.z, y: r.y + r.r + .018 })),
    }),
    arms: true, coveredTop: true, paintedEnds: true, rigidLinkChords: true,
  });
}

function markings(P: TankBuilderPort): void {
  const num = P.spec.visual.number || '';
  for (const side of [-1, 1]) {
    P.decal('hull', 'number', num, .30, [side * (D.hull.skirtOuterX + .004), 1.16, 2.30], side * Math.PI / 2);
  }
}

export function buildChallenger1Historic(P: TankBuilderPort, mark: Challenger1Mark): void {
  P.hullG.position.set(0, 0, 0);
  P.turretG.position.set(...D.turretPivot);
  P.gunG.position.set(D.trunnion[0] - D.turretPivot[0], D.trunnion[1] - D.turretPivot[1], D.trunnion[2] - D.turretPivot[2]);
  P.topY = D.structuralRoofY - D.turretPivot[1];
  hullTub(P);
  glacisKit(P);
  engineDeck(P);
  for (const side of [-1, 1]) skirts(P, side);
  if (mark === 'x') granbyKit(P);
  runningGear(P);
  if (mark === 'x_sleek') addChallenger1SleekTurret(P);
  else addChallenger1HistoricTurret(P, mark);
  markings(P);
  // The turret's underside stands its seam over the 1.58 m roof plate; the engine deck behind the bulkhead is 10 cm
  // higher, so the bustle (whose floor is 1.70) may rise that far over it (turretSeatRace.ts).
  P.turretG.userData.turretSeatRiseM = .12;
  P.hullG.userData.challenger1Rebuild = Object.freeze({ release: 262, mark, reference: 'docs/references/tanks/challenger_x.md' });
}

