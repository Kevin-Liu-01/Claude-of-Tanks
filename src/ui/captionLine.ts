// captionLine.ts — the crew's radio as subtitles (notices-audit-275; Kevin 2026-11-21: "Build a caption line").
// Copyright © 2026 Kevin B. Liu.
//
// The sound engine publishes every transmission the crew radio keys as an 'audio:caption' (src/audio/captions.ts), with
// the line, the take spoken and the speaking role; this draws it: the role, then what was said, in the player's caption
// language (the script carries en-US and zh-CN; every other interface language reads the English). Crew voice only: the
// alarms and the sound cues the stream also captions say what the status chips, the hit wedges and the incoming rows
// already show.
//
// Off by default (Settings > Sound > Crew radio > Captions): nothing in the accessibility settings implies captions (no
// hearing preference exists), and a caption the player did not ask for is one more line over the battle. A newer line
// replaces the shown one; each stays its transmission's length plus a beat to read it (the stream's holdS), held through
// the game's pause. Its place is the guidance plan's (guidancePlan.ts captions): on the window's centre line below the
// sight, never on the sight, the centre notices (the detection and the event lane) or a control; where nothing clears it
// waits unseen. The script loads with the first caption, its own chunk.
import { createLazyChunk } from '../app/lazyChunk.ts';
import { esc } from './components/escape.ts';
import { getLocale, t } from './i18n.ts';

interface CaptionPayload {
  readonly kind?: string;
  readonly id?: string;
  readonly speaker?: string | null;
  readonly take?: number | null;
  readonly holdS?: number;
}

interface CaptionLineHost {
  readonly root: HTMLElement;
  readonly doc: Pick<Document, 'createElement'>;
  readonly bus: { on(type: string, listener: (payload: any) => void): unknown };
  /** The Captions setting, read at each caption. */
  enabled(): boolean;
}

const SPEAKERS = new Set(['commander', 'gunner', 'loader', 'driver']);
const script = createLazyChunk(() => import('../audio/captionScript.generated.ts').then((module) => module.CAPTION_SCRIPT));
// (the HUD's layout places it: told when it comes and when it goes, battleHudLayout.ts)
const relayout = (): void => { if (typeof window !== 'undefined') window.dispatchEvent(new Event('cot-hud-relayout')); };

export function createCaptionLine(host: CaptionLineHost) {
  const el = host.doc.createElement('div');
  el.className = 'cot-caption-line';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.hidden = true;
  host.root.append(el);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let leftMs = 0;
  let since = 0;
  let paused = false;
  let serial = 0;

  function hide(): void {
    if (timer) clearTimeout(timer);
    timer = null;
    if (el.hidden) return;
    el.hidden = true;
    el.replaceChildren();
    relayout();
  }
  function run(): void {
    if (timer) clearTimeout(timer);
    timer = null;
    if (paused || el.hidden) return;
    since = performance.now();
    timer = setTimeout(hide, leftMs);
  }

  host.bus.on('audio:caption', (payload: CaptionPayload) => {
    if (payload?.kind !== 'radio' || !payload.id || !host.enabled()) return;
    const ask = ++serial;
    void script.load().then((table) => {
      // (a newer caption asked meanwhile wins; a battle that ended meanwhile shows nothing)
      if (ask !== serial) return;
      const lines = table[payload.id!];
      if (!lines) return;
      const takes = lines[getLocale() === 'zh-CN' ? 'zh-CN' : 'en-US'];
      const text = takes[payload.take ?? 0] ?? takes[0];
      if (!text) return;
      const role = payload.speaker && SPEAKERS.has(payload.speaker) ? t(`garage.crew.${payload.speaker}`) : '';
      el.innerHTML = (role ? `<span class="cot-caption-line__who">${esc(role)}</span>` : '')
        + `<span class="cot-caption-line__text">${esc(text)}</span>`;
      const wasHidden = el.hidden;
      el.hidden = false;
      leftMs = Math.max(1600, (payload.holdS ?? 2) * 1000);
      run();
      if (wasHidden) relayout();
    }, () => { /* a failed script chunk loses the captions, never the battle */ });
  });
  host.bus.on('ui:pause', (payload: { on?: boolean }) => {
    const on = !!payload?.on;
    if (on === paused) return;
    paused = on;
    if (on && timer) { clearTimeout(timer); timer = null; leftMs = Math.max(0, leftMs - (performance.now() - since)); }
    else run();
  });
  for (const type of ['battle:ended', 'battle:restarted', 'killcam:begin']) host.bus.on(type, () => { serial++; hide(); });

  return { el, hide };
}
