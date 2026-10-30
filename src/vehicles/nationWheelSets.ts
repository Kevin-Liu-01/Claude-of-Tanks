import {NATIONAL_LEGACY_IDS} from './nationalLegacyConfig.ts';
import {NATIONAL_MODERNIZATION_CONFIG} from './nationalModernizationConfig.ts';
// Nation road-wheel sets — the one table that says which road-wheel construction every playable hull draws.
//
// Owner 2026-09-22: "im going to give 2 wheel variations for each nation: china uses ztz-100 wheels or type 100
// ifv wheels. israel uses merkava mk 4b or namer wheels. sabra gets an exception … sweden uses the strv 122 or
// cv90 mk 4 x wheels. korea uses the xk2_black_panther or k1e1 wheels. poland uses the pl-01 or bwp-1 wheels. japan uses the
// type 10 or type 90 wheels. italy uses the c1 c1_ariete_preserie wheels. france uses the leclerc_s2 xlr or amx 40 wheels. UK
// uses the challenger 3, challenger 2e, or warrior milan x wheels. russia uses the t-90, t-90m, object148_proto armata, and
// bmp 3m dragun wheels. germany uses the kf51_evo panther, leopard 2a6, lynx wheels. usa uses the m1a1_abrams_hc abrams,
// m551a1 tts wheels. standardize our wheels across NATIONS! then we can delete any wheels we dont use anymore".
// Correction the same day: "sabra uses the m60a3 wheels" — the USA set therefore holds three donors (m1a1_abrams_hc for
// modern MBTs, m551a1_tts for light hulls, m60a3 for the Sabra and the Patton-era hulls).
//
// A donor's construction is its FACE construction (dish, spokes, fasteners, hub, tire profile), never its
// dimensions: every hull keeps its own wheel radius, station count and axle positions, and its authored tire
// width bounds the construction (nationWheelConstructions.ts: never narrower than the tire, never wider than
// the larger of the standard cap envelope and 0.90 × the track width, and never outside 0.85-1.15 of the
// donor's proportion — round 40). Hulls listed as a donor's `self`
// draw the construction natively and keep their own wheel code — a donor IS its nation's standard. Pre-1950
// hulls keep their period constructions (a Sherman-era hull on Abrams wheels is a visible error) and are
// listed for the owner in PERIOD_WHEEL_HULLS; the 'Community' placeholder hulls keep theirs too.
//
// This module is pure data plus a resolver (no DOM, no three.js) so wheelPatterns.ts, the running-gear
// builder, the receipts and the node tools all read the same table.
import type { RuntimeValue } from '../runtimeTypes.ts';
import type { WheelPatternId } from './wheelPatterns.ts';

type WheelDonorId =
  | 'ztz100' | 'type100'
  | 'merkava4b' | 'namer_ifv'
  | 'strv121' | 'cv90_mk4'
  | 'xk2_black_panther' | 'k1e1'
  | 'pl01' | 'bwp1'
  | 'type10_tk_x' | 'type90_kyumaru'
  | 'c1_ariete_proto_serie1'
  | 'leclerc_sxxi' | 'amx40_proto'
  | 'challenger3_proto' | 'challenger2e' | 'warrior_tes_h'
  | 't90_1992' | 't90am' | 'object148_proto' | 'bmp3m_dragun125' | 't64bm1m'
  | 'kf51_evo' | 'leo2a4' | 'kf41_lynx'
  | 'm1a1_abrams_hc' | 'm551a1_tts' | 'm60a3' | 'm48a3_patton'
  | 'type59';

