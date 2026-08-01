/**
 * src/audio/voices.js — battle announcer voice lines (VOICE r2: one voice).
 *
 * Plays the pre-synthesized radio calls under public/audio/voice/ — local
 * Piper neural TTS (en_US-joe-medium, CC0 — bake-off notes in
 * tools/make-voices.mjs) through an ffmpeg radio chain, built by
 * tools/make-voices.mjs (see docs/ATTRIBUTION.md "Battle announcer voice
 * lines"). r2 owner redirect: ONE American male announcer for everything, in
 * the classic tank-game style — battle start/result calls, "On the way!",
 * "Enemy spotted!", hit/bounce/crit reports, module damage, reload calls.
 * Variant files (_b/_c) are alternate reads so repeats don't sound sampled.
 * Nothing here touches the DOM or the AudioContext until load() is called by
 * audio.js after resume().
 *
 * Radio discipline (what keeps it from turning into chatter):
 *   - ONE line at a time — it is a single radio net, not a mixer.
 *   - priority ladder: 3 = battle results + survival calls (fire/ammo rack)
 *     may cut low-pri speech; 0 = flavor (firing/reloaded) never queues.
 *   - per-line cooldowns + a global minimum gap, so repeats never machine-gun.
 *   - stale queued calls are dropped, not played late (per-line staleS lets
 *     battle results wait out a kill confirm instead of vanishing).
 *   - ±3% playback-rate jitter per play so repeats don't sound sampled.
 *
 * Event wiring is split across two layers ON PURPOSE:
 *   - combat calls (firing, hits, modules, spotting, reload-done) are driven
 *     by src/audio/audio.js handlers calling say() — unchanged from r1;
 *   - the battle ENVELOPE (battle start, victory/defeat/draw) plus the r2
 *     additions (penetration/crit reports, sixth sense, reload start, fuel
 *     tank) attach here in load(), listen-only, via the game's global bus
 *     handle (main.js exposes it unconditionally on window.__DEBUG). audio.js
 *     is untouched — its existing 'phase:change'/'battle:ended' handlers keep
 *     owning the horn/fanfares; this file only adds announcer speech.
 *
 * Loading is tolerant by design: a missing/undecodable file mutes that line
 * and logs one warning — the game never breaks on audio assets.
 */

/** Line table: id → { files (variants), pri 0..3, cdS per-line cooldown,
 *  staleS optional queue patience (default 2 s) }. */
