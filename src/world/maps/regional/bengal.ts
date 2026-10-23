// src/world/maps/regional/bengal.ts — the Bengal kit (Jade River Delta: a market village on a char of the braided
// Jamuna). Homesteads raised on earthen plinths (bhiti) above the flood line: houses walled and roofed with corrugated
// iron sheet — galvanised, rust-streaked or painted — under four-slope (char-chala) or two-slope roofs, a third of the
// small ones walled in bamboo and jute stick plastered with mud under a two-slope (do-chala) rice-straw thatch; a veranda (dawa) on
// bamboo posts closed at its ends by sheet or mud screens, its mud steps down to the yard, the doors in carved frames under their lintel boards, the windows
// in timber casings with iron grilles and plank shutters; the bari's yards fenced in bamboo round the rice granary and
// the kitchen garden, the hand pump on its platform, the cow-dung cakes drying on a wall, the clay water pots, a bicycle;
// the bazaar's long tin sheds on posts with shuttered stalls; brick shops with a flat roof, a corbelled cornice over
// their pilasters, louvred shutters and a signboard; a whitewashed mosque with small domes and a slender minaret; round
// clay-and-bamboo rice granaries (gola) under conical thatch; the river ghat's boat sheds.
import { PartSink, alongPlot, faceBox, facePoint, pick, plotAxes, rgb, shade, type Face, type RegionalBucket, type RegionalParts, type Rgb, type Vec3 } from './geometry.ts';
import { bevelSpan, orientedPrism } from './millWorks.ts';
import { buildHouse, emitRoof, roofGeometry, storeyFaces, windowRhythm, type HoleRect, type HouseDialect, type HouseFrame, type Opening, type RoofSpec } from './house.ts';
import { corrugatedCladding } from './villageCraft.ts';
import { doorUnit, rollerDoor, windowUnit, type WindowStyle } from './openings.ts';
import { BAMBOO_MAT, GALVANISED, PAINTED_SHEET, RUSTED, WEATHERED_PLANK, ladder, veranda } from './vernacular.ts';
import { dentilCornice, facadeOn, facadeRng, faceSlab, hash01, pilaster, plinthPaint, trimRun, windowHead } from './facade.ts';
import { bench, bicycle, clayPot, dungCakes, handPump, tvAerial, washingLine } from './dressing.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';
import { bengalBazaar } from './marketKits.ts'; // props #23: the char bazaar

const SHUTTERS: readonly Rgb[] = [0x3f6f9a, 0x4f8a62, 0x8a4a3a, 0x6a5a46].map(rgb);
/** the bamboo of the posts and the rafters */
const BAMBOO = rgb(0x9a8a62);
/** terracotta: the water pots */
const TERRACOTTA: readonly Rgb[] = [0x8a5a44, 0x7a4e3a, 0x946650].map(rgb);
/** the hand pumps' paint: a municipal green, a rust-brown, a dull grey */
const PUMP_IRON: readonly Rgb[] = [0x2f5a3e, 0x5a3a2a, 0x4a4e52].map(rgb);
/** the bicycles' enamel: black, a bottle green, a maroon */
const ENAMEL: readonly Rgb[] = [0x141414, 0x1f3a2a, 0x4a1a1a].map(rgb);
/** the veranda's depth, from the wall to the post line */
const VERANDA_D = 1.5;
/** (maps-stalled 240, r2's blind: the do-chala's gable "an oversized blank mud wall") the gable's vent: its opening's size
 *  and its middle's height as a share of the gable's rise */
const DO_CHALA_VENT = { w: 0.8, h: 0.44, at: 0.38 };

/** The do-chala gable's vent (HouseDialect.gableOpenings): a square hole under the ridge, cut on every tier (the phones'
 *  solids are the desktop's), where the gable stands tall and wide enough to hold it with a hand of mud round it. */
const doChalaVent = (_face: Face, poly: Array<[number, number]>, frame: HouseFrame): HoleRect[] => {
  const vent = doChalaVentRect(poly, frame);
  return vent ? [vent] : [];
};
function doChalaVentRect(poly: ReadonlyArray<readonly [number, number]>, frame: HouseFrame): HoleRect | null {
  const y0 = Math.min(...poly.map(([, y]) => y)), apex = Math.max(...poly.map(([, y]) => y)), hw = Math.max(...poly.map(([u]) => u));
  const rise = apex - y0;
  if (rise < 1.0 || frame.roof.ridgeY - frame.eaveY < 1.0) return null;
  const vy = y0 + rise * DO_CHALA_VENT.at, top = vy + DO_CHALA_VENT.h / 2;
  // the gable's half-width at the vent's head, the rake falling straight from the apex
  if (hw * (apex - top) / rise < DO_CHALA_VENT.w / 2 + 0.15) return null;
  return { u0: -DO_CHALA_VENT.w / 2, u1: DO_CHALA_VENT.w / 2, y0: vy - DO_CHALA_VENT.h / 2, y1: top };
}

function uvOffset(ctx: RegionalBuildContext): [number, number] {
  return [ctx.rng() * 7.31, ctx.rng() * 5.17];
}

/** The livery of one sheet: galvanised, rusted or painted. */
function sheetColour(rng: () => number): Rgb {
  const roll = rng();
  return roll < 0.45 ? pick(rng, GALVANISED) : roll < 0.75 ? pick(rng, RUSTED) : pick(rng, PAINTED_SHEET);
}

/**
 * The homestead house: an earthen plinth, sheet or mat walls, the windows in their casings with grilles and plank
 * shutters, a char-chala or do-chala roof of sheet or thatch on bamboo rafters, a veranda on bamboo posts. The big
 * homestead on a farmhouse plot (wider than deep) lies along it with its veranda down one long side (plotAxes); built
 * across the plot, its platform and veranda reached 1.5 m past it.
 */
function tinHouse(ctx: RegionalBuildContext, opts: { big?: boolean } = {}): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const plot = plotAxes(ctx.info), t = !!opts.big && plot.turned;
  const W = t ? Math.max(4.8, Math.min(8, plot.w - 3.4)) : Math.max(4.8, Math.min(opts.big ? 8 : 6.6, ctx.info.w - 0.6));
  const D = t ? Math.max(6.4, Math.min(12, plot.d - 2.6)) : Math.max(6.4, Math.min(opts.big ? 11 : 9, ctx.info.d - 0.6));
  const plinth = 0.7 + rng() * 0.5;
  alongPlot(sink, t, () => tinHouseBody(sink, ctx, rng, t, W, D, plinth, !!opts.big));
  return sink.finish();
}

