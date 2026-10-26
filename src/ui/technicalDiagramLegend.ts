// The technical diagrams' tones and legends (253): data only, shared by the DOM labels (technicalDiagramLabels.ts) and the
// Gallery's inspection overlay (src/gallery/overlays.ts) without either carrying the other. The tones are design tokens
// (tokens.json component.surface-diagram, their own sheet and module): the overlay paints their resolved values
// (surface-diagram.ts, which only the diagrams import: the boot's tokens.ts carries none), the DOM marks an element
// data-tone=<tone> and technicalDiagramLabels.css maps it to the token, so no colour is written as a literal.
// First-party: Kevin B. Liu (NOTICE.md).
import { SURFACE_TOKENS } from './tokens/surface-diagram.ts';

export type TechnicalKind = 'armor' | 'modules' | 'crew';

/** A tone's resolved colour (#rrggbb), from its token. */
export function technicalToneHex(tone: string): string {
  const value = (SURFACE_TOKENS as Readonly<Record<string, string>>)[`diagram-${tone}`];
  if (!value) throw new Error(`technical diagrams: no token for the tone ${tone}`);
  return value;
}

/** A tone's resolved colour as a number, for the 3D overlay's materials. */
export function technicalToneColor(tone: string): number {
  return Number.parseInt(technicalToneHex(tone).slice(1), 16);
}

let toneByHex: Map<string, string> | null = null;
/** The tone a sidecar's recorded colour came from (the overlay paints tone values), or null for a colour no tone has. */
export function technicalToneOf(color: string): string | null {
  if (!toneByHex) {
    toneByHex = new Map();
    for (const [key, value] of Object.entries(SURFACE_TOKENS)) toneByHex.set(value.toLowerCase(), key.slice(8));
  }
  return toneByHex.get(color.toLowerCase()) ?? null;
}

/** Each kind's legend: an i18n key and its tone. */
export const TECHNICAL_LEGENDS: Readonly<Record<TechnicalKind, readonly (readonly [key: string, tone: string])[]>> = Object.freeze({
  armor: Object.freeze([
    ['gallery.legend.armor.0', 'armor-ke-0'], ['gallery.legend.armor.1', 'armor-ke-1'], ['gallery.legend.armor.2', 'armor-ke-2'],
    ['gallery.legend.armor.3', 'armor-ke-3'], ['gallery.legend.armor.4', 'armor-ke-4'], ['gallery.legend.armor.era', 'armor-era'],
  ] as const),
  modules: Object.freeze([
    ['gallery.legend.modules.ammunition', 'module-ammo-rack'], ['gallery.legend.modules.fuel', 'module-fuel-tank'],
    ['gallery.legend.modules.engine', 'module-engine'], ['gallery.legend.modules.optics', 'module-optics'],
    ['gallery.legend.modules.other', 'module-radio'],
  ] as const),
  crew: Object.freeze([
    ['gallery.legend.crew.driver', 'crew-driver'], ['gallery.legend.crew.gunner', 'crew-gunner'],
    ['gallery.legend.crew.commander', 'crew-commander'], ['gallery.legend.crew.loader', 'crew-loader'],
    ['gallery.legend.crew.specialist', 'crew-radio-operator'],
  ] as const),
});
