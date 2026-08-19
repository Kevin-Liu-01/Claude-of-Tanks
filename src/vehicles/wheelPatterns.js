// Deterministic fleet wheel-family vocabulary.
//
// The geometry factory consumes these records; keeping the selection pure
// makes it possible to prove full-roster coverage under Node without a DOM or
// renderer. Patterns describe mechanical face construction, not paint. Wheel
// paint continues to come from the active camouflage material.

export const WHEEL_PATTERN_DEFINITIONS = Object.freeze({
  'christie-six': Object.freeze({
    label: 'six-window Christie disc', motif: 'perforated', fasteners: 8,
    pockets: 6, idlerHoles: 8, endFasteners: 8, rollerHub: 0.44,
  }),
  'interleaved-dish': Object.freeze({
    label: 'deep interleaved pressed dish', motif: 'deep-dish', fasteners: 16,
    pockets: 0, idlerHoles: 8, endFasteners: 12, rollerHub: 0.42,
  }),
  'cast-five-spoke': Object.freeze({
    label: 'five-spoke cast wheel', motif: 'spoke', fasteners: 10,
    pockets: 5, idlerHoles: 5, endFasteners: 10, rollerHub: 0.50,
  }),
  'pressed-six': Object.freeze({
    label: 'six-rib pressed wheel', motif: 'rib', fasteners: 6,
    pockets: 6, idlerHoles: 6, endFasteners: 8, rollerHub: 0.46,
  }),
  'pressed-eight': Object.freeze({
    label: 'eight-rib pressed wheel', motif: 'rib', fasteners: 8,
    pockets: 8, idlerHoles: 8, endFasteners: 10, rollerHub: 0.45,
  }),
  'split-rim-ten': Object.freeze({
    label: 'ten-fastener split rim', motif: 'split-rim', fasteners: 10,
    pockets: 0, idlerHoles: 10, endFasteners: 10, rollerHub: 0.52,
  }),
  'radial-eight': Object.freeze({
    label: 'eight-rib radial wheel', motif: 'rib', fasteners: 12,
    pockets: 8, idlerHoles: 8, endFasteners: 12, rollerHub: 0.48,
  }),
  'scalloped-six': Object.freeze({
    label: 'six-pocket scalloped wheel', motif: 'scalloped', fasteners: 6,
    pockets: 6, idlerHoles: 6, endFasteners: 8, rollerHub: 0.50,
  }),
  'flanged-twelve': Object.freeze({
    label: 'twelve-fastener flanged wheel', motif: 'flanged', fasteners: 12,
    pockets: 0, idlerHoles: 10, endFasteners: 12, rollerHub: 0.55,
  }),
  'deep-dish-eight': Object.freeze({
    label: 'eight-fastener deep dish', motif: 'deep-dish', fasteners: 8,
    pockets: 0, idlerHoles: 8, endFasteners: 10, rollerHub: 0.47,
  }),
  'armored-hub-six': Object.freeze({
    label: 'six-fastener armored hub', motif: 'armored-hub', fasteners: 6,
    pockets: 0, idlerHoles: 6, endFasteners: 8, rollerHub: 0.60,
  }),
  'solid-bogie-six': Object.freeze({
    label: 'six-spoke solid bogie wheel', motif: 'solid-spoke', fasteners: 6,
    pockets: 6, idlerHoles: 6, endFasteners: 6, rollerHub: 0.48,
  }),
});

export const WHEEL_PATTERN_IDS = Object.freeze(Object.keys(WHEEL_PATTERN_DEFINITIONS));