function tinHouseBody(sink: PartSink, ctx: RegionalBuildContext, rng: () => number, turned: boolean, W: number, D: number, plinth: number, big: boolean): void {
  const mobile = ctx.tier === 'mobile', look = ctx.variant;
  // (the looks lane, 2026-10-17, the Bengal lift) a third of the small houses are the poorer bari's: walls of bamboo and
  // jute stick plastered with mud (the round-1 pair: woven mat on the timber tile read as plank cabins) under a four-slope
  // rice-straw thatch; the big homestead is always sheet. A look choice: the build stream's draws stay as they were
  const thatched = !big && look() > 0.67;
  // the bhiti: a raised earth platform a step wider than the house (rendered in mud plaster), under the veranda too. (Lane
  // C 2026-10-16, the building-detail ratchet: drawn beside a plinthless house spec the census and the damage plan never
  // saw it, and the kit's mid detail read 2 -> 1) it is the house's own plinth, 1.2 m out all round with no dressed course,
  // and a turned house's veranda side 0.4 m wider again
  const bOut = 1.2, bx0 = -W / 2 - (turned ? 1.6 : 1.2), bx1 = W / 2 + 1.2, bz0 = -D / 2 - 1.2, bz1 = D / 2 + 1.2;
  if (turned) sink.span('plaster3', bx0, -0.6, bz0, -W / 2 - bOut, plinth, bz1);
  // (the lift: the walls 2.7 m, as the char's tin houses stand, so the veranda's lean-to clears the deeper eave over a
  // carved door head)
  const wallH = 2.7, walls = sheetColour(rng), frame = pick(rng, WEATHERED_PLANK);
  // (the looks lane, 2026-10-15; WORKLIST #15: "bengal tinHouse rebuilt on buildHouse (framed board or mat panels, cut
  // openings)"; the r2 probe: its windows were dark plates on a sheet box) the house on the house grammar: a storey whose
  // wall is cut by its door and its shuttered windows, the corrugated sheets laid on it each in its own livery round the
  // cuts (a patched one in five) or the mat panels in their frame of poles; the plank shutters opening out of the cuts on
  // their hinges, the grilles' rods in them
  // (the lift: a patch in a painted sheet's livery read as a door down the wall) the patches galvanised or rusted, as
  // many draws as before
  const patches: Rgb[] = [];
  for (let k = 0; k < 4; k++) patches.push(rng() < 0.5 ? pick(rng, GALVANISED) : pick(rng, RUSTED));
  const livery = (k: number): Rgb => {
    if (k < 0) return shade(walls, 0.97);
    const r = ((k * 2654435761) >>> 0) / 4294967296;
    return r < 0.2 ? patches[k % patches.length] : shade(walls, 0.9 + ((k * 40503) % 17) / 17 * 0.2);
  };
  const shutter = pick(rng, SHUTTERS);
  // (the lift) each window in a timber casing (the surround) under its lintel board (a dressed head, the facade craft),
  // the iron grille's rods across it, the plank shutters hinged out of it
  const casing = shade(frame, 0.92);
  const style: WindowStyle = {
    frame, frameWidth: 0.06, frameOut: 0.04, bars: 'grille',
    surround: { bucket: 'structureWood', width: 0.07, out: 0.045, lintel: 0.12, colour: casing },
    sill: { bucket: 'structureWood', out: 0.06, colour: frame },
    shutters: { colour: shutter, kind: 'plank', closed: 0.25 },
    head: { kind: 'lintel', bucket: 'structureWood', h: 0.13, out: 0.065, ext: 0.07, colour: shade(frame, 0.82) },
  };
  const front = turned ? 'left' : 'front';
  const openings: Opening[] = [
    // (r2) a mud house's door lower, under a plain lintel (the critic: its veranda roof ran into the carved head)
    { face: front, storey: 0, kind: 'door', u: (turned ? D : W) * 0.15, w: 0.9, y0: 0, h: thatched ? 1.75 : 1.95 },
    // (r2, the critic: "a blank plaster box") a window in the back wall too, its rear half left to the dung cakes
    { face: 'back', storey: 0, kind: 'window', u: W * 0.24, w: 0.7, y0: 0.95, h: 0.7 },
    { face: 'front', storey: 0, kind: 'window', u: -W * 0.25, w: 0.7, y0: 0.95, h: 0.7 },
    { face: 'right', storey: 0, kind: 'window', u: -D * 0.2, w: 0.7, y0: 0.95, h: 0.7 },
    { face: 'right', storey: 0, kind: 'window', u: D * 0.2, w: 0.7, y0: 0.95, h: 0.7 },
    { face: 'left', storey: 0, kind: 'window', u: turned ? -D * 0.22 : 0, w: 0.7, y0: 0.95, h: 0.7 },
  ].filter((o, _i, all) => !(o.kind === 'window' && all.some((q) => q !== o && q.kind === 'door' && q.face === o.face && Math.abs(q.u - o.u) < 1.0))) as Opening[];
  // (the lift) deep eaves on bamboo rafters: the sheet's 0.7 m, the thatch's 0.75 m and a hand thick, its ridge rolled
  // (a thatch is the do-chala's two slopes, the Bengal hut's own (r2: the four-slope's hip corners read as a jagged chunk);
  // its eave one thick course, no course lips up the slope: lips a metre apart read as shingles in the round-1 pair)
  const kindRoll = rng(), pitch = rng();
  const kind: RoofSpec['kind'] = thatched ? 'gable' : kindRoll < 0.6 ? 'hip' : 'gable';
  const roof: RoofSpec = thatched
    ? { kind, pitchDeg: 34 + pitch * 6, eave: 0.75, verge: 0.6, thickness: 0.3, bucket: 'straw', ridge: 'round', thatch: 'nipa' }
    : { kind, pitchDeg: 24 + pitch * 6, eave: 0.7, verge: 0.6, thickness: 0.06, bucket: 'structureMetal', ridge: 'saddle' };
  const roofLivery = sheetColour(rng);
  const deck = plinth + 0.16;
  const dialect: HouseDialect = {
    ...(thatched && kind === 'gable' ? { gableOpenings: doChalaVent } : {}),
    window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, style, rng, 0.3),
    door: (s, face, o, y0) => {
      // (the lift) the door in its carved frame: the big homestead's panelled leaf, a small house's planks; the mud steps
      // down from the veranda's edge to the yard in front of it (openings.ts steps from a platform); the carved lintel
      // board over the frame (the facade craft)
      doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: big ? shade(frame, 0.78) : shutter, frame: { bucket: 'structureWood', width: 0.12, out: 0.06, colour: casing },
        steps: { bucket: 'plaster3', start: VERANDA_D, rise: 0.24, tread: 0.3 }, leafKind: big ? 'panel' : 'plank' }, deck);
      if (facadeOn() && thatched) windowHead(s, face, o.u, y0 + o.y0 + o.h + 0.12, o.w + 0.24, { kind: 'lintel', bucket: 'structureWood', h: 0.1, out: 0.06, ext: 0.05, colour: shade(frame, 0.82) });
      else if (facadeOn()) {
        const hy = y0 + o.y0 + o.h + 0.12;
        windowHead(s, face, o.u, hy, o.w + 0.24, { kind: 'hood', bucket: 'structureWood', h: 0.18, out: 0.075, ext: 0.06, colour: shade(frame, 0.82) });
        // the lintel's carving: a lozenge between two leaves cut on its frieze (near joinery)
        const c = hy + 0.05, carve = { colour: shade(frame, 1.08), fine: 'near' as const };
        faceSlab(s, 'structureWood', face, [[o.u, c - 0.038], [o.u + 0.09, c], [o.u, c + 0.038], [o.u - 0.09, c]], 0.045, 0.012, carve);
        for (const side of [-1, 1]) {
          const lu = o.u + side * 0.24;
          faceSlab(s, 'structureWood', face, [[lu - side * 0.11, c], [lu, c - 0.03], [lu + side * 0.11, c], [lu, c + 0.03]], 0.045, 0.01, carve);
        }
      }
    },
  };
  let hf: HouseFrame;
  {
    // (the storey's wall behind the cladding, a shade under its sheets or mats: the joints read dark, and no sheet stands
    // darker than the wall it is nailed to)
    const prior = sink.paint;
    sink.paint = shade(walls, 0.5);
    try {
      hf = buildHouse(sink, {
        w: W, d: D, plinth: { h: plinth, out: bOut, bucket: 'plaster3', course: false }, storeys: [{ h: wallH, wall: thatched ? 'plaster2' : 'structureMetal' }],
        roof, ...(thatched ? { core: 'adobe' as const } : { roofColour: roofLivery }), gableBucket: thatched ? 'plaster2' : 'structureMetal',
        openings, chimneys: [], gutters: null, reveal: 0.1, spall: null, skirt: null,
        // (the lift) the rafter feet of bamboo under the eaves; a sheet gable's barge boards
        rafters: shade(BAMBOO, 0.8), verge: !thatched && kind === 'gable' ? { colour: shade(frame, 0.88), bucket: 'structureWood' } : null,
      }, dialect);
      // (Lane C 2026-10-16, houseDamage: a framed storey takes its infill from the wall's second layer, which a sheet wall has not, so the damage path threw at damage.ts:325; as the LOOKS fishery fix 182dca492) the storey is unframed and its sheets laid over the walls after the house is built, face by face round each face's openings (the window units' own casings round the cuts); a mud wall is its own render
      const faces = storeyFaces(hf, 0), body = hf.bodies[0];
      if (!thatched) for (const name of ['front', 'right', 'back', 'left'] as const) {
        const face = faces[name], rect = { u0: -face.width / 2, u1: face.width / 2, y0: body.y0, y1: body.y1 };
        corrugatedCladding(sink, face, rect, openings.filter((o) => o.face === name && o.storey === 0), livery, frame, { mobile, casings: false });
      }
    } finally { sink.paint = prior; }
  }
  if (thatched && kind === 'gable') doChalaGables(sink, hf!);
  // the bhiti's edge slumped: a skirt of mud from its top edge out and down to the ground round it
  sink.dressing(mobile, () => {
    // (Lane C 2026-10-16, regionalArchitecture's ray audit: the skirt's quads were wound inward) each wound to face out and up
    const slump = 0.45;
    const P = (x: number, y: number, z: number): [number, number, number] => [x, y, z];
    sink.quad('plaster3', P(bx0 - slump, -0.05, bz1 + slump), P(bx1 + slump, -0.05, bz1 + slump), P(bx1, plinth, bz1), P(bx0, plinth, bz1), { decor: true, shade: 0.92 });
    sink.quad('plaster3', P(bx1 + slump, -0.05, bz0 - slump), P(bx0 - slump, -0.05, bz0 - slump), P(bx0, plinth, bz0), P(bx1, plinth, bz0), { decor: true, shade: 0.92 });
    sink.quad('plaster3', P(bx1 + slump, -0.05, bz1 + slump), P(bx1 + slump, -0.05, bz0 - slump), P(bx1, plinth, bz0), P(bx1, plinth, bz1), { decor: true, shade: 0.92 });
    sink.quad('plaster3', P(bx0 - slump, -0.05, bz0 - slump), P(bx0 - slump, -0.05, bz1 + slump), P(bx0, plinth, bz1), P(bx0, plinth, bz0), { decor: true, shade: 0.92 });
  });
  const width = turned ? D : W;
  const frontFace: Face = turned ? { origin: [-W / 2, 0, 0], u: [0, 0, 1], out: [-1, 0, 0], width: D } : { origin: [0, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: W };
  const verandaRoof = sheetColour(rng);
  // (the lift) the veranda on round bamboo posts under a lean-to of the house's own covering, passing under its eave
  const lean = veranda(sink, frontFace, plinth, plinth + wallH - 0.1, width, VERANDA_D, BAMBOO,
    thatched ? { bucket: 'straw', thatch: 'nipa' } : { bucket: 'structureMetal', colour: verandaRoof }, false,
    { eaveY: hf!.eaveY, eave: roof.eave, tanP: hf!.roof.tanP }, { round: true, ...(thatched ? { thickness: 0.2 } : {}) });
  verandaScreens(sink, frontFace, width, deck, lean.highY, lean.plateTop, lean.postTop, mobile, thatched ? null : { livery, frame });
  if (facadeOn()) homestead(sink, hf!, frontFace, { W, D, plinth, deck, bOut, width, big, thatched, door: openings[0] });
}

