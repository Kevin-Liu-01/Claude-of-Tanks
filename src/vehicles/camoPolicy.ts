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

/** Values accepted at persistence and network boundaries before validation. */
type ExternalValue = string | number | boolean | bigint | symbol | object | null | undefined;

function isExternalArray(value: ExternalValue): value is ExternalValue[] {
  return Array.isArray(value);
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
  // Reusable first-party service references. These are the exact colorways
  // that own each nation's Factory baseline, plus the two closely related
  // Bundeswehr finishes explicitly retained alongside Leopard 2A6M.
  'service_usa_desert',
  'service_marder1a3', 'service_leo2a4m', 'service_leo2a6m',
  'service_soviet_ww2', 'service_soviet_coldwar', 'service_t90m',
  'service_challenger_3', 'service_leclerc_xlr',
  'service_type99a', 'service_ariete_c1', 'service_type10',
  'service_pl01', 'service_bmp3_rok', 'service_strv122',
  'service_merkava2d', 'service_ua_m2a3_bradley',
  // Reusable vehicle-personality finishes. The source vehicle selects its
  // own named preset by default, but every preset can be worn by every tank.
  'sig_abramsx', 'sig_m551_sheridan',
  'sig_leo2a4_otco', 'sig_mbt70', 'sig_kf51b',
  'sig_bmpt_t90', 'sig_t90', 'sig_t90sm', 'sig_t90ms',
  'sig_t90a_burlak', 'sig_t90m', 'sig_t90m_proryv',
  'sig_t90a', 'sig_t90a_vladimir',
  'sig_challenger2e', 'sig_challenger_3x',
  'sig_amx56', 'sig_leclerc', 'sig_ariete_c2',
  'sig_type10b', 'sig_type90', 'sig_type90a',
  'sig_type59', 'sig_ztz85_iii', 'sig_type99a', 'sig_ztz99a2_prototype', 'sig_ztz99a2',
  'sig_pt91m', 'sig_t72m1_jaguar', 'sig_pt91_twardy', 'sig_pl01_105',
  'sig_bwp1', 'sig_upior',
  'sig_k2', 'sig_k1a1', 'sig_k2b',
  'sig_merkava1b', 'sig_merkava2b', 'sig_merkava3c', 'sig_merkava3d',
  'sig_merkava4b',
  'sig_t84', 'sig_ua_challenger2', 'sig_ua_t64bv', 'sig_ua_t80bv',
  'sig_ua_t80u_kursk', 'sig_ua_t84_oplot_m', 'sig_ua_m1a1', 'sig_leo2a6_ua',
] as const);

export type CamoPatternId = typeof CAMO_PATTERN_IDS[number];

/** Player-facing catalog; the generic Signature id remains decode-only. */
export const CAMO_CATALOG_PATTERN_IDS: readonly CamoPatternId[] = Object.freeze(
  CAMO_PATTERN_IDS.filter((patternId) => patternId !== 'signature'),
);

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
  service_usa_desert: 'US Desert Service',
  service_marder1a3: 'Marder Bundeswehr',
  service_leo2a4m: 'Leopard 2A4M Service',
  service_leo2a6m: 'Leopard 2A6M Service',
  service_soviet_ww2: 'Soviet 4BO Field Blotch',
  service_soviet_coldwar: 'Soviet Cold War Amoeba',
  service_t90m: 'Modern Russian Service Digital',
  service_challenger_3: 'Challenger 3 Service',
  service_leclerc_xlr: 'Leclerc XLR Service',
  service_type99a: 'Type 99A Service Digital',
  service_ariete_c1: 'Ariete C1 Service',
  service_type10: 'Type 10 Service',
  service_pl01: 'PL-01 Service Digital',
  service_bmp3_rok: 'BMP-3 ROK Service',
  service_strv122: 'Strv 122 Splinter',
  service_merkava2d: 'Merkava 2D Sinai Gray',
  service_ua_m2a3_bradley: 'UA Bradley Digital',
  sig_abramsx: 'AbramsX Prototype',
  sig_m551_sheridan: 'M551 Sheridan Field',
  sig_leo2a4_otco: 'Leopard 2A4 OTCO',
  sig_mbt70: 'MBT-70 Flecktarn',
  sig_kf51b: 'KF51B Panther',
  sig_bmpt_t90: 'BMPT T-90 Digital',
  sig_t90: 'T-90 obr. 1992 Field',
  sig_t90sm: 'T-90SM Export Digital',
  sig_t90ms: 'T-90MS Tagil Demonstrator',
  sig_t90a_burlak: 'T-90A Burlak Digital',
  sig_t90m: 'T-90M Field Digital',
  sig_t90m_proryv: 'T-90M Proryv Digital',
  sig_t90a: 'T-90A Service Digital',
  sig_t90a_vladimir: 'T-90A Vladimir Digital',
  sig_challenger2e: 'Challenger 2E',
  sig_challenger_3x: 'Challenger 3 X',
  sig_amx56: 'AMX 56',
  sig_leclerc: 'Leclerc S2',
  sig_ariete_c2: 'Ariete C2',
  sig_type10b: 'Type 10B',
  sig_type90: 'Type 90 Kyū-maru',
  sig_type90a: 'Type 90A',
  sig_type59: 'Type 59',
  sig_ztz85_iii: 'ZTZ-85-III',
  sig_type99a: 'Type 99A Tight Digital',
  sig_ztz99a2_prototype: 'ZTZ-99A2 Prototype',
  sig_ztz99a2: 'ZTZ-99A2',
  sig_pt91m: 'PT-91M Pendekar',
  sig_t72m1_jaguar: 'T-72M1 Jaguar',
  sig_pt91_twardy: 'PT-91A Twardy',
  sig_pl01_105: 'PL-01 105 Stealth',
  sig_bwp1: 'BWP-1 Polish Digital',
  sig_upior: 'Upiór Digital',
  sig_k2: 'K2 Black Panther',
  sig_k1a1: 'K1A1',
  sig_k2b: 'K2B Stealth Digital',
  sig_merkava1b: 'Merkava 1B Desert Chip',
  sig_merkava2b: 'Merkava 2B Desert Field',
  sig_merkava3c: 'Merkava 3C Desert Digital',
  sig_merkava3d: 'Merkava 3D Sinai Caunter',
  sig_merkava4b: 'Merkava 4B Sinai Hex',
  sig_t84: 'T-84 Oplot',
  sig_ua_challenger2: 'UA Challenger 2',
  sig_ua_t64bv: 'T-64BV Donbas',
  sig_ua_t80bv: 'UA T-80BV',
  sig_ua_t80u_kursk: 'T-80U Kursk',
  sig_ua_t84_oplot_m: 'T-84BM Oplot-M',
  sig_ua_m1a1: 'M1A1 Abrams UA',
  sig_leo2a6_ua: 'Leopard 2A6 UA',
});

