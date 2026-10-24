// Line charts for the manual, as inline SVG drawn to one scale. Copyright © 2026 Kevin B. Liu.
// Every mark, tick and label sits on the same scale; every tick names a value the axis reaches; the colours are the
// manual's tokens through classes (chapters.css .dm-chart), so the chart reads in the page's theme. DOM-free.

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
  const W = 640, H = 300, left = 52, right = 16, top = 14, bottom = 40;
  const sx = (v: number): number => left + ((v - x.min) / (x.max - x.min)) * (W - left - right);
  const sy = (v: number): number => top + (1 - (Math.min(v, y.max) - y.min) / (y.max - y.min)) * (H - top - bottom);
  const grid = y.ticks.map((v) => `<line class="g" x1="${left}" x2="${W - right}" y1="${f(sy(v))}" y2="${f(sy(v))}"/>`
    + `<text class="t" x="${left - 8}" y="${f(sy(v))}" text-anchor="end" dominant-baseline="central">${v}</text>`).join('');
  const xticks = x.ticks.map((v) => `<line class="k" x1="${f(sx(v))}" x2="${f(sx(v))}" y1="${H - bottom}" y2="${H - bottom + 5}"/>`
    + `<text class="t" x="${f(sx(v))}" y="${H - bottom + 18}" text-anchor="middle">${v}</text>`).join('');
  const lines = series.map((s) => {
    const d = s.points.map(([px, py], i) => `${i ? 'L' : 'M'}${f(sx(px))} ${f(sy(py))}`).join('');
    const last = s.points.at(-1);
    const end = s.end && last ? `<path class="x s-${s.tone}" d="M${f(sx(last[0]) - 5)} ${f(sy(last[1]) - 5)}l10 10m0 -10l-10 10"/>` : '';
    return `<path class="l s-${s.tone}" d="${d}"/>${end}`;
  }).join('');
  const axes = `<line class="a" x1="${left}" x2="${W - right}" y1="${H - bottom}" y2="${H - bottom}"/><line class="a" x1="${left}" x2="${left}" y1="${top}" y2="${H - bottom}"/>`
    + `<text class="u" x="${W - right}" y="${H - 6}" text-anchor="end">${esc(x.label)} (${esc(x.unit)})</text>`
    + `<text class="u" x="${left}" y="${top - 2}" text-anchor="start" dominant-baseline="auto">${esc(y.unit)}</text>`;
  const legend = series.map((s) => `<li><i class="s-${s.tone}" aria-hidden="true"></i><span>${esc(s.label)}${s.end ? ` <small>${esc(s.end)}</small>` : ''}</span></li>`).join('');
  return `<figure class="dm-chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">${grid}${xticks}${axes}${lines}</svg>`
    + `<figcaption><ul>${legend}</ul></figcaption></figure>`;
}
