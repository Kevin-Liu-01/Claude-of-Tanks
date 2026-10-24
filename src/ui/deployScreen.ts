// The Deploy screen's second half (brand-ui 243; the Premiere direction's 04-deploy page). Copyright © 2026 Kevin B. Liu.
// It loads with the screen's sheet (deploy.css), off the game entry (owner: shell first), and mounts before the screen
// first shows, so nothing arrives late: the last battle again, the next battle's bot tier, the toggle for the mode's own
// settings, the core cards' badges, the load estimate, the objective map and the key hints. garage.ts owns the screen,
// its state and every choice; this module reads them through the host and adds its controls to the markup. It imports
// only modules that already stand in chunks of their own: a module the entry also imports (the profile, the kit, the load
// estimate) comes through the host, or the bundler splits it off the entry into one more request at boot.
import type { AiDifficulty } from '../game/input.ts';
import { t } from './i18n.ts';
import { uiIconSVG } from './uiIcons.ts';

/** The next battle's bot tier (the input settings own it). */
export interface DeployDifficulty { get(): AiDifficulty; set(tier: AiDifficulty): void }

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
}

export interface DeployScreen {
  /** Bring every control up to date with the Garage's state (on open and on each change of mode). */
  render(): void;
  /** Draw the chosen battlefield's opening objectives for the chosen mode (the screen must be showing). */
  drawObjectives(): void;
  /** Arrow keys: move the chosen mode across the cards and rows, by where each sits on screen. */
  move(code: string, from: Element | null): void;
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
  more.title = t('garage.deploy.moreSettings');
  more.innerHTML = uiIconSVG('settings', 18);
  more.addEventListener('click', () => {
    host.click();
    const open = more.getAttribute('aria-expanded') !== 'true';
    more.setAttribute('aria-expanded', String(open));
    options.toggleAttribute('data-more', open);
  });
  options.querySelector('[data-time-options]')?.after(tiers, more);

  // the core cards' badges (the direction's .badge): the chosen mode, and the mode the campaign plays
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
  keys.setAttribute('aria-hidden', 'true');
  keys.innerHTML = `<span>${keycap('↑')}${keycap('↓')}${keycap('←')}${keycap('→')}${t('garage.deploy.keys.move')}</span>` +
    `<span>${keycap(t('garage.key.enter'))}${t('garage.battle')}</span><span>${keycap('Esc')}${t('garage.nav.garage')}</span>`;
  menu.append(keys);

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
  return {
    render() {
      for (const { card, badge } of badges) {
        const chosen = card.getAttribute('aria-pressed') === 'true';
        const label = chosen ? t('garage.deploy.selected') : card.dataset.gameMode === 'frontline_assault' ? t('campaign.heading') : '';
        badge.textContent = label;
        badge.hidden = !label;
        badge.classList.toggle('cot-c-tag--accent', chosen);
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
