import { uiIconSVG } from './uiIcons.ts';
import { t } from './i18n.ts';
import type * as PickerModule from './components/picker.ts';
import { closeSurface, openSurface, type TransientSurface } from './components/surfaceStack.ts';

const SAFE_SPEC_ID = /^[a-z0-9_]+$/;

/** Build the small amount of presentation data the spectator card needs. */
export interface SpectatorCardPayload {
  readonly specId?: string;
  readonly count?: number;
  readonly index?: number;
}

interface SpectatorCardModel {
  readonly icon: string;
  readonly position: string;
}

export function spectatorCardModel(payload: SpectatorCardPayload = {}): SpectatorCardModel {
  const specId = SAFE_SPEC_ID.test(String(payload.specId || '')) ? String(payload.specId) : '';
  const rawCount = payload.count ?? 0;
  const rawIndex = payload.index ?? 0;
  const count = Number.isInteger(rawCount) && rawCount > 0 ? rawCount : 0;
  const index = Number.isInteger(rawIndex) && rawIndex > 0
    ? Math.min(rawIndex, count || rawIndex)
    : 0;
  return {
    icon: specId ? `/icons/${specId}_angle.webp` : '',
    position: count && index ? `${index} / ${count}` : '',
  };
}

export function spectatorSwitcherMarkup(): string {
  // (the plate opens the picker of allies: mountSpectateAllies)
  return `<button type="button" class="subject" aria-haspopup="listbox" aria-expanded="false" aria-label="${t('spectator.chooseAlly')}">` +
    '<div class="portrait" aria-hidden="true"><img alt=""></div>' +
    '<div class="identity" aria-live="polite">' +
      '<span class="spec-status">' +
        uiIconSVG('scope', 14) +
        `<span>${t('spectator.spectating')}</span>` +
      '</span>' +
      '<span class="who"><b class="nick"></b><span class="veh"></span></span>' +
    '</div>' +
    `<span class="open" aria-hidden="true">${uiIconSVG('chevronDown', 14)}</span></button>` +
    '<div class="switch" role="group" aria-label="' + t('spectator.switchGroupAria') + '">' +
      // (Q and E, Watch's keys: A and D here were a second pair for the same step, INTERACTION-REDESIGN C)
      '<button type="button" class="cycle prev" data-tip aria-keyshortcuts="Q" aria-label="' + t('spectator.cyclePrevAria') + '">' +
        '<span class="cycle-icon" aria-hidden="true">' + uiIconSVG('chevronLeft', 13) + '</span>' +
        '<kbd aria-hidden="true">Q</kbd>' +
      '</button>' +
      `<b class="idx" aria-label="${t('spectator.idxAria')}" hidden></b>` +
      '<button type="button" class="cycle next" data-tip aria-keyshortcuts="E" aria-label="' + t('spectator.cycleNextAria') + '">' +
        '<span class="cycle-icon" aria-hidden="true">' + uiIconSVG('chevronRight', 13) + '</span>' +
        '<kbd aria-hidden="true">E</kbd>' +
      '</button>' +
    '</div>' +
    `<button type="button" class="gar" aria-label="${t('spectator.garageAria')}">` +
      '<span class="gar-icon" aria-hidden="true">' + uiIconSVG('garage', 17) + '</span>' +
      `<span>${t('spectator.garage')}</span>` +
    '</button>';
}

/** One ally the bar's picker offers: the roster's callsign, and the tier and vehicle under it. */
export interface SpectateAlly { readonly id: string; readonly name: string; readonly vehicle: string; readonly specId?: string }

/**
 * INTERACTION-REDESIGN C (the spectator bar was "a stepper, not a picker of allies"): the plate opens the kit picker
 * over the bar, a row for each living ally with the watched one chosen; a press or Enter watches the one chosen, and Esc
 * backs out (a moved focus restored first), as every picker does. Q and E still step. The picker loads on the first
 * open, so a battle that never opens it carries none of it.
 */
