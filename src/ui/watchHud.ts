/**
 * watchHud.ts — the Watch mode's own controls (watch-mode-243), on the Premiere kit's tokens and markup factories.
 *
 * One bar: the watched tank (flag, silhouette, name, its side's colour) or the drone (its glyph and cruise speed), the
 * cycle pair, the drone and the seat button (Take control / Leave tank). The bar never changes shape between views —
 * a control that does nothing in a view dims — so nothing jumps as the watcher flies, rides and drives. Key caps show
 * on a keyboard and hide on touch, where a climb rail joins the virtual stick and drag look. The battle HUD's own tank
 * furniture follows the view through `html[data-watch]` (flying: off, the HUD's spectator rule; riding: shown, inert).
 */
import { flag, keycap, silhouette } from './components/components.ts';
import { icon } from './icons/icon.ts';
import { t } from './i18n.ts';
import { ensureStyle } from './styleLayers.ts';
import { vehicleName } from './killSourceIdentity.ts';

type WatchHudView = 'off' | 'drone' | 'ride' | 'drive';

export interface WatchHudTank {
  readonly id: string;
  readonly specId?: string;
  readonly team?: string;
  readonly spec?: { readonly id?: string; readonly name?: string; readonly nation?: string } | null;
  readonly aerial?: { readonly kind?: string } | null;
}

export interface WatchHudState {
  readonly view: WatchHudView;
  readonly tank: WatchHudTank | null;
  readonly canTake: boolean;
  readonly speedIndex: number;
  readonly speedSteps: number;
}

export interface WatchHudActions {
  cycle(direction: -1 | 1): void;
  drone(): void;
  toggleSeat(): void;
  setClimb(direction: -1 | 0 | 1): void;
}

export interface WatchHud {
  update(state: WatchHudState): void;
  dispose(): void;
}

// The kit's key cap, flag and silhouette, scoped to the bar: components.css itself rides the kit's boot chunk (any import
// of it, static or dynamic, links it in the game's first paint), and the game page does not load it.
const KIT = `
.cot-watch .cot-c-kbd{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:22px;
 padding:0 6px;border:0;border-radius:var(--control-radius);box-shadow:var(--ring-3);font:500 var(--fs-11)/1 var(--font-data);
 letter-spacing:normal;text-transform:none;color:var(--ink-2)}
.cot-watch .cot-c-flag{box-sizing:border-box;display:inline-block;flex:none;object-fit:cover;border:0;border-radius:1px;box-shadow:var(--flag-ring)}
.cot-watch .cot-c-sil{display:inline-block;flex:none;background:currentColor;-webkit-mask:var(--sil) center/contain no-repeat;
 mask:var(--sil) center/contain no-repeat}
.cot-watch .cot-c-sil--right{transform:scaleX(-1)}
@media (hover:none),(pointer:coarse){.cot-watch .cot-c-kbd{display:none}}
`;