/**
 * The veranda's ends closed by screens (the lift; the integrity census read the open raised veranda as sky through the
 * house, bengal/farmhouse gap 0 -> 1.38 m² on 226): on a sheet house the house's own corrugated sheets on their posts
 * and plate, seen from outside and from the veranda; on a mud house a mud wall a hand thick (r2, the critic: its woven mat
 * on the timber tile read as a plank cabin); from the deck to the post heads between the wall and the end post, and over
 * it the piece up to the lean-to's underside. Its draws are none; a phone builds the sheets without their ribs.
 */
function doChalaGables(sink: PartSink, hf: HouseFrame): void {
  const poly = hf.roof.gable;
  if (!poly) return;
  const y0 = Math.min(...poly.map(([, y]) => y)), apex = Math.max(...poly.map(([, y]) => y)), hw = Math.max(...poly.map(([u]) => u));
  const vent = doChalaVentRect(poly, hf), pole = shade(BAMBOO, 0.82), slat = shade(BAMBOO, 0.92);
  // the tie's height and its half-length inside the rakes there, a hand short of them
  const tie = y0 + 0.18, tieHalf = hw * (apex - tie) / (apex - y0) - 0.1;
  for (const name of ['front', 'back'] as const) {
    const face = hf.faces[name];
    // the gable's bamboo frame on its mud: the tie across its foot (clear of the veranda's thatch where it meets the wall)
    // and the king post up to the vent
    faceBox(sink, 'structureWood', face, 0, tie, 0.03, 2 * tieHalf, 0.1, 0.1, { colour: pole, decor: true });
    if (!vent || vent.y0 - tie < 0.2) continue;
    faceBox(sink, 'structureWood', face, 0, (tie + 0.05 + vent.y0) / 2, 0.03, 0.08, vent.y0 - tie - 0.05, 0.08, { colour: pole, decor: true });
    // the vent's bamboo lattice set back in its reveal: four upright slats and a rail through them
    const vh = vent.y1 - vent.y0, vy = (vent.y0 + vent.y1) / 2, back = -hf.gableReveal * 0.5;
    for (const u of [-0.27, -0.09, 0.09, 0.27]) faceBox(sink, 'structureWood', face, u, vy, back, 0.045, vh, 0.03, { colour: slat, decor: true, fine: true });
    faceBox(sink, 'structureWood', face, 0, vy, back + 0.02, vent.u1 - vent.u0, 0.04, 0.03, { colour: pole, decor: true, fine: true });
  }
}