/** What the picker of allies opens under (fit): the touch layer's toolbar, which it cannot cover, and the score over its
 *  column, whose figures it would cut through (gauntlet r17 at 568x256). The map and the objective over its column stand
 *  down while it is open (pick-under), as the lanes and the rosters do (the HUD's spec-picking): kept as its ceiling, the
 *  map left it one row at 568x256, the watched tank's, gauntlet r18. */
const PICK_CEILINGS = '.cot-touch.on .mobile-chrome,.cot-top';
const PICK_UNDER = '.cot-minimap,.cot-mode-status.show';

export function mountSpectateAllies(bar: HTMLElement, onChoose: (id: string) => void): {
  update(allies: readonly SpectateAlly[], current: string | null): void;
  close(): void;
} {
  const subject = bar.querySelector<HTMLButtonElement>('.subject');
  const pop = document.createElement('div');
  pop.className = 'cot-spec-pick';
  pop.hidden = true;
  // (the picker on its own host: an Esc it spends restoring stops there, short of the back-out on the pop below)
  const host = document.createElement('div');
  // (its cue while more allies lie below the list's foot, on a strip of its own under the last whole row, the load card's:
  // the sixth of six sat hidden with nothing saying the list scrolls, gauntlet r16)
  const more = document.createElement('div');
  more.className = 'more';
  more.setAttribute('aria-hidden', 'true');
  more.innerHTML = uiIconSVG('chevronDown', 14);
  pop.append(host, more);
  bar.append(pop);
  let grid: HTMLElement | null = null;
  const markMore = (): void => {
    if (!grid) return;
    pop.classList.toggle('more', grid.scrollHeight - grid.scrollTop - grid.clientHeight > 2);
  };
  // (the battle under the open list veiled whole, as a modal's scrim: half-covered, the lanes' "You" stuck out of its edge
  // and the map was cut through, gauntlet r15; a press on it closes the list, as any press outside does)
  const scrim = document.createElement('div');
  scrim.className = 'cot-spec-scrim';
  scrim.hidden = true;
  bar.parentElement?.insertBefore(scrim, bar);
  let allies: readonly SpectateAlly[] = [];
  let current: string | null = null;
  let picker: ReturnType<typeof PickerModule.createPicker> | null = null;
  // The list's height on opening: under the touch toolbar over it (a layer of its own the list cannot cover: it covered
  // the list's top at 320x568), and whole rows (the last one ran under the panel's foot at 320x568 and 844x390, gauntlet
  // r14).
  function fit(): void {
    pop.style.maxHeight = '';
    pop.classList.remove('scrolls');
    // (as wide as the watched tank's plate it drops from: a fixed 358 px stopped 40 to 200 px short of it, or ran into the
    // stepper beside it at 1024x600 and 568x256, gauntlet r16)
    const plate = subject?.getBoundingClientRect();
    pop.style.width = plate?.width ? `${Math.round(plate.right - bar.getBoundingClientRect().left)}px` : '';
    const barTop = bar.getBoundingClientRect().top;
    const box = pop.getBoundingClientRect();
    for (const node of document.querySelectorAll<HTMLElement>(PICK_UNDER)) {
      const over = node.getBoundingClientRect();
      node.classList.toggle('pick-under', !!over.height && over.bottom < barTop && over.right > box.left && over.left < box.right);
    }
    let ceiling = 8;
    for (const node of document.querySelectorAll<HTMLElement>(PICK_CEILINGS)) {
      const over = node.getBoundingClientRect();
      if (over.height && over.bottom < barTop && over.right > box.left && over.left < box.right) ceiling = Math.max(ceiling, over.bottom + 8);
    }
    const room = Math.min(box.height, barTop - 8 - ceiling);
    grid = pop.querySelector<HTMLElement>('.cot-c-picker__grid');
    const first = grid?.children[0] as HTMLElement | undefined, second = grid?.children[1] as HTMLElement | undefined;
    if (!grid || !first || !second) { pop.style.maxHeight = `${Math.floor(room)}px`; return; }
    // (the rows' boxes to the fraction: whole-pixel offsets lost a few px over six rows, and the last row's foot ran under
    // the panel's in zh, gauntlet r16)
    const firstBox = first.getBoundingClientRect();
    const pitch = second.getBoundingClientRect().top - firstBox.top, gap = pitch - firstBox.height;
    const total = grid.children.length;
    // (the panel's padding and anything over the list, then the list's own padding round its rows; the cue's strip with
    // them once the list scrolls)
    const style = getComputedStyle(grid);
    const frameOf = () => pop.getBoundingClientRect().height - grid!.clientHeight + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    let frame = frameOf();
    let rows = Math.max(1, Math.floor((room - frame + gap + 0.5) / pitch));
    if (rows < total) {
      pop.classList.add('scrolls');
      frame = frameOf();
      rows = Math.max(1, Math.min(total, Math.floor((room - frame + gap + 0.5) / pitch)));
    }
    pop.style.maxHeight = `${Math.ceil(frame + rows * pitch - gap)}px`;
    shownRows = rows;
    shownPitch = pitch;
    markMore();
  }
  let shownRows = 0, shownPitch = 0;
  /** The list from its first row where the chosen one shows there, else the chosen at its foot: scrolled to the chosen
   *  alone, a short window's list opened on its second ally with the first above it and nothing to say so (gauntlet r19
   *  at 844x390, 568x256 and 320x568). */
  function settleScroll(): void {
    if (!grid || !shownRows) return;
    const chosen = [...grid.children].findIndex((cell) => cell.querySelector('[aria-selected="true"]'));
    grid.scrollTop = chosen < shownRows ? 0 : (chosen - shownRows + 1) * shownPitch;
    markMore();
  }
  const items = (): PickerModule.PickerItem[] =>
    allies.map((ally) => ({ id: ally.id, name: ally.name, facts: ally.vehicle ? [ally.vehicle] : [],
      // each ally's tank, as every list of tanks shows it (owner 2026-10-27): its portrait, the row's thumbnail
      ...(ally.specId && SAFE_SPEC_ID.test(ally.specId) ? { media: { poster: `/icons/thumbs/${ally.specId}_angle.webp`, tank: true } } : {}) }));
  // a transient surface (components/surfaceStack.ts): Escape (which backs out of the list, never on to the pause veil) and a
  // press outside it are the stack's
  const surface: TransientSurface = {
    id: 'spectate-ally',
    element: () => pop,
    owns: (node) => !!subject?.contains(node),
    close: (reason) => { close(); if (reason === 'escape') subject?.focus(); },
  };
  function close(): void {
    if (pop.hidden) return;
    closeSurface(surface);
    pop.hidden = true;
    scrim.hidden = true;
    bar.classList.remove('picking');
    bar.parentElement?.classList.remove('spec-picking');
    for (const node of document.querySelectorAll('.pick-under')) node.classList.remove('pick-under');
    subject?.setAttribute('aria-expanded', 'false');
  }
  async function open(): Promise<void> {
    if (!allies.length) return;
    openSurface(surface, subject);
    pop.hidden = false;
    scrim.hidden = false;
    bar.classList.add('picking');
    bar.parentElement?.classList.add('spec-picking');
    subject?.setAttribute('aria-expanded', 'true');
    if (!picker) {
      const [{ createPicker }, { pickerText }] = await Promise.all([import('./components/picker.ts'), import('./pickerText.ts')]);
      if (pop.hidden || picker) return;
      picker = createPicker(host, {
        id: 'spectate-ally', label: t('spectator.chooseAlly'), items: items(), value: current, layout: 'list', text: pickerText(),
        // (the camera stays on the watched tank until one is chosen: hovering the rows would swing it from tank to tank)
        onPreview: () => {},
        onChoose: (item) => { close(); subject?.focus(); onChoose(item.id); },
      });
    } else picker.setItems(items(), current);
    fit();
    grid?.addEventListener('scroll', markMore, { passive: true });
    picker.focus();
    settleScroll();
    // (and after the kit's own reveal, a frame on, which scrolls the chosen row to the top)
    requestAnimationFrame(settleScroll);
  }
  subject?.addEventListener('click', () => { if (pop.hidden) void open(); else close(); });
  return {
    update(next, at): void {
      allies = next;
      current = at;
      if (!allies.length) close();
      if (!picker) return;
      if (pop.hidden) picker.setValue(at);
      else picker.setItems(items(), at);
    },
    close,
  };
}

