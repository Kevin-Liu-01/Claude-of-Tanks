#!/usr/bin/env node
// What a rotary gun's rate costs the multiplayer authority and its wire (release 270, the M163 VADS at one round a tick,
// sim/fireCycleFloor.ts). A 7v7 match on the real authority and the dedicated collision world: `--m163=N` human M163 seats
// on alpha hold the trigger at the bravo side (`--aim=ground`, level) or into the sky (`--aim=sky`, 35 degrees up, every
// round flies its whole flight), the other seats bots. Each run is measured twice, the Vulcan at its rotary floor and with
// the mark taken off (the 0.05 s floor every other gun keeps), on one seed. Per run: rounds a second an M163, the M163s'
// rounds in flight (from the event stream: fired, less struck, less flown out), the shell rows a viewer's snapshot carries
// (the alpha view: every alpha shell the authority rows; capped at 256, 23 B a row, 20 Hz: the match actor's), events and
// their encoded bytes a second for an alpha and a bravo viewer, and the
// authority's step and per-viewer observation cost in this thread's CPU time (process.threadCpuUsage: a busy machine's
// preemption stays out of it). Node only; no browser, no lock.
//   node --max-old-space-size=4096 tools/rotary-fire-probe.mjs [--m163=1,4] [--aim=ground,sky] [--seconds=12] [--json]
// First-party: Kevin B. Liu (NOTICE.md).
const cpuUs = () => { const usage = process.threadCpuUsage(); return usage.user + usage.system; };

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
  return [key, value];
}));
const COUNTS = String(args.m163 ?? '1,4').split(',').map(Number);
const AIMS = String(args.aim ?? 'ground,sky').split(',');
const SECONDS = Number(args.seconds ?? 12);
const WARM_S = 2;
const MAP = String(args.map ?? 'verdant');
const SEED = Number(args.seed ?? 11);

await import('../src/vehicles/tankFactory.ts');
const { getSpec } = await import('../src/vehicles/specs.ts');
const { createAuthoritativeMatch } = await import('../src/sim/authoritativeMatch.ts');
const { SIM_DT } = await import('../src/sim/movement.ts');
const { createDedicatedWorldCollision } = await import('../server/dedicatedWorldCollision.ts');
const { encodeEventPayload } = await import('../src/mp/wire/eventPayload.ts');
const { MAX_EVENTS_PER_MESSAGE } = await import('../src/mp/wire/constants.ts');

const SHELL_ROW_BYTES = 23, MAX_VIEW_SHELLS = 256, SNAPSHOT_EVERY = 3, EVENT_FRAME_BYTES = 2;
const BOTS = ['m1a1_abrams_hc', 't90am', 'leo2_improved', 'bmp2', 'gepard_1a2', 'm2a2_bradley', 'type90'];
const world = createDedicatedWorldCollision(MAP, { retain: true });
const m163 = getSpec('m163_vads');
const rotaryAutoloader = { ...m163.gun.autoloader };
const ROUND_FLIGHT_S = Number(m163.gun.shells[0].maxLifetimeS ?? 6);

function quantile(values, q) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

