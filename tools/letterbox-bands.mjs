// Letterbox bands in a picture's pixels (owner 2026-10-26, on the battle load screen: "there are still black bars above
// and below the images here!!! fix that!!! no more object containns LOL"). Copyright © 2026 Kevin B. Liu.
//
// letterboxBands(data, width, height) reads RGBA pixels (an ImageData's) of one picture frame as composited and returns
// its bands: matching runs of solid, near-black rows at the top and bottom, or columns at the left and right, each at
// least 4 px and 1.5% of that side. A line is solid when 99% of its pixels sit within 6 levels of its mean colour, and
// near black when that colour's luminance is at most 0.12: a contain fit's bars and a bar laid over a picture are both,
// while a night scene's dark sky is neither uniform nor mirrored. It is self-contained, so tools/letterbox-bands.browser.mjs
// runs its source in the page; tools/letterbox-bands.selftest.mjs pins it on synthetic frames.

/** The bands in one frame: [{ axis: 'top and bottom' | 'left and right', sizes: [a, b], colour: [r, g, b] }]. */
export function letterboxBands(data, width, height) {
  const solid = (count, at) => {
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < count; i++) { const p = at(i); r += data[p]; g += data[p + 1]; b += data[p + 2]; }
    r /= count; g /= count; b /= count;
    if ((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.12) return null;
    let off = 0;
    for (let i = 0; i < count; i++) {
      const p = at(i);
      if (Math.abs(data[p] - r) > 6 || Math.abs(data[p + 1] - g) > 6 || Math.abs(data[p + 2] - b) > 6) off++;
    }
    return off <= count * 0.01 ? [Math.round(r), Math.round(g), Math.round(b)] : null;
  };
  const row = (y) => solid(width, (i) => (y * width + i) * 4);
  const column = (x) => solid(height, (i) => (i * width + x) * 4);
  const run = (line, from, step, limit) => {
    let n = 0;
    let colour = null;
    for (let i = from; n < limit; i += step, n++) {
      const c = line(i);
      if (!c) break;
      colour = colour ?? c;
    }
    return { n, colour };
  };
  const found = [];
  const pair = (a, b, side, axis) => {
    const least = Math.max(4, Math.round(side * 0.015));
    if (a.n >= least && b.n >= least && Math.abs(a.n - b.n) <= Math.max(3, Math.max(a.n, b.n) * 0.25)) {
      found.push({ axis, sizes: [a.n, b.n], colour: a.colour });
    }
  };
  pair(run(row, 0, 1, height >> 1), run(row, height - 1, -1, height >> 1), height, 'top and bottom');
  pair(run(column, 0, 1, width >> 1), run(column, width - 1, -1, width >> 1), width, 'left and right');
  return found;
}
