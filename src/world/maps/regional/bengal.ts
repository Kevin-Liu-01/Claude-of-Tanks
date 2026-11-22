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
import { PartSink, alongPlot, faceBox, facePanel, facePoint, pick, plotAxes, rgb, shade, type EmitOptions, type Face, type RegionalBucket, type RegionalParts, type Rgb, type Vec3 } from './geometry.ts';
import { finialOn, roundDrum, smoothDome } from './domes.ts';
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

/** (dome-detail-275) the mosque's paint, as tints on its limewash: the green of its bands, its arch rings and its board */
const MOSQUE_GREEN: Rgb = [0.56, 0.82, 0.64];
/** (dome-detail-275) the monsoon on whitewash: the black mould's grey-green, the moss at the foot */
const MOULD: Rgb = [0.62, 0.68, 0.62];
const MOSS: Rgb = [0.52, 0.72, 0.42];
/** the alem's gilt */
const GILT = rgb(0xb8933e);

/**
 * (dome-detail-275) A pointed (two-centred) arch's line, its centres a fifth of the span in from the springings, as the
 * Bengal mosques turn them: the arch of span w springing at ys, offset e outward, as (u, y) from the right springing over
 * the apex to the left, n rows a side; `lobes` (odd) cusps cut `cusp` deep into it make the multifoil.
 */
function pointedLine(w: number, ys: number, e: number, n: number, lobes = 0, cusp = 0): Array<[number, number]> {
  const rho = 0.7 * w, cu = w / 2 - rho, R = rho + e, ta = Math.acos(Math.min(1, -cu / R));
  const half: Array<[number, number]> = [];
  for (let i = 0; i <= n; i++) {
    const s = i / n, r = lobes > 0 ? R - cusp * (1 - Math.sin(Math.PI * ((lobes * s / 2) % 1))) : R;
    half.push([cu + r * Math.cos(ta * s), ys + r * Math.sin(ta * s)]);
  }
  return [...half, ...half.slice(0, -1).reverse().map(([u, y]): [number, number] => [-u, y])];
}

/**
 * (dome-detail-275) A Bengal arch over a cut of span w on a face, springing at ys: its tympanum (the lime in shade, a
 * multifoil of five lobes cut in its edge), the moulded ring standing proud round it (painted, or the limewash's white),
 * its soffit and the imposts it springs from; a minor arch (`fine` false) turns its lobes in fewer rows and has no soffit.
 * Dressing. Returns the ring's apex.
 */
function mosqueArch(sink: PartSink, face: Face, u: number, ys: number, w: number, ring: number, paint: Rgb | null, look: () => number, fine = true): number {
  const n = fine ? 10 : 5, inner = pointedLine(w, ys, 0, n, 5, Math.min(0.09, w * 0.075)), outer = pointedLine(w, ys, ring, n);
  const P = (p: readonly [number, number], o: number): Vec3 => facePoint(face, u + p[0], p[1], o);
  sink.polygon('plaster', [facePoint(face, u, ys, 0.006), ...inner.map((p) => P(p, 0.006))], { decor: true, shade: 0.66 + look() * 0.08 });
  const O = 0.04, rp: EmitOptions = { decor: true, ...(paint ? { tint: paint } : {}) };
  for (let i = 0; i + 1 < inner.length; i++) {
    sink.quad('plaster', P(inner[i], O), P(outer[i], O), P(outer[i + 1], O), P(inner[i + 1], O), rp);
    if (fine) sink.quad('plaster', P(inner[i], 0.006), P(inner[i], O), P(inner[i + 1], O), P(inner[i + 1], 0.006), { ...rp, shade: 0.8, fine: 'near' });
  }
  for (const e of [-1, 1]) faceBox(sink, 'plaster', face, u + e * (w / 2 + ring / 2), ys - 0.045, O / 2 + 0.01, ring + 0.12, 0.09, O + 0.02, { decor: true, shade: 1.04 });
  return outer[n][1];
}

/** (dome-detail-275) A merlon (kangura) of the parapet's crest: a pointed little leaf of lime on the parapet at (u, y). */
function merlon(sink: PartSink, face: Face, u: number, y: number, o0: number, depth: number, opts: EmitOptions = { decor: true }): void {
  const w = 0.16, h = 0.16, tip = 0.09;
  // its two faces and its sides and slopes (never its foot, which sits on the parapet)
  const ring = ([[u + w / 2, y], [u + w / 2, y + h], [u, y + h + tip], [u - w / 2, y + h], [u - w / 2, y]] as const);
  const at = (k: number, o: number): Vec3 => facePoint(face, ring[k][0], ring[k][1], o);
  const o1 = o0 - depth;
  sink.polygon('plaster', [at(4, o0), at(0, o0), at(1, o0), at(2, o0), at(3, o0)], opts);
  sink.polygon('plaster', [at(0, o1), at(4, o1), at(3, o1), at(2, o1), at(1, o1)], opts);
  for (let k = 0; k < 4; k++) sink.quad('plaster', at(k, o0), at(k, o1), at(k + 1, o1), at(k + 1, o0), opts);
}

