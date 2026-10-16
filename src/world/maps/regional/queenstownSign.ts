// src/world/maps/regional/queenstownSign.ts — the Empire Hotel's name board over its verandah (queenstown.ts hotel),
// extracted (the looks lane's r2 sweep, sub-stream b-east, 2026-10-16: lane B is parked, so its builder was taken
// extract-then-own) and rebuilt here. The r2 sweep read its capitals as twelve painted plates (foundryoffice@queenstown on
// Copper Mesa: dark letters 4 cm off a cream board 4 cm off the brick). The board is now a signwriter's board on the
// parapet: a deep box frame 14 cm proud of the brick, its moulded rails round a dark ground, the name in cream capitals
// raised on it (the west coast's pubs lettered light on dark).
import { faceBox, pick, rgb, type Face, type PartSink, type Rgb } from './geometry.ts';

/**
 * A painted name read at range: one block per capital at the capital's own width (an I or J narrow, an M or W wide),
 * centred on the face at height `y` across `span` metres, `out` proud of it. Dressing.
 */
function lettering(sink: PartSink, f: Face, word: string, y: number, h: number, span: number, out: number, colour: Rgb): void {
  const n = word.length, pitch = span / n;
  for (let k = 0; k < n; k++) {
    if (word[k] === ' ') continue;
    const w = pitch * ('IJ.'.includes(word[k]) ? 0.32 : 'MW&'.includes(word[k]) ? 0.86 : 0.66);
    faceBox(sink, 'structureWood', f, -span / 2 + pitch * (k + 0.5), y, out, w, h, 0.02, { colour, decor: true, fine: true });
  }
}

/** The name board over the hotel's verandah: its box frame, its dark ground, the name in cream. */
export function hotelNameBoard(sink: PartSink, f: Face, W: number, rng: () => number): void {
  const bw = W * 0.56, y = 8.55, bh = 0.62, deep = 0.14;
  // the board: its ground in the box frame, set 3 cm back from the frame's face
  faceBox(sink, 'structureWood', f, 0, y, (deep - 0.03) / 2, bw - 0.16, bh - 0.16, deep - 0.03, { colour: GROUND, decor: true });
  // the frame's rails round it, moulded (a rail and its bead), the full depth off the brick
  for (const side of [-1, 1]) {
    faceBox(sink, 'structureWood', f, 0, y + side * (bh / 2 - 0.04), deep / 2, bw, 0.08, deep, { colour: FRAME, decor: true });
    faceBox(sink, 'structureWood', f, side * (bw / 2 - 0.04), y, deep / 2, 0.08, bh - 0.16, deep, { colour: FRAME, decor: true });
    faceBox(sink, 'structureWood', f, 0, y + side * (bh / 2 - 0.095), deep - 0.02, bw - 0.16, 0.03, 0.03, { colour: LINE, decor: true, fine: true });
  }
  // the name raised on the ground in cream capitals
  lettering(sink, f, pick(rng, ['EMPIRE HOTEL', 'HOTEL CENTRAL', 'MT LYELL M & R CO']), y, 0.3, W * 0.5, deep - 0.02, LINE);
}

/** The board's dark ground, its frame and its cream letters and bead. */
const GROUND = rgb(0x2c3a30), FRAME = rgb(0x3a2a22), LINE = rgb(0xe4e0d4);