/** Road-wheel face constructions; nationWheelConstructions.ts builds the ones a non-donor hull consumes. */
export type WheelConstructionId =
  | 'ztz100-recessed-web' | 'type100-paired-pressed'
  | 'merkava-deep-dish' | 'namer-stepped-hub'
  | 'strv122-pressed-recess' | 'cv90-armoured-hub'
  | 'k2-dished-hub' | 'k1a1-deep-bowl'
  | 'pl01-plain-dish' | 'bwp1-armoured-hub'
  | 'type10-paired' | 'type90-recessed-forging'
  | 'ariete-recessed-dish'
  | 'leclerc-stepped-plate' | 'amx40-pressed-face'
  | 'challenger-hollow-paired' | 'warrior-plain-web'
  | 't90-pressed-source-face' | 't14-armoured-hub' | 'dragun-rolled-lip' | 't64-steel-tyred-dual'
  | 'kf51-forged-face' | 'leo2a6-paired-dish' | 'lynx-stamped-web'
  | 'abrams-hollow-paired' | 'sheridan-pressed-rim' | 'm60a3-cast-spoke' | 'm48-dished-disc'
  | 't54-starfish-spoke';

interface NationWheelDonor {
  readonly donor: WheelDonorId;
  /** Playable ids that draw this construction natively and keep their own wheel code. */
  readonly self: readonly string[];
  readonly pattern: WheelPatternId;
  readonly construction: WheelConstructionId;
  readonly note: string;
}