/** (dome-detail-275) A jali vent in its cut: the lime lattice set back in the reveal, the dressed surround and sill. */
function jaliVent(sink: PartSink, face: Face, u: number, y: number, w: number, h: number): void {
  const lat = { decor: true, shade: 0.93 };
  for (const k of [-1, 1]) {
    faceBox(sink, 'plaster', face, u + k * w / 6, y + h / 2, -0.1, 0.04, h, 0.05, lat);
    faceBox(sink, 'plaster', face, u, y + h / 2 + k * h / 6, -0.1, w, 0.04, 0.05, lat);
  }
  const sc = { decor: true, fineSides: true, shade: 1.03 };
  for (const k of [-1, 1]) faceBox(sink, 'plaster', face, u + k * (w / 2 + 0.05), y + h / 2, 0.02, 0.1, h + 0.2, 0.04, sc);
  faceBox(sink, 'plaster', face, u, y + h + 0.06, 0.025, w + 0.2, 0.12, 0.05, sc);
  faceBox(sink, 'plaster', face, u, y - 0.04, 0.035, w + 0.24, 0.08, 0.07, sc);
}

/**
 * (dome-detail-275) A cupola under the dome law's 0.8 m (a turret's, the minaret's lantern's): pointed and a little
 * stilted as smoothDome turns them, in sixteen segments and six rows (the facade budget's 12,000 triangles). Returns its
 * crown.
 */
function smallCupola(sink: PartSink, x: number, y: number, z: number, r: number, emit: EmitOptions = {}): number {
  const rho = r * 1.3, cx = r - rho, ta = Math.acos(-cx / rho), st = r * 0.12;
  const profile: Array<[number, number]> = [[0, r], [st, r]];
  for (let i = 1; i <= 6; i++) { const t = ta * i / 6; profile.push([st + rho * Math.sin(t), Math.max(0, cx + rho * Math.cos(t))]); }
  sink.revolve('plaster', [x, y, z], 'y', profile, 16, emit);
  return y + profile[profile.length - 1][0];
}

/**
 * (dome-detail-275) A guldasta: the engaged corner turret of a Bengal mosque, an octagon from the plinth to over the
 * parapet on its moulded base, banded at the cornice and the parapet, capped by a ring and its little pointed
 * cupola (domes.ts) under the gilt alem; the monsoon's damp darkening its foot.
 */
function guldasta(sink: PartSink, x: number, z: number, r: number, floor: number, eave: number, top: number, tintAt: (p: Vec3) => Rgb): void {
  const ph = Math.PI / 8, damp = (p: Vec3): number => Math.min(1, 0.6 + 0.4 * Math.max(0, p[1] + 0.1) / (floor + 0.9));
  sink.cylinder('stone', [x, -0.1, z], 'y', floor + 0.1, r + 0.09, 8, { decor: true, shadeAt: damp }, r + 0.07, true, ph);
  sink.cylinder('plaster', [x, -0.1, z], 'y', floor + 1.0, r, 8, { shadeAt: damp, tintAt }, r * 0.97, false, ph);
  const head = top + 0.72;
  sink.cylinder('plaster', [x, floor + 0.9, z], 'y', head - floor - 0.9, r * 0.97, 8, { tintAt }, r * 0.86, true, ph);
  const at = (y: number): number => r * (0.97 - 0.11 * Math.max(0, y - floor - 0.9) / (head - floor - 0.9));
  for (const y of [eave - 0.2, top - 0.04]) sink.cylinder('plaster', [x, y, z], 'y', 0.12, at(y) + 0.06, 8, { decor: true, shade: 0.95 }, at(y) + 0.06, false, ph);
  sink.cylinder('plaster', [x, head, z], 'y', 0.09, r * 0.86 + 0.08, 8, { decor: true }, r * 0.86 + 0.08, true, ph);
  const crown = smallCupola(sink, x, head + 0.09, z, r * 0.9, { decor: true, tintAt });
  sink.revolve('structureMetal', [x, crown - 0.03, z], 'y', [[0, 0.03], [0.1, 0.045], [0.18, 0.02], [0.34, 0]], 6, { decor: true, colour: GILT });
}

/**
 * The village mosque (dome-detail-275, rebuilt: a whitewashed box with three domes and a flat parapet): the prayer hall
 * at the back of its plot, its three bays under the three domes, raised on a brick plinth; before it the raised court
 * (sahn) on its own plinth inside a low wall, its steps up through the gate between two piers, the tube well for the
 * ablutions in its corner. The front's three doorways under pointed multifoil arches, the middle one in its frame
 * (pishtaq) standing proud to over the parapet with the green board on its head and pinnacles at its corners; engaged
 * corner turrets (guldasta) with their cupolas; a stepped cornice under the parapet, a green painted frieze, the parapet
 * bowed up over the front and back and crested with merlons; pilasters between the bays of the flanks, the windows under
 * their arches and the jali vents; the mihrab's bay standing out of the qibla wall behind; the domes and the minaret as
 * before (smooth, domes.ts). The monsoon on it all: the black mould streaking the domes and down the walls under the
 * spouts, the damp darkening the plinths, moss at their foot.
 */
