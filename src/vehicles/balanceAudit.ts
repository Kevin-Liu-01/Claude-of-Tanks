import type { FleetTankSpec, TankSpecRegistry } from './specContracts.ts';

export const FLEET_BALANCE_REVISION = Object.freeze({
  challenger1_mk2: 'promote the protected late-Cold-War rifled-gun MBT to a complete Tier IX profile',
  kv2: 'reduce the 152 mm derp profile friction while preserving its slow handling identity',
  t62_1975: 'raise the early Cold War baseline without erasing its handling limits',
  type59: 'bring the light Cold War MBT above the stale damage-output floor',
  pt91m: 'bring the modern Tier VIII fire-control package up to its peers',
  t90_1992: 'replace the stale Tier IX donor envelope used by the Tier X production tank',
  t90ms_2011: 'give the export demonstrator a distinct Tier X protection/firepower step',
  t90a_burlak_proto: 'price the bustle autoloader as a faster Tier X feed system',
  leclerc_s2: 'improve the Tier IX ready-rack cycle while retaining burst downtime',
  leclerc_sxxi: 'add a real Tier X ammunition, protection and ready-rack step',
  leclerc_s1: 'make headline reload match its magazine and establish assault-branch output',
  t72m1_jaguar: 'remove the modern Tier VIII HP/reload trough',
  pt91a_twardy: 'improve the Tier IX Polish protection and feed-system step',
  pl01: 'price the three-round low-profile autoloader for Tier X sustained combat',
  pl01_105: 'price the four-round 105 mm branch for Tier X sustained combat',
  m1a3: 'remove the next-generation autoloader, protection and missile ceiling',
  challenger3_proto: 'restore the base Challenger 3 firepower and mobility envelope',
  challenger3: 'retain a measured protection and fire-control step over the base vehicle',
  chieftain_mk9: 'restore the late Chieftain as a competitive protected Tier VIII MBT',
  centurion5_2: 'remove the Tier VIII Centurion survivability and mobility trough',
  fv4034: 'trim the UK Tier VIII peer ceiling while retaining its protected identity',
  xk2_black_panther: 'trade excess paper DPM for realized frontal protection and ammunition',
  k2b: 'establish a real Tier X protection and ammunition step over K2',
  t90m_proryv: 'separate the Tier X Proryv from its Tier IX T-90M donor',
  merkava1b: 'remove the Tier VII armor and penetration ceiling',
  spz_puma: 'balance the Tier VIII cannon and protection package against its peers',
  bmp3_rok: 'restore a complete Tier VIII cannon, missile and protection package',
  spz_wotan: 'remove the Tier X autocannon ceiling while retaining anti-armor utility',
  bmpt_t90: 'normalize guided-weapon cadence against other Tier X IFVs (load stays eight: one Ataka per tube, owner 2026-09-18)',
  leo2a4m: 'trim the enhanced Leopard package to the Strv 122 peer envelope',
  leo2a4: 'exchange excess stationary protection for its intended mobile Tier IX identity',
  leo2a4m_can: 'replace a Tier VIII penetration holdover and realize Tier IX protection',
  m48a5_patton: 'restore the M48 baseline so M60 upgrades are meaningful rather than mandatory',
  m60a1: 'establish a mobile M60 sidegrade beneath the M60A3 fire-control package',
  m60a3: 'support the heavier fire-control variant with adequate engine output',
  m60a2: 'normalize the Shillelagh burst cycle and ammunition reserve',
  t80: 'make the base T-80 a mobile sidegrade instead of a strict T-80U downgrade',
  t80b: 'make the T-80B the mobile alternative to the protected T-80BV',
  type90_kyumaru: 'make the base Type 90 the mobility alternative to the protected Type 90A',
  t90a_2004: 'give the base T-90A handling value beside the faster Vladimir package',
  m1a1: 'make the base M1A1 the mobile alternative to the protected HA package',
  amx30: 'restore the AMX-30 mobility and fire-control sidegrade',
  fv510_milan: 'restore Tier IX cannon output without erasing its missile identity',
  warrior_tes_h: 'establish the Tier X Warrior TES(H) survivability and cannon envelope (TES(H) add-on armour; owner ruling 2026-10-12: new Warrior type at tier 10)',
  ua_m2a3_bradley: 'restore the Ukrainian Bradley cannon, mobility and survivability envelope',
  raiju_ifv: 'close the next-generation IFV anti-armor and protection gap',
  type10b: 'bring exceptional sustained output back inside the next-generation ceiling',
  object148_proto: 'bring next-generation fire control above the severe peer floor',
  t64bv1: 'modernize the Tier VIII fire-control floor without erasing Soviet handling',
  t72b3m_2022: 'modernize the Tier IX fire-control floor without erasing Soviet handling',
  t64bv_donbas: 'modernize the Ukrainian Tier VIII fire-control floor without erasing Soviet handling',
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
