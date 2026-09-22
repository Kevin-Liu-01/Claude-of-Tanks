// Nation road-wheel sets — the one table that says which road-wheel construction every playable hull draws.
//
// Owner 2026-09-22: "im going to give 2 wheel variations for each nation: china uses ztz-100 wheels or type 100
// ifv wheels. israel uses merkava mk 4b or namer wheels. sabra gets an exception … sweden uses the strv 122 or
// cv90 mk 4 x wheels. korea uses the k2 or k1a1 wheels. poland uses the pl-01 or bwp-1 wheels. japan uses the
// type 10 or type 90 wheels. italy uses the c1 ariete wheels. france uses the leclerc xlr or amx 40 wheels. UK
// uses the challenger 3, challenger 2e, or warrior milan x wheels. russia uses the t-90, t-90m, t14 armata, and
// bmp 3m dragun wheels. germany uses the kf51 panther, leopard 2a6, lynx wheels. usa uses the m1a2 abrams,
// m551a1 tts wheels. standardize our wheels across NATIONS! then we can delete any wheels we dont use anymore".
// Correction the same day: "sabra uses the m60a3 wheels" — the USA set therefore holds three donors (m1a2 for
// modern MBTs, m551a1_tts for light hulls, m60a3 for the Sabra and the Patton-era hulls).
//
// A donor's construction is its FACE construction (dish, spokes, fasteners, hub, tire profile), never its
// dimensions: every hull keeps its own wheel radius, width, station count and axle positions and the
// construction is fitted into that envelope by nationWheelConstructions.ts. Hulls listed as a donor's `self`
// draw the construction natively and keep their own wheel code — a donor IS its nation's standard. Pre-1950
// hulls keep their period constructions (a Sherman-era hull on Abrams wheels is a visible error) and are
// listed for the owner in PERIOD_WHEEL_HULLS; the 'Community' placeholder hulls keep theirs too.
//
// This module is pure data plus a resolver (no DOM, no three.js) so wheelPatterns.ts, the running-gear
// builder, the receipts and the node tools all read the same table.
import type { RuntimeValue } from '../runtimeTypes.ts';
import type { WheelPatternId } from './wheelPatterns.ts';

export type WheelDonorId =
  | 'ztz100_x' | 'type100'
  | 'merkava4b' | 'namer_ifv'
  | 'strv122' | 'cv90_mkiv_x'
  | 'k2' | 'k1a1'
  | 'pl01' | 'bwp1'
  | 'type10' | 'type90'
  | 'ariete_c1'
  | 'leclerc_xlr' | 'amx40'
  | 'challenger_3' | 'challenger2e' | 'fv510_milan_x'
  | 't90' | 't90m' | 't14' | 'bmp3m_dragun125_x'
  | 'kf51' | 'leo2a6' | 'kf41_lynx_x'
  | 'm1a2' | 'm551a1_tts' | 'm60a3';

/** Road-wheel face constructions; nationWheelConstructions.ts builds the ones a non-donor hull consumes. */
export type WheelConstructionId =
  | 'ztz100-recessed-web' | 'type100-paired-pressed'
  | 'merkava-deep-dish' | 'namer-stepped-hub'
  | 'strv122-pressed-recess' | 'cv90-armoured-hub'
  | 'k2-flanged' | 'k1a1-deep-bowl'
  | 'pl01-plain-dish' | 'bwp1-armoured-hub'
  | 'type10-paired' | 'type90-recessed-forging'
  | 'ariete-recessed-dish'
  | 'leclerc-stepped-plate' | 'amx40-pressed-face'
  | 'challenger-hollow-paired' | 'warrior-plain-web'
  | 't90-pressed-source-face' | 't14-armoured-hub' | 'dragun-rolled-lip'
  | 'kf51-forged-face' | 'leo2a6-paired-dish' | 'lynx-stamped-web'
  | 'abrams-hollow-paired' | 'sheridan-pressed-rim' | 'm60a3-cast-spoke';

