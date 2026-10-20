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
//   stations   each roof station's calibre, counter-drone range, capped share and burst, its class (COUNTER_DRONE_CLASSES:
//              the 226 numbers it must carry), and the world elevation its barrel reaches at full elevation on every
//              bearing (an unevenly scaled mount reaches another angle than its profile's elevationRad, and a drone above
//              it is safe from that station)
//   hover      a drone hovering about 33 m off the bow, side and rear, and (a lone station) about 102 m off the bow: the
//              rounds each station fired before it fell and the seconds from the first round. A lone station answers to
//              the owner's rule as literals, never to its own profile's arithmetic: at 33 m at least its class's capped
//              count (7.62: 8, 12.7: 6, 20 mm Rh 202: 4, 30 mm: 4), the 12.7's and 30 mm's first capped burst leaving
//              the drone flying, the 7.62 still downing it inside that burst; at 102 m at least one round under its class anchor's count (7.62: 46, 12.7: 39,
//              Rh 202: 26, 30 mm: 20). A station that never fires names one that cannot answer a drone there
//              (elevation, an interlock, a missing station)
//   attack     `--runs` seeded FPV attack runs per approach (a pilot holding the crosshair on the hull, launched 300-420 m
//              out): downed by the stations, struck the tank, or neither, with a 95 % interval, and the runs each station
//              fired in; the owner's band for the vehicle's station class (COUNTER_DRONE_BANDS) beside it
// --set adds named id sets (COUNTER_DRONE_SETS): watch227 (the Zubr, Zubr II, Qilin and Kunlun the 227 turret round
// re-arms), pair (the 30 mm + 7.62 one-roof Leopard 2A7V / 2A5 / Revolution and Leclerc XLR) and reference (the band
// anchors: lone 7.62 m1a1, lone 12.7 t90a_2004, lone 30 mm t72b3m_hetman, the leo2a7v pair, the 12.7 + 7.62
// m1a1_abrams_hc). --check exits 1 when a station carries no class's numbers, a hover leaves the drone flying, a lone
// station downs a hovering drone faster than the owner's rule allows, or a level-run tally leaves its class's band (the
// bands are wide enough for any hull of the class, so the hovers are what separate the 226 value from the old one).
// With --check, the ids COUNTER_DRONE_PINS pins (the lone anchors m1a1 and t90a_2004, seeds 1-8; the 30 mm + 7.62 roofs, one
// seed each) must also fly every pinned level run exactly (outcome, rounds, ticks), every station of a pinned roof must
// fire in each, a pinned roof's bow hover must match, and the lone anchors must down 4-11 of their 48 pinned runs (the
// owner's band). npm test flies the same pins (src/sim/counterDroneRuns.selftest.mjs); tank:release:check runs `--ids=<the
// pinned vehicles the release names> --check` without a capture lease.
// Changed-only: name the ids whose stations changed; nothing here builds geometry (the authority reads specs: about
// 3 s to load, then roughly 0.1 s a run).
import { writeFileSync } from 'node:fs';
import { SIM_DT } from '../src/sim/movement.ts';
import {
  COUNTER_DRONE_APPROACHES, COUNTER_DRONE_BANDS, COUNTER_DRONE_CLASSES, COUNTER_DRONE_SETS, LEVEL_APPROACHES, counterDroneCell,
  hoverCounterDrone, prepareCounterDrone, roofStations, stationClass,
  COUNTER_DRONE_PINS, pinnedRunRow,
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
const pinnedDowned = {};
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
    if (!s.droneClass) failures++;
    console.log(`  station ${s.name}: ${s.caliberMm} mm, ${s.droneClass ? `class ${s.droneClass}` : 'OFF EVERY CLASS (its counter-drone numbers are no class\'s 226 numbers: re-rule with the owner)'}, ` +
      `counter-drone ${s.counterDroneRangeM} m, share ${s.droneHitAt100} at 100 m capped at ${s.droneHitMax} x ${s.burstRounds}-round bursts, ` +
      `world elevation reach ${s.elevationReachDeg.toFixed(1)} deg${s.elevationReachDeg < s.profileElevationDeg - .5 ? ` (profile ${s.profileElevationDeg.toFixed(1)}: the mount's scale costs ${(s.profileElevationDeg - s.elevationReachDeg).toFixed(1)})` : ''}`);
  }
  // the owner's rule for a lone station, as its calibre class's literals (COUNTER_DRONE_CLASSES), never its profile's
  // arithmetic: a station re-tuned off its class (droneClass null) is still held to the rule its calibre carries
  const lone = group.length === 1 && stations.length === 1 ? COUNTER_DRONE_CLASSES[stations[0].ruleClass] ?? null : null, hovers = [];
  const report1 = (label, h, verdicts) => {
    const silent = h.rounds.map((n, k) => n === 0 ? stations[k].name : null).filter(Boolean);
    const bad = [...(h.downAt === null ? ['NOT DOWNED'] : []), ...verdicts.filter(Boolean)];
    failures += bad.length;
    console.log(`  hover ${label} at ${pct(h.rangeM)} m: rounds ${JSON.stringify(h.rounds)} down ${h.downedS === null ? '-' : `${h.downedS.toFixed(2)} s`} after the first round, ` +
      `${h.insideFirstBurst ? 'inside' : 'after'} the first burst: ${bad.length ? bad.join('; ') : silent.length ? `silent: ${silent.join(', ')}` : 'ok'}`);
  };
  const OWNER = 'owner 2026-10-16: machine guns on drones were too punishing';
  if (group.length === 1) for (const bearingDeg of [0, 90, 180, -90]) {
    const h = { bearingDeg, ...hoverCounterDrone({ specId: id, bearingDeg }) };
    report1(`${String(bearingDeg).padStart(4)} deg`, h, lone && h.downAt !== null ? [
      h.totalRounds < lone.capped && `OWNER RULE: at least ${lone.capped} capped rounds (${OWNER})`,
      lone.survivesBurst && h.insideFirstBurst && `OWNER RULE: its first capped burst leaves the drone flying (${OWNER})`,
      lone.downsInsideBurst && !h.insideFirstBurst && `OWNER RULE: a lone ${stations[0].ruleClass} station downs a hovering drone inside one capped burst`,
    ] : []);
    hovers.push(h);
  }
  if (lone) {
    const h = { bearingDeg: 0, distanceM: 100, ...hoverCounterDrone({ specId: id, distanceM: 100, seconds: 30 }) };
    report1('   0 deg', h, [h.downAt !== null && h.totalRounds < lone.at100 - 1 && `OWNER RULE: at least ${lone.at100 - 1} rounds below the cap (${OWNER}; its class anchor ${lone.anchor}: ${lone.at100})`]);
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
  // the exact pins (COUNTER_DRONE_PINS, guards 229): every pinned level run, read from this cell when it covers the
  // pinned seeds (runs are independent per approach and seed), else flown on its own; a roof's every station must fire
  // in every pinned run; the bow hover's rounds and ticks
  const pin = COUNTER_DRONE_PINS.runs[id];
  if (flag('check') && pin && group.length === 1) {
    const covered = LEVEL_APPROACHES.every((a) => approaches.includes(a)) && seed0 <= pin.seed0 && seed0 + runs >= pin.seed0 + pin.runs;
    const pinned = (covered ? cell.rows : counterDroneCell({ specIds: [id], runs: pin.runs, seed0: pin.seed0 }).rows)
      .filter((r) => LEVEL_APPROACHES.includes(r.approach) && r.seed >= pin.seed0 && r.seed < pin.seed0 + pin.runs)
      .sort((a, b) => LEVEL_APPROACHES.indexOf(a.approach) - LEVEL_APPROACHES.indexOf(b.approach) || a.seed - b.seed);
    const measured = pinned.map(pinnedRunRow), expected = pin.rows.split(' ');
    const moved = expected.map((want, k) => (measured[k] === want ? null : `${pinned[k]?.approach}:${pinned[k]?.seed} ${want} -> ${measured[k]}`)).filter(Boolean);
    const silent = stations.length > 1 ? pinned.filter((r) => r.rounds[0].some((n) => !(n > 0))).map((r) => `${r.approach}:${r.seed}`) : [];
    if (moved.length || measured.length !== expected.length) failures++;
    if (silent.length) failures++;
    pinnedDowned[id] = pinned.filter((r) => r.outcome === 'downed').length;
    console.log(`  pinned runs (seeds ${pin.seed0}-${pin.seed0 + pin.runs - 1}, front/side/rear): ${moved.length || measured.length !== expected.length
      ? `MOVED ${moved.length} of ${expected.length}: ${moved.slice(0, 6).join('; ')}${moved.length > 6 ? '; ...' : ''} (re-rule with the owner before re-pinning)`
      : `${expected.length} exact, ${pinnedDowned[id]} downed`}${silent.length ? `; a station SILENT in ${silent.join(', ')}` : ''}`);
  }
  const hoverPin = COUNTER_DRONE_PINS.hovers[id];
  if (flag('check') && hoverPin && hovers[0]) {
    const h = hovers[0], got = [h.rounds, h.downedS === null ? null : Math.round(h.downedS / SIM_DT)];
    const same = JSON.stringify(got) === JSON.stringify(hoverPin);
    if (!same) failures++;
    console.log(`  pinned bow hover: ${same ? `${JSON.stringify(got)} exact` : `MOVED ${JSON.stringify(hoverPin)} -> ${JSON.stringify(got)}`}`);
  }
  report.vehicles[id] = { cls, stations, hovers, attack: { n: cell.n, downed: cell.downed, strike: cell.strike, other: cell.other,
    downedPct: cell.downedPct, downedCI: cell.downedCI, stationFiredRuns: fired, rows: cell.rows } };
}
// the owner's band on the lone anchors' pinned runs (4-11 of 48 at hitsToDown 1.1; 1 downs 14)
const { loneBand } = COUNTER_DRONE_PINS;
if (flag('check') && loneBand.ids.every((id) => id in pinnedDowned)) {
  const downed = loneBand.ids.reduce((sum, id) => sum + pinnedDowned[id], 0);
  const inside = downed >= loneBand.downed[0] && downed <= loneBand.downed[1];
  if (!inside) failures++;
  console.log(`\nthe owner's lone machine-gun band: ${loneBand.ids.join(' + ')} down ${downed} of ${loneBand.of} pinned runs (${loneBand.downed[0]}-${loneBand.downed[1]}): ${inside ? 'inside' : 'OUTSIDE'}`);
}
console.log(`\n${ids.length} vehicles in ${((performance.now() - t0) / 1000).toFixed(1)} s${flag('check') ? `; ${failures} check failure(s)` : ''}`);
const json = arg('json');
if (json) { writeFileSync(json, JSON.stringify(report, null, 1)); console.log(`wrote ${json}`); }
if (flag('check') && failures) process.exit(1);
