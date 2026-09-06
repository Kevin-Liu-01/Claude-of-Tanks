// LOCAL comparison inputs only. No runtime registry imports this module.
// Exported source geometry is already +Y-up/+Z-forward, ground zero and
// hull-centered in physical metres. reference-glb-loader.ts normalizes width
// to the spec; with the documented matching widths that factor is 1.0.
// Do not add the original-source quarter-turn or a second longitudinal fit.
export const LEOPARD_X_REFERENCE_OVERRIDES = Object.freeze({
  leo2a7v_x: { source:'glb', qualityBar:'exemplar', glb:{
    path:'/models/community-candidates/leo2a7v_x_source.glb',
    fixedMount:true, componentMasks:false, geometryComponentMasks:false,
    // Four fused original nodes mix hull, turret, gun, masts and gear.
    // No invented semantic masks; whole views, dimensions, stations and
    // procedural articulation/attachment checks remain strict at 92.
  } },
  leo2a6m_x: { source:'glb', qualityBar:'exemplar', glb:{
    path:'/models/community-candidates/leo2a6m_x_source.glb',
    turretNode:'^Object_6$', autoPivot:true, pivot:[.006,1.719,.508],
    componentMasks:false, gunComponentMasks:false, geometryComponentMasks:false,
    // Object_6 is a real turret. But hull/turret cages share Object_3,
    // combined VLO shells carry the cannon, and Object_9/10 are the only
    // complete gear band. A clean-looking invented partition would lie.
  } },
  leo2a4m_x: { source:'glb', qualityBar:'exemplar', glb:{
    path:'/models/community-candidates/leo2a4m_x_source.glb',
    fixedMount:true, componentMasks:false, geometryComponentMasks:false,
    // Object_3/4 fuse hull+turret+gun+masts; Object_5 is required gear.
  } },
  leo2a5_x: { source:'glb', qualityBar:'exemplar', glb:{
    path:'/models/community-candidates/leo2a5_x_source.glb',
    turretNode:'^vehicle#bone_turret_40$',
    turretFollowers:'^vehicle#(?:ex_armor_(?:l_14_54|l_15_53|r_14_41|r_15_42)|ex_decor_(?:l_10_44|r_07_43)|hatch_(?:05_51|06_52|07_55)|optic_commander_56|turret_cap_50|antenna_(?:01_109|02_108)|bone_mg_aa_h_01_45|mg_aa_01_47|mg_mount_v_46|ammo_110)$',
    gunNode:'^vehicle#(?:bone_gun_48|gun_barrel_49)$',
    autoPivot:true, pivot:[0,1.662,.661],
    gunPivot:[.0238,1.9979,1.659],
    componentMasks:true, directGunComponentMasks:true,
    // Exact original nodes only. In particular ex_armor_* 01..13 are hull
    // skirts, and hatch_01..04 belong to the hull; broad regexes are wrong.
    // This confirmed War Thunder source is used under the owner's explicit
    // batch-local comparison exception, not a redistribution license.
  } },
});
