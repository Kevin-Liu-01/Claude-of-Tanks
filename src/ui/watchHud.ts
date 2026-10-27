/**
 * watchHud.ts — the Watch mode's own controls (watch-mode-243), on the Premiere kit's tokens and markup factories.
 *
 * One bar: the watched tank (flag, silhouette, name, its side's colour) or the drone (its glyph and cruise speed), the
 * cycle pair, the drone and the seat button (Take control / Leave tank). The bar never changes shape between views —
 * a control that does nothing in a view dims — so nothing jumps as the watcher flies, rides and drives. Key caps show
 * on a keyboard and hide on touch, where a climb rail joins the virtual stick and drag look. The battle HUD's own tank
 * furniture follows the view through `html[data-watch]` (flying: off, the HUD's spectator rule; riding: shown, inert).
 */
import { flagIconUrl } from './flags.ts';
import { iconUrl } from './icons.ts';
import { icon } from './icons/icon.ts';
import { t } from './i18n.ts';
import { ensureStyle } from './styleLayers.ts';
import { markDatum } from './dom.ts';
import { vehicleName } from './killSourceIdentity.ts';
import { tierNumeral } from '../techTree/tiers.ts';

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
  /** Why the seat is held (watchSeat.ts watchSeatRefusal), its tip and description; null when it can be taken. */
  readonly takeRefusal?: string | null;
  readonly speedIndex: number;
  readonly speedSteps: number;
  /** The drone's orbit is locked on `tank`. */
  readonly locked: boolean;
}

export interface WatchHudActions {
  cycle(direction: -1 | 1): void;
  drone(): void;
  toggleLock(): void;
  toggleSeat(): void;
  setClimb(direction: -1 | 0 | 1): void;
}

export interface WatchHud {
  update(state: WatchHudState): void;
  dispose(): void;
}

// The kit's key cap, flag and silhouette (components.ts / components.css), drawn here: importing the kit from this lazy
// chunk split it off its shared boot chunk into a request of its own on the game's first paint.
const KIT = `
.cot-watch .cot-c-kbd{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:22px;
 padding:0 6px;border:0;border-radius:var(--control-radius);box-shadow:var(--ring-3);font:500 var(--fs-11)/1 var(--font-data);
 letter-spacing:normal;text-transform:none;color:var(--ink-2)}
.cot-watch .cot-c-flag{box-sizing:border-box;display:inline-block;flex:none;object-fit:cover;object-position:left center;border:0;border-radius:1px;box-shadow:var(--flag-ring)}
.cot-watch .cot-c-sil{display:inline-block;flex:none;background:currentColor;-webkit-mask:var(--sil) center/contain no-repeat;
 mask:var(--sil) center/contain no-repeat}
.cot-watch .cot-c-sil--right{transform:scaleX(-1)}
@media (hover:none),(pointer:coarse){.cot-watch .cot-c-kbd{display:none}}
`;

