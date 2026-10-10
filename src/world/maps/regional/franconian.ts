// src/world/maps/regional/franconian.ts — the Franconian town kit (Steinburg: the walled hill towns of Franconia and
// Saxony — Kronach, Meissen, Pappenheim). Three- and four-storey town houses close along the streets: a ground storey
// of sandstone ashlar or render with an arched door or a shop window, framed upper storeys jettied over the street or a
// rendered front in ochre, cream, rose or pale green with sandstone dressings; steep plain-tile roofs, gable-fronted to
// the street or eaves-fronted with dormers, a hoist gable for the loft. The framing and openings are the Fachwerk kit's
// (hessian.ts) under a Franconian palette; the rows replace the street rows and the block-fill row houses.
import { PartSink, faceBox, pick, rgb, type Face, type RegionalBucket, type RegionalParts, type Rgb } from './geometry.ts';
import { buildHouse, emitRoof, roofGeometry, storeyFaces, windowRhythm, type HouseFrame, type HouseSpec, type Opening, type RoofSpec } from './house.ts';
import { flowerBox } from './dressing.ts';
import { doorCanopy, dressedQuoin, facadeOn, facadeRng, gableWindows, paintSurround, roofDormers, trimRun, windowHead } from './facade.ts';
import { windowUnit } from './openings.ts';
import {
  bindFachwerk, hessianDialect, houseUvOffset, roofFor, stateFor, withPalette, type FachwerkPalette,
} from './hessian.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';

export const FRANCONIAN_PALETTE: FachwerkPalette = Object.freeze({
  // Franconian framing runs to oxblood and deep brown, the doors to green and red (the facades lane, round 6; wave 241 on
  // Steinburg: "the saturated vermilion-orange timber ... oxblood or dark brown is the period colour") — the reds a
  // fifth darker and less orange, the oxide-and-blood paint dulled by its years
  timbers: [0x66302a, 0x582a24, 0x5a4334, 0x6c3f32].map(rgb),
  frame: rgb(0xcfcabd),
  doors: [0x426b49, 0x7a3024, 0x6a4b33, 0x4f6274].map(rgb),
  shutters: [0x4a7451, 0x7a3a2a, 0x667a86].map(rgb),
  shutterShare: 0.4, hungGable: 0.08, stoneGround: 0.7, halfHip: 0.15,
  // the upper storeys' casements two-light, a single mullion (the town's 160 houses carry ~3,000 windows)
  upperBars: 'two',
});