const STYLE = `
.cot-watch{position:absolute;left:50%;bottom:var(--inset-bottom);transform:translateX(-50%);z-index:var(--z-hud-controls);
 display:flex;align-items:stretch;gap:var(--s1);pointer-events:none;font-family:var(--font-ui);color:var(--ink-1)}
.cot-watch[hidden]{display:none}
html[data-watch=ride] .cot-watch,html[data-watch=drive] .cot-watch{bottom:auto;top:calc(var(--inset-top) + 76px)}
.cot-watch .who{--tone:var(--accent);display:grid;grid-template-columns:auto 56px minmax(0,1fr);align-items:center;gap:var(--s2);
 width:248px;height:48px;padding:0 var(--s3);background:var(--hud-plate);border-radius:var(--r1);
 box-shadow:inset 3px 0 0 var(--tone),var(--ring-1);pointer-events:auto}
.cot-watch .who[data-side=own]{--tone:var(--team-own)}.cot-watch .who[data-side=enemy]{--tone:var(--team-enemy)}
.cot-watch .who .cot-c-flag{width:24px;height:16px}
.cot-watch .who .cot-c-sil{width:56px;height:20px;color:var(--tone)}
.cot-watch .who .glyph{display:grid;place-items:center;width:24px;color:var(--tone)}
.cot-watch .who b{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:600 var(--fs-16)/1.1 var(--font-display)}
.cot-watch .pips{display:flex;gap:3px;align-items:flex-end;height:16px}
.cot-watch .pips i{display:block;width:5px;background:var(--line-3);border-radius:1px}
.cot-watch .pips i.on{background:var(--tone)}
.cot-watch .wb{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:var(--s2);min-width:48px;height:48px;
 padding:0 var(--s3);border:0;border-radius:var(--r1);background:var(--hud-plate);color:var(--ink-1);box-shadow:var(--ring-1);
 font:600 var(--fs-14)/1 var(--font-display);cursor:pointer;pointer-events:auto;transition:opacity var(--dur-fast) var(--ease-enter)}
.cot-watch .wb .cot-c-kbd{position:absolute;right:3px;bottom:2px;font-size:var(--fs-11)}
.cot-watch .wb.seat{min-width:132px;background:var(--btn-primary-fill);color:var(--btn-primary-ink);box-shadow:var(--btn-primary-bevel)}
.cot-watch .wb.seat .cot-c-kbd{position:static;color:var(--kbd-on-accent-ink);box-shadow:var(--kbd-on-accent-ring)}
.cot-watch .wb:disabled{opacity:.34;cursor:default}
.cot-watch .wb:focus-visible{outline:none;box-shadow:var(--focus-ring)}
@media(hover:hover){.cot-watch .wb:not(:disabled):hover{box-shadow:var(--ring-3)}.cot-watch .wb.seat:not(:disabled):hover{background:var(--btn-primary-hover)}}
.cot-watch .wb:not(:disabled):active{transform:translateY(var(--btn-press-drop))}
.cot-watch-rail{position:absolute;right:calc(var(--inset-right) + 4px);top:50%;transform:translateY(-50%);z-index:var(--z-hud-controls);
 display:none;flex-direction:column;gap:var(--s2);pointer-events:none}
body.cot-touch-layout .cot-watch-rail{display:flex}
html:not([data-watch=drone]) .cot-watch-rail{display:none}
.cot-watch-rail .wb{position:relative;display:grid;place-items:center;width:56px;height:56px;border:0;border-radius:var(--r1);
 background:var(--hud-plate);color:var(--ink-1);box-shadow:var(--ring-2);pointer-events:auto;touch-action:none}
.cot-watch-rail .wb.on{box-shadow:var(--ring-accent);color:var(--accent-hi)}
body.cot-touch-layout .cot-watch .cot-c-kbd{display:none}
html:is([data-watch=drone],[data-watch=ride]) body :is(.round.fire,.round.scope,.round.jump,.round.autoaim,.fire-cancel){display:none!important}
html[data-watch=ride] .cot-hud :is(.cot-shells,.cot-special,.cot-cons,.cot-vehicle-controls){pointer-events:none}
@media(max-width:600px){
 .cot-watch{left:var(--inset-left);right:var(--inset-right);transform:none;justify-content:center;flex-wrap:wrap}
 .cot-watch .who{width:auto;flex:1 1 180px;grid-template-columns:auto 44px minmax(0,1fr)}
 .cot-watch .who .cot-c-sil{width:44px}
 .cot-watch .wb.seat{min-width:48px}.cot-watch .wb.seat .label{display:none}
}
@media(prefers-reduced-motion:reduce){.cot-watch .wb{transition:none}}
`;

