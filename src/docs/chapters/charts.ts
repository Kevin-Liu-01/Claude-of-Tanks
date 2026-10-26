// Line charts for the manual, as inline SVG drawn to one scale. Copyright © 2026 Kevin B. Liu.
// Every mark, tick and label sits on the same scale; every tick names a value the axis reaches; the colours are the
// manual's tokens through classes (chapters.css .dm-chart), so the chart reads in the page's theme. DOM-free.
// The chart scales as a picture, so its type, tick marks and label offsets are drawn in "furniture" groups (.dm-k), each
// placed at its anchor on the plot (a rule, a gridline, a corner) and counter-scaled about it by the chart's units per
// drawn pixel (chapters.css, --dm-chart-k): inside one, a unit is a drawn pixel at every width, so a phone keeps the
// desktop's 5 px tick marks, its clearances from the rules and its type.

export interface ChartSeries {
  readonly label: string;
  /** [x, y] in the axes' units */
  readonly points: ReadonlyArray<readonly [number, number]>;
  /** the series' colour class: a, b, c or d (chapters.css .dm-chart .s-a ...) */
  readonly tone: 'a' | 'b' | 'c' | 'd';
  /** where the line stops and why (a ricochet past this angle): a cross at the last point with this note */
  readonly end?: string;
}

interface Axis { readonly min: number; readonly max: number; readonly ticks: readonly number[]; readonly unit: string; readonly label: string }

const esc = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const f = (n: number): string => String(Math.round(n * 10) / 10);

/** A line chart: series over two axes, a legend under it, and an accessible name. */
export function lineChart(options: { readonly x: Axis; readonly y: Axis; readonly series: readonly ChartSeries[]; readonly title: string }): string {
  const { x, y, series, title } = options;
  // the top margin holds the y unit over the plot at a phone's counter-scale (about 2 units a drawn pixel)
  const W = 640, H = 300, left = 64, right = 36, top = 34, bottom = 40;
  const sx = (v: number): number => left + ((v - x.min) / (x.max - x.min)) * (W - left - right);
  const sy = (v: number): number => top + (1 - (Math.min(v, y.max) - y.min) / (y.max - y.min)) * (H - top - bottom);
  // furniture anchored at (ax, ay), drawn in drawn pixels about it
  const k = (ax: number, ay: number, inner: string): string => `<g transform="translate(${f(ax)} ${f(ay)})"><g class="dm-k">${inner}</g></g>`;
  const grid = y.ticks.map((v) => `<line class="g" x1="${left}" x2="${W - right}" y1="${f(sy(v))}" y2="${f(sy(v))}"/>`
    + k(0, sy(v), `<text class="t" dominant-baseline="central">${v}</text>`)).join('');
  // each tick: its 5 px mark under the rule, its value 18 px under it (the label's top 9 px clear of the mark)
  const xticks = x.ticks.map((v) => k(sx(v), H - bottom, `<line class="k" y2="5"/><text class="t" y="18" text-anchor="middle">${v}</text>`)).join('');
  const lines = series.map((s) => {
    const d = s.points.map(([px, py], i) => `${i ? 'L' : 'M'}${f(sx(px))} ${f(sy(py))}`).join('');
    const last = s.points.at(-1);
    const end = s.end && last ? `<path class="x s-${s.tone}" d="M${f(sx(last[0]) - 5)} ${f(sy(last[1]) - 5)}l10 10m0 -10l-10 10"/>` : '';
    return `<path class="l s-${s.tone}" d="${d}"/>${end}`;
  }).join('');
  const axes = `<line class="a" x1="${left}" x2="${W - right}" y1="${H - bottom}" y2="${H - bottom}"/><line class="a" x1="${left}" x2="${left}" y1="${top}" y2="${H - bottom}"/>`
    // the x title sits on the axis's right end inside the plot (the manual's charts leave that corner empty), its baseline
    // 8 px over the rule; the y unit stands over the plot's top-left corner, 6 px clear of the y axis and of the top
    // gridline
    + k(W - right, H - bottom, `<text class="u" y="-8" text-anchor="end">${esc(x.label)} (${esc(x.unit)})</text>`)
    + k(left, top, `<text class="u" x="6" y="-6" text-anchor="start" dominant-baseline="auto">${esc(y.unit)}</text>`);
  const legend = series.map((s) => `<li><i class="s-${s.tone}" aria-hidden="true"></i><span>${esc(s.label)}${s.end ? ` <small>${esc(s.end)}</small>` : ''}</span></li>`).join('');
  return `<figure class="dm-chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">${grid}${xticks}${axes}${lines}</svg>`
    + `<figcaption><ul>${legend}</ul></figcaption></figure>`;
}
