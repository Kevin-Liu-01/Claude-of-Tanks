import { ensureStyle } from './dom.ts';
import { revealMenuSelectOption } from './menuSelectScroll.ts';

let nextId = 0;

/** Decorate the canonical field without changing its storage or change contract. */
export interface CustomSelectController { refresh(): void; close(): void }
interface CustomSelectOptions {
  label?: string;
  iconHTML?: (value: string) => string;
}
export function createCustomSelect(select: HTMLSelectElement, config: CustomSelectOptions = {}): CustomSelectController {
  const label = config.label ?? select.closest('label')?.querySelector('span')?.textContent ?? select.getAttribute('aria-label') ?? '';
  ensureStyle('cot-custom-select-style', `
.cot-custom-select-trigger:disabled{opacity:.55;cursor:default}
.cot-custom-select-trigger{display:flex!important;align-items:center;gap:8px;width:100%;min-width:0;min-height:40px;
 padding:7px 10px!important;border:1px solid #53636c!important;background:#10191f!important;color:#e6edf2!important;
 font-family:inherit;font-size:12px;font-weight:600;line-height:1.3;text-align:left;cursor:pointer}
.cot-custom-select-trigger::after{content:'';width:7px;height:7px;border-right:2px solid currentColor;border-bottom:2px solid currentColor;
 transform:rotate(45deg);margin-left:auto;flex-shrink:0}
.cot-custom-select-trigger[aria-expanded=true]{border-color:#efa62e!important;background:#20221e!important}
.cot-custom-select-trigger:focus-visible,.cot-custom-select-list [role=option]:focus-visible{outline:2px solid #efa62e;outline-offset:-3px}
.cot-custom-select-list{position:fixed;inset:auto;margin:0;padding:5px;box-sizing:border-box;border:1px solid #69747a;
 background:#10191f;color:#e6edf2;box-shadow:0 12px 32px #0009;overflow:auto;overscroll-behavior:contain;
 scrollbar-width:thin;scrollbar-color:#aa7b35 #10191f;color-scheme:dark;font-family:inherit}
.cot-custom-select-list::-webkit-scrollbar{width:6px}.cot-custom-select-list::-webkit-scrollbar-track{background:#10191f}
.cot-custom-select-list::-webkit-scrollbar-thumb{background:#aa7b35;border-radius:3px}
.cot-custom-select-list [role=option]{display:flex;align-items:center;gap:8px;width:100%;min-height:36px;padding:7px 9px;
 border:1px solid transparent;background:transparent;color:inherit;font-family:inherit;font-size:12px;font-weight:600;line-height:1.3;text-align:left;cursor:pointer}
.cot-custom-select-list [role=option]:hover{background:#243139}
.cot-custom-select-list [aria-selected=true]{background:#382b18;border-color:#b8802e;color:#ffce79}
.cot-custom-select-list [aria-selected=true]::after{content:'✓';margin-left:auto;color:#ffce79}
.cot-custom-select-trigger .cot-flag,.cot-custom-select-list .cot-flag{display:block;width:22px;height:16px;object-fit:cover;flex-shrink:0}
.cot-custom-select-mark{display:flex;align-items:center;justify-content:center;width:22px;height:16px;flex-shrink:0;color:#eab052}
.cot-custom-select-mark svg{width:18px;height:18px}
@media(pointer:coarse){.cot-custom-select-trigger,.cot-custom-select-list [role=option]{min-height:44px}}
.cot-custom-select-copy{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;letter-spacing:normal;text-transform:none}
`);
  const trigger = document.createElement('button');
  trigger.type = 'button'; trigger.className = 'cot-custom-select-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox'); trigger.setAttribute('aria-expanded', 'false');
  const list = document.createElement('div'); list.className = 'cot-custom-select-list';
  list.id = `cot-custom-select-${++nextId}`; list.popover = 'auto';
  list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', label);
  trigger.setAttribute('aria-controls', list.id);
  let entries: Array<{ id: string; label: string; disabled: boolean }> = [];
  let options: HTMLButtonElement[] = [];
  function rebuildOptions(): void {
    const next = Array.from(select.options, option => ({
      id: option.value, label: option.label, disabled: option.disabled,
    }));
    if (next.length === entries.length && next.every((entry, i) =>
      entry.id === entries[i].id && entry.label === entries[i].label && entry.disabled === entries[i].disabled)) return;
    if (list.matches(':popover-open')) close(true);
    entries = next;
    options = entries.map(entry => {
      const option = document.createElement('button'); option.type = 'button'; option.tabIndex = -1;
      option.disabled = entry.disabled;
      option.setAttribute('role', 'option'); option.dataset.value = entry.id;
      option.innerHTML = config.iconHTML?.(entry.id) ?? '';
      const text = document.createElement('span'); text.className = 'cot-custom-select-copy'; text.textContent = entry.label;
      option.append(text); return option;
    });
    list.replaceChildren(...options);
  }
  select.hidden = true; select.style.display = 'none'; select.tabIndex = -1; select.setAttribute('aria-hidden', 'true');
  select.after(trigger, list);
  function close(restoreFocus = false): void {
    if (list.matches(':popover-open')) list.hidePopover();
    trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger.focus({ preventScroll: true });
  }
  function refresh(): void {
    rebuildOptions();
    const index = select.selectedIndex;
    trigger.replaceChildren(...Array.from(options[index]?.childNodes ?? [], node => node.cloneNode(true)));
    trigger.setAttribute('aria-label', `${label}: ${entries[index]?.label ?? ''}`);
    trigger.disabled = select.disabled || !options.some(option => !option.disabled);
    options.forEach((option, i) => option.setAttribute('aria-selected', String(i === index)));
    if (trigger.disabled || select.parentElement?.closest('[hidden]')) close();
  }
  function positionList(): void {
    const rect = trigger.getBoundingClientRect(), vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
    const below = vh - rect.bottom - 12, above = rect.top - 12, down = below >= 250 || below >= above;
    const height = Math.min(288, Math.max(44, down ? below : above));
    const width = Math.min(Math.max(rect.width, 200), vw - 20);
    list.style.width = `${width}px`; list.style.maxHeight = `${height}px`;
    list.style.left = `${Math.max(10, Math.min(rect.left, vw - width - 10))}px`;
    const actualHeight = list.matches(':popover-open') ? list.getBoundingClientRect().height : height;
    list.style.top = `${Math.max(10, down ? rect.bottom + 5 : rect.top - actualHeight - 5)}px`;
  }
  function open(index = Math.max(0, entries.findIndex(entry => entry.id === select.value))): void {
    refresh();
    if (trigger.disabled) return;
    positionList();
    list.showPopover(); positionList(); trigger.setAttribute('aria-expanded', 'true');
    revealMenuSelectOption(list, options[index] && !options[index].disabled ? options[index] : options.find(option => !option.disabled)!);
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
    if (!option || option.disabled || select.disabled) return;
    select.value = option.dataset.value ?? '';
    close(true); refresh(); select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  function typeaheadIndex(event: KeyboardEvent, index: number): number {
    if (event.key.length !== 1 || event.key === ' ' || event.ctrlKey || event.metaKey || event.altKey) return -1;
    for (let step = 1; step <= entries.length; step++) {
      const candidate = (index + step) % entries.length;
      if (!entries[candidate].disabled && entries[candidate].label.toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase())) return candidate;
    }
    return -1;
  }
  list.addEventListener('keydown', event => {
    if (event.key !== 'Tab') event.stopPropagation();
    const index = options.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return; }
    if (event.key === 'Tab') { close(true); return; }
    let next = event.key === 'ArrowDown' ? (index + 1) % options.length
      : event.key === 'ArrowUp' ? (index - 1 + options.length) % options.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : -1;
    if (next < 0) next = typeaheadIndex(event, index);
    if (next < 0) return;
    const direction = event.key === 'ArrowUp' || event.key === 'End' ? -1 : 1;
    while (options[next].disabled) next = (next + direction + options.length) % options.length;
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
