/**
 * Pure camouflage catalog and boundary policy.
 *
 * Keep this module DOM/WebGL-free: lobby and ranked authority import it to
 * validate public match metadata without pulling the texture painter into a
 * server process. Custom patterns are deliberately absent from the network
 * allowlist and remain local single-player presentation only.
 */

export const CUSTOM_CAMO_BRUSHES = Object.freeze([
  'round', 'flat', 'spray', 'pixel', 'eraser', 'stamp',
] as const);
export const CUSTOM_CAMO_ASSETS = Object.freeze([
  'star', 'chevron', 'leaf', 'hex', 'cross',
] as const);

export type CustomCamoBrush = typeof CUSTOM_CAMO_BRUSHES[number];
export type CustomCamoAsset = typeof CUSTOM_CAMO_ASSETS[number];

export interface CustomCamoStroke {
  color: 0 | 1;
  size: number;
  brush: CustomCamoBrush;
  asset: CustomCamoAsset;
  rotation: number;
  points: Array<[number, number]>;
}

export interface CustomCamo {
  style: CustomCamoStyle;
  base: string;
  colorA: string;
  colorB: string;
  repeat: number;
  repeatX: number;
  repeatY: number;
  rotation: number;
  mirror: boolean;
  strokes: CustomCamoStroke[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

export const CAMO_PATTERN_IDS = Object.freeze([
  'auto', 'factory', 'summer', 'desert', 'winter', 'digital',
  'merdc', 'tropic', 'ambushdot', 'splinter',
  'pinkdesert', 'autumn', 'urbanblock', 'washworn',
  'naval', 'dazzle',
  'flecktarn', 'amoeba', 'dpm', 'tigerstripe', 'm90',
  'chocchip', 'digitaldesert',
  'merdcwinter', 'winterbands',
  'berlin', 'oakleaf',
  'hexfield', 'midnight',
  'claude', 'spark',
  'ducky', 'suits', 'flames', 'leopardprint', 'bolt',
  'stars', 'daisy', 'circuit', 'racing', 'paintball',
  'normandy44', 'berlin45', 'ardennes44', 'pacific45', 'jungleops', 'rasputitsa',
  // Append-only: Signature is the vehicle's deliberately authored identity
  // finish. It is distinct from Factory, which is the standardized national
  // delivery coat, and remains match-safe because the recipe is first-party.
  'signature',
] as const);

export type CamoPatternId = typeof CAMO_PATTERN_IDS[number];

export const CAMO_PATTERN_LABEL: Readonly<Record<CamoPatternId, string>> = Object.freeze({
  auto: 'Auto (map)', factory: 'Factory', summer: 'Summer',
  desert: 'Desert', winter: 'Winter', digital: 'Digital',
  merdc: 'MERDC', tropic: 'Tropic', ambushdot: 'Ambush', splinter: 'Splinter',
  pinkdesert: 'Desert Pink', autumn: 'Autumn', urbanblock: 'Urban Block',
  washworn: 'Whitewash', naval: 'Naval', dazzle: 'Dazzle',
  flecktarn: 'Flecktarn', amoeba: 'Amoeba', dpm: 'DPM',
  tigerstripe: 'Tiger Stripe', m90: 'M90 Splinter',
  chocchip: 'Choc-Chip', digitaldesert: 'Digital Sand',
  merdcwinter: 'MERDC Winter', winterbands: 'Winter Bands',
  berlin: 'Berlin Bde', oakleaf: 'Oak Leaf',
  hexfield: 'Hex Mesh', midnight: 'Night Ops',
  claude: 'Claude', spark: 'Claude Spark',
  ducky: 'Rubber Ducky', suits: 'High Roller', flames: 'Hot Rod',
  leopardprint: 'Leopard Print', bolt: 'Thunderbolt', stars: 'Starfall',
  daisy: 'Flower Power', circuit: 'Circuit Board', racing: 'Racing Team',
  paintball: 'Paintball',
  normandy44: "Normandy '44", berlin45: "Berlin '45", ardennes44: "Ardennes '44",
  pacific45: "Pacific '45", jungleops: 'Jungle Ops', rasputitsa: "Rasputitsa '42",
  signature: 'Signature',
});

/**
 * Vehicles whose authored pre-standardization finish is intentional identity,
 * not an accidental substitute for their nation's Factory delivery coat.
 *
 * This registry is explicit by design. A new builder does not silently gain a
 * Signature option merely because its author picked a one-off palette.
 */
export const SIGNATURE_CAMO_TANK_IDS = Object.freeze([
  // United States
  'abramsx', 'm551_sheridan',
  // Germany
  'leo2a4_otco', 'mbt70', 'kf51b',
  // Russia / USSR
  'bmpt_t90', 't90a_burlak', 't90m', 't90m_proryv', 't90a', 't90a_vladimir',
  // United Kingdom
  'challenger2e', 'challenger_3x',
  // France
  'amx56', 'leclerc',
  // Italy
  'ariete_c2',
  // Japan
  'type10b', 'type90', 'type90a',
  // China — the full current lineup has intentionally distinct service paint.
  'type59', 'ztz85_iii', 'type99a', 'ztz99a2',
  // Poland — PL-01 itself owns the national Factory reference.
  'pt91m', 't72m1_jaguar', 'pt91_twardy', 'pl01_105', 'bwp1', 'upior',
  // South Korea — BMP-3 ROK itself owns the national Factory reference.
  'k2', 'k1a1', 'k2b',
  // Israel — Merkava Mk 2D itself owns the national Factory reference.
  'merkava1b', 'merkava2b', 'merkava3c', 'merkava3d', 'merkava4b',
  // Ukraine — the UA M2A3 Bradley owns the national Factory reference.
  't84', 'ua_challenger2', 'ua_t64bv', 'ua_t80bv', 'ua_t80u_kursk',
  'ua_t84_oplot_m', 'ua_m1a1', 'leo2a6_ua',
] as const);

const SIGNATURE_CAMO_TANK_ID_SET = new Set<string>(SIGNATURE_CAMO_TANK_IDS);

export function hasSignatureCamo(specId: unknown): boolean {
  return typeof specId === 'string' && SIGNATURE_CAMO_TANK_ID_SET.has(specId);
}

/** Initial presentation choice; an explicit player selection always wins. */
export function defaultCamoPatternId(specId: unknown): CamoPatternId {
  return hasSignatureCamo(specId) ? 'signature' : 'factory';
}

export const CUSTOM_CAMO_ID = 'custom';
// The legacy procedural styles remain readable so existing local saves keep
// working. New authoring uses `drawn`: a compact, normalized vector tile that
// is repeated by the material painter without adding runtime textures.
export const CUSTOM_CAMO_STYLES = Object.freeze([
  'drawn', 'blotch', 'digital', 'stripes', 'splinter',
] as const);
export type CustomCamoStyle = typeof CUSTOM_CAMO_STYLES[number];

const DEFAULT_CUSTOM_CAMO = Object.freeze({
  style: 'drawn',
  base: '#46513d',
  colorA: '#252a24',
  colorB: '#73563a',
  repeat: 55,
  repeatX: 3,
  repeatY: 2,
  rotation: 0,
  mirror: true,
  strokes: [],
} satisfies CustomCamo);

const BUILT_IN = new Set<CamoPatternId>(CAMO_PATTERN_IDS);
const HEX = /^#[0-9a-f]{6}$/i;

export function isBuiltInCamoId(value: unknown): value is CamoPatternId {
  return typeof value === 'string' && BUILT_IN.has(value as CamoPatternId);
}

/** Match-safe public camo id. Local custom paint always degrades to Factory. */
export function networkCamoId(value: unknown): CamoPatternId {
  return isBuiltInCamoId(value) ? value : 'factory';
}

function isCustomCamoStyle(value: unknown): value is CustomCamoStyle {
  return typeof value === 'string'
    && (CUSTOM_CAMO_STYLES as readonly string[]).includes(value);
}

function isCustomCamoBrush(value: unknown): value is CustomCamoBrush {
  return typeof value === 'string'
    && (CUSTOM_CAMO_BRUSHES as readonly string[]).includes(value);
}

function isCustomCamoAsset(value: unknown): value is CustomCamoAsset {
  return typeof value === 'string'
    && (CUSTOM_CAMO_ASSETS as readonly string[]).includes(value);
}

export function normalizeCustomCamo(value: unknown = null): CustomCamo {
  const source: Record<string, unknown> = isRecord(value) ? value : DEFAULT_CUSTOM_CAMO;
  const style = isCustomCamoStyle(source.style) ? source.style : DEFAULT_CUSTOM_CAMO.style;
  const color = (candidate: unknown, fallback: string): string => {
    const next = String(candidate || '').toLowerCase();
    return HEX.test(next) ? next : fallback;
  };
  const repeat = Math.round(Number(source.repeat));
  const clamp = (candidate: unknown, min: number, max: number, fallback: number): number => {
    const number = Math.round(Number(candidate));
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
  };
  const strokes: CustomCamoStroke[] = Array.isArray(source.strokes)
    ? source.strokes.slice(0, 96).flatMap((candidate): CustomCamoStroke[] => {
      if (!isRecord(candidate)) return [];
      const points: Array<[number, number]> = Array.isArray(candidate.points)
        ? candidate.points.slice(0, 96).flatMap((point): Array<[number, number]> => (
          Array.isArray(point)
            ? [[clamp(point[0], 0, 100, 50), clamp(point[1], 0, 100, 50)]]
            : []
        ))
        : [];
      if (!points.length) return [];
      return [{
        color: candidate.color === 1 ? 1 : 0,
        size: clamp(candidate.size, 1, 40, 8),
        brush: isCustomCamoBrush(candidate.brush) ? candidate.brush : 'round',
        asset: isCustomCamoAsset(candidate.asset) ? candidate.asset : 'star',
        rotation: clamp(candidate.rotation, -180, 180, 0),
        points,
      }];
    })
    : [];
  return {
    style,
    base: color(source.base, DEFAULT_CUSTOM_CAMO.base),
    colorA: color(source.colorA, DEFAULT_CUSTOM_CAMO.colorA),
    colorB: color(source.colorB, DEFAULT_CUSTOM_CAMO.colorB),
    repeat: Number.isFinite(repeat) ? Math.max(20, Math.min(100, repeat)) : DEFAULT_CUSTOM_CAMO.repeat,
    repeatX: clamp(source.repeatX, 1, 8, DEFAULT_CUSTOM_CAMO.repeatX),
    repeatY: clamp(source.repeatY, 1, 8, DEFAULT_CUSTOM_CAMO.repeatY),
    rotation: clamp(source.rotation, -180, 180, DEFAULT_CUSTOM_CAMO.rotation),
    mirror: source.mirror == null ? DEFAULT_CUSTOM_CAMO.mirror : !!source.mirror,
    strokes,
  };
}

/** Encode all painter inputs into the cache key so old bakes stay immutable. */
export function customCamoPatternId(value: unknown): string {
  const c = normalizeCustomCamo(value);
  if (c.style === 'drawn') {
    const strokes = c.strokes.map((stroke) => `${stroke.color},${stroke.size},${stroke.brush},${stroke.asset},${stroke.rotation},` +
      stroke.points.map(([x, y]) => `${x}.${y}`).join('_')).join(';');
    return `custom3~${c.base.slice(1)}~${c.colorA.slice(1)}~${c.colorB.slice(1)}~` +
      `${c.repeatX}~${c.repeatY}~${c.rotation}~${c.mirror ? 1 : 0}~${strokes}`;
  }
  return `custom~${c.style}~${c.base.slice(1)}~${c.colorA.slice(1)}~${c.colorB.slice(1)}~${c.repeat}`;
}

export function parseCustomCamoPatternId(value: unknown): CustomCamo | null {
  const authored = /^custom3~([0-9a-f]{6})~([0-9a-f]{6})~([0-9a-f]{6})~([1-8])~([1-8])~(-?\d{1,3})~([01])~(.*)$/i
    .exec(String(value || ''));
  if (authored) {
    const strokes = authored[8] ? authored[8].split(';').map((encoded) => {
      const [color, size, brush, asset, rotation, points = ''] = encoded.split(',');
      return {
        color: Number(color), size: Number(size), brush, asset, rotation: Number(rotation),
        points: points.split('_').filter(Boolean).map((point) => point.split('.').map(Number)),
      };
    }) : [];
    return normalizeCustomCamo({
      style: 'drawn',
      base: `#${authored[1].toLowerCase()}`,
      colorA: `#${authored[2].toLowerCase()}`,
      colorB: `#${authored[3].toLowerCase()}`,
      repeatX: Number(authored[4]),
      repeatY: Number(authored[5]),
      rotation: Number(authored[6]),
      mirror: authored[7] === '1',
      strokes,
    });
  }
  const drawn = /^custom2~([0-9a-f]{6})~([0-9a-f]{6})~([0-9a-f]{6})~([1-8])~([1-8])~(-?\d{1,3})~([01])~(.*)$/i
    .exec(String(value || ''));
  if (drawn) {
    const strokes = drawn[8] ? drawn[8].split(';').map((encoded) => {
      const [color, size, points = ''] = encoded.split(',');
      return {
        color: Number(color),
        size: Number(size),
        points: points.split('_').filter(Boolean).map((point) => point.split('.').map(Number)),
      };
    }) : [];
    return normalizeCustomCamo({
      style: 'drawn',
      base: `#${drawn[1].toLowerCase()}`,
      colorA: `#${drawn[2].toLowerCase()}`,
      colorB: `#${drawn[3].toLowerCase()}`,
      repeatX: Number(drawn[4]),
      repeatY: Number(drawn[5]),
      rotation: Number(drawn[6]),
      mirror: drawn[7] === '1',
      strokes,
    });
  }
  const match = /^custom~(blotch|digital|stripes|splinter)~([0-9a-f]{6})~([0-9a-f]{6})~([0-9a-f]{6})~(\d{2,3})$/i
    .exec(String(value || ''));
  if (!match) return null;
  return normalizeCustomCamo({
    style: match[1].toLowerCase(),
    base: `#${match[2].toLowerCase()}`,
    colorA: `#${match[3].toLowerCase()}`,
    colorB: `#${match[4].toLowerCase()}`,
    repeat: Number(match[5]),
  });
}
