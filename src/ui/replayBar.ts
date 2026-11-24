/**
 * The replay viewer's bar (replay-system, docs/REPLAY.md §5 "Timeline", "Transport", "Phones"): one panel on the floor of
 * a watched replay. The top row is the transport (play, the speed, the previous and next mark, the battle clock, the
 * filter and the way out); under it, the battle's timeline: every mark in its side's colour, a kill taller than the
 * rest, the playhead, and the part the indexer has not reached yet shaded. A press on the track seeks, a press on a mark
 * (16 px with a mouse, 44 px with a finger: replayTimeline.ts) seeks before it and rides its shooter; hovering a mark
 * names it. While the index builds the bar says so and shows its progress; a refused or drifted replay keeps its
 * timeline and says why (Kevin's decision 4). On a phone the row keeps play, the speed and the clock.
 *
 * It only draws: the controller (game/replay/replayViewer.ts) owns the clock and the marks. Per frame it moves the
 * playhead and the clock's text; the marks are rebuilt only when the shown list changes. Styles in the 'surfaces' layer
 * on the HUD's tokens (styleLayers.ts), as the Watch bar's.
 */
import { t } from './i18n.ts';
import { icon } from './icons/icon.ts';
import { ensureStyle } from './styleLayers.ts';
import { setBodyFlag } from './bodyFlags.ts';
import type { ReplayBarState } from '../game/replay/replayViewer.ts';
import type { ReplayKeyAction } from '../game/replay/replayPlayback.ts';
import { markAt, markTargetPx, timeAtX, type TimelineFilter, type TimelineMark } from '../game/replay/replayTimeline.ts';

export interface ReplayBarHandlers {
  key(action: ReplayKeyAction): void;
  scrub(timeS: number): void;
  pickMark(mark: TimelineMark): void;
  setFilter(filter: TimelineFilter): void;
  leave(): void;
  /** A spec id's vehicle name (the battle's own hulls name theirs). */
  nameOf(specId: string): string;
  /** The kit's segmented control and its roving keys (components.ts), through the host as photo mode's are: this lazy
   *  chunk imports nothing of the kit, which stays in the boot chunk that already has it. */
  kit: { segmented: typeof import('./components/components.ts').segmented; wireRoving: typeof import('./components/components.ts').wireRoving };
}

export interface ReplayBar {
  /** The controller's state (null while the index builds) and the index's progress (null once it is built). */
  update(state: ReplayBarState | null, indexing: { tick: number; lastTick: number } | null): void;
  /** A refused recording's timeline alone, with no transport (no battle was entered). */
  showStatic(state: ReplayBarState): void;
  dispose(): void;
}