function verandaScreens(sink: PartSink, front: Face, width: number, deck: number, highY: number, plateTop: number, postTop: number, mobile: boolean,
  tin: { livery: (k: number) => Rgb; frame: Rgb } | null): void {
  const L = VERANDA_D - 0.1 - 0.07, panelTop = postTop - 0.02;
  const atL = highY + (plateTop - 0.01 - highY) * L / (VERANDA_D - 0.1);
  for (const s of [-1, 1] as const) {
    const uEnd = s * (width / 2 - 0.12);
    if (!tin) {
      // the mud wall: its slab from the deck to the lean-to's underside, its top falling with the roof (one prism, every
      // face drawn), in the walls' own mud
      const T = 0.1, at = (t: number, y: number): Vec3 => facePoint(front, uEnd - s * T / 2, y, t);
      orientedPrism(sink, 'plaster2', [at(0, deck - 0.04), at(L, deck - 0.04), at(L, Math.max(panelTop + 0.01, atL - 0.02)), at(0, highY - 0.03)],
        [front.u[0] * s, 0, front.u[2] * s], T, { decor: true });
      continue;
    }
    for (const side of [1, -1] as const) {
      // the screen's outer face (side 1: out of the veranda's end) and its inner face (side -1: into the veranda)
      const out: Vec3 = [front.u[0] * s * side, 0, front.u[2] * s * side];
      const u: Vec3 = [-front.out[0] * s * side, 0, -front.out[2] * s * side];
      const mid = facePoint(front, uEnd, 0, L / 2);
      const face: Face = { origin: [mid[0], 0, mid[2]], u, out, width: L };
      // the face's u of a depth t out from the wall
      const fu = (t: number): number => (t - L / 2) * (u[0] * front.out[0] + u[2] * front.out[2]);
      corrugatedCladding(sink, face, { u0: -L / 2, u1: L / 2, y0: deck, y1: panelTop }, [], tin.livery, tin.frame, { mobile, casings: false });
      // the sheet over it, up to the lean-to's underside (from highY at the wall down to the plate over the post line)
      if (highY - 0.03 - panelTop > 0.04) {
        faceSlab(sink, 'structureMetal', face, [[fu(0), panelTop], [fu(L), panelTop], [fu(L), Math.max(panelTop + 0.01, atL - 0.02)], [fu(0), highY - 0.03]], 0.002, 0.012,
          { colour: tin.livery(-1) });
      }
    }
  }
}

/** What homestead() reads of the house it dresses. */
interface Homestead { W: number; D: number; plinth: number; deck: number; bOut: number; width: number; big: boolean; thatched: boolean; door: Opening }

/**
 * The bari's life round the house (the lift; the facade craft, desktop: the facade stream's draws, never the build's
 * or the look's): the washing on a line under the veranda, a bench by the door and the water pots in the veranda's far
 * corner; the bhiti's top leeped with a fresh wash of mud; the cow-dung cakes drying on the back wall; on some houses
 * the hand pump on its platform on the bhiti, a bicycle against a side wall, a television aerial on the sheet ridge.
 */
function homestead(sink: PartSink, hf: HouseFrame, front: Face, h: Homestead): void {
  const f = facadeRng();
  const faces = storeyFaces(hf, 0);
  const half = h.width / 2, du = h.door.u, dw = h.door.w / 2 + 0.25;
  // the bhiti leeped: its top under a wash of mud and dung, darker and smoother than the yard (a fine paint)
  plinthPaint(sink, 'plaster3', [h.W / 2, h.D / 2], h.bOut, -0.6, h.plinth, [0.8, 0.76, 0.7]);
  // the washing on a line under the veranda, on the side away from the door (brackets on the wall)
  if (f() < 0.75) {
    const a = du > 0 ? -half + 0.35 : du + dw + 0.15, b = du > 0 ? du - dw - 0.15 : half - 0.35;
    if (b - a > 1.1) washingLine(sink, front, a, b, h.deck + 1.95, f);
  }
  // the bench against the wall beside the door, on the deck; the water pots in the veranda's far corner
  sink.placed(0, 0, h.deck, 0, () => {
    const roomR = half - 0.3 - (du + dw), roomL = (du - dw) - (-half + 0.3);
    if (roomR >= 1.1) bench(sink, front, du + dw + 0.1 + Math.min(1.2, roomR - 0.2) / 2, Math.min(1.2, roomR - 0.2), shade(BAMBOO, 0.85));
    else if (roomL >= 1.1) bench(sink, front, du - dw - 0.1 - Math.min(1.2, roomL - 0.2) / 2, Math.min(1.2, roomL - 0.2), shade(BAMBOO, 0.85));
    const potU = du > 0 ? -half + 0.45 : half - 0.45, n = 2 + Math.floor(f() * 2), clay = pick(f, TERRACOTTA);
    for (let k = 0; k < n; k++) {
      const p = facePoint(front, potU + (du > 0 ? 1 : -1) * k * 0.4, 0, VERANDA_D - 0.45 - (k % 2) * 0.32);
      clayPot(sink, p[0], 0, p[2], 0.17 + hash01(k, potU, 1.3) * 0.04, shade(clay, 0.9 + hash01(k, 7.7) * 0.2));
    }
  });
  // the cow-dung cakes drying on the back wall (the face with no openings), low down
  if (f() < 0.6) {
    const back = faces.back;
    const span = back.width / 2 - 0.4, a = -span + f() * span * 0.4, b = a + span * (0.9 + f() * 0.5);
    dungCakes(sink, back, a, Math.min(h.W * 0.24 - 0.75, b), h.plinth + 0.3, h.plinth + 0.3 + 0.81 + (f() < 0.5 ? 0.27 : 0), h.thatched ? 0.006 : 0.032);
  }
  // the hand pump of the bari's tube well on its platform on the bhiti, by a back corner (one house of a bari has it)
  if (f() < (h.big ? 0.8 : 0.35)) {
    const z = -h.D / 2 + 0.9 + f() * 0.6;
    handPump(sink, h.W / 2 + 0.62, h.plinth, z, Math.PI / 2, pick(f, PUMP_IRON));
    // (kitConnectivity: a pot set down beside the platform stood a hand over the bhiti) the pot on the platform's floor
    if (f() < 0.6) clayPot(sink, h.W / 2 + 0.87, h.plinth + 0.1, z + 0.22, 0.17, pick(f, TERRACOTTA));
  }
  // a bicycle leaned against a side wall on the bhiti, clear of its windows
  if (f() < (h.big ? 0.7 : 0.45)) {
    const side = faces[front.out[2] > 0.5 ? 'left' : 'front'];
    const taken = hf.spec.openings.filter((o) => side === faces[o.face]).map((o) => o.u);
    const u = [-side.width * 0.28, side.width * 0.28, 0].find((c) => taken.every((t) => Math.abs(t - c) > 1.1));
    if (u !== undefined) {
      const p = facePoint(side, u, h.plinth, 0.46);
      bicycle(sink, p[0], h.plinth, p[2], Math.atan2(-side.u[2], side.u[0]), 0.16, pick(f, ENAMEL));
    }
  }
  // a television aerial on a sheet ridge
  if (!h.thatched && f() < (h.big ? 0.6 : 0.35)) tvAerial(sink, hf, (f() - 0.5) * hf.roof.ridgeHalf, f);
}