const mosque: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const look = ctx.variant, pw = ctx.info.w, pd = ctx.info.d;
  // the hall at the back of the plot (its mihrab's bay inside it), the court before it
  const W = Math.max(5.2, Math.min(8.5, pw - 0.5)), mihD = 0.42, mihW = 1.5;
  const Dh = Math.max(4.6, Math.min(7.5, (pd - 0.6) * 0.64));
  const zh = -pd / 2 + 0.15 + mihD + Dh / 2, court = pd / 2 - 0.3 - (zh + Dh / 2), sahn = court >= 1.4;
  const plinth = 0.6, storey = 4.0, tR = 0.26, tc = 0.04;
  // the front's three doorways: the middle in its frame, the side ones between it and the corner turrets
  const fw = 0.12, ring = 0.11, cw = W >= 6.5 ? 1.2 : 1.0, ch = 2.1, pier = 0.18, po = 0.26;
  const ph = cw / 2 + fw + ring + 0.07 + pier, tIn = W / 2 - tc - tR;
  const sideU = (ph + tIn) / 2, sw = Math.max(0.7, Math.min(0.95, 2 * ((tIn - ph) / 2 - 0.08 - 0.1 - ring))), sh = 1.85;
  const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: 0, w: cw, y0: 0, h: ch }];
  for (const s of [-1, 1]) openings.push({ face: 'front', storey: 0, kind: 'door', u: s * sideU, w: sw, y0: 0, h: sh });
  for (const face of ['left', 'right'] as const) for (const o of windowRhythm(face, 0, Dh, { w: 0.8, h: 1.4, sill: 0.9, spacing: 2.4, margin: 1.0 })) openings.push(o);
  // the jali vents high in the qibla wall either side of the mihrab
  for (const s of [-1, 1]) openings.push({ face: 'back', storey: 0, kind: 'loft', u: s * Math.min(W / 2 - 0.9, 1.5), w: 0.5, y0: 2.5, h: 0.5 });
  const leaf = rgb(0x3e6a5a);
  const dialect: HouseDialect = {
    window: (s, face, o, y0) => {
      if (o.kind === 'loft') { jaliVent(s, face, o.u, y0 + o.y0, o.w, o.h); return; }
      windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { frame: leaf, frameWidth: 0.06, frameOut: 0.04, bars: 'grille', surround: { bucket: 'plaster', width: 0.12, out: 0.06, lintel: 0.1 }, sill: { bucket: 'plaster', out: 0.07 }, shutters: null }, ctx.rng, 0.4);
    },
    // (no steps: the doors open on the court, a hand under the hall's floor; without a court, steps down to the ground)
    door: (s, face, o, y0) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf, frame: { bucket: 'plaster', width: o.u === 0 ? fw : 0.1, out: 0.08 }, steps: sahn ? null : { bucket: 'stone' }, leafKind: 'panel' }, y0 + o.y0),
  };
  // the black mould of the monsoons: streaks of grey-green down a round form from its head, thickest at its foot
  const mould = (x: number, z: number, y0: number, h: number): ((p: Vec3) => Rgb) => {
    const phase = look() * 6.28, n = 5 + Math.floor(look() * 4);
    return (p: Vec3): Rgb => {
      const t = Math.min(1, Math.max(0, (p[1] - y0) / h)), streak = (0.5 + 0.5 * Math.sin(Math.atan2(p[2] - z, p[0] - x) * n + phase)) ** 3;
      const k = 1 - (streak * 0.75 + 0.25) * (1 - t) * 0.9;
      return [MOULD[0] + (1 - MOULD[0]) * k, MOULD[1] + (1 - MOULD[1]) * k, MOULD[2] + (1 - MOULD[2]) * k];
    };
  };
  // the minaret at the hall's rear right corner, engaged in it (the 225 gate, 2026-10-15: its shaft reaches at most 0.3 m
  // past the plot's side and back), in the hall's frame
  const mr = 0.75;
  const mx = Math.min(W / 2 + 0.15, pw / 2 + 0.3 - mr), mz = -Math.min(Dh / 2 - zh + 0.15, pd / 2 + 0.3 - mr) - zh;
  sink.placed(0, 0, 0, zh, () => {
    const frame = buildHouse(sink, {
      w: W, d: Dh, plinth: { h: plinth, out: 0.1, bucket: 'stone' }, storeys: [{ h: storey, wall: 'plaster' }],
      roof: { kind: 'flat', pitchDeg: 0, eave: 0.15, verge: 0.15, thickness: 0.22, bucket: 'plaster', parapet: 0.3 }, gableBucket: 'plaster',
      openings, chimneys: [], gutters: null, verge: null, reveal: 0.26,
    }, dialect);
    const y0 = frame.floors[0], eaveY = frame.eaveY, roofY = eaveY + 0.22, pTop = roofY + 0.3, faces = frame.faces;
    const turrets = ([[-1, 1], [1, 1], [-1, -1]] as const).map(([sx, sz]): [number, number] => [sx * (W / 2 - tc), sz * (Dh / 2 - tc)]);
    // (dome-detail-275: each was five frustums of twelve flat facets on a plain ring) the Bengal dome: a little pointed, on
    // its drum under a stepped cornice, turned smooth (domes.ts), the gilt alem on its crown; the middle one over the
    // wider middle bay. (This pass) the black mould streaking each down from its crown
    const rc = Math.max(0.95, Math.min(1.4, W * 0.19)), rs = rc * 0.68, xs = rc + rs - 0.05;
    for (const [x, r] of [[-xs, rs], [0, rc], [xs, rs]] as const) {
      const tintAt = mould(x, 0, roofY, r * 2.2);
      const shell = smoothDome(sink, 'plaster', x, roundDrum(sink, 'plaster', x, roofY, 0, r, 0.4, 'plaster', { tintAt }) - 0.02, 0, r, { form: 'pointed', stilt: 0.14, emit: { tintAt } });
      finialOn(sink, x, shell.top, 0, r > 0.9 ? 0.6 : 0.45, GILT);
    }
    // the corner turrets (the minaret stands at the fourth corner)
    for (const [x, z] of turrets) guldasta(sink, x, z, tR, y0, eaveY, pTop, mould(x, z, 0, pTop));
    // (dome-detail-275: a ten-sided tapered prism, a flat disc and a cone) the shaft turned round on its moulded base, its
    // string courses, the balcony on its corbelled ring under a parapet, the lantern stage and its small dome
    const mt = mould(mx, mz, 0, 12);
    sink.revolve('plaster', [mx, 0, mz], 'y', [[-0.3, mr + 0.1], [0.5, mr + 0.1], [0.5, mr], [11.5, 0.55], [11.5, 0]], 24, { tintAt: mt });
    for (const y of [3.2, 6.0]) sink.revolve('plaster', [mx, y, mz], 'y', [[0, mr - (0.2 * y) / 11.5 + 0.02], [0, mr - (0.2 * y) / 11.5 + 0.08], [0.16, mr - (0.2 * y) / 11.5 + 0.08], [0.16, 0]], 24, { decor: true, shade: 0.94 });
    sink.revolve('plaster', [mx, 8.1, mz], 'y', [[0, 0.62], [0.5, 1.05], [0.5, 1.12], [0.62, 1.12], [0.62, 1.05], [1.15, 1.05], [1.15, 0.98], [0.62, 0.98], [0.62, 0]], 24, { decor: true });
    sink.revolve('plaster', [mx, 11.5, mz], 'y', [[0, 0.62], [0.12, 0.62], [0.12, 0.5], [0.9, 0.5], [0.9, 0.6], [1.0, 0.6], [1.0, 0]], 24);
    finialOn(sink, mx, smallCupola(sink, mx, 12.5, mz, 0.48), mz, 0.4, GILT);

    // (dome-detail-275) the front: the middle doorway's frame (pishtaq) standing proud of the wall to over the parapet, its
    // piers on bases with capitals at the springing, the head over the arch with the green board, a coping, merlons and a
    // pinnacle at each corner; the three doorways' multifoil arches in green rings, rosettes in the frame's spandrels
    const fr = faces.front;
    const apex = mosqueArch(sink, fr, 0, y0 + ch + fw, cw + 2 * fw, ring, MOSQUE_GREEN, look);
    for (const s of [-1, 1]) mosqueArch(sink, fr, s * sideU, y0 + sh + 0.1, sw + 0.2, ring * 0.9, MOSQUE_GREEN, look);
    const headY = apex + 0.07, crown = pTop + 0.32;
    for (const e of [-1, 1]) {
      const pu = e * (ph - pier / 2);
      faceBox(sink, 'plaster', fr, pu, (y0 - 0.04 + crown) / 2, po / 2, pier, crown - y0 + 0.04, po, {}, { back: true });
      faceBox(sink, 'plaster', fr, pu, y0 + 0.13, po / 2 + 0.02, pier + 0.08, 0.34, po + 0.04, { decor: true, shade: 0.96 }, { back: true });
      faceBox(sink, 'plaster', fr, pu, y0 + ch + fw + 0.02, po / 2 + 0.02, pier + 0.08, 0.12, po + 0.04, { decor: true, tint: MOSQUE_GREEN }, { back: true });
      // the pinnacle: a little octagonal shaft on the coping under a pointed cap
      const pp = facePoint(fr, pu, 0, po / 2);
      sink.cylinder('plaster', [pp[0], crown + 0.1, pp[2]], 'y', 0.36, 0.075, 8, { decor: true }, 0.065, false, Math.PI / 8);
      sink.cylinder('plaster', [pp[0], crown + 0.46, pp[2]], 'y', 0.26, 0.095, 8, { decor: true }, 0.01, true, Math.PI / 8);
      sink.pipe('plaster', facePoint(fr, e * (cw / 2 + fw + ring + 0.02), apex - 0.2, 0.006), facePoint(fr, e * (cw / 2 + fw + ring + 0.02), apex - 0.2, 0.035), 0.065, 10,
        { decor: true, caps: true, fine: 'near', tint: MOSQUE_GREEN });
    }
    faceBox(sink, 'plaster', fr, 0, (headY + crown) / 2, po / 2, 2 * ph, crown - headY, po, {}, { back: true });
    faceBox(sink, 'plaster', fr, 0, crown + 0.05, po / 2 + 0.02, 2 * ph + 0.12, 0.1, po + 0.08, { decor: true, shade: 0.94 }, { back: true });
    faceBox(sink, 'plaster', fr, 0, (headY + crown) / 2 + 0.02, po + 0.012, 2 * ph - 0.56, Math.min(0.46, crown - headY - 0.3), 0.024, { decor: true, tint: MOSQUE_GREEN });
    for (let k = -2; k <= 2; k++) merlon(sink, fr, k * (ph - 0.3) / 2, crown + 0.1, po + 0.03, 0.18);
    // the cornice: two corbelled courses under the eave, round the hall and its turrets
    const ex = W / 2, ez = Dh / 2;
    sink.band('plaster', -ex - 0.07, eaveY - 0.1, -ez - 0.07, ex + 0.07, eaveY, ez + 0.07, { decor: true, shade: 0.97 });
    sink.band('plaster', -ex - 0.035, eaveY - 0.2, -ez - 0.035, ex + 0.035, eaveY - 0.1, ez + 0.035, { decor: true, shade: 0.92 });
    // the parapet bowed up over the front and the back between the turrets (the Bengal cornice's curve), its crest of
    // merlons round the four sides clear of the turrets, the minaret, the pishtaq and the mihrab
    const L = W / 2 + 0.15, bow = 0.22, crest = (u: number): number => pTop + bow * (1 - (u / L) ** 2);
    const clearOf = (p: Vec3): boolean => turrets.every(([x, z]) => Math.hypot(p[0] - x, p[2] - z) > tR + 0.2) && Math.hypot(p[0] - mx, p[2] - mz) > mr + 0.12;
    for (const name of ['front', 'back', 'right', 'left'] as const) {
      const face = faces[name], bowed = name === 'front' || name === 'back', half = face.width / 2 + 0.15;
      if (bowed) {
        const pts: Vec3[] = [facePoint(face, -L, pTop, 0.15), facePoint(face, L, pTop, 0.15)];
        for (let i = 1; i < 12; i++) { const u = L - 2 * L * i / 12; pts.push(facePoint(face, u, crest(u), 0.15)); }
        orientedPrism(sink, 'plaster', pts, [-face.out[0], 0, -face.out[2]], 0.22, { shadeAt: (p) => (p[1] > pTop + 0.01 ? 0.9 : 1) });
      }
      const n = Math.floor((2 * half - 0.2) / 0.5);
      for (let k = 0; k <= n; k++) {
        const u = -half + 0.1 + k * (2 * half - 0.2) / n;
        if ((name === 'front' && Math.abs(u) < ph + 0.1) || (name === 'back' && Math.abs(u) < mihW / 2 + 0.1)) continue;
        if (!clearOf(facePoint(face, u, 0, 0.05))) continue;
        merlon(sink, face, u, bowed ? crest(u) : pTop, 0.14, 0.18);
      }
    }
    // the green frieze under the cornice, round the walls (behind the pishtaq's piers on the front)
    for (const name of ['front', 'back', 'right', 'left'] as const) {
      const face = faces[name], hw = face.width / 2;
      const spans: Array<[number, number]> = name === 'front' ? [[-hw, -ph], [ph, hw]] : [[-hw, hw]];
      for (const [a, b] of spans) facePanel(sink, 'plaster', face, (a + b) / 2, eaveY - 0.38, 0.006, b - a, 0.28, { decor: true, tint: MOSQUE_GREEN });
    }
    // the flanks: a pilaster at each bay's division (midway between the windows and the corner turrets), each window under
    // its arch in a white ring over a shaded multifoil tympanum
    for (const name of ['left', 'right'] as const) {
      const face = faces[name], edge = face.width / 2 - tc - tR;
      const us = [-edge, ...openings.filter((o) => o.face === name && o.kind === 'window').map((o) => o.u).sort((a, b) => a - b), edge];
      for (const o of openings) if (o.face === name && o.kind === 'window') mosqueArch(sink, face, o.u, y0 + o.y0 + o.h + 0.1, o.w + 0.24, 0.09, null, look, false);
      for (let k = 0; k + 1 < us.length; k++) {
        const u = (us[k] + us[k + 1]) / 2;
        faceBox(sink, 'plaster', face, u, (y0 + eaveY - 0.2) / 2, 0.04, 0.2, eaveY - 0.2 - y0, 0.08, { decor: true, shade: 1.03 });
        faceBox(sink, 'plaster', face, u, y0 + 0.15, 0.06, 0.28, 0.3, 0.12, { decor: true });
        faceBox(sink, 'plaster', face, u, eaveY - 0.62, 0.06, 0.28, 0.14, 0.12, { decor: true, tint: MOSQUE_GREEN });
      }
    }
    // the mihrab's bay out of the qibla wall: on its plinth, to the parapet, its cornice and merlons, the frieze round it, a
    // blind multifoil niche on its back
    const bk = faces.back;
    faceBox(sink, 'stone', bk, 0, (plinth - 0.1) / 2, (mihD + 0.05) / 2, mihW + 0.2, plinth + 0.1, mihD + 0.05, { shadeAt: (p) => Math.min(1, 0.62 + 0.6 * Math.max(0, p[1] + 0.1)) }, { back: true });
    faceBox(sink, 'plaster', bk, 0, (plinth + pTop) / 2, mihD / 2, mihW, pTop - plinth, mihD, {}, { back: true });
    faceBox(sink, 'plaster', bk, 0, eaveY - 0.07, (mihD + 0.06) / 2, mihW + 0.12, 0.14, mihD + 0.06, { decor: true, shade: 0.96 }, { back: true });
    const mf: Face = { origin: facePoint(bk, 0, 0, mihD), u: bk.u, out: bk.out, width: mihW };
    facePanel(sink, 'plaster', mf, 0, eaveY - 0.38, 0.006, mihW, 0.28, { decor: true, tint: MOSQUE_GREEN });
    facePanel(sink, 'plaster', mf, 0, plinth + 1.1, 0.006, 0.76, 1.5, { decor: true, shade: 0.7 });
    mosqueArch(sink, mf, 0, plinth + 1.85, 0.9, 0.1, MOSQUE_GREEN, look, false);
    for (let k = -1; k <= 1; k++) merlon(sink, mf, k * 0.5, pTop, 0.0, 0.2);

    // (dome-detail-275) the monsoon: the damp darkening the plinth and the wall's foot up to the sills, moss on the brick,
    // the black mould run down the walls under the spouts through the parapet
    const footFaces = (['left', 'right', 'back'] as const).map((n) => faces[n]);
    for (const face of footFaces) {
      const hw = face.width / 2 + 0.1;
      facePanel(sink, 'stone', face, 0, plinth / 2, 0.106, 2 * hw, plinth, { decor: true, shadeAt: (p) => 0.6 + 0.35 * Math.min(1, p[1] / plinth), tint: [0.9, 0.95, 0.86] });
      facePanel(sink, 'plaster', face, 0, plinth + 0.4, 0.008, face.width, 0.8, { decor: true, shadeAt: (p) => (p[1] < plinth + 0.1 ? 0.8 : 1), tintAt: (p) => (p[1] < plinth + 0.1 ? MOULD : [1, 1, 1]) });
      for (let k = 0, n = 2 + Math.floor(look() * 2); k < n; k++) {
        const w = 0.3 + look() * 0.6, h = 0.12 + look() * 0.3, u = -hw + w / 2 + look() * (2 * hw - w);
        facePanel(sink, 'stone', face, u, h / 2, 0.112, w, h, { decor: true, tint: MOSS, shadeAt: (p) => (p[1] < 0.02 ? 0.55 : 0.8) });
      }
    }
    for (const name of ['left', 'right', 'back'] as const) {
      const face = faces[name], hw = face.width / 2;
      for (const s of [-1, 1]) {
        const u = s * (hw - tR - 0.32);
        if (openings.some((o) => o.face === name && Math.abs(o.u - u) < o.w / 2 + 0.3) || !clearOf(facePoint(face, u, 0, 0.3))) continue;
        sink.pipe('structureMetal', facePoint(face, u, roofY + 0.06, 0.05), facePoint(face, u, roofY + 0.02, 0.48), 0.045, 6, { decor: true, caps: true, colour: rgb(0x4a4c4a) });
        const top = eaveY - 0.56, len = 1.6 + look() * 1.2, wid = 0.24 + look() * 0.14;
        facePanel(sink, 'plaster', face, u, top - len / 2, 0.008, wid, len,
          { decor: true, shadeAt: (p) => (p[1] > top - 0.01 ? 0.78 : 1), tintAt: (p) => (p[1] > top - 0.01 ? MOULD : [1, 1, 1]) });
      }
    }

    // (dome-detail-275) the court (sahn): its brick plinth a hand under the hall's floor, the lime floor on it, the low
    // wall round it with its coping, the gate's two piers with their caps and the steps down through it; damp and moss at
    // its foot; the tube well's hand pump for the ablutions in a front corner
    if (sahn) {
      const z0 = Dh / 2, z1 = Dh / 2 + court, hx = W / 2 + 0.08, top = plinth - 0.03, wt = 0.2, wh = 0.55, gap = 0.8;
      const damp = (p: Vec3): number => Math.min(1, 0.58 + 0.42 * Math.max(0, p[1] + 0.1) / 0.75);
      sink.span('stone', -hx, -0.3, z0 - 0.05, hx, top - 0.05, z1, { shadeAt: damp });
      sink.span('plaster', -hx + 0.03, top - 0.05, z0 - 0.05, hx - 0.03, top, z1 - 0.03, { shade: 0.88, tint: [0.97, 0.95, 0.9] });
      const wall = (xa: number, za: number, xb: number, zb: number) => {
        sink.span('plaster', xa, top - 0.05, za, xb, top + wh, zb, { shadeAt: (p) => (p[1] < top + 0.1 ? 0.82 : 1) });
        sink.span('plaster', xa - 0.03, top + wh, za - 0.03, xb + 0.03, top + wh + 0.07, zb + 0.03, { decor: true, shade: 0.93 });
      };
      for (const s of [-1, 1]) wall(s < 0 ? -hx : hx - wt, z0 + 0.12, s < 0 ? -hx + wt : hx, z1 - wt);
      wall(-hx, z1 - wt, -gap - 0.15, z1);
      wall(gap + 0.15, z1 - wt, hx, z1);
      for (const s of [-1, 1]) {
        const x = s * (gap + 0.15);
        sink.span('plaster', x - 0.17, top - 0.05, z1 - 0.32, x + 0.17, top + 1.0, z1 + 0.02);
        sink.span('plaster', x - 0.21, top + 1.0, z1 - 0.36, x + 0.21, top + 1.08, z1 + 0.06, { decor: true, tint: MOSQUE_GREEN });
        sink.revolve('plaster', [x, top + 1.08, z1 - 0.15], 'y', [[0, 0.1], [0.08, 0.14], [0.16, 0.1], [0.24, 0.03], [0.3, 0]], 12, { decor: true });
      }
      for (let k = 1; k <= 2; k++) {
        const t = top * (3 - k) / 3, wide = gap + 0.02 * k;
        sink.span('stone', -wide, -0.2, z1 - 0.02, wide, t, z1 + k * 0.3, { decor: true, shadeAt: damp });
      }
      const sides: Face[] = [
        { origin: [0, 0, z1], u: [1, 0, 0], out: [0, 0, 1], width: 2 * hx },
        { origin: [hx, 0, (z0 + z1) / 2], u: [0, 0, -1], out: [1, 0, 0], width: court },
        { origin: [-hx, 0, (z0 + z1) / 2], u: [0, 0, 1], out: [-1, 0, 0], width: court },
      ];
      for (const face of sides) for (let k = 0, n = 1 + Math.floor(look() * 2); k < n; k++) {
        const hw = face.width / 2, w = 0.3 + look() * 0.5, h = 0.1 + look() * 0.22, u = -hw + w / 2 + look() * (2 * hw - w);
        if (face === sides[0] && Math.abs(u) < gap + w / 2 + 0.1) continue;
        facePanel(sink, 'stone', face, u, h / 2, 0.008, w, h, { decor: true, tint: MOSS, shadeAt: (p) => (p[1] < 0.02 ? 0.55 : 0.8) });
      }
      const px = -hx + wt + 0.62, pz = z1 - wt - 0.62;
      // (the facade budget) the pump drawn plain: its cement apron, the barrel and its head, the handle and the spout
      const iron = pick(look, PUMP_IRON), pm = { decor: true, colour: iron };
      sink.span('structureWood', px - 0.45, top - 0.02, pz - 0.45, px + 0.45, top + 0.1, pz + 0.45, { decor: true, colour: rgb(0x87857f) });
      sink.cylinder('structureMetal', [px, top + 0.1, pz], 'y', 0.75, 0.07, 8, pm, 0.06, false);
      sink.cylinder('structureMetal', [px, top + 0.85, pz], 'y', 0.12, 0.085, 8, pm);
      sink.pipe('structureMetal', [px, top + 0.93, pz], [px + 0.6, top + 1.08, pz], 0.02, 5, pm);
      sink.pipe('structureMetal', [px, top + 0.62, pz], [px, top + 0.56, pz + 0.24], 0.025, 6, pm);
    }
  });
  return sink.finish();
};

