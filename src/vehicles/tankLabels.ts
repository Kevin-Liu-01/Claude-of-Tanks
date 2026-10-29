// Canonical public labels for the first-party fleet.
//
// Vehicle IDs are stable save/protocol keys. They are intentionally not used
// as display copy: the garage, generated assets and accessibility surfaces all
// consume this one label record instead of inventing their own punctuation or
// abbreviations.

import type { RuntimeValue } from '../runtimeTypes.ts';

interface TankLabelSpec {
  id?: RuntimeValue;
  name?: RuntimeValue;
}

interface TankLabelRecord {
  readonly id: string;
  readonly displayName: string;
  readonly shortName: string;
  readonly searchAliases: readonly string[];
  /** i18n key of a one-sentence note the Gallery adds to the vehicle's brief, or null. */
  readonly noteKey: string | null;
}

interface TankLabelOverride {
  displayName: string;
  shortName?: string;
  searchAliases?: readonly string[];
  noteKey?: string;
}

const LABEL_OVERRIDES: Readonly<Record<string, TankLabelOverride>> = Object.freeze({
  griffin50mm: { displayName: 'Griffin 50 mm', searchAliases: ['Griffin 50 mm X'] },
  ajax: { displayName: 'Ajax', searchAliases: ['Ajax X'] },
  sabra_mk2: { displayName: 'Sabra Mk 2', searchAliases: ['Sabra Mk 2 X'] },
  cv90105_tml: { displayName: 'CV90105 TML', searchAliases: ['CV90105 TML X'] },
  kf41_lynx: { displayName: 'KF41 Lynx', searchAliases: ['KF41 Lynx X'] },
  k21: { displayName: 'K21', searchAliases: ['K21 X'] },
  m551_sheridan: {
    displayName: 'M551 Sheridan', shortName: 'M551',
    searchAliases: ['Sheridan', 'M551 Shillelagh', 'US airborne light tank'],
  },
  m551a1_tts: {
    displayName: 'M551A1 TTS', shortName: 'M551A1 TTS',
    searchAliases: ['Sheridan TTS', 'M551A1', 'TTS Sheridan', 'advanced Sheridan'],
  },
  strv81: {
    displayName: 'Stridsvagn 81', shortName: 'Strv 81',
    searchAliases: ['Centurion Strv 81', 'Swedish Centurion'],
  },
  udes03: {
    displayName: 'UDES 03', shortName: 'UDES 03',
    searchAliases: ['UDES 03 Swedish tank destroyer', 'Swedish siege TD'],
  },
  strv103b: {
    displayName: 'Stridsvagn 103B', shortName: 'Strv 103B',
    searchAliases: ['S-Tank', 'S-Tank B'],
  },
  strv103a: {
    displayName: 'Stridsvagn 103A', shortName: 'Strv 103A',
    searchAliases: ['S-Tank A'],
  },
  strv121: {
    displayName: 'Stridsvagn 121', shortName: 'Strv 121',
    searchAliases: ['Swedish Leopard 2', 'Strv 122A', 'Stridsvagn 122A'],
  },
  cv90: {
    displayName: 'CV90', shortName: 'CV90',
    searchAliases: ['Combat Vehicle 90', 'Stridsfordon 90', 'CV9040', 'Swedish IFV'],
  },
  cv90_mk4_concept: {
    displayName: 'CV90 Mk 4 Concept', shortName: 'CV90 Mk 4 Concept',
    searchAliases: ['CV90 Mk IV', 'CV90 Mark IV', 'CV90 MkIV', 'CV90 D-series'],
  },
  puma_s1: {displayName:'Puma S1',shortName:'Puma S1',searchAliases:['SPz Puma S1 X','RCT30 MELLS']},
  amx10p: {displayName:'AMX-10P',shortName:'AMX-10P',searchAliases:['AMX 10 P','Toucan II']},
  amx10p_25: {displayName:'AMX-10P 25',shortName:'AMX-10P 25',searchAliases:['AMX 10 P 25','Dragar']},
  dardo: {displayName:'Dardo',shortName:'Dardo',searchAliases:['VCC Dardo','HITFIST 25']},
  lrmv_lynx: {displayName:'LRMV Lynx',shortName:'LRMV Lynx',searchAliases:['Italian Lynx KF41','A2CS IFV','Lance 30']},
  borsuk: {displayName:'Borsuk',shortName:'Borsuk',searchAliases:['BWP Borsuk','ZSSW-30']},
  cv9040c: {displayName:'CV9040C',shortName:'CV9040C',searchAliases:['CV90 X','Stridsfordon 9040C']},
  type89: {displayName:'Type 89',shortName:'Type 89',searchAliases:['Japanese Type 89 IFV X']},
  cv90_mk4: {
    displayName: 'CV90 Mk 4', shortName: 'CV90 Mk 4',
    searchAliases: ['CV90 Mk IV X', 'CV90 MkIV X', 'CV90 Mark 4 X'],
  },
  t72m1_jaguar: {
    displayName: 'T-72M1 Jaguar', shortName: 'T-72M1 Jaguar',
    searchAliases: ['T-72M1 Jaguar Poland', 'Jaguar MBT'],
  },
  pt91a_twardy: {
    displayName: 'PT-91A Twardy', shortName: 'PT-91A Twardy',
    searchAliases: ['PT-91 Twardy', 'Twardy MBT'],
  },
  pl01: {
    displayName: 'PL-01', shortName: 'PL-01',
    searchAliases: ['PL-01 Concept', 'Polish stealth tank'],
  },
  pl01_105: {
    displayName: 'PL-01 (105)', shortName: 'PL-01 105',
    searchAliases: ['PL-01 105 mm', 'Polish 105 autoloader'],
  },
  xk2_black_panther: {
    displayName: 'XK2 Black Panther', shortName: 'XK2',
    searchAliases: ['K2 Main Battle Tank', 'K2 MBT'],
  },
  k2_black_panther: {
    displayName: 'K2 Black Panther', shortName: 'K2',
    searchAliases: ['K2 Main Battle Tank', 'K2 MBT'],
  },
  kurganets25: {
    displayName: 'Kurganets-25', shortName: 'Kurganets-25',
    searchAliases: ['Kurganets 25', 'Object 693', 'Russian tracked IFV'],
  },
  k2b: {
    displayName: 'K2B', shortName: 'K2B',
    searchAliases: ['K2B Black Panther', 'Korean stealth K2'],
  },
  chieftain3: { displayName: 'Chieftain Mk 3' },
  challenger1_mk2: { displayName: 'Challenger 1 Mk 2' },
  fv4034: { displayName: 'FV4034', searchAliases: ['Challenger predecessor', 'FV 4034'] },
  challenger2e: { displayName: 'Challenger 2E', searchAliases: ['Enhanced Challenger 2', 'CR2E'] },
  ua_challenger2: {
    displayName: 'Challenger 2 (Ukraine)', shortName: 'Challenger 2 UA',
    searchAliases: ['Ukrainian Challenger 2', 'Ukraine Challenger 2'],
  },
  challenger3: {
    displayName: 'Challenger 3', shortName: 'Challenger 3',
    searchAliases: ['Challenger 3X', 'CR3X', 'Challenger 3 X'],
  },
  fv510_milan: {
    displayName: 'FV510 Warrior MILAN', shortName: 'Warrior MILAN',
    searchAliases: ['FV510 MILAN', 'Warrior ATGM'],
  },
  // VEH-11 (2026-10-13): the Warrior MILAN X is its own Warrior type, the slat-caged Theatre Entry Standard (Herrick)
  // fit, and keeps the MILAN firing post the owner knows it by.
  warrior_tes_h: {
    displayName: 'Warrior TES(H)', shortName: 'Warrior TES(H)',
    searchAliases: ['Warrior MILAN X', 'Warrior MILAN', 'Warrior TES', 'Warrior Theatre Entry Standard', 'FV510 Warrior TES(H)'],
    noteKey: 'gallery.brief.note.warriorTesH',
  },
  // 2026-10-13: no two garage cards read "Type 90"; type90 keeps the plain name.
  // owner 2026-10-25 ("change the type 90a and type 90 kyu maru into prototype-named vriants"): the two procedural Type 90s
  // are the TK-X programme's first-series prototypes, named as the STB-1 names the Type 74's first: STC-1 (TK-X-0001,
  // completed 1982) and STC-2 (TK-X-0002, June 1985), both on the Japan Steel Works 120 mm smoothbore before the
  // Rheinmetall gun of the 1986-88 second series. The ids stay: saves, rooms, replays and the Gallery key on them.
  type90_kyumaru: {
    displayName: 'STC-1', shortName: 'STC-1',
    searchAliases: ['TK-X-0001', 'Type 90 prototype', 'Type 90 first prototype', 'Type 90 Kyū-maru', 'Kyu-maru'],
  },
  // 2026-10-13: no vehicle keeps an "X" suffix (the 2026-09-15 naming ruling).
  type96b: { displayName: 'Type 96B', searchAliases: ['Type 96B X', 'ZTZ-96B'] },
  aft10: { displayName: 'AFT-10', searchAliases: ['AFT-10 X'] },
  bmp3m_dragun125: { displayName: 'BMP-3M Dragun 125', searchAliases: ['BMP-3M Dragun 125 X', 'Dragun 125'] },
  stb1: { displayName: 'STB-1', shortName: 'STB-1', searchAliases: ['STB 1 Japan'] },
  type90a: {
    displayName: 'STC-2', shortName: 'STC-2',
    searchAliases: ['TK-X-0002', 'Type 90 second prototype', 'Type 90A', 'Type 90 Kai'],
  },
  type10b: { displayName: 'Type 10B', shortName: 'Type 10B', searchAliases: ['Type 10 Kai'] },
  // owner 2026-10-22: "give this a unique name for a variannt instad of just 'dozer'" (開拓, land-clearing)
  type10_dozer: { displayName: 'Type 10 Kaitaku', shortName: 'Type 10 Kaitaku', searchAliases: ['Kaitaku', 'Type 10 (Dozer)', 'Type 10 Dozer', 'Type 10 dozer blade', 'Type 10 dozer kit'] },
  leo2a3: {
    displayName: 'Leopard 2A3', shortName: 'Leopard 2A3',
    searchAliases: ['Leopard 2A4 OTCO', '2A3'],
  },
  leo2a4m_can: {
    displayName: 'Leopard 2A4M CAN', shortName: 'Leopard 2A4M CAN',
    searchAliases: ['Leopard 2A4M Canada', '2A4M CAN'],
  },
  leo2a4m: {
    displayName: 'Leopard 2A4M', shortName: 'Leopard 2A4M',
    searchAliases: ['Leopard 2A5/A5NL', 'A5NL', '2A4M'],
  },
  leo2a4_otco: {
    displayName: 'Leopard 2A4 OTCO', shortName: 'Leopard 2A4 OTCO',
    searchAliases: ['Leopard 2A6M', '2A4 OTCO'],
  },
  leo2a6_ua: {
    displayName: 'Leopard 2A6 UA', shortName: 'Leopard 2A6 UA',
    searchAliases: ['Ukrainian Leopard 2A6', 'Leopard 2A6 Ukraine', '2A6 UA'],
  },
  leo2_revolution_proto: {
    displayName: 'Leopard 2 Revolution Proto', shortName: 'Revolution Proto',
    searchAliases: ['Leopard 2 Revolution Prototype', 'Revolution Prototype'],
  },
  bmp3_rok: {
    displayName: 'BMP-3 (ROK)', shortName: 'BMP-3 ROK',
    searchAliases: ['South Korean BMP-3', 'ROK BMP-3'],
  },
  ua_m2a3_bradley: {
    displayName: 'M2A3 Bradley (Ukraine)', shortName: 'M2A3 Bradley UA',
    searchAliases: ['Ukrainian M2A3 Bradley', 'Ukraine Bradley'],
  },
  bmpt_terminator2: {
    displayName: 'BMPT Terminator 2', shortName: 'Terminator 2',
    searchAliases: ['BMPT-72', 'Terminator 2 AFV'],
  },
  bmpt_t90: {
    displayName: 'BMPT T-90', shortName: 'BMPT T-90',
    searchAliases: ['Terminator 3', 'BMPT-90', 'T-90 Terminator'],
  },
  bwp1: {
    displayName: 'BWP-1 (Bojowy Wóz Piechoty 1)', shortName: 'BWP-1',
    searchAliases: ['Bojowy Wóz Piechoty 1', 'BWP 1', 'Polish BMP-1', 'BMP-1 Poland'],
  },
  marder1a3: {
    displayName: 'Schützenpanzer Marder 1A3', shortName: 'Marder 1A3',
    searchAliases: ['SPz Marder 1A3', 'Schützenpanzer Marder'],
  },
  m3a3_bradley: {
    displayName: 'M3A3 Bradley CFV', shortName: 'M3A3 Bradley',
    searchAliases: ['M3A3 Cavalry Fighting Vehicle', 'Bradley CFV'],
  },
  bmp3: {
    displayName: 'BMP-3', shortName: 'BMP-3',
    searchAliases: ['BMP-3 IFV', 'Russian BMP-3'],
  },
  upior: {
    displayName: 'Upiór IFV', shortName: 'Upiór',
    searchAliases: ['Upior concept IFV', 'Upiór'],
  },
  spz_puma: {
    displayName: 'Schützenpanzer Puma', shortName: 'Puma',
    searchAliases: ['SPz Puma', 'Puma IFV'],
  },
  m6_linebacker: {displayName:'M6 Linebacker',shortName:'M6 Linebacker',searchAliases:['Linebacker modernization','Bradley air defense concept']},
  marder2: {displayName:'Marder 2',shortName:'Marder 2',searchAliases:['Marder 2 VT 001','TS503']},
  spz_wotan: {
    displayName: 'SPz Wotan', shortName: 'SPz Wotan',
    searchAliases: ['SPz Puma S1', 'Former Puma S1 upgrade'],
  },
  raiju_ifv: {
    displayName: 'Raijū IFV', shortName: 'Raijū',
    searchAliases: ['Type 89 Light Tiger IFV', 'Type 89 LT', 'JGSDF Light Tiger'],
  },
  ares_apc: {
    displayName: 'Ares APC', shortName: 'Ares',
    searchAliases: ['ARES APC', 'Ajax Ares', 'Ajax-family APC', 'British Ares'],
  },
  ztz99_longwei: {
    displayName: 'ZTZ-99 Longwei', shortName: 'Longwei',
    searchAliases: ['ZTZ-99A (Type 99A)', 'Type 99A (ZTZ-99A)', 'Type 99A', 'Longwei original concept'],
  },
  vt4a1: {
    displayName: 'VT-4A1', shortName: 'VT-4A1',
    searchAliases: ['VT4A1', 'VT-4 A1', 'Chinese export main battle tank'],
  },
  ztz85_iii: {
    displayName: 'ZTZ-85-III', shortName: 'ZTZ-85-III',
    searchAliases: ['Type 85-III', 'Type 85 III'],
  },
  ztz99a2: {
    displayName: 'ZTZ-99A2', shortName: 'ZTZ-99A2',
    searchAliases: ['Type 99A2', 'ZTZ 99A2'],
  },
  ztz99a: {
    displayName: 'ZTZ-99A', shortName: 'ZTZ-99A',
    searchAliases: ['Type 99A2 Prototype', 'ZTZ 99A2 Prototype', '99A2-P'],
  },
  type100: {
    displayName: 'Type 100 IFV', shortName: 'Type 100 IFV',
    searchAliases: ['Type 100 support vehicle', 'ZBD-100', 'PLA next-generation IFV', '100式支援战车'],
  },
  ztz100: {
    displayName: 'ZTZ-100', shortName: 'ZTZ-100',
    searchAliases: ['Type 100', 'Type 100 main battle tank', 'PLA next-generation tank', '100式坦克'],
  },
  ztz100_prototype: {
    displayName: 'ZTZ-100 Prototype', shortName: 'ZTZ-100 Proto',
    searchAliases: ['ZTZ-100 original', 'ZTZ-100 prototype', 'Type 100 prototype'],
  },
  object695: {
    displayName: 'Object 695', shortName: 'Object 695',
    searchAliases: ['Object 695 IFV', 'Kurganets', 'Kurganets-25 variant', 'Epokha', 'B-11', 'Объект 695'],
  },
  m1a1ha: { displayName: 'M1A1 Abrams HA' },
  m1a1_abrams_fep: { displayName: 'M1A1 Abrams FEP' },
  m1a3: {
    displayName: 'M1A3 Abrams', shortName: 'M1A3 Abrams',
    searchAliases: ['M1A3 Abrams concept', 'Next-generation Abrams'],
  },
  kf51_u: { displayName: 'KF51-U', shortName: 'KF51-U', searchAliases: ['KF51B Panther'] },
  merkava1b: { displayName: 'Merkava Mk 1B' },
  merkava2b: { displayName: 'Merkava Mk 2B' },
  merkava2d: { displayName: 'Merkava Mk 2D' },
  merkava3c: { displayName: 'Merkava Mk 3C' },
  merkava3_baz: { displayName: 'Merkava Mk 3 Baz' },
  merkava4b: { displayName: 'Merkava Mk 4B' },
  vickers_mk1: { displayName: 'Vickers MBT Mk 1' },
  centurion3: { displayName: 'Centurion Mk 3' },
  centurion5_2: { displayName: 'Centurion Mk 5/2' },
  // release 266: the M48s drawn on the M48A5's castings
  m48a3_patton: { displayName: 'M48A3 Patton', searchAliases: ['M48A3', 'Patton III', 'Vietnam Patton'] },
  magach3: { displayName: 'Magach 3', searchAliases: ['Magach', "Magach 3 Blazer", 'IDF M48', 'Israeli Patton'] },
  // release 267: the IDF's M60s
  magach6b: { displayName: 'Magach 6B', searchAliases: ['Magach 6', 'Magach 6B Blazer', 'IDF M60A1', 'Israeli M60'] },
  magach7c: { displayName: 'Magach 7C', searchAliases: ['Magach 7', 'Magach 7C', 'IDF M60 passive armour'] },
  m48a2ga2: {
    displayName: 'Kpz M48A2GA2', shortName: 'M48A2GA2',
    searchAliases: ['M48A2GA2', 'Kampfpanzer M48A2GA2', 'M48A2G A2', 'Bundeswehr M48'],
  },
  m48_super: { displayName: 'M48 Super', searchAliases: ['Rheinmetall M48 Super', 'M48A2 Super', 'German M48 upgrade'] },
  carro45t: { displayName: 'Carro 45t', searchAliases: ['Carro da Combattimento 45t'] },
  c1_ariete_preserie: { displayName: 'C1 Ariete Preserie', shortName: 'Ariete Preserie' },
  c1_ariete_proto_serie1: { displayName: 'C1 Ariete Prototype (Serie 1)', shortName: 'C1 Prototype S1' },
  c2_ariete_proto: { displayName: 'C2 Ariete Prototype', shortName: 'C2 Prototype' },
  c1_ariete: { displayName: 'C1 Ariete', shortName: 'C1 Ariete' },
  c2_ariete: { displayName: 'C2 Ariete', shortName: 'C2 Ariete' },
  // owner 2026-10-22: the Ukrainian Army's 2017 T-64BV modernisation (T-64BV zrazka 2017 roku); "Donbas" was the
  // kitbash source's label. The id stays.
  t64bv_donbas: { displayName: 'T-64BV mod. 2017', shortName: 'T-64BV mod. 2017', searchAliases: ['T-64BV Donbas'] },
  ua_t80bv: { displayName: 'T-80BV (Ukraine)', shortName: 'T-80BV UA' },
  t80u_kursk: { displayName: 'T-80U Kursk', shortName: 'T-80U Kursk' },
  t84bm_oplot_m: { displayName: 'T-84BM Oplot-M', shortName: 'Oplot-M' },
  ua_m1a1: { displayName: 'M1A1 SA (Ukraine)', shortName: 'M1A1 SA UA', searchAliases: ['M1A1 Abrams UA', 'M1A1 Abrams (Ukraine)'] },
});

