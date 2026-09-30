import { ENEMY_NATION_OPTIONS } from '../game/teamArrangement.ts';
import { ensureStyle } from './dom.ts';
import { flagIconHTML } from './flags.ts';
import { t } from './i18n.ts';
import { uiIconSVG } from './uiIcons.ts';
import { createCustomSelect, type CustomSelectController } from './customSelect.ts';

/** Nation artwork on the same custom control used by every battle setting. */
export function createEnemyNationSelect(select: HTMLSelectElement): CustomSelectController {
  ensureStyle('cot-enemy-nation-style', `
.cot-mode-settings .cot-nation-field{grid-column:1/-1}
.cot-play .arrange-fields .cot-nation-field{grid-column:span 2}
@media(max-width:650px){.cot-play .arrange-fields .cot-nation-field{grid-column:1/-1}}
`);
  select.closest('label')?.classList.add('cot-nation-field');
  return createCustomSelect(select, {
    label: t('playMenu.arrange.nation'),
    iconHTML(value) {
      const nation = ENEMY_NATION_OPTIONS.find(option => option.id === value);
      return nation ? flagIconHTML(nation.specNations[0], 22, 16)
        : `<span class="cot-custom-select-mark" aria-hidden="true">${uiIconSVG('globe')}</span>`;
    },
  });
}
