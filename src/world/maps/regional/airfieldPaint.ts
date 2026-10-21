// src/world/maps/regional/airfieldPaint.ts — an airfield's painted numbers on its hangars (the Hostomel kit; the maps
// lane's Kestrel rebuild, 2026-10-15, from the map-revival lane's round 2, 571a1c6ef: gauntlet wave 113 read the
// maintenance hangars as "plain flat-textured boxes"). Every hangar on an airport carries its number, in white on its
// sheet by the apron end.
import { PartSink, faceBox, rgb, type Face, type Rgb } from './geometry.ts';

const SEGMENTS: Readonly<Record<number, string>> = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcfgd' };
const NUMBER_WHITE = rgb(0xe8e6de);

/**
 * A painted numeral on a face: seven-segment strokes of paint, `h` tall with its foot at y, centred at u, `o` out from
 * the face (dressing), in one opaque paint (where two strokes meet they share the colour).
 */
function paintedNumeral(sink: PartSink, face: Face, u: number, y: number, h: number, digit: number, colour: Rgb, o = 0.05): void {
  const w = h * 0.55, t = h * 0.12;
  const seg: Record<string, [number, number, number, number]> = {
    a: [u, y + h - t / 2, w, t], d: [u, y + t / 2, w, t], g: [u, y + h / 2, w, t],
    f: [u - w / 2 + t / 2, y + h * 0.75, t, h / 2], b: [u + w / 2 - t / 2, y + h * 0.75, t, h / 2],
    e: [u - w / 2 + t / 2, y + h * 0.25, t, h / 2], c: [u + w / 2 - t / 2, y + h * 0.25, t, h / 2],
  };
  for (const k of SEGMENTS[digit] ?? '') {
    const [su, sy, sw, sh] = seg[k];
    faceBox(sink, 'structureMetal', face, su, sy, o, sw, sh, Math.min(0.02, 2 * o), { colour, decor: true });
  }
}

/**
 * A sheet hall's number painted on a long wall (hall.ts: its seams every 3 m from 1.5 m in, 2 cm proud), in the bay
 * between the seams nearest the apron end (+z), its foot `foot` over the wall's base `y0`, the paint lying on the sheet
 * under the seams' faces. `width` is the wall's length along the face.
 */
export function hangarSideNumber(sink: PartSink, face: Face, width: number, y0: number, h: number, digit: number): void {
  const seams: number[] = [];
  for (let u = -width / 2 + 1.5; u < width / 2 - 0.6; u += 3) seams.push(u);
  if (seams.length < 2) return;
  // the bay nearest the apron end: the face's u runs toward +z or away from it
  const u = face.u[2] > 0 ? seams[seams.length - 1] - 1.5 : seams[0] + 1.5;
  paintedNumeral(sink, face, u, y0, Math.min(h, 2.2), digit, NUMBER_WHITE, 0.006);
}
