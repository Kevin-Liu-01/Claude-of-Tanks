/**
 * respawnDial.ts — the respawn countdown (death-flow-275; Kevin 2026-11-21: "where to put that line of respawning"). One
 * line at the bottom centre, in the kill cam's lower band: "RESPAWN IN 5" beside a ring that drains once a second.
 *
 * - The clock is the simulation's: the mode controller's armed revive for the viewer (MatchModePresentationState
 *   .respawn, whole seconds, a refused placement's re-arm included), never a guess from the death's time. The ring drains
 *   each second on the battle clock the HUD frame carries, so a paused battle holds it.
 * - It is its own surface, not a battle notice (the notices census allowlist names it): it stands under the kill cam's
 *   veil, which hides the HUD and the notice lanes, and no banner can push it out of its seat.
 * - Words by case: "Respawn in", "Infected · respawn in" (a survivor the outbreak took), "Back next wave" (the Horde's
 *   wait in a room). One life (Standard, Realistic, the front, the Juggernaut's boss) shows no dial.
 *
 * `respawnViewOf` is pure (the selftest reads every mode's case). Copyright © 2026 Kevin B. Liu.
 */
import { t } from './i18n.ts';
import { ensureStyle } from './styleLayers.ts';
import { markDatum } from './dom.ts';

/** The dial's state for one frame. */
export interface RespawnView {
  /** Whole seconds to the revive; null where it waits on an event (the Horde's next wave). */
  readonly inS: number | null;
  readonly nextWave: boolean;
  readonly infected: boolean;
}

interface RespawnWait { readonly inS: number | null; readonly nextWave?: boolean }

/** The dial for the HUD seat's wait (null while alive, after the verdict, or where no revive comes). */
export function respawnViewOf(wait: RespawnWait | null | undefined,
  modeState: { readonly id?: string; readonly perspectiveTeam?: string } | null | undefined, battleOver: boolean): RespawnView | null {
  if (!wait || battleOver) return null;
  const inS = typeof wait.inS === 'number' && Number.isFinite(wait.inS) ? Math.max(1, Math.ceil(wait.inS)) : null;
  if (inS === null && !wait.nextWave) return null;
  return { inS, nextWave: inS === null && !!wait.nextWave, infected: modeState?.id === 'infected' && modeState.perspectiveTeam === 'bravo' };
}

const RING_R = 15;
const RING_LEN = 2 * Math.PI * RING_R;

export interface RespawnDial {
  readonly root: HTMLElement;
  /** One frame: the view (null hides it) and the battle clock (s). Writes the DOM only when a figure changes. */
  update(view: RespawnView | null, timeS: number): void;
  hide(): void;
}

export function createRespawnDial(mount: HTMLElement): RespawnDial {
  ensureStyle('cot-respawn-style', RESPAWN_DIAL_CSS, 'surfaces');
  // (a couch pane HUD mounts it in the pane document, at its own bottom centre: app/couchPaneViews.ts)
  const root = (mount.ownerDocument ?? document).createElement('div');
  root.className = 'cot-respawn cot-m-pop';
  markDatum(root, 'respawn'); // the one place the revive's seconds show (surfaceRegistry.ts respawn)
  root.hidden = true;
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  root.innerHTML = `<svg class="ring" viewBox="0 0 36 36" width="36" height="36" aria-hidden="true">`
    + `<circle class="track" cx="18" cy="18" r="${RING_R}"/><circle class="arc" cx="18" cy="18" r="${RING_R}"`
    + ` stroke-dasharray="${RING_LEN.toFixed(2)}" transform="rotate(-90 18 18)"/></svg>`
    + '<span class="k"></span><span class="n num"></span>';
  mount.appendChild(root);
  const arc = root.querySelector<SVGCircleElement>('.arc')!;
  const kicker = root.querySelector<HTMLElement>('.k')!;
  const numeral = root.querySelector<HTMLElement>('.n')!;
  let shownKey = '';
  let lastSecond: number | null = null;
  let secondStartS = 0;
  let lastOffset = -1;

  const hide = (): void => {
    if (!root.hidden) root.hidden = true;
    shownKey = '';
    lastSecond = null;
  };

  return {
    root,
    hide,
    update(view, timeS) {
      if (!view) { hide(); return; }
      const words = view.nextWave ? 'respawn.nextWave' : view.infected ? 'respawn.infected' : 'respawn.in';
      const key = `${words}:${view.inS ?? '-'}`;
      if (key !== shownKey) {
        shownKey = key;
        kicker.textContent = t(words);
        numeral.textContent = view.inS === null ? '' : String(view.inS);
        numeral.hidden = view.inS === null;
        if (view.inS !== lastSecond) { lastSecond = view.inS; secondStartS = timeS; }
        root.dataset.wait = view.nextWave ? 'wave' : 'clock';
      }
      if (root.hidden) root.hidden = false;
      // the ring empties over the current second on the battle clock (a wave's wait keeps it full)
      const drained = view.inS === null ? 0 : Math.min(1, Math.max(0, timeS - secondStartS));
      const offset = Math.round(drained * RING_LEN * 10) / 10;
      if (offset !== lastOffset) { lastOffset = offset; arc.setAttribute('stroke-dashoffset', String(offset)); }
    },
  };
}

/**
 * Bottom centre: inside the kill cam's lower band (--kc-band) when a replay owns the screen, over the spectate bar while
 * a room's Horde wait follows an ally. Above the kill cam's layer (60) so its veil never hides it.
 */
const RESPAWN_DIAL_CSS = `
.cot-respawn{position:fixed;z-index:61;left:50%;bottom:max(var(--s2),calc((var(--kc-band,8vh) - 40px) / 2));transform:translateX(-50%);
  display:flex;align-items:center;gap:var(--s2);height:40px;padding:0 var(--s3) 0 var(--s1);pointer-events:none;
  background:var(--hud-plate-strong);box-shadow:var(--ring-1);color:var(--ink-1);font-family:var(--font-ui);}
.cot-respawn[hidden]{display:none;}
body:has(.cot-spec.show) .cot-respawn{bottom:calc(16px + 64px + var(--s2));}
.cot-respawn .ring{flex:none;}
.cot-respawn .track{fill:none;stroke:var(--line-2);stroke-width:3;}
.cot-respawn .arc{fill:none;stroke:var(--accent);stroke-width:3;}
.cot-respawn[data-wait=wave] .arc{stroke:var(--ink-3);}
.cot-respawn .k{font:700 var(--battle-fs-12)/1 var(--font-ui);letter-spacing:.16em;text-transform:uppercase;color:var(--ink-2);}
.cot-respawn .n{min-width:1.2ch;font:700 var(--battle-fs-18)/1 var(--font-data);color:var(--accent-hi);text-align:right;}
.cot-respawn .n[hidden]{display:none;}
`;
