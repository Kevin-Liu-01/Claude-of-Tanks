// The technical diagrams' legends (253): data only, shared by the DOM labels (technicalDiagramLabels.ts) and the
// Gallery's inspection overlay (src/gallery/overlays.ts inspectionLegend) without either carrying the other.
// First-party: Kevin B. Liu (NOTICE.md).

export type TechnicalKind = 'armor' | 'modules' | 'crew';

/** Each kind's legend: an i18n key and its swatch (the inspection overlay's colours, src/gallery/overlays.ts). */
export const TECHNICAL_LEGENDS: Readonly<Record<TechnicalKind, readonly (readonly [key: string, color: string])[]>> = Object.freeze({
  armor: Object.freeze([
    ['gallery.legend.armor.0', '#e96959'], ['gallery.legend.armor.1', '#f39a45'], ['gallery.legend.armor.2', '#f2cf5b'],
    ['gallery.legend.armor.3', '#a8d85d'], ['gallery.legend.armor.4', '#50d890'], ['gallery.legend.armor.era', '#c18cff'],
  ] as const),
  modules: Object.freeze([
    ['gallery.legend.modules.ammunition', '#ff4d5f'], ['gallery.legend.modules.fuel', '#e76f51'],
    ['gallery.legend.modules.engine', '#f0a23a'], ['gallery.legend.modules.optics', '#5ee1d2'],
    ['gallery.legend.modules.other', '#78a9ff'],
  ] as const),
  crew: Object.freeze([
    ['gallery.legend.crew.driver', '#63d6ff'], ['gallery.legend.crew.gunner', '#ffd166'],
    ['gallery.legend.crew.commander', '#b9f18c'], ['gallery.legend.crew.loader', '#ff8fab'],
    ['gallery.legend.crew.specialist', '#9eb7ff'],
  ] as const),
});
