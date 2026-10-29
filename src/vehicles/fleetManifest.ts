// Import-free ownership manifest for the demand-loaded procedural builders.
// It is deliberately plain data so asking which chunk owns a tank never
// downloads or evaluates that chunk.
export const FLEET_GROUP_IDS = Object.freeze({
  nationalModernization: Object.freeze(["t72b3_zhuque", "t72b3m_xuanwu", "t72b3m_hetman_ii", "t72b3_zubr_ii", "t80u_zoria", "t72b3m_hetman", "t72b3_sich", "t80u_husarz", "t72b3m_wilk", "t72b3_zubr", "t80u_yun", "t72b3m_kunlun", "t72b3_qilin", "t80u_bars_m", "t72b3m_bulat_m", "t72b3_bastion_m"]),
  sinoSovietConcepts: Object.freeze(['type96_72_long','type96_80_feng','type96_72m_lei']),
  t72Rys: Object.freeze(['t72_rys']),
  m6Linebacker: Object.freeze(['m6_linebacker']),
  marder2: Object.freeze(['marder2']),
  amx10p: Object.freeze(['amx10p', 'amx10p_25']),
  dardo: Object.freeze(['dardo']),
  lrmvLynx: Object.freeze(['lrmv_lynx']),
  borsuk: Object.freeze(['borsuk']),
  pumaS1SourceX: Object.freeze(['puma_s1']),
  cv9040CSourceX: Object.freeze(['cv9040c']),
  type89SourceX: Object.freeze(['type89']),
  griffinViper: Object.freeze(['griffin_viper']),
  tos1aTagil: Object.freeze(['tos1a_tagil']),
  aresApcX: Object.freeze(['ares_apc']),
  leopardA6X: Object.freeze(['leo2a6']),
  k1a1X: Object.freeze(['k1a1']),
  amx30X: Object.freeze(['amx30b']),
  t62mv1X: Object.freeze(['t62mv1']),
  t72b1987X: Object.freeze(['t72b_1987']),
  t80uX: Object.freeze(['t80u']),
  t72b3X: Object.freeze(['t72b3']),
  jagdpanzerE100X: Object.freeze(['jpz_e100']),
  type10X: Object.freeze(['type10']),
  type90X: Object.freeze(['type90']),
  christian2: Object.freeze(['christian2']),
  amx40X: Object.freeze(['amx40']),
  arieteX: Object.freeze(['c1_ariete', 'c2_ariete']),
  strv122X: Object.freeze(['strv122']),
  t72b3mX: Object.freeze(['t72b3m_2016']),
  challenger1X: Object.freeze(['challenger1_mk3']),
  t72buX: Object.freeze(['t72bu']),
  chieftain5X: Object.freeze(['chieftain5']),
  t90AwX: Object.freeze(['t90']),
  t90BurlakX: Object.freeze(['t90a_burlak']),
  t90msX: Object.freeze(['t90ms_tagil']),
  leclercX: Object.freeze(['leclerc_xlr']),
  leclercClassicX: Object.freeze(['amx56']),
  chieftain10X: Object.freeze(['chieftain_mk10']),
  leopardX: Object.freeze(['leo2a7v', 'leo2a6m', 'leo2a5m', 'leo2a5']),
  t90X: Object.freeze(['t90a', 't90a_vladimir', 't90m', 't90sm']),
  merkavaX: Object.freeze([
    'merkava4', 'merkava3d', 'merkava4_trophy', 'merkava4_barak', 'namer_ifv',
  ]),
  k2X: Object.freeze(['k2_black_panther']),
  kf51X: Object.freeze(['kf51_panther']),
  t14X: Object.freeze(['t14_armata']),
  kurganetsX: Object.freeze(['kurganets25']),
  fv510MilanX: Object.freeze(['warrior_tes_h']),
  griffin50X: Object.freeze(['griffin50mm']),
  ajaxX: Object.freeze(['ajax']),
  aft10X: Object.freeze(['aft10']),
  bmp3mDragun125X: Object.freeze(['bmp3m_dragun125']),
  k21X: Object.freeze(['k21']),
  type96bX: Object.freeze(['type96b']),
  kf41LynxSourceX: Object.freeze(['kf41_lynx']),
  cv90MkivSourceX: Object.freeze(['cv90_mk4']),
  cv90105TmlSourceX: Object.freeze(['cv90105_tml']),
  sabraMk2SourceX: Object.freeze(['sabra_mk2']),
  modern2: Object.freeze(['mbt70', 'object148_proto', 'ztz85_iii', 'ztz99_longwei', 'ztz99a', 'ztz99a2', 'vt4a1', 'type59', 'type100', 'ztz100', 'ztz100_prototype', 'ztz20', 'ztz20_prototype', 'object695', 'ztz99a2_qinglong', 'vt4a1_baihu']),
  franceCore: Object.freeze(['amx40_proto']),
  xk2: Object.freeze(['xk2_black_panther']),
  modern3Core: Object.freeze(['k1e1', 'type10_tk_x', 'm2a2_bradley', 'bmp2', 'hayate_ifv']),
  // These visual profiles used to be imported by every garage boot even when
  // no matching vehicle was visible. Keep their ownership in the same
  // import-free manifest as the larger authored families.
  misc: Object.freeze([
    'type90_kyumaru', 'leclerc_s2', 'leclerc_sxxi', 'leclerc_s1', 't80uk',
    'type74', 'amx30', 'amx30b2',
  ]),
  uk: Object.freeze([
    'chieftain3', 'chieftain_mk9', 'vickers_mk1', 'centurion3', 'centurion5_2',
    'fv510', 'fv510_milan',
  ]),
  challenger: Object.freeze([
    'challenger1_mk1', 'challenger1_mk2', 'challenger_x', 'challenger_x_sleek', 'fv4034', 'challenger2', 'challenger2e', 'ua_challenger2', 'challenger3_proto',
    'challenger3', 'challenger3_td', 'challenger3_td_rws',
  ]),
  leopard: Object.freeze([
    'leo2a2', 'leo2a4', 'leo2a4_v', 'leo2a4m', 'leo2_improved', 'leopard2_proto',
    'leo2_revolution_proto', 'leo2_revolution', 'kf51_evo', 'kf51_u', 'leo1a5', 'leo2a4m_can', 'leo2a4_otco',
    'leo2a6_ua',
  ]),
  italy: Object.freeze(['c1_ariete_preserie', 'c1_ariete_proto_serie1', 'c2_ariete_proto', 'carro45t']),
  sweden: Object.freeze([
    'udes03', 'strv103b', 'strv103a', 'strv81', 'strv121', 'cv90', 'cv90_mk4_concept',
  ]),
  sovietHeavy: Object.freeze(['kv2']),
  t90_1992: Object.freeze([
    't90a_2004', 't90_1992',
    't90ms_2011', 't90a_burlak_proto', 'pt91m', 't90sm_2013', 't90a_2006', 't90am', 't90m_proryv',
  ]),
  russia: Object.freeze(['t55a', 't62_1975', 't64bv1', 't64bv']),
  t72: Object.freeze(['t72b3m_2022', 't72bu_1989']),
  t80: Object.freeze(['t80', 't80b', 't80bv', 't84']),
  ukraine: Object.freeze([
    't64bv_donbas', 'ua_t80bv', 't80u_kursk', 't84bm_oplot_m', 'ua_m1a1', 'bm_oplot_m', 'bm_oplot_t', 't64bm1m', 't64b1v_2022',
  ]),
  poland: Object.freeze(['t72m1_jaguar', 'pt91a_twardy', 'pl01', 'pl01_105', 'pt64_tur']),
  abramsSourceX: Object.freeze(['m1a2_abrams', 'm1a2_abrams_tusk', 'm1a2_abrams_sepv2', 'm1a2_abrams_sepv3', 'ua_m1a2_abrams']),
  abrams: Object.freeze([
    'm1a1_abrams_hc', 'm1a1', 'm1a1ha', 'm1a1_abrams_sa', 'm1a1_abrams_aim',
    'm1a1_abrams_fep', 'm1a3', 'abramsx',
  ]),
  patton: Object.freeze([
    'm46_patton', 'm47_patton', 'm48a5_patton', 'm60a2',
    'm60a1', 'm60a3',
  ]),
  merkava: Object.freeze([
    'merkava1b', 'merkava2b', 'merkava2d', 'merkava3c',
    'merkava3_baz', 'merkava4b',
  ]),
  afv: Object.freeze([
    'bmp3_rok', 'ua_m2a3_bradley',
    'bmpt_terminator2', 'bwp1', 'marder1a3', 'm3a3_bradley', 'spz_puma', 'spz_wotan',
    'raiju_ifv',
    'bmp3', 'upior', 'bmpt_t90',
  ]),
  korea: Object.freeze(['k2b']),
  japan: Object.freeze(['stb1', 'type90a', 'type10b', 'type10_dozer']),
  germany: Object.freeze(['leo2a3']),
  sheridan: Object.freeze(['m551_sheridan', 'm551a1_tts']),
} as const);

export type FleetGroup = keyof typeof FLEET_GROUP_IDS;

export const FLEET_GROUP_BY_ID: Readonly<Record<string, FleetGroup>> = Object.freeze(
  Object.fromEntries(
    (Object.entries(FLEET_GROUP_IDS) as [FleetGroup, readonly string[]][])
      .flatMap(([group, ids]) => ids.map((id) => [id, group])),
  ),
);
