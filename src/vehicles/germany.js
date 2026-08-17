// German Leopard derivative registration. Owner-supplied GLBs stay outside
// the project and are used only for comparison; all playable geometry is
// first-party procedural work (profiles/leopard.js ground-up builders for
// leo2a4m/leo2a6m per §5.248; profiles/germany.js keeps the OTCO package).

import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS } from './specs.js';

export const GERMANY_IDS = Object.freeze(['leo2a4_otco', 'leo2a4m', 'leo2a6m']);

function variant(id, donorId, options) {
  const donor = TANK_SPECS[donorId];
  if (!donor) throw new Error(`German family donor missing: ${donorId}`);
  const spec = structuredClone(donor);
  spec.id = id;
  spec.name = options.name;
  spec.nation = 'Germany';
  spec.era = 'modern';
  spec.class = 'mbt';
  spec.variantOf = donorId;
  delete spec.community;
  Object.assign(spec, options.stats || {});
  if (Number.isFinite(options.reloadS)) spec.gun.reloadS = options.reloadS;
  if (options.shellName && spec.gun?.shells?.[0]) spec.gun.shells[0].name = options.shellName;
  // §5.248 ground-up builds own their dims: donor clones silently carried
  // their donors' silhouette* gate overrides into the dims anchor (the
  // china-lane ztz85_iii/ztz99a2 bug class) — strip every inherited
  // silhouette row before applying this row's explicit dims.
  if (options.dims) {
    for (const key of Object.keys(spec.dims)) {
      if (key.startsWith('silhouette')) delete spec.dims[key];
    }
    spec.dims = { ...spec.dims, ...options.dims };
  }
  // §5.248 ground-up builds own their rigs: measured turret ring / gun
  // trunnion seats and published-overall muzzle lengths (the shadow-proxy
  // §C law sizes proxies from armor.gunBarrel — keep it the visual truth).
  if (options.turretPivot) spec.armor.turretPivot = options.turretPivot;
  if (options.gunPivot) spec.armor.gunPivot = options.gunPivot;
  if (options.gunBarrel) Object.assign(spec.armor.gunBarrel, options.gunBarrel);
  spec.visual = {
    ...spec.visual,
    scheme: options.scheme,
    base: options.base,
    weather: options.weather,
    patches: options.patches,
    marking: 'number',
    number: options.number,
    camoScale: options.camoScale,
  };
  if (options.armorFactor) {
    for (const armor of [...spec.armor.hullPlates, ...spec.armor.turretPlates]) {
      if (armor.kind === 'external') continue;
      armor.keMm = Math.round(armor.keMm * options.armorFactor);
      armor.ceMm = Math.round(armor.ceMm * options.armorFactor);
    }
  }
  return spec;
}