const STYLE = `
/* its seat is the layout's (battleHudLayout.ts): flying on the floor, lifted over the map where it would meet it; riding
   and driving under the score's band, below the map and the touch toolbar where it would cross them */
.cot-watch{position:absolute;left:50%;bottom:max(var(--inset-bottom),var(--hud-watch-lift,0px));transform:translateX(-50%);z-index:var(--z-hud-controls);
 display:flex;align-items:stretch;gap:var(--s1);pointer-events:none;font-family:var(--font-ui);color:var(--ink-1)}
.cot-watch[hidden]{display:none}
html[data-watch=ride] .cot-watch,html[data-watch=drive] .cot-watch,html[data-watch=drone] body[data-watch-top] .cot-watch{bottom:auto;top:var(--hud-watch-top,calc(var(--inset-top) + 76px))}
.cot-watch .who{--tone:var(--accent);display:grid;grid-template-columns:auto 56px minmax(0,1fr);align-items:center;gap:var(--s2);
 width:300px;height:48px;padding:0 var(--s3);background:var(--hud-plate);border-radius:var(--r1);
 box-shadow:var(--ring-1);pointer-events:auto}
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
.cot-watch .wb .cot-c-kbd{font-size:var(--battle-fs-fig-11)}
.cot-watch .wb.seat{min-width:132px;background:var(--btn-primary-fill);color:var(--btn-primary-ink);box-shadow:var(--btn-primary-bevel)}
.cot-watch .wb.seat .cot-c-kbd{position:static;color:var(--kbd-on-accent-ink);box-shadow:var(--kbd-on-accent-ring)}
.cot-watch .wb:disabled{opacity:.34;cursor:default}
.cot-watch .wb:focus-visible{outline:none;box-shadow:var(--focus-ring)}
@media(hover:hover){.cot-watch .wb:not(:disabled):hover{box-shadow:var(--ring-3)}.cot-watch .wb.seat:not(:disabled):hover{background:var(--btn-primary-hover)}}
.cot-watch .wb:not(:disabled):active{transform:translateY(var(--btn-press-drop))}
/* (on the touch layout's right column, the tray's and the consumables' 14 px: further in, it stood off them, gauntlet r6) */
.cot-watch-rail{position:absolute;right:max(14px,env(safe-area-inset-right));top:50%;transform:translateY(-50%);z-index:var(--z-hud-controls);
 display:none;flex-direction:column;gap:var(--s2);pointer-events:none}
body.cot-touch-layout .cot-watch-rail{display:flex}
html:not([data-watch=drone]) .cot-watch-rail{display:none}
.cot-watch-rail .wb{position:relative;display:grid;place-items:center;width:56px;height:56px;border:0;border-radius:var(--r1);
 background:var(--hud-plate);color:var(--ink-1);box-shadow:var(--ring-2);pointer-events:auto;touch-action:none}
/* (on: the selected slot's look, the accent's ring on its wash, gauntlet r5: a ring alone was a fourth selected state) */
.cot-watch-rail .wb.on,.cot-watch .wb.lock.on{background:linear-gradient(var(--accent-wash),var(--accent-wash)),var(--hud-plate);
 box-shadow:var(--ring-accent);color:var(--accent-hi)}
body.cot-touch-layout .cot-watch .cot-c-kbd{display:none}
html:is([data-watch=drone],[data-watch=ride]) body :is(.round.fire,.round.scope,.round.jump,.round.autoaim,.fire-cancel){display:none}
html[data-watch=ride] body .cot-touch .joy{display:none}
html[data-watch=ride] .cot-hud :is(.cot-shells,.cot-special,.cot-cons,.cot-vehicle-controls){pointer-events:none}
@media(max-width:600px){
 /* (on the map's and the feeds' 12 px line, not the shell's 24 px inset: the bar stood off every phone edge, gauntlet r11) */
 .cot-watch{left:max(12px,env(safe-area-inset-left));right:max(12px,env(safe-area-inset-right));transform:none;justify-content:center;flex-wrap:wrap}
 .cot-watch .who{width:auto;flex:1 1 100%;grid-template-columns:auto 44px minmax(0,1fr)}
 .cot-watch .who .cot-c-sil{width:44px}
 .cot-watch .wb.seat{min-width:48px}.cot-watch .wb.seat .label{display:none}
 /* (the buttons share the plate's width, one edge with it: a narrower centred row stood off its edges, gauntlet r10) */
 .cot-watch .wb{flex:1 1 0}
}
/* (the seat's word stays on one line: zh's 驾驶 broke a character a line at 1440, gauntlet r3) */
/* (the seat's action in the bar's capitals, as GARAGE and the rest: "Drive" in title case, gauntlet r7) */
.cot-watch .wb.seat .label{white-space:nowrap;text-transform:uppercase;letter-spacing:var(--track-label-s)}
/* (riding, the ridden tank's controls row shows its state without its key caps: the watcher's own Q and E sat in the bar
   above it beside the row's Q, gauntlet r4; its ammunition and consumables too, the ridden tank's slots and never the
   watcher's keys: their 1 to 6 kept caps under a row without them, gauntlet r14) */
html[data-watch=ride] .cot-hud :is(.cot-vehicle-controls .sk,.cot-shell .key,.cot-con .key){visibility:hidden}
/* (... and a narrow tile's glyph back on its centre at the row's size: set at its foot a size down to clear a cap no longer
   shown, it sank 8 px under the tile's centre at 900x700, gauntlet r13) */
html[data-watch=ride] body[data-cot-battle-layout]:not(.cot-touch-layout) .cot-hud .cot-vehicle-controls>button .si{align-self:center;--hud-tile-icon:inherit}
/* a short landscape phone: riding and driving, a slimmer bar tucked under the score keeps the horizon clear; flying, the
   climb rail stands in the bottom-right corner, under the right kill lane (battleHudLayout.ts ends the lane above it) */
@media(max-height:500px){
 .cot-watch-rail{top:auto;bottom:calc(var(--inset-bottom) + 12px);transform:none}
 html:is([data-watch=ride],[data-watch=drive]) .cot-watch{top:var(--hud-watch-top,calc(var(--inset-top) + 40px))}
 .cot-watch .who,.cot-watch .wb{height:38px}.cot-watch .wb{min-width:38px;padding:0 var(--s2)}
 .cot-watch .who{width:240px;grid-template-columns:auto 40px minmax(0,1fr)}.cot-watch .who .cot-c-sil{width:40px;height:16px}
 .cot-watch .who b{font-size:var(--fs-14)}.cot-watch .wb.seat{min-width:96px}
}
/* (the shortest landscape phones, under 300 px tall: one row of its own width, the plate the flag or glyph and the name,
   so it clears the map and the climb rail; riding, it takes the floor over the hull panel, in the place of the ridden
   tank's controls row and dial (battleHudLayout.ts keeps the head band and the lanes off it): at 568x256 the full-width
   bar wrapped onto the sight, the slots, the dial and the drone's rail, gauntlet r8) */
@media(max-height:299px) and (orientation:landscape){
 .cot-watch{left:50%;right:auto;transform:translateX(-50%);flex-wrap:nowrap}
 /* (the plate its name's width, to 210 px: at 160 px "VIII · Leopard 2A4 V" lost its suffix, gauntlet r15) */
 .cot-watch .who{flex:none;width:max-content;min-width:160px;max-width:210px;height:34px;grid-template-columns:auto auto minmax(0,1fr)}
 .cot-watch .who .cot-c-sil{display:none}
 .cot-watch .wb{height:34px;min-width:34px;padding:0 var(--s1)}.cot-watch .wb.seat{min-width:44px}
 html[data-watch=ride] body.cot-touch-layout .cot-watch{top:auto;bottom:calc(max(8px,env(safe-area-inset-bottom)) + 46px)}
 html[data-watch=ride] body.cot-touch-layout .cot-vehicle-controls{display:none}
 /* (the dial by its visibility: the touch sheet holds its display with an !important, and it stayed under the bar, r9) */
 html[data-watch=ride] body.cot-touch-layout .cot-drive{visibility:hidden}
}
/* (a portrait phone's climb rail starts under the touch toolbar that hangs under the bar: centred, its top ran under the
   toolbar at 320x568, gauntlet r8) */
body.cot-touch-layout[data-cot-orientation=portrait] .cot-watch-rail{top:max(50%,calc(var(--hud-objective-bottom,64px) + 124px))}
/* (and up to 340 px wide the ammunition column starts under that toolbar too, and riding keeps the ridden tank's ammunition
   alone: its consumables, controls row and special stand down, the rows that met the toolbar and the sight at 320x568) */
@media(max-width:340px) and (orientation:portrait){
 html[data-watch] body[data-cot-battle-layout][data-cot-width][data-cot-height].cot-touch-layout .cot-shells{top:max(225px,calc(var(--hud-objective-bottom,64px) + 62px))}
 html[data-watch=ride] body.cot-touch-layout :is(.cot-vehicle-controls,.cot-cons,.cot-special){display:none}
}
@media(prefers-reduced-motion:reduce){.cot-watch .wb{transition:none}}
`;