/**
 * Browsing taxonomy for the garage camouflage catalog. Tags describe origin,
 * environment, and visual construction independently, so patterns can be
 * found without forcing each one into a single arbitrary folder.
 */
export const CAMO_TAG_IDS = Object.freeze([
  'all',
  // Service origin / national association.
  'usa', 'de', 'ru', 'uk', 'fr', 'cn', 'it', 'jp', 'pl', 'kr', 'se', 'il', 'ua',
  // Intended operating environment.
  'woodland', 'desert', 'winter', 'urban', 'tropical', 'maritime', 'night',
  // Pattern construction and catalog role.
  'digital', 'geometric', 'stripes', 'organic', 'historical',
  'factory', 'signature', 'adaptive', 'special',
] as const);

export type CamoTagId = typeof CAMO_TAG_IDS[number];

export const CAMO_TAG_LABEL: Readonly<Record<CamoTagId, string>> = Object.freeze({
  all: 'All',
  usa: 'USA', de: 'DE', ru: 'RU', uk: 'UK', fr: 'FR', cn: 'CN', it: 'IT',
  jp: 'JP', pl: 'PL', kr: 'KR', se: 'SE', il: 'IL', ua: 'UA',
  woodland: 'Woodland', desert: 'Desert', winter: 'Winter', urban: 'Urban',
  tropical: 'Tropical', maritime: 'Maritime', night: 'Night',
  digital: 'Digital', geometric: 'Geometric', stripes: 'Stripes', organic: 'Organic',
  historical: 'Historical', factory: 'Factory', signature: 'Signature',
  adaptive: 'Adaptive', special: 'Special',
});

const CAMO_NATION_TAG: Readonly<Record<string, CamoTagId>> = Object.freeze({
  USA: 'usa',
  Germany: 'de',
  Russia: 'ru',
  USSR: 'ru',
  'USSR/Russia': 'ru',
  UK: 'uk',
  France: 'fr',
  China: 'cn',
  Italy: 'it',
  Japan: 'jp',
  Poland: 'pl',
  'South Korea': 'kr',
  Sweden: 'se',
  Israel: 'il',
  Ukraine: 'ua',
});

export interface SharedCamoVisual {
  readonly scheme: string;
  readonly base: string;
  readonly weather: string;
  readonly patches: readonly string[];
  readonly camoScale?: number;
  readonly patchK?: number;
  readonly digitalCellK?: number;
  readonly solidWeatheringIntensity?: number;
}

export interface SharedCamoPreset {
  readonly id: CamoPatternId;
  readonly sourceTankId: string | null;
  readonly tags: readonly CamoTagId[];
  readonly visual: SharedCamoVisual;
}

const serviceTags = (
  nation: CamoTagId,
  environment: 'woodland' | 'desert',
  style: 'digital' | 'geometric' | 'stripes' | 'organic',
): readonly CamoTagId[] => Object.freeze([nation, environment, style, 'factory']);

const signatureTags = (
  nation: CamoTagId,
  environment: 'woodland' | 'desert',
  style: 'digital' | 'geometric' | 'stripes' | 'organic',
): readonly CamoTagId[] => Object.freeze([nation, environment, style, 'signature', 'special']);

const preset = (
  id: CamoPatternId,
  sourceTankId: string | null,
  tags: readonly CamoTagId[],
  visual: SharedCamoVisual,
): SharedCamoPreset => Object.freeze({ id, sourceTankId, tags, visual: Object.freeze({
  ...visual,
  patches: Object.freeze([...visual.patches]),
}) });

/**
 * Named, reusable fleet colorways. Service presets own national Factory
 * baselines; Signature presets preserve the explicitly requested vehicle
 * personalities. Keeping the complete painter recipe here makes the result
 * independent of whichever tank happens to wear it.
 */