export const WHEEL_DONORS: Readonly<Record<WheelDonorId, NationWheelDonor>> = Object.freeze({
  // 262: the ZTZ-20 family hull (ztz20Family.ts) draws the construction natively for all four stages
  ztz100: Object.freeze({ donor: 'ztz100', self: ['ztz100', 'ztz20', 'ztz20_prototype', 'ztz100_prototype'], pattern: 'armored-hub-six', construction: 'ztz100-recessed-web',
    note: 'Objects 7/17 raised hub, recessed web and curved rim shoulder over paired tire bands, with the twelve hub hexes and eight web fasteners (ztz20Family.ts).' }),
  type100: Object.freeze({ donor: 'type100', self: ['type100'], pattern: 'pressed-six', construction: 'type100-paired-pressed',
    note: 'Two pressed six-rib dishes and two tires around a real guide channel (type100RunningGear.ts).' }),
  merkava4b: Object.freeze({ donor: 'merkava4b', self: ['merkava4b'], pattern: 'deep-dish-eight', construction: 'merkava-deep-dish',
    note: 'Fleet deep-dish eight-fastener disc at dish 0.78 r under the Mk 4B five-layer dished face stack — pale dish ring, dark break, mid dish, dark inner dish, hub cap (merkava.ts wheelFace).' }),
  namer_ifv: Object.freeze({ donor: 'namer_ifv', self: ['namer_ifv'], pattern: 'deep-dish-eight', construction: 'namer-stepped-hub',
    note: 'Source wheel18 stepped hub, recessed web and outward rim (namerWheelStock.ts); the only Israeli IFV, so no other hull draws it.' }),
  strv121: Object.freeze({ donor: 'strv121', self: ['strv122'], pattern: 'plain-dish-twelve', construction: 'strv122-pressed-recess',
    note: 'The source-measured Strv 122 X bowl with six pressed recesses defines the Stridsvagn 122 wheel; the base strv121 draws it through the standard (strv122XSuppliedGear.ts).' }),
  cv90_mk4: Object.freeze({ donor: 'cv90_mk4', self: ['cv90_mk4'], pattern: 'armored-hub-six', construction: 'cv90-armoured-hub',
    note: 'Fleet armoured-hub six-fastener disc (cv90MkivSourceX.ts draws the generic stock).' }),
  xk2_black_panther: Object.freeze({ donor: 'xk2_black_panther', self: ['xk2_black_panther', 'k2_black_panther', 'k2b'], pattern: 'flanged-twelve', construction: 'k2-dished-hub',
    note: 'The K2 X source twin wheel: deep dish, ten bolt heads, hub boss (nationWheelConstructions.ts k2RoadWheelFace); XK2, K2B and K2 draw it.' }),
  k1e1: Object.freeze({ donor: 'k1e1', self: ['k1a1'], pattern: 'flanged-twelve', construction: 'k1a1-deep-bowl',
    note: 'The K1A1 X small hub, deep dish and rolled rim (k1a1XWheels.ts); the base k1e1 and the Korean IFVs draw it through the standard.' }),
  pl01: Object.freeze({ donor: 'pl01', self: ['pl01', 'pl01_105'], pattern: 'plain-dish-twelve', construction: 'pl01-plain-dish',
    note: 'Fleet plain twelve-fastener dish at the PL-01 dish 0.60 r (poland.ts).' }),
  bwp1: Object.freeze({ donor: 'bwp1', self: ['bwp1'], pattern: 'armored-hub-six', construction: 'bwp1-armoured-hub',
    note: 'Fleet armoured-hub six-fastener disc (afvFamily.ts draws the generic stock).' }),
  type10_tk_x: Object.freeze({ donor: 'type10_tk_x', self: ['type10', 'type10_dozer'], pattern: 'flanged-twelve', construction: 'type10-paired',
    note: 'Paired turned halves with a recessed hub and a real guide channel (pairedRunningGearStock.ts, the Type 10 X fitted course).' }),
  type90_kyumaru: Object.freeze({ donor: 'type90_kyumaru', self: ['type90'], pattern: 'flanged-twelve', construction: 'type90-recessed-forging',
    note: 'Lathed forging with the dish 120 mm behind the rubber face and a clipped hub over an open tire annulus (type90X.ts).' }),
  c1_ariete_proto_serie1: Object.freeze({ donor: 'c1_ariete_proto_serie1', self: ['c1_ariete', 'c2_ariete'], pattern: 'split-rim-ten', construction: 'ariete-recessed-dish',
    note: 'Recessed dish with a proud axle cap over paired tire bands (arieteXSuppliedGear.ts, the owner-approved Ariete frame).' }),
  leclerc_sxxi: Object.freeze({ donor: 'leclerc_sxxi', self: ['leclerc_xlr'], pattern: 'scalloped-six', construction: 'leclerc-stepped-plate',
    note: 'Stepped steel plate and grooved paired tires measured from the Leclerc source (leclercXWheels.ts); XLR and S2 share the wheel.' }),
  amx40_proto: Object.freeze({ donor: 'amx40_proto', self: ['amx40'], pattern: 'scalloped-six', construction: 'amx40-pressed-face',
    note: 'Fleet scalloped disc behind the AMX-40 X pressed face (rim ring, six ribs and bolts) over an open tire annulus (amx40X.ts).' }),
  challenger3_proto: Object.freeze({ donor: 'challenger3_proto', self: ['challenger3_proto', 'challenger3', 'challenger3_td', 'challenger3_td_rws'], pattern: 'pressed-eight', construction: 'challenger-hollow-paired',
    note: 'Hollow paired rubber-tyred halves with eight hub fasteners as insets (hollowRoadWheelStock.ts); the Challenger 2 and 3 share this construction and differ only in size.' }),
  challenger2e: Object.freeze({ donor: 'challenger2e', self: ['challenger2', 'challenger2e', 'fv4034', 'ua_challenger2'], pattern: 'pressed-eight', construction: 'challenger-hollow-paired',
    note: 'Same hollow paired construction as the Challenger 3; every other UK MBT hull draws it.' }),
  warrior_tes_h: Object.freeze({ donor: 'warrior_tes_h', self: ['warrior_tes_h'], pattern: 'armored-hub-six', construction: 'warrior-plain-web',
    note: 'Object_33 deep plain steel web over paired tire bands (fv510MilanX.ts).' }),
  t90_1992: Object.freeze({ donor: 't90_1992', self: [], pattern: 'pressed-six', construction: 't90-pressed-source-face',
    note: 'In this fleet the T-90 and T-90M wheels are one construction (the T-90M X source-pressed face); the older T-series hulls draw it through the standard.' }),
  t90am: Object.freeze({ donor: 't90am', self: ['t90a', 't90a_vladimir', 't90m', 't90sm'], pattern: 'pressed-six', construction: 't90-pressed-source-face',
    note: 'Fleet pressed six-rib disc under the T-90 X source-pressed face: six-hole plate, rim ring, hub and bolt heads (t90X.ts).' }),
  object148_proto: Object.freeze({ donor: 'object148_proto', self: ['object148_proto', 't14_armata'], pattern: 'armored-hub-six', construction: 't14-armoured-hub',
    note: 'Fleet armoured-hub six-fastener disc (t14X.ts draws the generic stock); no other Russian next-generation MBT hull exists.' }),
  // 262 (owner 2026-10-27, via Main: the true T-64s get "the T-64's distinctive small road wheels, six a side, with
  // their internal shock absorption, and the thin track"): the T-64 family draws its own construction natively.
  t64bm1m: Object.freeze({ donor: 't64bm1m', self: ['t64bm1m', 't64bv', 't64b1v_2022', 'pt64_tur'], pattern: 'pressed-eight', construction: 't64-steel-tyred-dual',
    note: 'The T-64 dual road wheel: steel-tyred pressed halves on an internal rubber ring, twelve pressed dimples round a six-bolt hub (t64RunningGear.ts).' }),
  bmp3m_dragun125: Object.freeze({ donor: 'bmp3m_dragun125', self: ['bmp3m_dragun125'], pattern: 'armored-hub-six', construction: 'dragun-rolled-lip',
    note: 'Source hub, web and rolled outer lip over separated paired tire bands (bmp3mDragun125X.ts).' }),
  kf51_evo: Object.freeze({ donor: 'kf51_evo', self: ['kf51_evo', 'kf51_u', 'kf51_panther'], pattern: 'plain-dish-twelve', construction: 'kf51-forged-face',
    note: 'Fleet plain dish under the Panther forged face stack (leopard.ts); the KF51 family is the only German next-generation MBT hull.' }),
  leo2a4: Object.freeze({ donor: 'leo2a4', self: ['leo2a6', 'leo2a6_ua'], pattern: 'plain-dish-twelve', construction: 'leo2a6-paired-dish',
    note: 'The source-measured Leopard 2A6 X paired pressed dishes and tire bands define the Leopard 2 wheel (leopardA6XWheels.ts); every other Leopard hull draws it.' }),
  kf41_lynx: Object.freeze({ donor: 'kf41_lynx', self: ['kf41_lynx'], pattern: 'plain-dish-twelve', construction: 'lynx-stamped-web',
    note: 'Source-measured KF41 stamped webs, web and hub fasteners over paired tire bands (kf41LynxWheelStock.ts).' }),
  m1a1_abrams_hc: Object.freeze({ donor: 'm1a1_abrams_hc', self: ['m1a1', 'm1a1ha', 'm1a1_abrams_hc', 'm1a1_abrams_sa', 'm1a1_abrams_aim', 'm1a1_abrams_fep', 'm1a2_abrams', 'm1a2_abrams_tusk', 'm1a2_abrams_sepv2', 'm1a2_abrams_sepv3', 'ua_m1a1', 'ua_m1a2_abrams'],
    pattern: 'split-rim-ten', construction: 'abrams-hollow-paired',
    note: 'Hollow paired road wheel from the SEP v2 source measurements (hollowRoadWheelStock.ts / abramsSourceXWheels.ts).' }),
  m551a1_tts: Object.freeze({ donor: 'm551a1_tts', self: ['m551a1_tts'], pattern: 'cast-five-spoke', construction: 'sheridan-pressed-rim',
    note: 'Fleet cast five-spoke disc under the Sheridan pressed rim, dish well, hub drum and cap (sheridan.ts).' }),
  m60a3: Object.freeze({ donor: 'm60a3', self: ['m60a3'], pattern: 'cast-five-spoke', construction: 'm60a3-cast-spoke',
    note: 'Fleet cast five-spoke disc (patton.ts); owner 2026-09-22: the Sabra takes it, and it fits the Patton-era USA hulls better than the Abrams disc.' }),
  // 262: the T-54/T-55 family's open five-spoke "starfish" wheel; consumed through WHEEL_STANDARD_EXCEPTIONS while
  // T54_STARFISH_WHEELS holds (no self ids, so both hulls draw it through the one standard path)
  type59: Object.freeze({ donor: 'type59', self: [], pattern: 'christie-six', construction: 't54-starfish-spoke',
    note: 'The T-54/T-55 family cast dished wheel with its windows between the arms, on its thick tyre (t54Family.ts), the period exception the Type 59 and the T-55A draw.' }),
  m48a3_patton: Object.freeze({ donor: 'm48a3_patton', self: [], pattern: 'deep-dish-eight', construction: 'm48-dished-disc',
    note: 'Release 266 (owner 2026-10-28: "FIX THE ISSUES WITH TRACKS" on the new M48s): the M48 road wheel as photographed at Latrun, Munster and Kubinka, a dished solid disc with its hub and eight nuts, not the five-spoke cast wheel; the four new M48 marks draw it by exception.' }),
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
    { donor: 'ztz100', roles: MBT_HULL_ROLES, reason: 'China MBT hull → ZTZ-100 wheel' },
    { donor: 'type100', reason: 'China IFV/light hull → Type 100 IFV wheel' },
  ],
  israel: [
    { donor: 'merkava4b', roles: MBT_HULL_ROLES, reason: 'Israel MBT hull → Merkava Mk 4B wheel' },
    { donor: 'namer_ifv', reason: 'Israel IFV/APC hull → Namer wheel' },
  ],
  sweden: [
    { donor: 'strv121', roles: MBT_HULL_ROLES, reason: 'Sweden MBT/tank-destroyer hull → Strv 122 wheel' },
    { donor: 'cv90_mk4', reason: 'Sweden IFV/light hull → CV90 Mk IV X wheel' },
  ],
  'south korea': [
    { donor: 'k1e1', ids: ['k1e1'], reason: 'the K1A1 draws its own wheel' },
    { donor: 'xk2_black_panther', roles: MBT_HULL_ROLES, reason: 'South Korea MBT hull → K2 wheel' },
    { donor: 'k1e1', reason: 'South Korea IFV hull → the smaller K1A1 wheel (the owner listed no Korean IFV donor; recorded as a choice — the K21 is redirected to the BMP-3 ROK wheel in WHEEL_STANDARD_EXCEPTIONS, owner 2026-09-23)' },
  ],
  poland: [
    { donor: 'pl01', roles: MBT_HULL_ROLES, reason: 'Poland MBT hull → PL-01 wheel' },
    { donor: 'bwp1', reason: 'Poland IFV hull → BWP-1 wheel' },
  ],
  japan: [
    { donor: 'type10_tk_x', eras: LATE_ERAS, reason: 'Japan modern/next-generation hull → Type 10 wheel' },
    { donor: 'type90_kyumaru', reason: 'Japan cold-war hull → Type 90 wheel' },
  ],
  italy: [
    { donor: 'c1_ariete_proto_serie1', reason: 'Italy → C1 Ariete wheel (the only Italian donor)' },
  ],
  france: [
    { donor: 'leclerc_sxxi', eras: LATE_ERAS, reason: 'France modern hull → Leclerc XLR wheel' },
    { donor: 'amx40_proto', reason: 'France cold-war hull → AMX-40 wheel' },
  ],
  uk: [
    { donor: 'challenger3_proto', roles: MBT_HULL_ROLES, eras: ['next-generation'], reason: 'UK next-generation MBT hull → Challenger 3 wheel' },
    { donor: 'challenger2e', roles: MBT_HULL_ROLES, reason: 'UK MBT hull → Challenger 2E wheel' },
    { donor: 'warrior_tes_h', reason: 'UK IFV/APC hull → Warrior Milan X wheel' },
  ],
  russia: [
    { donor: 'object148_proto', roles: MBT_HULL_ROLES, eras: ['next-generation'], reason: 'Russia next-generation MBT hull → T-14 Armata wheel' },
    { donor: 't90am', roles: MBT_HULL_ROLES, eras: ['modern'], reason: 'Russia modern MBT hull → T-90M wheel' },
    { donor: 't90_1992', roles: MBT_HULL_ROLES, reason: 'Russia cold-war MBT hull → T-90 wheel' },
    { donor: 'bmp3m_dragun125', reason: 'Russia IFV/light hull → BMP-3M Dragun wheel' },
  ],
  germany: [
    { donor: 'kf51_evo', roles: MBT_HULL_ROLES, eras: ['next-generation'], reason: 'Germany next-generation MBT hull → KF51 Panther wheel' },
    { donor: 'leo2a4', roles: MBT_HULL_ROLES, reason: 'Germany MBT hull → Leopard 2A6 wheel' },
    { donor: 'kf41_lynx', reason: 'Germany IFV hull → Lynx wheel' },
  ],
  usa: [
    { donor: 'm1a1_abrams_hc', roles: MBT_HULL_ROLES, eras: LATE_ERAS, reason: 'USA modern/next-generation MBT hull → M1A2 Abrams wheel' },
    { donor: 'm60a3', roles: MBT_HULL_ROLES, reason: 'USA Patton-era MBT hull → M60A3 wheel (owner 2026-09-22: fits better than the Abrams disc)' },
    { donor: 'm551a1_tts', reason: 'USA light/IFV hull → M551A1 TTS wheel' },
  ],
});

