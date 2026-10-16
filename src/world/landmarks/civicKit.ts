// src/world/landmarks/civicKit.ts — the civic set pieces' shared dressing (moved byte for byte out of civic.ts by the
// looks lane, r2 sweep 2026-10-16, when the church and the station moved into civicChurch.ts and civicStation.ts): the
// paints, the build's uv offset, the lit share, the door leaf, the cornice, the bell and the clock face.
import { PartSink, facePoint, rgb, type Face, type RegionalBucket, type Vec3 } from '../maps/regional/geometry.ts';
import { moulding, revolve, type ArchHole } from './kit.ts';
import type { LandmarkBuildContext } from './types.ts';

export const GREEN_IRON = rgb(0x4f7d5a), DOME_GREEN = rgb(0x3f7a52), GILT = rgb(0xb8933e), FRAME_WHITE = rgb(0xe8e4da);
export const DOOR_OAK = rgb(0x5e4636), BELL = rgb(0x5a4a32), IRON = rgb(0x2b2d2e), SLATE_BLUE = rgb(0x4a5560);

export const uvOffset = (rng: () => number): [number, number] => [rng() * 7.31, rng() * 5.17];

/** A share of the windows show a lit curtain at night. */
export const lit = (ctx: LandmarkBuildContext, share: number) => ctx.variant() < share;

/** A door leaf hung at the back of an arched opening's reveal: boarded oak with two iron straps. */
export function doorLeaf(sink: PartSink, face: Face, h: ArchHole, reveal: number): void {
  const o = -reveal + 0.03;
  const line: Vec3[] = [facePoint(face, h.u - h.w / 2, h.y0, o), facePoint(face, h.u + h.w / 2, h.y0, o)];
  const arch: Array<[number, number]> = [];
  const rise = h.form === 'flat' ? 0 : h.form === 'round' ? h.w / 2 : h.w * 0.74;
  for (let i = 0; i <= 8; i++) { const t = i / 8 * Math.PI; arch.push([h.u + Math.cos(t) * h.w / 2, h.spring + Math.sin(t) * rise]); }
  for (const [u, y] of arch) line.push(facePoint(face, u, y, o));
  sink.polygon('structureWood', line, { colour: DOOR_OAK, decor: true });
  for (const t of [0.22, 0.7]) {
    const y = h.y0 + (h.spring - h.y0) * t;
    const a = facePoint(face, h.u - h.w / 2 + 0.05, y, o + 0.02), b = facePoint(face, h.u + h.w / 2 - 0.05, y, o + 0.02);
    sink.member('structureMetal', a, b, 0.07, 0.02, face.out, { colour: IRON, decor: true, fine: true }, 0);
  }
}

/** The cornice of a body: a frieze band and a projecting crown over it. */
export function cornice(sink: PartSink, bucket: RegionalBucket, cx: number, cz: number, w: number, d: number, y: number, scale = 1): void {
  sink.placed(0, cx, 0, cz, () => {
    moulding(sink, bucket, w, d, y - 0.34 * scale, 0.2 * scale, 0.06 * scale);
    moulding(sink, bucket, w, d, y - 0.14 * scale, 0.18 * scale, 0.2 * scale);
  });
}

/** A bell: a revolved bronze bell hung under a beam at (x, y, z), `r` its mouth radius. */
export function bell(sink: PartSink, x: number, y: number, z: number, r: number): void {
  revolve(sink, 'structureMetal', x, z, [[r, y - r * 1.25], [r * 0.92, y - r * 1.12], [r * 0.62, y - r * 0.7], [r * 0.56, y - r * 0.2], [r * 0.4, y],
    [0.0, y + 0.02]], 10, { colour: BELL, decor: true });
  sink.span('structureMetal', x - 0.03, y, z - 0.03, x + 0.03, y + 0.18, z + 0.03, { colour: IRON, decor: true });
}