export interface NationWheelDonor {
  readonly donor: WheelDonorId;
  /** Playable ids that draw this construction natively and keep their own wheel code. */
  readonly self: readonly string[];
  readonly pattern: WheelPatternId;
  readonly construction: WheelConstructionId;
  readonly note: string;
}

export const WHEEL_DONORS: Readonly<Record<WheelDonorId, NationWheelDonor>> = Object.freeze({
  ztz100_x: Object.freeze({ donor: 'ztz100_x', self: ['ztz100_x'], pattern: 'armored-hub-six', construction: 'ztz100-recessed-web',
    note: 'Objects 7/17 raised hub, recessed web and curved rim shoulder over paired tire bands, with the twelve hub hexes and eight web fasteners (ztz100X.ts).' }),
  type100: Object.freeze({ donor: 'type100', self: ['type100'], pattern: 'pressed-six', construction: 'type100-paired-pressed',
    note: 'Two pressed six-rib dishes and two tires around a real guide channel (type100RunningGear.ts).' }),
  merkava4b: Object.freeze({ donor: 'merkava4b', self: ['merkava4b'], pattern: 'deep-dish-eight', construction: 'merkava-deep-dish',
    note: 'Fleet deep-dish eight-fastener disc at dish 0.78 r with the Mk 4 pressed-face ring stack (merkava.ts modernWheelFace).' }),
  namer_ifv: Object.freeze({ donor: 'namer_ifv', self: ['namer_ifv'], pattern: 'deep-dish-eight', construction: 'namer-stepped-hub',
    note: 'Source wheel18 stepped hub, recessed web and outward rim (namerWheelStock.ts); the only Israeli IFV, so no other hull draws it.' }),
  strv122: Object.freeze({ donor: 'strv122', self: ['strv122_x'], pattern: 'plain-dish-twelve', construction: 'strv122-pressed-recess',
    note: 'The source-measured Strv 122 X bowl with six pressed recesses defines the Stridsvagn 122 wheel; the base strv122 draws it through the standard (strv122XSuppliedGear.ts).' }),
  cv90_mkiv_x: Object.freeze({ donor: 'cv90_mkiv_x', self: ['cv90_mkiv_x'], pattern: 'armored-hub-six', construction: 'cv90-armoured-hub',
    note: 'Fleet armoured-hub six-fastener disc (cv90MkivSourceX.ts draws the generic stock).' }),
  k2: Object.freeze({ donor: 'k2', self: ['k2', 'k2_x'], pattern: 'flanged-twelve', construction: 'k2-flanged',
    note: 'Fleet flanged twelve-fastener disc (both K2 studies draw the generic stock).' }),
  k1a1: Object.freeze({ donor: 'k1a1', self: ['k1a1_x'], pattern: 'flanged-twelve', construction: 'k1a1-deep-bowl',
    note: 'The K1A1 X small hub, deep dish and rolled rim (k1a1XWheels.ts); the base k1a1 and the Korean IFVs draw it through the standard.' }),
  pl01: Object.freeze({ donor: 'pl01', self: ['pl01', 'pl01_105'], pattern: 'plain-dish-twelve', construction: 'pl01-plain-dish',
    note: 'Fleet plain twelve-fastener dish at the PL-01 dish 0.60 r (poland.ts).' }),
  bwp1: Object.freeze({ donor: 'bwp1', self: ['bwp1'], pattern: 'armored-hub-six', construction: 'bwp1-armoured-hub',
    note: 'Fleet armoured-hub six-fastener disc (afvFamily.ts draws the generic stock).' }),
  type10: Object.freeze({ donor: 'type10', self: ['type10_x'], pattern: 'flanged-twelve', construction: 'type10-paired',
    note: 'Paired turned halves with a recessed hub and a real guide channel (pairedRunningGearStock.ts, the Type 10 X fitted course).' }),
  type90: Object.freeze({ donor: 'type90', self: ['type90_x'], pattern: 'flanged-twelve', construction: 'type90-recessed-forging',
    note: 'Lathed forging with the dish 120 mm behind the rubber face and a clipped hub over an open tire annulus (type90X.ts).' }),
  ariete_c1: Object.freeze({ donor: 'ariete_c1', self: ['ariete_c1_x', 'ariete_c2_x'], pattern: 'split-rim-ten', construction: 'ariete-recessed-dish',
    note: 'Recessed dish with a proud axle cap over paired tire bands (arieteXSuppliedGear.ts, the owner-approved Ariete frame).' }),
  leclerc_xlr: Object.freeze({ donor: 'leclerc_xlr', self: ['leclerc_x'], pattern: 'scalloped-six', construction: 'leclerc-stepped-plate',
    note: 'Stepped steel plate and grooved paired tires measured from the Leclerc source (leclercXWheels.ts); XLR and S2 share the wheel.' }),
  amx40: Object.freeze({ donor: 'amx40', self: ['amx40_x'], pattern: 'scalloped-six', construction: 'amx40-pressed-face',
    note: 'Fleet scalloped disc behind the AMX-40 X pressed face (rim ring, six ribs and bolts) over an open tire annulus (amx40X.ts).' }),
  challenger_3: Object.freeze({ donor: 'challenger_3', self: ['challenger_3', 'challenger_3x'], pattern: 'pressed-eight', construction: 'challenger-hollow-paired',
    note: 'Hollow paired rubber-tyred halves with eight hub fasteners as insets (hollowRoadWheelStock.ts); the Challenger 2 and 3 share this construction and differ only in size.' }),
  challenger2e: Object.freeze({ donor: 'challenger2e', self: ['challenger2', 'challenger2e', 'fv4034', 'ua_challenger2'], pattern: 'pressed-eight', construction: 'challenger-hollow-paired',
    note: 'Same hollow paired construction as the Challenger 3; every other UK MBT hull draws it.' }),
  fv510_milan_x: Object.freeze({ donor: 'fv510_milan_x', self: ['fv510_milan_x'], pattern: 'armored-hub-six', construction: 'warrior-plain-web',
    note: 'Object_33 deep plain steel web over paired tire bands (fv510MilanX.ts).' }),
  t90: Object.freeze({ donor: 't90', self: [], pattern: 'pressed-six', construction: 't90-pressed-source-face',
    note: 'In this fleet the T-90 and T-90M wheels are one construction (the T-90M X source-pressed face); the older T-series hulls draw it through the standard.' }),
  t90m: Object.freeze({ donor: 't90m', self: ['t90a_x', 't90a_vladimir_x', 't90m_x', 't90sm_x'], pattern: 'pressed-six', construction: 't90-pressed-source-face',
    note: 'Fleet pressed six-rib disc under the T-90 X source-pressed face: six-hole plate, rim ring, hub and bolt heads (t90X.ts).' }),
  t14: Object.freeze({ donor: 't14', self: ['t14', 't14_x'], pattern: 'armored-hub-six', construction: 't14-armoured-hub',
    note: 'Fleet armoured-hub six-fastener disc (t14X.ts draws the generic stock); no other Russian next-generation MBT hull exists.' }),
  bmp3m_dragun125_x: Object.freeze({ donor: 'bmp3m_dragun125_x', self: ['bmp3m_dragun125_x'], pattern: 'armored-hub-six', construction: 'dragun-rolled-lip',
    note: 'Source hub, web and rolled outer lip over separated paired tire bands (bmp3mDragun125X.ts).' }),
  kf51: Object.freeze({ donor: 'kf51', self: ['kf51', 'kf51b', 'kf51_x'], pattern: 'plain-dish-twelve', construction: 'kf51-forged-face',
    note: 'Fleet plain dish under the Panther forged face stack (leopard.ts); the KF51 family is the only German next-generation MBT hull.' }),
  leo2a6: Object.freeze({ donor: 'leo2a6', self: ['leo2a6_x'], pattern: 'plain-dish-twelve', construction: 'leo2a6-paired-dish',
    note: 'The source-measured Leopard 2A6 X paired pressed dishes and tire bands define the Leopard 2 wheel (leopardA6XWheels.ts); every other Leopard hull draws it.' }),
  kf41_lynx_x: Object.freeze({ donor: 'kf41_lynx_x', self: ['kf41_lynx_x'], pattern: 'plain-dish-twelve', construction: 'lynx-stamped-web',
    note: 'Source-measured KF41 stamped webs, web and hub fasteners over paired tire bands (kf41LynxWheelStock.ts).' }),
  m1a2: Object.freeze({ donor: 'm1a2', self: ['m1a1', 'm1a1ha', 'm1a2', 'm1a2_tusk', 'm1a2_sepv2', 'm1a2_sepv3', 'm1a2_x', 'm1a2_tusk_x', 'm1a2_sepv2_x', 'm1a2_sepv3_x', 'ua_m1a1', 'ua_m1a1_x'],
    pattern: 'split-rim-ten', construction: 'abrams-hollow-paired',
    note: 'Hollow paired road wheel from the SEP v2 source measurements (hollowRoadWheelStock.ts / abramsSourceXWheels.ts).' }),
  m551a1_tts: Object.freeze({ donor: 'm551a1_tts', self: ['m551a1_tts'], pattern: 'cast-five-spoke', construction: 'sheridan-pressed-rim',
    note: 'Fleet cast five-spoke disc under the Sheridan pressed rim, dish well, hub drum and cap (sheridan.ts).' }),
  m60a3: Object.freeze({ donor: 'm60a3', self: ['m60a3'], pattern: 'cast-five-spoke', construction: 'm60a3-cast-spoke',
    note: 'Fleet cast five-spoke disc (patton.ts); owner 2026-09-22: the Sabra takes it, and it fits the Patton-era USA hulls better than the Abrams disc.' }),
});

