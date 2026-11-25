/**
 * Export video (replay-fixes-277; Kevin 11-24: "be able to export it as a mp4", approved: 720p or 1080p, 30 or 60, the
 * whole replay or from the playhead, the HUD optional and off): the dialog the replay strip's film button opens. It asks
 * main.ts's exportReplayFilm for the film (game/replay/replayFilm.ts: offline and fixed-step through the viewer's camera,
 * H.264 in MP4 only), shows its progress with Cancel, and says plainly what the file will not have: sound (v1), and on a
 * browser that cannot encode MP4, the file itself (the button stays off; it never hands over a WebM). A lazy chunk
 * (main.ts loads it on the first press); its strings are the replay.export.* keys.
 */
import { createModal } from './modal.ts';
import { segmented, wireRoving } from './components/components.ts';
import { t } from './i18n.ts';
import { REPLAY_FILM_LONG_S, REPLAY_FILM_RATES, REPLAY_FILM_SIZES } from '../game/replay/replayFilm.ts';

export interface ReplayFilmChoice {
  width: number;
  height: number;
  fps: number;
  fromS: number;
  toS: number;
  hud: boolean;
}

export interface ReplayFilmDialogPorts {
  /** The watched replay's length and the playhead, in battle seconds. */
  span(): { durationS: number; timeS: number };
  /** Whether this browser encodes MP4 at this size and rate (studioFilmExport.ts mp4EncodeSupported). */
  supported(width: number, height: number, fps: number): Promise<boolean>;
  /** Film it (main.ts exportReplayFilm): resolves with the saved file, rejects on a failure or a cancel. */
  film(choice: ReplayFilmChoice, signal: AbortSignal, onProgress: (frame: number, frames: number, remainingMs: number | null) => void):
    Promise<{ name: string; bytes: number } | null>;
  onOpenChange?(open: boolean): void;
}

const STYLE_ID = 'cot-replay-film-style';
const STYLE = `
.cot-replay-film .grid{display:grid;gap:var(--s3)}
.cot-replay-film fieldset{margin:0;padding:0;border:0;display:grid;gap:var(--s1)}
.cot-replay-film legend{padding:0;margin:0 0 var(--s1);font:600 var(--fs-12)/1 var(--font-ui);letter-spacing:.04em;text-transform:uppercase;color:var(--ink-2)}
.cot-replay-film .opts{display:flex;flex-wrap:wrap;gap:var(--s2)}
.cot-replay-film .opt{display:inline-flex;align-items:center;gap:var(--s2);min-height:36px;padding:0 var(--s3);border-radius:var(--control-radius);
 box-shadow:var(--ring-2);font:500 var(--fs-14)/1 var(--font-ui);color:var(--ink-1);cursor:pointer}
.cot-replay-film .opt:has(input:checked){box-shadow:var(--ring-accent);background:var(--accent-wash);color:var(--accent-hi)}
.cot-replay-film .opt input{margin:0;accent-color:var(--accent)}
.cot-replay-film .note{margin:0;font:500 var(--fs-13)/1.35 var(--font-ui);color:var(--ink-2)}
.cot-replay-film .note.warn{color:var(--danger)}
.cot-replay-film .note:empty{display:none}
.cot-replay-film progress{width:100%;height:8px;accent-color:var(--accent)}
.cot-replay-film progress[hidden]{display:none}
`;

/** m:ss of a battle time. */
const clock = (seconds: number): string => {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};
const megabytes = (bytes: number): string => `${(bytes / 1e6).toFixed(1)} MB`;

