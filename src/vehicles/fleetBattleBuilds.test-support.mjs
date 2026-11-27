// The battle fleet pass (roster-errors-279, 2026-11-26): every roster id built the way a battle builds it, on the
// runtime's lazy path (fleetFactory: ensureTankBuilders, then the stepped createTankSteps the battle streamer drains),
// with the battle roster's own options (fleetFactory battleBuildOptions and battleStaticDrawMerge) for each role a
// battle builds: the desktop player's own tank, a desktop bot and a phone's tank. A builder that throws, or logs
// console.error or console.warn while it loads or builds, is a finding. The roster's fallback (rosterVisualFallback.ts)
// keeps such a tank out of sight in a battle (it draws the donor or the first participant's tank and logs), so no
// other gate saw these builds: the fleet passes build the receipt options (proceduralOnly, unbatched), not these.
//
// Pure over the fleet it is given: src/vehicles/fleetBattleBuilds.selftest.mjs passes the real fleetFactory (manual
// `fleet` suite), fleetBattleBuildsHarness.selftest.mjs a scripted one with planted errors (default tier).

/** The roles a battle builds (rosterState textureQualityFor and buildRosterVisual; battlePresentation seatVisualOptions). */
export const BATTLE_BUILD_ROLES = Object.freeze([
  Object.freeze({ role: 'player', quality: 'preview', playerActor: true, deviceTier: 'desktop' }),
  Object.freeze({ role: 'bot', quality: 'ai', playerActor: false, deviceTier: 'desktop' }),
  Object.freeze({ role: 'phone', quality: 'ai', playerActor: false, deviceTier: 'mobile' }),
]);

const CAMO_SEED = 4242;
const text = (args) => args.map((arg) => (arg instanceof Error ? arg.message : String(arg))).join(' ');

/**
 * Build `ids` at every role and return the findings, one per throw or logged line: { id, role, kind, message }, where
 * role is 'load' for the builder's ensure. console.error and console.warn are captured (not printed) for the whole
 * pass and restored after it, so a line logged by a later microtask of a build is still charged to that build.
 * `onBuilt(id)` runs after an id's last role (the sweep's progress).
 */
export async function battleBuildFindings({ fleet, ids, roles = BATTLE_BUILD_ROLES, onBuilt = () => {}, target = console }) {
  const findings = [];
  let current = { id: null, role: null };
  const record = (kind, message) => findings.push({ id: current.id, role: current.role, kind, message });
  const original = { error: target.error, warn: target.warn };
  target.error = (...args) => record('console.error', text(args));
  target.warn = (...args) => record('console.warn', text(args));
  try {
    for (const id of ids) {
      current = { id, role: 'load' };
      let loaded = true;
      try { await fleet.ensureTankBuilders([id]); } catch (error) { loaded = false; record('throw', text([error])); }
      if (loaded) {
        for (const { role, quality, playerActor, deviceTier } of roles) {
          current = { id, role };
          let visual = null;
          try {
            const steps = fleet.createTankSteps(id, null, {
              camoSeed: CAMO_SEED, quality, ...fleet.battleBuildOptions(playerActor, deviceTier),
              staticDrawMerge: fleet.battleStaticDrawMerge(id),
            });
            let step = steps.next();
            while (!step.done) step = steps.next();
            visual = step.value;
            // builders that rewrite their merged meshes in a microtask (kf51_evo, kf51_u, the PT-91M) run before disposal
            await Promise.resolve();
          } catch (error) {
            record('throw', text([error]));
          } finally {
            visual?.dispose?.();
          }
        }
      }
      onBuilt(id);
    }
  } finally {
    target.error = original.error;
    target.warn = original.warn;
  }
  return findings;
}

/** One line per finding, for the receipt's failure. */
export function formatBattleBuildFindings(findings) {
  return findings.map(({ id, role, kind, message }) => `  ${id} (${role}) ${kind}: ${message}`).join('\n');
}
