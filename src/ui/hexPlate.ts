// The HUD's hexagon (notices-polish-277; Kevin 2026-11-24, on live 276: "the tank/missile/airfraft warnings are circles rn.
// change them to hexagons", after notices-276b's "hexagons look better for the bigger notis"). Copyright © 2026 Kevin B. Liu.
//
// One shape, one place: flat along its top and its foot, a point at each end, the run of each slant `point`. Every hexagon
// the battle HUD draws comes from here:
// - the notice plates' clip (hud.ts --notice-cut: the event lane's seat, the condition lane's notices, the detection, the gun
//   limit chip, Air Support's readout), as hexPlateClip with the plate's own --notice-point;
// - the kill card's plate (hudKillRibbon.ts), the same clip with its larger point;
// - the rim warnings' bubbles (pointers/pointerLayer.ts), as SVG paths: hexBubblePath, the plate drawn round a centre with
//   its point half its radius (the regular hexagon), and its outline for the air run's countdown.
// Pure: no DOM (the receipts run it in Node).

/** The plate's corners in order from the top of the left slant, clockwise, for a box `w` by `h` with slant run `point`
 *  (each as [x, y] from the box's top left). */
export function hexPlateCorners(w: number, h: number, point: number): ReadonlyArray<readonly [number, number]> {
  const p = Math.max(0, Math.min(point, w / 2));
  return [[p, 0], [w - p, 0], [w, h / 2], [w - p, h], [p, h], [0, h / 2]];
}

/** The plate as a CSS clip for its own box, `point` any CSS length (a var() reads the element's own value). */
export function hexPlateClip(point: string): string {
  return `polygon(${point} 0,calc(100% - ${point}) 0,100% 50%,calc(100% - ${point}) 100%,${point} 100%,0 50%)`;
}

/** The regular plate round a centre (a bubble): circumradius `r`, its points at the left and the right, its top and foot
 *  flat; as an SVG path closed on its first corner. */
export function hexBubblePath(cx: number, cy: number, r: number): string {
  const corners = hexPlateCorners(2 * r, Math.sqrt(3) * r, r / 2);
  const x0 = cx - r, y0 = cy - (Math.sqrt(3) / 2) * r;
  return `${corners.map(([x, y], i) => `${i ? 'L' : 'M'}${(x0 + x).toFixed(2)},${(y0 + y).toFixed(2)}`).join('')}Z`;
}

/** The bubble's outline from the middle of its top edge, clockwise and back (a countdown's stroke, dashed by its share of
 *  hexBubblePerimeter). */
export function hexBubbleOutline(r: number): string {
  const h = (Math.sqrt(3) / 2) * r;
  const f = (n: number): string => n.toFixed(2);
  return `M0,${f(-h)}L${f(r / 2)},${f(-h)}L${f(r)},0L${f(r / 2)},${f(h)}L${f(-r / 2)},${f(h)}L${f(-r)},0L${f(-r / 2)},${f(-h)}Z`;
}

/** The regular plate's perimeter (six sides of its circumradius). */
export function hexBubblePerimeter(r: number): number {
  return 6 * r;
}

/** The bubble's circumradius for a round warning of radius `r`: its inscribed circle (√3/2 of it) keeps the glyph's room. */
export function hexBubbleRadius(r: number): number {
  return r * 1.12;
}
