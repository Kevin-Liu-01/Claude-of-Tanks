// Import-free ownership manifest for the demand-loaded procedural builders.
// It is deliberately plain data so asking which chunk owns a tank never
// downloads or evaluates that chunk.
export const FLEET_GROUP_IDS = Object.freeze({
  modern2: Object.freeze(['mbt70', 't14', 'ztz85_iii', 'type99a', 'ztz99a2_prototype', 'ztz99a2', 'vt4a1', 'type59']),
  franceCore: Object.freeze(['amx40']),
  modern3Core: Object.freeze(['k2', 'k1a1', 'type10', 'm2a2_bradley', 'bmp2', 'type89']),
  // These visual profiles used to be imported by every garage boot even when
  // no matching vehicle was visible. Keep their ownership in the same
  // import-free manifest as the larger authored families.
  misc: Object.freeze([
    'recon_tank', 'type90', 'leclerc', 'leclerc_xlr', 'amx56', 't80u',
    'type74', 'amx30', 'amx30b2',
  ]),
  uk: Object.freeze([
    'chieftain5', 'chieftain_mk10', 'vickers_mk1', 'centurion3', 'centurion5',
    'comet', 'challenger_cruiser', 'charioteer', 'fv510', 'fv510_milan',
  ]),
  challenger: Object.freeze([
    'challenger1', 'fv4034', 'challenger2', 'challenger2e', 'ua_challenger2', 'challenger_3',
    'challenger_3x',
  ]),
  leopard: Object.freeze([
    'leo2a4', 'leo2a6', 'leo2a5', 'leo2a5_a5nl', 'leo2a7v', 'leopard2_proto',
    'leo2_revolution', 'kf51', 'kf51b', 'leo1a5', 'leo2a4m', 'leo2a6m',
    'leo2a6_ua',
  ]),
  italy: Object.freeze(['ariete', 'ariete_c1', 'ariete_c2', 'carro45t']),
  sweden: Object.freeze([
    'udes03', 'strv103', 'strv103a', 'strv81', 'strv122', 'cv90', 'cv90_mkiv',
  ]),
  sovietHeavy: Object.freeze(['is3', 'is7', 'object279', 'is6b', 'is3_bergman', 'kv2']),
  t90: Object.freeze([
    't90a', 't90',
    't90ms', 't90a_burlak', 'pt91m', 't90sm', 't90a_vladimir', 't90m', 't90m_proryv',
  ]),
  russia: Object.freeze(['t62mv1', 't64bv1', 't54', 't44']),
  t72: Object.freeze(['t72b_1987', 't72b3m', 't72bu']),
  t80: Object.freeze(['t80', 't80b', 't80bv', 't84']),
  ukraine: Object.freeze([
    'ua_t64bv', 'ua_t80bv', 'ua_t80u_kursk', 'ua_t84_oplot_m', 'ua_m1a1',
  ]),
  poland: Object.freeze(['t72m1_jaguar', 'pt91_twardy', 'pl01', 'pl01_105']),
  abrams: Object.freeze([
    'm1a2_legacy', 'm1a2', 'm1a1', 'm1a1ha', 'm1a2_tusk', 'm1a2_sepv2',
    'm1a2_sepv3', 'm1a1_aim', 'm1a3', 'abramsx',
  ]),
  patton: Object.freeze([
    'm26_pershing', 'm45_patton', 'm46_patton', 'm47_patton', 'm48', 'm60a2',
    'm60a1', 'm60a3',
  ]),
  ww2: Object.freeze([
    't30',
    'm4a3e8', 'tiger1', 't34_85', 't34_85_cad', 'newc_tiger', 'newc_pziii',
    'pziii_konserwa', 'leichttraktor', 'q_heavy', 'tiger2', 'sherman_jumbo',
  ]),
  casemate: Object.freeze(['jagdtiger', 'jpz_e100', 'sturmtiger', 't95', 'isu152', 'isu122s']),
  merkava: Object.freeze([
    'merkava1b', 'merkava2b', 'merkava2d', 'merkava3b', 'merkava3c',
    'merkava3d', 'merkava4', 'merkava4b',
  ]),
  afv: Object.freeze([
    'bmp3_rok', 'ua_m2a3_bradley',
    'bmpt_terminator2', 'bwp1', 'marder1a3', 'm3a3_bradley', 'spz_puma', 'spz_puma_s1',
    'type89_light_tiger',
    'bmp3', 'upior', 'bmpt_t90',
  ]),
  korea: Object.freeze(['k2b']),
  japan: Object.freeze(['stb1', 'type90a', 'type10b']),
  germany: Object.freeze(['leo2a4_otco']),
  sheridan: Object.freeze(['m551_sheridan', 'm551a1_tts']),
} as const);

export type FleetGroup = keyof typeof FLEET_GROUP_IDS;

export const FLEET_GROUP_BY_ID: Readonly<Record<string, FleetGroup>> = Object.freeze(
  Object.fromEntries(
    (Object.entries(FLEET_GROUP_IDS) as [FleetGroup, readonly string[]][])
      .flatMap(([group, ids]) => ids.map((id) => [id, group])),
  ),
);