export const VOICE_LINES = {
  // battle envelope (r2): start + results, wired listen-only in load()
  battle_start:     { files: ['battle_start.ogg', 'battle_start_b.ogg'],       pri: 2, cdS: 8 },
  victory:          { files: ['victory.ogg', 'victory_b.ogg'],                 pri: 3, cdS: 10, staleS: 8 },
  defeat:           { files: ['defeat.ogg', 'defeat_b.ogg'],                   pri: 3, cdS: 10, staleS: 8 },
  draw:             { files: ['draw.ogg'],                                     pri: 3, cdS: 10, staleS: 8 },
  // awareness
  enemy_spotted:    { files: ['enemy_spotted.ogg', 'enemy_spotted_b.ogg', 'enemy_spotted_c.ogg'], pri: 1, cdS: 9 },
  sixth_sense:      { files: ['sixth_sense.ogg', 'sixth_sense_b.ogg'],         pri: 2, cdS: 14 },
  // gunnery reports
  firing:           { files: ['firing.ogg', 'firing_b.ogg', 'firing_c.ogg'],   pri: 0, cdS: 12 },
  penetration:      { files: ['penetration.ogg', 'penetration_b.ogg'],         pri: 1, cdS: 6 },
  ricochet:         { files: ['ricochet.ogg', 'ricochet_b.ogg'],               pri: 1, cdS: 5 },
  enemy_crit:       { files: ['enemy_crit.ogg', 'enemy_crit_b.ogg'],           pri: 1, cdS: 9 },
  enemy_ammo_rack:  { files: ['enemy_ammo_rack.ogg'],                          pri: 1, cdS: 12 },
  target_destroyed: { files: ['target_destroyed.ogg', 'target_destroyed_b.ogg', 'target_destroyed_c.ogg'], pri: 2, cdS: 3.5 },
  // survival
  were_hit:         { files: ['were_hit.ogg', 'were_hit_b.ogg'],               pri: 2, cdS: 6 },
  bounced_us:       { files: ['bounced_us.ogg', 'bounced_us_b.ogg'],           pri: 2, cdS: 6 },
  low_hp:           { files: ['low_hp.ogg'],                                   pri: 2, cdS: 25 },
  ammo_rack:        { files: ['ammo_rack.ogg'],                                pri: 3, cdS: 8 },
  fuel_tank:        { files: ['fuel_tank.ogg'],                                pri: 2, cdS: 10 },
  fire:             { files: ['fire.ogg', 'fire_b.ogg'],                       pri: 3, cdS: 10 },
  fire_out:         { files: ['fire_out.ogg'],                                 pri: 1, cdS: 10 },
  engine_damaged:   { files: ['engine_damaged.ogg', 'engine_damaged_b.ogg'],   pri: 2, cdS: 8 },
  track_gone:       { files: ['track_gone.ogg', 'track_gone_b.ogg'],           pri: 2, cdS: 6 },
  gun_damaged:      { files: ['gun_damaged.ogg'],                              pri: 2, cdS: 8 },
  // loading / movement / flavor
  reloading:        { files: ['reloading.ogg'],                                pri: 0, cdS: 9 },
  reloaded:         { files: ['reloaded.ogg', 'reloaded_b.ogg', 'reloaded_c.ogg'], pri: 0, cdS: 3 },
  on_the_move:      { files: ['on_the_move.ogg', 'on_the_move_b.ogg'],         pri: 1, cdS: 15 },
  repairs:          { files: ['repairs.ogg', 'repairs_b.ogg'],                 pri: 0, cdS: 10 },
};

const GLOBAL_GAP_S = 0.30;   // dead air between any two lines
const QUEUE_MAX = 2;
const QUEUE_STALE_S = 2.0;

/**
 * Create the radio. Pure factory — call load() once the AudioContext exists.
 * @param {() => number} rng seeded 0..1 generator (shared with audio.js)
 */