export const GERMANY_SPECS = {
  leo2a4_otco: variant('leo2a4_otco', 'leo2a4', {
    name: 'Leopard 2A4 OTCO', number: 'OTCO', scheme: 'stripes',
    base: '#4b5140', weather: '#666a57', patches: ['#2d3328', '#665a42', '#77725e'],
    camoScale: 0.44,
    dims: { hullLengthM: 7.72, overallLengthM: 9.67, widthM: 3.70, heightM: 2.90 },
    stats: { hp: 2250, enginePowerHp: 1500, weightTons: 56.0, topSpeedKmh: 68,
      reverseSpeedKmh: 31, turretTraverseDegS: 36, gunPitchDegS: 31 },
    reloadS: 6.1, shellName: 'DM53 APFSDS', armorFactor: 1.08,
  }),
  leo2a4m: variant('leo2a4m', 'leo2a4', {
    name: 'Leopard 2A4M', number: 'A4M', scheme: 'stripes',
    base: '#4a5141', weather: '#656b58', patches: ['#2b3329', '#625941', '#77705b'],
    camoScale: 0.42,
    // §5.248 germany-round true-up (docs/references/tanks/leo2a4m.md):
    // hull 7.72 / overall 9.96 (L44 forward, REG bracket — the print's own
    // muzzle sits at rear + 9.96 within 0.2% once width-anchored true);
    // width 3.77 = the measured over-skirt/armor datum (the REG 4.07 add-on
    // figure is not carried by the print — divergence documented in the
    // packet); height 2.60 = the p95 body-course roof datum (§5.73-1 law —
    // the 2.75 figure is an over-periscope datum the p95 recipe cannot see;
    // the print's own 3.556 read is its whip-antenna cluster, §5.261 law).
    dims: { hullLengthM: 7.72, overallLengthM: 9.96, widthM: 3.77, heightM: 2.62 },
    // §5.299 owner-order rig (pre-wave turret splice — "use the new hull
    // and gun but use the turret from before we were using"): ring plane
    // 1.70 reproduces the donor A4 turret's exact seat margins on the
    // §5.248 hull (donor built at 1.62 over its 1.59 deck; this hull's
    // ring-zone deck is 1.67). Gun axis HELD at the certified 2.00 honest
    // trunnion floor (1.70 + 0.30); trunnion z re-seated to the old
    // turret's mantlet face (1.13 — at the §5.248 turret's 0.75 seat the
    // new mantlet buried inside the old slot back wall); muzzle world HELD
    // at 6.24 = 0.30 + 1.13 + 4.81 (bore-mouth law; overall 9.96 off the
    // -3.78 rack tail — the §5.248 gun's world landmarks are unchanged,
    // only the gun-local tube length re-derives from the new trunnion).
    turretPivot: [0, 1.70, 0.30], gunPivot: [0, 0.30, 1.13],
    gunBarrel: { lengthM: 4.81, radiusM: 0.10 },
    stats: { hp: 2450, enginePowerHp: 1500, weightTons: 61.8, topSpeedKmh: 68,
      reverseSpeedKmh: 31, turretTraverseDegS: 38, gunPitchDegS: 32 },
    reloadS: 5.9, shellName: 'DM53A1 APFSDS', armorFactor: 1.22,
  }),
  leo2a6m: variant('leo2a6m', 'leo2a6', {
    name: 'Leopard 2A6M', number: 'A6M', scheme: 'stripes',
    base: '#48503f', weather: '#626956', patches: ['#293128', '#605640', '#746d58'],
    camoScale: 0.40,
    // §5.248 germany-round true-up (docs/references/tanks/leo2a6m.md):
    // hull 7.72 / overall 10.97 (L55 forward) — print-corroborated to 0.1%
    // at the true width anchor; width 3.98 = over the bar-armor cage (the
    // ISAF fit this id models; the REG 4.24 figure inflates every print
    // read +6.5%, divergence documented in the packet); height 3.03 = the
    // published over-PERI figure — the PERI crown is authored 3+ side
    // columns deep so the p95 law lands ON it (whip spikes stay inside
    // the 3-column p95 budget).
    dims: { hullLengthM: 7.72, overallLengthM: 10.97, widthM: 3.98, heightM: 3.03 },
    // measured rig (§5.248 rebuild): ring plane 1.80, gun axis 2.13; tube
    // authored 5.98 so the LIT bore mouth lands ~7.15 world (the r1 5.88
    // tube read 0.13 short on the lit-pixel span) = spec overall off the
    // -3.80 cage tail (bore-mouth law, L55).
    turretPivot: [0, 1.80, 0.45], gunPivot: [0, 0.33, 0.85],
    gunBarrel: { lengthM: 5.98, radiusM: 0.10 },
    stats: { hp: 2600, enginePowerHp: 1500, weightTons: 64.1, topSpeedKmh: 68,
      reverseSpeedKmh: 31, turretTraverseDegS: 40, gunPitchDegS: 34 },
    reloadS: 5.7, shellName: 'DM63 APFSDS', armorFactor: 1.27,
  }),
};

for (const id of GERMANY_IDS) {
  TANK_SPECS[id] = TANK_SPECS[id] || GERMANY_SPECS[id];
  MODEL_SOURCE[id] = MODEL_SOURCE[id] || { source: 'procedural' };
  if (!ALL_TANK_IDS.includes(id)) ALL_TANK_IDS.push(id);
}