export const WHEEL_DONOR_IDS = Object.freeze(Object.keys(WHEEL_DONORS) as WheelDonorId[]);

/** Hull roles that ride an MBT-class chassis; everything else is an IFV/APC/light hull. */
const MBT_HULL_ROLES: readonly string[] = Object.freeze(['mbt', 'heavy', 'medium', 'td', 'spg']);
const LATE_ERAS: readonly string[] = Object.freeze(['modern', 'next-generation']);

interface NationWheelRule {
  readonly donor: WheelDonorId;
  /** Match only these hull roles (default: any). */
  readonly roles?: readonly string[];
  /** Match only these eras (default: any). */
  readonly eras?: readonly string[];
  /** Match only these ids (a base variant of the donor vehicle). */
  readonly ids?: readonly string[];
  readonly reason: string;
}

/** Ordered rules per nation key; the first match wins. The last rule of a set matches every remaining hull. */
export const NATION_WHEEL_SETS: Readonly<Record<string, readonly NationWheelRule[]>> = Object.freeze({
  china: [
    { donor: 'ztz100_x', roles: MBT_HULL_ROLES, reason: 'China MBT hull → ZTZ-100 wheel' },
    { donor: 'type100', reason: 'China IFV/light hull → Type 100 IFV wheel' },
  ],
  israel: [
    { donor: 'merkava4b', roles: MBT_HULL_ROLES, reason: 'Israel MBT hull → Merkava Mk 4B wheel' },
    { donor: 'namer_ifv', reason: 'Israel IFV/APC hull → Namer wheel' },
  ],
  sweden: [
    { donor: 'strv122', roles: MBT_HULL_ROLES, reason: 'Sweden MBT/tank-destroyer hull → Strv 122 wheel' },
    { donor: 'cv90_mkiv_x', reason: 'Sweden IFV/light hull → CV90 Mk IV X wheel' },
  ],
  'south korea': [
    { donor: 'k1a1', ids: ['k1a1'], reason: 'the K1A1 draws its own wheel' },
    { donor: 'k2', roles: MBT_HULL_ROLES, reason: 'South Korea MBT hull → K2 wheel' },
    { donor: 'k1a1', reason: 'South Korea IFV hull → the smaller K1A1 wheel (the owner listed no Korean IFV donor; recorded as a choice)' },
  ],
  poland: [
    { donor: 'pl01', roles: MBT_HULL_ROLES, reason: 'Poland MBT hull → PL-01 wheel' },
    { donor: 'bwp1', reason: 'Poland IFV hull → BWP-1 wheel' },
  ],
  japan: [
    { donor: 'type10', eras: LATE_ERAS, reason: 'Japan modern/next-generation hull → Type 10 wheel' },
    { donor: 'type90', reason: 'Japan cold-war hull → Type 90 wheel' },
  ],
  italy: [
    { donor: 'ariete_c1', reason: 'Italy → C1 Ariete wheel (the only Italian donor)' },
  ],
  france: [
    { donor: 'leclerc_xlr', eras: LATE_ERAS, reason: 'France modern hull → Leclerc XLR wheel' },
    { donor: 'amx40', reason: 'France cold-war hull → AMX-40 wheel' },
  ],
  uk: [
    { donor: 'challenger_3', roles: MBT_HULL_ROLES, eras: ['next-generation'], reason: 'UK next-generation MBT hull → Challenger 3 wheel' },
    { donor: 'challenger2e', roles: MBT_HULL_ROLES, reason: 'UK MBT hull → Challenger 2E wheel' },
    { donor: 'fv510_milan_x', reason: 'UK IFV/APC hull → Warrior Milan X wheel' },
  ],
  russia: [
    { donor: 't14', roles: MBT_HULL_ROLES, eras: ['next-generation'], reason: 'Russia next-generation MBT hull → T-14 Armata wheel' },
    { donor: 't90m', roles: MBT_HULL_ROLES, eras: ['modern'], reason: 'Russia modern MBT hull → T-90M wheel' },
    { donor: 't90', roles: MBT_HULL_ROLES, reason: 'Russia cold-war MBT hull → T-90 wheel' },
    { donor: 'bmp3m_dragun125_x', reason: 'Russia IFV/light hull → BMP-3M Dragun wheel' },
  ],
  germany: [
    { donor: 'kf51', roles: MBT_HULL_ROLES, eras: ['next-generation'], reason: 'Germany next-generation MBT hull → KF51 Panther wheel' },
    { donor: 'leo2a6', roles: MBT_HULL_ROLES, reason: 'Germany MBT hull → Leopard 2A6 wheel' },
    { donor: 'kf41_lynx_x', reason: 'Germany IFV hull → Lynx wheel' },
  ],
  usa: [
    { donor: 'm1a2', roles: MBT_HULL_ROLES, eras: LATE_ERAS, reason: 'USA modern/next-generation MBT hull → M1A2 Abrams wheel' },
    { donor: 'm60a3', roles: MBT_HULL_ROLES, reason: 'USA Patton-era MBT hull → M60A3 wheel (owner 2026-09-22: fits better than the Abrams disc)' },
    { donor: 'm551a1_tts', reason: 'USA light/IFV hull → M551A1 TTS wheel' },
  ],
});

