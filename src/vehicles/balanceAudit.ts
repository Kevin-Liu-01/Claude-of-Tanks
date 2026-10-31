import type { FleetTankSpec, TankSpecRegistry } from './specContracts.ts';

export const FLEET_BALANCE_REVISION = Object.freeze({
  challenger1_mk2: 'promote the protected late-Cold-War rifled-gun MBT to a complete Tier IX profile; 263: a x0.7 turret front with the Mk 1 and Mk 3 on the Mk 3\'s turret',
  kv2: 'reduce the 152 mm derp profile friction while preserving its slow handling identity',
  t62_1975: 'raise the early Cold War baseline without erasing its handling limits',
  type59: 'bring the light Cold War MBT above the stale damage-output floor; 263: 1,850 HP and a 430-damage round with the T-55A: a hit more to kill at I',
  t55a: 'take the Type 59 package: the same T-54/T-55 chassis and 100 mm gun (262); 263: 1,850 HP and a 430-damage round with the Type 59',
  pt91m: 'bring the modern Tier VIII fire-control package up to its peers; 259: a thicker mantlet, pen, hull and cadence for same-tier fairness at IV',
  t90_1992: 'replace the stale Tier IX donor envelope used by the Tier X production tank',
  t90ms_2011: 'give the export demonstrator a distinct Tier X protection/firepower step',
  t90a_burlak_proto: 'price the bustle autoloader as a faster Tier X feed system',
  leclerc_s2: 'improve the Tier IX ready-rack cycle while retaining burst downtime; 265: the Type 90\'s 9 s magazine cycle, the clip was still refilling when it died',
  leclerc_sxxi: 'add a real Tier X ammunition, protection and ready-rack step; 265: a 9 s magazine cycle with the S2',
  leclerc_s1: 'make headline reload match its magazine and establish assault-branch output',
  t72m1_jaguar: 'remove the modern Tier VIII HP/reload trough; 259: a thicker mantlet, pen, hull and cadence for same-tier fairness at IV; 263: the 259 mantlet eased to x1.2 on the fixed gun face',
  pt91a_twardy: 'improve the Tier IX Polish protection and feed-system step',
  pl01: 'price the three-round low-profile autoloader for Tier X sustained combat',
  pl01_105: 'price the four-round 105 mm branch for Tier X sustained combat',
  m1a3: 'remove the next-generation autoloader, protection and missile ceiling; 265: armour x0.75, the published 25 % weight cut from passive armour (it shut out the AbramsX)',
  challenger3_proto: 'restore the base Challenger 3 firepower and mobility envelope',
  challenger3_td: '262: the new Challenger 3 TD one step under the prototype (DM63A1, the Challenger 2 automotive set)',
  challenger3_td_rws: '262: the Challenger 3 TD field fit shares the TD package (its remote M2 is an auxiliary weapon)',
  challenger3: 'retain a measured protection and fire-control step over the base vehicle, inside the modern fire-control ceiling',
  // 265: the Leopard 1A2A1 on the 1A5's node at I (fleetBalancePass applyBuildFootings)
  leo1a2a1: 'the Leopard 1A5\'s tier I footing, its HP and round damage: the 1A5\'s spec with the DM23 round',
  // 2026-10-25: the IFVs relabelled modern fold into their modern Tier X peers (fleetBalancePass applyModernEraFold)
  kf41_lynx: 'fold the Raijū-donor cannon package into the modern IFV cadence and 35 mm penetration',
  cv90_mk4: 'fold the Raijū-donor cannon package into the modern IFV cadence',
  type89: 'fold the Raijū replica\'s cannon package into the modern IFV cadence and an older 35 mm round',
  cv90_mk4_concept: 'slow the 50 mm cycle to the modern IFV output and keep its round inside the modern ceiling',
  lrmv_lynx: 'bring the 30 mm round to the modern 30 mm penetration',
  borsuk: 'bring the 30 mm round to the modern 30 mm penetration',
  chieftain_mk9: 'restore the late Chieftain as a competitive protected Tier VIII MBT; 259: at IV the armour bonus trimmed to 1.32, a slower cycle and less hull',
  centurion5_2: 'remove the Tier VIII Centurion survivability and mobility trough; 258: an engine over its shown-tier floor',
  m48a3_patton: '266: the new M48A3 shares the M48A5 package with the M47\'s 90 mm round and cadence',
  magach3: '266: the new Magach 3 shares the M48A5 package with its Blazer boxes',
  m48a2ga2: '266: the new M48A2GA2 shares the M48A5 package (the L7A3 is the M68\'s twin)',
  m48_super: '266: the new M48 Super: the M48A5 package with its spaced armour, a stabilised fire control and the added weight',
  shot_kal: '262: the new Sho\'t Kal shares the Mk 5/2 package (hull, armour factor, round, cadence) with its diesel\'s power',
  centurion13: '262: the new Mk 13 shares the Mk 5/2 package (hull, armour factor, round, cadence, engine)',
  strv105: '262: the new Strv 105 shares the Mk 5/2 package (hull, armour factor, round, cadence) with its diesel\'s power and its FFV cassettes',
  olifant_mk2: '262: the new Olifant Mk 2 package: the 1,040 hp diesel, the composite turret and glacis, a stabilised fire control and the GT-3B\'s APFSDS',
  centurion5_1_aus: '262: the new Australian Mk 5/1: the Strv 81\'s Mk 5 hull, armour, 20-pdr Type B and Meteor as they stand',
  centurion5_avre: '262: the new Mk 5 AVRE: the Mk 5/2 hull and Meteor with the 165 mm demolition gun, measured in its own cohort',
  // 2026-10-26 (258): matchmaking reads the shown tier; these sat just under a shown-tier peer floor (applyShownTierFloors)
  bmpt_terminator2: 'lift the 30 mm round over the shown-tier IFV penetration floor',
  marder1a3: 'lift the 20 mm round over the shown-tier IFV penetration floor',
  merkava2b: 'lift the engine over the shown-tier MBT mobility floor; 265: a x0.5 hull front, its sloped glacis read 1,055-1,850 mm at III',
  t80bv: 'lift the fire control over the shown-tier MBT floor; 259: a slower cycle and less hull for same-tier fairness at IV',
  upior: 'lift the hull and round over the next-generation IFV floors',
  // 2026-10-26 (259): same-tier fairness at the shown tiers IV and VII (fleetBalancePass applySameTierFairness)
  c1_ariete_preserie: 'take the Chieftain round, a quicker cycle and hull for same-tier fairness at IV',
  leo2a3: 'slow the cycle for same-tier fairness at IV; 260: a balance trim of the turret front (x0.9): no sourced period round defeats the basic package\'s turret front; 263: the 260 trim undone and 2,400 HP, IV\'s weakest on the fixed gun face',
  leo2a3_b4: 'the 2A3\'s cycle and 2,400 HP at IV (262: the fourth batch carries the 2A3\'s combat data; 263: the HP in place of 260\'s turret-front trim)',
  chieftain_mk10: 'keep the Mk 9 rebuild on its donor\'s slower cycle and hull at IV',
  c2_ariete: 'trim the Tier X armour and hull it brought to VII and fire its prototype\'s rounds; the cadence stays over the C1',
  c2_ariete_proto: 'trim the Tier X armour it brought to VII, slow its cycle and aim, and (261) carry 2,200 HP, under the production C2',
  t72b3_sich: 'offset the weaker donor hull front with hull and a quicker autoloader for same-tier fairness at VII',
  t80u_husarz: 'add hull for same-tier fairness at VII',
  t72b3m_wilk: 'add hull for same-tier fairness at VII',
  fv4034: 'trim the UK Tier VIII peer ceiling while retaining its protected identity; 259: at IV the turret compensation trimmed and less hull',
  xk2_black_panther: 'trade excess paper DPM for realized frontal protection and ammunition',
  k2b: 'establish a real Tier X protection and ammunition step over K2',
  t90m_proryv: 'separate the Tier X Proryv from its Tier IX T-90M donor',
  merkava1b: 'remove the Tier VII armor and penetration ceiling; 265: on the frontal arc only, the roof, sides and rear keep their thickness',
  spz_puma: 'balance the Tier VIII cannon and protection package against its peers',
  bmp3_rok: 'restore a complete Tier VIII cannon, missile and protection package',
  spz_wotan: 'remove the Tier X autocannon ceiling while retaining anti-armor utility',
  bmpt_t90: 'normalize guided-weapon cadence against other Tier X IFVs (load stays eight: one Ataka per tube, owner 2026-09-18)',
  leo2a4m: 'trim the enhanced Leopard package to the Strv 122 peer envelope; 265: a x0.55 mantlet on the rebuild: its sloped wedge mantlet read 1,300-1,690 mm against the published 2A5-standard 850-930 at VIII',
  leo2a4: 'exchange excess stationary protection for its intended mobile Tier IX identity; 264: a x2.45 mantlet, a named balance trim on the square 2A4 front',
  leo2a4m_can: 'replace a Tier VIII penetration holdover and realize Tier IX protection; 264/265: balance trims, a x1.28 mantlet and a x1.24 turret front, held between its two reviewed matchups (the M1A1 and the Challenger 1 Mk 2)',
  m48a5_patton: 'restore the M48 baseline so M60 upgrades are meaningful rather than mandatory',
  m60a1: 'establish a mobile M60 sidegrade beneath the M60A3 fire-control package',
  m60a3: 'support the heavier fire-control variant with adequate engine output; 263: 2,100 HP and a 6.8 s cycle, the M60A1\'s, at I',
  m60a2: 'normalize the Shillelagh burst cycle and ammunition reserve',
  t80: 'make the base T-80 a mobile sidegrade instead of a strict T-80U downgrade',
  t80b: 'make the T-80B the mobile alternative to the protected T-80BV; 259: a thicker mantlet, pen, hull, aim and cadence for same-tier fairness at IV',
  type90_kyumaru: 'make the STC-1 the mobility alternative to the protected STC-2; 263: a 9 s magazine cycle and 2,450 HP with its STC-2 rebuild at VIII',
  t90a_2004: 'give the base T-90A handling value beside the faster Vladimir package',
  m1a1: 'make the base M1A1 the mobile alternative to the protected HA package; 263: a x1.5 mantlet, its upright gun face read under 470 mm at VIII',
  amx30: 'restore the AMX-30 mobility and fire-control sidegrade; 263: 1,800 HP and a 420-damage round with the AMX-30B: a hit more to kill at I',
  fv510_milan: 'restore Tier IX cannon output without erasing its missile identity',
  warrior_tes_h: 'establish the Tier X Warrior TES(H) survivability and cannon envelope (TES(H) add-on armour; owner ruling 2026-10-12: new Warrior type at tier 10)',
  ua_m2a3_bradley: 'restore the Ukrainian Bradley cannon, mobility and survivability envelope',
  raiju_ifv: 'close the next-generation IFV anti-armor and protection gap',
  type10b: 'bring exceptional sustained output back inside the next-generation ceiling',
  object148_proto: 'bring next-generation fire control above the severe peer floor',
  t64bv1: 'modernize the Tier VIII fire-control floor without erasing Soviet handling',
  t72b3m_2022: 'modernize the Tier IX fire-control floor without erasing Soviet handling',
  t64bv_donbas: 'modernize the Ukrainian Tier VIII fire-control floor without erasing Soviet handling; 259: a thicker mantlet, pen, hull and cadence for same-tier fairness at IV; 263: the 259 mantlet eased to x1.2 on the fixed gun face',
  t64bm1m: 'the Nizh T-64B1 at IV (capability 0.548): the Soviet fire-control floor and its mod. 2017 sibling\'s 259 tier-IV footing (mantlet, pen, 6.2 s cycle); 263: the mantlet eased to x1.2 on the fixed gun face',
  t64bv: 'the true-T-64 T-64BV: the T-64BV1\'s record and the Soviet fire-control floor',
  t64b1v_2022: 'the true-T-64 T-64B1V mod. 2022 at IV: the mod. 2017\'s record, fire-control floor and 259 tier-IV footing; 263: the mantlet eased to x1.2 on the fixed gun face',
  pt64_tur: 'the Polish what-if PT-64 Tur at IV on the true T-64: the mod. 2017\'s record, ERAWA-2, fire-control floor and 259 tier-IV footing; 263: the mantlet eased to x1.2 on the fixed gun face',
  // 2026-10-28 (263, FAIRNESS-263): same-tier fairness on the merged 263 fleet (fleetBalancePass applySameTierFairness)
  t72b3: 'a x1.45 mantlet with the Soviet-pattern line at VI; its gun and hull stay its template\'s (sourceXSecondWave)',
  t80u: 'the IV footing at VI: a x1.45 mantlet and the 760 mm round, with its T-80UK donor',
  t80uk: 'the IV footing at VI: a x1.45 mantlet and the 760 mm round, with its T-80U rebuild',
  t84: 'the IV footing at VI: a x1.45 mantlet and the 760 mm round',
  t84bm_oplot_m: 'the IV footing at VI (263 re-tier): a x1.45 mantlet and the 760 mm round',
  // 2026-10-28 (263, Main's ruling: the balance lane's minimal levers for the merged tree's new balanceMatchups reds)
  challenger1_mk1: 'a x0.7 turret front with the Mk 2 and Mk 3: the Mk 3\'s sloped gun-face cells read ~1,020 mm',
  challenger1_mk3: 'a x0.7 turret front with the Mk 1 and Mk 2: its sloped gun-face cells read ~1,020 mm',
  challenger_x_sleek: 'a x1.4 gun slot: the Challenger 1\'s upright 624 mm slot was pierced by every VIII round',
  c1_ariete: 'a x0.6 mantlet and x0.85 turret front: its ~730 mm gun face topped VI and shut out the XK2 on the move',
  vt4a1: 'a x0.7 mantlet: its steep gun face read 1,200-1,700 mm at VIII',
  leo2_revolution: 'a x1.7 mantlet: its upright gun face read under 470 mm at VIII',
  leo2_revolution_proto: 'a x1.7 mantlet: its upright gun face read under 470 mm at VIII',
  m1a1ha: 'a x2 mantlet and 2,500 HP: its upright gun face read under 470 mm at VIII',
  m1a1_abrams_aim: '2,450 HP: it topped VIII once its peers\' gun faces were levered',
  m1a1_abrams_hc: '2,450 HP: it topped VIII once its peers\' gun faces were levered',
  type90: 'a 9 s magazine cycle and 2,450 HP with its Kyū-maru donor: the clip was still reloading when it died',
  type90a: 'an 8.5 s magazine cycle: the clip was still reloading when it died',
  k1a1: 'a x1.6 turret front at VIII; its gun and hull stay its K1E1 donor\'s (sourceXSecondWave)',
  bm_oplot_m: 'the X round (880 mm) and a x2 mantlet: its 400 mm gun face sat under X gun faces of ~1,000 mm',
  bm_oplot_t: 'the X round (880 mm) and a x2 mantlet: its 400 mm gun face sat under X gun faces of ~1,000 mm',
  ztz20: '2,800 HP and a 480-damage round: its 440 needed a hit more than its peers to kill',
  ztz20_prototype: '2,750 HP and a 480-damage round, a step under the production ZTZ-20',
  amx30b: '1,800 HP and a 420-damage round with its AMX-30 donor: a hit more to kill at I',
  leo1a5: '1,750 HP and the L7 family\'s 430-damage round: it died a hit early at I and needed a hit more',
  stb1: '1,850 HP and a 6.6 s cycle, a step over its Type 74 production tank\'s',
  type74: 'a 6.2 s cycle: the quickest at I',
  ztz85_iii: 'a 460-damage round: its 500 killed every tier-I peer in four hits; 265 (interim pending the owner\'s re-tier): 430 damage and 1,950 HP, it topped I at 0.96 with no pair in band',
  // 2026-10-29 (264, Main's ruling)
  leo2a6_ua: 'the 2A6\'s main plates, HP and cadence: drawn on the 2A6\'s shell with its 2A6M donor\'s 1.72x plates, it topped IX at 0.86',
  // 2026-10-30 (265, FAIRNESS-265, Main's rulings)
  t72b3_zhuque: 'a x1.25 turret front: its flat box cheeks read ~600 mm and every VII round pierced them',
  t72b3m_xuanwu: 'a x1.25 turret front: its flat box cheeks read ~600 mm and every VII round pierced them',
  leo2a5: 'a x0.7 mantlet: its sloped wedge mantlet read ~1,300 mm against the published 850-930 at IX',
  leclerc_xlr: 'the Type 90\'s 9 s magazine cycle with the S2 and SXXI',
  amx56: 'the Type 90\'s 9 s magazine cycle with its Leclerc S2 donor (sourceXSecondWave)',
  ztz100: '2,750 HP and a 480-damage round, the ZTZ-20 prototype\'s footing',
  merkava2d: 'a x0.5 hull front: its sloped glacis read 1,055-1,850 mm at III',
  merkava4b: 'the Mk 4M\'s M338 round and 2,850 HP on the same hull: its flat gun notch read 481 mm at IX',
  leo2_improved: 'a x0.7 mantlet on the rebuild: its sloped wedge mantlet read 1,300-1,690 mm against the published 2A5-standard 850-930 at VIII',
  leo2a4_otco: 'a x0.55 mantlet on the rebuild: its sloped wedge mantlet read 1,300-1,690 mm against the published 2A5-standard 850-930 at VIII',
  leo2a4_v: 'the Leopard 2A4\'s main plates under its own Kontakt-1, in place of 264\'s x2.2 mantlet trim',
} as const);

