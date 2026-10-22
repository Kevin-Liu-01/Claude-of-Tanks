/**
 * The TEAMS control (gameplay-modes-228; owner 2026-10-18: "be able to select wehtehr we want team enemies to be
 * mononation or just random"): one segmented switch — MONO-NATION shows the player's flag against the enemy's (the
 * chosen country, or AUTO's globe), RANDOM shows the globe — with very little text (owner UI rules 2026-10-17: flags and
 * icons, no eyebrows, the shared font tokens). The garage battle menu, the solo play menu and the lobby share it; in a
 * lobby the host edits it and the guests see it locked. It reads and writes through the callers (the per-player
 * preference solo, the room's arrangement in a lobby).
 */
import { ensureStyle } from './styleLayers.ts';
import { flagIconHTML } from './flags.ts';
import { t } from './i18n.ts';
import { uiIconSVG } from './uiIcons.ts';
import { FONT_COND } from './fonts.ts';
import { countryNation, type CountryId } from '../sim/countries.ts';
import type { TeamNationsId } from '../sim/matchRuleset.ts';

interface TeamNationsControlOptions {
  /** The value shown now (the room's in a lobby, else the player's preference). */
  read(): TeamNationsId;
  write(value: TeamNationsId): void;
  /** The country the player's vehicle fights for (its flag leads MONO; sim/countries.ts countryOfVehicle), or null. */
  playerCountry(): CountryId | null;
  /** The enemy country under MONO (an id), or null for AUTO. */
  enemyCountry(): string | null;
  /** A guest in a lobby, or a room that is starting: the control shows, but does not change. */
  locked?(): boolean;
}

export function createTeamNationsControl(options: TeamNationsControlOptions): { root: HTMLElement; render(): void } {
  ensureStyle('cot-team-nations-style', `
.cot-teams{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.cot-teams>b{font:700 11px ${FONT_COND};letter-spacing:.14em;text-transform:uppercase;color:#cfd9e0;min-width:54px}
.cot-teams [role=radiogroup]{display:inline-flex;border:1px solid rgba(255,255,255,.16);border-radius:6px;overflow:hidden}
.cot-teams button{display:inline-flex;align-items:center;gap:6px;padding:7px 12px;background:transparent;border:0;
  color:#aebcc6;font:700 11px ${FONT_COND};letter-spacing:.08em;text-transform:uppercase;cursor:pointer;min-height:34px}
.cot-teams button+button{border-left:1px solid rgba(255,255,255,.16)}
.cot-teams button[aria-checked=true]{background:rgba(255,255,255,.12);color:#f2f6f8}
.cot-teams button:disabled{cursor:default;opacity:.62}
.cot-teams button:focus-visible{outline:2px solid #e8c15a;outline-offset:-2px}
.cot-teams .cot-flag{border-radius:2px;box-shadow:0 0 0 1px rgba(0,0,0,.35)}
.cot-teams .vs{opacity:.55;font-size:11px}
.cot-teams .globe{display:inline-flex;width:18px;height:18px}
.cot-teams .globe svg{width:18px;height:18px}
@media(max-width:480px){.cot-teams button{padding:7px 9px}}
`, 'surfaces');
  const root = document.createElement('div');
  root.className = 'cot-teams';
  root.dataset.teamNations = '';
  const label = document.createElement('b');
  label.textContent = t('teams.label');
  const group = document.createElement('div');
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', t('teams.label'));
  const mono = document.createElement('button');
  mono.type = 'button'; mono.dataset.teamNations = 'mono'; mono.setAttribute('role', 'radio');
  const random = document.createElement('button');
  random.type = 'button'; random.dataset.teamNations = 'random'; random.setAttribute('role', 'radio');
  group.append(mono, random);
  root.append(label, group);
  const globe = (): string => `<span class="globe" aria-hidden="true">${uiIconSVG('globe')}</span>`;
  function render(): void {
    const value = options.read();
    const locked = !!options.locked?.();
    const own = countryNation(options.playerCountry());
    const enemy = countryNation(options.enemyCountry());
    mono.innerHTML = `${own ? flagIconHTML(own, 20, 14) : globe()}<span class="vs" aria-hidden="true">${t('teams.vs')}</span>`
      + `${enemy ? flagIconHTML(enemy, 20, 14) : globe()}<span>${t('teams.mono')}</span>`;
    random.innerHTML = `${globe()}<span>${t('teams.random')}</span>`;
    mono.setAttribute('aria-label', t('teams.monoLabel'));
    random.setAttribute('aria-label', t('teams.randomLabel'));
    for (const button of [mono, random]) {
      button.setAttribute('aria-checked', String(button.dataset.teamNations === value));
      button.disabled = locked;
    }
  }
  group.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-team-nations]');
    if (!button || button.disabled) return;
    const value = button.dataset.teamNations as TeamNationsId;
    if (value === options.read()) return;
    options.write(value);
    render();
  });
  render();
  return { root, render };
}
