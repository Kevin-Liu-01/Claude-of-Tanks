// The Deploy screen's second half (brand-ui 243; the Premiere direction's 04-deploy page). Copyright © 2026 Kevin B. Liu.
// It loads with the screen's sheet (deploy.css), off the game entry (owner: shell first), and mounts before the screen
// first shows, so nothing arrives late: the last battle again, the next battle's bot tier, the toggle for the mode's own
// settings, the load estimate, the objective map and the key hints. garage.ts owns the screen,
// its state and every choice; this module reads them through the host and adds its controls to the markup. It imports
// only modules that already stand in chunks of their own: a module the entry also imports (the profile, the kit, the load
// estimate) comes through the host, or the bundler splits it off the entry into one more request at boot.
import type { AiDifficulty } from '../game/input.ts';
import type { IconId } from './icons/icon.ts';
import { t } from './i18n.ts';
import { uiIconSVG } from './uiIcons.ts';
import { markDatum } from './dom.ts';
import { createUiCanvas } from './uiCanvas.ts';

/**
 * Each operation's briefing plate (public/media/deploy-r1/op-0N-1280.webp, the media lane's Scene Studio stills from
 * behind the attacker's lead tank at Frontline sector 1; Frontier Basin's from 20 m, over the wood 245 put round its
 * sector). An operation without one shows its battlefield's card.
 */
const CAMPAIGN_PLATES: Readonly<Record<string, string>> = Object.freeze({
  first_light: '/media/deploy-r1/op-01-1280.webp',
  iron_ridge: '/media/deploy-r1/op-02-1280.webp',
  steinburg: '/media/deploy-r1/op-03-1280.webp',
  tarkhan_steppe: '/media/deploy-r1/op-04-1280.webp',
  frontier_basin: '/media/deploy-r1/op-05-1280.webp',
  delta_crossing: '/media/deploy-r1/op-06-1280.webp',
});

/**
 * The modes with a plate background of their own (public/media/deploy-r1/<id>-1600.webp, the manifest's `-panel` rows):
 * the core modes' a 1600x900 cut of the still their card shows, the others the media lane's HUD-free battle frames. A
 * mode without one shows its tile picture, and so does every mode under reduced data (the mode picker has loaded the
 * tiles already).
 */
const PLATE_ART: ReadonlySet<string> = new Set(['standard', 'zone_control', 'capture_the_flag', 'frontline_assault', 'drone', 'turbo_ball',
  'mars', 'endless_horde', 'gun_game', 'juggernaut', 'infected', 'realistic', 'ac130', 'proving_ground']);

/** The next battle's bot tier (the input settings own it). */
export interface DeployDifficulty { get(): AiDifficulty; set(tier: AiDifficulty): void }

/** A campaign operation as the campaign tab's plate sets it (garage.ts reads the ladder). */
interface DeployOperation {
  readonly id: string;
  readonly index: number;
  readonly mapId: string;
  readonly status: 'locked' | 'ready' | 'cleared';
  readonly stars: number;
  readonly difficulty: number;
  readonly difficulties: number;
  /** The sortie clock, as m:ss. */
  readonly clock: string;
  /** The enemy formation's nation, as a roster nation name. */
  readonly enemy: string;
}

interface DeployScreenHost {
  /** The Deploy screen (garage.ts's battle menu). */
  readonly menu: HTMLElement;
  /** The row of solo pickers the bot tier and the settings toggle join. */
  readonly options: HTMLElement;
  /** The battlefields the Garage offers. */
  readonly mapIds: ReadonlySet<string>;
  /** A stored mode id as the screen offers it (its normalized id and label), or null. */
  modeOf(stored: string): { readonly mode: string; readonly label: string } | null;
  selectedMap(): string;
  selectedMode(): string;
  /** A mode's tile picture (its card's on the mode picker). */
  modeArt(mode: string): string;
  /** Choose `mode` on `mapId`, then deploy. */
  again(mode: string, mapId: string): void;
  difficulty(): DeployDifficulty | null;
  /** The last battle's mode and battlefield (the profile's newest record). */
  lastBattle(): { readonly gameMode?: string; readonly mapId: string } | undefined;
  /** This device's load estimate in whole seconds, or null before the first load. */
  loadEstimateS(): number | null;
  /** The kit's keycap, and its segmented control (the markup, its roving keys and its chosen value). */
  keycap(label: string): string;
  segmented(options: { label: string; className: string; value: string; options: readonly { value: string; label: string }[] }): string;
  wireRoving(group: HTMLElement, onSelect: (value: string) => void): void;
  setRoving(group: HTMLElement, value: string): void;
  click(): void;
  /** The campaign tab's operations list (a row under the pointer or the keyboard briefs its operation), their ids in
   *  ladder order, and the operation in focus (the next to play for an empty or unknown id). */
  readonly ops: HTMLElement;
  readonly operationIds: readonly string[];
  operation(id: string): DeployOperation | null;
  /** A roster nation's flag, the kit's rule chips and a battlefield's tactical map. */
  flag(nation: string): string;
  rules(items: readonly (readonly [IconId, string])[]): string;
  minimap(mapId: string): string;
}

