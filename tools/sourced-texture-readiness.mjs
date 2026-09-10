// Tool-only, serialized before page boot. No timers, mutation of runtime state,
// new RAF loop, network wrappers, or wait that changes production reveal.
export function installSourcedTextureReadiness() {
  const identities = new WeakMap();
  let nextId = 0, generation = 0, stopped = false, active = null;
  const id = value => {
    if (!value || typeof value !== 'object') return null;
    if (!identities.has(value)) identities.set(value, ++nextId);
    return identities.get(value);
  };
  const errors = message => { if (active?.errors.length < 8) active.errors.push(String(message).slice(0, 512)); };
  const read = (atMs, detail = true) => {
    const d = window.__DEBUG, world = d?.world, state = world?.minimapTextureState;
    const sample = { atMs, worldId: id(world), stateId: id(state), mapId: world?.mapId ?? null,
      phase: d?.game?.phase ?? null, battleOrdinal: d?.game?.battleCount ?? null,
      available: !!state && typeof state.promise?.then === 'function', settled: state?.settled === true };
    if (!detail) return sample;
    const results = Array.isArray(state?.results) ? state.results : [];
    const limited = results.slice(0, 32).map(value => ({
      target: typeof value?.target === 'string' ? value.target.slice(0, 160) : null,
      applied: value?.applied === true,
      failures: Array.isArray(value?.failures) ? value.failures.slice(0, 16).map(item => String(item).slice(0, 512)) : null,
      failuresDropped: Array.isArray(value?.failures) ? Math.max(0, value.failures.length - 16) : null,
    }));
    return { ...sample,
      // Pending aggregate state has no exact requested/per-layer applied count.
      requested: state?.settled === true ? results.length : null,
      applied: state?.settled === true ? results.filter(value => value?.applied === true).length : null,
      results: limited, resultsDropped: Math.max(0, results.length - 32) };
  };
  const observePromise = sample => {
    if (!sample.available || active.worldsObserved.some(value => value.stateId === sample.stateId)) return;
    if (active.worldsObserved.length >= 4) { active.worldsDropped++; return; }
    const owner = generation, state = window.__DEBUG.world.minimapTextureState;
    const receipt = { worldId: sample.worldId, stateId: sample.stateId, mapId: sample.mapId,
      firstObservedAtMs: sample.atMs, settledAtFirstObservation: sample.settled,
      settlementObservedAtMs: null };
    active.worldsObserved.push(receipt);
    // Observe the existing promise only. Resolution time here is an observer
    // callback timestamp, not exact per-layer request/adoption timing.
    Promise.resolve(state.promise).then(() => {
      if (!stopped && generation === owner) receipt.settlementObservedAtMs = performance.now();
    }, error => { if (!stopped && generation === owner) errors(error); });
  };
  const api = {
    arm(action) {
      if (stopped) return;
      generation++;
      active = { protocol: 'sourced-texture-reveal-observation-v1', action,
        beforeBattleOrdinal: window.__DEBUG?.game?.battleCount ?? null,
        firstUncoveredBattle: null, finish: null, worldsObserved: [], worldsDropped: 0, errors: [] };
    },
    observe(atMs, uncovered) {
      if (stopped || !active || active.action === 'return-to-garage') return;
      try {
        const sample = read(atMs, false); observePromise(sample);
        const game = window.__DEBUG?.game;
        if (!active.firstUncoveredBattle && uncovered && sample.phase === 'battle' && !game?.result
          && sample.battleOrdinal === active.beforeBattleOrdinal + 1) active.firstUncoveredBattle = read(atMs);
      } catch (error) { errors(error); }
    },
    finish() {
      if (stopped || !active) return null;
      try { active.finish = read(performance.now()); } catch (error) { errors(error); }
      return active;
    },
    stop() {
      stopped = true; generation++; active = null;
      if (window.__SOURCE_READINESS === api) delete window.__SOURCE_READINESS;
    },
  };
  window.__SOURCE_READINESS = api;
}

export function checkSourcedTextureReadiness(action) {
  if (!['battle', 'battle-again'].includes(action.action)) return [];
  const report = action.sourceReadiness, failures = [];
  const reject = message => failures.push(`${action.action}: ${message}`);
  if (report?.protocol !== 'sourced-texture-reveal-observation-v1') return [`${action.action}: missing source readiness observation`];
  if (!Array.isArray(report.errors) || report.errors.length || report.worldsDropped) reject('incomplete source readiness observer');
  const first = report.firstUncoveredBattle, final = report.finish;
  for (const [name, value] of [['first uncovered battle', first], ['finish', final]]) {
    if (!value?.available || !value.worldId || !value.stateId || !value.mapId) { reject(`missing world source owner at ${name}`); continue; }
    if (!value.settled || !Number.isInteger(value.requested) || value.requested <= 0
      || value.applied !== value.requested || !Array.isArray(value.results) || value.results.length !== value.requested
      || value.resultsDropped || value.results.some(row => !row.applied || !Array.isArray(row.failures)
        || typeof row.target !== 'string' || !row.target || row.failures.length || row.failuresDropped)) reject(`sources not fully applied at ${name}`);
  }
  if (first && final && (first.worldId !== final.worldId || first.stateId !== final.stateId || first.mapId !== final.mapId)) {
    reject('world source owner changed between reveal and finish');
  }
  return failures;
}
