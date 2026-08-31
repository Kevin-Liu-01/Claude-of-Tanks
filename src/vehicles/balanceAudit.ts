import type { FleetTankSpec, TankSpecRegistry } from './specContracts.ts';

export const FLEET_BALANCE_REVISION = Object.freeze({
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
} as const);

export interface FleetBalanceOutlier {
  id: string;
  group: string;
  metric: 'hp' | 'dpm' | 'penetration';
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
 * Detect severe underpowered drift among real peers. Small groups are left to
 * explicit family tests because a two-vehicle role is not a useful median.
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
    };
    for (const { id, spec } of rows) {
      const values = {
        hp: spec.hp,
        dpm: sustainedPrimaryDpm(spec),
        penetration: spec.gun.shells[0].pen100Mm,
      };
      for (const metric of ['hp', 'dpm', 'penetration'] as const) {
        const ratio = values[metric] / Math.max(1, medians[metric]);
        if (ratio >= 0.72) continue;
        outliers.push({
          id, group, metric, value: values[metric], median: medians[metric], ratio,
        });
      }
    }
  }
  return outliers.sort((a, b) => a.id.localeCompare(b.id) || a.metric.localeCompare(b.metric));
}
