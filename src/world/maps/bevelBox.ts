// src/world/maps/bevelBox.ts — a box with its long edges chamfered (props census r2 sweep, Lane C 2026-10-16: the
// bunkers-r2 bar's box-only share, tools/r2-standard.mjs boxShare). A sawn plank, a squared post or a cut block is never
// a perfect box: its arrises are eased. The section is the w x h rectangle with each corner cut by `c` (an octagon),
// run along the box's longest side, so a plank, a post and a beam each take the bevel down their length. Indexed, with
// position, normal and uv, like three's BoxGeometry (so it merges with the boxes and cylinders beside it).
import * as THREE from 'three';

/**
 * A `w` x `h` x `d` box (x, y, z sizes, centred on the origin) with its four edges along its longest side chamfered by
 * `c` (at most a third of the section's smaller side). UVs run `uvScale` repeats a metre: along the run and round the
 * section on the sides, the section's plane on the ends.
 */
export function bevelBox(w: number, h: number, d: number, c = 0.02, uvScale = 0.5): THREE.BufferGeometry {
  const sizes = [w, h, d];
  // the run's axis (the longest side) and the section's two axes in order
  const run = sizes[0] >= sizes[1] && sizes[0] >= sizes[2] ? 0 : sizes[1] >= sizes[2] ? 1 : 2;
  const [a, b] = run === 0 ? [1, 2] : run === 1 ? [2, 0] : [0, 1];
  const ha = sizes[a] / 2, hb = sizes[b] / 2, hl = sizes[run] / 2;
  const k = Math.max(0, Math.min(c, Math.min(ha, hb) * 0.66));
  // the section, counter-clockwise seen from +run (a, b right-handed with the run axis)
  const sec: Array<[number, number]> = k > 1e-5
    ? [[ha, -hb + k], [ha, hb - k], [ha - k, hb], [-ha + k, hb], [-ha, hb - k], [-ha, -hb + k], [-ha + k, -hb], [ha - k, -hb]]
    : [[ha, -hb], [ha, hb], [-ha, hb], [-ha, -hb]];
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  const P = (pa: number, pb: number, pl: number): [number, number, number] => {
    const v: [number, number, number] = [0, 0, 0];
    v[a] = pa; v[b] = pb; v[run] = pl;
    return v;
  };
  const push = (p: [number, number, number], n: [number, number, number], u: number, vv: number): number => {
    pos.push(p[0], p[1], p[2]); nor.push(n[0], n[1], n[2]); uv.push(u * uvScale, vv * uvScale);
    return pos.length / 3 - 1;
  };
  // the sides: one quad an edge of the section, its own normal (flat shading at the arrises)
  let around = 0;
  for (let i = 0; i < sec.length; i++) {
    const [a0, b0] = sec[i], [a1, b1] = sec[(i + 1) % sec.length];
    const ea = a1 - a0, eb = b1 - b0, len = Math.hypot(ea, eb);
    const n = P(eb / len, -ea / len, 0);
    const i0 = push(P(a0, b0, -hl), n, around, -hl), i1 = push(P(a1, b1, -hl), n, around + len, -hl);
    const i2 = push(P(a1, b1, hl), n, around + len, hl), i3 = push(P(a0, b0, hl), n, around, hl);
    idx.push(i0, i1, i2, i0, i2, i3);
    around += len;
  }
  // the ends: fans over the section
  for (const end of [1, -1]) {
    const n = P(0, 0, end);
    const first = pos.length / 3;
    for (const [pa, pb] of sec) push(P(pa, pb, end * hl), n, pa, pb);
    for (let i = 1; i + 1 < sec.length; i++) {
      if (end > 0) idx.push(first, first + i, first + i + 1);
      else idx.push(first, first + i + 1, first + i);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/**
 * A prism of the section `sec` (x across, y up; counter-clockwise seen from +z, convex or not) run `len` along z, centred
 * on the origin (the looks lane, 227; the r2 sweep: a rail's flat-bottom section, a ballast bed's crowned top, where a
 * box stood). Indexed, with position, normal and uv like bevelBox: `uvScale` repeats a metre along the run and round the
 * section, the section's plane on the ends (none with `caps` false).
 */
export function sectionPrism(sec: ReadonlyArray<readonly [number, number]>, len: number, uvScale = 0.5, caps = true): THREE.BufferGeometry {
  const hl = len / 2;
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  const push = (x: number, y: number, z: number, n: readonly [number, number, number], u: number, v: number): number => {
    pos.push(x, y, z); nor.push(n[0], n[1], n[2]); uv.push(u * uvScale, v * uvScale);
    return pos.length / 3 - 1;
  };
  let around = 0;
  for (let i = 0; i < sec.length; i++) {
    const [x0, y0] = sec[i], [x1, y1] = sec[(i + 1) % sec.length];
    const ex = x1 - x0, ey = y1 - y0, l = Math.hypot(ex, ey);
    if (l < 1e-6) continue;
    const n: [number, number, number] = [ey / l, -ex / l, 0];
    const i0 = push(x0, y0, -hl, n, around, -hl), i1 = push(x1, y1, -hl, n, around + l, -hl);
    const i2 = push(x1, y1, hl, n, around + l, hl), i3 = push(x0, y0, hl, n, around, hl);
    idx.push(i0, i1, i2, i0, i2, i3);
    around += l;
  }
  // (`caps` false: a run whose ends always abut the next — a rail between its spans — draws no ends)
  const tris = caps ? THREE.ShapeUtils.triangulateShape(sec.map(([x, y]) => new THREE.Vector2(x, y)), []) : [];
  for (const end of caps ? [1, -1] : []) {
    const first = pos.length / 3;
    for (const [x, y] of sec) push(x, y, end * hl, [0, 0, end], x, y);
    for (const [a, b, c] of tris) {
      if (end > 0) idx.push(first + a, first + b, first + c);
      else idx.push(first + a, first + c, first + b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