function run(count, aim, rotary) {
  m163.gun.autoloader = rotary ? { ...rotaryAutoloader } : { ...rotaryAutoloader, rotary: false };
  const players = [];
  for (let i = 0; i < 7; i++) {
    players.push(i < count ? { id: `a${i}`, specId: 'm163_vads', team: 'alpha', bot: false }
      : { id: `a${i}`, specId: BOTS[i % BOTS.length], team: 'alpha', bot: true, difficulty: 'normal' });
    players.push(i === 0 ? { id: 'v0', specId: 'm1a1_abrams_hc', team: 'bravo', bot: false }
      : { id: `b${i}`, specId: BOTS[(i + 3) % BOTS.length], team: 'bravo', bot: true, difficulty: 'normal' });
  }
  const match = createAuthoritativeMatch({ players, mapId: MAP, seed: SEED, countdownS: 0, gameMode: 'standard', worldCollision: world });
  match.onMatchReady();
  const entities = [], viewShells = [];
  // the bravo side's centre: every M163 fires toward it (level) or over it (into the sky)
  const bravo = match.entities.filter((e) => e.team !== match.entityById.get('a0').team);
  const mean = (key) => bravo.reduce((sum, e) => sum + e.state.pos[key], 0) / bravo.length;
  const target = { x: mean('x'), y: mean('y') + 1.5, z: mean('z') };
  const inputs = new Map();
  const ticks = Math.round((WARM_S + SECONDS) / SIM_DT), warmTicks = Math.round(WARM_S / SIM_DT);
  const stats = {
    shots: 0, stepMs: [], observeMs: [], shellsAlpha: [], rowsAlpha: [], rowsBravo: [], inFlight: [],
    alpha: { events: 0, bytes: 0, fired: 0, landed: 0, maxTick: 0 }, bravo: { events: 0, bytes: 0, fired: 0, landed: 0, maxTick: 0 },
    rowBytesAlpha: 0, rowBytesBravo: 0,
  };
  const flying = new Map(); // an M163 round's id -> when it flies out
  for (let tick = 0; tick < ticks; tick++) {
    const measuring = tick >= warmTicks;
    for (let i = 0; i < count; i++) {
      const shooter = match.entityById.get(`a${i}`);
      const p = shooter.state.pos, horizontal = Math.hypot(target.x - p.x, target.z - p.z);
      inputs.set(`a${i}`, { throttle: 0, steer: 0, brake: true, fire: true, aimLocked: false, shellSlot: 0, actionBits: 0,
        aimYaw: Math.atan2(target.x - p.x, target.z - p.z), aimPitch: aim === 'sky' ? 0.61 : Math.atan2(target.y - p.y - 2.5, horizontal),
        aimDistance: aim === 'sky' ? 1500 : horizontal });
    }
    inputs.set('v0', { throttle: 0, steer: 0, brake: true, fire: false, aimLocked: false, shellSlot: 0, actionBits: 0 });
    const t0 = cpuUs();
    match.step({ dt: SIM_DT, inputs });
    const t1 = cpuUs();
    for (const [viewer, record] of [['a0', stats.alpha], ['v0', stats.bravo]]) {
      let tickEvents = 0;
      for (const event of match.eventsForViewer(viewer)) {
        tickEvents++;
        if (!measuring) continue;
        record.events++;
        record.bytes += encodeEventPayload(event).byteLength + EVENT_FRAME_BYTES;
        if (event.type === 'shell_fired') record.fired++;
        else if (event.type === 'shell_impact' || event.type === 'shell_hit') record.landed++;
        if (viewer === 'a0' && event.type === 'shell_fired' && String(event.shooterId).startsWith('a')
          && Number(String(event.shooterId).slice(1)) < count) stats.shots++;
      }
      // every M163 round, measured or not: fired, then struck (a ricochet flies on) or flown out
      if (viewer === 'a0') for (const event of match.eventsForViewer(viewer)) {
        if (event.type === 'shell_fired' && /^a\d+$/.test(String(event.shooterId)) && Number(String(event.shooterId).slice(1)) < count) {
          flying.set(event.shellId, match.timeS + ROUND_FLIGHT_S);
        } else if (event.type === 'shell_impact' || (event.type === 'shell_hit' && event.kind !== 'ricochet')) flying.delete(event.shellId);
      }
      if (measuring) record.maxTick = Math.max(record.maxTick, tickEvents);
    }
    match.afterEventBroadcast();
    for (const [id, until] of flying) if (until <= match.timeS) flying.delete(id);
    if (measuring) stats.inFlight.push(flying.size);
    if (tick % SNAPSHOT_EVERY === 0) {
      const o0 = cpuUs();
      match.observeForViewer('a0', entities, viewShells);
      const alphaShells = viewShells.length;
      match.observeForViewer('v0', entities, viewShells);
      const bravoShells = viewShells.length;
      const o1 = cpuUs();
      if (measuring) {
        stats.observeMs.push((o1 - o0) / 1000);
        stats.shellsAlpha.push(alphaShells);
        stats.rowsAlpha.push(Math.min(MAX_VIEW_SHELLS, alphaShells));
        stats.rowsBravo.push(Math.min(MAX_VIEW_SHELLS, bravoShells));
        stats.rowBytesAlpha += 2 + SHELL_ROW_BYTES * Math.min(MAX_VIEW_SHELLS, alphaShells);
        stats.rowBytesBravo += 2 + SHELL_ROW_BYTES * Math.min(MAX_VIEW_SHELLS, bravoShells);
      }
      match.afterSnapshotBroadcast?.();
    }
    if (measuring) stats.stepMs.push((t1 - t0) / 1000);
  }
  const perS = (n) => n / SECONDS;
  return {
    m163: count, aim, rotary,
    roundsPerSecondEach: +(perS(stats.shots) / Math.max(1, count)).toFixed(1),
    m163RoundsInFlight: { p50: quantile(stats.inFlight, 0.5), max: Math.max(0, ...stats.inFlight) },
    alphaViewShells: { p50: quantile(stats.shellsAlpha, 0.5), max: Math.max(0, ...stats.shellsAlpha) },
    snapshotShellRows: { alphaMax: Math.max(0, ...stats.rowsAlpha), bravoMax: Math.max(0, ...stats.rowsBravo),
      capped: stats.shellsAlpha.filter((n) => n > MAX_VIEW_SHELLS).length },
    shellRowKBps: { alpha: +(perS(stats.rowBytesAlpha) / 1000).toFixed(1), bravo: +(perS(stats.rowBytesBravo) / 1000).toFixed(1) },
    eventsPerS: { alpha: Math.round(perS(stats.alpha.events)), bravo: Math.round(perS(stats.bravo.events)) },
    shellFiredPerS: { alpha: Math.round(perS(stats.alpha.fired)), bravo: Math.round(perS(stats.bravo.fired)) },
    impactsAndHitsPerS: { alpha: Math.round(perS(stats.alpha.landed)), bravo: Math.round(perS(stats.bravo.landed)) },
    eventKBps: { alpha: +(perS(stats.alpha.bytes) / 1000).toFixed(1), bravo: +(perS(stats.bravo.bytes) / 1000).toFixed(1) },
    maxEventsOneTick: { alpha: stats.alpha.maxTick, bravo: stats.bravo.maxTick, cap: MAX_EVENTS_PER_MESSAGE },
    stepCpuMs: { mean: +(stats.stepMs.reduce((a, b) => a + b, 0) / stats.stepMs.length).toFixed(3), p50: +quantile(stats.stepMs, 0.5).toFixed(3),
      p95: +quantile(stats.stepMs, 0.95).toFixed(3), max: +Math.max(...stats.stepMs).toFixed(2) },
    observeTwoViewersCpuMs: { p50: +quantile(stats.observeMs, 0.5).toFixed(3), p95: +quantile(stats.observeMs, 0.95).toFixed(3) },
  };
}

const rows = [];
// each pair twice, interleaved (off, on, off, on): the first run of a process warms the JIT for both
for (const aim of AIMS) for (const count of COUNTS) for (const rotary of [false, true, false, true]) {
  const row = run(count, aim, rotary);
  rows.push(row);
  if (!args.json) console.log(JSON.stringify(row));
}
m163.gun.autoloader = rotaryAutoloader;
if (args.json) console.log(JSON.stringify(rows, null, 2));