interface FleetBalanceOutlier {
  id: string;
  group: string;
  metric: 'hp' | 'dpm' | 'penetration' | 'powerWeight' | 'fireControl';
  direction: 'low' | 'high';
  value: number;
  median: number;
  ratio: number;
}

type BalanceMetric = FleetBalanceOutlier['metric'];
type BalanceRow = { id: string; spec: FleetTankSpec };
type BalanceValues = Readonly<Record<BalanceMetric, number>>;

const BALANCE_METRICS = Object.freeze([
  'hp', 'dpm', 'penetration', 'powerWeight', 'fireControl',
] as const satisfies readonly BalanceMetric[]);

export function sustainedPrimaryDpm(spec: FleetTankSpec): number {
  const round = spec.gun.shells[0];
  const salvo = spec.gun.launcherSalvo;
  if (salvo && round.guided) return round.dmg * salvo.rounds * 60 /
    ((round.reloadS || spec.gun.reloadS) + (salvo.rounds - 1) * salvo.intervalS);
  const autoloader = spec.gun.autoloader;
  if (!autoloader) return round.dmg * 60 / spec.gun.reloadS;
  const rounds = Math.max(1, autoloader.magazineSize);
  const cycle = (autoloader.fullReloadS || spec.gun.reloadS) +
    Math.max(0, rounds - 1) * autoloader.intraClipS;
  return round.dmg * rounds * 60 / Math.max(0.05, cycle);
}

