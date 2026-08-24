// Import-free ownership manifest for the demand-loaded procedural builders.
// It is deliberately plain data so asking which chunk owns a tank never
// downloads or evaluates that chunk.
export const FLEET_GROUP_IDS = Object.freeze({
  nato: Object.freeze([
    'chieftain5', 'chieftain_mk10', 'vickers_mk1', 'centurion3', 'centurion5',
    'comet', 'challenger_cruiser', 'charioteer', 'fv510', 'fv510_milan',
    'challenger1', 'leo2a4', 'leo2a6', 'leo2a5', 'leo2a7v', 'leopard2_proto',
    'leo2_revolution', 'kf51', 'kf51b', 'leo1a5', 'leo2a4m', 'leo2a6m',
    'leo2a6_ua', 'ariete', 'ariete_c1', 'ariete_c2', 'carro45t', 'udes03',
    'strv103', 'strv103a', 'strv81', 'strv122',
  ]),
  east: Object.freeze([
    'is3', 'is7', 'object279', 'is6b', 'is3_bergman', 'kv2', 't90a', 't90',
    't90ms', 't90a_burlak', 'pt91m', 't90sm', 't90a_vladimir', 't90m',
    't62mv1', 't64bv1', 't54', 't44', 't72b_1987', 't72b3m', 't72bu',
    't80', 't80b', 't80bv', 't84', 'ua_t64bv', 'ua_t80bv', 'ua_t80u_kursk',
    'ua_t84_oplot_m', 'ua_m1a1', 't72m1_jaguar', 'pt91_twardy', 'pl01',
    'pl01_105',
  ]),
  us: Object.freeze([
    'm1a2_legacy', 'm1a2', 'm1a1', 'm1a1ha', 'm1a2_tusk', 'm1a2_sepv2',
    'm1a2_sepv3', 'm1a1_aim', 'abramsx', 'm26_pershing', 'm45_patton',
    'm46_patton', 'm47_patton', 'm48', 'm60a2', 'm60a1', 'm60a3',
  ]),
  casemateAsia: Object.freeze([
    'jagdtiger', 'jpz_e100', 'sturmtiger', 't95', 'isu152', 'isu122s', 't30',
    'm4a3e8', 'tiger1', 't34_85', 't34_85_cad', 'newc_tiger', 'newc_pziii',
    'pziii_konserwa', 'leichttraktor', 'q_heavy', 'tiger2', 'sherman_jumbo',
    'merkava1b', 'merkava2b', 'merkava2d', 'merkava3b', 'merkava3c',
    'merkava3d', 'merkava4', 'merkava4b', 'bmp3_rok', 'ua_m2a3_bradley',
    'bmpt_terminator2', 'bwp1', 'marder1a3', 'm3a3_bradley', 'spz_puma',
    'bmp3', 'upior', 'bmpt_t90', 'ztz85_iii', 'type99a', 'ztz99a2',
    'type59', 'k2b', 'stb1', 'type90a', 'type10b', 'leo2a4_otco',
  ]),
});

export const FLEET_GROUP_BY_ID = Object.freeze(Object.fromEntries(
  Object.entries(FLEET_GROUP_IDS).flatMap(([group, ids]) => ids.map((id) => [id, group])),
));
