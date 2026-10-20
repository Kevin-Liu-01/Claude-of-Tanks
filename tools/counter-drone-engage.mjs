#!/usr/bin/env node
// Counter-drone engagements per vehicle on the real network authority (VH.15; 227 guards, 2026-10-16): the entry point
// for roof-station work (the 227 turret round's Zubr / Zubr II auto MG stations and Qilin / Kunlun MG emplacements).
//
//   node --max-old-space-size=4096 tools/counter-drone-engage.mjs --ids=t72b3_zubr,t72b3_zubr_ii,t72b3_qilin,t72b3m_kunlun
//        [--set=watch227|pair|reference,...] [--runs=20] [--seed0=1] [--approaches=direct_front,direct_side,direct_rear,dive]
//        [--check] [--json=FILE]
//
// An id joined with '+' (t90a_2004+t90a_2004) is a group: the first tank is attacked, its mates park 12-25 m round it.
// Per id, in this order (src/sim/counterDroneEngagement.test-support.mjs runs everything inside createAuthoritativeMatch):
//   stations   each roof station's calibre, counter-drone range, capped share and burst, and the world elevation its
//              barrel reaches at full elevation on every bearing (an unevenly scaled mount reaches another angle than its
//              profile's elevationRad, and a drone above it is safe from that station)
//   hover      a drone hovering about 33 m off the bow, side and rear: the rounds each station fired before it fell and
//              the seconds from the first round, against the rule's count (AERIAL_RULES.drone.hitsToDown over the capped
//              share). A station that never fires, or a count off the rule, names a station that cannot answer a drone
//              there (elevation, an interlock, a missing station)
//   attack     `--runs` seeded FPV attack runs per approach (a pilot holding the crosshair on the hull, launched 300-420 m
//              out): downed by the stations, struck the tank, or neither, with a 95 % interval, and the runs each station
//              fired in; the owner's band for the vehicle's station class (COUNTER_DRONE_BANDS) beside it
// --set adds named id sets (COUNTER_DRONE_SETS): watch227 (the Zubr, Zubr II, Qilin and Kunlun the 227 turret round
// re-arms), pair (the 30 mm + 7.62 one-roof Leopard 2A7V / 2A5 / Revolution and Leclerc XLR) and reference (the band
// anchors: lone 7.62 m1a1, lone 12.7 t90a_2004, lone 30 mm t72b3m_hetman, the leo2a7v pair, the 12.7 + 7.62
// m1a1_abrams_hc). --check exits 1 when a hover leaves the drone flying, a lone station's hover count is off the rule,
// or a level-run tally leaves its class's band. Changed-only: name the ids whose stations changed; nothing here builds
// geometry (the authority reads specs: about 3 s to load, then roughly 0.1 s a run).
import { writeFileSync } from 'node:fs';
import {
  COUNTER_DRONE_APPROACHES, COUNTER_DRONE_BANDS, COUNTER_DRONE_SETS, LEVEL_APPROACHES, counterDroneCell, hoverCounterDrone,
  hoverRuleRounds, prepareCounterDrone, roofStations, stationClass,
} from '../src/sim/counterDroneEngagement.test-support.mjs';

