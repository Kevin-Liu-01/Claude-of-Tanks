// soakRams.test-support — the bot soak's ram predicate (server/authoritativeBots.selftest.mjs), one copy for the soak and
// for soakRams.selftest, which drives it over a battle that has rams (round 3 B8, 2026-11-06). The soak's own battles
// produced no ram on any map run in rounds 2 and 3, so its ally gate and per-ram viewer check had never judged one.
//
// (round 2 U13 / Q6, 2026-11-04) The ally gate is the bots' right of way (1099cec7ec): no teammate contact at ram speed.
// Teammate contacts are reported again since 2026-11-02 audit M6 (with zero damage, sim/impact.ts resolveRamPairDamage),
// and round 1 narrowed the soak's count to damaging ones, which the ram law rules out by construction, so it could not
// fail; it counts every reported teammate ram again. Beside it, where a ram goes: its ids and midpoint place both hulls,
// so a viewer that is not a party reads one only when it sees both (canObserveRam; hiddenWorldEvents.selftest), in the
// event batch and its snapshot alike.

/**
 * A teammate's wreck has no right of way: the bots read no wreck as an ally (game/botConstruction.ts, "a wreck is
 * neither"; ai.ts scanAllyRisk skips a destroyed hull), and a hull may shove one (Delta at the soak's seed 9010 since
 * bcc6a0a77a: the CV90105 TML pushes the Carro 45t's wreck, 2 s after it died, at 6.8 m/s). A party destroyed now was a
 * wreck at the ram unless its tank_destroyed comes later in the same batch.
 */
function wreckContact(match, events, ram) {
  const after = events.slice(events.indexOf(ram) + 1);
  return [ram.aId, ram.bId].some((id) => match.entityById?.get(id)?.combat?.destroyed === true
    && !after.some((event) => event.type === 'tank_destroyed' && event.id === id));
}

/** The soak's counts for one battle. */
export function createRamTally() {
  return { rams: 0, alliedContacts: 0, viewerChecks: 0, viewerFaults: 0 };
}

/**
 * Judge one broadcast's rams: `snapshot` is the match's snapshot for the tick (its events are the tick's batch), and
 * every viewer's own snapshot and event batch are read for rams it is not a party to. viewerChecks counts the (viewer,
 * ram) pairs judged, so a run that reports rams but judged none says so.
 */
export function judgeRams(match, teamById, snapshot, tick, tally) {
  const rams = snapshot.events.filter((event) => event.type === 'tank_ram');
  for (const event of rams) {
    if (teamById.get(event.aId) === teamById.get(event.bId) && !wreckContact(match, snapshot.events, event)) tally.alliedContacts++;
  }
  if (!rams.length) return;
  tally.rams += rams.length;
  for (const viewer of match.entities) {
    const seen = [], shells = [];
    match.observeForViewer(viewer.id, seen, shells);
    const sees = new Set(seen.map((entity) => entity.id));
    const view = match.snapshot({ tick, serverTimeMs: tick * 1000 / 60, viewerId: viewer.id });
    for (const event of [...view.events, ...match.eventsForViewer(viewer.id)]) {
      if (event.type !== 'tank_ram' || event.aId === viewer.id || event.bId === viewer.id) continue;
      tally.viewerChecks++;
      if (!(sees.has(event.aId) && sees.has(event.bId))) tally.viewerFaults++;
    }
  }
}