/** The town house: a street front three or four storeys high, framed or rendered, gable- or eaves-fronted. */
const townHouse: RegionalBuilder = (ctx) => {
  const sink = new PartSink(houseUvOffset(ctx));
  const st = stateFor(ctx, ctx.rng);
  const rng = st.rng;
  const W = Math.max(6.4, ctx.info.w - 0.25), D = Math.max(7.6, ctx.info.d - 0.25);
  const gableFront = rng() < 0.55;
  const framed = rng() < 0.55;
  const count = rng() < 0.35 ? 4 : 3;
  // the street front is +z; an eaves-fronted house is built along x and turned so its long side faces the street
  const bw = gableFront ? W : D, bd = gableFront ? D : W;
  const streetFace = gableFront ? 'front' : 'left';
  const render: RegionalBucket = ctx.wallBucket === 'stone' ? 'plaster' : ctx.wallBucket as RegionalBucket;
  const sts: HouseSpec['storeys'] = [];
  for (let i = 0; i < count; i++) {
    const ground = i === 0;
    sts.push({
      h: ground ? 3.1 + rng() * 0.3 : 2.75 + rng() * 0.2,
      wall: ground ? (rng() < 0.6 ? 'stone' : render) : framed ? st.infill : render,
      framed: !ground && framed,
      // framed storeys oversail the street
      jetty: !ground && framed ? (gableFront ? [0.22, 0, 0, 0] : [0, 0, 0, 0.22]) : undefined,
    });
  }
  const openings: Opening[] = [];
  const streetWidth = gableFront ? bw : bd;
  const shop = rng() < 0.45;
  openings.push({ face: streetFace, storey: 0, kind: 'door', u: shop ? -streetWidth * 0.3 : (rng() - 0.5) * streetWidth * 0.4, w: 1.15, y0: 0, h: 2.45 });
  if (shop) openings.push({ face: streetFace, storey: 0, kind: 'shopfront', u: streetWidth * 0.14, w: Math.min(3.2, streetWidth * 0.45), y0: 0, h: 2.7 });
  sts.forEach((_, i) => {
    for (const face of ['front', 'right', 'back', 'left'] as const) {
      const width = face === 'front' || face === 'back' ? bw : bd;
      const avoid: Array<[number, number]> = openings.filter((o) => o.face === face && o.storey === i).map((o) => [o.u - o.w / 2, o.u + o.w / 2]);
      const street = face === streetFace;
      if (!street && (face === 'right' || face === 'left') && gableFront) continue; // party walls in the row
      if (!street && !gableFront && (face === 'front' || face === 'back')) continue;
      for (const o of windowRhythm(face, i, width, { w: 0.85, h: i === 0 ? 1.3 : 1.25, sill: i === 0 ? 1.0 : 0.8, spacing: street ? 1.55 : 2.2, margin: 0.75, avoid })) openings.push(o);
    }
  });
  const roof: RoofSpec = { ...roofFor(rng, { halfHip: 0.12, pitch: [50, 58] }), eave: 0.32, verge: 0.18 };
  const build = () => {
    const frame = buildHouse(sink, {
      w: bw, d: bd, plinth: { h: 0.3, out: 0.05, bucket: 'stone' }, storeys: sts, roof,
      gableFramed: framed, gableBucket: framed ? st.infill : render, openings,
      chimneys: [{ x: (rng() - 0.5) * bw * 0.3, z: (rng() - 0.5) * bd * 0.4, sx: 0.55, sz: 0.6, above: 0.8, bucket: 'stone', cap: 'slab' }],
      gutters: { colour: rgb(0x8c9193) }, verge: framed ? { colour: st.timber, bucket: 'structureWood' } : null,
    }, hessianDialect(st));
    if (!framed && facadeOn()) townFront(sink, frame, streetFace, gableFront, render, st.door);
    if (facadeOn()) townDormers(sink, frame, gableFront, framed ? st.infill : render, st);
    // (facade craft, desktop; wave 150 named a jettied corner house's flower boxes as what works) geraniums in boxes
    // under most of the upper storeys' street windows on about half the houses, from the facade stream
    if (facadeOn()) {
      const f = facadeRng();
      if (f() < 0.55) {
        const box = pick(f, TOWN_BOXES), bloom = pick(f, TOWN_BLOOMS);
        for (const o of frame.spec.openings) {
          if (o.face !== streetFace || o.kind !== 'window' || o.state || o.storey < 1 || o.storey > 2 || f() > 0.75) continue;
          flowerBox(sink, storeyFaces(frame, o.storey)[streetFace], o.u, frame.floors[o.storey] + o.y0, o.w, box, bloom, f, true);
        }
      }
    }
    // (facade craft, desktop; wave 116 read "blank gables") the attic's windows in a rendered gable — a framed gable's
    // timbers carry its own — clear of the street gable's loft door
    if (facadeOn() && !framed && frame.roof.gable) {
      const top = frame.bodies[frame.bodies.length - 1], cx = (top.x0 + top.x1) / 2, cz = (top.z0 + top.z1) / 2, hd = (top.z1 - top.z0) / 2;
      // (no sill: an attic light's sill would add to Steinburg's shadow casters, near their cap; wave 150 read windows
      // "set flush in the wall": each in a painted Fasche, its frame standing well out of the render)
      const f = facadeRng(), fasche = pick(f, FASCHEN);
      const style = { ...st.window, shutters: null, bars: 'two' as const, sill: null, frameOut: Math.max(st.window.frameOut, 0.07) };
      for (const end of [1, -1] as const) {
        const face: Face = { origin: [cx, 0, cz + end * hd], u: [end, 0, 0], out: [0, 0, end], width: top.x1 - top.x0 };
        gableWindows(frame.roof.gable, frame.eaveY, frame.roof.ridgeY, gableFront && end > 0 ? 1.1 : 0, (u, y, w, h) => {
          // (the attic light's frame and bars draw near the camera only: PartSink.near)
          sink.near(() => windowUnit(sink, face, u, y, w, h, style, f, 0.25));
          // (paint in the first render family: its fine paint draws by the fine-detail cells, out of the shadow maps)
          paintSurround(sink, 'plaster', face, u, y, w, h, 0.12, fasche);
        });
      }
    }
    // rendered fronts: sandstone quoins and a cornice (round 10; wave 301: quoins "about three times real size": 33 cm
    // courses of long and short stones, 50 and 30 cm)
    if (!framed) {
      const b = frame.bodies[0];
      for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]] as const) {
        const x = sx > 0 ? b.x1 : b.x0, z = sz > 0 ? b.z1 : b.z0;
        for (let y = 0.4, k = 0; y < frame.eaveY - 0.3; y += 0.35, k++) {
          const lx = k % 2 ? 0.3 : 0.5, lz = k % 2 ? 0.5 : 0.3;
          dressedQuoin(sink, 'stone', sx > 0 ? x - lx : x - 0.035, y, sz > 0 ? z - lz : z - 0.035, sx > 0 ? x + 0.035 : x + lx, y + 0.33, sz > 0 ? z + 0.035 : z + lz, sx, sz, { decor: true });
        }
      }
    }
    // a hoist dormer for the loft in the street roof of eaves-fronted houses, or a loft door in the street gable
    const rg = frame.roof;
    if (!gableFront) {
      const ex = -rg.s, y = frame.eaveY;
      const dw = 1.6, dz = (rng() - 0.5) * bd * 0.3;
      sink.span(render, ex - 0.05, y - 0.4, dz - dw / 2, ex + 1.2, y + 1.6, dz + dw / 2);
      const cap: RoofSpec = { kind: 'gable', pitchDeg: 48, eave: 0.12, verge: 0.12, thickness: 0.12, bucket: 'roof', ridge: 'round' };
      sink.placed(Math.PI / 2, ex + 0.55, 0, dz, () => emitRoof(sink, roofGeometry(dw + 0.1, 1.4, y + 1.6, cap), cap));
      windowUnit(sink, { origin: [ex - 0.05, 0, dz], u: [0, 0, 1], out: [-1, 0, 0], width: dw }, 0, y + 0.2, 0.8, 1.05, { ...st.window, shutters: null }, rng, 0.2);
    } else if (rg.gable) {
      const f = frame.faces.front;
      faceBox(sink, 'structureWood', f, 0, frame.eaveY + 1.6, 0.03, 0.9, 1.2, 0.05, { colour: st.timber, decor: true });
      faceBox(sink, 'structureWood', f, 0, frame.eaveY + 2.5, 0.5, 0.14, 0.14, 1.0, { colour: st.timber, decor: true });
    }
  };
  if (gableFront) build();
  else sink.placed(Math.PI / 2, 0, 0, 0, build);
  return sink.finish();
};