export const SHARED_CAMO_PRESETS: readonly SharedCamoPreset[] = Object.freeze([
  preset('service_usa_desert', null, serviceTags('usa', 'desert', 'organic'),
    { scheme: 'desert', base: '#b09466', weather: '#c4ad7d', patches: ['#7a5f43', '#947c52', '#cbb489'], camoScale: 0.52 }),
  preset('service_marder1a3', 'marder1a3', serviceTags('de', 'woodland', 'stripes'),
    { scheme: 'stripes', base: '#46503f', weather: '#57604b', patches: ['#28302a', '#5f5643'], camoScale: 0.5 }),
  preset('service_leo2a4m', 'leo2a4m', serviceTags('de', 'woodland', 'stripes'),
    { scheme: 'stripes', base: '#4a5141', weather: '#656b58', patches: ['#2b3329', '#625941', '#77705b'], camoScale: 0.42 }),
  preset('service_leo2a6m', 'leo2a6m', serviceTags('de', 'woodland', 'stripes'),
    { scheme: 'stripes', base: '#48503f', weather: '#626956', patches: ['#293128', '#605640', '#746d58'], camoScale: 0.4 }),
  preset('service_soviet_ww2', null,
    Object.freeze(['ru', 'woodland', 'organic', 'historical', 'factory']),
    { scheme: 'blotch', base: '#4a5635', weather: '#596343', patches: ['#2e3828', '#6b6044', '#34322a'], camoScale: 0.62 }),
  preset('service_soviet_coldwar', null,
    Object.freeze(['ru', 'woodland', 'organic', 'historical', 'factory']),
    { scheme: 'amoeba', base: '#465238', weather: '#586048', patches: ['#273128', '#71664a', '#343a30'], camoScale: 0.52, patchK: 1.22 }),
  preset('service_t90m', 't90m', serviceTags('ru', 'woodland', 'digital'),
    { scheme: 'digital', base: '#40513a', weather: '#566149', patches: ['#263228', '#6d7154', '#84785a'], camoScale: 0.42, digitalCellK: 1.35 }),
  preset('service_challenger_3', 'challenger_3', serviceTags('uk', 'woodland', 'stripes'),
    { scheme: 'stripes', base: '#414c38', weather: '#4a5540', patches: ['#1e201d'], camoScale: 0.48 }),
  preset('service_leclerc_xlr', 'leclerc_xlr', serviceTags('fr', 'woodland', 'organic'),
    { scheme: 'nato', base: '#3e4d3a', weather: '#48573f', patches: ['#5b4a38', '#1d1f1c'], camoScale: 0.45 }),
  preset('service_type99a', 'type99a', serviceTags('cn', 'woodland', 'digital'),
    { scheme: 'digital', base: '#4d573f', weather: '#57614a', patches: ['#6f684c', '#39412f', '#23261e'], camoScale: 0.42 }),
  preset('service_ariete_c1', 'ariete_c1', serviceTags('it', 'woodland', 'stripes'),
    { scheme: 'stripes', base: '#48533e', weather: '#53604a', patches: ['#384431', '#2c3529'], camoScale: 0.56 }),
  preset('service_type10', 'type10', serviceTags('jp', 'woodland', 'stripes'),
    { scheme: 'stripes', base: '#39463a', weather: '#445144', patches: ['#63523c', '#2e392f'], camoScale: 0.5 }),
  preset('service_pl01', 'pl01', serviceTags('pl', 'woodland', 'digital'),
    { scheme: 'digital', base: '#313b38', weather: '#47504a', patches: ['#202725', '#4e5750', '#67685e'], camoScale: 0.36 }),
  preset('service_bmp3_rok', 'bmp3_rok', serviceTags('kr', 'woodland', 'digital'),
    { scheme: 'digital', base: '#465341', weather: '#5e6753', patches: ['#2d352c', '#69604b', '#81765b'], camoScale: 0.5 }),
  preset('service_strv122', 'strv122', serviceTags('se', 'woodland', 'geometric'),
    { scheme: 'splinter', base: '#34493c', weather: '#4b5b4c', patches: ['#202b26', '#5c644c', '#81745a'], camoScale: 0.42 }),
  preset('service_merkava2d', 'merkava2d', serviceTags('il', 'desert', 'organic'),
    { scheme: 'solid', base: '#6f7566', weather: '#7b8172', patches: [], camoScale: 0.46, solidWeatheringIntensity: 0.68 }),
  preset('service_ua_m2a3_bradley', 'ua_m2a3_bradley', serviceTags('ua', 'woodland', 'digital'),
    { scheme: 'digital', base: '#4c5142', weather: '#666956', patches: ['#30352d', '#625b46', '#77705a'], camoScale: 0.5 }),

  preset('sig_abramsx', 'abramsx', signatureTags('usa', 'woodland', 'organic'),
    { scheme: 'nato', base: '#373b30', weather: '#4b5144', patches: ['#232720', '#5b4d40'], camoScale: 0.45, patchK: 1.55 }),
  preset('sig_m551_sheridan', 'm551_sheridan', signatureTags('usa', 'woodland', 'organic'),
    { scheme: 'nato', base: '#4a5138', weather: '#62684d', patches: ['#252b20', '#66513a'], camoScale: 0.78 }),
  preset('sig_leo2a4_otco', 'leo2a4_otco', signatureTags('de', 'woodland', 'stripes'),
    { scheme: 'stripes', base: '#4b5140', weather: '#666a57', patches: ['#2d3328', '#665a42', '#77725e'], camoScale: 0.44 }),
  preset('sig_mbt70', 'mbt70', signatureTags('de', 'woodland', 'organic'),
    { scheme: 'fleck', base: '#4b5142', weather: '#5b604f', patches: ['#2c332a', '#6a5640', '#1d211f'], camoScale: 0.42 }),
  preset('sig_kf51b', 'kf51b', signatureTags('de', 'woodland', 'organic'),
    { scheme: 'nato', base: '#56573e', weather: '#51533f', patches: ['#303c30', '#473729'], camoScale: 0.34, patchK: 1.28 }),
  preset('sig_bmpt_t90', 'bmpt_t90', signatureTags('ru', 'woodland', 'digital'),
    { scheme: 'digital', base: '#414c39', weather: '#565f48', patches: ['#2b3329', '#615a43', '#6f6852'], camoScale: 0.5 }),
  preset('sig_t90', 't90', signatureTags('ru', 'woodland', 'stripes'),
    { scheme: 'stripes', base: '#48563a', weather: '#5b644a', patches: ['#242c25', '#75664a', '#394431'], camoScale: 0.55, patchK: 1.28 }),
  preset('sig_t90sm', 't90sm', signatureTags('ru', 'woodland', 'digital'),
    { scheme: 'digital', base: '#46533b', weather: '#5c654b', patches: ['#252f27', '#75694d', '#8b7d5c'], camoScale: 0.36, digitalCellK: 1.18 }),
  preset('sig_t90ms', 't90ms', signatureTags('ru', 'desert', 'geometric'),
    { scheme: 'desert', base: '#8b805f', weather: '#9b8d69', patches: ['#514b39', '#667054', '#b0a078'], camoScale: 0.46, patchK: 1.18 }),
  // The T-90 personalities deliberately use separate digital field recipes.
  // They must not collapse back into variations of the national green service coat.
  preset('sig_t90a_burlak', 't90a_burlak', signatureTags('ru', 'woodland', 'digital'),
    { scheme: 'digital', base: '#435039', weather: '#5a614a', patches: ['#252d26', '#75654a', '#927f5b'], camoScale: 0.4, digitalCellK: 1.25 }),
  preset('sig_t90m', 't90m', signatureTags('ru', 'woodland', 'digital'),
    { scheme: 'digital', base: '#3f5138', weather: '#5d6549', patches: ['#283529', '#667156', '#86795a'], camoScale: 0.34, digitalCellK: 1.1 }),
  preset('sig_t90m_proryv', 't90m_proryv', signatureTags('ru', 'woodland', 'digital'),
    { scheme: 'digital', base: '#384c35', weather: '#566247', patches: ['#202b24', '#637050', '#786c51'], camoScale: 0.3, digitalCellK: 1 }),
  preset('sig_t90a', 't90a', signatureTags('ru', 'woodland', 'digital'),
    { scheme: 'digital', base: '#43553a', weather: '#5b664b', patches: ['#2c362a', '#6a7053', '#85775a'], camoScale: 0.46, digitalCellK: 1.4 }),
  preset('sig_t90a_vladimir', 't90a_vladimir', signatureTags('ru', 'woodland', 'digital'),
    { scheme: 'digital', base: '#3d4f36', weather: '#596348', patches: ['#273128', '#616c50', '#776c52'], camoScale: 0.38, digitalCellK: 1.2 }),
  preset('sig_challenger2e', 'challenger2e', signatureTags('uk', 'woodland', 'stripes'),
    { scheme: 'stripes', base: '#4b513d', weather: '#5c6049', patches: ['#22251f', '#615642'], camoScale: 0.48 }),
  preset('sig_challenger_3x', 'challenger_3x', signatureTags('uk', 'woodland', 'digital'),
    { scheme: 'digital', base: '#384436', weather: '#59624c', patches: ['#171d1a', '#69705a', '#2a322b'], camoScale: 0.4 }),
  preset('sig_amx56', 'amx56', signatureTags('fr', 'woodland', 'organic'),
    { scheme: 'nato', base: '#35483a', weather: '#405544', patches: ['#1e2521', '#5f4b37'], camoScale: 0.45 }),
  preset('sig_leclerc', 'leclerc', signatureTags('fr', 'woodland', 'organic'),
    { scheme: 'nato', base: '#394936', weather: '#4b5940', patches: ['#614d39', '#20231f'], camoScale: 0.38 }),
  preset('sig_ariete_c2', 'ariete_c2', signatureTags('it', 'woodland', 'stripes'),
    { scheme: 'stripes', base: '#3f4d3b', weather: '#4b5945', patches: ['#2e3b2d', '#5b5140'], camoScale: 0.5 }),
  preset('sig_type10b', 'type10b', signatureTags('jp', 'woodland', 'stripes'),
    { scheme: 'stripes', base: '#3a4937', weather: '#59604b', patches: ['#243026', '#65583b', '#7a7054'], camoScale: 0.4 }),
  preset('sig_type90', 'type90', signatureTags('jp', 'woodland', 'stripes'),
    { scheme: 'stripes', base: '#46503d', weather: '#555d49', patches: ['#70563e', '#303a30'], camoScale: 0.48 }),
  preset('sig_type90a', 'type90a', signatureTags('jp', 'woodland', 'stripes'),
    { scheme: 'stripes', base: '#3f4c39', weather: '#5c624d', patches: ['#253127', '#6b5d3c', '#807458'], camoScale: 0.44 }),
  preset('sig_type59', 'type59', signatureTags('cn', 'woodland', 'organic'),
    { scheme: 'nato', base: '#374836', weather: '#49573f', patches: ['#2a3629', '#5c6349', '#6f684e'], camoScale: 0.52 }),
  preset('sig_ztz85_iii', 'ztz85_iii', signatureTags('cn', 'woodland', 'digital'),
    { scheme: 'digital', base: '#35483a', weather: '#4a5947', patches: ['#263229', '#59634c', '#736a4d'], camoScale: 0.5 }),
  preset('sig_type99a', 'type99a', signatureTags('cn', 'woodland', 'digital'),
    { scheme: 'digital', base: '#4d573f', weather: '#57614a', patches: ['#6f684c', '#39412f', '#23261e'], camoScale: 0.34, digitalCellK: 1.2 }),
  preset('sig_ztz99a2_prototype', 'ztz99a2_prototype', signatureTags('cn', 'woodland', 'digital'),
    { scheme: 'digital', base: '#35453a', weather: '#4a5847', patches: ['#222f28', '#59634c', '#73694f'], camoScale: 0.43 }),
  preset('sig_ztz99a2', 'ztz99a2', signatureTags('cn', 'woodland', 'digital'),
    { scheme: 'digital', base: '#36463a', weather: '#4c5a49', patches: ['#232f28', '#5e654d', '#766b52'], camoScale: 0.43 }),
  preset('sig_pt91m', 'pt91m', signatureTags('pl', 'woodland', 'stripes'),
    { scheme: 'stripes', base: '#394b3c', weather: '#53604a', patches: ['#202820', '#4a3b30', '#70634a'], camoScale: 0.42 }),
  preset('sig_t72m1_jaguar', 't72m1_jaguar', signatureTags('pl', 'woodland', 'organic'),
    { scheme: 'nato', base: '#46533a', weather: '#60694d', patches: ['#5a4534', '#1c211c'], camoScale: 0.44, patchK: 1.35 }),
  preset('sig_pt91_twardy', 'pt91_twardy', signatureTags('pl', 'woodland', 'stripes'),
    { scheme: 'stripes', base: '#34453a', weather: '#4b5747', patches: ['#222b24', '#5b5843', '#77664a'], camoScale: 0.46 }),
  preset('sig_pl01_105', 'pl01_105', signatureTags('pl', 'woodland', 'digital'),
    { scheme: 'digital', base: '#3b4641', weather: '#525c55', patches: ['#252d2a', '#56615a', '#73746a'], camoScale: 0.3 }),
  preset('sig_bwp1', 'bwp1', signatureTags('pl', 'woodland', 'digital'),
    { scheme: 'digital', base: '#3f4a3e', weather: '#535d4d', patches: ['#28312b', '#5d5948', '#706750'], camoScale: 0.5 }),
  preset('sig_upior', 'upior', signatureTags('pl', 'woodland', 'digital'),
    { scheme: 'digital', base: '#3d4639', weather: '#4b5344', patches: ['#262e26', '#565243', '#6a6252'], camoScale: 0.42 }),
  preset('sig_k2', 'k2', signatureTags('kr', 'woodland', 'organic'),
    { scheme: 'nato', base: '#4c5844', weather: '#56624d', patches: ['#23261f', '#5a4a38'], camoScale: 0.5 }),
  preset('sig_k1a1', 'k1a1', signatureTags('kr', 'woodland', 'organic'),
    { scheme: 'nato', base: '#4a5743', weather: '#545f4c', patches: ['#242720', '#584936'], camoScale: 0.5 }),
  preset('sig_k2b', 'k2b', signatureTags('kr', 'woodland', 'digital'),
    { scheme: 'digital', base: '#313b38', weather: '#47504a', patches: ['#202725', '#4e5750', '#67685e'], camoScale: 0.36 }),
  preset('sig_merkava1b', 'merkava1b', signatureTags('il', 'desert', 'organic'),
    { scheme: 'chip6', base: '#b39c72', weather: '#c1ab80', patches: ['#8a6f4e', '#c7b68c', '#c3c7c6', '#33342f'], camoScale: 0.56 }),
  preset('sig_merkava2b', 'merkava2b', signatureTags('il', 'desert', 'geometric'),
    { scheme: 'desert', base: '#b09466', weather: '#c4ad7d', patches: ['#7a5f43', '#947c52', '#cbb489'], camoScale: 0.52 }),
  preset('sig_merkava3c', 'merkava3c', signatureTags('il', 'desert', 'digital'),
    { scheme: 'digital', base: '#a8905f', weather: '#b59d6d', patches: ['#c6b487', '#7a6041', '#57503f'], camoScale: 0.42, digitalCellK: 1.5 }),
  preset('sig_merkava3d', 'merkava3d', signatureTags('il', 'desert', 'stripes'),
    { scheme: 'caunter', base: '#b49a7d', weather: '#c2a98a', patches: ['#68757d', '#5c5442'], camoScale: 0.46 }),
  preset('sig_merkava4b', 'merkava4b', signatureTags('il', 'desert', 'geometric'),
    { scheme: 'hexfield', base: '#827f6a', weather: '#918d77', patches: ['#5f6254', '#aaa287'], camoScale: 0.38 }),
  preset('sig_t84', 't84', signatureTags('ua', 'woodland', 'organic'),
    { scheme: 'nato', base: '#3a4832', weather: '#44523c', patches: ['#272d22', '#71684a'], camoScale: 0.5 }),
  preset('sig_ua_challenger2', 'ua_challenger2', signatureTags('ua', 'woodland', 'digital'),
    { scheme: 'digital', base: '#4a523d', weather: '#65684d', patches: ['#2e352b', '#77715a', '#91866d'], camoScale: 0.42 }),
  preset('sig_ua_t64bv', 'ua_t64bv', signatureTags('ua', 'woodland', 'digital'),
    { scheme: 'digital', base: '#46503d', weather: '#5a604d', patches: ['#30382f', '#655f49', '#776c52'], camoScale: 0.48 }),
  preset('sig_ua_t80bv', 'ua_t80bv', signatureTags('ua', 'woodland', 'digital'),
    { scheme: 'digital', base: '#38483b', weather: '#4b5848', patches: ['#263329', '#5c5942', '#71644b'], camoScale: 0.56 }),
  preset('sig_ua_t80u_kursk', 'ua_t80u_kursk', signatureTags('ua', 'woodland', 'digital'),
    { scheme: 'digital', base: '#4b5039', weather: '#5c5b45', patches: ['#303329', '#6b634a', '#80745a'], camoScale: 0.64 }),
  preset('sig_ua_t84_oplot_m', 'ua_t84_oplot_m', signatureTags('ua', 'woodland', 'digital'),
    { scheme: 'digital', base: '#42483a', weather: '#56594a', patches: ['#2d3029', '#77705b', '#8a8068'], camoScale: 0.42 }),
  preset('sig_ua_m1a1', 'ua_m1a1', signatureTags('ua', 'woodland', 'digital'),
    { scheme: 'digital', base: '#55594b', weather: '#69695a', patches: ['#393c34', '#77705b', '#82755c'], camoScale: 0.55 }),
  preset('sig_leo2a6_ua', 'leo2a6_ua', signatureTags('ua', 'woodland', 'digital'),
    { scheme: 'digital', base: '#4d5343', weather: '#686858', patches: ['#2d382f', '#6c654d', '#4b5141'], camoScale: 0.46 }),
]);

