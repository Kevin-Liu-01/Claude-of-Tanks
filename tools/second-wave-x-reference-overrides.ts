// Local QA only. Every mesh listed here is an original complete source node.
// No source vertices, images, materials or model loading enter playable code.
export const SECOND_WAVE_X_REFERENCE_OVERRIDES = {
  strv122_x: {source:'glb',qualityBar:'exemplar',glb:{
    path:'/models/community-candidates/strv122_x_source.glb',
    // All18 original fused chunks retained. Mixed material owners cannot
    // establish component masks or reference articulation.
    fixedMount:true,componentMasks:false,geometryComponentMasks:false,
  }},
  chieftain5_x: {source:'glb',qualityBar:'exemplar',glb:{
    path:'/models/community-candidates/chieftain5_x_source.glb',
    // All eleven supplied material owners remain complete. They mix hull,
    // turret and equipment and cannot define valid moving component masks.
    fixedMount:true,componentMasks:false,geometryComponentMasks:false,
  }},
  ariete_c1_x: {source:'glb',qualityBar:'exemplar',glb:{
    path:'/models/community-candidates/ariete_c1_x_source.glb',
    // Eleven complete material owners mix hull, turret, optics and fittings.
    // All stay in the frozen oracle; no fabricated triangle component masks.
    fixedMount:true,componentMasks:false,geometryComponentMasks:false,
  }},
  challenger1_x: {source:'glb',qualityBar:'exemplar',glb:{
    path:'/models/community-candidates/challenger1_x_source.glb',
    // Complete source, including four documented loose orphan skirt pieces.
    // Material owners do not define mechanical assemblies in this file.
    fixedMount:true,componentMasks:false,geometryComponentMasks:false,
  }},
  leclerc_classic_x:{source:'glb',qualityBar:'exemplar',glb:{
    path:'/models/community-candidates/leclerc_classic_x_source.glb',
    // Complete original owners measured in the older file. Object728 is the
    // fixed roof spine despite its DCC gun.001 label. Guards692..712, skirts
    //861/863 and interior hull877..935 remain hull-owned; none is hidden.
    turretNode:'^Object_(?:187|67[7-9]|68[0-9]|690|72[5-9]|7[3-9][0-9]|8[0-4][0-9]|85[0-9]|86[5-9]|87[0-5])$',
    gunNode:'^Object_(?:714|715|717|719|720|722|723)$',
    autoPivot:true,pivot:[-.0162842395776,1.47698078437,.561125178827],
    gunPivot:[.00612553759845,1.95678372667,2.45012127254],
    // Object689 fuses the forward mantlet into the fixed turret. The native
    // must pitch its real mount, so the two direct subtrees are not semantic
    // peers. Retain a scored exposed cannonOverhang, not an unavailable gun.
    // Initial direct raw83.09444 remains archived; no source geometry is cut.
    componentMasks:true,directGunComponentMasks:false,
  }},
  t90ms_x:{source:'glb',qualityBar:'exemplar',glb:{
    path:'/models/community-candidates/t90ms_x_source.glb',
    turretNode:'^vehicle#(?:.*_turret.*|antenna01_25_0)$',
    gunNode:'^vehicle#(?:cannonbase_skinned_6_0|t-90ms_cannonbase_t-90ms_2a46m-5_8_0|t-90ms_cannon_2a46m-5_9_[01])$',
    autoPivot:true,pivot:[-.00094997882843,1.4433900117874146,.1200934632560673],
    gunPivot:[-.0016399808228014,1.8143100142478943,1.3700721232514588],
    componentMasks:true,directGunComponentMasks:true,
  }},
  t90a_burlak_x:{source:'glb',qualityBar:'exemplar',glb:{
    path:'/models/community-candidates/t90a_burlak_x_source.glb',
    // Original material owners genuinely mix moving assemblies; whole-source
    // comparison remains mandatory without invented component segmentation.
    fixedMount:true,componentMasks:false,geometryComponentMasks:false,
  }},
  t90_x:{source:'glb',qualityBar:'exemplar',glb:{
    path:'/models/community-candidates/t90_x_source.glb',
    turretNode:'^vehicle#(?:.*_turret.*|antenna01_(?:18|22)_0)$',
    gunNode:'^vehicle#(?:cannonbase_t-90_2a46m5_skinned_5_0|t-90_cannon_2a46m2_21_0)$',
    autoPivot:true,pivot:[-.00094997882843,1.408079981803894,.115670447585103],
    gunPivot:[-.0007899813354,1.726339995861054,1.271363670175725],
    componentMasks:true,directGunComponentMasks:true,
  }},
  t72bu_x:{source:'glb',qualityBar:'exemplar',glb:{
    path:'/models/community-candidates/t72bu_x_source.glb',
    fixedMount:true,componentMasks:false,geometryComponentMasks:false,
  }},
  t72b3m_x:{source:'glb',qualityBar:'exemplar',glb:{
    path:'/models/community-candidates/t72b3m_x_source.glb',
    fixedMount:true,componentMasks:false,geometryComponentMasks:false,
  }},
  type90_x:{source:'glb',qualityBar:'exemplar',glb:{
    path:'/models/community-candidates/type90_x_source.glb',
    fixedMount:true,componentMasks:false,geometryComponentMasks:false,
  }},
  amx40_x:{source:'glb',qualityBar:'exemplar',glb:{
    path:'/models/community-candidates/amx40_x_source.glb',
    turretNode:'^Object_(?:6|7|8|11|12|24)$',gunNode:'^Object_(?:2|5|14|15|20)$',
    autoPivot:true,pivot:[-.03904,1.56289,.16819],gunPivot:[-.00005,1.94827,1.3413],
    componentMasks:true,directGunComponentMasks:true,
  }},
  type10_x: { source:'glb',qualityBar:'exemplar',glb:{
    path:'/models/community-candidates/type10_x_source.glb',
    // Five original material owners genuinely mix hull, turret, gun and gear.
    // Do not fabricate component masks or rotate fragments of those owners.
    fixedMount:true,componentMasks:false,geometryComponentMasks:false,
  } },
  jpz_e100_x: { source: 'glb', qualityBar: 'exemplar', glb: {
    path:'/models/community-candidates/jpz_e100_x_source.glb',
    // A virtual yaw cradle and gun pitch share a trunnion. The same complete
    // gun owner is moved once into the final pitch rig; no casemate triangles
    // are classified as a rotating turret and no source mesh is duplicated.
    turretNode:'^Gun_Material006_0$',gunNode:'^Gun_Material006_0$',
    autoPivot:true,pivot:[-.0007,2.33805,.20],gunPivot:[-.0007,2.33805,.20],
    componentMasks:true,directGunComponentMasks:true,
  } },
  t72b3_x: { source: 'glb', qualityBar: 'exemplar', glb: {
    path: '/models/community-candidates/t72b3_x_source.glb',
    // Complete original descendants of the FBX turret, except its five gun
    // descendants which are independently assigned to the pitch assembly.
    turretNode: '^(?:turret|sosna-u|hatch4|era_20|turet_extra|smoke8-model|smoke-model|smoke7-model|smoke4-model|smoke3-model|smoke6-model|object03|smoke5-model|smoke2-model|era_3|era|era_26|internal001|era_8|mount2|backet|hatch|lens002|mount3|weapon2|mgbracket|mgbox|mesh03|lens003|era_29|era_17|antenna|era_19|era_27|era_5|era_6|era_21|era_4|era_22|co-antenna2|era_23|era_31|era_18|era_28|era_9|era_25|era_7|era_10|era_16|box01|lens004|era_15|era_14|era_12|era_13|era_2|era_11|co-antenna|hatch2|era_24)$',
    gunNode: '^(?:mount|weapon3|weapon|barrel|internal)$',
    autoPivot: true, pivot: [.0000002374,1.457100315,.065591405],
    gunPivot: [.006050285,1.758750301,1.096549988],
    componentMasks: true, directGunComponentMasks: true,
  } },
  chieftain_mk10_x: { source: 'glb', qualityBar: 'exemplar', glb: {
    path: '/models/community-candidates/chieftain_mk10_x_source.glb',
    turretNode: '^(?:antenna_02_3|mg_mount_v_4|bone_turret_39(?:00[1-9])?|ex_armor_turret_02_40|ex_decor_(?:06_46|09_48|07_51)|ex_mortar_turret_r_01_53|hatch_(?:05_55|03_56|02_57|04_59)|bone_mg_aa_[hv]_01_(?:58|60))(?:_|$)',
    // Complete original breech owner includes internal controls; do not hide
    // those surfaces merely because a first exterior draft lacks them.
    gunNode: '^(?:gun_barrel_44|turret_barrel)(?:_|$)', autoPivot: true,
    pivot: [0, 1.512956, .595241], gunPivot: [.000026, 1.912199, 1.550505],
    componentMasks: true, directGunComponentMasks: true,
  } },
  leo2a6_x: { source: 'glb', qualityBar: 'exemplar', glb: {
    path: '/models/community-candidates/leo2a6_x_source.glb',
    turretNode: '^turret_0$', gunNode: '^gun_0$', autoPivot: true,
    pivot: [.000005, 2.14836, 1.047795], gunPivot: [.000005, 1.97054, 1.419495],
    componentMasks: true, directGunComponentMasks: true,
  } },
  k1a1_x: { source: 'glb', qualityBar: 'exemplar', glb: {
    path: '/models/community-candidates/k1a1_x_source.glb',
    turretNode: '^vehicle#k1a1_turret_1_[012]$',
    // Complete original hinged mantlet-cover sheet is physically seated at
    // turret roof Y2.20756 despite its hull-material-prefixed source name.
    turretFollowers: '^vehicle#(?:k1a1_(?:smokecaps_turret_7_0|noeffect01_turret_9_0|cage_turret_12_[01])|antenna_short_8_0|k1a1--k1a1_3_26)$',
    gunNode: '^vehicle#k1a1_(?:cannonbase_10_0|cannon_11_0)$',
    autoPivot: true, pivot: [0, 1.49566, .42564], gunPivot: [.0352, 1.81797, 1.57716],
    componentMasks: true, directGunComponentMasks: true,
  } },
  amx30_x: { source: 'glb', qualityBar: 'exemplar', glb: {
    path: '/models/community-candidates/amx30_x_source.glb',
    // First complete vehicle only, selected before oracle normalization. The
    // other vehicle is a separate complete cosmetic version, never a mask.
    turretNode: '^Object_(?:68|70)$', gunNode: '^Object_(?:58|60|62)$',
    autoPivot: true, pivot: [0, 1.584, .285], gunPivot: [-.011, 1.87565, 1.60],
    componentMasks: true, directGunComponentMasks: true,
  } },
  t62mv1_x: { source: 'glb', qualityBar: 'exemplar', glb: {
    path: '/models/community-candidates/t62mv1_x_source.glb',
    // One fused body/turret/cannon/fittings owner plus native track owner.
    // No fabricated disjoint turret or gun masks; whole views still gate92.
    fixedMount: true, componentMasks: false, geometryComponentMasks: false,
  } },
  t72b_1987_x: { source: 'glb', qualityBar: 'exemplar', glb: {
    path: '/models/community-candidates/t72b_1987_x_source.glb',
    fixedMount: true, componentMasks: false, geometryComponentMasks: false,
  } },
  t80u_x: { source: 'glb', qualityBar: 'exemplar', glb: {
    path: '/models/community-candidates/t80u_x_source.glb',
    fixedMount: true, componentMasks: false, geometryComponentMasks: false,
  } },
  leclerc_x: { source: 'glb', qualityBar: 'exemplar', glb: {
    path: '/models/community-candidates/leclerc_x_source.glb',
    turretNode: '^Object_(?:25|26|27|28|29|30)$', gunNode: '^Object_(?:32|33|34|35|36)$',
    autoPivot: true, pivot: [-.00215336, 1.40294995, .72122934],
    gunPivot: [.018886, 1.8791055, 1.998880],
    componentMasks: true, directGunComponentMasks: true,
  } },
} as const;
