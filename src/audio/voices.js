/**
 * src/audio/voices.js — crew radio voice lines (VOICE r1: neural crew).
 *
 * Plays the pre-synthesized intercom calls under public/audio/voice/ —
 * local Piper neural TTS through an ffmpeg radio chain, built by
 * tools/make-voices.mjs (see docs/ATTRIBUTION.md "Crew radio voice lines").
 * Four voices = four crew roles on one net: commander (UK male) calls
 * contacts and confirms kills, gunner (deep US male) owns firing/ricochet/
 * gun, driver (US male) owns mobility/hull/fires, loader (US female) owns
 * ammo/reload. Variant files (_b/_c) are alternate reads/speakers so repeats
 * don't sound sampled. Nothing here touches the DOM or the AudioContext
 * until load() is called by audio.js after resume().
 *
 * Radio discipline (what keeps it from turning into chatter):
 *   - ONE line at a time — it is a single crew intercom, not a mixer.
 *   - priority ladder: 3 = survival calls (fire/ammo rack) may cut low-pri
 *     speech; 0 = flavor (firing/reloaded) never queues over anything.
 *   - per-line cooldowns + a global minimum gap, so repeats never machine-gun.
 *   - stale queued calls (>2 s old) are dropped, not played late.
 *   - ±3% playback-rate jitter per play so repeats don't sound sampled.
 *
 * Loading is tolerant by design: a missing/undecodable file mutes that line
 * and logs one warning — the game never breaks on audio assets.
 */

/** Line table: id → { files (variants), pri 0..3, cdS per-line cooldown }. */
export const VOICE_LINES = {
  enemy_spotted:    { files: ['enemy_spotted.ogg', 'enemy_spotted_b.ogg', 'enemy_spotted_c.ogg'], pri: 1, cdS: 9 },
  target_destroyed: { files: ['target_destroyed.ogg', 'target_destroyed_b.ogg', 'target_destroyed_c.ogg'], pri: 2, cdS: 3.5 },
  were_hit:         { files: ['were_hit.ogg', 'were_hit_b.ogg'],               pri: 2, cdS: 6 },
  ricochet:         { files: ['ricochet.ogg', 'ricochet_b.ogg'],               pri: 1, cdS: 5 },
  bounced_us:       { files: ['bounced_us.ogg', 'bounced_us_b.ogg'],           pri: 2, cdS: 6 },
  ammo_rack:        { files: ['ammo_rack.ogg'],                                pri: 3, cdS: 8 },
  fire:             { files: ['fire.ogg', 'fire_b.ogg'],                       pri: 3, cdS: 10 },
  fire_out:         { files: ['fire_out.ogg'],                                 pri: 1, cdS: 10 },
  engine_damaged:   { files: ['engine_damaged.ogg', 'engine_damaged_b.ogg'],   pri: 2, cdS: 8 },
  track_gone:       { files: ['track_gone.ogg', 'track_gone_b.ogg'],           pri: 2, cdS: 6 },
  gun_damaged:      { files: ['gun_damaged.ogg'],                              pri: 2, cdS: 8 },
  reloaded:         { files: ['reloaded.ogg', 'reloaded_b.ogg', 'reloaded_c.ogg'], pri: 0, cdS: 3 },
  on_the_move:      { files: ['on_the_move.ogg', 'on_the_move_b.ogg'],         pri: 1, cdS: 15 },
  firing:           { files: ['firing.ogg', 'firing_b.ogg'],                   pri: 0, cdS: 12 },
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
    // Radio busy. Survival calls interrupt clearly-lower-priority speech that
    // still has >0.4 s to run; everything else queues by priority.
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
      if (now - queue[i].atReq > QUEUE_STALE_S) queue.splice(i, 1);
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