const STYLE = `
.cot-replay{position:absolute;left:50%;bottom:var(--inset-bottom);transform:translateX(-50%);z-index:var(--z-hud-controls);
 box-sizing:border-box;display:grid;gap:var(--s2);width:min(960px,calc(100% - 2 * var(--s4)));padding:var(--s2) var(--s3) var(--s3);
 background:var(--hud-plate);border-radius:var(--r1);box-shadow:var(--ring-1);font-family:var(--font-ui);color:var(--ink-1);pointer-events:auto}
.cot-replay[hidden]{display:none}
.cot-replay .row{display:flex;align-items:center;gap:var(--s1);min-width:0}
.cot-replay .rb{display:inline-flex;align-items:center;justify-content:center;gap:var(--s1);min-width:40px;height:40px;padding:0 var(--s2);
 border:0;border-radius:var(--control-radius);background:transparent;color:var(--ink-1);font:600 var(--fs-14)/1 var(--font-display);cursor:pointer}
.cot-replay .rb:focus-visible{outline:none;box-shadow:var(--focus-ring)}
@media(hover:hover){.cot-replay .rb:not(:disabled):hover{box-shadow:var(--ring-3)}}
.cot-replay .rb:disabled{opacity:.34;cursor:default}
.cot-replay .rb[aria-pressed=true]{background:var(--accent-wash);color:var(--accent-hi)}
.cot-replay .rb .chev{display:block;width:8px;height:8px;border:solid currentColor;border-width:0 0 2px 2px;transform:rotate(45deg)}
.cot-replay .rb.next .chev{transform:rotate(-135deg)}
.cot-replay .rb .cot-c-kbd{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 5px;
 border-radius:var(--control-radius);box-shadow:var(--ring-3);font:500 var(--fs-11)/1 var(--font-data);color:var(--ink-2)}
.cot-replay .speed{min-width:56px;font-family:var(--font-data)}
.cot-replay .tm{margin:0 var(--s2);font:500 var(--fs-14)/1 var(--font-data);color:var(--ink-1);white-space:nowrap}
.cot-replay .tm span{color:var(--ink-2)}
.cot-replay .grow{flex:1 1 auto}
.cot-replay .cot-replay-filter{flex:none}
.cot-replay .note{min-height:0;font:500 var(--fs-12)/1.3 var(--font-ui);color:var(--ink-2)}
.cot-replay .note:empty{display:none}
.cot-replay .tk{position:relative;height:28px;touch-action:none;cursor:pointer}
.cot-replay .tk .ln{position:absolute;left:0;right:0;top:50%;height:4px;margin-top:-2px;background:var(--line-3);border-radius:2px}
.cot-replay .tk .av{position:absolute;left:0;top:50%;height:4px;margin-top:-2px;background:var(--ink-3);border-radius:2px}
.cot-replay .tk .ph{position:absolute;top:0;bottom:0;width:2px;margin-left:-1px;background:var(--accent);border-radius:1px;pointer-events:none}
.cot-replay .tk .mk{--tone:var(--ink-2);position:absolute;top:50%;width:8px;height:8px;margin:-4px 0 0 -4px;background:var(--tone);
 transform:rotate(45deg);pointer-events:none}
.cot-replay .tk .mk[data-side=own]{--tone:var(--team-own)}.cot-replay .tk .mk[data-side=enemy]{--tone:var(--team-enemy)}
.cot-replay .tk .mk[data-cat=kill]{width:10px;height:10px;margin:-5px 0 0 -5px;box-shadow:var(--ring-2)}
.cot-replay .tk .mk[data-cat=end]{width:2px;height:16px;margin:-8px 0 0 -1px;transform:none}
.cot-replay .tip{position:absolute;bottom:calc(100% + var(--s1));transform:translateX(-50%);padding:var(--s1) var(--s2);background:var(--hud-plate);
 border-radius:var(--control-radius);box-shadow:var(--ring-2);font:500 var(--fs-12)/1.2 var(--font-ui);white-space:nowrap;pointer-events:none}
.cot-replay .tip[hidden]{display:none}
.cot-replay.static .transport>:not(.grow,.leave){display:none}
.cot-replay.static .tk{cursor:default}
body.cot-replay-live .cot-watch{bottom:calc(var(--inset-bottom) + 112px)}
body.cot-replay-live .cot-watch .wb.seat{display:none}
@media(hover:none),(pointer:coarse){.cot-replay .cot-c-kbd{display:none}.cot-replay .tk{height:44px}}
@media(max-width:700px){
 .cot-replay{left:max(12px,env(safe-area-inset-left));right:max(12px,env(safe-area-inset-right));width:auto;transform:none}
 .cot-replay :is(.mark,.cot-replay-filter){display:none}
 body.cot-replay-live .cot-watch{bottom:calc(var(--inset-bottom) + 128px)}
}
@media(max-height:500px){
 .cot-replay{padding:var(--s1) var(--s2);gap:var(--s1)}.cot-replay .rb{height:34px;min-width:34px}
 .cot-replay .tk{height:24px}
 body.cot-replay-live .cot-watch{bottom:calc(var(--inset-bottom) + 92px)}
}
`;

const FILTERS: readonly { readonly id: 'all' | 'kills' | 'tank'; readonly key: string }[] = [
  { id: 'all', key: 'replay.filter.all' }, { id: 'kills', key: 'replay.filter.kills' }, { id: 'tank', key: 'replay.filter.tank' },
];

