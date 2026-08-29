/**
 * Local-only GLB articulation records used by model-quality-audit.mjs.
 *
 * These inputs are authoring references, not runtime vehicle sources. Keep
 * them outside src/ so a production bundle cannot discover or request them.
 */
export const VEHICLE_COMPARISON_SOURCES = Object.freeze({
  kv2: Object.freeze({
    path: '/models/tanks/community/kv2-full-comrade1280.glb',
    turretNode: '^turret$',
    autoPivot: true,
    paintUntextured: true,
    stripBakedTextures: true,
  }),
  jpz_e100: Object.freeze({
    path: '/models/tanks/community/jagdpanzer_e100_haphazard.glb',
    fixedMount: true,
    paintUntextured: true,
  }),
  sturmtiger: Object.freeze({
    path: '/models/tanks/community/sturmtiger-tomrs.glb',
    fixedMount: true,
    yawOffset: -Math.PI / 2,
  }),
  t95: Object.freeze({
    path: '/models/tanks/community/t95_doomturtle_haphazard.glb',
    fixedMount: true,
    yawOffset: Math.PI,
    paintUntextured: true,
  }),
  m1a2_tusk: Object.freeze({
    path: '/models/tanks/community/variants/m1a2_tusk_dannzjs_variant.glb',
    turretNode: 'TurretPivot',
    gunNode: 'GunPivot',
    paintUntextured: true,
  }),
  type59: Object.freeze({
    path: '/models/tanks/community/type69_lasttriarius.glb',
    turretNode: '^Turret$',
    autoPivot: true,
    paintUntextured: true,
  }),
  m48: Object.freeze({
    path: '/models/tanks/community/m48a5_atmodeler.glb',
    turretNode: '^Turret$',
    autoPivot: true,
    paintUntextured: true,
  }),
});