export function createReplayFilmDialog(ports: ReplayFilmDialogPorts) {
  if (typeof document !== 'undefined' && !document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = STYLE;
    document.head.append(style);
  }
  let running: AbortController | null = null;
  const modal = createModal({
    surface: 'replay-film', title: t('replay.export.title'), size: 'medium', closeLabel: t('replay.export.close'),
    onOpen: () => ports.onOpenChange?.(true),
    onClose: () => { running?.abort(); ports.onOpenChange?.(false); },
  });
  modal.root.classList.add('cot-replay-film');
  // the three choices on the kit's segmented control (interactionRegistry.ts replay-film-size / -rate / -range)
  const chosen = { size: REPLAY_FILM_SIZES[0]!.id as string, fps: String(REPLAY_FILM_RATES[0]), range: 'all' };
  const legend = (label: string, control: string): string => `<fieldset><legend>${label}</legend>${control}</fieldset>`;
  modal.body.innerHTML = `<div class="grid">
    ${legend(t('replay.export.size'), segmented({ label: t('replay.export.size'), className: 'cot-replay-film-size', value: chosen.size,
      options: REPLAY_FILM_SIZES.map((size) => ({ value: size.id, label: `${size.height}p` })) }))}
    ${legend(t('replay.export.rate'), segmented({ label: t('replay.export.rate'), className: 'cot-replay-film-fps', value: chosen.fps,
      options: REPLAY_FILM_RATES.map((fps) => ({ value: String(fps), label: `${fps} fps` })) }))}
    ${legend(t('replay.export.range'), segmented({ label: t('replay.export.range'), className: 'cot-replay-film-range', value: chosen.range,
      options: [{ value: 'all', label: '' }, { value: 'here', label: '' }] }))}
    <label class="opt"><input type="checkbox" name="hud">${t('replay.export.hud')}</label>
    <p class="note" data-note="audio">${t('replay.export.noAudio')}</p>
    <p class="note" data-note="hint"></p>
    <p class="note" data-note="status" aria-live="polite"></p>
    <p class="note warn" data-note="problem" role="alert"></p>
    <progress max="1" value="0" hidden></progress>
  </div>`;
  const wire = (selector: string, name: keyof typeof chosen): void => {
    wireRoving(modal.body.querySelector<HTMLElement>(selector)!, (value) => { chosen[name] = value; void refresh(); });
  };
  wire('.cot-replay-film-size', 'size');
  wire('.cot-replay-film-fps', 'fps');
  wire('.cot-replay-film-range', 'range');
  const start = document.createElement('button');
  start.type = 'button';
  start.className = 'cot-c-btn cot-c-btn--primary cot-c-btn--48';
  start.dataset.uiSound = 'confirm';
  start.textContent = t('replay.export.start');
  modal.footer.append(start);
  const field = <T extends HTMLElement>(selector: string) => modal.body.querySelector(selector) as T;
  const hint = field<HTMLElement>('[data-note="hint"]');
  const status = field<HTMLElement>('[data-note="status"]');
  const problem = field<HTMLElement>('[data-note="problem"]');
  const bar = field<HTMLProgressElement>('progress');
  const rangeLabels = modal.body.querySelectorAll<HTMLElement>('.cot-replay-film-range [data-value] span');

  const choice = (): ReplayFilmChoice => {
    const size = REPLAY_FILM_SIZES.find((entry) => entry.id === chosen.size) ?? REPLAY_FILM_SIZES[0]!;
    const { durationS, timeS } = ports.span();
    const fromS = chosen.range === 'here' ? Math.min(timeS, Math.max(0, durationS - 1)) : 0;
    return { width: size.width, height: size.height, fps: Number(chosen.fps) || 30, fromS, toS: durationS,
      hud: (field<HTMLInputElement>('input[name="hud"]')).checked };
  };
  let checkTicket = 0;
  /** The range's words, the long-film hint and whether this browser can make the film at all (the button with it). */
  const refresh = async (): Promise<void> => {
    const { durationS, timeS } = ports.span();
    const labels = [t('replay.export.rangeAll', { length: clock(durationS) }), t('replay.export.rangeHere', { from: clock(timeS), to: clock(durationS) })];
    rangeLabels.forEach((span, k) => { span.textContent = labels[k] ?? ''; });
    const want = choice();
    hint.textContent = want.height >= 1080 && want.fps >= 60 && want.toS - want.fromS > REPLAY_FILM_LONG_S ? t('replay.export.long') : '';
    const ticket = ++checkTicket;
    const ok = await ports.supported(want.width, want.height, want.fps);
    if (ticket !== checkTicket) return;
    problem.textContent = ok ? '' : t('replay.export.unsupported');
    start.disabled = !ok || !!running;
  };
  modal.body.addEventListener('change', () => { void refresh(); });

  start.addEventListener('click', () => {
    if (running) { running.abort(); return; }
    const want = choice();
    const controller = new AbortController();
    running = controller;
    start.textContent = t('replay.export.cancel');
    start.dataset.uiSound = 'press';
    problem.textContent = '';
    bar.hidden = false;
    bar.value = 0;
    for (const input of modal.body.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, .cot-c-seg__opt')) input.disabled = true;
    status.textContent = '';
    void ports.film(want, controller.signal, (frame, frames, remainingMs) => {
      bar.value = frames ? frame / frames : 0;
      status.textContent = t('replay.export.progress', { frame, frames }) + (remainingMs != null ? ` · ${t('replay.export.left', { time: clock(remainingMs / 1000) })}` : '');
    }).then((saved) => {
      status.textContent = saved ? t('replay.export.done', { name: saved.name, size: megabytes(saved.bytes) }) : '';
    }, (error: unknown) => {
      status.textContent = '';
      if (!controller.signal.aborted) problem.textContent = t('replay.export.failed', { reason: error instanceof Error ? error.message : String(error) });
    }).finally(() => {
      running = null;
      bar.hidden = true;
      start.textContent = t('replay.export.start');
      start.dataset.uiSound = 'confirm';
      for (const input of modal.body.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, .cot-c-seg__opt')) input.disabled = false;
      void refresh();
    });
  });

  return {
    open(trigger?: HTMLElement | null) {
      problem.textContent = '';
      hint.textContent = '';
      if (!running) status.textContent = '';
      modal.open(trigger ? { trigger } : {});
      void refresh();
    },
    isOpen: () => modal.isOpen(),
    close: () => modal.close(),
  };
}