/** Spec nations that read another set (Ukraine hulls follow their base vehicle's family, see WHEEL_STANDARD_EXCEPTIONS). */
const NATION_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  'ussr/russia': 'russia',
  ussr: 'russia',
  ukraine: 'russia',
});

type WheelStandardException = Readonly<{ donor: WheelDonorId; reason: string }>;

/** Per-hull redirects that the nation rule alone would get wrong, each with its reason. */
export const WHEEL_STANDARD_EXCEPTIONS: Readonly<Record<string, WheelStandardException>> = Object.freeze({
  sabra_mk2_x: { donor: 'm60a3', reason: 'owner 2026-09-22: "sabra uses the m60a3 wheels" (Magach/M60 hull under Israeli armour)' },
  aft10_x: { donor: 'type100', reason: 'tank destroyer on a ZBD-04-family IFV chassis → China IFV wheel' },
  bmpt_terminator2: { donor: 't90m', reason: 'T-72/T-90 MBT hull under an IFV role → T-90M wheel' },
  bmpt_t90: { donor: 't90m', reason: 'T-90 MBT hull under an IFV role → T-90M wheel' },
  bmp2: { donor: 'bmp3m_dragun125_x', reason: 'nation USSR, cold-war IFV → the Russia light set' },
  ua_t64bv: { donor: 't90', reason: 'Ukraine: T-64 base hull → Russia older T-series donor' },
  ua_t80bv: { donor: 't90', reason: 'Ukraine: T-80 base hull → Russia older T-series donor' },
  ua_t80u_kursk: { donor: 't90', reason: 'Ukraine: T-80U base hull → Russia older T-series donor' },
  t84: { donor: 't90', reason: 'Ukraine: T-84 (T-80UD family) base hull → Russia older T-series donor' },
  ua_t84_oplot_m: { donor: 't90', reason: 'Ukraine: T-84 Oplot-M base hull → Russia older T-series donor' },
  ua_m2a3_bradley: { donor: 'm551a1_tts', reason: 'Ukraine: Bradley base hull → USA light donor' },
  leo2a6_ua: { donor: 'leo2a6', reason: 'Ukraine: Leopard 2A6 base hull → Germany MBT donor' },
});