/** Spec nations that read another set (Ukraine hulls follow their base vehicle's family, see WHEEL_STANDARD_EXCEPTIONS). */
const NATION_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  'ussr/russia': 'russia',
  ussr: 'russia',
  ukraine: 'russia',
  // release 262: South Africa's one hull is the Olifant Mk 2, a Centurion: the UK set its family draws
  'south africa': 'uk',
  // and Australia's, the Mk 5/1
  australia: 'uk',
});

type WheelStandardException = Readonly<{ donor: WheelDonorId; reason: string }>;

/**
 * Release 262 (owner 2026-10-28, "Allow period wheels"): the Type 59 and the T-55A ride the T-54/T-55 "starfish"
 * five-spoke wheel instead of their national standards (China's ZTZ-100 web, Russia's T-90 face); modern tanks keep the
 * national standard. One switch: false returns both to the standard.
 */
export const T54_STARFISH_WHEELS = true;

/** Per-hull redirects that the nation rule alone would get wrong, each with its reason. */
export const WHEEL_STANDARD_EXCEPTIONS: Readonly<Record<string, WheelStandardException>> = Object.freeze({
  pt91m: { donor: 't90_1992', reason: 'owner 2026-10-06: Pendekar retains the actual T-72BU donor chassis and its pressed running gear' },
  sabra_mk2: { donor: 'm60a3', reason: 'owner 2026-09-22: "sabra uses the m60a3 wheels" (Magach/M60 hull under Israeli armour)' },
  // release 266: the M48s of Israel and Germany ride the M48A5's cast running gear (pattonCast.ts), as the Sabra does
  m48a3_patton: { donor: 'm48a3_patton', reason: 'release 266: the M48A3 Mod B: the M48 dished disc road wheel' },
  magach3: { donor: 'm48a3_patton', reason: 'release 266: the Magach 3 is an M48 hull: the M48 dished disc road wheel' },
  magach6b: { donor: 'm60a3', reason: 'release 267: the Magach 6B is an M60A1 hull: the M60 cast five-spoke wheel' },
  magach7c: { donor: 'm60a3', reason: 'release 267: the Magach 7C is an M60 hull: the M60 cast five-spoke wheel' },
  m48a2ga2: { donor: 'm48a3_patton', reason: 'release 266: the Bundeswehr M48A2GA2 is an M48 hull: the M48 dished disc road wheel' },
  m48_super: { donor: 'm48a3_patton', reason: 'release 266: the M48 Super is an M48A2G hull: the M48 dished disc road wheel' },
  aft10: { donor: 'type100', reason: 'tank destroyer on a ZBD-04-family IFV chassis → China IFV wheel' },
  bmpt_terminator2: { donor: 't90am', reason: 'T-72/T-90 MBT hull under an IFV role → T-90M wheel' },
  bmpt_t90: { donor: 't90am', reason: 'T-90 MBT hull under an IFV role → T-90M wheel' },
  bmp2: { donor: 'bmp3m_dragun125', reason: 'nation USSR, cold-war IFV → the Russia light set' },
  ua_t80bv: { donor: 't90_1992', reason: 'Ukraine: T-80 base hull → Russia older T-series donor' },
  t64bv_donbas: { donor: 't90_1992', reason: 'Ukraine: T-64 base hull → Russia older T-series donor' },
  t80u_kursk: { donor: 't90_1992', reason: 'Ukraine: T-80U base hull → Russia older T-series donor' },
  t84: { donor: 't90_1992', reason: 'Ukraine: T-84 (T-80UD family) base hull → Russia older T-series donor' },
  t84bm_oplot_m: { donor: 't90_1992', reason: 'Ukraine: T-84U Oplot base hull → Russia older T-series donor' },
  bm_oplot_m: { donor: 't90_1992', reason: 'Ukraine: T-84BM Oplot-M (T-80UD hull) → Russia older T-series donor' },
  bm_oplot_t: { donor: 't90_1992', reason: 'Ukraine: T-84BM Oplot-T (T-80UD hull) → Russia older T-series donor' },
  ua_m2a3_bradley: { donor: 'm551a1_tts', reason: 'Ukraine: Bradley base hull → USA light donor' },
  bmp3_rok: { donor: 'bmp3m_dragun125', reason: 'round 40 axial fit: a Korean-marked Russian BMP-3 hull draws the BMP-3 family wheel like bmp2/bmp3 (the K1A1 bowl fit 0.69 in its 0.30 track)' },
  k21: { donor: 'bmp3m_dragun125', reason: 'owner 2026-09-23 (round 46): the K21 takes the BMP-3 ROK wheel — the same Dragun rolled-lip construction bmp3_rok draws, instead of the Korean IFV rule\'s K1A1 bowl' },
  griffin_viper: { donor: 'm1a1_abrams_hc', reason: 'round 40 axial fit: the ASCOD 2 chassis rides paired road wheels; the single Sheridan rim needed a 2× stretch to reach its measured 0.5 m width, the Abrams hollow paired wheel is its proportion' },
  griffin50mm: { donor: 'm1a1_abrams_hc', reason: 'round 40 axial fit: the ASCOD 2 chassis rides paired road wheels; the single Sheridan rim needed a 2× stretch to reach its measured 0.5 m width, the Abrams hollow paired wheel is its proportion' },
  // owner 2026-10-25 ("update the type 74 and stb 1 tanks completely fullly, making these tanks no longer look really
  // outdated"): their five 0.70-0.74 m wheels stand fully exposed (no skirts), where the Type 90 forging's dish 120 mm
  // behind the rubber face read as an empty drum; the other Japanese standard (owner 2026-09-22: "japan uses the type
  // 10 or type 90 wheels") carries the turned faces and recessed hub at that size.
  type74: { donor: 'type10_tk_x', reason: 'owner 2026-10-25: the exposed Type 74 wheels take the Japanese Type 10 face (the Type 90 recess read as a drum at 0.74 m)' },
  stb1: { donor: 'type10_tk_x', reason: 'owner 2026-10-25: the STB-1 shares the Type 74 wheel and its Type 10 face' },
  christian2: { donor: 'leo2a4', reason: 'release 262: the Danish Christian II concept rides a Leopard 2-pattern hull and seven-wheel gear (Denmark has no wheel set) → Germany MBT donor' },
  ...(T54_STARFISH_WHEELS ? {
    type59: { donor: 'type59', reason: 'owner 2026-10-28 ("Allow period wheels"): the T-54A-pattern Type 59 keeps its period starfish wheel' },
    t55a: { donor: 'type59', reason: 'owner 2026-10-28 ("Allow period wheels"): the T-55A keeps its period starfish wheel' },
  } : {}),
  // release 262 (the owner: the new Sho't "with proper equipment geometries"): the IDF kept the Centurion's running gear
  shot_kal: { donor: 'challenger2e', reason: 'release 262: the Sho\'t Kal is a Centurion hull on its own Horstmann bogies -> the UK wheel the Mk 3 and Mk 5/2 draw, not the Merkava\'s' },
});

/** Pre-1950 hulls that keep their period wheel constructions (owner exception list, 2026-09-22). */
export const PERIOD_WHEEL_HULLS: readonly string[] = Object.freeze([
  'jpz_e100', 'kv2',
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
  const concept=NATIONAL_MODERNIZATION_CONFIG.find(c=>c.id===id);
  if(concept||NATIONAL_LEGACY_IDS.some(legacyId=>legacyId===id))return resolved('standard','t90_1992','Owner-selected Russian donor chassis retains its pressed running gear');
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
