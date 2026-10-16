// src/world/maps/regional/airfieldPaint.ts — an airfield's painted numbers on its hangars (the Hostomel kit; the maps
// lane's Kestrel rebuild, 2026-10-15, from the map-revival lane's round 2, 571a1c6ef: gauntlet wave 113 read the
// maintenance hangars as "plain flat-textured boxes"). Every hangar on an airport carries its number, in white on the
// fixed door leaf.
import { PartSink, faceBox, rgb, type Face, type Rgb } from './geometry.ts';

const SEGMENTS: Readonly<Record<number, string>> = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcfgd' };
const NUMBER_WHITE = rgb(0xe8e6de);

/**
 * A painted numeral on a face: seven-segment strokes of paint, `h` tall with its foot at y, centred at u, `o` out from
 * the face (dressing), in one opaque paint (where two strokes meet they share the colour).
 */
export function paintedNumeral(sink: PartSink, face: Face, u: number, y: number, h: number, digit: number, colour: Rgb, o = 0.05): void {
  const w = h * 0.55, t = h * 0.12;
  const seg: Record<string, [number, number, number, number]> = {
    a: [u, y + h - t / 2, w, t], d: [u, y + t / 2, w, t], g: [u, y + h / 2, w, t],
    f: [u - w / 2 + t / 2, y + h * 0.75, t, h / 2], b: [u + w / 2 - t / 2, y + h * 0.75, t, h / 2],
    e: [u - w / 2 + t / 2, y + h * 0.25, t, h / 2], c: [u + w / 2 - t / 2, y + h * 0.25, t, h / 2],
  };
  for (const k of SEGMENTS[digit] ?? '') {
    const [su, sy, sw, sh] = seg[k];
    faceBox(sink, 'structureMetal', face, su, sy, o, sw, sh, 0.02, { colour, decor: true });
  }
}

/**
 * A sheet hall's number on its closed sliding leaf (hall.ts hallDoors: two leaves of half the opening and a hand more, the
 * right one closed on the inner track, the left run across it by `open` of its width): the numeral painted on the part
 * of the closed leaf the open one leaves showing, a third of the way up. `u` is the opening's centre, `w` and `h` its
 * clear width and height, `lift` its sill over the face's origin.
 */
export function hangarDoorNumber(sink: PartSink, face: Face, door: { u: number; w: number; h: number; lift: number; open: number }, digit: number): void {
  const lw = door.w / 2 + 0.15;
  const a = door.u - door.w / 4 + door.open * lw + lw / 2, b = door.u + door.w / 4 + lw / 2 - 0.3;
  const vis = b - a;
  const h = Math.min(2.2, door.h * 0.34, (vis - 0.4) / 0.55);
  if (h < 0.9) return;
  // (the inner track's leaf face stands 0.17 out, its stiles and rail 0.215: the paint on them)
  paintedNumeral(sink, face, (a + b) / 2, door.lift + door.h * 0.3, h, digit, NUMBER_WHITE, 0.235);
}
