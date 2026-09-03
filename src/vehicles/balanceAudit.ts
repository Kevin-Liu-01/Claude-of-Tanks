import type { FleetTankSpec, TankSpecRegistry } from './specContracts.ts';

export const FLEET_BALANCE_REVISION = Object.freeze({
  challenger1: 'promote the protected late-Cold-War rifled-gun MBT to a complete Tier IX profile',
  kv2: 'reduce the 152 mm derp profile friction while preserving its slow handling identity',
  m26_pershing: 'replace inherited 76 mm ammunition and restore Tier VIII medium output',
  m45_patton: 'replace inherited 76 mm ammunition and restore 105 mm assault output',
  is7: 'restore Tier X breakthrough survivability, penetration and gun cycle',
  object279: 'restore Tier X breakthrough survivability, penetration and gun cycle',
  t62mv1: 'raise the early Cold War baseline without erasing its handling limits',
  type59: 'bring the light Cold War MBT above the stale damage-output floor',
  pt91m: 'bring the modern Tier VIII fire-control package up to its peers',
  t90: 'replace the stale Tier IX donor envelope used by the Tier X production tank',
  t90ms: 'give the export demonstrator a distinct Tier X protection/firepower step',
  t90a_burlak: 'price the bustle autoloader as a faster Tier X feed system',
  leclerc: 'improve the Tier IX ready-rack cycle while retaining burst downtime',
  leclerc_xlr: 'add a real Tier X ammunition, protection and ready-rack step',
  amx56: 'make headline reload match its magazine and establish assault-branch output',
  t72m1_jaguar: 'remove the modern Tier VIII HP/reload trough',
  pt91_twardy: 'improve the Tier IX Polish protection and feed-system step',
  pl01: 'price the three-round low-profile autoloader for Tier X sustained combat',
  pl01_105: 'price the four-round 105 mm branch for Tier X sustained combat',
  m1a3: 'remove the next-generation autoloader, protection and missile ceiling',
  challenger_3: 'restore the base Challenger 3 firepower and mobility envelope',
  challenger_3x: 'retain a measured protection and fire-control step over the base vehicle',
  chieftain_mk10: 'restore the late Chieftain as a competitive protected Tier VIII MBT',
  centurion5: 'remove the Tier VIII Centurion survivability and mobility trough',
  fv4034: 'trim the UK Tier VIII peer ceiling while retaining its protected identity',
  k2: 'trade excess paper DPM for realized frontal protection and ammunition',
  k2b: 'establish a real Tier X protection and ammunition step over K2',
  t90m_proryv: 'separate the Tier X Proryv from its Tier IX T-90M donor',
  merkava1b: 'remove the Tier VII armor and penetration ceiling',
  spz_puma: 'balance the Tier VIII cannon and protection package against its peers',
  bmp3_rok: 'restore a complete Tier VIII cannon, missile and protection package',
  spz_puma_s1: 'remove the Tier X autocannon ceiling while retaining anti-armor utility',
  bmpt_t90: 'normalize guided-weapon cadence against other Tier X IFVs',
  leo2a5_a5nl: 'trim the enhanced Leopard package to the Strv 122 peer envelope',
  leo2a6: 'exchange excess stationary protection for its intended mobile Tier IX identity',
  leo2a4m: 'replace a Tier VIII penetration holdover and realize Tier IX protection',
  m48: 'restore the M48 baseline so M60 upgrades are meaningful rather than mandatory',
  m60a1: 'establish a mobile M60 sidegrade beneath the M60A3 fire-control package',
  m60a3: 'support the heavier fire-control variant with adequate engine output',
  m60a2: 'normalize the Shillelagh burst cycle and ammunition reserve',
  t80: 'make the base T-80 a mobile sidegrade instead of a strict T-80U downgrade',
  t80b: 'make the T-80B the mobile alternative to the protected T-80BV',
  type90: 'make the base Type 90 the mobility alternative to the protected Type 90A',
  t90a: 'give the base T-90A handling value beside the faster Vladimir package',
  m1a1: 'make the base M1A1 the mobile alternative to the protected HA package',
  amx30: 'restore the AMX-30 mobility and fire-control sidegrade',
  fv510_milan: 'restore Tier IX cannon output without erasing its missile identity',
  ua_m2a3_bradley: 'restore the Ukrainian Bradley cannon, mobility and survivability envelope',
  type89_light_tiger: 'close the next-generation IFV anti-armor and protection gap',
  type10b: 'bring exceptional sustained output back inside the next-generation ceiling',
  t14: 'bring next-generation fire control above the severe peer floor',
  t64bv1: 'modernize the Tier VIII fire-control floor without erasing Soviet handling',
  t72b3m: 'modernize the Tier IX fire-control floor without erasing Soviet handling',
  ua_t64bv: 'modernize the Ukrainian Tier VIII fire-control floor without erasing Soviet handling',
} as const);

export interface FleetBalanceOutlier {
  id: string;
  group: string;
  metric: 'hp' | 'dpm' | 'penetration' | 'powerWeight' | 'fireControl';
  direction: 'low' | 'high';
  value: number;
  median: number;
  ratio: number;
}

export function sustainedPrimaryDpm(spec: FleetTankSpec): number {
  const round = spec.gun.shells[0];
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
  const groups = new Map<string, Array<{ id: string; spec: FleetTankSpec }>>();
  for (const id of ids) {
    const spec = specs[id];
    if (!spec) continue;
    const key = `${spec.era}/${tierOf(id)}/${spec.role}`;
    const group = groups.get(key) || [];
    group.push({ id, spec });
    groups.set(key, group);
  }

  const outliers: FleetBalanceOutlier[] = [];
  for (const [group, rows] of groups) {
    if (rows.length < 4) continue;
    const medians = {
      hp: median(rows.map(({ spec }) => spec.hp)),
      dpm: median(rows.map(({ spec }) => sustainedPrimaryDpm(spec))),
      penetration: median(rows.map(({ spec }) => spec.gun.shells[0].pen100Mm)),
      powerWeight: median(rows.map(({ spec }) => spec.enginePowerHp / spec.weightTons)),
      fireControl: median(rows.map(({ spec }) =>
        1 / (spec.gun.baseAccuracy * spec.gun.aimTimeS))),
    };
    for (const { id, spec } of rows) {
      const values = {
        hp: spec.hp,
        dpm: sustainedPrimaryDpm(spec),
        penetration: spec.gun.shells[0].pen100Mm,
        powerWeight: spec.enginePowerHp / spec.weightTons,
        fireControl: 1 / (spec.gun.baseAccuracy * spec.gun.aimTimeS),
      };
      for (const metric of [
        'hp', 'dpm', 'penetration', 'powerWeight', 'fireControl',
      ] as const) {
        const ratio = values[metric] / Math.max(1, medians[metric]);
        const direction = ratio < 0.65 ? 'low' : ratio > 1.55 ? 'high' : null;
        if (!direction) continue;
        outliers.push({
          id, group, metric, direction,
          value: values[metric], median: medians[metric], ratio,
        });
      }
    }
  }
  return outliers.sort((a, b) => a.id.localeCompare(b.id) || a.metric.localeCompare(b.metric));
}