const SHARED_CAMO_PRESET_BY_ID = new Map(
  SHARED_CAMO_PRESETS.map((entry) => [entry.id, entry] as const),
);

export function sharedCamoPreset(patternId: string | null | undefined): SharedCamoPreset | null {
  return SHARED_CAMO_PRESET_BY_ID.get(patternId as CamoPatternId) || null;
}

export const FACTORY_CAMO_PATTERN_BY_NATION: Readonly<Record<string, CamoPatternId>> = Object.freeze({
  USA: 'service_usa_desert',
  Germany: 'service_leo2a6m',
  Russia: 'service_t90m',
  UK: 'service_challenger_3',
  France: 'service_leclerc_xlr',
  China: 'service_type99a',
  Italy: 'service_ariete_c1',
  Japan: 'service_type10',
  Poland: 'service_pl01',
  'South Korea': 'service_bmp3_rok',
  Sweden: 'service_strv122',
  Israel: 'service_merkava2d',
  Ukraine: 'service_ua_m2a3_bradley',
});

/** Era-aware Factory owner. Soviet vehicles retain period-specific field paint. */
export function factoryCamoPatternIdFor(nation: string | undefined, era: string | null | undefined): CamoPatternId | null {
  const nationKey = nation === 'USSR' || nation === 'USSR/Russia'
    ? 'Russia'
    : nation;
  if (nationKey === 'Russia') {
    if (era === 'ww2' || era === 'interwar') return 'service_soviet_ww2';
    if (era === 'cold-war') return 'service_soviet_coldwar';
  }
  return FACTORY_CAMO_PATTERN_BY_NATION[nationKey as string] || null;
}