/** The town's window boxes and their geraniums (facade craft). */
const TOWN_BOXES: readonly Rgb[] = [0x4a3a2c, 0x3e5a3a, 0x6a4a30, 0x2e3e52].map(rgb);
const TOWN_BLOOMS: readonly Rgb[] = [0xc0242a, 0xd23a5a, 0xc8462e, 0xe0e0d8].map(rgb);

/** Faschen: the render bands painted round a town house's windows, lighter or darker than its render, or a colour. */
const FASCHEN: readonly Rgb[] = [[1.3, 1.28, 1.22], [0.72, 0.71, 0.68], [1.14, 0.84, 0.6], [0.86, 0.6, 0.5], [0.8, 0.9, 0.8], [1.25, 1.18, 1.05]];

/**
 * The dormers of a town house's steep roof (facade craft, desktop): gabled or shed dormers along the slopes a row
 * shows — both side slopes of a gable-fronted house, the back slope of an eaves-fronted one (its street slope has its
 * hoist dormer). The roof frame is the top body's.
 */
function townDormers(sink: PartSink, frame: HouseFrame, gableFront: boolean, wall: RegionalBucket, st: ReturnType<typeof stateFor>): void {
  const f = facadeRng();
  if (f() < 0.25) return;
  const rg = frame.roof, top = frame.bodies[frame.bodies.length - 1];
  const len = 2 * rg.halfD - 2.4, n = len > 6 ? 2 : len > 1.6 ? 1 : 0;
  if (!n || rg.kind === 'flat' || rg.kind === 'shed') return;
  const zs = n === 1 ? [(f() - 0.5) * len * 0.3] : [-len / 4, len / 4];
  const kind = f() < 0.6 ? 'gable' as const : 'shed' as const;
  sink.placed(0, (top.x0 + top.x1) / 2, 0, (top.z0 + top.z1) / 2, () => roofDormers(sink, rg, gableFront ? [1, -1] : [1], zs, {
    kind, wall, covering: 'roof',
    window: (face, u, y, w, h) => windowUnit(sink, face, u, y, w, h, { ...st.window, shutters: null, bars: 'cross' }, f, 0.3),
  }));
}

/**
 * A rendered town front's masonry (facade craft, desktop): sandstone string courses at the floors and a cornice at
 * the eaves (on an eaves-fronted house) or across the gable's foot, returned round the corners; the windows of the
 * rendered storeys inside painted Faschen, the first floor's under sandstone hoods on the grander houses; a canopy over
 * the street door. From the facade stream (the build stream as before).
 */
