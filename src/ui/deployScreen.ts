// The Deploy screen's second half (brand-ui 243; the Premiere direction's 04-deploy page). Copyright © 2026 Kevin B. Liu.
// It loads with the screen's sheet (deploy.css), off the game entry (owner: shell first), and mounts before the screen
// first shows, so nothing arrives late: the last battle again, the next battle's bot tier, the toggle for the mode's own
// settings, the core cards' badges, the load estimate, the objective map and the key hints. garage.ts owns the screen,
// its state and every choice; this module reads them through the host and adds its controls to the markup. It imports
// only modules that already stand in chunks of their own: a module the entry also imports (the profile, the kit, the load
// estimate) comes through the host, or the bundler splits it off the entry into one more request at boot.
import type { AiDifficulty } from '../game/input.ts';
import type { IconId } from './icons/icon.ts';
import { t } from './i18n.ts';
import { uiIconSVG } from './uiIcons.ts';
import { markDatum } from './dom.ts';

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
  /** Choose `mode` on `mapId`, then deploy. */
  again(mode: string, mapId: string): void;
  difficulty(): DeployDifficulty | null;
  /** The last battle's mode and battlefield (the profile's newest record). */
  lastBattle(): { readonly gameMode?: string; readonly mapId: string } | undefined;
  /** This device's load estimate in whole seconds, or null before the first load. */
  loadEstimateS(): number | null;
  /** The kit's keycap. */
  keycap(label: string): string;
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
  /** Arrow keys: move the chosen mode across the cards and rows, by where each sits on screen. */
  move(code: string, from: Element | null): void;
  /** Brief the campaign tab's operation in focus on the plate (the tab must be showing). */
  brief(id?: string): void;
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
  const tiers = document.createElement('div');
  tiers.className = 'cot-deploy-diff';
  tiers.setAttribute('role', 'group');
  tiers.setAttribute('aria-label', t('settings.gameplay.difficultyNext'));
  tiers.hidden = true;
  tiers.innerHTML = uiIconSVG('battleBots', 16) + TIERS.map((tier) =>
    `<button type="button" data-diff="${tier}" aria-pressed="false">${t(`settings.difficulty.${tier}`)}</button>`).join('');
  tiers.addEventListener('click', (event) => {
    const tier = (event.target as Element | null)?.closest<HTMLButtonElement>('[data-diff]')?.dataset.diff as AiDifficulty | undefined;
    const control = host.difficulty();
    if (!control || !tier || !TIERS.includes(tier)) return;
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
  more.addEventListener('click', () => {
    host.click();
    const open = more.getAttribute('aria-expanded') !== 'true';
    more.setAttribute('aria-expanded', String(open));
    options.toggleAttribute('data-more', open);
    // the mode's own settings open under the pickers: bring them into the plate's view (a compact screen scrolls it)
    if (open) requestAnimationFrame(() => (options.querySelector<HTMLElement>('.cot-mode-settings:not([hidden])') ?? options).scrollIntoView({ block: 'nearest' }));
  });
  options.querySelector('[data-time-options]')?.after(tiers, more);

  // the core cards' badge (the direction's .badge): the mode the campaign plays (the ring says which mode is chosen)
  const badges = [...menu.querySelectorAll<HTMLButtonElement>('.cot-deploy-cards .cot-battle-choice')].map((card) => {
    const badge = document.createElement('span');
    badge.className = 'cot-c-tag cot-deploy-badge';
    badge.hidden = true;
    card.append(badge);
    return { card, badge };
  });

  // the Deploy bar's estimate beside its key, and the objective map over the tactical map
  const estimate = document.createElement('span');
  menu.querySelector('.cot-deploy-end')?.prepend(estimate);
  const objectives = document.createElement('canvas');
  objectives.className = 'cot-deploy-field-obj';
  objectives.width = objectives.height = 256;
  menu.querySelector('.cot-deploy-field-mm')?.append(objectives);

  // the keys the screen answers (the direction's .hints), for a keyboard
  const keys = document.createElement('footer');
  keys.className = 'cot-deploy-keys';
  markDatum(keys, 'hints');
  keys.setAttribute('aria-hidden', 'true');
  // the arrows only: Enter and Esc wear their key caps on Deploy and on the Garage control already
  keys.innerHTML = `<span>${keycap('↑')}${keycap('↓')}${keycap('←')}${keycap('→')}${t('garage.deploy.keys.move')}</span>`;
  menu.append(keys);

  // a folded layout opens the chosen mode in place (91's .sel): the plate's rules, battlefield and pickers stand right
  // under its card or row, one block; a wide layout keeps them on the plate
  const details = menu.querySelector<HTMLElement>('.cot-battle-details');
  const plate = menu.querySelector<HTMLElement>('.cot-deploy-plate');
  function placeDetails(): void {
    if (!details || !plate) return;
    const chosen = document.body.dataset.cotPanels === 'overlay'
      ? menu.querySelector<HTMLElement>('#cot-deploy-quick .cot-battle-choice[aria-pressed="true"]') : null;
    if (chosen) {
      if (chosen.nextElementSibling !== details) chosen.after(details);
      details.classList.add('is-inline');
    } else if (details.parentElement !== plate) {
      plate.prepend(details);
      details.classList.remove('is-inline');
    }
  }
  new MutationObserver(placeDetails).observe(document.body, { attributes: true, attributeFilter: ['data-cot-panels'] });

  // a column that scrolls says so (deploy.css .is-scrollable fades both its ends and keeps room under each fade), so a
  // column that fits shows every edge whole
  const scrollers = [...menu.querySelectorAll<HTMLElement>('.cot-battle-details,.cot-battle-mode-list,.cot-deploy-campaign')];
  const markScrollers = (): void => {
    for (const el of scrollers) el.classList.toggle('is-scrollable', el.scrollHeight > el.clientHeight + 1);
  };
  if (typeof ResizeObserver === 'function') {
    const sizes = new ResizeObserver(markScrollers);
    for (const el of scrollers) { sizes.observe(el); for (const child of el.children) sizes.observe(child); }
  }

  function renderTiers(): void {
    const control = host.difficulty();
    tiers.hidden = !control;
    const tier = control?.get();
    for (const button of tiers.querySelectorAll<HTMLButtonElement>('[data-diff]')) button.setAttribute('aria-pressed', String(button.dataset.diff === tier));
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
      `<div class="cot-deploy-brief-facts">${host.flag(op.enemy)}${host.rules([['map', t(`map.${op.mapId}`)], ['clock', op.clock]])}` +
      `<span class="cot-deploy-op-diff" role="img" aria-label="${t('garage.deploy.difficulty', { value: op.difficulty, max: op.difficulties })}">${bars}</span>` +
      `<span class="cot-deploy-op-stars" role="img" aria-label="${t('campaign.starsAria', { stars: op.stars, max: 3 })}">${stars}</span></div>` +
      `<div class="cot-deploy-brief-mm" aria-hidden="true"><img src="${host.minimap(op.mapId)}" alt="" width="256" height="256" decoding="async">` +
      `<canvas width="256" height="256"></canvas></div>` +
      `<div class="cot-deploy-brief-go">${action}</div>`;
    const canvas = plateBrief.querySelector('canvas');
    if (!canvas) return;
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
    render() {
      for (const { card, badge } of badges) {
        const label = card.dataset.gameMode === 'frontline_assault' ? t('campaign.heading') : '';
        badge.textContent = label;
        badge.hidden = !label;
      }
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
      renderTiers();
      const seconds = host.loadEstimateS();
      estimate.textContent = seconds ? t('garage.deploy.loadEstimate', { value: String(seconds) }) : '';
      drawObjectives();
    },
    drawObjectives,
    move(code, from) {
      const panel = menu.querySelector<HTMLElement>('#cot-deploy-quick');
      if (!panel || panel.hidden) return;
      const choices = [...panel.querySelectorAll<HTMLButtonElement>('.cot-battle-choice:not([data-proving])')];
      const current = from?.closest<HTMLButtonElement>('.cot-battle-choice:not([data-proving])')
        ?? choices.find((choice) => choice.getAttribute('aria-pressed') === 'true') ?? choices[0];
      if (!current) return;
      const a = current.getBoundingClientRect();
      const dx = code === 'ArrowLeft' ? -1 : code === 'ArrowRight' ? 1 : 0;
      const dy = code === 'ArrowUp' ? -1 : code === 'ArrowDown' ? 1 : 0;
      let best: HTMLButtonElement | null = null;
      let bestScore = Infinity;
      for (const choice of choices) {
        if (choice === current) continue;
        const b = choice.getBoundingClientRect();
        const ox = b.left + b.width / 2 - (a.left + a.width / 2), oy = b.top + b.height / 2 - (a.top + a.height / 2);
        const along = dx ? ox * dx : oy * dy;
        if (along <= 1) continue;
        const score = along + 2 * (dx ? Math.abs(oy) : Math.abs(ox));
        if (score < bestScore) { bestScore = score; best = choice; }
      }
      if (!best) return;
      best.click();
      best.focus();
    },
  };
}
