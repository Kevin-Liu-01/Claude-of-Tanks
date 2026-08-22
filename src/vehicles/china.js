// Chinese family gameplay/spec registration.  Geometry lives in
// profiles/china.js; these rows inherit certified armor/module structures so
// generated hitboxes and articulation stay coherent with their donor tanks.

import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS } from './specs.js';
import { createType99Armor } from './profiles/type99Armor.js';

const CHINA_IDS = Object.freeze(['ztz85_iii', 'ztz99a2']);

function variant(id, donorId, options) {
  const donor = TANK_SPECS[donorId];
  if (!donor) throw new Error(`Chinese family donor missing: ${donorId}`);
  const spec = structuredClone(donor);
  spec.id = id;
  spec.name = options.name;
  spec.nation = 'China';
  spec.era = 'modern';
  spec.role = 'mbt';
  spec.variantOf = donorId;
  delete spec.community;
  Object.assign(spec, options.stats || {});
  if (Number.isFinite(options.reloadS)) spec.gun.reloadS = options.reloadS;
  spec.visual = {
    ...spec.visual,
    scheme: 'digital',
    base: options.base,
    weather: options.weather,
    patches: options.patches,
    marking: 'number',
    number: options.number,
    camoScale: options.camoScale,
  };
  if (options.dims) {
    // §5.248: donor clones carried their donors' silhouette* gate overrides
    // (t62mv1's DShK/fender rows rode type59 -> ztz85_iii; type99a's P95
    // rows rode into ztz99a2).  A ground-up build measures its own
    // silhouette — only THIS row's explicit overrides may survive.
    for (const key of Object.keys(spec.dims)) {
      if (key.startsWith('silhouette')) delete spec.dims[key];
    }
    spec.dims = { ...spec.dims, ...options.dims };
  }
  if (options.armor) spec.armor = options.armor;
  if (options.armorFactor) {
    for (const plate of [...spec.armor.hullPlates, ...spec.armor.turretPlates]) {
      if (plate.kind === 'external') continue;
      plate.keMm = Math.round(plate.keMm * options.armorFactor);
      plate.ceMm = Math.round(plate.ceMm * options.armorFactor);
    }
  }
  return spec;
}