const CAMO_PATTERN_TAGS: Readonly<Partial<Record<CamoPatternId, readonly CamoTagId[]>>> = Object.freeze({
  auto: ['adaptive'],
  factory: ['factory'],
  summer: ['woodland', 'organic'],
  desert: ['desert', 'organic'],
  winter: ['winter', 'organic'],
  digital: ['woodland', 'digital', 'geometric'],
  merdc: ['usa', 'woodland', 'historical', 'organic'],
  tropic: ['tropical', 'woodland', 'organic'],
  ambushdot: ['de', 'woodland', 'historical', 'organic'],
  splinter: ['de', 'woodland', 'historical', 'geometric'],
  pinkdesert: ['uk', 'desert', 'historical', 'organic'],
  autumn: ['woodland', 'organic'],
  urbanblock: ['urban', 'geometric'],
  washworn: ['winter', 'historical', 'organic'],
  naval: ['maritime', 'geometric'],
  dazzle: ['maritime', 'historical', 'geometric'],
  flecktarn: ['de', 'woodland', 'organic'],
  amoeba: ['ru', 'woodland', 'historical', 'organic'],
  dpm: ['uk', 'woodland', 'historical', 'organic'],
  tigerstripe: ['tropical', 'historical', 'stripes'],
  m90: ['se', 'woodland', 'geometric'],
  chocchip: ['usa', 'desert', 'historical', 'organic'],
  digitaldesert: ['desert', 'digital', 'geometric'],
  merdcwinter: ['usa', 'winter', 'historical', 'organic'],
  winterbands: ['winter', 'stripes'],
  berlin: ['uk', 'urban', 'historical', 'geometric'],
  oakleaf: ['de', 'woodland', 'historical', 'organic'],
  hexfield: ['geometric', 'special'],
  midnight: ['night', 'special'],
  claude: ['geometric', 'special'],
  spark: ['geometric', 'special'],
  ducky: ['organic', 'special'],
  suits: ['geometric', 'special'],
  flames: ['stripes', 'special'],
  leopardprint: ['organic', 'special'],
  bolt: ['geometric', 'special'],
  stars: ['geometric', 'special'],
  daisy: ['organic', 'special'],
  circuit: ['geometric', 'special'],
  racing: ['stripes', 'special'],
  paintball: ['organic', 'special'],
  normandy44: ['usa', 'woodland', 'historical'],
  berlin45: ['ru', 'urban', 'historical'],
  ardennes44: ['usa', 'winter', 'historical'],
  pacific45: ['usa', 'tropical', 'historical'],
  jungleops: ['tropical', 'woodland', 'historical'],
  rasputitsa: ['ru', 'woodland', 'historical'],
  signature: ['signature', 'special'],
});