/**
 * The bazaar shed: a long sheet roof on posts over two rows of shuttered stalls. On a market row's plot (wider than
 * deep) the shed lies along it, its stalls facing both long sides (plotAxes): it no longer reaches 2.4 m past them.
 */
const bazaar: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const plot = plotAxes(ctx.info), m = plot.turned ? 0.25 : 0.5;
  const W = Math.max(plot.turned ? 4.2 : 6, Math.min(10, plot.w - (plot.turned ? 1.0 : 0.6))), D = Math.max(plot.turned ? 6 : 9, Math.min(20, plot.d - 0.6));
  alongPlot(sink, plot.turned, () => {
    sink.span('plaster3', -W / 2 - m, -0.3, -D / 2 - m, W / 2 + m, 0.5, D / 2 + m);
    const top = 3.2;
    for (const sx of [-1, 1]) for (let k = 0, n = Math.max(2, Math.round(D / 3) + 1); k < n; k++) {
      const x = sx * (W / 2 - 0.15), z = -D / 2 + 0.15 + (D - 0.3) * k / (n - 1);
      sink.span('structureWood', x - 0.09, 0.5, z - 0.09, x + 0.09, top, z + 0.09, { colour: BAMBOO_MAT });
    }
    // the stall boxes along the spine, shutters half open
    for (let z = -D / 2 + 1.3; z < D / 2 - 1.0; z += 2.6) for (const side of [-1, 1]) {
      const x = side * 0.9;
      sink.span('structureMetal', x - 0.8, 0.5, z - 1.15, x + 0.8, 2.6, z + 1.15, { colour: sheetColour(rng) });
      faceBox(sink, 'dark', { origin: [x + side * 0.8, 0, z], u: [0, 0, -side], out: [side, 0, 0], width: 2.3 }, 0, 1.55, 0.005, 1.9, 1.6, 0.02, { decor: true });
    }
    const roof: RoofSpec = { kind: 'gable', pitchDeg: 18, eave: plot.turned ? 0.35 : 0.6, verge: 0.4, thickness: 0.06, bucket: 'roof', ridge: 'saddle' };
    emitRoof(sink, roofGeometry(W, D, top, roof), roof);
  });
  return sink.finish();
};

/** the louvred shutters (khorkhori) of a bazaar's upper windows: a faded green, a blue, a brown */
const KHORKHORI: readonly Rgb[] = [0x3f6a4a, 0x3e5f7a, 0x5a4636, 0x4f7a5a].map(rgb);

/**
 * A bazaar's brick shop: two storeys of brick or render on a plinth, a flat roof behind its parapet; the rolling shutter
 * half raised in the shop's cut, the dark of the shop under it; the upper windows in dressed surrounds under segmental
 * heads, iron grilles in them and louvred shutters (khorkhori) hinged out of them; a painted signboard over the shutter's
 * drum. (The lift, the facade craft:) a corbelled dentil cornice under the parapet, returned round the corners, a string
 * course at the upper floor, pilasters at the corners and between the upper windows.
 */
const brickShop: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant, mobile = ctx.tier === 'mobile';
  const W = Math.max(6, Math.min(9, ctx.info.w - 0.6)), D = Math.max(7, Math.min(10, ctx.info.d - 0.6));
  const rendered = rng() < 0.5;
  const wall: RegionalBucket = rendered ? 'plaster' : 'stone';
  const style: WindowStyle = {
    frame: rgb(0x4a5a6a), frameWidth: 0.06, frameOut: 0.04, bars: 'grille',
    surround: { bucket: wall, width: 0.12, out: 0.04, lintel: 0.16 }, sill: { bucket: 'plaster', out: 0.08 },
    shutters: { colour: pick(look, KHORKHORI), kind: 'louvred', closed: 0.3 },
    head: { kind: 'segment', bucket: wall, h: 0.1, out: 0.05, ext: 0.03, rise: 0.12 },
  };
  const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'gate', u: 0, w: W - 1.6, y0: 0, h: 2.4 }];
  for (const face of ['front', 'left', 'right'] as const) {
    for (const o of windowRhythm(face, 1, face === 'front' ? W : D, { w: 1.1, h: 1.3, sill: 0.9, spacing: 2.2, margin: 0.9 })) openings.push(o);
  }
  const dialect: HouseDialect = {
    window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, style, rng, 0.5),
    // the rolling shutter in the shop's cut (openings.ts rollerDoor): its drum over the head, its guides, the ribbed
    // curtain half raised, the shop's dark under it (the cut's own: a dark plate on the face read as painted)
    door: (s, face, o, y0) => rollerDoor(s, face, o.u, y0 + o.y0, o.w, o.h, 0.2 + look() * 0.45, pick(rng, GALVANISED), rgb(0x3a3e42), mobile),
  };
  const frame = buildHouse(sink, {
    w: W, d: D, plinth: { h: 0.4, out: 0.05, bucket: 'stone' }, storeys: [{ h: 3.2, wall }, { h: 3.0, wall }],
    roof: { kind: 'flat', pitchDeg: 0, eave: 0.12, verge: 0.12, thickness: 0.2, bucket: 'plaster', parapet: 0.8 }, gableBucket: wall,
    openings, chimneys: [], gutters: null, verge: null,
  }, dialect);
  faceBox(sink, 'structureWood', frame.faces.front, 0, 3.95, 0.05, W - 0.8, 0.6, 0.05, { colour: pick(rng, PAINTED_SHEET), decor: true });
  if (facadeOn()) {
    const top = frame.eaveY - 0.32, base = frame.floors[0], f1 = frame.floors[1];
    for (const name of ['front', 'left', 'right'] as const) {
      const face = frame.faces[name], half = face.width / 2;
      dentilCornice(sink, wall, face, -half, half, top, { ret: 0.3 });
      if (name !== 'front') trimRun(sink, wall, face, -half, half, f1 - 0.06, [{ h: 0.12, out: 0.05 }]);
      for (const u of [-half + 0.22, half - 0.22]) pilaster(sink, wall, face, u, name === 'front' ? base : f1 + 0.06, top, 0.4, 0.07);
      const us = frame.spec.openings.filter((o) => o.face === name && o.storey === 1).map((o) => o.u).sort((x, y) => x - y);
      for (let k = 0; k + 1 < us.length; k++) pilaster(sink, wall, face, (us[k] + us[k + 1]) / 2, f1 + 0.06, top, 0.32, 0.06);
    }
  }
  return sink.finish();
};