/** `host` is read when the bar first shows (the battle HUD's root, which loads beside the watch chunk). */
export function createWatchHud(host: () => HTMLElement | null, actions: WatchHudActions): WatchHud {
  ensureStyle('cot-watch-style', KIT + STYLE, 'surfaces');
  const bar = document.createElement('div');
  bar.className = 'cot-watch';
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', t('watch.bar'));
  bar.innerHTML =
    '<div class="who" aria-live="polite"><span class="lead"></span><span class="mark"></span><b></b></div>'
    + `<button type="button" class="wb prev" data-ui-sound="tick" aria-label="${t('watch.prev')}">${icon('chevronLeft', { size: 20 })}${keycap('Q')}</button>`
    + `<button type="button" class="wb next" data-ui-sound="tick" aria-label="${t('watch.next')}">${icon('chevronRight', { size: 20 })}${keycap('E')}</button>`
    + `<button type="button" class="wb drone" data-ui-sound="back" aria-label="${t('watch.drone')}">${icon('modeDrone', { size: 20 })}${keycap('V')}</button>`
    + `<button type="button" class="wb seat" data-ui-sound="confirm">${icon('crewDriver', { size: 20 })}<span class="label"></span>${keycap('Enter')}</button>`;
  const rail = document.createElement('div');
  rail.className = 'cot-watch-rail';
  rail.innerHTML =
    `<button type="button" class="wb up" aria-label="${t('watch.climb')}">${icon('moveForward', { size: 24 })}</button>`
    + `<button type="button" class="wb down" aria-label="${t('watch.descend')}">${icon('moveBack', { size: 24 })}</button>`;

  const who = bar.querySelector('.who') as HTMLElement;
  const lead = who.querySelector('.lead') as HTMLElement;
  const mark = who.querySelector('.mark') as HTMLElement;
  const name = who.querySelector('b') as HTMLElement;
  const prev = bar.querySelector('.prev') as HTMLButtonElement;
  const next = bar.querySelector('.next') as HTMLButtonElement;
  const drone = bar.querySelector('.drone') as HTMLButtonElement;
  const seat = bar.querySelector('.seat') as HTMLButtonElement;
  const seatLabel = seat.querySelector('.label') as HTMLElement;
  const up = rail.querySelector('.up') as HTMLButtonElement;
  const down = rail.querySelector('.down') as HTMLButtonElement;

  const off: Array<() => void> = [];
  const listen = (el: HTMLElement, type: string, fn: (event: Event) => void): void => {
    el.addEventListener(type, fn);
    off.push(() => el.removeEventListener(type, fn));
  };
  listen(prev, 'click', () => actions.cycle(-1));
  listen(next, 'click', () => actions.cycle(1));
  listen(drone, 'click', () => actions.drone());
  listen(seat, 'click', () => actions.toggleSeat());
  const hold = (button: HTMLButtonElement, direction: -1 | 1): void => {
    listen(button, 'pointerdown', (event) => {
      event.preventDefault();
      button.setPointerCapture?.((event as PointerEvent).pointerId);
      button.classList.add('on');
      actions.setClimb(direction);
    });
    const release = (): void => { if (button.classList.contains('on')) { button.classList.remove('on'); actions.setClimb(0); } };
    listen(button, 'pointerup', release);
    listen(button, 'pointercancel', release);
    listen(button, 'lostpointercapture', release);
  };
  hold(up, 1);
  hold(down, -1);

  // what the bar shows now (compared field by field: the bar rebuilds nothing on an unchanged frame)
  const shown = { view: '' as WatchHudView | '', tank: null as WatchHudTank | null, canTake: false, speedIndex: -1 };
  const pips = (index: number, steps: number): string => {
    let out = '<span class="pips" aria-hidden="true">';
    for (let i = 0; i < steps; i++) out += `<i class="${i <= index ? 'on' : ''}" style="height:${6 + i * 2}px"></i>`;
    return `${out}</span>`;
  };

  return {
    update(state: WatchHudState): void {
      const root = document.documentElement;
      if (state.view === 'off') {
        if (root.dataset.watch) delete root.dataset.watch;
        document.body.classList.remove('cot-spectating');
        bar.hidden = true;
        shown.view = '';
        return;
      }
      if (root.dataset.watch !== state.view) {
        root.dataset.watch = state.view;
        // flying, the battle HUD's own-tank furniture is off (its spectator rule); riding and driving, it is the tank's
        document.body.classList.toggle('cot-spectating', state.view === 'drone');
      }
      const tank = state.view === 'drone' ? null : state.tank;
      if (bar.isConnected && shown.view === state.view && shown.tank === tank && shown.canTake === state.canTake
        && shown.speedIndex === state.speedIndex) return;
      if (!bar.isConnected) {
        const mount = host();
        if (!mount) return;
        mount.append(bar, rail);
      }
      shown.view = state.view;
      shown.tank = tank;
      shown.canTake = state.canTake;
      shown.speedIndex = state.speedIndex;
      bar.hidden = false;
      if (tank) {
        const specId = tank.spec?.id ?? tank.specId ?? '';
        who.dataset.side = tank.team === 'enemy' ? 'enemy' : 'own';
        lead.innerHTML = tank.spec?.nation ? flag(tank.spec.nation, 'sm') : '';
        mark.innerHTML = specId && tank.aerial?.kind !== 'gunship' ? silhouette(specId, 'right') : '';
        name.textContent = vehicleName(tank);
      } else {
        delete who.dataset.side;
        lead.innerHTML = `<span class="glyph">${icon('modeDrone', { size: 20 })}</span>`;
        mark.innerHTML = pips(state.speedIndex, state.speedSteps);
        name.textContent = t('watch.drone');
      }
      const driving = state.view === 'drive';
      prev.disabled = next.disabled = driving;
      drone.disabled = state.view !== 'ride';
      seat.disabled = !driving && !state.canTake;
      seatLabel.textContent = driving ? t('watch.leave') : t('watch.take');
      seat.setAttribute('aria-label', seatLabel.textContent);
    },
    dispose(): void {
      for (const fn of off.splice(0)) fn();
      bar.remove();
      rail.remove();
      delete document.documentElement.dataset.watch;
      document.body.classList.remove('cot-spectating');
    },
  };
}
