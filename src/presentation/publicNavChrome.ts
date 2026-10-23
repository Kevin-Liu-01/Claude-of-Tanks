// The public top bar's two script-owned controls as markup (2026-10-22, nav-perf-240): the language switch and the
// phone menu button. publicNav.ts built both when it ran, after the first paint, and the bar re-laid out (its links
// moved by the switch's width). tools/viteNavChrome.ts writes this same markup into every built public page, and
// publicNav.ts binds what is already there, so the bar paints once in its final layout.

const LOCALE_GLOBE = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/>'
  + '<path d="M3.8 12h16.4M12 3.5c2.2 2.4 3.3 5.2 3.3 8.5S14.2 18.1 12 20.5M12 3.5C9.8 5.9 8.7 8.7 8.7 12s1.1 6.1 3.3 8.5"/></svg>';

/** The switch's face: the globe and both locale names, the current one marked. */
export function localeSwitchFace(current: string): string {
  return `${LOCALE_GLOBE}`
    + `<span data-locale-option="en-US"${current === 'en-US' ? ' class="is-current"' : ''}>EN</span>`
    + '<i aria-hidden="true">/</i>'
    + `<span data-locale-option="zh-CN"${current === 'zh-CN' ? ' class="is-current"' : ''}>中文</span>`;
}

/** The switch and its wrapper (publicNav.ts adds the label, the click and the credit). */
export function localeSwitchMarkup(current: string): string {
  return `<div class="public-nav__locale-wrap"><button class="public-nav__locale" type="button" data-locale="${current}">`
    + `${localeSwitchFace(current)}</button></div>`;
}

export const MENU_TRIGGER_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5h16M4 12h16M4 17.5h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

/** The phone menu button (shown by the overlay layout only; publicNav.ts adds its label and its menu). */
export const MENU_TRIGGER_MARKUP = '<button class="public-nav__menu-trigger" type="button" aria-expanded="false" '
  + `aria-controls="public-nav-menu">${MENU_TRIGGER_ICON}</button>`;