export function camoNationTag(nation: string | null): CamoTagId | null {
  return CAMO_NATION_TAG[nation as string] || null;
}

/** Tags for one swatch. Factory and Signature inherit the selected tank nation. */
export function camoPatternTags(patternId: string, nation: string | null = null): readonly CamoTagId[] {
  const shared = sharedCamoPreset(patternId);
  if (shared) return shared.tags;
  const base = CAMO_PATTERN_TAGS[patternId as CamoPatternId];
  if (!base) return [];
  const nationTag = camoNationTag(nation);
  if ((patternId === 'factory' || patternId === 'signature') && nationTag) {
    return [nationTag, ...base];
  }
  return base;
}

export function camoMatchesTag(
  patternId: string,
  nation: string | null,
  tagId: CamoTagId,
): boolean {
  return tagId === 'all' || camoPatternTags(patternId, nation).includes(tagId);
}

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
  'bmpt_t90', 't90', 't90sm', 't90ms', 't90a_burlak', 't90m', 't90m_proryv',
  't90a', 't90a_vladimir',
  // United Kingdom
  'challenger2e', 'challenger_3x',
  // France
  'amx56', 'leclerc',
  // Italy
  'ariete_c2',
  // Japan
  'type10b', 'type90', 'type90a',
  // China — the full current lineup has intentionally distinct service paint.
  'type59', 'ztz85_iii', 'type99a', 'ztz99a2_prototype', 'ztz99a2',
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
const SIGNATURE_CAMO_PATTERN_BY_TANK_ID = new Map<string, CamoPatternId>();
for (const entry of SHARED_CAMO_PRESETS) {
  if (entry.id.startsWith('sig_') && entry.sourceTankId) {
    SIGNATURE_CAMO_PATTERN_BY_TANK_ID.set(entry.sourceTankId, entry.id);
  }
}

