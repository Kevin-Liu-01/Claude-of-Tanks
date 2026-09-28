import { BATTLE_TIMES, type BattleTimeOfDay } from '../engine/battleWeatherPolicy.ts';
import { battlePreferences } from '../game/battlePreferences.ts';
import { t } from './i18n.ts';
import { uiIconSVG } from './uiIcons.ts';

const TIME_ICONS: Readonly<Record<BattleTimeOfDay, string>> = {
  day: 'timeDay', sunset: 'timeSunset', night: 'regionNight',
};

/** Shared fieldset contents for the Battle menu and Gameplay settings. */
export function battleTimeChoicesMarkup(hintId: string, hintKey = 'garage.battle.timeHint'): string {
  return `<legend>${t('garage.battle.timeOfDay')}</legend>` +
    BATTLE_TIMES.map(time => `<label class="cot-time-choice">` +
      `<input type="checkbox" data-battle-time="${time}" aria-describedby="${hintId}">` +
      `<span class="cot-time-content"><span class="cot-time-check" aria-hidden="true">${uiIconSVG('tick', 12)}</span>` +
      uiIconSVG(TIME_ICONS[time], 16) + `<span class="cot-time-name">${t(`atmosphere.${time}`)}</span></span></label>`).join('') +
    `<small id="${hintId}" data-time-hint>${t(hintKey)}</small>`;
}

/** Refresh on disclosure so both surfaces read the same saved/session choice. */
export function bindBattleTimeChoices(root: ParentNode, onChange: () => void): (disabled?: boolean) => void {
  let unavailable = false;
  const choices = BATTLE_TIMES.map(time => {
    const input = root.querySelector<HTMLInputElement>(`[data-battle-time="${time}"]`);
    if (!input) throw new Error(`[battleTimeChoices] missing ${time} checkbox`);
    return { time, input };
  });
  function refresh(disabled = false): void {
    unavailable = disabled;
    const times = battlePreferences.times;
    for (const { time, input } of choices) {
      input.checked = times.includes(time);
      input.disabled = unavailable || (input.checked && times.length === 1);
    }
  }
  for (const { time, input } of choices) input.addEventListener('change', () => {
    if (!unavailable) battlePreferences.setEnabled(time, input.checked);
    refresh(unavailable);
    onChange();
  });
  refresh();
  return refresh;
}
