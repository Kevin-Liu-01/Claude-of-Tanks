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
import { segmented, setRoving, wireRoving } from './components/components.ts';
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
.cot-teams{display:flex;align-items:center;gap:var(--s3);flex-wrap:wrap}
.cot-teams>b{min-width:54px;color:var(--ink-3);font:600 max(var(--fs-floor-12),var(--fs-12))/1 var(--font-display);letter-spacing:var(--track-label);text-transform:uppercase}
.cot-teams .cot-c-seg__opt{padding-inline:var(--s3);font-size:max(var(--fs-floor-12),var(--fs-12))}
.cot-teams .cot-flag{border-radius:1px;box-shadow:var(--flag-ring)}
.cot-teams .vs{color:var(--ink-3);font-size:max(var(--fs-floor-12),var(--fs-12))}
.cot-teams .glyph{display:inline-flex;width:18px;height:18px}
.cot-teams .glyph svg{width:18px;height:18px}
`, 'surfaces');
  const root = document.createElement('div');
  root.className = 'cot-teams';
  root.dataset.teamNations = '';
  const label = document.createElement('b');
  label.textContent = t('teams.label');
  // the kit's segmented control; render() draws each option's flags (or its glyph) over the builder's label
  root.insertAdjacentHTML('beforeend', segmented({ label: t('teams.label'), className: 'cot-teams-seg', value: options.read(),
    options: [{ value: 'mono', label: t('teams.monoLabel') }, { value: 'random', label: t('teams.randomLabel') }] }));
  const group = root.querySelector<HTMLElement>('.cot-teams-seg')!;
  const [mono, random] = group.querySelectorAll<HTMLButtonElement>('.cot-c-seg__opt');
  root.prepend(label);
  // a side without a flag: the globe (the game picks its nation); Random wears the shuffle, one glyph a meaning (Deploy r40-r49)
  const glyph = (id: 'globe' | 'shuffle'): string => `<span class="glyph" aria-hidden="true">${uiIconSVG(id, 18)}</span>`;
  function render(): void {
    const value = options.read();
    const locked = !!options.locked?.();
    const own = countryNation(options.playerCountry());
    const enemy = countryNation(options.enemyCountry());
    mono.innerHTML = `${own ? flagIconHTML(own, 20, 14) : glyph('globe')}<span class="vs" aria-hidden="true">${t('teams.vs')}</span>`
      + `${enemy ? flagIconHTML(enemy, 20, 14) : glyph('globe')}<span>${t('teams.mono')}</span>`;
    random.innerHTML = `${glyph('shuffle')}<span>${t('teams.random')}</span>`;
    mono.setAttribute('aria-label', t('teams.monoLabel'));
    random.setAttribute('aria-label', t('teams.randomLabel'));
    mono.disabled = random.disabled = locked;
    setRoving(group, value);
  }
  wireRoving(group, (value) => {
    if (value === options.read()) return;
    options.write(value as TeamNationsId);
    render();
  });
  render();
  return { root, render };
}
