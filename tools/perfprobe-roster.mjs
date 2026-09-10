// Tool-only acquisition contract. Do not let rosterState's legitimate random
// top-up behavior turn a requested comparison into a different workload.
export const REFERENCE_MIXED_ROSTER = Object.freeze([
  'fv510_milan', 'bwp1', 'amx40', 'strv103a', 't80b', 't80bv', 'type90',
  'm60a2', 'type90a', 'm1a1ha', 'carro45t', 'ztz85_iii', 'm2a2_bradley',
]);

export function createPerfRosterRequest(option = REFERENCE_MIXED_ROSTER.join(',')) {
  const random = option === 'random';
  // Keep empty entries: filtering them could hide a malformed requested pin.
  const opponents = random ? null : option.split(',').map(id => id.trim());
  return {
    protocol: 'perfprobe-roster-v1',
    mode: random ? 'random-seeded' : 'pinned',
    label: random ? 'random-seeded' : option === REFERENCE_MIXED_ROSTER.join(',')
      ? 'reference-mixed-13-opponents' : 'custom-13-opponents',
    playerId: 'm1a2', expectedCount: 14, requestedOpponents: opponents,
  };
}

export function inspectPerfRosterEligibility(request, available) {
  const byId = new Map(available.map(row => [row.id, row]));
  const errors = [];
  if (available.length < request.expectedCount) errors.push('Production catalog cannot fill a 14-tank battle');
  const requested = [request.playerId, ...(request.requestedOpponents ?? [])];
  if (request.mode === 'pinned' && requested.length !== request.expectedCount) {
    errors.push(`Pinned battle requires 13 opponents; requested ${requested.length - 1}`);
  }
  if (new Set(requested).size !== requested.length) errors.push('Duplicate player/opponent IDs in requested roster');
  for (const id of requested) {
    if (!byId.has(id)) errors.push(`Unavailable production tank ID ${JSON.stringify(id)} (unknown, archived, or non-playable)`);
  }
  const resolved = requested.map(id => byId.get(id)).filter(Boolean)
    .map(row => ({ id: row.id, specId: row.specId }));
  return {
    ...request,
    requestedOpponents: request.requestedOpponents?.slice() ?? null,
    expected: request.mode === 'pinned' ? resolved : null,
    expectedPlayer: resolved[0] ?? null,
    eligibleEntities: available.map(row => ({ id: row.id, specId: row.specId })),
    eligibility: { pass: errors.length === 0, errors, availableCount: available.length },
    checkpoints: [], pass: errors.length === 0,
  };
}

function compareRosterRows(actual, expected, errors, label) {
  if (actual.length !== expected.length) errors.push(`${label} count ${actual.length} differs from ${expected.length}`);
  for (let index = 0; index < expected.length; index++) {
    const row = actual[index], wanted = expected[index];
    if (row?.id !== wanted.id || row?.specId !== wanted.specId) {
      errors.push(`${label} slot ${index}: expected ${wanted.id}/${wanted.specId}, got ${row?.id}/${row?.specId}`);
    }
  }
}

function validateActualEntities(rows, eligible, errors) {
  const byId = new Map(eligible.map(row => [row.id, row.specId]));
  for (const row of rows) {
    if (!byId.has(row.id) || byId.get(row.id) !== row.specId) errors.push(`Actual entity ${row.id}/${row.specId} is not in the production catalog`);
  }
}

function validateBattleStage(snapshot, name, errors) {
  if (snapshot?.phase !== 'battle') errors.push(`${name} phase must be battle, got ${snapshot?.phase}`);
  if (name !== 'entry' && (!Number.isFinite(snapshot?.preBattleS) || snapshot.preBattleS > 0)) {
    errors.push(`${name} requires released controls (finite preBattleS <= 0)`);
  }
}

function validateBattleTeams(rows, initial, errors) {
  const players = rows.filter(row => row.team === 'player').length;
  const enemies = rows.filter(row => row.team === 'enemy').length;
  if (players !== 7 || enemies !== 7) errors.push(`Production teams must be player 7:enemy 7; got ${players}:${enemies}`);
  if (rows[0]?.team !== 'player') errors.push('Player entity must belong to player team');
  if (!initial) return;
  for (let index = 0; index < rows.length; index++) {
    if (rows[index].team !== initial[index]?.team) errors.push(`Team changed at slot ${index}: ${initial[index]?.team} -> ${rows[index].team}`);
  }
}

export function recordPerfRosterCheckpoint(provenance, name, snapshot) {
  const errors = [];
  const rows = Array.isArray(snapshot?.roster) ? snapshot.roster : [];
  if (rows.length !== provenance.expectedCount) errors.push(`Actual count ${rows.length}; expected ${provenance.expectedCount}`);
  if (new Set(rows.map(row => row.id)).size !== rows.length) errors.push('Duplicate actual entity IDs');
  validateActualEntities(rows, provenance.eligibleEntities, errors);
  validateBattleStage(snapshot, name, errors);
  validateBattleTeams(rows, provenance.checkpoints[0]?.actual.roster, errors);
  if (snapshot?.playerSpecId !== provenance.expectedPlayer?.specId) errors.push('Actual player spec differs from eligible requested player');
  const expected = provenance.expected ?? provenance.checkpoints[0]?.actual.roster;
  if (expected) compareRosterRows(rows, expected, errors, provenance.mode === 'pinned' ? 'Requested roster' : 'Initial seeded roster');
  else if (provenance.expectedPlayer) compareRosterRows(rows.slice(0, 1), [provenance.expectedPlayer], errors, 'Seeded player');
  const checkpoint = {
    name, pass: errors.length === 0, errors,
    actual: { phase: snapshot?.phase ?? null, preBattleS: snapshot?.preBattleS ?? null,
      playerSpecId: snapshot?.playerSpecId ?? null,
      roster: rows.map(row => ({ id: row.id, specId: row.specId, team: row.team })) },
  };
  provenance.checkpoints.push(checkpoint);
  provenance.pass = provenance.pass && checkpoint.pass;
  return checkpoint;
}

export function requirePerfRoster(check) {
  if (!check.pass) throw new Error(`Roster acquisition mismatch: ${check.errors.join('; ')}`);
}

export function recordPerfRosterEdges(provenance, perf, requireComplete = true) {
  if (!provenance) return;
  for (const [name, key] of [['sample-start', 'environmentStart'], ['sample-end', 'environmentEnd']]) {
    if (provenance.checkpoints.some(checkpoint => checkpoint.name === name)) continue;
    if (perf?.[key] || requireComplete) recordPerfRosterCheckpoint(provenance, name, perf?.[key]);
  }
}

// Failure evidence must not depend on later inventory/GC diagnostics succeeding.
// If the sampler itself fails, copy any already-observed edge before closing
// the browser. A dead CDP session cannot extend cleanup indefinitely.
export async function preservePerfRosterFailure(provenance, readEdges, timeoutMs = 1500) {
  if (!provenance || provenance.checkpoints.some(checkpoint => checkpoint.name === 'sample-end')) return;
  let timer;
  try {
    const edges = await Promise.race([
      Promise.resolve().then(readEdges),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Sampler edge capture timed out')), timeoutMs); }),
    ]);
    recordPerfRosterEdges(provenance, edges, false);
  } catch (error) {
    provenance.sampleCaptureError = String(error);
  } finally {
    clearTimeout(timer);
  }
}