/** The village mosque: a whitewashed hall, three small domes, a slender minaret at one corner. */
const mosque: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const W = Math.max(6, Math.min(8.5, ctx.info.w - 0.4)), D = Math.max(7.5, Math.min(10, ctx.info.d - 0.4));
  const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 1.4, y0: 0, h: 2.6 }];
  for (const u of [-W * 0.3, W * 0.3]) openings.push({ face: 'front', storey: 0, kind: 'door', u, w: 1.0, y0: 0, h: 2.3 });
  for (const face of ['left', 'right'] as const) for (const o of windowRhythm(face, 0, D, { w: 0.9, h: 1.6, sill: 0.9, spacing: 2.4, margin: 1.0 })) openings.push(o);
  const dialect: HouseDialect = {
    window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { frame: rgb(0x3e6a5a), frameWidth: 0.06, frameOut: 0.04, bars: 'two', surround: { bucket: 'plaster', width: 0.14, out: 0.06, lintel: 0.24 }, sill: null, shutters: null }, ctx.rng, 0.4),
    door: (s, face, o, y0) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: rgb(0x3e6a5a), frame: { bucket: 'plaster', width: 0.18, out: 0.08, arch: true }, steps: { bucket: 'stone' }, leafKind: 'panel' }, y0 + o.y0),
  };
  const frame = buildHouse(sink, {
    w: W, d: D, plinth: { h: 0.6, out: 0.1, bucket: 'stone' }, storeys: [{ h: 4.0, wall: 'plaster' }],
    roof: { kind: 'flat', pitchDeg: 0, eave: 0.15, verge: 0.15, thickness: 0.22, bucket: 'plaster', parapet: 0.6 }, gableBucket: 'plaster',
    openings, chimneys: [], gutters: null, verge: null,
  }, dialect);
  const top = frame.eaveY + 0.22;
  for (const [x, r] of [[-W * 0.3, 0.9], [0, 1.3], [W * 0.3, 0.9]] as const) {
    sink.cylinder('plaster', [x, top, 0], 'y', 0.4, r, 12, {});
    const prof = [1.0, 0.98, 0.9, 0.74, 0.5, 0.2];
    let y = top + 0.4;
    for (let k = 0; k + 1 < prof.length; k++) { sink.cylinder('plaster', [x, y, 0], 'y', r * 0.26, r * prof[k], 12, {}, r * prof[k + 1], k === prof.length - 2); y += r * 0.26; }
    sink.cylinder('structureMetal', [x, y, 0], 'y', 0.5, 0.05, 6, { colour: rgb(0xb8933e), decor: true }, 0.02);
  }
  // the minaret at a rear corner, engaged in the walls (the 225 gate, 2026-10-15: standing clear of the front corner it
  // reached 1.1 m past the chapel's 5.7 m plot, and the front's doors leave it no room there): its shaft reaches at most
  // 0.3 m past the plot's side and back
  const mr = 0.75;
  const mx = Math.min(W / 2 + 0.2, ctx.info.w / 2 + 0.3 - mr), mz = -Math.min(D / 2 + 0.2, ctx.info.d / 2 + 0.3 - mr);
  sink.cylinder('plaster', [mx, 0, mz], 'y', 11.5, mr, 10, {}, 0.55);
  sink.cylinder('plaster', [mx, 8.6, mz], 'y', 0.3, 1.05, 10, { decor: true });
  sink.cylinder('plaster', [mx, 11.5, mz], 'y', 1.3, 0.55, 10, {}, 0.05);
  return sink.finish();
};

/**
 * The gola: a round rice granary of clay-plastered bamboo on a plinth, under a conical thatch. (The lift: a gola stands in
 * every bari's yard now) the bamboo hoops binding its body, the thatch's thick cut eave and its topknot, the plank hatch
 * high under the eave and the bamboo ladder leaned up to it; dressing all (its collision as before), a phone builds none.
 */
const gola: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const R = Math.max(1.4, Math.min(2.1, Math.min(ctx.info.w, ctx.info.d) / 2 - 0.4));
  sink.cylinder('plaster3', [0, -0.3, 0], 'y', 0.9, R + 0.4, 12, {});
  sink.cylinder('plaster3', [0, 0.6, 0], 'y', 2.0, R, 12, {}, R * 1.08);
  sink.cylinder('straw', [0, 2.55, 0], 'y', 2.2, R * 1.35, 12, {}, 0.12);
  sink.dressing(ctx.tier === 'mobile', () => {
    const at = (y: number): number => R * (1 + 0.08 * (y - 0.6) / 2.0);
    for (const y of [0.85, 1.55, 2.25]) sink.cylinder('structureWood', [0, y, 0], 'y', 0.06, at(y) + 0.022, 12, { decor: true, colour: shade(BAMBOO, 0.86) }, at(y + 0.06) + 0.022);
    // the thatch's cut eave, thicker than its slope, and the straw bound into a topknot at the apex
    sink.cylinder('straw', [0, 2.4, 0], 'y', 0.16, R * 1.37, 12, { decor: true }, R * 1.3);
    sink.cylinder('straw', [0, 4.6, 0], 'y', 0.42, 0.17, 8, { decor: true }, 0.04);
    // the hatch: a plank board in its frame high on the body's front, under the eave; the ladder up to it
    const face: Face = { origin: [0, 0, at(2.05) + 0.015], u: [1, 0, 0], out: [0, 0, 1], width: 1 };
    faceBox(sink, 'structureWood', face, 0, 2.05, 0.02, 0.56, 0.5, 0.04, { decor: true, colour: shade(WEATHERED_PLANK[1], 0.9) });
    for (const y of [1.88, 2.22]) faceBox(sink, 'structureWood', face, 0, y, 0.05, 0.5, 0.06, 0.025, { decor: true, colour: shade(WEATHERED_PLANK[1], 0.75) }, 'ends');
    if (ctx.variant() < 0.7) ladder(sink, { ...face, origin: [0, 0, at(1.75) + 0.02] }, 0, 0.06, 1.75, shade(BAMBOO, 0.8));
  });
  return sink.finish();
};

