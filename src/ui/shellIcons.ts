// Shared ammunition silhouettes for technical cards. Each shell class keeps
// the same 24 px envelope while the nose, body, sabot, or standoff profile
// carries the recognition signal.

const SHELL_PATH: Readonly<Record<string, string>> = Object.freeze({
  AP: '<path d="M12 2.2c2.4 2.5 3.8 5.3 3.8 8.4v8.1H8.2v-8.1c0-3.1 1.4-5.9 3.8-8.4Z" fill="currentColor"/><path d="M7 18.5h10v3.3H7Z" fill="currentColor"/><path d="M9 14.5h6" stroke="rgba(8,12,16,.5)" stroke-width="1.2"/>',
  APCR: '<path d="m12 1.8 2.5 5.5v11.5h-5V7.3Z" fill="currentColor"/><path d="M7.3 10.2h9.4v3.5H7.3ZM7 18.5h10v3.3H7Z" fill="currentColor"/><path d="M10.2 7.4h3.6" stroke="rgba(8,12,16,.5)" stroke-width="1.1"/>',
  APFSDS: '<path d="m12 1.2 1.3 4.5v11.1l4.1 4.4h-4.6L12 19.8l-.8 1.4H6.6l4.1-4.4V5.7Z" fill="currentColor"/><path d="m7.1 8.3 3.6 2.1v4.1l-3.6 2.1Zm9.8 0-3.6 2.1v4.1l3.6 2.1Z" fill="currentColor" opacity=".72"/>',
  HEAT: '<path d="M11.2 1.2h1.6v4l2.7 4.1v9.4h-7V9.3l2.7-4.1Z" fill="currentColor"/><path d="M7.2 18.5h9.6v3.3H7.2Z" fill="currentColor"/><path d="M9.1 12.2h5.8" stroke="rgba(8,12,16,.5)" stroke-width="1.2"/>',
  HE: '<path d="M8 9.1c0-3.3 1.8-5.7 4-6.6 2.2.9 4 3.3 4 6.6v9.6H8Z" fill="currentColor"/><path d="M6.8 18.5h10.4v3.3H6.8Z" fill="currentColor"/><path d="M9 13.8h6" stroke="rgba(8,12,16,.5)" stroke-width="1.2"/>',
});

/** Return a crisp inline SVG whose silhouette is specific to a shell class. */
export function shellIconSVG(type: string, size = 24, className = ''): string {
  const key = SHELL_PATH[type] ? type : 'AP';
  const cls = className ? ` class="${className}"` : '';
  return `<svg${cls} data-shell-type="${key}" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${SHELL_PATH[key]}</svg>`;
}

export const shellIconTypes = (): string[] => Object.keys(SHELL_PATH);
