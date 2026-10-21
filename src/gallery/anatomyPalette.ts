// Gallery anatomy palette: the absolute armor ramp, the anatomy systems and the crew roles.
// Pure data (no DOM, no Three.js) so the fleet receipt and the browser view share one table.

/** Which plate value the armor heat map shows. */
export type ArmorMetric = 'ke' | 'ce' | 'physical';
export const ARMOR_METRICS: readonly ArmorMetric[] = Object.freeze(['ke', 'ce', 'physical']);

/**
 * Absolute protection ramp, thin to thick. Lightness rises monotonically with thickness, so the order survives every
 * colour-vision type and greyscale: thin plates read dark and hot, the thickest read pale and cool.
 */
export const ARMOR_RAMP: ReadonlyArray<readonly [mm: number, hex: string]> = Object.freeze([
  [0, '#5c1a3a'],
  [20, '#8a2140'],
  [50, '#c23a3b'],
  [100, '#e26a32'],
  [180, '#f2a23a'],
  [300, '#f4d35a'],
  [450, '#c6e16f'],
  [650, '#7fd9a8'],
  [900, '#a9e9f2'],
  [1200, '#e8fbff'],
] as const);

/** Legend ticks for the ramp (absolute millimetres). */
export const ARMOR_RAMP_TICKS: readonly number[] = Object.freeze([0, 50, 100, 180, 300, 450, 650, 900, 1200]);

/** Add-on layers are not one thickness: they keep their own identity colours. */
export const ARMOR_LAYER_COLORS = Object.freeze({
  era: '#b48cff',
  spaced: '#57b8ff',
  external: '#9aa4ad',
  housing: '#d9b867',
});

function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** sRGB 0–255 triple for an absolute thickness on the ramp (linear interpolation between stops, clamped). */
export function armorRampRgb(mm: number): [number, number, number] {
  const value = Number.isFinite(mm) ? Math.max(0, mm) : 0;
  const stops = ARMOR_RAMP;
  if (value <= stops[0][0]) return hexToRgb(stops[0][1]);
  for (let index = 1; index < stops.length; index += 1) {
    const [upper, upperHex] = stops[index];
    if (value > upper) continue;
    const [lower, lowerHex] = stops[index - 1];
    const t = (value - lower) / (upper - lower);
    const a = hexToRgb(lowerHex), b = hexToRgb(upperHex);
    return [0, 1, 2].map((axis) => Math.round(a[axis] + (b[axis] - a[axis]) * t)) as [number, number, number];
  }
  return hexToRgb(stops[stops.length - 1][1]);
}

export function armorRampHex(mm: number): string {
  return `#${armorRampRgb(mm).map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

/** CSS linear-gradient stops for the legend bar; positions follow the tick spacing, not raw millimetres. */
export function armorRampGradient(): string {
  const last = ARMOR_RAMP.length - 1;
  return ARMOR_RAMP.map(([, hex], index) => `${hex} ${((index / last) * 100).toFixed(1)}%`).join(', ');
}

/** Legend position (0–1) of a thickness, piecewise linear over the ramp stops. */
export function armorRampPosition(mm: number): number {
  const last = ARMOR_RAMP.length - 1;
  for (let index = 1; index <= last; index += 1) {
    const [upper] = ARMOR_RAMP[index];
    if (mm > upper && index < last) continue;
    const [lower] = ARMOR_RAMP[index - 1];
    return Math.min(1, Math.max(0, (index - 1 + (Math.min(mm, upper) - lower) / (upper - lower)) / last));
  }
  return 1;
}

export type AnatomySystem = 'mobility' | 'firepower' | 'ammunition' | 'fuel' | 'electronics' | 'crew';
export const ANATOMY_SYSTEMS: readonly AnatomySystem[] = Object.freeze(
  ['mobility', 'ammunition', 'fuel', 'firepower', 'electronics', 'crew']);

export const SYSTEM_COLORS: Readonly<Record<AnatomySystem, string>> = Object.freeze({
  mobility: '#5a7fb8',
  firepower: '#8e8f88',
  ammunition: '#c4573f',
  fuel: '#d9b867',
  electronics: '#78d0e0',
  crew: '#ece6d8',
});

/** The anatomy system of a combat module id (src/sim/moduleCatalog.ts). Unknown ids fall back to firepower. */
export function moduleSystem(module: string): AnatomySystem {
  switch (module) {
    case 'engine': case 'transmission': case 'trackL': case 'trackR': return 'mobility';
    case 'ammoRack': case 'autoloader': case 'missileRack': case 'feedSystem': return 'ammunition';
    case 'fuelTank': return 'fuel';
    case 'optics': case 'radio': return 'electronics';
    default: return 'firepower';
  }
}

export type CrewRole = 'commander' | 'gunner' | 'loader' | 'driver' | 'radio';
export const CREW_ROLE_COLORS: Readonly<Record<CrewRole, string>> = Object.freeze({
  commander: '#9ec9ff',
  gunner: '#ff9e7a',
  loader: '#c6a2ff',
  driver: '#7ee0b5',
  radio: '#ece8de',
});

/** Map a combat crew id (driver, assistantLoader, weaponOperatorLeft, …) onto the five drawn roles. */
export function crewRole(crew: string): CrewRole {
  if (crew === 'commander') return 'commander';
  if (crew === 'gunner' || crew.startsWith('weaponOperator')) return 'gunner';
  if (crew === 'loader' || crew === 'assistantLoader') return 'loader';
  if (crew === 'driver' || crew === 'assistantDriver') return 'driver';
  return 'radio';
}

export const CREW_ROLE_LETTERS: Readonly<Record<CrewRole, string>> = Object.freeze({
  commander: 'C', gunner: 'G', loader: 'L', driver: 'D', radio: 'R',
});