function townFront(sink: PartSink, frame: HouseFrame, streetFace: 'front' | 'left', gableFront: boolean, render: RegionalBucket, door: Rgb): void {
  const f = facadeRng();
  const face = frame.faces[streetFace], half = face.width / 2;
  const fasche = pick(f, FASCHEN), hoods = f() < 0.55, courses = f() < 0.92, canopy = f() < 0.35;
  const stoneTrim: RegionalBucket = f() < 0.7 ? 'stone' : render;
  const trim = stoneTrim === 'stone' ? {} : { tint: fasche };
  if (courses) {
    for (let i = 1; i < frame.floors.length; i++) {
      trimRun(sink, stoneTrim, face, -half, half, frame.floors[i] - 0.14, [{ h: 0.08, out: 0.05 }, { h: 0.12, out: 0.12 }], { ret: 0.3, ...trim });
    }
  }
  // the cornice: under the street eaves, or across the street gable's foot
  trimRun(sink, stoneTrim, face, -half, half, frame.eaveY - (gableFront ? 0.3 : 0.27),
    [{ h: 0.12, out: 0.06 }, { h: 0.09, out: 0.14 }, { h: 0.14, out: gableFront ? 0.22 : 0.26 }], { ret: 0.4, ...trim });
  for (const o of frame.spec.openings) {
    if (o.face !== streetFace || o.state) continue;
    const wall = frame.spec.storeys[o.storey].wall, y0 = frame.floors[o.storey] + o.y0;
    if (o.kind === 'window' && wall !== 'stone') {
      paintSurround(sink, wall, face, o.u, y0, o.w, o.h, 0.16, fasche);
      if (o.storey === 1 && hoods) windowHead(sink, face, o.u, y0 + o.h + 0.13, o.w + 0.26, { kind: 'hood', bucket: 'stone', h: 0.2, out: 0.12, ext: 0.04 });
    } else if (o.kind === 'door' && canopy) {
      doorCanopy(sink, face, o.u, y0 + o.h + 0.2, o.w, { kind: 'shed', bucket: 'roof', timber: door, depth: 0.75 });
    }
  }
}

export const FRANCONIAN_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  rowhouse: withPalette(FRANCONIAN_PALETTE, townHouse),
  ...bindFachwerk(FRANCONIAN_PALETTE, ['tavern', 'schoolhouse', 'cornershop', 'ruin', 'church', 'depot', 'cottage', 'farmhouse', 'barn']),
});

export const FRANCONIAN_STYLE: ArchitectureStyle = Object.freeze<ArchitectureStyle>({
  id: 'franconian',
  region: 'Upper Franconia and Saxony (Kronach, Meissen): walled hill towns of framed and rendered town houses under plain tiles',
  surfaces: {
    // w2/w3 captures: the first tints made the old town a sea of new orange tile (roof pixels at saturation 0.53 in the
    // establishing view, the base town's dark sheets 0.37); old plain tiles weather to a duller brown-red
    roof: { kind: 'beavertail', tint: [0.42, 0.28, 0.22] },
    // (wave 116: "oversized clean ashlar") the town's dressed stone smaller and soiled, the Hessian villages' kept
    stone: { kind: 'sandstone', tint: [0.64, 0.52, 0.42], dressed: true },
    // (the facades lane, 2026-10-08; the media lane's critics on Steinburg: the stucco "speckled", dots rather than render;
    // round 7 had halved the photo render's relief) the walls are a hand-floated lime render, broadly mottled, painted
    // for the street (regionalSurfaces.ts paintLimeRender), its three families under the map's tones; the photo render
    // set is off here (its 2.4 m tile repeated a lichen motif down every wall), so is round 7's relief (the painter's own
    // relief is the float's slow undulation)
    sourced: { plaster: false, wood: true },
    render: { kind: 'limeRender', seed: 0x5e1b },
  },
  builders: FRANCONIAN_BUILDERS,
  // the churchyard on the church's freest side but its front, walled in stone, its graves in place of the yards' beds
  // (yards.ts; a map opts in: props `churchyard: true`; the facades lane, 2026-10-06)
  churchyard: { kinds: ['church'], fence: 'wallstone', gate: 'gate', shed: null, garden: false, graves: true, keepFront: true },
  // render in cream, ochre and pale pink; roofs from a few fresher red ones through brown to the grey-brown and dark
  // patina of old tiles (the cooler multipliers take the red out as well as the light)
  weather: {
    plaster: [[1, 1, 1], [1, 0.95, 0.86], [1, 0.92, 0.88], [0.97, 0.96, 0.92], [1, 0.9, 0.8]],
    stone: [[1, 1, 1], [0.92, 0.9, 0.88], [1.04, 0.98, 0.94]],
    roof: [[1.06, 0.96, 0.92], [1, 1, 1], [0.9, 0.88, 0.88], [0.78, 0.86, 0.92], [0.7, 0.78, 0.86], [0.82, 0.92, 1.0]],
    damp: 0.8, moss: 0.5,
  },
  wear: 0.25,
  // the yards of the outlying farms: sandstone walls round a kitchen garden, a gate (yards.ts)
  yard: { kinds: ['cottage', 'farmhouse'], fence: 'wallstone', gate: 'gate', shed: null, garden: true },
});

export type { RegionalParts, RegionalBuildContext };