const keycap = (key: string): string => `<kbd class="cot-c-kbd" aria-hidden="true">${key}</kbd>`;
const escapeHtml = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** m:ss of a battle time. */
function replayClockText(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/** The side a mark's team is drawn in: the enemy side's, else the own side's; the end is nobody's. */
const sideOf = (team: string): string => (!team ? 'none' : team === 'enemy' ? 'enemy' : 'own');

/** A mark's words: its key with the hulls' vehicle names. */
function replayMarkLabel(mark: TimelineMark, nameOf: (specId: string) => string): string {
  return t(mark.label.key, { actor: mark.label.actorSpec ? nameOf(mark.label.actorSpec) : '', subject: mark.label.subjectSpec ? nameOf(mark.label.subjectSpec) : '' });
}

export function createReplayBar(host: () => HTMLElement, handlers: ReplayBarHandlers): ReplayBar {
  ensureStyle('cot-replay-style', STYLE, 'surfaces');
  const root = document.createElement('div');
  root.className = 'cot-replay';
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', t('replay.timeline'));
  root.innerHTML = `
    <div class="row transport">
      <button type="button" class="rb play" data-action="toggle">${icon('play', { size: 20 })}</button>
      <button type="button" class="rb speed" data-action="speed"></button>
      <button type="button" class="rb mark prev" data-action="markPrevious" aria-label="${escapeHtml(t('replay.previousMark'))}"><i class="chev"></i>${keycap('[')}</button>
      <button type="button" class="rb mark next" data-action="markNext" aria-label="${escapeHtml(t('replay.nextMark'))}">${keycap(']')}<i class="chev"></i></button>
      <span class="tm"><b>0:00</b> <span>/ 0:00</span></span>
      <span class="grow"></span>
      ${handlers.kit.segmented({ label: t('replay.timeline'), className: 'cot-replay-filter', value: 'all',
        options: FILTERS.map((f) => ({ value: f.id, label: t(f.key) })) })}
      <button type="button" class="rb leave" data-action="leave" aria-label="${escapeHtml(t('replay.leave'))}">${icon('close', { size: 20 })}</button>
    </div>
    <div class="note" aria-live="polite"></div>
    <div class="tk" role="slider" aria-label="${escapeHtml(t('replay.timeline'))}" aria-valuemin="0" tabindex="0">
      <div class="ln"></div><div class="av"></div><div class="marks"></div><div class="ph"></div><div class="tip" hidden></div>
    </div>`;
  const q = <T extends Element>(selector: string) => root.querySelector(selector) as T;
  const playButton = q<HTMLButtonElement>('.play');
  const speedButton = q<HTMLButtonElement>('.speed');
  const clockNow = q<HTMLElement>('.tm b');
  const clockEnd = q<HTMLElement>('.tm span');
  const note = q<HTMLElement>('.note');
  const track = q<HTMLElement>('.tk');
  const availableFill = q<HTMLElement>('.av');
  const marksHost = q<HTMLElement>('.marks');
  const playhead = q<HTMLElement>('.ph');
  const tip = q<HTMLElement>('.tip');
  const tankFilter = root.querySelectorAll<HTMLButtonElement>('.cot-replay-filter [data-value]')[FILTERS.length - 1] ?? null;
  const unwireFilter = handlers.kit.wireRoving(root.querySelector<HTMLElement>('.cot-replay-filter')!, (value) => {
    handlers.setFilter(value === 'tank' ? (state?.focusId ? { hull: state.focusId } : 'all') : value as 'all' | 'kills');
  });
  root.addEventListener('pointerdown', (event) => event.stopPropagation());

  let state: ReplayBarState | null = null;
  let staticMode = false;
  let drawnMarks: readonly TimelineMark[] | null = null;
  let drawnDuration = -1;
  let shownPlaying: boolean | null = null;
  let shownSpeed = -1;
  let shownSecond = -1;
  let shownFilter = '';
  let shownNote = '';
  let dragging = false;

  const coarse = (): boolean => typeof matchMedia === 'function' && matchMedia('(pointer:coarse)').matches;
  const pointerX = (event: PointerEvent): { x: number; width: number } => {
    const rect = track.getBoundingClientRect();
    return { x: event.clientX - rect.left, width: rect.width };
  };

  root.addEventListener('click', (event) => {
    const button = (event.target as Element).closest('button');
    if (!button) return;
    const action = button.dataset.action;
    if (action === 'leave') handlers.leave();
    else if (action === 'speed') handlers.key(`speed:${((state?.speedIndex ?? 2) + 1) % 5}`);
    else if (action === 'toggle' || action === 'markPrevious' || action === 'markNext') handlers.key(action);
  });

  track.addEventListener('pointerdown', (event) => {
    if (!state || staticMode && !state.marks.length) return;
    const { x, width } = pointerX(event);
    const mark = markAt(state.marks, x, state.durationS, width, markTargetPx(coarse() || event.pointerType === 'touch'));
    if (mark && !staticMode) { handlers.pickMark(mark); return; }
    if (staticMode) return;
    dragging = true;
    track.setPointerCapture?.(event.pointerId);
    handlers.scrub(timeAtX(x, state.durationS, width));
  });
  track.addEventListener('pointermove', (event) => {
    if (!state) return;
    const { x, width } = pointerX(event);
    if (dragging) { handlers.scrub(timeAtX(x, state.durationS, width)); return; }
    if (event.pointerType === 'touch') return;
    const mark = markAt(state.marks, x, state.durationS, width, markTargetPx(false));
    if (!mark) { tip.hidden = true; return; }
    tip.textContent = replayMarkLabel(mark, handlers.nameOf);
    tip.style.left = `${(mark.timeS / Math.max(1e-6, state.durationS)) * 100}%`;
    tip.hidden = false;
  });
  const endDrag = (): void => { dragging = false; };
  track.addEventListener('pointerup', endDrag);
  track.addEventListener('pointercancel', endDrag);
  track.addEventListener('pointerleave', () => { tip.hidden = true; });
  track.addEventListener('keydown', (event) => {
    if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
      event.preventDefault();
      event.stopPropagation();
      handlers.key(event.code === 'ArrowLeft' ? 'back' : 'forward');
    }
  });

  const drawMarks = (next: ReplayBarState): void => {
    if (next.marks === drawnMarks && next.durationS === drawnDuration) return;
    drawnMarks = next.marks;
    drawnDuration = next.durationS;
    const span = Math.max(1e-6, next.durationS);
    marksHost.innerHTML = next.marks.map((mark) =>
      `<i class="mk" data-cat="${mark.category}" data-side="${sideOf(mark.team)}" style="left:${((mark.timeS / span) * 100).toFixed(3)}%"></i>`).join('');
  };

  const noticeText = (next: ReplayBarState | null, indexing: { tick: number; lastTick: number } | null): string => {
    if (indexing) return `${t('replay.indexing')} ${Math.round(Math.min(1, indexing.tick / Math.max(1, indexing.lastTick)) * 100)}%`;
    const notice = next?.notice;
    if (!notice) return '';
    if (notice.kind === 'refused') return t('replay.refused', { version: notice.version });
    if (notice.kind === 'drifted') return t('replay.drifted', { time: replayClockText(notice.timeS) });
    return t('replay.unavailable');
  };

  const paint = (next: ReplayBarState | null, indexing: { tick: number; lastTick: number } | null): void => {
    const text = noticeText(next, indexing);
    if (text !== shownNote) { shownNote = text; note.textContent = text; }
    for (const button of root.querySelectorAll<HTMLButtonElement>('.transport button:not(.leave):not([data-value])')) button.disabled = !next;
    track.toggleAttribute('aria-disabled', !next);
    if (!next) return;
    drawMarks(next);
    const span = Math.max(1e-6, next.durationS);
    playhead.style.left = `${(next.timeS / span) * 100}%`;
    availableFill.style.width = `${(next.availableS / span) * 100}%`;
    const second = Math.floor(next.timeS);
    if (second !== shownSecond || drawnDuration !== next.durationS) {
      shownSecond = second;
      clockNow.textContent = replayClockText(next.timeS);
      clockEnd.textContent = `/ ${replayClockText(next.durationS)}`;
      track.setAttribute('aria-valuemax', String(Math.round(next.durationS)));
      track.setAttribute('aria-valuenow', String(second));
      track.setAttribute('aria-valuetext', replayClockText(next.timeS));
    }
    if (next.playing !== shownPlaying) {
      shownPlaying = next.playing;
      playButton.innerHTML = icon(next.playing ? 'pause' : 'play', { size: 20 });
      playButton.setAttribute('aria-label', t(next.playing ? 'replay.pause' : 'replay.play'));
    }
    if (next.speed !== shownSpeed) {
      shownSpeed = next.speed;
      speedButton.textContent = `${next.speed}×`;
      speedButton.setAttribute('aria-label', `${t('replay.speed')} ${next.speed}×`);
    }
    const filterId = next.filter === 'all' || next.filter === 'kills' ? next.filter : 'tank';
    const filterKey = `${filterId}:${next.focusId ?? ''}`;
    if (filterKey !== shownFilter) {
      shownFilter = filterKey;
      // the segmented control keeps its own checked option (only it changes the filter); 'this tank' only while riding one
      if (tankFilter) tankFilter.disabled = !next.focusId;
    }
  };

  let mounted = false;
  const mount = (): void => {
    if (mounted) return;
    mounted = true;
    host().append(root);
  };

  return {
    update(next, indexing) {
      mount();
      staticMode = false;
      root.classList.remove('static');
      setBodyFlag('cot-replay-live', 'replay', true);
      state = next;
      paint(next, indexing);
    },
    showStatic(next) {
      mount();
      staticMode = true;
      root.classList.add('static');
      state = next;
      paint(next, null);
    },
    dispose() {
      unwireFilter();
      setBodyFlag('cot-replay-live', 'replay', false);
      root.remove();
      mounted = false;
      state = null;
    },
  };
}