/** A boat shed at the ghat: a sheet roof on bamboo posts, open sides. */
const ghatShed: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const W = Math.max(4, Math.min(8, ctx.info.w - 0.6)), D = Math.max(6, Math.min(12, ctx.info.d - 0.6));
  const top = 2.8;
  for (const sx of [-1, 1]) for (let k = 0, n = Math.max(2, Math.round(D / 2.6) + 1); k < n; k++) {
    const x = sx * (W / 2 - 0.12), z = -D / 2 + 0.12 + (D - 0.24) * k / (n - 1);
    sink.span('structureWood', x - 0.08, -0.3, z - 0.08, x + 0.08, top, z + 0.08, { colour: BAMBOO_MAT });
  }
  const roof: RoofSpec = { kind: 'gable', pitchDeg: 20, eave: 0.5, verge: 0.3, thickness: 0.06, bucket: 'structureMetal', ridge: 'saddle' };
  emitRoof(sink, roofGeometry(W, D, top, roof), roof, sheetColour(rng));
  return sink.finish();
};

/** A storm-wrecked tin house: the plinth, a few posts, the sheets torn and down. */
const wrecked: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const W = Math.max(4.8, ctx.info.w - 1.0), D = Math.max(6.4, ctx.info.d - 1.0);
  sink.span('plaster3', -W / 2 - 1, -0.4, -D / 2 - 1, W / 2 + 1, 0.8, D / 2 + 1);
  for (let k = 0; k < 6; k++) {
    const x = (rng() - 0.5) * W, z = (rng() - 0.5) * D;
    sink.member('structureWood', [x, 0.8, z], [x + (rng() - 0.5) * 0.6, 0.8 + 0.8 + rng() * 1.6, z + (rng() - 0.5) * 0.6], 0.12, 0.12, [1, 0, 0], { colour: pick(rng, WEATHERED_PLANK), exposed: true });
  }
  // the fallen sheets (the connectivity sweep: they hung over the slab): each with its low end on the slab, its raised
  // end propped on a broken bamboo post
  for (let k = 0; k < 6; k++) {
    const a = rng() * Math.PI, x = (rng() - 0.5) * W * 0.7, z = (rng() - 0.5) * D * 0.7;
    rng();
    const hy = 0.9 + rng() * 1.2, ex = x + Math.cos(a), ez = z + Math.sin(a);
    sink.member('structureMetal', [x - Math.cos(a), 0.8, z - Math.sin(a)], [ex, hy, ez], 0.9, 0.04, [0, 1, 0], { colour: sheetColour(rng), decor: true, exposed: true });
    sink.cylinder('structureWood', [ex, 0.78, ez], 'y', hy - 0.76, 0.06, 6, { colour: BAMBOO_MAT, decor: true }, 0.05);
  }
  return sink.finish();
};

/**
 * A bazaar stall (the base market plot): a raised earthen platform, bamboo posts carrying a tin roof that falls to the
 * lane, a tin back wall, a plank counter with sacks of rice and lentils and baskets of produce.
 */
