// The world-events audit as a receipt (lane mp/world-state-audit, 2026-10-01): three headless seats and a bot fill on
// verdant's collision shard, the real battle presentation (renderer stubbed) on every seat, the authority's per-viewer
// event deliveries hooked — live play, p3's Garage return and rejoin, p2's link reconnect, the host's tab closing with
// p2 elected and resuming from the sealed keyframe, p1 back as a peer. What it holds:
//   - every world_prop_destroyed a seat received fells its prop through the EVENT (the authority's direction and speed,
//     at or after the presented tick), never through the per-frame destroyed list first (which felled every tree early,
//     toward +Z, at speed 0 before this lane);
//   - a seat whose view begins on a running match (the rejoin, the return after the migration) lays every earlier fall
//     down settled — final pose, no animation, no sound — and animates none of them;
//   - the elected host resumes with the old host's destroyed props felled in its own world and its revision continued,
//     re-destroys none of them and no seat hears a ghost crunch. What the elected seat knew is read independently of its
//     boot: the newer of the sealed keyframe and its newest frame, plus every fall the old host sent it (2026-10-02,
//     fix/mp-migration-props: a fall whose frame the dying host never published stood again on the new host, a bot
//     crushed it a second time and p2 and p3 crunched it — 1 run in 3; and the old check compared the boot with the
//     newest frame alone, failing a boot that rightly used a newer keyframe);
//   - no shell impact, hit, destruction, ram or crash a seat received goes missing, doubles, or lands > 0.5 m from the
//     authority's position;
//   - (ghost-crunch lane, 2026-10-02) every crunch names the obstacle it fells, and a scripted bot driven into a hedgehog
//     whose crossed beams share one box centre fells it with exactly one event — the three "ghost" crunches of 2026-10-02
//     were that crunch read back from its position as the sibling beam; a scripted bot falling to its death beside a
//     crushable tree is presented where its hull died (within 1 cm) on every view — not mid-air, 0.3–0.8 m off;
//   - (destruction, 2026-10-07) a scripted bot rammed at 14 m/s into a verdant house brings it down; every structure_stage
//     a seat received is presented once at the authority's point, a stage older than a view lands settled, nothing stages
//     that the host never sent, and the new host after the migration never re-sends a stage the old host sent.
// Shorter windows than the tool's defaults (8 s of play, 4 s after each scenario; ≈ 45 s wall).
import assert from 'node:assert/strict';
import { formatMatrix, runWorldEventsAudit } from './mp-world-events-audit.mjs';
import { matchRulesetFor } from '../src/sim/matchRuleset.ts';

const report = await runWorldEventsAudit({ playMs: 8000, afterMs: 4000 });
const text = formatMatrix(report);
if (!report.pass) { console.log(text); assert.fail(`the audit did not complete: ${report.failures.join('; ')}`); }
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
// Timing judgments (a beat presented late, a slow re-welcome) need a harness that kept its frame cadence: the host, the
// seats and the transport share one process, so on a starved machine (event-loop delay p99 over 50 ms) a late beat is
// the harness's own. They are reported, not failed, then; every correctness judgment below always applies.
// (2026-10-02: one late finding in 1 of 3 runs under machine load; clean when run alone.)
const starved = (report.loopDelay?.p99Ms ?? 0) > 50;
const timingSkipped = [];
const timing = (condition, message) => { if (!condition) (starved ? timingSkipped : failures).push(message); };