function median(values: number[]): number {
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)] || 0;
}

function balanceValues(spec: FleetTankSpec): BalanceValues {
  return {
    hp: spec.hp,
    dpm: sustainedPrimaryDpm(spec),
    penetration: spec.gun.shells[0].pen100Mm,
    powerWeight: spec.enginePowerHp / spec.weightTons,
    fireControl: 1 / (spec.gun.baseAccuracy * spec.gun.aimTimeS),
  };
}

function groupFleetBalanceRows(
  ids: readonly string[],
  specs: TankSpecRegistry,
  tierOf: (id: string) => number,
): Map<string, BalanceRow[]> {
  const groups = new Map<string, BalanceRow[]>();
  for (const id of ids) {
    const spec = specs[id];
    if (!spec) continue;
    const cohort = spec.balanceCohort ? `/${spec.balanceCohort}` : '';
    const key = `${spec.era}/${tierOf(id)}/${spec.role}${cohort}`;
    const group = groups.get(key) || [];
    group.push({ id, spec });
    groups.set(key, group);
  }
  return groups;
}

/** Alias independence belongs to each measurement. Changing aim time must
 * not give the same donor penetration an extra vote in the median. */
function independentMetricValues(rows: readonly BalanceRow[], metric: keyof BalanceValues): number[] {
  const byId = new Map(rows.map(row => [row.id, row]));
  return rows.filter(({ id, spec }) => {
    const peer = spec.balancePeerOf ? byId.get(spec.balancePeerOf) : null;
    return !peer || peer.id === id || peer.spec.balancePeerOf || balanceValues(spec)[metric] !== balanceValues(peer.spec)[metric];
  }).map(({ spec }) => balanceValues(spec)[metric]);
}

