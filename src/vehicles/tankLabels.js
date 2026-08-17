// Canonical public labels for the first-party fleet.
//
// Vehicle IDs are stable save/protocol keys. They are intentionally not used
// as display copy: the garage, generated assets and accessibility surfaces all
// consume this one label record instead of inventing their own punctuation or
// abbreviations.

const LABEL_OVERRIDES = Object.freeze({
  t95: { displayName: 'T95', searchAliases: ['T95 Doomturtle'] },
  strv81: { displayName: 'Strv 81', searchAliases: ['Stridsvagn 81', 'Centurion Strv 81'] },
  strv103: { displayName: 'Strv 103B', searchAliases: ['Stridsvagn 103B', 'S-Tank'] },
  strv103a: { displayName: 'Strv 103A', searchAliases: ['Stridsvagn 103A', 'S-Tank A'] },
  strv122: { displayName: 'Strv 122', searchAliases: ['Stridsvagn 122', 'Swedish Leopard 2'] },
  t72m1_jaguar: {
    displayName: 'T-72M1 Jaguar', shortName: 'T-72M1 Jaguar',
    searchAliases: ['T-72M1 Jaguar Poland', 'Jaguar MBT'],
  },
  pt91_twardy: {
    displayName: 'PT-91A Twardy', shortName: 'PT-91A Twardy',
    searchAliases: ['PT-91 Twardy', 'Twardy MBT'],
  },
  pl01: {
    displayName: 'PL-01', shortName: 'PL-01',
    searchAliases: ['PL-01 Concept', 'Polish stealth tank'],
  },
  k2b: {
    displayName: 'K2B', shortName: 'K2B',
    searchAliases: ['K2B Black Panther', 'Korean stealth K2'],
  },
  chieftain5: { displayName: 'Chieftain Mk 5' },
  challenger1: { displayName: 'Challenger 1 Mk 3' },
  type90: { displayName: 'Type 90 (Kyū-maru)', shortName: 'Type 90' },
  stb1: { displayName: 'STB-1', shortName: 'STB-1', searchAliases: ['STB 1 Japan'] },
  type90a: { displayName: 'Type 90A', shortName: 'Type 90A', searchAliases: ['Type 90 Kai'] },
  type10b: { displayName: 'Type 10B', shortName: 'Type 10B', searchAliases: ['Type 10 Kai'] },
  leo2a4_otco: {
    displayName: 'Leopard 2A4 OTCO', shortName: 'Leopard 2A4 OTCO',
    searchAliases: ['Leopard 2A4 OTCO Germany', '2A4 OTCO'],
  },
  leo2a4m: {
    displayName: 'Leopard 2A4M', shortName: 'Leopard 2A4M',
    searchAliases: ['Leopard 2A4M CAN', '2A4M'],
  },
  leo2a6m: {
    displayName: 'Leopard 2A6M', shortName: 'Leopard 2A6M',
    searchAliases: ['Leopard 2A6M CAN', '2A6M'],
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
  upior_ifv: {
    displayName: 'Upiór Infantry Fighting Vehicle', shortName: 'Upiór IFV',
    searchAliases: ['Upior IFV', 'Polish Upior'],
  },
  marder1a3: {
    displayName: 'Marder 1A3', shortName: 'Marder 1A3',
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
  type99a: {
    displayName: 'ZTZ-99A (Type 99A)', shortName: 'ZTZ-99A',
    searchAliases: ['Type 99A (ZTZ-99A)', 'Type 99A'],
  },
  ztz85_iii: {
    displayName: 'ZTZ-85-III', shortName: 'ZTZ-85-III',
    searchAliases: ['Type 85-III', 'Type 85 III'],
  },
  ztz99a2: {
    displayName: 'ZTZ-99A2', shortName: 'ZTZ-99A2',
    searchAliases: ['Type 99A2', 'ZTZ 99A2'],
  },
  m1a1ha: { displayName: 'M1A1 Abrams HA' },
  m1a2_sepv3: { displayName: 'M1A2 Abrams SEPv3' },
  m1a2_legacy: { displayName: 'M1A2 Abrams (Legacy)', shortName: 'M1A2 Legacy' },
  kf51b: { displayName: 'KF51B Panther', shortName: 'KF51B' },
  merkava1b: { displayName: 'Merkava Mk 1B' },
  merkava2b: { displayName: 'Merkava Mk 2B' },
  merkava2d: { displayName: 'Merkava Mk 2D' },
  merkava3c: { displayName: 'Merkava Mk 3C' },
  merkava3d: { displayName: 'Merkava Mk 3D' },
  merkava4b: { displayName: 'Merkava Mk 4B' },
  vickers_mk1: { displayName: 'Vickers MBT Mk 1' },
  centurion3: { displayName: 'Centurion Mk 3' },
  centurion5: { displayName: 'Centurion Mk 5/2' },
  carro45t: { displayName: 'Carro 45t', searchAliases: ['Carro da Combattimento 45t'] },
  ariete: { displayName: 'C1 Ariete Preserie', shortName: 'Ariete Preserie' },
  ariete_c1: { displayName: 'C1 Ariete', shortName: 'Ariete C1' },
  ariete_c2: { displayName: 'C2 Ariete', shortName: 'Ariete C2' },
  ua_t64bv: { displayName: 'T-64BV Donbas', shortName: 'T-64BV Donbas' },
  ua_t80bv: { displayName: 'T-80BV (Ukraine)', shortName: 'T-80BV UA' },
  ua_t80u_kursk: { displayName: 'T-80U Kursk', shortName: 'T-80U Kursk' },
  ua_t84_oplot_m: { displayName: 'T-84BM Oplot-M', shortName: 'Oplot-M' },
  ua_m1a1: { displayName: 'M1A1 Abrams UA', shortName: 'M1A1 UA' },
});

function cleanDisplayName(value) {
  return String(value || '')
    .replace(/\bMk\.(?=\s*\d)/g, 'Mk')
    .replace(/\s+/g, ' ')
    .trim();
}

function humanizeId(id) {
  return String(id || '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

function uniqueStrings(values) {
  const out = [];
  const seen = new Set();
  for (const value of values) {
    const text = String(value || '').trim();
    const key = text.toLocaleLowerCase('en-US');
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

export function tankLabelRecord(spec) {
  const id = String(spec && spec.id || '');
  const override = LABEL_OVERRIDES[id] || {};
  const originalName = cleanDisplayName(spec && spec.name || humanizeId(id));
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
  });
}

export function tankDisplayName(spec) {
  return tankLabelRecord(spec).displayName;
}
