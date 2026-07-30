// Recovered-drop wave 5: the two explicitly pending Abrams candidates.
// Both are kept playable: Tejas V.'s detailed M1A2 is a roster variant while
// Mortavex's AbramsX is the concept demonstrator. The shipped dannzjs SEPv3
// remains the default flagship until the visual A/B gate says otherwise.
import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS } from './specs.js';

const clone = (value) => JSON.parse(JSON.stringify(value));

const tejas = clone(TANK_SPECS.m1a2);
tejas.id = 'm1a2_tejas';
tejas.name = 'M1A2 Abrams (Tejas)';
tejas.variantOf = 'm1a2';
tejas.community = {
  author: 'Tejas V.',
  source: 'https://sketchfab.com/3d-models/m1a2-abrams-c85846177bfc4018b6a8f3b40754655c',
  license: 'CC BY-NC-ND 4.0 — LOCAL-ONLY QUARANTINE',
};
tejas.visual.number = '23';

const abramsx = clone(TANK_SPECS.m1a2);
abramsx.id = 'abramsx';
abramsx.name = 'AbramsX';
abramsx.variantOf = 'm1a2';
abramsx.community = {
  author: 'Mortavex',
  source: 'https://sketchfab.com/Mortavex',
  license: 'Owner-supplied; redistribution not cleared — LOCAL-ONLY QUARANTINE',
};
abramsx.hp = 2750;
abramsx.weightTons = 49;
abramsx.enginePowerHp = 1500;
abramsx.topSpeedKmh = 72;
abramsx.reverseSpeedKmh = 35;
abramsx.hullTraverseDegS = 46;
abramsx.turretTraverseDegS = 48;
abramsx.gun.reloadS = 5.2;
abramsx.gun.aimTimeS = 1.5;
abramsx.gun.baseAccuracy = 0.25;
abramsx.gun.shells[0].name = 'XM1203 APFSDS';
abramsx.gun.shells[1].name = 'XM1203 AMP';
abramsx.visual = {
  ...abramsx.visual,
  scheme: 'nato', base: '#3c4438', weather: '#596052',
  patches: ['#1f2420', '#665746'], marking: 'star', number: 'X1', camoScale: 0.58,
};

// Source models are intentionally absent from VITE_PUBLIC_BUILD artifacts.
// The local-only specs and their derivative icons are omitted there too.
const ALLOW_LOCAL_RECOVERED_MODELS = typeof import.meta !== 'undefined' &&
  import.meta.env && !import.meta.env.VITE_PUBLIC_BUILD;
if (ALLOW_LOCAL_RECOVERED_MODELS) {
  for (const spec of [tejas, abramsx]) {
    TANK_SPECS[spec.id] = TANK_SPECS[spec.id] || spec;
    if (!ALL_TANK_IDS.includes(spec.id)) ALL_TANK_IDS.push(spec.id);
  }
  MODEL_SOURCE.m1a2_tejas = {
    source: 'glb',
    glb: {
      path: '/models/tanks/m1a2_tejas.glb',
      turretNode: '^Turret$', gunNode: '^Gun$', autoPivot: true,
      yawOffset: -Math.PI / 2, paintUntextured: true, heroTex: true,
    },
  };

  MODEL_SOURCE.abramsx = {
    source: 'glb',
    glb: {
      path: '/models/tanks/community/abramsx-mortavex.glb',
      turretNode: '^Turret$', gunNode: '^[Ss]tvol$', autoPivot: true,
      paintUntextured: true,
    },
  };
}

export const USERDROP4_TANK_IDS = ['m1a2_tejas', 'abramsx'];
