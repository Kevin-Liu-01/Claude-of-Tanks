// Canonical public labels for the first-party fleet.
//
// Vehicle IDs are stable save/protocol keys. They are intentionally not used
// as display copy: the garage, generated assets and accessibility surfaces all
// consume this one label record instead of inventing their own punctuation or
// abbreviations.

const LABEL_OVERRIDES = Object.freeze({
  t95: { displayName: 'T95', searchAliases: ['T95 Doomturtle'] },
  strv103: { displayName: 'Strv 103', searchAliases: ['Stridsvagn 103'] },
  chieftain5: { displayName: 'Chieftain Mk 5' },
  challenger1: { displayName: 'Challenger 1 Mk 3' },
  type90: { displayName: 'Type 90 (Kyū-maru)', shortName: 'Type 90' },
  type99a: {
    displayName: 'ZTZ-99A (Type 99A)', shortName: 'ZTZ-99A',
    searchAliases: ['Type 99A (ZTZ-99A)', 'Type 99A'],
  },
  m1a1ha: { displayName: 'M1A1 Abrams HA' },
  m1a2_sepv3: { displayName: 'M1A2 Abrams SEPv3' },
  m1a2_legacy: { displayName: 'M1A2 Abrams (Legacy)', shortName: 'M1A2 Legacy' },
  merkava1b: { displayName: 'Merkava Mk 1B' },
  merkava2b: { displayName: 'Merkava Mk 2B' },
  merkava2d: { displayName: 'Merkava Mk 2D' },
  merkava3c: { displayName: 'Merkava Mk 3C' },
  merkava3d: { displayName: 'Merkava Mk 3D' },
  vickers_mk1: { displayName: 'Vickers MBT Mk 1' },
  centurion3: { displayName: 'Centurion Mk 3' },
  centurion5: { displayName: 'Centurion Mk 5/2' },
  carro45t: { displayName: 'Carro 45t', searchAliases: ['Carro da Combattimento 45t'] },
  ariete: { displayName: 'C1 Ariete Preserie', shortName: 'Ariete Preserie' },
  ariete_c1: { displayName: 'C1 Ariete', shortName: 'Ariete C1' },
  ariete_c2: { displayName: 'C2 Ariete', shortName: 'Ariete C2' },
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
