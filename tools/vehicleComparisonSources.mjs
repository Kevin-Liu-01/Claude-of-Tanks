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
  // jpz_e100, sturmtiger and t95 records retired 2026-09-23 (owner: "no hidden tanks"); their comparison rows left with them.
  m1a1_abrams_sa: Object.freeze({
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
  // release 262: the owner-supplied ater.studio M48A5 (comparison only; docs/references/tanks/m48a5_patton.md)
  m48a5_patton: Object.freeze({
    path: '/models/tanks/community/m48a5_patton_ater.glb',
    turretNode: '^Turret_01_4$',
    gunNode: '^gun_01_Shape_6$',
    autoPivot: true,
    paintUntextured: true,
    yawOffset: Math.PI,
  }),
});