/**
 * The Premiere direction's plates (the Watch bar's language, watchHud.ts): the watched tank's own 3/4 render on the HUD
 * plate ringed all round (no edge stripe, owner 2026-10-25), its commander in the display face and its vehicle under it; the cycle pair and the
 * garage as the kit's square plates with their key caps. The SPECTATING line stays for assistive technology only (no
 * eyebrow over a name, owner UI rules), the scope glyph says it.
 */
export const spectatorSwitcherStyles = `
.cot-spec{position:absolute;z-index:var(--hud-layer-controls);left:50%;bottom:16px;transform:translate(-50%,12px);
 display:none;grid-template-columns:minmax(0,1fr) auto auto;align-items:stretch;gap:var(--s2);
 width:min(620px,calc(100vw - 32px),var(--hud-spec-max,100vw));min-width:0;padding:0;border:0;background:none;box-shadow:none;
 pointer-events:none;opacity:0;color:var(--ink-1);font-family:var(--font-ui);
 transition:opacity var(--dur-fast) var(--ease-enter),transform var(--dur-fast) var(--ease-enter);}
.cot-spec.show{display:grid}.cot-spec.in{opacity:1;transform:translate(-50%,0)}
.cot-spec .subject{position:relative;display:grid;grid-template-columns:66px minmax(0,1fr) auto;align-items:center;gap:var(--s3);
 min-width:0;height:64px;margin:0;padding:0 var(--s3) 0 var(--s2);pointer-events:auto;background:var(--hud-plate);border:0;border-radius:var(--r1);
 box-shadow:var(--ring-1);appearance:none;color:inherit;font:inherit;text-align:left;cursor:pointer;}
/* (the plate is the picker's trigger: its chevron points up to the list it opens over the bar, INTERACTION-REDESIGN C) */
.cot-spec .subject .open{display:flex;color:var(--ink-3);transform:rotate(180deg)}.cot-spec .subject .open svg{display:block;width:14px;height:14px}
.cot-spec .subject[aria-expanded=true] .open{transform:none;color:var(--ink-1)}
.cot-spec .subject:focus-visible{outline:none;box-shadow:var(--focus-ring)}
@media(hover:hover){.cot-spec .subject:hover{box-shadow:var(--ring-3)}}
/* the picker of allies over the bar, its left edge on the plate's: the kit picker's list, no favourites in a battle */
/* (over every instrument while it is open, on the strong plate made opaque: under the map and the score its rows hid at
   320x568 and 568x256, and the feed read through the 96 % plate, gauntlet r14) */
.cot-spec.picking{z-index:calc(var(--hud-layer-score) + 2)}
.cot-spec-scrim{position:absolute;inset:0;z-index:calc(var(--hud-layer-score) + 1);background:var(--battle-veil);pointer-events:auto}
.cot-spec-scrim[hidden]{display:none}
/* (and the lanes and the rosters under it stand down: veiled, their rows read on at its edges as fragments, "_Long_Na…" at
   844x390 and a roster row sliced at 1024x600, gauntlet r17) */
.spec-picking :is(.cot-kill-lane,.cot-ear,.cot-ribbon),.spec-picking .pick-under{visibility:hidden}
/* (a short landscape's rows on one line, the vehicle after the callsign, at the 44 px target (no favourite's star to
   hold the kit's 60): two lines a row left room for one, r18) */
@media (max-height:340px) and (orientation:landscape){
 .cot-spec-pick .cot-c-picker__opt{min-height:44px;padding-block:var(--s1)}
 .cot-spec-pick .cot-c-picker__words{flex-wrap:nowrap;align-items:baseline;gap:var(--s2)}
 .cot-spec-pick .cot-c-picker__name{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
 .cot-spec-pick .cot-c-picker__facts{flex:0 0 auto;flex-basis:auto}
}
.cot-spec-pick{position:absolute;left:0;bottom:calc(100% + var(--s2));width:min(360px,100%);max-height:min(60vh,420px);display:flex;
 flex-direction:column;box-sizing:border-box;padding:var(--s2);border-radius:var(--r1);
 background:linear-gradient(var(--hud-plate-strong),var(--hud-plate-strong)),var(--surface-scene);box-shadow:var(--ring-1);
 pointer-events:auto;overflow:hidden}
/* (each ally's callsign in the display face, as the plate under the list names the watched one: one datum, one face; and
   its vehicle in the plate's voice, the kit's body face read as another kit's, gauntlet r17) */
.cot-spec-pick .cot-c-picker__name{font-family:var(--font-display);font-weight:700}
.cot-spec-pick .cot-c-picker__facts{font:500 var(--battle-fs-12)/1.2 var(--font-ui)}
.cot-spec-pick[hidden]{display:none}
.cot-spec-pick>.cot-c-picker{min-height:0;flex:1 1 auto;display:flex;flex-direction:column}
.cot-spec-pick .cot-c-picker__grid{min-height:0;overflow:auto;padding-block:0;-webkit-mask-image:none;mask-image:none}
.cot-spec-pick .cot-c-picker__fav{display:none}
.cot-spec-pick>.more{display:none;flex:none;justify-content:center;height:14px;color:var(--ink-2);visibility:hidden;pointer-events:none}
.cot-spec-pick.scrolls>.more{display:flex}
.cot-spec-pick.more>.more{visibility:visible}
.cot-spec .portrait{display:grid;place-items:center;width:66px;height:52px;border:0;background:none;}
.cot-spec .portrait img{display:block;width:66px;height:52px;object-fit:contain;}
.cot-spec .identity{position:relative;display:flex;flex-direction:column;justify-content:center;gap:var(--s1);min-width:0;padding:0}
.cot-spec .spec-status{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.cot-spec .who{display:flex;flex-direction:column;gap:var(--s1);min-width:0;width:100%}
.cot-spec .nick{font:700 var(--fs-18)/1.1 var(--font-display);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cot-spec .veh{color:var(--ink-3);font:500 var(--battle-fs-12)/1.2 var(--font-ui);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cot-spec .idx[hidden]{display:none}
/* (the cycle and garage buttons stand as tall as the plate beside them: 48 px keys under a 64 px plate read as two kits,
   gauntlet r3) */
.cot-spec .switch{display:grid;grid-template-columns:auto minmax(40px,1fr) auto;align-items:stretch;gap:var(--s1);min-width:0;padding:0;background:none;border:0}
/* (the count on a plate of its own between the cycle pair, the kit's stat: bare on the battlefield it read as a leftover,
   gauntlet r6) */
.cot-spec .idx{align-self:stretch;display:grid;place-items:center;padding:0 var(--s2);border-radius:var(--r1);background:var(--hud-plate);
 box-shadow:var(--ring-1);font:500 var(--battle-fs-12)/1 var(--font-data);color:var(--ink-2);text-align:center;white-space:nowrap}
.cot-spec :is(.cycle,.gar){position:relative;display:flex;align-items:center;justify-content:center;min-width:0;min-height:48px;margin:0;
 padding:var(--s1) var(--s2);border:0;border-radius:var(--r1);background:var(--hud-plate);box-shadow:var(--ring-1);color:var(--ink-1);
 font:inherit;cursor:pointer;pointer-events:auto;transition:transform var(--dur-fast) var(--ease-enter);}
/* (the chevron and its key cap side by side, the Watch bar's cycle pair's form and its 20 px cap: stacked under the
   chevron here and beside it there read as two kits, gauntlet r5) */
.cot-spec .cycle{flex-direction:row;gap:var(--s2);min-width:44px;padding-inline:var(--s3)}
/* (the chevrons in the plate's ink at the Watch bar's 20 px: in the accent here and white there, one strip read as two
   kits, gauntlet r12) */
.cot-spec .cycle-icon{display:flex;color:inherit}.cot-spec .cycle-icon svg{width:20px;height:20px;display:block}
.cot-spec .cycle kbd{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 5px;box-sizing:border-box;border:0;
 border-radius:var(--control-radius);background:none;box-shadow:var(--ring-3);color:var(--ink-2);font:500 var(--battle-fs-fig-11)/1 var(--font-data)}
/* (the way out is the bar's primary action, the Watch bar's seat button's fill: an accent outline read as a selected tile,
   gauntlet r6; its glyph left of its word, as the seat button's: stacked over it, one strip read as two kits, r12) */
.cot-spec .gar{flex-direction:row;gap:var(--s2);padding-inline:var(--s3);font:600 var(--battle-fs-11)/1 var(--font-ui);text-transform:uppercase;
 letter-spacing:var(--track-label-s);white-space:nowrap;background:var(--btn-primary-fill);color:var(--btn-primary-ink);box-shadow:var(--btn-primary-bevel)}
.cot-spec .gar-icon,.cot-spec .gar-icon svg{display:block;width:20px;height:20px}
.cot-spec :is(.cycle,.gar):focus-visible{outline:none;box-shadow:var(--focus-ring)}
.cot-spec :is(.cycle,.gar):active{transform:translateY(var(--btn-press-drop))}
.cot-spec .cycle:disabled{opacity:.35;cursor:default;transform:none}
@media(hover:hover){.cot-spec :is(.cycle,.gar):hover:not(:disabled){box-shadow:var(--ring-3)}.cot-spec .gar:hover{background:var(--btn-primary-hover)}}
@keyframes cotSpecSw{from{opacity:.35;transform:translateY(3px)}to{opacity:1;transform:none}}
.cot-spec .who.sw{animation:cotSpecSw var(--dur-fast) var(--ease-enter)}
/* (the wide windows' room for the watched callsign at the plate's 18 px: at 620 px "Commander_Lon…" kept 13 characters at
   1920 and 2560, where 900x700 showed all 21, gauntlet r14) */
@media(min-width:1280px){.cot-spec{width:min(720px,calc(100vw - 32px),var(--hud-spec-max,100vw))}}
@media(max-width:900px){
 .cot-spec{grid-template-columns:minmax(0,1fr) auto auto;gap:8px}
 .cot-spec .subject{grid-template-columns:48px minmax(0,1fr) auto;gap:var(--s2);height:56px;padding:0 var(--s3) 0 var(--s2)}
 .cot-spec .portrait,.cot-spec .portrait img{width:48px;height:46px}.cot-spec .nick{font-size:var(--battle-fs-15)}
 .cot-spec .gar{letter-spacing:0}
}
body.cot-touch-layout .cot-spec .cycle kbd{display:none}
@media(max-width:600px){.cot-spec{grid-template-columns:minmax(0,1fr) auto 48px;gap:var(--s2)}.cot-spec .gar>span:last-child{display:none}.cot-spec .nick{font-size:var(--battle-fs-14)}}
@media(max-width:400px) and (orientation:portrait){
 .cot-spec{grid-template-columns:minmax(0,1fr) 88px;gap:7px var(--s2)}
 /* (the cycle group fills its column from the plate's edge: centred in it, it stood on nothing, gauntlet r3) */
 .cot-spec .subject{grid-column:1/-1}.cot-spec .switch{width:auto;justify-self:stretch}
 .cot-spec .gar>span:last-child{display:block}
}
@media(prefers-reduced-motion:reduce){.cot-spec,.cot-spec .who.sw,.cot-spec .cycle,.cot-spec .gar{animation:none;transition:none}}
`;