function outlierDirection(ratio: number): FleetBalanceOutlier['direction'] | null {
  if (ratio < 0.65) return 'low';
  if (ratio > 1.55) return 'high';
  return null;
}

function appendGroupOutliers(
  outliers: FleetBalanceOutlier[],
  group: string,
  rows: readonly BalanceRow[],
): void {
  const samples = Object.fromEntries(BALANCE_METRICS.map(metric => [metric, independentMetricValues(rows, metric)])) as Record<keyof BalanceValues, number[]>;
  const medians = Object.fromEntries(BALANCE_METRICS.map(metric => [metric, median(samples[metric])])) as BalanceValues;
  for (const { id, spec } of rows) {
    const values = balanceValues(spec);
    for (const metric of BALANCE_METRICS) {
      if (samples[metric].length < 4) continue;
      const ratio = values[metric] / Math.max(1, medians[metric]);
      const direction = outlierDirection(ratio);
      if (!direction) continue;
      outliers.push({
        id, group, metric, direction,
        value: values[metric], median: medians[metric], ratio,
      });
    }
  }
}

/**
 * Detect severe floor and ceiling drift among real peers. Small groups are
 * left to explicit family and simulated-matchup tests because a two-vehicle
 * role is not a useful median.
 */
export function auditFleetBalance(
  ids: readonly string[],
  specs: TankSpecRegistry,
  tierOf: (id: string) => number,
): FleetBalanceOutlier[] {
  const outliers: FleetBalanceOutlier[] = [];
  for (const [group, rows] of groupFleetBalanceRows(ids, specs, tierOf)) {
    appendGroupOutliers(outliers, group, rows);
  }
  return outliers.sort((a, b) => a.id.localeCompare(b.id) || a.metric.localeCompare(b.metric));
}