check(report.steps.live.hostCrushes >= 3, `the live window produced ${report.steps.live.hostCrushes} crushes on the host (needs a few to judge)`);
for (const row of report.matrix) {
  if (row.sent === 0) continue;
  const view = `${row.peer}#${row.round} ${row.kind}`;
  check(row.missing === 0, `${view}: ${row.missing} of ${row.sent} never presented`);
  check(row.duplicate === 0, `${view}: ${row.duplicate} presented twice`);
  check(row.wrongPlace === 0, `${view}: ${row.wrongPlace} presented > 0.5 m from the authority's position`);
  // the budget's deadline bounds a beat to four ticks past its tick; a slow frame of the single-process presenter can add two
  timing(row.late <= 2, `${view}: ${row.late} presented more than two snapshot intervals after their tick`);
  if (row.kind === 'world_prop_destroyed') {
    // a fall whose event a link reset swallowed lands settled from the list: never animated, never early, never a crunch
    check(row.viaFrame === row.settled, `${view}: ${row.viaFrame - row.settled} props felled by the destroyed list with an animation`);
    check(row.settled <= 2, `${view}: ${row.settled} props laid down settled during live play (lost events at a reset are the only expected source)`);
    check(row.early === 0, `${view}: ${row.early} props fell before the presented tick reached their event`);
    check(row.fxWithoutCrush === 0, `${view}: ${row.fxWithoutCrush} crunches for props that had already fallen`);
  }
}
for (const [view, row] of Object.entries(report.perPeer)) {
  // destruction (2026-10-07): a stage that predates the view lands settled; nothing stages that the host never sent
  check(row.stagesOlderAnimated === 0, `${view}: ${row.stagesOlderAnimated} structure stages that predate this view were animated`);
  check(row.ghostStages === 0, `${view}: ${row.ghostStages} structure stages the host never sent`);
  // sections (P2, 2026-10-08): the same for holes and section falls (none with the switch off)
  check(row.breachesOlderAnimated === 0, `${view}: ${row.breachesOlderAnimated} breaches that predate this view were animated`);
  check(row.ghostBreaches === 0, `${view}: ${row.ghostBreaches} breaches the host never sent`);
  check(row.ghostFx === 0, `${view}: ${row.ghostFx} prop:crushed effects for nothing this view received`);
  check(row.unattributedFx === 0, `${view}: ${row.unattributedFx} prop:crushed effects name no obstacle`);
  check(row.replaysAnimated === 0, `${view}: ${row.replaysAnimated} falls that predate this view were animated (settled expected)`);
  // craters (2026-10-08, crater-render-spec §F): one stamp per crater per view; one older than the view lands settled
  check(row.cratersOlderAnimated === 0, `${view}: ${row.cratersOlderAnimated} craters that predate this view were animated`);
  check(row.ghostCraters === 0, `${view}: ${row.ghostCraters} craters the host never sent`);
  check(row.cratersTwice === 0, `${view}: ${row.cratersTwice} craters stamped twice`);
}
const { rejoin, migration, return: returned, scripted } = report.steps;
check(scripted?.hedgehog && scripted.hedgehog.events === 1, `scripted hedgehog: ${scripted?.hedgehog?.events ?? 'no'} events for one ${scripted?.hedgehog?.kind ?? 'shared-centre'} prop (one expected: its records fall together)`);
check(scripted?.fall?.died === true, `scripted fall: the bot dropped on one hit point beside a tree did not die (${JSON.stringify(scripted?.fall ?? null)})`);
check(scripted?.ram?.collapsed === true, `scripted ram: the bot driven at 14 m/s into house ${scripted?.ram?.structureId ?? '?'} did not bring it down (${JSON.stringify(scripted?.ram ?? null)})`);
check(migration.restagedEvents === 0, `migration: ${migration.restagedEvents} structure stages the old host had sent were sent again by the new host`);
check(migration.rebreachedEvents === 0, `migration: ${migration.rebreachedEvents} breaches the old host had sent were sent again by the new host`);
// craters: dug when the ruleset's switch is on (the scripted HE round into open ground), never otherwise; never re-sent after
// the migration (the new host resumed from the log)
const cratersOn = matchRulesetFor('standard').destruction.craters;
check(cratersOn ? (scripted?.crater?.dug ?? 0) >= 1 : (scripted?.crater?.dug ?? 0) === 0,
  `scripted crater: ${scripted?.crater?.dug ?? 'no'} craters dug with the switch ${cratersOn ? 'on' : 'off'} (${JSON.stringify(scripted?.crater ?? null)})`);
check(migration.recrateredEvents === 0, `migration: ${migration.recrateredEvents} craters the old host had sent were sent again by the new host`);
const fallViews = Object.entries(scripted?.fall?.presentedErrM ?? {});
check(fallViews.length > 0 && fallViews.every(([, err]) => err <= 0.01), `scripted fall: presented ${JSON.stringify(scripted?.fall?.presentedErrM ?? {})} m from the hull at its death (≤ 0.01 m on every view)`);
check(rejoin.replayedAnimated === 0 && rejoin.replayedSettled === rejoin.replayedOnJoin, `rejoin: ${rejoin.replayedAnimated} of ${rejoin.replayedOnJoin} earlier falls animated on the fresh presentation`);
check(rejoin.fxOnJoin === 0, `rejoin: ${rejoin.fxOnJoin} crunches for props that fell before the view began`);
// the elected seat boots from the newer of the sealed keyframe and its own newest frame, plus every fall it was sent: everything it
// knew is restored, nothing beyond the old host's list is invented, and the revision counts every restored fall without
// running ahead of the old host's (the base's plus one per fall known from events alone)
check(migration.knownNotRestored === 0, `migration: ${migration.knownNotRestored} of the ${migration.knownBySeat} destroyed props the elected seat knew are standing on the new host (its ${migration.bootBase} at tick ${migration.baseTick} listed ${migration.baseDestroyed}; ${migration.knownFromEventsOnly} more it had from events; the old host had ${migration.destroyedOld})`);
check(migration.revisionNewAtBoot >= migration.destroyedNewAtBoot && migration.revisionNewAtBoot >= migration.baseRevision + migration.knownFromEventsOnly && migration.revisionNewAtBoot <= migration.revisionOld,
  `migration: the new host's revision ${migration.revisionNewAtBoot} (its list ${migration.destroyedNewAtBoot}) does not count the seat's ${migration.bootBase} revision ${migration.baseRevision} plus ${migration.knownFromEventsOnly} falls from events within the old host's ${migration.revisionOld}`);
