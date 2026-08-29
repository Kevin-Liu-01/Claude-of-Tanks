/**
 * src/audio/voices.ts — battle announcer voice lines (VOICE r3: one voice).
 *
 * Plays the pre-synthesized radio calls under public/audio/voice/ — local
 * Piper neural TTS (en_US-joe-medium, CC0 — bake-off notes in
 * tools/make-voices.mjs) through an ffmpeg radio chain, built by
 * tools/make-voices.mjs (see docs/ATTRIBUTION.md "Battle announcer voice
 * lines"). r2 owner redirect: ONE American male announcer for everything, in
 * the classic tank-game style — battle start/result calls, "On the way!",
 * "Enemy spotted!", hit/bounce/crit reports, module and crew damage, reload
 * and system-restored calls.
 * Variant files (_b/_c) are alternate reads so repeats don't sound sampled.
 * Nothing here touches the DOM or the AudioContext until load() is called by
 * audio.ts after resume().
 *
 * Radio discipline (what keeps it from turning into chatter):
 *   - ONE line at a time — it is a single radio net, not a mixer.
 *   - priority ladder: 4 = battle results + critical survival calls, 3 =
 *     actionable damage; both may cut lower speech. 0 = flavor and never
 *     backlogs behind an active call.
 *   - per-line cooldowns + a global minimum gap, so repeats never machine-gun.
 *   - stale queued calls are dropped, not played late (per-line staleS lets
 *     battle results wait out a kill confirm instead of vanishing).
 *   - ±1.5% playback-rate jitter and no immediate take repeat.
 *
 * Event selection lives in audio.ts. This module is deliberately only the
 * radio scheduler: it owns timing, priority, stale-call rejection, variant
 * rotation and the single active source. Keeping one event director prevents
 * the same shell from producing parallel hit/module callouts.
 *
 * Loading is tolerant by design: a missing/undecodable file mutes that line
 * and logs one warning — the game never breaks on audio assets.
 */

interface VoiceLine {
  files: readonly string[];
  pri: number;
  cdS: number;
  group: string;
  groupCdS?: number;
  staleS?: number;
}

interface VoiceRequest {
  id: string;
  pri: number;
  group: string;
  atReq: number;
  readyAt: number;
  expiresAt: number;
}

interface VoiceLogEntry {
  id: string;
  file: string;
  t: number;
}

export interface VoiceSayOptions {
  prob?: number;
  force?: boolean;
  delayS?: number;
  staleS?: number;
}

export interface VoiceRadio {
  load(audioContext: AudioContext, voiceBus: GainNode): void;
  say(id: string, options?: VoiceSayOptions): boolean;
  update(): void;
  silence(): void;
  cancelPending(keepGroups?: readonly string[], stopObsoleteActive?: boolean): void;
  readonly log: VoiceLogEntry[];
  readonly loaded: boolean;
  debugState(): {
    currentPri: number;
    currentGroup: string | null;
    currentEnd: number;
    pending: VoiceRequest[];
  };
}