function cleanDisplayName(value: RuntimeValue): string {
  return String(value || '')
    .replace(/\bMk\.(?=\s*\d)/g, 'Mk')
    .replace(/\s+/g, ' ')
    .trim();
}

function humanizeId(id: RuntimeValue): string {
  return String(id || '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

function uniqueStrings(values: readonly RuntimeValue[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const text = String(value || '').trim();
    const key = text.toLocaleLowerCase('en-US');
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

export function tankLabelRecord(spec: TankLabelSpec | null | undefined): TankLabelRecord {
  const id = String(spec?.id || '');
  const override = LABEL_OVERRIDES[id] || {};
  const originalName = cleanDisplayName(spec?.name || humanizeId(id));
  const displayName = cleanDisplayName(override.displayName || originalName);
  const shortName = cleanDisplayName(override.shortName || displayName);
  const searchAliases = uniqueStrings([
    displayName,
    shortName,
    originalName,
    id,
    humanizeId(id),
    ...(override.searchAliases || []),
  ]);
  return Object.freeze({
    id,
    displayName,
    shortName,
    searchAliases: Object.freeze(searchAliases),
    noteKey: override.noteKey ?? null,
  });
}

export function tankDisplayName(spec: TankLabelSpec | null | undefined): string {
  return tankLabelRecord(spec).displayName;
}