const CHINA_SPECS = {
  ztz85_iii: variant('ztz85_iii', 'type59', {
    name: 'ZTZ-85-III', number: '85-III', base: '#35483a', weather: '#4a5947',
    patches: ['#263229', '#59634c', '#736a4d'], camoScale: 0.50,
    // §5.248 SPEC TRUE-UP (china ground-up round, 2026-08-17): the donor-era
    // 9.82/2.45 row was never receipted.  Published Type 85-II/-III bracket
    // (docs/references/tanks/scout-gen2-type85.md — tank-afv.com +
    // army-guide.com, and the batch-B REG pubDims): overall 10.28 m gun
    // forward, width 3.45 m, height 2.30 m to the turret roof (P95 datum =
    // the low commander cupola crown, §5.73-1).  hullLengthM stays the
    // registered 6.40 (packet hull line reads 6.33; the print's 12%-body
    // trace measures 6.49 — the row sits inside both receipts).
    // silhouetteOverallLengthM: the build follows the MUZZLE LAW (type59
    // precedent) — its tube ends at the print's extracted +4.43 muzzle, so
    // the gate compares the authored whole span (measured 8.40) while
    // overallLengthM keeps the published gun-forward datum for gameplay/UI.
    // silhouetteHeightM: the t62mv1 DShK-height convention — the mounted
    // W-85 cluster tops the gate's P95 trace at 2.53 (its columns sit inside
    // the print's own 2.5-2.75 roof-cluster band); published 2.30 stays the
    // gameplay/UI datum.
    // silhouetteHullLengthM: the 12%-band trace includes the bow flap/bar
    // row and the §5.266 stern corner flaps (authored trace 6.47; the
    // print's own trace reads 6.49) — published 6.40 bare hull stays the
    // gameplay datum (type99a guards/cable precedent).
    dims: {
      hullLengthM: 6.40, overallLengthM: 10.28, widthM: 3.45, heightM: 2.30,
      silhouetteHullLengthM: 6.47,
      silhouetteOverallLengthM: 8.43, silhouetteHeightM: 2.53,
    },
    stats: {
      hp: 1950, enginePowerHp: 1000, weightTons: 43.7, topSpeedKmh: 57,
      reverseSpeedKmh: 15, turretTraverseDegS: 34,
      gunPitchDegS: 27, gunElevationDeg: 14, gunDepressionDeg: 6,
    },
    armorFactor: 1.14,
  }),
  ztz99a2: variant('ztz99a2', 'type99a', {
    name: 'ZTZ-99A2', number: '99A2', base: '#36463a', weather: '#4c5a49',
    patches: ['#232f28', '#5e654d', '#766b52'], camoScale: 0.43,
    // §5.248 SPEC TRUE-UP (china ground-up round, 2026-08-17): the donor
    // clone inherited type99a's AW-print datum row (7.76/11.66/3.82/3.24)
    // — the ZTZ-99A2 is its own tank on the published band (batch-B REG
    // pubDims receipts): hull 7.6 m, overall 11.0 m gun forward, width
    // 3.7 m over skirts, turret roof 2.37 m.  heightM 2.45 is the §5.73-1
    // P95 envelope: the flat authored roof plane carries P95 while the
    // narrow pano/mast/MG stations stay inside the 4-column spike budget.
    // silhouette* rows keep the gate comparing like with like (type99a
    // precedent): the 12%-band side trace includes the rear fuel drums
    // (print trace 8.50) and the whole span runs muzzle -> drum rear
    // (print 11.82); gameplay/UI stay on the published 7.6/11.0.
    dims: {
      hullLengthM: 7.6, overallLengthM: 11.0, widthM: 3.7, heightM: 2.45,
      // gate-frame measures of the registered build (P95 2.89 = the pano/
      // mast/MG station band, print's own P95 reads 2.94; trace 8.28 and
      // span 11.55 include the drum rack the print also carries).
      silhouetteHullLengthM: 8.18, silhouetteOverallLengthM: 11.55,
      silhouetteHeightM: 2.89,
    },
    stats: {
      hp: 2750, enginePowerHp: 1500, weightTons: 58.0, topSpeedKmh: 70,
      reverseSpeedKmh: 28, turretTraverseDegS: 42, gunPitchDegS: 34,
    },
    reloadS: 6.4,
    // The A2 is a distinct ground-up build with a 1.56 m ring seat, deeper
    // hull and longer turret bustle; it must not inherit the Type 99A's
    // collision envelope merely because its gameplay values are related.
    armor: createType99Armor('ztz99a2'),
    armorFactor: 1.12,
  }),
};

// Tier-VIII fire-control package: keep the Type 59 ancestry for geometry,
// but author the ZTZ-85-III's combat row explicitly instead of inheriting a
// tier-VII 100 mm gun unchanged.
{
  const spec = CHINA_SPECS.ztz85_iii;
  spec.hp = 2100;
  spec.gun.reloadS = 6.8;
  spec.gun.baseAccuracy = 0.33;
  spec.gun.aimTimeS = 2.0;
  Object.assign(spec.gun.shells[0], {
    name: '125-I APFSDS', caliberMm: 125,
    pen100Mm: 620, pen1000Mm: 570, pen2000Mm: 510, dmg: 500,
    velocityMps: 1730, moduleDmg: 125,
  });
  Object.assign(spec.gun.shells[1], {
    name: 'DTP-125 HEAT', caliberMm: 125,
    pen100Mm: 600, pen1000Mm: 600, dmg: 480, velocityMps: 950, moduleDmg: 125,
  });
  Object.assign(spec.gun.shells[2], {
    name: 'DTB-125 HE', caliberMm: 125,
    pen100Mm: 50, pen1000Mm: 50, dmg: 570, velocityMps: 900, moduleDmg: 125,
  });
}

for (const id of CHINA_IDS) {
  TANK_SPECS[id] = TANK_SPECS[id] || CHINA_SPECS[id];
  MODEL_SOURCE[id] = MODEL_SOURCE[id] || { source: 'procedural' };
  if (!ALL_TANK_IDS.includes(id)) ALL_TANK_IDS.push(id);
}