/** Line table: id → { files, pri 0..4, cdS, group, groupCdS?, staleS? }. */
export const VOICE_LINES: Readonly<Record<string, VoiceLine>> = {
  // battle envelope
  battle_start:     { files: ['battle_start.ogg', 'battle_start_b.ogg', 'battle_start_c.ogg'], pri: 2, cdS: 8, group: 'flow', staleS: 1.2 },
  victory:          { files: ['victory.ogg', 'victory_b.ogg'],                 pri: 4, cdS: 10, group: 'result', staleS: 8 },
  defeat:           { files: ['defeat.ogg', 'defeat_b.ogg'],                   pri: 4, cdS: 10, group: 'result', staleS: 8 },
  draw:             { files: ['draw.ogg'],                                     pri: 4, cdS: 10, group: 'result', staleS: 8 },
  // awareness
  enemy_spotted:    { files: ['enemy_spotted.ogg', 'enemy_spotted_b.ogg', 'enemy_spotted_c.ogg'], pri: 1, cdS: 10, group: 'awareness', groupCdS: 5, staleS: 0.9 },
  sixth_sense:      { files: ['sixth_sense.ogg', 'sixth_sense_b.ogg', 'sixth_sense_c.ogg'], pri: 3, cdS: 14, group: 'awareness', staleS: 1.0 },
  // gunnery reports
  firing:           { files: ['firing.ogg', 'firing_b.ogg', 'firing_c.ogg'],   pri: 0, cdS: 12, group: 'gun_cycle', staleS: 0.35 },
  penetration:      { files: ['penetration.ogg', 'penetration_b.ogg', 'penetration_c.ogg'], pri: 1, cdS: 6, group: 'shot_result', groupCdS: 3.5, staleS: 0.8 },
  ricochet:         { files: ['ricochet.ogg', 'ricochet_b.ogg'],               pri: 1, cdS: 5, group: 'shot_result', groupCdS: 3.5, staleS: 0.8 },
  enemy_crit:       { files: ['enemy_crit.ogg', 'enemy_crit_b.ogg', 'enemy_crit_c.ogg'], pri: 1, cdS: 8, group: 'shot_result', groupCdS: 3.5, staleS: 0.8 },
  enemy_ammo_rack:  { files: ['enemy_ammo_rack.ogg'],                          pri: 2, cdS: 12, group: 'shot_result', staleS: 1.0 },
  // A confirmed kill supersedes a generic penetration/critical report. Keep
  // it below survival/result priority 4, but high enough to cut old chatter.
  target_destroyed: { files: ['target_destroyed.ogg', 'target_destroyed_b.ogg', 'target_destroyed_c.ogg', 'target_destroyed_d.ogg'], pri: 3, cdS: 3.5, group: 'shot_result', staleS: 2.0 },
  // survival
  were_hit:         { files: ['were_hit.ogg', 'were_hit_b.ogg', 'were_hit_c.ogg'], pri: 2, cdS: 6, group: 'incoming', staleS: 0.8 },
  bounced_us:       { files: ['bounced_us.ogg', 'bounced_us_b.ogg', 'bounced_us_c.ogg'], pri: 2, cdS: 6, group: 'incoming', staleS: 0.8 },
  low_hp:           { files: ['low_hp.ogg', 'low_hp_b.ogg'],                   pri: 3, cdS: 25, group: 'damage', staleS: 1.1 },
  ammo_rack:        { files: ['ammo_rack.ogg', 'ammo_rack_b.ogg'],             pri: 4, cdS: 8, group: 'damage', staleS: 1.3 },
  fuel_tank:        { files: ['fuel_tank.ogg', 'fuel_tank_b.ogg'],             pri: 3, cdS: 10, group: 'damage', staleS: 1.1 },
  fire:             { files: ['fire.ogg', 'fire_b.ogg'],                       pri: 4, cdS: 10, group: 'damage', staleS: 1.3 },
  fire_out:         { files: ['fire_out.ogg', 'fire_out_b.ogg'],               pri: 2, cdS: 10, group: 'recovery', staleS: 1.2 },
  engine_damaged:   { files: ['engine_damaged.ogg', 'engine_damaged_b.ogg'],   pri: 3, cdS: 8, group: 'damage', staleS: 1.1 },
  track_gone:       { files: ['track_gone.ogg', 'track_gone_b.ogg'],           pri: 3, cdS: 6, group: 'damage', staleS: 1.1 },
  gun_damaged:      { files: ['gun_damaged.ogg', 'gun_damaged_b.ogg'],         pri: 3, cdS: 8, group: 'damage', staleS: 1.1 },
  optics_damaged:   { files: ['optics_damaged.ogg', 'optics_damaged_b.ogg'],   pri: 3, cdS: 10, group: 'damage', staleS: 1.1 },
  radio_damaged:    { files: ['radio_damaged.ogg', 'radio_damaged_b.ogg'],     pri: 3, cdS: 10, group: 'damage', staleS: 1.1 },
  commander_down:   { files: ['commander_down.ogg', 'commander_down_b.ogg'],   pri: 3, cdS: 12, group: 'damage', staleS: 1.1 },
  gunner_down:      { files: ['gunner_down.ogg', 'gunner_down_b.ogg'],         pri: 3, cdS: 12, group: 'damage', staleS: 1.1 },
  driver_down:      { files: ['driver_down.ogg', 'driver_down_b.ogg'],         pri: 3, cdS: 12, group: 'damage', staleS: 1.1 },
  loader_down:      { files: ['loader_down.ogg', 'loader_down_b.ogg'],         pri: 3, cdS: 12, group: 'damage', staleS: 1.1 },
  // loading / movement / flavor
  reloading:        { files: ['reloading.ogg', 'reloading_b.ogg'],             pri: 0, cdS: 9, group: 'gun_cycle', staleS: 0.45 },
  reloaded:         { files: ['reloaded.ogg', 'reloaded_b.ogg', 'reloaded_c.ogg'], pri: 0, cdS: 3, group: 'gun_cycle', staleS: 0.45 },
  on_the_move:      { files: ['on_the_move.ogg', 'on_the_move_b.ogg'],         pri: 1, cdS: 15, group: 'flow', staleS: 1.0 },
  repairs:          { files: ['repairs.ogg', 'repairs_b.ogg', 'repairs_c.ogg'], pri: 1, cdS: 8, group: 'recovery', staleS: 1.2 },
  crew_recovered:   { files: ['crew_recovered.ogg', 'crew_recovered_b.ogg'],   pri: 1, cdS: 8, group: 'recovery', staleS: 1.2 },
  track_repaired:   { files: ['track_repaired.ogg', 'track_repaired_b.ogg'],   pri: 1, cdS: 8, group: 'recovery', staleS: 1.2 },
  gun_repaired:     { files: ['gun_repaired.ogg', 'gun_repaired_b.ogg'],       pri: 1, cdS: 8, group: 'recovery', staleS: 1.2 },
  engine_repaired:  { files: ['engine_repaired.ogg', 'engine_repaired_b.ogg'], pri: 1, cdS: 8, group: 'recovery', staleS: 1.2 },
};