/** A clock face on a wall: a white disc on a dark ring, the hands at ten past ten. */
export function revolveDisc(sink: PartSink, face: Face, u: number, y: number, r: number): void {
  const ring: Vec3[] = [], dial: Vec3[] = [];
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2;
    ring.push(facePoint(face, u + Math.cos(a) * r, y + Math.sin(a) * r, 0.03));
    dial.push(facePoint(face, u + Math.cos(a) * r * 0.86, y + Math.sin(a) * r * 0.86, 0.045));
  }
  sink.polygon('structureMetal', ring, { colour: IRON, decor: true });
  sink.polygon('structureMetal', dial, { colour: rgb(0xe9e4d6), decor: true });
  sink.member('structureMetal', facePoint(face, u, y, 0.06), facePoint(face, u - r * 0.45, y + r * 0.3, 0.06), 0.07, 0.02, face.out, { colour: IRON, decor: true }, 0);
  sink.member('structureMetal', facePoint(face, u, y, 0.065), facePoint(face, u + r * 0.62, y + r * 0.36, 0.065), 0.05, 0.02, face.out, { colour: IRON, decor: true }, 0);
}

/**
 * A tower clock (the looks lane, r2 sweep 2026-10-16: revolveDisc pasted a dark disc on the wall under a white one, its
 * hands flat bars): the white dial set in a moulded roundel of the wall's own masonry standing a hand proud of the face,
 * the black chapter ring painted on the dial and twelve hour batons inside it, and the hands at ten past ten — each a
 * slender bar ending in an open lozenge, as a turret clock's hands are pierced. (u, y) its centre on the face, r the dial's
 * radius, `frame` the roundel's masonry.
 */
export function towerClock(sink: PartSink, face: Face, u: number, y: number, r: number, frame: RegionalBucket): void {
  const n = 16, dial = 0.05, lip = 0.11, rim = r * 1.16;
  const at = (a: number, rr: number, o: number): Vec3 => facePoint(face, u + Math.cos(a) * rr, y + Math.sin(a) * rr, o);
  const iron = { colour: IRON, decor: true }, fine = { colour: IRON, decor: true, fine: true };
  const disc: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2;
    // the roundel: its face, its outer edge back to the wall and its inner edge down to the dial
    sink.quad(frame, at(a0, r, lip), at(a0, rim, lip), at(a1, rim, lip), at(a1, r, lip), { decor: true });
    sink.quad(frame, at(a0, rim, lip), at(a0, rim, 0), at(a1, rim, 0), at(a1, rim, lip), { decor: true, fine: true });
    sink.quad(frame, at(a1, r, lip), at(a1, r, dial), at(a0, r, dial), at(a0, r, lip), { decor: true });
    // the chapter ring
    sink.quad('structureMetal', at(a0, r * 0.8, dial + 0.003), at(a0, r * 0.87, dial + 0.003), at(a1, r * 0.87, dial + 0.003), at(a1, r * 0.8, dial + 0.003), iron);
    disc.push(at(a0, r, dial));
  }
  sink.polygon('structureMetal', disc, { colour: rgb(0xe9e4d6), decor: true });
  const stroke = (a: Vec3, b: Vec3, w: number) => sink.member('structureMetal', a, b, w, 0.008, face.out, fine, 0);
  for (let k = 0; k < 12; k++) {
    const a = k / 12 * Math.PI * 2;
    stroke(at(a, r * 0.66, dial + 0.003), at(a, r * (k % 3 === 0 ? 0.78 : 0.75), dial + 0.003), Math.min(0.035, r * 0.045));
  }
  // the hands: the hour hand to ten, the minute hand to two, each a bar ending in an open lozenge
  for (const [a, len, o, w] of [[Math.PI * 5 / 6, 0.56, dial + 0.012, 0.04], [Math.PI / 6, 0.84, dial + 0.024, 0.032]] as const) {
    const pt = (t: number, s: number): Vec3 => facePoint(face, u + Math.cos(a) * r * t - Math.sin(a) * r * s, y + Math.sin(a) * r * t + Math.cos(a) * r * s, o);
    const l0 = len - 0.26, lm = len - 0.15, half = 0.075, bw = Math.min(w, r * 0.05) * 0.6;
    stroke(pt(-0.1, 0), pt(l0, 0), Math.min(w, r * 0.05));
    stroke(pt(l0, 0), pt(lm, half), bw);
    stroke(pt(l0, 0), pt(lm, -half), bw);
    stroke(pt(lm, half), pt(len, 0), bw);
    stroke(pt(lm, -half), pt(len, 0), bw);
  }
}