/** A held seat's one reason, watchSeatRefusal's word put as the bar says it. */
const SEAT_HELD: Readonly<Record<string, string>> = {
  'no-brain': 'watch.seat.held.player', destroyed: 'watch.seat.held.destroyed', aircraft: 'watch.seat.held.aircraft',
  'already-driving': 'watch.seat.held.taken', 'no-take-control': 'watch.seat.held.mode', 'not-open': 'watch.seat.held.mode',
  'no-watch': 'watch.seat.held.mode', 'no-hull': 'watch.seat.held.none', inactive: 'watch.seat.held.none',
};
const seatHeld = (refusal: string | null): string => (refusal && SEAT_HELD[refusal] ? t(SEAT_HELD[refusal]) : '');

/** `host` is read when the bar first shows (the battle HUD's root, which loads beside the watch chunk). */
const keycap = (key: string): string => `<kbd class="cot-c-kbd" aria-hidden="true">${key}</kbd>`;
const flag = (nation: string): string =>
  `<img class="cot-c-flag" src="${flagIconUrl(nation)}" alt="" aria-hidden="true" draggable="false">`;
const silhouette = (id: string): string =>
  `<span class="cot-c-sil cot-c-sil--right" aria-hidden="true" style="--sil:url(${iconUrl(id, 'side_silhouette')})"></span>`;

