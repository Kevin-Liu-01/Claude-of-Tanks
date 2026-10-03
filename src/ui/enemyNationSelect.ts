import { ENEMY_NATION_OPTIONS } from '../game/teamArrangement.ts';
import { ensureStyle } from './dom.ts';
import { t } from './i18n.ts';
import type { CustomSelectController } from './customSelect.ts';
import { createNationSelect } from './nationSelect.ts';

/** Nation artwork on the same custom control used by every battle setting. */
export function createEnemyNationSelect(select: HTMLSelectElement): CustomSelectController {
  ensureStyle('cot-enemy-nation-style', `
.cot-mode-settings .cot-nation-field{grid-column:1/-1}
.cot-play .arrange-fields .cot-nation-field{grid-column:span 2}
@media(max-width:650px){.cot-play .arrange-fields .cot-nation-field{grid-column:1/-1}}
`);
  select.closest('label')?.classList.add('cot-nation-field');
  return createNationSelect(select, t('playMenu.arrange.nation'), value =>
    ENEMY_NATION_OPTIONS.find(option => option.id === value)?.specNations[0]);
}