export function hasSignatureCamo(specId: string): boolean {
  return SIGNATURE_CAMO_TANK_ID_SET.has(specId);
}

export function signatureCamoPatternId(specId: string): CamoPatternId | null {
  return SIGNATURE_CAMO_PATTERN_BY_TANK_ID.get(specId) || null;
}

// These legacy American vehicles keep the national US Desert service coat in
// the catalog, but initially present in their more appropriate temperate field
// finish. Explicit player selections still take precedence in materials.ts.
const DEFAULT_CAMO_PATTERN_BY_TANK_ID: Readonly<Record<string, CamoPatternId>> = Object.freeze({
  m46_patton: 'summer',
  m47_patton: 'summer',
  m48: 'summer',
  m2a2_bradley: 'summer',
});

/** Initial presentation choice; an explicit player selection always wins. */
export function defaultCamoPatternId(specId: string): CamoPatternId {
  return signatureCamoPatternId(specId) || DEFAULT_CAMO_PATTERN_BY_TANK_ID[specId] || 'factory';
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
} satisfies Omit<CustomCamo, 'strokes'>);

const BUILT_IN = new Set<CamoPatternId>(CAMO_PATTERN_IDS);
const HEX = /^#[0-9a-f]{6}$/i;

export function isBuiltInCamoId<Value>(value: Value): value is Value & CamoPatternId {
  return BUILT_IN.has(value as Value & CamoPatternId);
}

/** Match-safe public camo id. Local custom paint always degrades to Factory. */
export function networkCamoId<Value>(value: Value): CamoPatternId {
  return isBuiltInCamoId(value) ? value : 'factory';
}