const GLOBAL_GAP_S = 0.22;   // dead air between any two lines
const QUEUE_MAX = 2;
const QUEUE_STALE_S = 1.2;

/**
 * Create the radio. Pure factory — call load() once the AudioContext exists.
 * @param {() => number} rng seeded 0..1 generator (shared with audio.ts)
 */
export function createVoiceRadio(rng: () => number): VoiceRadio {
  let ctx: AudioContext | null = null;
  let dest: GainNode | null = null;          // voice bus GainNode
  let loaded = false;
  let loading = false;
  /** file name → AudioBuffer|null */
  const buffers = new Map<string, AudioBuffer | null>();
  /** line id → last play time (ctx clock) */
  const lastPlay = new Map<string, number>();
  /** group → {t,pri}; prevents alternating line ids from becoming chatter. */
  const lastGroupPlay = new Map<string, { t: number; pri: number }>();
  const lastFile = new Map<string, string>();
  const queue: VoiceRequest[] = [];
  let currentEnd = -1;      // ctx time the playing line ends
  let currentPri = -1;
  let currentGroup: string | null = null;
  let currentSrc: AudioBufferSourceNode | null = null;
  /** Probe/debug trail: every line actually PLAYED. */
  const log: VoiceLogEntry[] = [];

  /**
   * Fetch + decode every line. Failures mute individual lines only.
   * @param {AudioContext} audioCtx
   * @param {GainNode} voiceBus
   */
  function load(audioCtx: AudioContext, voiceBus: GainNode) {
    if (loading || loaded) { dest = voiceBus; return; }
    loading = true;
    ctx = audioCtx;
    dest = voiceBus;
    const base = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/';
    const names = new Set<string>();
    for (const id of Object.keys(VOICE_LINES)) {
      for (const f of VOICE_LINES[id].files) names.add(f);
    }
    let failures = 0;
    const jobs = [...names].map((name) =>
      fetch(`${base}audio/voice/${name}`)
        .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); })
        .then((ab) => audioCtx.decodeAudioData(ab))
        .then((buf) => { buffers.set(name, buf); })
        .catch(() => { buffers.set(name, null); failures++; }));
    Promise.all(jobs).then(() => {
      loaded = true;
      if (failures) console.warn(`[audio] ${failures} crew voice line(s) failed to load — muted`);
    });
  }

  function playNow(id: string) {
    const line = VOICE_LINES[id];
    if (!line || !ctx || !dest) return false;
    const files = line.files;
    let fileI = (rng() * files.length) | 0;
    if (files.length > 1 && files[fileI] === lastFile.get(id)) fileI = (fileI + 1) % files.length;
    const file = files[fileI];
    const buf = buffers.get(file) || buffers.get(files[0]);
    if (!buf) return false;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 0.985 + rng() * 0.03;
    const g = ctx.createGain();
    g.gain.value = 1.0;
    src.connect(g);
    g.connect(dest);
    src.start(now);
    src.onended = () => {
      try { g.disconnect(); } catch { /* detached */ }
      if (currentSrc === src) {
        currentSrc = null;
        currentPri = -1;
        currentGroup = null;
      }
    };
    currentSrc = src;
    currentEnd = now + buf.duration / src.playbackRate.value;
    currentPri = line.pri;
    currentGroup = line.group || id;
    lastPlay.set(id, now);
    lastGroupPlay.set(currentGroup, { t: now, pri: line.pri });
    lastFile.set(id, file);
    log.push({ id, file, t: now });
    if (log.length > 64) log.shift();
    return true;
  }

  function stopCurrent() {
    const src = currentSrc;
    currentSrc = null;
    if (src) { try { src.stop(); } catch { /* stopped */ } }
    currentEnd = ctx ? ctx.currentTime : -1;
    currentPri = -1;
    currentGroup = null;
  }

  function cooldownActive(id: string, line: VoiceLine, now: number) {
    const last = lastPlay.get(id);
    if (last != null && now - last < line.cdS) return true;
    const group = line.group || id;
    const groupLast = lastGroupPlay.get(group);
    return !!(line.groupCdS && groupLast && groupLast.pri >= line.pri &&
      now - groupLast.t < line.groupCdS);
  }

  function enqueue(
    id: string,
    line: VoiceLine,
    now: number,
    delayS: number,
    staleS: number | undefined,
  ) {
    const group = line.group || id;
    for (let i = queue.length - 1; i >= 0; i--) {
      if (queue[i].group !== group) continue;
      if (queue[i].pri > line.pri) return false;
      queue.splice(i, 1); // newest equal/higher call is the relevant one
    }
    if (line.pri >= 3) {
      for (let i = queue.length - 1; i >= 0; i--) {
        if (queue[i].pri < line.pri) queue.splice(i, 1);
      }
    }
    if (queue.length >= QUEUE_MAX) {
      let worst = 0;
      for (let i = 1; i < queue.length; i++) {
        if (queue[i].pri < queue[worst].pri ||
            (queue[i].pri === queue[worst].pri && queue[i].atReq < queue[worst].atReq)) worst = i;
      }
      if (queue[worst].pri >= line.pri) return false;
      queue.splice(worst, 1);
    }
    const readyAt = now + Math.max(0, delayS || 0);
    queue.push({ id, pri: line.pri, group, atReq: now, readyAt,
      expiresAt: readyAt + (staleS ?? line.staleS ?? QUEUE_STALE_S) });
    return true;
  }

  function canInterrupt(pri: number, now: number): boolean {
    return !!currentSrc && currentEnd - now > 0.12 &&
      ((pri >= 4 && currentPri < 4) || (pri >= 3 && currentPri <= 1));
  }

  /**
   * Request a line. Returns true if played or queued.
   * @param {string} id key of VOICE_LINES
   * @param {{prob?: number, force?: boolean, delayS?: number, staleS?: number}} [opts]
   *   chance gate, presentation delay and optional queue patience override;
   *   force bypasses cooldown/busy discipline (probe/debug only)
   */
  function say(id: string, opts?: VoiceSayOptions) {
    if (!loaded || !ctx || !dest) return false;
    const line = VOICE_LINES[id];
    if (!line) return false;
    if (opts && opts.force) { queue.length = 0; stopCurrent(); return playNow(id); }
    if (opts && typeof opts.prob === 'number' && rng() > opts.prob) return false;
    const now = ctx.currentTime;
    if (cooldownActive(id, line, now)) return false;
    const delayS = Math.max(0, (opts && opts.delayS) || 0);
    const busyUntil = currentEnd + GLOBAL_GAP_S;
    if (currentGroup === (line.group || id) && now < currentEnd && line.pri <= currentPri) return false;
    if (delayS === 0 && now >= busyUntil) {
      return playNow(id);
    }
    // Urgent survival/result speech may cut clearly lower-priority chatter.
    if (delayS === 0 && canInterrupt(line.pri, now)) {
      stopCurrent();
      for (let i = queue.length - 1; i >= 0; i--) if (queue[i].pri < line.pri) queue.splice(i, 1);
      return playNow(id);
    }
    if (line.pri === 0 && now < busyUntil) return false; // flavor never backlogs
    return enqueue(id, line, now, delayS, opts?.staleS);
  }

  /** Drain the queue — call per frame (cheap). */
  function update() {
    if (!loaded || !ctx || queue.length === 0) return;
    const now = ctx.currentTime;
    for (let i = queue.length - 1; i >= 0; i--) {
      if (now > queue[i].expiresAt) queue.splice(i, 1);
    }
    if (queue.length === 0) return;
    let best = -1;
    for (let i = 0; i < queue.length; i++) {
      if (queue[i].readyAt > now) continue;
      if (best < 0 || queue[i].pri > queue[best].pri ||
          (queue[i].pri === queue[best].pri && queue[i].atReq < queue[best].atReq)) best = i;
    }
    if (best < 0) return;
    if (now < currentEnd + GLOBAL_GAP_S) {
      if (!canInterrupt(queue[best].pri, now)) return;
      stopCurrent();
    }
    const { id } = queue.splice(best, 1)[0];
    if (!cooldownActive(id, VOICE_LINES[id], now)) playNow(id);
  }

  /** Hard cut — battle ended / entered garage. Clears queue, stops speech. */
  function silence() {
    queue.length = 0;
    stopCurrent();
  }

  /** Drop calls whose moment has passed while optionally preserving groups
   *  such as the final shot confirmation; battle end may also cut an active
   *  obsolete awareness/flavor call. */
  function cancelPending(keepGroups: readonly string[] = [], stopObsoleteActive = false) {
    const keep = new Set(keepGroups);
    for (let i = queue.length - 1; i >= 0; i--) {
      if (!keep.has(queue[i].group)) queue.splice(i, 1);
    }
    if (stopObsoleteActive && currentSrc && (!currentGroup || !keep.has(currentGroup))) stopCurrent();
  }

  return {
    load, say, update, silence, cancelPending, log,
    get loaded() { return loaded; },
    debugState() {
      return { currentPri, currentGroup, currentEnd, pending: queue.map((q) => ({ ...q })) };
    },
  };
}
