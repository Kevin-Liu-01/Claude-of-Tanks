// src/world/maps/regional/queenstownSign.ts — the Empire Hotel's name board over its verandah (queenstown.ts hotel),
// extracted as it was (the looks lane's r2 sweep, sub-stream b-east, 2026-10-16: lane B is parked, so its builder is
// taken extract-then-own) for this lane to rebuild on the r2 standard.
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

/** The name board over the hotel's verandah: its ground, the name, its rules. */
export function hotelNameBoard(sink: PartSink, f: Face, W: number, rng: () => number): void {
    faceBox(sink, 'structureWood', f, 0, 8.55, 0.04, W * 0.56, 0.62, 0.04, { colour: rgb(0xe4e0d4), decor: true });
    lettering(sink, f, pick(rng, ['EMPIRE HOTEL', 'HOTEL CENTRAL', 'MT LYELL M & R CO']), 8.55, 0.3, W * 0.5, 0.065, rgb(0x3a2a22));
    for (const yy of [8.27, 8.83]) faceBox(sink, 'structureWood', f, 0, yy, 0.065, W * 0.54, 0.04, 0.02, { colour: rgb(0x5a4030), decor: true });
}