export function createWatchHud(host: () => HTMLElement | null, actions: WatchHudActions): WatchHud {
  ensureStyle('cot-watch-style', KIT + STYLE, 'surfaces');
  const bar = document.createElement('div');
  bar.className = 'cot-watch';
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', t('watch.bar'));
  bar.innerHTML =
    '<div class="who" aria-live="polite"><span class="lead"></span><span class="mark"></span><b></b></div>'
    + `<button type="button" class="wb prev" data-tip data-ui-sound="tick" aria-label="${t('watch.prev')}">${icon('chevronLeft', { size: 20 })}${keycap('Q')}</button>`
    + `<button type="button" class="wb next" data-tip data-ui-sound="tick" aria-label="${t('watch.next')}">${icon('chevronRight', { size: 20 })}${keycap('E')}</button>`
    + `<button type="button" class="wb drone" data-tip data-ui-sound="back" aria-label="${t('watch.drone')}">${icon('modeDrone', { size: 20 })}${keycap('V')}</button>`
    + `<button type="button" class="wb lock" data-tip data-ui-sound="tick" aria-pressed="false" aria-label="${t('watch.lock')}">${icon('autoAim', { size: 20 })}${keycap('T')}</button>`
    + `<button type="button" class="wb seat" data-ui-sound="confirm">${icon('crewDriver', { size: 20 })}<span class="label"></span>${keycap('ENTER')}</button>`;
  const rail = document.createElement('div');
  rail.className = 'cot-watch-rail';
  rail.innerHTML =
    `<button type="button" class="wb up" aria-label="${t('watch.climb')}">${icon('moveForward', { size: 24 })}</button>`
    + `<button type="button" class="wb down" aria-label="${t('watch.descend')}">${icon('moveBack', { size: 24 })}</button>`;

  const who = markDatum(bar.querySelector('.who') as HTMLElement, 'watched');
  const lead = who.querySelector('.lead') as HTMLElement;
  const mark = who.querySelector('.mark') as HTMLElement;
  const name = who.querySelector('b') as HTMLElement;
  const prev = bar.querySelector('.prev') as HTMLButtonElement;
  const next = bar.querySelector('.next') as HTMLButtonElement;
  const drone = bar.querySelector('.drone') as HTMLButtonElement;
  const lock = bar.querySelector('.lock') as HTMLButtonElement;
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
  listen(lock, 'click', () => actions.toggleLock());
  listen(seat, 'click', () => actions.toggleSeat());
  const hold = (button: HTMLButtonElement, direction: -1 | 1): void => {
    listen(button, 'pointerdown', (event) => {
      event.preventDefault();
      // capture keeps the hold through a slide off the button; a pointer the browser no longer tracks refuses it
      try { button.setPointerCapture((event as PointerEvent).pointerId); } catch { /* the press still holds */ }
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
  const shown = { view: '' as WatchHudView | '', tank: null as WatchHudTank | null, canTake: false, speedIndex: -1, locked: false };
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
      // flying, the plate names the drone, or the tank its orbit is locked on
      const locked = state.view === 'drone' && state.locked && !!state.tank;
      const tank = state.view === 'drone' && !locked ? null : state.tank;
      if (bar.isConnected && shown.view === state.view && shown.tank === tank && shown.canTake === state.canTake
        && shown.speedIndex === state.speedIndex && shown.locked === locked) return;
      if (!bar.isConnected) {
        const mount = host();
        if (!mount) return;
        mount.append(bar, rail);
      }
      shown.view = state.view;
      shown.tank = tank;
      shown.canTake = state.canTake;
      shown.speedIndex = state.speedIndex;
      shown.locked = locked;
      bar.hidden = false;
      if (tank) {
        const specId = tank.spec?.id ?? tank.specId ?? '';
        who.dataset.side = tank.team === 'enemy' ? 'enemy' : 'own';
        lead.innerHTML = tank.spec?.nation ? flag(tank.spec.nation) : '';
        mark.innerHTML = /^[a-z0-9_]+$/.test(specId) && tank.aerial?.kind !== 'gunship' ? silhouette(specId) : '';
        // (its tier before its name, as the spectator's plate reads "VI · Leopard 2A5": the tier after it read as a
        // variant suffix, gauntlet r12)
        const numeral = tank.aerial?.kind === 'gunship' ? '' : tierNumeral(specId);
        name.textContent = numeral ? `${numeral} · ${vehicleName(tank)}` : vehicleName(tank);
      } else {
        delete who.dataset.side;
        lead.innerHTML = `<span class="glyph">${icon('modeDrone', { size: 20 })}</span>`;
        mark.innerHTML = pips(state.speedIndex, state.speedSteps);
        name.textContent = t('watch.drone');
      }
      const driving = state.view === 'drive';
      prev.disabled = next.disabled = driving;
      drone.disabled = state.view !== 'ride';
      lock.disabled = state.view !== 'drone';
      lock.classList.toggle('on', locked);
      lock.setAttribute('aria-pressed', locked ? 'true' : 'false');
      lock.setAttribute('aria-label', t(locked ? 'watch.unlock' : 'watch.lock'));
      seat.disabled = !driving && !state.canTake;
      // (a held seat says why, as its tip and its description: it dimmed with no reason, INTERACTION-REDESIGN C)
      const held = seat.disabled ? seatHeld(state.takeRefusal ?? null) : '';
      if (held) { seat.dataset.tip = held; seat.setAttribute('aria-description', held); }
      else { delete seat.dataset.tip; seat.removeAttribute('aria-description'); }
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