export interface DeployScreen {
  /** Bring every control up to date with the Garage's state (on open and on each change of mode). */
  render(): void;
  /** Draw the chosen battlefield's opening objectives for the chosen mode (the screen must be showing). */
  drawObjectives(): void;
  /** Brief the campaign tab's operation in focus on the plate (the tab must be showing). */
  brief(id?: string): void;
  /** Set `mode`'s picture behind the plate: the chosen mode, or the one a card previews (on an open screen). */
  showMode(mode: string): void;
  /** Open the further options (Custom sides: its counts are their first fields). */
  showOptions(): void;
}

const TIERS: readonly AiDifficulty[] = ['easy', 'normal', 'hard'];

export function mountDeployScreen(host: DeployScreenHost): DeployScreen {
  const { menu, options, keycap } = host;
  // the head's "Again: <mode · map>" (the direction's .right chip): the last battle's mode on its battlefield, one press
  const again = document.createElement('button');
  again.type = 'button';
  again.className = 'cot-c-chip cot-deploy-again';
  again.hidden = true;
  menu.querySelector('.cot-deploy-head')?.append(again);
  let againOf: { readonly mode: string; readonly mapId: string } | null = null;
  again.addEventListener('click', () => { if (againOf) host.again(againOf.mode, againOf.mapId); });

  // the bot tier and the toggle for the mode's own settings (nations, the goal, the respawn, Mars's world), after the time
  // (the kit's segmented control, behind the bots' glyph: three exclusive tiers, roving keys; census row deploy-difficulty)
  const tiers = document.createElement('div');
  tiers.className = 'cot-deploy-diff';
  tiers.hidden = true;
  tiers.innerHTML = uiIconSVG('battleBots', 16) + host.segmented({ label: t('settings.gameplay.difficultyNext'), className: 'cot-deploy-tier',
    value: 'normal', options: TIERS.map((tier) => ({ value: tier, label: t(`settings.difficulty.${tier}`) })) });
  const tierGroup = tiers.querySelector<HTMLElement>('.cot-deploy-tier')!;
  host.wireRoving(tierGroup, (value) => {
    const control = host.difficulty();
    const tier = value as AiDifficulty;
    if (!control || !TIERS.includes(tier)) return;
    host.click();
    control.set(tier);
    renderTiers();
  });
  const more = document.createElement('button');
  more.type = 'button';
  more.className = 'cot-deploy-more';
  more.setAttribute('aria-expanded', 'false');
  more.setAttribute('aria-label', t('garage.deploy.moreSettings'));
  more.innerHTML = uiIconSVG('settings', 18);
  const setMore = (open: boolean): void => {
    more.setAttribute('aria-expanded', String(open));
    options.toggleAttribute('data-more', open);
    // the mode's own settings open in the battlefield card's room above the pickers (deploy.css), so nothing scrolls
    options.closest('.cot-battle-details')?.classList.toggle('is-more', open);
    // in a phone's column the further options and the battlefield picker take one place: opening one closes the other (a
    // docked Deploy opens the picker in the mode list's place, beside them)
    if (open && menu.querySelector<HTMLElement>('.cot-battle-details [data-deploy-field-pop]')?.hidden === false) {
      menu.querySelector<HTMLButtonElement>('[data-deploy-field]')?.click();
    }
  };
  more.addEventListener('click', () => {
    host.click();
    setMore(more.getAttribute('aria-expanded') !== 'true');
  });
  options.querySelector('[data-time-options]')?.after(tiers, more);

  // the Deploy bar's estimate beside its key, and the objective map over the tactical map
  const estimate = document.createElement('span');
  menu.querySelector('.cot-deploy-end')?.prepend(estimate);
  // (a uiCanvas: its lazy drawer, deployObjectives.ts, sizes it to the map's box at the capped ratio)
  const objectives = createUiCanvas(menu.querySelector('.cot-deploy-field-mm'), 'cot-deploy-field-obj').canvas;

  // the keys the screen answers (the direction's .hints), for a keyboard
  const keys = document.createElement('footer');
  keys.className = 'cot-deploy-keys';
  markDatum(keys, 'hints');
  keys.setAttribute('aria-hidden', 'true');
  // the arrows only: Enter and Esc wear their key caps on Deploy and on the Garage control already
  keys.innerHTML = `<span>${keycap('↑')}${keycap('↓')}${keycap('←')}${keycap('→')}${t('garage.deploy.keys.move')}</span>`;
  menu.append(keys);

  // a folded layout sets the plate's rules, battlefield and pickers right under the mode picker, one column; a wide
  // layout keeps them on the plate beside it
  const details = menu.querySelector<HTMLElement>('.cot-battle-details');
  const plate = menu.querySelector<HTMLElement>('.cot-deploy-plate');
  // the plate's background (owner 2026-10-26: "make its background be the picture of each mode"): the mode on the plate,
  // in its picture, under the plate's grade (deploy.css .cot-deploy-art). It stands behind the rules wherever they are:
  // the plate, or a folded layout's block under the mode picker.
  const art = document.createElement('div');
  art.className = 'cot-deploy-art';
  art.setAttribute('aria-hidden', 'true');
  const layers = [0, 1].map(() => {
    const layer = document.createElement('img');
    layer.alt = '';
    layer.decoding = 'async';
    art.append(layer);
    return layer;
  });
  function placeDetails(): void {
    if (!details || !plate) return;
    const chosen = document.body.dataset.cotPanels === 'overlay' ? menu.querySelector<HTMLElement>('[data-deploy-modes]') : null;
    if (chosen) {
      if (chosen.nextElementSibling !== details) chosen.after(details);
      details.classList.add('is-inline');
    } else if (details.parentElement !== plate) {
      plate.prepend(details);
      details.classList.remove('is-inline');
    }
    const backdrop = chosen ? details : plate;
    if (art.parentElement !== backdrop) backdrop.prepend(art);
  }
  new MutationObserver(placeDetails).observe(document.body, { attributes: true, attributeFilter: ['data-cot-panels'] });

  // Two layers: the incoming fades in over the outgoing on the motion tokens (opacity alone) once its picture is decoded,
  // then the outgoing drops out under it. A mode shown mid-fade waits for the fade, and the latest wins. A picture loads
  // the first time its mode shows on an open screen and stays cached; under reduced data the plate takes the tile.
  const pictures = new Map<string, Promise<void>>();
  const picture = (url: string): Promise<void> => {
    let ready = pictures.get(url);
    if (!ready) {
      const image = new Image();
      image.decoding = 'async';
      image.src = url;
      // a failed load is forgotten, so the mode's next showing tries again
      ready = image.decode().catch((error: unknown) => { pictures.delete(url); throw error; });
      pictures.set(url, ready);
    }
    return ready;
  };
  const saveData = (): boolean => (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true
    || matchMedia('(prefers-reduced-data: reduce)').matches;
  let front: HTMLImageElement | null = null;
  let wanted = '';
  let fading = false;
  function settle(): void {
    if (fading || !wanted || !menu.classList.contains('open')) return;
    const mode = wanted;
    const url = PLATE_ART.has(mode) && !saveData() ? `/media/deploy-r1/${mode}-1600.webp` : host.modeArt(mode);
    if (front?.getAttribute('src') === url) return;
    fading = true;
    const outgoing = front;
    const incoming = layers.find((layer) => layer !== outgoing)!;
    picture(url).then(async () => {
      if (wanted !== mode) return;
      incoming.src = url;
      incoming.dataset.mode = mode;
      await incoming.decode();
      if (wanted !== mode) return;
      outgoing?.classList.remove('is-front');
      incoming.classList.add('is-front', 'is-on');
      front = incoming;
      const fade = parseFloat(getComputedStyle(incoming).transitionDuration) * 1000 || 0;
      await new Promise((done) => setTimeout(done, fade));
      if (!outgoing) return;
      // covered now: it drops to nothing at once (a fade it kept would show through the next mode it carries)
      outgoing.classList.add('is-snap');
      outgoing.classList.remove('is-on');
      void getComputedStyle(outgoing).opacity;
      outgoing.classList.remove('is-snap');
    }).catch(() => { if (wanted === mode) wanted = ''; })
      .finally(() => { fading = false; settle(); });
  }

  // a column that scrolls says so (deploy.css .is-scrollable fades both its ends and keeps room under each fade), so a
  // column that fits shows every edge whole
  const scrollers = [...menu.querySelectorAll<HTMLElement>('.cot-battle-details,.cot-battle-mode-list,.cot-deploy-campaign')];
  // the battlefield's and the rules' resting heights (read here, after layout, never in a press): an open picker or the
  // further options take exactly that room, so nothing under them moves
  // the tab strip, sideways: a phone's fade shows only where its tabs overflow (deploy.css)
  const tabStrip = menu.querySelector<HTMLElement>('.cot-deploy-tabs');
  const markScrollers = (): void => {
    for (const el of scrollers) el.classList.toggle('is-scrollable', el.scrollHeight > el.clientHeight + 1);
    tabStrip?.classList.toggle('is-scrollable', tabStrip.scrollWidth > tabStrip.clientWidth + 1);
    if (!details || details.classList.contains('is-picking') || details.classList.contains('is-more')) return;
    const field = details.querySelector<HTMLElement>('.cot-deploy-field');
    const rules = details.querySelector<HTMLElement>('.cot-deploy-rules');
    if (field) details.style.setProperty('--field-rest', `${field.offsetHeight}px`);
    if (rules) details.style.setProperty('--rules-rest', `${rules.offsetHeight}px`);
  };
  if (typeof ResizeObserver === 'function') {
    const sizes = new ResizeObserver(markScrollers);
    for (const el of scrollers) { sizes.observe(el); for (const child of el.children) sizes.observe(child); }
    if (tabStrip) sizes.observe(tabStrip);
  }

  function renderTiers(): void {
    const control = host.difficulty();
    tiers.hidden = !control;
    const tier = control?.get();
    if (tier) host.setRoving(tierGroup, tier);
  }
  // the drawer and its data load with the first map to draw (they share the HUD's glyph modules: their own chunk)
  let drawer: Promise<typeof import('./deployObjectives.ts')> | null = null;
  function drawObjectives(): void {
    const mapId = host.selectedMap(), mode = host.selectedMode();
    if (!menu.classList.contains('open') || mapId === 'random') return;
    drawer ??= import('./deployObjectives.ts');
    void drawer.then(({ drawDeployObjectives }) => drawDeployObjectives(objectives, mapId, mode)).catch(() => { /* the bare map */ });
  }
  // the campaign tab's plate (the direction's 04-deploy plate, for an operation): the one in focus over its
  // battlefield, its brief, the enemy formation's flag, its clock, difficulty and stars, its opening objectives on the
  // tactical map, and its launch (garage.ts handles the launch's click)
  const plateBrief = menu.querySelector<HTMLElement>('[data-deploy-brief]');
  function brief(id = plateBrief?.dataset.op || ''): void {
    const op = plateBrief ? host.operation(id) : null;
    if (!plateBrief || !op) { plateBrief?.replaceChildren(); return; }
    // the briefed operation's row wears the selection (the accent ring), as a picked mode or battlefield does
    const at = host.operationIds.indexOf(op.id);
    [...host.ops.children].forEach((row, index) => row.classList.toggle('is-briefed', index === at));
    if (plateBrief.dataset.op === op.id && plateBrief.dataset.status === op.status && plateBrief.firstChild) return;
    plateBrief.dataset.op = op.id;
    plateBrief.dataset.status = op.status;
    const action = op.status === 'locked'
      ? `<span class="cot-deploy-brief-lock">${uiIconSVG('battlePrivate', 18)}${t('campaign.lockedHint', { index: op.index - 1 })}</span>`
      : `<button type="button" class="cot-c-btn cot-c-btn--56 cot-c-btn--primary" data-campaign-launch="${op.id}" data-map-id="${op.mapId}">` +
        `${uiIconSVG('deploy', 18)}${t(op.status === 'cleared' ? 'campaign.replay' : 'campaign.launch')}</button>`;
    const bars = Array.from({ length: op.difficulties }, (_, slot) => `<i class="${slot < op.difficulty ? 'on' : ''}"></i>`).join('');
    const stars = [0, 1, 2].map((slot) => `<i class="${slot < op.stars ? 'on' : ''}">${uiIconSVG('star', 14)}</i>`).join('');
    const plate = CAMPAIGN_PLATES[op.id] ?? `/maps/cards/${op.mapId}.webp`;
    plateBrief.innerHTML =
      `<div class="cot-deploy-brief-art"><img src="${plate}" alt="" width="1280" height="720" decoding="async"></div>` +
      `<div class="cot-deploy-brief-head"><span class="cot-deploy-brief-ix" aria-hidden="true">${String(op.index).padStart(2, '0')}</span>` +
      `<h3 class="cot-deploy-brief-name">${t(`campaign.op.${op.id}.title`)}</h3></div>` +
      `<p class="cot-deploy-brief-text">${t(`campaign.op.${op.id}.brief`)}</p>` +
      `<div class="cot-deploy-brief-facts">${host.rules([['clock', op.clock]])}` +
      `<span class="cot-deploy-op-stars" role="img" aria-label="${t('campaign.starsAria', { stars: op.stars, max: 3 })}">${stars}</span>` +
      `<span class="cot-deploy-op-diff" role="img" aria-label="${t('garage.deploy.difficulty', { value: op.difficulty, max: op.difficulties })}">${bars}</span>` +
      `<div class="cot-deploy-brief-where">${host.rules([['map', t(`map.${op.mapId}`)]])}${host.flag(op.enemy)}</div></div>` +
      `<div class="cot-deploy-brief-mm" aria-hidden="true"><img src="${host.minimap(op.mapId)}" alt="" width="256" height="256" decoding="async"></div>` +
      `<div class="cot-deploy-brief-go">${action}</div>`;
    const mm = plateBrief.querySelector('.cot-deploy-brief-mm');
    if (!mm) return;
    const canvas = createUiCanvas(mm, '').canvas;
    // the frontline's opening objectives (the drawer and its data load with the first map to draw)
    drawer ??= import('./deployObjectives.ts');
    void drawer.then(({ drawDeployObjectives }) => (plateBrief.dataset.op === op.id
      ? drawDeployObjectives(canvas, op.mapId, 'frontline_assault') : undefined)).catch(() => { /* the bare map */ });
  }
  // a row under the pointer or the keyboard briefs its operation
  for (const type of ['pointerover', 'focusin'] as const) host.ops.addEventListener(type, (event) => {
    const row = (event.target as Element | null)?.closest('.cot-deploy-op');
    const at = row ? [...host.ops.children].indexOf(row) : -1;
    const id = at >= 0 ? host.operationIds[at] : undefined;
    if (id) brief(id);
  });
  return {
    brief,
    showMode(mode) { wanted = mode; settle(); },
    showOptions: () => setMore(true),
    render() {
      const last = host.lastBattle();
      const offered = last?.gameMode ? host.modeOf(last.gameMode) : null;
      againOf = offered && last?.mapId && host.mapIds.has(last.mapId) ? { mode: offered.mode, mapId: last.mapId } : null;
      again.hidden = !againOf;
      if (againOf && offered) {
        // the full chip on a wide screen, "Again" alone on a phone (the mode and the battlefield stay its accessible name)
        const full = t('garage.deploy.again', { mode: offered.label, map: t(`map.${againOf.mapId}`) });
        again.innerHTML = `${uiIconSVG('rematch', 15)}<span class="full">${full}</span><span class="short">${t('garage.deploy.againShort')}</span>`;
        again.setAttribute('aria-label', full);
      }
      placeDetails();
      // the range has no further options to open (its switch stands in the row): one left open by another mode closes
      if (options.hasAttribute('data-range')) setMore(false);
      renderTiers();
      const seconds = host.loadEstimateS();
      estimate.textContent = seconds ? t('garage.deploy.loadEstimate', { value: String(seconds) }) : '';
      drawObjectives();
    },
    drawObjectives,
  };
}
