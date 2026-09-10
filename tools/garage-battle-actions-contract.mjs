// Real-control handoff receipts; deliberately independent of DOM/WebGL.
export const GARAGE_BATTLE_ACTIONS = Object.freeze([
  'battle', 'battle-again', 'return-to-garage',
]);

function validLoadingClockWitness(witness) {
  const before = witness?.before, after = witness?.after;
  return !!before && !!after && Number.isInteger(before.contextId) && before.contextId > 0
    && before.contextId === after.contextId && before.state === 'running' && after.state === 'running'
    && before.loadingActive === true && after.loadingActive === true
    && before.covered === true && after.covered === true
    && Number.isFinite(before.currentTimeS) && Number.isFinite(after.currentTimeS)
    && Number.isFinite(before.atMs) && Number.isFinite(after.atMs)
    && after.currentTimeS > before.currentTimeS && after.atMs > before.atMs;
}

// Separate optional gate: this proves live owner/clock behavior, never audible
// PCM, speaker output, or automatic permission on an untested physical device.
export function checkGarageActionAudio(rows) {
  const failures = [];
  const first = rows.find(row => row.action === 'battle')?.audio;
  const returned = rows.find(row => row.action === 'return-to-garage')?.audio;
  if (first?.loadingActiveObserved !== true || !validLoadingClockWitness(first?.coveredLoadingClockWitness)) {
    failures.push('first Battle: no advancing running audio clock observed during covered loading');
  }
  const end = returned?.completion;
  if (!end || end.loadingActive !== false || end.ambientActive !== false) {
    failures.push('Garage return: loading and battle ambient owners were not observed stopped');
  }
  if (!end || end.state !== 'running'
    || end.contextId !== first?.coveredLoadingClockWitness?.after.contextId) {
    failures.push('Garage return: original running audio context was not retained');
  }
  if (rows.some(row => row.audio?.observationErrors?.length)) failures.push('audio observation errors');
  return failures;
}

// Optional acceptance of the production warm owner's own receipt. Functional
// rollout can succeed after a caught countdown warm error, so it is not proof
// that required covered work completed. Never certify a stale return trace.
export function checkGarageActionWarmReadiness(rows) {
  const failures = [];
  for (const action of ['battle', 'battle-again']) {
    const warm = rows.find(row => row.action === action)?.loadingTraces?.__BATTLE_COUNTDOWN_WARM;
    if (!warm) {
      failures.push(`${action}: missing countdown warm receipt`);
      continue;
    }
    if (warm.error) failures.push(`${action}: countdown warm error: ${String(warm.error)}`);
    if (warm.done !== true) failures.push(`${action}: countdown warm did not finish`);
    if (warm.doneBeforeRollout !== true) failures.push(`${action}: countdown warm was not ready before rollout`);
  }
  return failures;
}

export function checkGarageBattleActions(rows, { coverLimitMs = 500 } = {}) {
  const failures = [];
  if (rows.length !== GARAGE_BATTLE_ACTIONS.length) failures.push('incomplete action sequence');
  GARAGE_BATTLE_ACTIONS.forEach((action, index) => {
    const row = rows[index];
    if (!row || row.action !== action) {
      failures.push(`missing ${action} receipt`);
      return;
    }
    if (row.trusted !== true) failures.push(`${action}: not a real input click`);
    if (!Number.isFinite(row.coverMs) || row.coverMs < 0 || row.coverMs > coverLimitMs) {
      failures.push(`${action}: missing/late painted cover (${row.coverMs} ms)`);
    }
    if (!Number.isFinite(row.totalMs) || row.totalMs < row.coverMs) {
      failures.push(`${action}: missing or out-of-order completion`);
    }
    const expectedPhase = action === 'return-to-garage' ? 'garage' : 'battle';
    if (row.after?.phase !== expectedPhase) failures.push(`${action}: wrong destination phase`);
    if (row.after?.selectedSpecId !== row.before?.selectedSpecId
      || row.after?.selectedMapId !== row.before?.selectedMapId) {
      failures.push(`${action}: selection changed during handoff`);
    }
    if (action !== 'return-to-garage') {
      if (row.after?.battleOrdinal !== row.before?.battleOrdinal + 1) {
        failures.push(`${action}: did not publish exactly one new battle`);
      }
      if (row.after?.playerSpecId !== row.before?.selectedSpecId
        || row.after?.mapId !== row.before?.selectedMapId) {
        failures.push(`${action}: launched wrong tank or map`);
      }
    } else if (row.after?.pedestalSpecId !== row.before?.selectedSpecId) {
      failures.push(`${action}: restored wrong hero`);
    }
  });
  return failures;
}
