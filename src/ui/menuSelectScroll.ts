/** Reveal an option inside its fixed popup without moving the surrounding
 * panel. A panel scroll dismisses the popup, so scrollIntoView is unsafe. */
export function revealMenuSelectOption(list: HTMLElement, option: HTMLElement): void {
  option.focus({ preventScroll: true });
  const bounds = list.getBoundingClientRect();
  const target = option.getBoundingClientRect();
  const top = bounds.top + list.clientTop;
  const bottom = top + list.clientHeight;
  if (target.top < top) list.scrollTop += target.top - top;
  else if (target.bottom > bottom) list.scrollTop += target.bottom - bottom;
}