export function createVoiceRadio(rng) {
  let ctx = null;
  let dest = null;          // voice bus GainNode
  let loaded = false;
  let loading = false;
  /** file name → AudioBuffer|null */
  const buffers = new Map();
  /** line id → last play time (ctx clock) */
  const lastPlay = new Map();
  const queue = [];         // [{id, pri, atReq}]
  let currentEnd = -1;      // ctx time the playing line ends
  let currentPri = -1;
  let currentSrc = null;
  /** Probe/debug trail: every line actually PLAYED. */
  const log = [];

  /**
   * Fetch + decode every line. Failures mute individual lines only.
   * @param {AudioContext} audioCtx
   * @param {GainNode} voiceBus
   */
  function load(audioCtx, voiceBus) {
    if (loading || loaded) { dest = voiceBus; return; }
    loading = true;
    ctx = audioCtx;
    dest = voiceBus;
    const base = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/';
    const names = new Set();
    for (const id of Object.keys(VOICE_LINES)) {
      for (const f of VOICE_LINES[id].files) names.add(f);
    }
    let failures = 0;
    const jobs = [...names].map((name) =>
      fetch(`${base}audio/voice/${name}`)
        .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); })
        .then((ab) => ctx.decodeAudioData(ab))
        .then((buf) => { buffers.set(name, buf); })
        .catch(() => { buffers.set(name, null); failures++; }));
    Promise.all(jobs).then(() => {
      loaded = true;
      if (failures) console.warn(`[audio] ${failures} crew voice line(s) failed to load — muted`);
    });
    wireBattleFlow();
  }

  // ------------------------------------------------- battle-flow wiring ---
  // r2: the announcer's battle envelope + shot-report lines listen on the
  // game bus directly. audio.js (read-only this round) keeps its existing
  // say() call sites; everything below is ADDITIVE and listen-only. The bus
  // handle comes from window.__DEBUG (assigned unconditionally at main.js
  // module tail, long before the user gesture that triggers load()); if it
  // is ever absent (bare harness), the radio still works via say().
  let busWired = false;
  function wireBattleFlow() {
    if (busWired || typeof window === 'undefined') return;
    const dbg = window.__DEBUG;
    if (!dbg || !dbg.bus || typeof dbg.bus.on !== 'function') return;
    busWired = true;
    const bus = dbg.bus;
    const playerId = () => {
      const g = window.__DEBUG && window.__DEBUG.game;
      return g && g.player ? g.player.id : null;
    };

    let prevPhase = null;
    let ended = false;         // battle decided — announcer envelope closed
    let reloadCalled = false;  // one "Reloading!" per reload cycle
    /** player fuelTank last state (edge detect; audio.js owns the others) */
    let fuelPrev = 'ok';
    const RANK = { ok: 0, yellow: 1, red: 2 };
    const reset = () => { ended = false; reloadCalled = false; fuelPrev = 'ok'; };

    // Garage BATTLE press — re-arm the envelope for the coming battle.
    bus.on('ui:battleStart', reset);
    // Battle open (also covers the debug startBattle path, which skips
    // ui:battleStart): announce, once per garage→battle edge.
    bus.on('phase:change', (e) => {
      const next = (e && e.phase) || 'garage';
      if (next === 'battle' && prevPhase !== 'battle') {
        reset();
        say('battle_start');
      }
      prevPhase = next;
    });
    // Battle decided: one result call. pri 3 + staleS lets it wait out the
    // final kill confirm instead of being dropped as stale.
    bus.on('battle:ended', (e) => {
      if (ended) return;
      ended = true;
      const r = e && e.result;
      say(r === 'victory' ? 'victory' : r === 'defeat' ? 'defeat' : 'draw');
    });
    // Shot reports for the PLAYER's own hits + our own critical damage.
    bus.on('shell:hit', (ev) => {
      if (ended || !ev) return;
      const pid = playerId();
      if (pid == null) return;
      if (ev.attackerId === pid && ev.targetId != null && ev.targetId !== pid && !ev.destroyed) {
        if (ev.ammoRacked) say('enemy_ammo_rack');
        else if (ev.modulesHit && ev.modulesHit.length && (ev.damage || 0) > 0) say('enemy_crit', { prob: 0.6 });
        else if ((ev.kind === 'pen' || ev.kind === 'he_pen') && (ev.damage || 0) > 0) say('penetration');
        // own shell failed to pen (shatter/absorb) — audio.js already voices
        // the deflection ('ricochet' KIND); these two kinds had no line.
        else if (ev.kind === 'nonpen' || ev.kind === 'spaced_absorb') say('ricochet');
      }
      if (ev.targetId === pid && (ev.damage || 0) > 0 && (ev.targetMaxHp || 0) > 0
          && ev.targetHpAfter > 0 && ev.targetHpAfter / ev.targetMaxHp <= 0.25) {
        say('low_hp');
      }
    });
    // Sixth sense — the enemy team lit us up (state.js emits this edge).
    bus.on('player:spotted', () => { if (!ended) say('sixth_sense'); });
    // Reload cycle: one "Reloading!" near the start (flavor — busy radio or
    // the prob gate simply drops it), reset on the authoritative done edge.
    bus.on('player:reload', (e) => {
      if (!e) return;
      if (e.done) { reloadCalled = false; return; }
      if (!reloadCalled) {
        reloadCalled = true;
        if (!ended) say('reloading', { prob: 0.4 });
      }
    });
    // Fuel tank damage on the player — the one module audio.js doesn't voice.
    bus.on('module:state', (e) => {
      if (!e || e.module !== 'fuelTank') return;
      const pid = playerId();
      if (pid == null || e.id !== pid) return;
      const prev = fuelPrev;
      fuelPrev = e.state;
      if (!ended && (RANK[e.state] || 0) > (RANK[prev] || 0)) say('fuel_tank');
    });
  }

  function playNow(id) {
    const line = VOICE_LINES[id];
    const files = line.files;
    const buf = buffers.get(files[(rng() * files.length) | 0]) || buffers.get(files[0]);
    if (!buf) return;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 0.97 + rng() * 0.06;
    const g = ctx.createGain();
    g.gain.value = 1.0;
    src.connect(g);
    g.connect(dest);
    src.start(now);
    src.onended = () => { try { g.disconnect(); } catch (_) { /* detached */ } };
    currentSrc = src;
    currentEnd = now + buf.duration / src.playbackRate.value;
    currentPri = line.pri;
    lastPlay.set(id, now);
    log.push({ id, t: now });
    if (log.length > 64) log.shift();
  }

  /**
   * Request a line. Returns true if played or queued.
   * @param {string} id key of VOICE_LINES
   * @param {{prob?: number, force?: boolean}} [opts] chance gate (flavor lines
   *   pass < 1); force bypasses cooldown/busy discipline (probe/debug only)
   */
  function say(id, opts) {
    if (!loaded || !ctx || !dest) return false;
    const line = VOICE_LINES[id];
    if (!line) return false;
    if (opts && opts.force) { playNow(id); return true; }
    if (opts && typeof opts.prob === 'number' && rng() > opts.prob) return false;
    const now = ctx.currentTime;
    const last = lastPlay.get(id);
    if (last != null && now - last < line.cdS) return false;
    const busyUntil = currentEnd + GLOBAL_GAP_S;
    if (now >= busyUntil) {
      playNow(id);
      return true;
    }
    // Radio busy. Survival/result calls interrupt clearly-lower-priority
    // speech that still has >0.4 s to run; everything else queues by priority.
    if (line.pri >= 3 && currentPri <= 1 && currentEnd - now > 0.4 && currentSrc) {
      try { currentSrc.stop(); } catch (_) { /* stopped */ }
      currentEnd = now;
      playNow(id);
      return true;
    }
    if (line.pri === 0) return false;               // flavor never queues
    for (const q of queue) if (q.id === id) return false;
    if (queue.length >= QUEUE_MAX) {
      let minI = 0;
      for (let i = 1; i < queue.length; i++) if (queue[i].pri < queue[minI].pri) minI = i;
      if (queue[minI].pri >= line.pri) return false;
      queue.splice(minI, 1);
    }
    queue.push({ id, pri: line.pri, atReq: now });
    return true;
  }

  /** Drain the queue — call per frame (cheap). */
  function update() {
    if (!loaded || !ctx || queue.length === 0) return;
    const now = ctx.currentTime;
    for (let i = queue.length - 1; i >= 0; i--) {
      const patience = VOICE_LINES[queue[i].id].staleS || QUEUE_STALE_S;
      if (now - queue[i].atReq > patience) queue.splice(i, 1);
    }
    if (queue.length === 0 || now < currentEnd + GLOBAL_GAP_S) return;
    let best = 0;
    for (let i = 1; i < queue.length; i++) if (queue[i].pri > queue[best].pri) best = i;
    const { id } = queue.splice(best, 1)[0];
    const last = lastPlay.get(id);
    if (last != null && now - last < VOICE_LINES[id].cdS) return;
    playNow(id);
  }

  /** Hard cut — battle ended / entered garage. Clears queue, stops speech. */
  function silence() {
    queue.length = 0;
    if (currentSrc) { try { currentSrc.stop(); } catch (_) { /* stopped */ } }
    currentEnd = -1;
    currentPri = -1;
  }

  return {
    load, say, update, silence, log,
    get loaded() { return loaded; },
  };
}