const FAMILY_RULES = Object.freeze([
  // Character-defining running gear wins over broad national defaults.
  [/(?:^|_)(?:m4a3e8|t95)(?:$|_)/, 'solid-bogie-six'],
  [/(?:t34_85|type59|kv2|bmp2|isu152|isu122s)/, 'christie-six'],
  [/(?:tiger1|panther_g|jpz_e100|sturmtiger)/, 'interleaved-dish'],
  [/(?:m26_pershing|m45_patton|m46_patton|m47_patton|m48|m60a1|m60a2|m60a3)/, 'cast-five-spoke'],
  [/(?:mbt70|m1a1|m1a2|abramsx|ua_m1a1)/, 'split-rim-ten'],
  [/(?:leo1a5|leopard2|leo2|kf51|strv122|pl01)/, 'radial-eight'],
  [/(?:merkava)/, 'deep-dish-eight'],
  [/(?:leclerc|amx30|amx40|amx56|carro45t)/, 'scalloped-six'],
  [/(?:ariete)/, 'split-rim-ten'],
  [/(?:stb1|type74|type89|type90|type10)/, 'flanged-twelve'],
  [/(?:k1a1|k2|bmp3_rok)/, 'flanged-twelve'],
  [/(?:chieftain|challenger|centurion|vickers|strv81)/, 'pressed-eight'],
  [/(?:strv103|udes03)/, 'scalloped-six'],
  [/(?:m2a2_bradley|m3a3_bradley|ua_m2a3_bradley|spz_puma|marder1a3|fv510|bwp1|upior|bmp3)/, 'armored-hub-six'],
  [/(?:t14)/, 'armored-hub-six'],
  [/(?:t62|t64|t72|t80|t84|t90|pt91|ztz85|type99|ztz99|bmpt|ua_t)/, 'pressed-six'],
]);

const NATION_FALLBACKS = Object.freeze({
  china: ['pressed-six', 'christie-six'],
  france: ['scalloped-six', 'deep-dish-eight'],
  germany: ['radial-eight', 'interleaved-dish'],
  israel: ['deep-dish-eight'],
  italy: ['split-rim-ten', 'scalloped-six'],
  japan: ['flanged-twelve'],
  poland: ['pressed-six', 'armored-hub-six'],
  russia: ['pressed-six', 'pressed-eight'],
  'south korea': ['flanged-twelve', 'armored-hub-six'],
  sweden: ['scalloped-six', 'radial-eight'],
  uk: ['pressed-eight', 'radial-eight'],
  usa: ['split-rim-ten', 'cast-five-spoke'],
  ussr: ['christie-six', 'pressed-six'],
  'ussr/russia': ['pressed-six'],
  ukraine: ['pressed-six', 'deep-dish-eight'],
});

function stableIndex(value, length) {
  let hash = 2166136261;
  for (const ch of String(value || 'wheel')) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % length;
}

/** Resolve one stable mechanical motif for a vehicle's complete wheel train. */
export function wheelPatternFor(spec, style = 'rubber', override = null) {
  if (override != null) {
    if (!WHEEL_PATTERN_DEFINITIONS[override]) {
      throw new Error(`Unknown wheel pattern: ${override}`);
    }
    return Object.freeze({ id: override, ...WHEEL_PATTERN_DEFINITIONS[override] });
  }

  const id = String(spec?.id || '').toLowerCase();
  for (const [matcher, patternId] of FAMILY_RULES) {
    if (matcher.test(id)) {
      return Object.freeze({ id: patternId, ...WHEEL_PATTERN_DEFINITIONS[patternId] });
    }
  }

  // Builder style remains a meaningful last-resort mechanical signal.
  if (style === 'holes') {
    return Object.freeze({ id: 'christie-six', ...WHEEL_PATTERN_DEFINITIONS['christie-six'] });
  }
  if (style === 'dished') {
    return Object.freeze({ id: 'deep-dish-eight', ...WHEEL_PATTERN_DEFINITIONS['deep-dish-eight'] });
  }
  if (style === 'steel') {
    return Object.freeze({ id: 'solid-bogie-six', ...WHEEL_PATTERN_DEFINITIONS['solid-bogie-six'] });
  }

  const nation = String(spec?.nation || '').toLowerCase();
  const palette = NATION_FALLBACKS[nation] || ['pressed-eight', 'split-rim-ten', 'radial-eight'];
  const patternId = palette[stableIndex(id || nation, palette.length)];
  return Object.freeze({ id: patternId, ...WHEEL_PATTERN_DEFINITIONS[patternId] });
}
