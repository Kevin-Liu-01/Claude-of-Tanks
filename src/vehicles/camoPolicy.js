/**
 * Pure camouflage catalog and boundary policy.
 *
 * Keep this module DOM/WebGL-free: lobby and ranked authority import it to
 * validate public match metadata without pulling the texture painter into a
 * server process. Custom patterns are deliberately absent from the network
 * allowlist and remain local single-player presentation only.
 */

import { VEHICLE_ERAS } from './taxonomy.ts';
import { CUSTOM_CAMO_ASSETS, CUSTOM_CAMO_BRUSHES } from './customCamoCanvas.js';

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
]);

export const CAMO_PATTERN_LABEL = Object.freeze({
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
});

export const CUSTOM_CAMO_ID = 'custom';
// The legacy procedural styles remain readable so existing local saves keep
// working. New authoring uses `drawn`: a compact, normalized vector tile that
// is repeated by the material painter without adding runtime textures.
export const CUSTOM_CAMO_STYLES = Object.freeze(['drawn', 'blotch', 'digital', 'stripes', 'splinter']);
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
});

const BUILT_IN = new Set(CAMO_PATTERN_IDS);
const HEX = /^#[0-9a-f]{6}$/i;

// Distinctive factory fallback for vehicles whose authored visual is still a
// single green coat. Pools reuse the shipped painter catalog and follow the
// visual language already authored for each nation/era; the spec id chooses a
// stable member so a country block does not become one repeated uniform.
const FACTORY_THEME_POOLS = Object.freeze({
  'USA:ww2': ['summer', 'ardennes44'],
  'USA:modern': ['summer', 'merdc'],
  'Germany:ww2': ['ambushdot', 'splinter'],
  'Germany:modern': ['summer', 'flecktarn'],
  'USSR:ww2': ['amoeba', 'rasputitsa'],
  'USSR:modern': ['digital', 'amoeba'],
  'USSR/Russia:modern': ['digital', 'amoeba'],
  'Russia:modern': ['digital', 'amoeba'],
  'UK:ww2': ['dpm'],
  'UK:modern': ['dpm', 'summer'],
  'France:modern': ['summer'],
  'Israel:modern': ['desert', 'digitaldesert'],
  'China:modern': ['digital'],
  'South Korea:modern': ['digital', 'summer'],
  'Japan:modern': ['digital', 'tigerstripe'],
  'Italy:cold-war': ['summer'],
  'Italy:modern': ['summer'],
  'Poland:modern': ['digital'],
  'Sweden:modern': ['m90'],
  'Ukraine:modern': ['digital', 'summer'],
});

/** True only for the legacy single-coat green factory presentation. */
export function isPlainGreenFactoryVisual(visual) {
  if (!visual || visual.scheme !== 'solid' || (visual.patches || []).length) return false;
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(visual.base || ''));
  if (!match) return false;
  const [, rr, gg, bb] = match;
  const r = Number.parseInt(rr, 16);
  const g = Number.parseInt(gg, 16);
  const b = Number.parseInt(bb, 16);
  return g >= r && g > b + 4 && Math.max(r, g, b) - Math.min(r, g, b) >= 8;
}

/** Built-in theme that replaces a plain-green factory coat, or null. */
export function factoryThemePatternId(spec) {
  if (!spec?.id || !isPlainGreenFactoryVisual(spec.visual)) return null;
  const familyEra = spec.era === VEHICLE_ERAS.INTERWAR
    ? VEHICLE_ERAS.WORLD_WAR_II
    : spec.era === VEHICLE_ERAS.NEXT_GENERATION ? VEHICLE_ERAS.MODERN : spec.era;
  const pool = FACTORY_THEME_POOLS[`${spec.nation}:${familyEra}`]
    || (familyEra === VEHICLE_ERAS.COLD_WAR
      ? FACTORY_THEME_POOLS[`${spec.nation}:${VEHICLE_ERAS.MODERN}`]
      : null)
    || ['summer'];
  let hash = 0;
  for (const char of spec.id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return pool[(hash >>> 0) % pool.length];
}

export function isBuiltInCamoId(value) {
  return BUILT_IN.has(String(value || ''));
}

/** Match-safe public camo id. Local custom paint always degrades to Factory. */
export function networkCamoId(value) {
  return isBuiltInCamoId(value) ? String(value) : 'factory';
}

export function normalizeCustomCamo(value = null) {
  const source = value && typeof value === 'object' ? value : DEFAULT_CUSTOM_CAMO;
  const style = CUSTOM_CAMO_STYLES.includes(source.style) ? source.style : DEFAULT_CUSTOM_CAMO.style;
  const color = (candidate, fallback) => {
    const next = String(candidate || '').toLowerCase();
    return HEX.test(next) ? next : fallback;
  };
  const repeat = Math.round(Number(source.repeat));
  const clamp = (value, min, max, fallback) => {
    const number = Math.round(Number(value));
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
  };
  const strokes = Array.isArray(source.strokes) ? source.strokes.slice(0, 96).map((stroke) => ({
    color: stroke?.color === 1 ? 1 : 0,
    size: clamp(stroke?.size, 1, 40, 8),
    brush: CUSTOM_CAMO_BRUSHES.includes(stroke?.brush) ? stroke.brush : 'round',
    asset: CUSTOM_CAMO_ASSETS.includes(stroke?.asset) ? stroke.asset : 'star',
    rotation: clamp(stroke?.rotation, -180, 180, 0),
    points: Array.isArray(stroke?.points) ? stroke.points.slice(0, 96).map((point) => [
      clamp(point?.[0], 0, 100, 50),
      clamp(point?.[1], 0, 100, 50),
    ]) : [],
  })).filter((stroke) => stroke.points.length) : [];
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
export function customCamoPatternId(value) {
  const c = normalizeCustomCamo(value);
  if (c.style === 'drawn') {
    const strokes = c.strokes.map((stroke) => `${stroke.color},${stroke.size},${stroke.brush},${stroke.asset},${stroke.rotation},` +
      stroke.points.map(([x, y]) => `${x}.${y}`).join('_')).join(';');
    return `custom3~${c.base.slice(1)}~${c.colorA.slice(1)}~${c.colorB.slice(1)}~` +
      `${c.repeatX}~${c.repeatY}~${c.rotation}~${c.mirror ? 1 : 0}~${strokes}`;
  }
  return `custom~${c.style}~${c.base.slice(1)}~${c.colorA.slice(1)}~${c.colorB.slice(1)}~${c.repeat}`;
}

export function parseCustomCamoPatternId(value) {
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
