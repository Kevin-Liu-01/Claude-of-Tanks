import { createCustomSelect, type CustomSelectController } from './customSelect.ts';
import { flagIconHTML } from './flags.ts';
import { uiIconSVG } from './uiIcons.ts';

/** Shared flag dropdown; non-national choices use the same globe artwork. */
export function createNationSelect(
  select: HTMLSelectElement,
  label: string,
  nationForValue: (value: string) => string | undefined,
): CustomSelectController {
  return createCustomSelect(select, {
    label,
    iconHTML(value) {
      const nation = nationForValue(value);
      return nation ? flagIconHTML(nation, 22, 16)
        : `<span class="cot-custom-select-mark" aria-hidden="true">${uiIconSVG('globe')}</span>`;
    },
  });
}