function isCustomCamoStyle<Value>(value: Value): value is Value & CustomCamoStyle {
  return (CUSTOM_CAMO_STYLES as readonly string[]).includes(value as Value & string);
}

function isCustomCamoBrush<Value>(value: Value): value is Value & CustomCamoBrush {
  return (CUSTOM_CAMO_BRUSHES as readonly string[]).includes(value as Value & string);
}

function isCustomCamoAsset<Value>(value: Value): value is Value & CustomCamoAsset {
  return (CUSTOM_CAMO_ASSETS as readonly string[]).includes(value as Value & string);
}

export function normalizeCustomCamo<Value = null>(value: Value = null as Value): CustomCamo {
  const source = Object.assign({} as Record<string, ExternalValue>, value);
  const style = isCustomCamoStyle(source.style) ? source.style : DEFAULT_CUSTOM_CAMO.style;
  const color = (candidate: ExternalValue, fallback: string): string => {
    const next = String(candidate).toLowerCase();
    return HEX.test(next) ? next : fallback;
  };
  const repeat = Math.round(Number(source.repeat));
  const clamp = (candidate: ExternalValue, min: number, max: number, fallback: number): number => {
    const number = Math.round(Number(candidate));
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
  };
  const strokes: CustomCamoStroke[] = isExternalArray(source.strokes)
    ? source.strokes.slice(0, 96).flatMap((candidate): CustomCamoStroke[] => {
      const stroke = Object.assign({} as Record<string, ExternalValue>, candidate);
      const points: Array<[number, number]> = isExternalArray(stroke.points)
        ? stroke.points.slice(0, 96).flatMap((point): Array<[number, number]> => (
          isExternalArray(point)
            ? [[clamp(point[0], 0, 100, 50), clamp(point[1], 0, 100, 50)]]
            : []
        ))
        : [];
      if (!points.length) return [];
      return [{
        color: stroke.color === 1 ? 1 : 0,
        size: clamp(stroke.size, 1, 40, 8),
        brush: isCustomCamoBrush(stroke.brush) ? stroke.brush : 'round',
        asset: isCustomCamoAsset(stroke.asset) ? stroke.asset : 'star',
        rotation: clamp(stroke.rotation, -180, 180, 0),
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
export function customCamoPatternId(value: ExternalValue): string {
  const c = normalizeCustomCamo(value);
  if (c.style === 'drawn') {
    const strokes = c.strokes.map((stroke) => `${stroke.color},${stroke.size},${stroke.brush},${stroke.asset},${stroke.rotation},` +
      stroke.points.map(([x, y]) => `${x}.${y}`).join('_')).join(';');
    return `custom3~${c.base.slice(1)}~${c.colorA.slice(1)}~${c.colorB.slice(1)}~` +
      `${c.repeatX}~${c.repeatY}~${c.rotation}~${c.mirror ? 1 : 0}~${strokes}`;
  }
  return `custom~${c.style}~${c.base.slice(1)}~${c.colorA.slice(1)}~${c.colorB.slice(1)}~${c.repeat}`;
}

export function parseCustomCamoPatternId(value: string): CustomCamo | null {
  const authored = /^custom3~([0-9a-f]{6})~([0-9a-f]{6})~([0-9a-f]{6})~([1-8])~([1-8])~(-?\d{1,3})~([01])~(.*)/i
    .exec(value);
  if (authored) {
    const strokes = authored[8].split(';').map((encoded) => {
      const [color, size, brush, asset, rotation, points = ''] = encoded.split(',');
      return {
        color: Number(color), size: Number(size), brush, asset, rotation: Number(rotation),
        points: points.split('_').filter(Boolean).map((point) => point.split('.').map(Number)),
      };
    });
    return normalizeCustomCamo({
      base: `#${authored[1]}`,
      colorA: `#${authored[2]}`,
      colorB: `#${authored[3]}`,
      repeatX: Number(authored[4]),
      repeatY: Number(authored[5]),
      rotation: Number(authored[6]),
      mirror: authored[7] === '1',
      strokes,
    });
  }
  const drawn = /^custom2~([0-9a-f]{6})~([0-9a-f]{6})~([0-9a-f]{6})~([1-8])~([1-8])~(-?\d{1,3})~([01])~(.*)/i
    .exec(value);
  if (drawn) {
    const strokes = drawn[8].split(';').map((encoded) => {
      const [color, size, points = ''] = encoded.split(',');
      return {
        color: Number(color),
        size: Number(size),
        points: points.split('_').filter(Boolean).map((point) => point.split('.').map(Number)),
      };
    });
    return normalizeCustomCamo({
      base: `#${drawn[1]}`,
      colorA: `#${drawn[2]}`,
      colorB: `#${drawn[3]}`,
      repeatX: Number(drawn[4]),
      repeatY: Number(drawn[5]),
      rotation: Number(drawn[6]),
      mirror: drawn[7] === '1',
      strokes,
    });
  }
  const match = /^custom~(blotch|digital|stripes|splinter)~([0-9a-f]{6})~([0-9a-f]{6})~([0-9a-f]{6})~(\d{2,3})$/i
    .exec(value);
  if (!match) return null;
  return normalizeCustomCamo({
    style: match[1],
    base: `#${match[2]}`,
    colorA: `#${match[3]}`,
    colorB: `#${match[4]}`,
    repeat: Number(match[5]),
  });
}