const bazaarStall: RegionalBuilder = (ctx) => {
  // (props census r2 sweep, Lane C 2026-10-16: the stall's box-only share 99 %) its parts in their own forms: the mud
  // plinth's corners worn round, the bamboo posts round, the back wall of corrugated tin, the counter's plank eased, the
  // tin roof's front edge turned down into a drip, the jute sacks round; the draws as before
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const W = Math.max(4.5, Math.min(6.4, ctx.info.w - 0.4)), D = Math.max(3.6, Math.min(5.0, ctx.info.d - 0.4));
  const floor = 0.35, back = 2.95, front = 2.4;
  const px = W / 2 + 0.25, pz = D / 2 + 0.25, wear = 0.35;
  const plinth: Vec3[] = [[px, -0.3, -pz + wear], [px, -0.3, pz - wear], [px - wear, -0.3, pz], [-px + wear, -0.3, pz], [-px, -0.3, pz - wear],
    [-px, -0.3, -pz + wear], [-px + wear, -0.3, -pz], [px - wear, -0.3, -pz]];
  orientedPrism(sink, 'plaster3', plinth, [0, 1, 0], floor + 0.3, {});
  for (const [x, z, h] of [[-1, -1, back], [1, -1, back], [-1, 1, front], [1, 1, front]] as const) {
    sink.cylinder('structureWood', [x * (W / 2 - 0.15), floor, z * (D / 2 - 0.15)], 'y', h - floor, 0.07, 8, { colour: BAMBOO_MAT });
  }
  // the back wall: corrugated tin, its facets welded into one sheet, its outer face a sheet's thickness behind the inner
  // (regionalArchitecture's ray audit: the two faces laid on one plane read as inverted from either side)
  const tin = sheetColour(rng), zb = -D / 2 + 0.12, ribs = Math.max(8, Math.round((W - 0.16) / 0.15)), xa = -W / 2 + 0.08, xb = W / 2 - 0.08;
  const t = 0.012;
  for (let i = 0; i < ribs; i++) {
    const u0 = xa + (xb - xa) * i / ribs, u1 = xa + (xb - xa) * (i + 1) / ribs, z0 = zb + (i % 2 ? 0.03 : 0), z1 = zb + (i % 2 ? 0 : 0.03);
    sink.quad('structureMetal', [u0, floor, z0], [u1, floor, z1], [u1, back - 0.12, z1], [u0, back - 0.12, z0], { colour: tin });
    sink.quad('structureMetal', [u1, floor, z1 - t], [u0, floor, z0 - t], [u0, back - 0.12, z0 - t], [u1, back - 0.12, z1 - t], { colour: shade(tin, 0.8) });
  }
  // the sheet's top edge and its two ends closed
  for (let i = 0; i < ribs; i++) {
    const u0 = xa + (xb - xa) * i / ribs, u1 = xa + (xb - xa) * (i + 1) / ribs, z0 = zb + (i % 2 ? 0.03 : 0), z1 = zb + (i % 2 ? 0 : 0.03), y = back - 0.12;
    sink.quad('structureMetal', [u0, y, z0], [u1, y, z1], [u1, y, z1 - t], [u0, y, z0 - t], { colour: shade(tin, 0.9) });
  }
  sink.quad('structureMetal', [xa, floor, zb - t], [xa, floor, zb], [xa, back - 0.12, zb], [xa, back - 0.12, zb - t], { colour: shade(tin, 0.85) });
  const zEnd = zb + (ribs % 2 ? 0.03 : 0);
  sink.quad('structureMetal', [xb, floor, zEnd], [xb, floor, zEnd - t], [xb, back - 0.12, zEnd - t], [xb, back - 0.12, zEnd], { colour: shade(tin, 0.85) });
  // the tin roof falls from the back wall to the lane: a shed laid along the stall's depth (local +x low = world +z), its
  // front edge turned down in a drip welded to the sheet
  const roofColour = sheetColour(rng);
  const roof: RoofSpec = { kind: 'shed', pitchDeg: Math.atan2(back - front, D) * 180 / Math.PI, eave: 0.35, verge: 0.3, thickness: 0.05, bucket: 'structureMetal', ridge: null };
  sink.placed(-Math.PI / 2, 0, 0, 0, () => emitRoof(sink, roofGeometry(D, W, front, roof), roof, roofColour));
  const tan = (back - front) / D, ze = D / 2 + 0.35, ye = front - 0.35 * tan;
  sink.quad('structureMetal', [-W / 2 - 0.3, ye - 0.12, ze], [W / 2 + 0.3, ye - 0.12, ze], [W / 2 + 0.3, ye + 0.01, ze], [-W / 2 - 0.3, ye + 0.01, ze], { colour: shade(roofColour, 0.85), decor: true });
  sink.quad('structureMetal', [W / 2 + 0.3, ye - 0.12, ze - 0.01], [-W / 2 - 0.3, ye - 0.12, ze - 0.01], [-W / 2 - 0.3, ye + 0.01, ze - 0.01], [W / 2 + 0.3, ye + 0.01, ze - 0.01], { colour: shade(roofColour, 0.7), decor: true });
  bevelSpan(sink, 'structureWood', -W / 2 + 0.35, floor, D / 2 - 1.0, W / 2 - 0.35, floor + 0.8, D / 2 - 0.45, 0.04, { colour: pick(rng, WEATHERED_PLANK) });
  // the goods: jute sacks on the counter and the floor, flat baskets of produce
  const jute = rgb(0xa08a62), produce: readonly Rgb[] = [0x8a3a2a, 0xc0902a, 0x5a7a3a, 0xb8b0a0].map(rgb);
  for (let k = 0, n = 3 + Math.floor(rng() * 3); k < n; k++) {
    const x = -W / 2 + 0.7 + rng() * (W - 1.4), onCounter = rng() < 0.5;
    const y0 = onCounter ? floor + 0.8 : floor, z = onCounter ? D / 2 - 0.72 : -D / 2 + 0.7 + rng() * 0.8, h = 0.42 + rng() * 0.16;
    sink.cylinder('structureWood', [x, y0, z], 'y', h, 0.2, 8, { colour: jute, decor: true }, 0.16);
  }
  for (let k = 0; k < 3; k++) {
    const x = -W / 2 + 0.8 + k * (W - 1.6) / 2;
    sink.cylinder('structureWood', [x, floor + 0.8, D / 2 - 0.72], 'y', 0.12, 0.28, 8, { colour: pick(rng, produce), decor: true });
  }
  return sink.finish();
};

export const BENGAL_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  cottage: (ctx) => tinHouse(ctx),
  farmhouse: (ctx) => tinHouse(ctx, { big: true }),
  marketRow: bengalBazaar,
  fishery: bazaar,
  // the base market plot: a tin bazaar stall (gauntlet wave 15: the delta's streets still showed the generic stall)
  market: bazaarStall,
  cornershop: brickShop,
  depot: brickShop,
  chapel: mosque,
  granary: gola,
  boatshed: ghatShed,
  woodshed: ghatShed,
  ruin: wrecked,
});

export const BENGAL_STYLE: ArchitectureStyle = Object.freeze<ArchitectureStyle>({
  id: 'bengal',
  region: 'Jamuna chars (Sirajganj, Bogura): homesteads of corrugated iron on earthen plinths, a tin bazaar, a village mosque',
  surfaces: {
    roof: { kind: 'sheet', tint: [0.60, 0.62, 0.63] },
    // (round 11; waves 319/320: "clean, saturated, uniformly tiled brick with no soot") an industrial town's brick, soiled
    stone: { kind: 'brick', tint: [0.62, 0.32, 0.24], weathered: true },
    sourced: { plaster: false, wood: true },
    // (the facades lane, round 11; waves 319/320: the walls' procedural canvas read as "speckle", "sponge", "cork",
    // "camouflage noise": its 6 cm bumps shade as dots from the street, as Steinburg's did before round 8) the walls
    // painted as the region renders them (regionalSurfaces.ts paintLimewash), every family under the kit's and the map's
    // tones
    render: { kind: 'limewash', seed: 0x6b4e },
    tones: {
      plaster: (_h, s, l) => [0.12, Math.min(1, s * 0.25), Math.min(1, l * 1.25 + 0.1)],
      // (r2, the critic: "flat salmon-coloured slabs", "dark shingles") the mud walls a warm clay, the bhiti a grey-brown
      // earth, the rice straw golden-grey as it weathers, not a timber brown
      plaster2: (_h, s, l) => [0.09, Math.min(1, s * 0.45 + 0.12), Math.min(1, l * 0.96 + 0.02)],
      plaster3: (_h, s, l) => [0.078, Math.min(1, s * 0.42 + 0.12), Math.min(1, l * 0.74)],
      straw: (h, s, l) => [h - 0.008, Math.min(1, s * 0.6), Math.min(1, l * 0.98)],
    },
  },
  builders: BENGAL_BUILDERS,
  // (the looks lane, 2026-10-17, the Bengal lift) the bari's yards (yards.ts): a fence of bamboo canes on lashed rails
  // (fenceKit's bengal wattle) round the yard with its bamboo gate lashed with jute (gateKit), the rice granary (gola) in
  // its far corner and the kitchen garden's raised beds with the gourd trellis (yards.ts monsoon garden)
  yard: { kinds: ['cottage', 'farmhouse'], fence: 'fencewattle', gate: 'gatewattle', shed: 'granary', shedSize: [4.0, 4.0], garden: true },
});

export type { RegionalParts };
