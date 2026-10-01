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
//     re-destroys none of them and no seat hears a ghost crunch;
//   - no shell impact, hit, destruction, ram or crash a seat received goes missing, doubles, or lands > 0.5 m from the
//     authority's position.
// Shorter windows than the tool's defaults (8 s of play, 4 s after each scenario; ≈ 45 s wall).
import assert from 'node:assert/strict';
import { formatMatrix, runWorldEventsAudit } from './mp-world-events-audit.mjs';

const report = await runWorldEventsAudit({ playMs: 8000, afterMs: 4000 });
const text = formatMatrix(report);
if (!report.pass) { console.log(text); assert.fail(`the audit did not complete: ${report.failures.join('; ')}`); }
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

check(report.steps.live.hostCrushes >= 3, `the live window produced ${report.steps.live.hostCrushes} crushes on the host (needs a few to judge)`);
for (const row of report.matrix) {
  if (row.sent === 0) continue;
  const view = `${row.peer}#${row.round} ${row.kind}`;
  check(row.missing === 0, `${view}: ${row.missing} of ${row.sent} never presented`);
  check(row.duplicate === 0, `${view}: ${row.duplicate} presented twice`);
  check(row.wrongPlace === 0, `${view}: ${row.wrongPlace} presented > 0.5 m from the authority's position`);
  // the budget's deadline bounds a beat to four ticks past its tick; a slow frame of the single-process presenter can add two
  check(row.late <= 2, `${view}: ${row.late} presented more than two snapshot intervals after their tick`);
  if (row.kind === 'world_prop_destroyed') {
    // a fall whose event a link reset swallowed lands settled from the list: never animated, never early, never a crunch
    check(row.viaFrame === row.settled, `${view}: ${row.viaFrame - row.settled} props felled by the destroyed list with an animation`);
    check(row.settled <= 2, `${view}: ${row.settled} props laid down settled during live play (lost events at a reset are the only expected source)`);
    check(row.early === 0, `${view}: ${row.early} props fell before the presented tick reached their event`);
    check(row.fxWithoutCrush === 0, `${view}: ${row.fxWithoutCrush} crunches for props that had already fallen`);
  }
}
for (const [view, row] of Object.entries(report.perPeer)) {
  check(row.ghostFx === 0, `${view}: ${row.ghostFx} prop:crushed effects for nothing this view received`);
  check(row.replaysAnimated === 0, `${view}: ${row.replaysAnimated} falls that predate this view were animated (settled expected)`);
}
const { rejoin, migration, return: returned } = report.steps;
check(rejoin.replayedAnimated === 0 && rejoin.replayedSettled === rejoin.replayedOnJoin, `rejoin: ${rejoin.replayedAnimated} of ${rejoin.replayedOnJoin} earlier falls animated on the fresh presentation`);
check(rejoin.fxOnJoin === 0, `rejoin: ${rejoin.fxOnJoin} crunches for props that fell before the view began`);
// the elected seat boots from the sealed keyframe overlaid with its own newest frame: every destroyed prop it knew of is restored,
// at the revision it knew (what fell inside the last in-flight snapshot before the host died is the one bounded loss)
check(migration.restored === migration.knownByElectedAtClose, `migration: ${migration.restored} destroyed props restored on the new host, the elected seat knew ${migration.knownByElectedAtClose} (the old host had ${migration.destroyedOld})`);
check(migration.revisionNewAtBoot === migration.knownRevisionAtClose && migration.revisionNewAtBoot >= migration.restored, `migration: the new host's revision ${migration.revisionNewAtBoot} is not the elected seat's ${migration.knownRevisionAtClose} (the old host's ${migration.revisionOld})`);
check(migration.inventedOnMigration === 0, `migration: ${migration.inventedOnMigration} props destroyed on the new host that the old host never destroyed`);
check(migration.recrushEvents === 0, `migration: ${migration.recrushEvents} props re-destroyed on the new host`);
check(migration.ghostFxP2 === 0 && migration.ghostFxP3 === 0, `migration: ghost crunches p2 ${migration.ghostFxP2}, p3 ${migration.ghostFxP3}`);
check(returned.replayedAnimated === 0, `return: ${returned.replayedAnimated} of ${returned.replayedOnJoin} earlier falls animated for the returning seat`);
check(report.steps.reconnect.outageMs < 5000, `reconnect: ${report.steps.reconnect.outageMs} ms to be welcomed again`);

if (failures.length) {
  console.log(text);
  assert.fail(`world events audit: ${failures.length} finding(s)\n  ${failures.join('\n  ')}`);
}
const crushRows = report.matrix.filter((row) => row.kind === 'world_prop_destroyed' && row.sent > 0);
console.log(`mp world events audit: ${report.steps.live.hostCrushes} live crushes, ${crushRows.reduce((sum, row) => sum + row.viaEvent, 0)} prop falls over ${crushRows.length} views all through their events (Δticks p50 ${crushRows.map((row) => row.dTicks.p50).join('/')}), rejoin ${rejoin.replayedSettled}/${rejoin.replayedOnJoin} earlier falls settled, migration ${migration.restored}/${migration.destroyedOld} destroyed props restored at revision ${migration.revisionNewAtBoot} with ${migration.recrushEvents} re-destroyed, return ${returned.replayedSettled}/${returned.replayedOnJoin} settled, ${report.hostEvents} deliveries judged in ${report.wallMs} ms`);