/** Pre-1950 hulls that keep their period wheel constructions (owner exception list, 2026-09-22). */
export const PERIOD_WHEEL_HULLS: readonly string[] = Object.freeze([
  'tiger1', 'panther_g', 'sturmtiger', 'jpz_e100', 'jpz_e100_x',
  'kv2', 'isu152', 'isu122s',
  't95', 'm26_pershing', 'm45_patton',
]);

interface NationWheelSpec {
  id?: RuntimeValue;
  nation?: RuntimeValue;
  era?: RuntimeValue;
  role?: RuntimeValue;
}

export interface NationWheelResolution {
  /** keep: the hull keeps its own wheel code (period/community/unknown); donor: the hull draws the donor
   * construction natively; standard: the running-gear builder replaces the hull's road-wheel face with the donor construction. */
  readonly kind: 'keep' | 'donor' | 'standard';
  readonly donor?: WheelDonorId;
  readonly pattern?: WheelPatternId;
  readonly construction?: WheelConstructionId;
  readonly reason: string;
}

const DONOR_OF_SELF: ReadonlyMap<string, WheelDonorId> = (() => {
  const map = new Map<string, WheelDonorId>();
  for (const donor of WHEEL_DONOR_IDS) {
    for (const id of WHEEL_DONORS[donor].self) {
      if (map.has(id)) throw new Error(`Wheel donor self list overlap: ${id}`);
      map.set(id, donor);
    }
  }
  return map;
})();

