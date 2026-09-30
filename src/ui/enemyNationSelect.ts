import { ENEMY_NATION_OPTIONS } from '../game/teamArrangement.ts';
import { ensureStyle } from './dom.ts';
import { flagIconHTML } from './flags.ts';
import { t } from './i18n.ts';
import { revealMenuSelectOption } from './menuSelectScroll.ts';
import { uiIconSVG } from './uiIcons.ts';

let nextId = 0;

/** Decorate the canonical field without changing its storage or change contract. */
export function createEnemyNationSelect(select: HTMLSelectElement): { refresh(): void; close(): void } {
  ensureStyle('cot-enemy-nation-style', `
.cot-mode-settings .cot-nation-field{grid-column:1/-1}
.cot-play .arrange-fields .cot-nation-field{grid-column:span 2}
@media(max-width:650px){.cot-play .arrange-fields .cot-nation-field{grid-column:1/-1}}
.cot-nation-trigger:disabled{opacity:.55;cursor:default}
.cot-nation-trigger{display:flex!important;align-items:center;gap:10px;width:100%;min-width:0;min-height:46px;
 padding:10px 13px!important;border:1px solid #53636c!important;background:#10191f!important;color:#e6edf2!important;
 font-family:inherit;font-size:15px;font-weight:600;line-height:1.3;text-align:left;cursor:pointer}
.cot-nation-trigger::after{content:'';width:7px;height:7px;border-right:2px solid currentColor;border-bottom:2px solid currentColor;
 transform:rotate(45deg);margin-left:auto;flex-shrink:0}
.cot-nation-trigger[aria-expanded=true]{border-color:#efa62e!important;background:#20221e!important}
.cot-nation-trigger:focus-visible,.cot-nation-list [role=option]:focus-visible{outline:2px solid #efa62e;outline-offset:-3px}
.cot-nation-list{position:fixed;inset:auto;margin:0;padding:5px;box-sizing:border-box;border:1px solid #69747a;
 background:#10191f;color:#e6edf2;box-shadow:0 12px 32px #0009;overflow:auto;overscroll-behavior:contain;
 scrollbar-width:thin;scrollbar-color:#aa7b35 #10191f;color-scheme:dark;font-family:inherit}
.cot-nation-list::-webkit-scrollbar{width:6px}.cot-nation-list::-webkit-scrollbar-track{background:#10191f}
.cot-nation-list::-webkit-scrollbar-thumb{background:#aa7b35;border-radius:3px}
.cot-nation-list [role=option]{display:flex;align-items:center;gap:12px;width:100%;min-height:44px;padding:10px 12px;
 border:1px solid transparent;background:transparent;color:inherit;font-family:inherit;font-size:15px;font-weight:600;line-height:1.3;text-align:left;cursor:pointer}
.cot-nation-list [role=option]:hover{background:#243139}
.cot-nation-list [aria-selected=true]{background:#382b18;border-color:#b8802e;color:#ffce79}
.cot-nation-list [aria-selected=true]::after{content:'✓';margin-left:auto;color:#ffce79}
.cot-nation-trigger .cot-flag,.cot-nation-list .cot-flag{display:block;width:28px;height:21px;object-fit:cover;flex-shrink:0}
.cot-nation-mark{display:flex;align-items:center;justify-content:center;width:28px;height:21px;flex-shrink:0;color:#eab052}
.cot-nation-mark svg{width:23px;height:23px}
.cot-nation-copy{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;letter-spacing:normal;text-transform:none}
`);
  const trigger = document.createElement('button');
  trigger.type = 'button'; trigger.className = 'cot-nation-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox'); trigger.setAttribute('aria-expanded', 'false');
  const list = document.createElement('div'); list.className = 'cot-nation-list';
  list.id = `cot-enemy-nation-${++nextId}`; list.popover = 'auto';
  list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', t('playMenu.arrange.nation'));
  trigger.setAttribute('aria-controls', list.id);
  const entries = [{ id: '', label: t('playMenu.arrange.mixed'), art: `<span class="cot-nation-mark" aria-hidden="true">${uiIconSVG('globe')}</span>` },
    ...ENEMY_NATION_OPTIONS.map(({ id, specNations }) => ({ id, label: t(`campaign.enemy.${id}`), art: flagIconHTML(specNations[0], 28, 21) }))];
  const options = entries.map(entry => {
    const option = document.createElement('button'); option.type = 'button'; option.tabIndex = -1;
    option.setAttribute('role', 'option'); option.dataset.value = entry.id;
    option.innerHTML = entry.art;
    const text = document.createElement('span'); text.className = 'cot-nation-copy'; text.textContent = entry.label;
    option.append(text); list.append(option); return option;
  });
  select.closest('label')?.classList.add('cot-nation-field');
  select.hidden = true; select.style.display = 'none'; select.tabIndex = -1; select.setAttribute('aria-hidden', 'true');
  select.after(trigger, list);
  function close(restoreFocus = false): void {
    if (list.matches(':popover-open')) list.hidePopover();
    trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger.focus({ preventScroll: true });
  }
  function refresh(): void {
    const index = Math.max(0, entries.findIndex(entry => entry.id === select.value));
    trigger.replaceChildren(...Array.from(options[index].childNodes, node => node.cloneNode(true)));
    trigger.setAttribute('aria-label', `${t('playMenu.arrange.nation')}: ${entries[index].label}`);
    trigger.disabled = select.disabled;
    options.forEach((option, i) => option.setAttribute('aria-selected', String(i === index)));
    if (trigger.disabled) close();
  }
  function positionList(): void {
    const rect = trigger.getBoundingClientRect(), vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
    const below = vh - rect.bottom - 12, above = rect.top - 12, down = below >= 250 || below >= above;
    const height = Math.min(352, Math.max(44, down ? below : above));
    const width = Math.min(Math.max(rect.width, 240), vw - 20);
    list.style.width = `${width}px`; list.style.maxHeight = `${height}px`;
    list.style.left = `${Math.max(10, Math.min(rect.left, vw - width - 10))}px`;
    list.style.top = `${Math.max(10, down ? rect.bottom + 5 : rect.top - height - 5)}px`;
  }
  function open(index = Math.max(0, entries.findIndex(entry => entry.id === select.value))): void {
    if (select.disabled) return;
    positionList();
    list.showPopover(); trigger.setAttribute('aria-expanded', 'true');
    revealMenuSelectOption(list, options[index]);
  }
  trigger.addEventListener('click', () => list.matches(':popover-open') ? close() : open());
  trigger.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    open(event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : undefined);
  });
  list.addEventListener('click', event => {
    const option = (event.target as Element).closest<HTMLButtonElement>('[role=option]');
    if (!option || select.disabled) return;
    select.value = option.dataset.value ?? '';
    close(true); refresh(); select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  list.addEventListener('keydown', event => {
    if (event.key !== 'Tab') event.stopPropagation();
    const index = options.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return; }
    if (event.key === 'Tab') { close(true); return; }
    let next = event.key === 'ArrowDown' ? (index + 1) % options.length
      : event.key === 'ArrowUp' ? (index - 1 + options.length) % options.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : -1;
    if (event.key.length === 1 && event.key !== ' ' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      for (let step = 1; step <= entries.length; step++) {
        const candidate = (index + step) % entries.length;
        if (entries[candidate].label.toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase())) { next = candidate; break; }
      }
    }
    if (next < 0) return;
    event.preventDefault(); event.stopPropagation(); revealMenuSelectOption(list, options[next]);
  });
  const reposition = (event: Event): void => {
    if (event.target instanceof Node && list.contains(event.target)) return;
    if (!trigger.getClientRects().length) close();
    else positionList();
  };
  list.addEventListener('toggle', () => {
    const open = list.matches(':popover-open'); trigger.setAttribute('aria-expanded', String(open));
    if (open) { window.addEventListener('resize', reposition); document.addEventListener('scroll', reposition, true); }
    else { window.removeEventListener('resize', reposition); document.removeEventListener('scroll', reposition, true); }
  });
  select.addEventListener('change', refresh);
  refresh();
  return { refresh, close };
}