/**
 * The gola (dome-detail-275, rebuilt: a plain twelve-sided drum under a twelve-facet cone): a round rice granary of
 * bamboo plastered with clay and dung, its body turned round and swelling a little to the eave, on a raised earth plinth
 * with a slumped skirt; three bamboo hoops binding it in relief; the
 * conical thatch laid in three courses, each one's butt lapping the course above, under a thick cut eave ragged with
 * straw, the topknot bound at the apex (or a clay pot turned over it); the plank hatch high under the eave, the bamboo
 * ladder leaned up to it, a winnowing tray against the plinth. Built the same on every tier (its fine joinery a phone
 * drops); the collision as before: the plinth, the body and a cone inside the thatch.
 */
const gola: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const look = ctx.variant, N = 24;
  const R = Math.max(1.4, Math.min(2.1, Math.min(ctx.info.w, ctx.info.d) / 2 - 0.4));
  const flare = 0.08 + look() * 0.05, eaveY = 2.5, apexY = 4.6 + look() * 0.3;
  const at = (y: number): number => R * (1 + flare * Math.sqrt(Math.min(1, Math.max(0, (y - 0.6) / (eaveY - 0.6)))));
  // the plinth: rammed earth, its sides battered, its top a ledge round the body; a skirt of slumped mud round its foot
  // (each closed underneath: regionalArchitecture's rays from under the ground saw into them)
  sink.revolve('plaster3', [0, 0, 0], 'y', [[-0.3, 0], [-0.3, R + 0.4], [0.35, R + 0.37], [0.6, R + 0.22], [0.6, 0]], N,
    { shadeAt: (p) => (p[1] < 0 ? 0.72 : 0.94) });
  sink.revolve('plaster3', [0, 0, 0], 'y', [[-0.04, R + 0.38], [-0.04, R + 0.68], [0.3, R + 0.385]], N, { decor: true, shade: 0.86 });
  // the body: clay on bamboo, damp at its foot where the rain splashes off the ledge
  sink.revolve('plaster2', [0, 0, 0], 'y', [0.55, 0.95, 1.5, 2.05, eaveY].map((y): [number, number] => [y, at(y)]), N,
    { shadeAt: (p) => Math.min(1, 0.68 + 0.32 * Math.max(0, p[1] - 0.55) / 0.5), tintAt: (p) => (p[1] < 0.7 ? [0.86, 0.9, 0.82] : [1, 1, 1]) });
  // the bamboo hoops binding it, each a split cane standing proud
  const cane = shade(BAMBOO, 0.86);
  for (const y of [0.95, 1.5, 2.05]) sink.revolve('structureWood', [0, 0, 0], 'y', [[y - 0.04, at(y - 0.04) - 0.005], [y, at(y) + 0.04], [y + 0.04, at(y + 0.04) - 0.005]], N, { decor: true, colour: cane });
  // the thatch: the eave's soffit and its thick cut edge, then three courses up the cone, each one's butt lapping out over
  // the course above it, a little full across its middle; greyer and darker where it weathers at the eave, a stain of
  // algae down one side (decor: its eave reaches past the plot; the collision is the cone inside it)
  const Re = R * 1.36, slope = (y: number): number => Re * (apexY - 0.15 - y) / (apexY - 0.15 - 2.68);
  const yb = [2.68, 2.68 + (apexY - 2.83) * 0.31, 2.68 + (apexY - 2.83) * 0.62, apexY - 0.28];
  const roof: Array<[number, number]> = [[eaveY - 0.04, at(eaveY) - 0.02], [2.4, Re], [2.68, Re + 0.04]];
  for (let k = 0; k < 3; k++) {
    if (k > 0) roof.push([yb[k], slope(yb[k]) + 0.12]);
    const m = (yb[k] + yb[k + 1]) / 2;
    roof.push([m, slope(m) + 0.03], [yb[k + 1], slope(yb[k + 1])]);
  }
  roof.push([apexY - 0.2, 0.08]);
  const algae = look() * 6.28;
  sink.revolve('straw', [0, 0, 0], 'y', roof, N, {
    decor: true,
    shadeAt: (p) => 0.78 + 0.22 * Math.min(1, Math.max(0, (p[1] - 2.4) / 1.2)),
    tintAt: (p) => {
      const g = Math.max(0, Math.cos(Math.atan2(p[2], p[0]) - algae)) ** 2 * (1 - Math.min(1, (p[1] - 2.4) / 1.6));
      return [0.92 - 0.2 * g, 0.92 - 0.08 * g, 0.9 - 0.22 * g];
    },
  });
  sink.cylinder('straw', [0, eaveY - 0.05, 0], 'y', apexY - eaveY - 0.2, at(eaveY) - 0.05, 8, {}, 0.08, false);
  // the eave's ragged straw: a fringe of tufts hanging from its cut edge, longer and shorter by turns, closed along its
  // ragged foot (a ray under it saw its inner face)
  const drop = (i: number): number => 0.05 + (i % 2) * 0.07 + hash01(i, R, 3.1) * 0.08;
  for (let i = 0; i < N; i++) {
    const a0 = i / N * Math.PI * 2, a1 = (i + 1) / N * Math.PI * 2;
    const P = (a: number, r: number, y: number): Vec3 => [Math.cos(a) * r, y, Math.sin(a) * r];
    const ro = Re + 0.006, ri = Re - 0.03, d0 = drop(i), d1 = drop((i + 1) % N);
    sink.quad('straw', P(a1, ro, 2.41 - d1), P(a0, ro, 2.41 - d0), P(a0, ro, 2.44), P(a1, ro, 2.44), { decor: true, shade: 0.8 });
    sink.quad('straw', P(a0, ri, 2.41 - d0), P(a1, ri, 2.41 - d1), P(a1, ri, 2.44), P(a0, ri, 2.44), { decor: true, shade: 0.62 });
    sink.quad('straw', P(a0, ro, 2.41 - d0), P(a1, ro, 2.41 - d1), P(a1, ri, 2.41 - d1), P(a0, ri, 2.41 - d0), { decor: true, shade: 0.55 });
  }
  // the topknot: the straw bound at the apex with a twist of jute, or a clay pot turned over it
  if (look() < 0.6) {
    sink.revolve('straw', [0, apexY - 0.3, 0], 'y', [[0, 0.24], [0.12, 0.13], [0.22, 0.1], [0.3, 0.13], [0.48, 0.06], [0.58, 0]], 12, { decor: true, shade: 0.9 });
    sink.revolve('structureWood', [0, apexY - 0.3, 0], 'y', [[0.15, 0.115], [0.19, 0.135], [0.24, 0.115]], 12, { decor: true, colour: rgb(0x7a6444) });
  } else {
    sink.revolve('structureWood', [0, apexY - 0.3, 0], 'y', [[0, 0.17], [0.12, 0.21], [0.26, 0.25], [0.4, 0.21], [0.5, 0.11], [0.53, 0]], 12, { decor: true, colour: pick(look, TERRACOTTA) });
  }
  // the hatch: a plank board in its frame high on the body's front, under the eave, its battens and the peg that bars it;
  // the bamboo ladder leaned up to its sill
  const hy = 2.02, face: Face = { origin: [0, 0, at(hy)], u: [1, 0, 0], out: [0, 0, 1], width: 1 };
  const plank = shade(WEATHERED_PLANK[1], 0.9);
  faceBox(sink, 'structureWood', face, 0, hy, 0.004, 0.56, 0.48, 0.056, { decor: true, colour: plank });
  for (const s of [-1, 1]) faceBox(sink, 'structureWood', face, s * 0.32, hy, 0.01, 0.07, 0.62, 0.08, { decor: true, colour: shade(plank, 0.8) });
  for (const s of [-1, 1]) faceBox(sink, 'structureWood', face, 0, hy + s * 0.29, 0.01, 0.72, 0.07, 0.08, { decor: true, colour: shade(plank, 0.8) });
  for (const y of [hy - 0.14, hy + 0.14]) faceBox(sink, 'structureWood', face, 0, y, 0.04, 0.48, 0.05, 0.025, { decor: true, colour: shade(plank, 0.72), fine: 'near' }, 'ends');
  sink.pipe('structureWood', facePoint(face, 0.2, hy, 0.02), facePoint(face, 0.2, hy, 0.12), 0.018, 5, { decor: true, caps: true, fine: 'near', colour: cane });
  if (look() < 0.75) ladder(sink, { ...face, origin: [0, 0, at(hy - 0.26) + 0.02] }, 0, 0.06, hy - 0.26, shade(BAMBOO, 0.8));
  // the winnowing tray (kula) of split bamboo leaned against the plinth round the side
  const ka = Math.PI * (0.15 + look() * 0.3) * (look() < 0.5 ? 1 : -1) - Math.PI / 2, kt = 0.5;
  const kc: Vec3 = [Math.cos(ka) * (R + 0.46), 0.3, Math.sin(ka) * (R + 0.46)];
  const kn: Vec3 = [Math.cos(ka) * Math.cos(kt), Math.sin(kt), Math.sin(ka) * Math.cos(kt)];
  sink.pipe('structureWood', [kc[0] - kn[0] * 0.02, kc[1] - kn[1] * 0.02, kc[2] - kn[2] * 0.02], [kc[0] + kn[0] * 0.02, kc[1] + kn[1] * 0.02, kc[2] + kn[2] * 0.02], 0.32, 14,
    { decor: true, caps: true, colour: shade(BAMBOO_MAT, 1.05) });
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