function resolved(kind: 'donor' | 'standard', donor: WheelDonorId, reason: string): NationWheelResolution {
  const record = WHEEL_DONORS[donor];
  return Object.freeze({ kind, donor, pattern: record.pattern, construction: record.construction, reason });
}

/** Resolve the nation road-wheel standard for one vehicle spec. */
export function resolveNationWheel(spec: NationWheelSpec | null | undefined): NationWheelResolution {
  const id = String(spec?.id || '').toLowerCase();
  if (!id) return Object.freeze({ kind: 'keep', reason: 'no vehicle id' });
  const self = DONOR_OF_SELF.get(id);
  if (self) return resolved('donor', self, `${id} draws the ${self} construction natively`);
  const era = String(spec?.era || '').toLowerCase();
  const nation = String(spec?.nation || '').toLowerCase();
  if (era === 'ww2') return Object.freeze({ kind: 'keep', reason: 'pre-1950 hull keeps its period wheel construction' });
  if (nation === 'community') return Object.freeze({ kind: 'keep', reason: 'community placeholder hull keeps its own wheels' });
  const exception = WHEEL_STANDARD_EXCEPTIONS[id];
  if (exception) return resolved('standard', exception.donor, exception.reason);
  const rules = NATION_WHEEL_SETS[NATION_ALIASES[nation] ?? nation];
  if (!rules) return Object.freeze({ kind: 'keep', reason: `nation "${spec?.nation ?? ''}" has no wheel set` });
  const role = String(spec?.role || '').toLowerCase();
  for (const rule of rules) {
    if (rule.ids && !rule.ids.includes(id)) continue;
    if (rule.roles && !rule.roles.includes(role)) continue;
    if (rule.eras && !rule.eras.includes(era)) continue;
    return resolved('standard', rule.donor, rule.reason);
  }
  throw new Error(`Nation wheel set for ${nation} has no rule for ${id} (${role}, ${era})`);
}