check(migration.inventedOnMigration === 0, `migration: ${migration.inventedOnMigration} props destroyed on the new host that the old host never destroyed`);
check(migration.recrushEvents === 0, `migration: ${migration.recrushEvents} props re-destroyed on the new host`);
check(migration.ghostFxP2 === 0 && migration.ghostFxP3 === 0, `migration: ghost crunches p2 ${migration.ghostFxP2}, p3 ${migration.ghostFxP3}`);
check(returned.replayedAnimated === 0, `return: ${returned.replayedAnimated} of ${returned.replayedOnJoin} earlier falls animated for the returning seat`);
timing(report.steps.reconnect.outageMs < 5000, `reconnect: ${report.steps.reconnect.outageMs} ms to be welcomed again`);
if (timingSkipped.length) {
  console.log(`world events audit: harness starved (event-loop delay p99 ${report.loopDelay.p99Ms} ms, max ${report.loopDelay.maxMs} ms); `
    + `timing findings reported, not judged:\n  ${timingSkipped.join('\n  ')}`);
}

if (failures.length) {
  console.log(text);
  assert.fail(`world events audit: ${failures.length} finding(s)\n  ${failures.join('\n  ')}`);
}
const crushRows = report.matrix.filter((row) => row.kind === 'world_prop_destroyed' && row.sent > 0);
const stageRows = report.matrix.filter((row) => row.kind === 'structure_stage' && row.sent > 0);
const breachRows = report.matrix.filter((row) => row.kind === 'structure_breach' && row.sent > 0);
const craterRows = report.matrix.filter((row) => row.kind === 'terrain_crater' && row.sent > 0);
const olderCraters = Object.values(report.perPeer).reduce((sum, row) => sum + row.cratersOlderSettled, 0);
console.log(`mp world events audit: craters ${cratersOn ? `on: ${scripted.crater?.dug ?? 0} dug by ${scripted.crater?.shell ?? '?'}, presented on ${craterRows.length} views `
  + `${craterRows.reduce((sum, row) => sum + row.applied, 0)}/${craterRows.reduce((sum, row) => sum + row.sent, 0)}, ${olderCraters} laid down settled for later views, `
  + `the new host re-sent ${migration.recrateredEvents}` : 'off (the switch): none dug'}; scripted ram brought house ${scripted.ram.structureId} down (${scripted.ram.stages.join(' > ')}; stages presented on ${stageRows.length} views, ${stageRows.reduce((sum, row) => sum + row.applied, 0)}/${stageRows.reduce((sum, row) => sum + row.sent, 0)}, the new host re-sent ${migration.restagedEvents}; breaches presented on ${breachRows.length} views, ${breachRows.reduce((sum, row) => sum + row.applied, 0)}/${breachRows.reduce((sum, row) => sum + row.sent, 0)}, re-sent ${migration.rebreachedEvents}); scripted ${scripted.hedgehog.kind} (records ${scripted.hedgehog.records.join('/')}, centre shared by ${scripted.hedgehog.sharedCenter.join('/')}) felled by ${scripted.hedgehog.events} event (${scripted.hedgehog.eventIndices.join('/')}), fall death (${scripted.fall.cause}) presented ${fallViews.map(([view, err]) => `${view} ${err} m`).join(', ')}; ${report.steps.live.hostCrushes} live crushes, ${crushRows.reduce((sum, row) => sum + row.viaEvent, 0)} prop falls over ${crushRows.length} views all through their events (Δticks p50 ${crushRows.map((row) => row.dTicks.p50).join('/')}), rejoin ${rejoin.replayedSettled}/${rejoin.replayedOnJoin} earlier falls settled, migration ${migration.restored}/${migration.destroyedOld} destroyed props restored at revision ${migration.revisionNewAtBoot} (the seat's ${migration.bootBase} plus ${migration.knownFromEventsOnly} from events) with ${migration.recrushEvents} re-destroyed, return ${returned.replayedSettled}/${returned.replayedOnJoin} settled, ${report.hostEvents} deliveries judged in ${report.wallMs} ms (harness event-loop delay p99 ${report.loopDelay?.p99Ms ?? '?'} ms)`);