const arg = (name, fallback = null) => { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : fallback; };
const flag = (name) => process.argv.includes(`--${name}`);
const ids = (arg('ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
for (const set of (arg('set') ?? '').split(',').filter(Boolean)) {
  if (!COUNTER_DRONE_SETS[set]) { console.error(`unknown set ${set} (${Object.keys(COUNTER_DRONE_SETS).join(', ')})`); process.exit(2); }
  for (const id of COUNTER_DRONE_SETS[set]) if (!ids.includes(id)) ids.push(id);
}
if (!ids.length) { console.error('usage: counter-drone-engage.mjs --ids=a,b | --set=watch227,pair,reference [--runs=20] [--seed0=1] [--approaches=...] [--check] [--json=FILE]'); process.exit(2); }
const runs = Number(arg('runs', '20')), seed0 = Number(arg('seed0', '1'));
const approaches = (arg('approaches') ?? LEVEL_APPROACHES.join(',')).split(',');
for (const a of approaches) if (!COUNTER_DRONE_APPROACHES[a]) { console.error(`unknown approach ${a}`); process.exit(2); }
if (!Number.isInteger(runs) || runs < 1) { console.error('--runs must be a positive integer'); process.exit(2); }

const t0 = performance.now();
await prepareCounterDrone(ids.flatMap((id) => id.split('+')));
const report = { runs, seed0, approaches, vehicles: {} };
let failures = 0;
const pct = (x) => Number.isFinite(x) ? x.toFixed(1) : '-';
for (const id of ids) {
  // an id joined with '+' is a group: the first tank is attacked, the rest park 12-25 m round it (their stations join in)
  const group = id.split('+');
  const perTank = group.map((specId) => roofStations(specId)), stations = perTank.flat();
  // the bands are one roof's; a group of tanks is reported without one
  const cls = group.length > 1 ? `group of ${group.length}` : stationClass(stations), band = COUNTER_DRONE_BANDS[cls] ?? null;
  console.log(`\n${id}  (${cls}${band ? `; level-run band ${band.downedPct[0]}-${band.downedPct[1]} % downed` : ''})`);
  if (!stations.length) { console.log('  no roof station: nothing engages a drone'); report.vehicles[id] = { stations, cls }; continue; }
  for (const s of stations) {
    console.log(`  station ${s.name}: ${s.caliberMm} mm, counter-drone ${s.counterDroneRangeM} m, capped share ${s.droneHitMax} x ${s.burstRounds}-round bursts, ` +
      `world elevation reach ${s.elevationReachDeg.toFixed(1)} deg${s.elevationReachDeg < s.profileElevationDeg - .5 ? ` (profile ${s.profileElevationDeg.toFixed(1)}: the mount's scale costs ${(s.profileElevationDeg - s.elevationReachDeg).toFixed(1)})` : ''}`);
  }
  const rule = hoverRuleRounds(stations), hovers = [];
  if (group.length === 1) for (const bearingDeg of [0, 90, 180, -90]) {
    const h = { bearingDeg, ...hoverCounterDrone({ specId: id, bearingDeg }) };
    const off = stations.length === 1 && h.totalRounds !== rule[0];
    const silent = h.rounds.map((n, k) => n === 0 ? stations[k].name : null).filter(Boolean);
    const verdict = h.downAt === null ? 'NOT DOWNED' : off ? `OFF THE RULE (${rule[0]})` : silent.length ? `silent: ${silent.join(', ')}` : 'ok';
    if (h.downAt === null || off) failures++;
    console.log(`  hover ${String(h.bearingDeg).padStart(4)} deg at ${pct(h.rangeM)} m: rounds ${JSON.stringify(h.rounds)} down ${h.downedS === null ? '-' : `${h.downedS.toFixed(2)} s`} after the first round, ` +
      `${h.insideFirstBurst ? 'inside' : 'after'} the first burst: ${verdict}`);
    hovers.push(h);
  }
  const cell = counterDroneCell({ specIds: group, approaches, runs, seed0 });
  const fired = perTank.flatMap((tank, t) => tank.map((_, k) => cell.rows.filter((r) => r.rounds[t][k] > 0).length));
  console.log(`  attack (${approaches.join(', ')}; ${runs} seeds from ${seed0}): downed ${cell.downed}/${cell.n} = ${pct(cell.downedPct)} % ` +
    `[95 % ${pct(cell.downedCI[0])}-${pct(cell.downedCI[1])}], strike ${cell.strike}, other ${cell.other}; station fired in ${JSON.stringify(fired)} of ${cell.n} runs`);
  const level = approaches.every((a) => LEVEL_APPROACHES.includes(a));
  if (band && level) {
    const inside = cell.downedPct >= band.downedPct[0] && cell.downedPct <= band.downedPct[1];
    if (!inside) failures++;
    console.log(`  band ${band.downedPct[0]}-${band.downedPct[1]} % (${band.why}): ${inside ? 'inside' : 'OUTSIDE'}`);
  }
  report.vehicles[id] = { cls, stations, rule, hovers, attack: { n: cell.n, downed: cell.downed, strike: cell.strike, other: cell.other,
    downedPct: cell.downedPct, downedCI: cell.downedCI, stationFiredRuns: fired, rows: cell.rows } };
}
console.log(`\n${ids.length} vehicles in ${((performance.now() - t0) / 1000).toFixed(1)} s${flag('check') ? `; ${failures} check failure(s)` : ''}`);
const json = arg('json');
if (json) { writeFileSync(json, JSON.stringify(report, null, 1)); console.log(`wrote ${json}`); }
if (flag('check') && failures) process.exit(1);
