// src/world/maps/regional/queenstownTrestle.ts — the tank trestle's deck (queenstown.ts tankTrestle), extracted (the looks
// lane's r2 sweep, sub-stream b-east, 2026-10-16: lane B is parked, so its builder was taken extract-then-own) and rebuilt
// here. The r2 sweep measured the trestle 0.61 plain boxes by area (watertower@queenstown on Copper Mesa), the deck one
// bare 16 cm slab the most of it. The deck is now its boards over the bearers with the edge board round them: the boards'
// underside held 4 cm in from the edge board, which stands to the deck's full reach (the slab's), its top the deck's.
import type { PartSink, Rgb, Vec3 } from './geometry.ts';

/** The trestle's deck over its bearers, P square at legH: the boards and the edge board round them. */
export function trestleDeck(sink: PartSink, P: number, legH: number, colour: Rgb): void {
  const h = P / 2, y0 = legH + 0.14, y1 = legH + 0.3, e = 0.04;
  // a section round the square (proud of its edge, height), counter-clockwise from above: the boards' underside in from
  // the edge, the edge board's foot, its face up to the deck
  const ring = (o: number, y: number): Vec3[] => [[-h - o, y, h + o], [h + o, y, h + o], [h + o, y, -h - o], [-h - o, y, -h - o]];
  const section: Array<[number, number]> = [[-e, y0], [0, y0 + 0.06], [0, y1]];
  const rings = section.map(([o, y]) => ring(o, y));
  for (let k = 0; k + 1 < rings.length; k++) {
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      sink.quad('structureWood', rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i], { colour });
    }
  }
  // the boards' face and their underside (closed: the deck is the catwalk's floor)
  sink.polygon('structureWood', rings[rings.length - 1], { colour });
  sink.polygon('structureWood', [...rings[0]].reverse(), { colour: [colour[0] * 0.8, colour[1] * 0.8, colour[2] * 0.8] });
}
