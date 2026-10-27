// The technical drawing as static markup (258): what the viewer (technicalDrawing.ts) draws for one view and kind, for a
// page with no script (the Field Manual's prerender): the plate (1x and 2x), the overlay's outlines, the numbered badges
// spread for a phone's width, and the key (labels in the active locale, the legend, a scale bar sized as a share of the
// drawing's width). The same classes as the viewer, so technicalDrawing.css styles both; every tone is a token
// (data-tone). Pure; no DOM. First-party: Kevin B. Liu (NOTICE.md).
import { t } from './i18n.ts';
import { TECHNICAL_LEGENDS, type TechnicalKind } from './technicalDiagramLegend.ts';
import { spreadBadges, technicalLabelText } from './technicalDiagramLabels.ts';
import { numberedElements, technicalPlateUrl, type TechnicalDrawingData, type TechnicalView } from './technicalDrawingData.ts';

const SVG = 'http://www.w3.org/2000/svg';
/** A static page spreads its badges for the narrowest box a phone draws, at the viewer's badge spacing. */
const STATIC_BOX_CSS_PX = 320;
const BADGE_GAP_CSS_PX = 17;
const esc = (text: string): string => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const tone = (name: string | null | undefined): string => (name ? ` data-tone="${esc(name)}"` : '');

export function technicalDrawingMarkup(data: TechnicalDrawingData, view: TechnicalView, kind: TechnicalKind,
  { alt, base = '/icons/' }: { readonly alt: string; readonly base?: string }): string {
  const v = data.views[view];
  if (!v) throw new Error(`technical drawing ${data.id}: no ${view} view`);
  const [w, h] = v.size, numbered = numberedElements(v, kind);
  const pct = (value: number, of: number): string => `${(100 * value / of).toFixed(3)}%`;
  const spots = spreadBadges(numbered.map((element) => element.at!), BADGE_GAP_CSS_PX * w / STATIC_BOX_CSS_PX, { width: w, height: h });
  const paths = [...v.layers[kind]].reverse().map((element) =>
    `<path class="cot-td__el" fill-rule="evenodd"${tone(element.tone)} d="${element.d}"/>`).join('');
  const badges = numbered.map((element, index) =>
    `<b class="cot-td__badge"${tone(element.tone)} style="--td-x:${pct(spots[index]![0], w)};--td-y:${pct(spots[index]![1], h)}">${index + 1}</b>`).join('');
  const label = (element: (typeof numbered)[number]): string => technicalLabelText({ ...element, anchor: [0, 0], weight: 0, color: '' }, kind);
  const rows = numbered.map((element, index) =>
    `<li><span class="cot-td__row"><b class="cot-td__n"${tone(element.tone)}>${index + 1}</b>${esc(label(element))}</span></li>`).join('');
  const legend = TECHNICAL_LEGENDS[kind].map(([name, swatch]) => `<span><i class="cot-td__swatch"${tone(swatch)}></i>${esc(t(name))}</span>`).join('');
  // the scale bar: the round length nearest a fifth of the drawing's width
  const metres = [0.5, 1, 2, 5].reduce((best, m) => (Math.abs(m * v.pxPerM - w / 5) < Math.abs(best * v.pxPerM - w / 5) ? m : best), 1);
  const plate1 = technicalPlateUrl(data.id, view, 1, base), plate2 = technicalPlateUrl(data.id, view, 2, base);
  // (the key is the picture's, aria-hidden like the labels it replaces: a page's search index leaves it out)
  return `<div class="cot-td cot-td--static" data-kind="${kind}"><div class="cot-td__stage" style="--td-aspect:${w} / ${h}"><div class="cot-td__zoom">`
    + `<img class="cot-td__plate" src="${plate1}" srcset="${plate1} 1x, ${plate2} 2x" width="${w / 2}" height="${h / 2}" alt="${esc(alt)}" loading="lazy" decoding="async">`
    + `<svg class="cot-td__overlay" xmlns="${SVG}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">${paths}</svg>`
    + `<div class="cot-td__badges" aria-hidden="true">${badges}</div></div></div>`
    + `<!--nosearch--><div class="cot-td__key" aria-hidden="true"><ol class="cot-td__list">${rows}</ol><div class="cot-td__legend">${legend}</div>`
    + `<div class="cot-td__scale"><i style="--td-scale:${pct(metres * v.pxPerM, w)}"></i><span>${metres} ${esc(t('gallery.unit.m'))}</span></div></div><!--/nosearch--></div>`;
}
