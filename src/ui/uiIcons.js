// Shared vector UI icon library. Every glyph uses the same 24px grid,
// rounded 1.7px keyline and restrained solid accents so garage, HUD, mobile
// controls and combat reports read as one authored set at 12-34px.

const P = {
  garage: '<path d="M3 15.5h18v3H3zM5 12.5h14l2 3H3zM8 9h8l1.5 3.5h-11zM10 6h4v3h-4z" fill="currentColor"/><path d="M4 20.5h16" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  studio: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="m4.4 7.7 7.6 4.2 7.6-4.2M12 12v8.6" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="2.1" fill="currentColor"/>',
  home: '<path d="m3 11 9-7 9 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5.5 10.5V21h13V10.5M10 21v-6h4v6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
  battleBots: '<circle cx="12" cy="12" r="7.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M7 13.1h10l1.3 3.2H5.7Zm2.2-3.2h5.6l1 3.2H8.2Z" fill="currentColor"/><circle cx="12" cy="12" r="1.15" fill="rgba(8,12,16,.7)"/>',
  battlePrivate: '<path d="m12 2.2 8 3v5.7c0 4.8-3.1 8-8 10.9-4.9-2.9-8-6.1-8-10.9V5.2Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><rect x="7.5" y="10.6" width="9" height="6.5" rx="1.4" fill="currentColor"/><path d="M9.8 10.6V8.8a2.2 2.2 0 0 1 4.4 0v1.8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="12" cy="13.8" r="1" fill="rgba(8,12,16,.68)"/>',
  battleLan: '<path d="M12 15.3v6M8 21.3h8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="13.4" r="2.2" fill="currentColor"/><path d="M7.9 9.7a5.8 5.8 0 0 0 0 7.4m8.2-7.4a5.8 5.8 0 0 1 0 7.4M5.2 7.2a9.3 9.3 0 0 0 0 12.4m13.6-12.4a9.3 9.3 0 0 1 0 12.4" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"/><circle cx="4.8" cy="5" r="1.8" fill="currentColor"/><circle cx="19.2" cy="5" r="1.8" fill="currentColor"/>',
  battleRanked: '<path d="m12 2.1 2.2 4.5 5 .7-3.6 3.5.8 4.9-4.4-2.3-4.4 2.3.8-4.9-3.6-3.5 5-.7Z" fill="currentColor"/><path d="m3 14.5 9 5.1 9-5.1v3.8L12 23l-9-4.7Z" fill="currentColor" opacity=".72"/><path d="m6.2 13.2 5.8 3.2 5.8-3.2" fill="none" stroke="rgba(8,12,16,.6)" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"/>',
  battleRecord: '<path d="M5 2.5h10l4 4V21.5H5Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M15 2.8V7h4M8 9h5M8 12h4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="14.6" cy="16.3" r="3.3" fill="currentColor"/><path d="m14.6 14.3.6 1.2 1.3.2-.9.9.2 1.3-1.2-.6-1.2.6.2-1.3-.9-.9 1.3-.2Z" fill="rgba(8,12,16,.68)"/>',
  credits: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M14.8 8.3c-.7-.6-1.6-.9-2.7-.9-1.5 0-2.6.7-2.6 1.8 0 2.9 5.5 1.1 5.5 4.4 0 1.4-1.2 2.4-3 2.4-1.2 0-2.3-.4-3.1-1.1M12 5.3v13.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  gold: '<path d="M12 2.8 20.5 8 17.2 19H6.8L3.5 8Z" fill="currentColor"/><path d="m3.8 8.2 8.2 3.2 8.2-3.2M12 11.4V19" fill="none" stroke="rgba(8,12,16,.52)" stroke-width="1.3"/>',
  bonds: '<path d="m12 2.5 2.2 6.1 6.3 2.3-6.3 2.2-2.2 6.4-2.2-6.4-6.3-2.2 6.3-2.3Z" fill="currentColor"/><circle cx="12" cy="10.9" r="2" fill="rgba(8,12,16,.5)"/>',
  chevronLeft: '<path d="m15.5 4-8 8 8 8" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>',
  chevronRight: '<path d="m8.5 4 8 8-8 8" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>',
  close: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.7" opacity=".65"/><path d="m8.5 8.5 7 7m0-7-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  settings: '<path fill="currentColor" fill-rule="evenodd" d="m10.2 2-.7 2.4c-.7.2-1.3.5-1.9.9L5.2 4.1 3.1 6.2l1.2 2.4c-.4.6-.7 1.2-.9 1.9L1 11.2v3l2.4.7c.2.7.5 1.3.9 1.9l-1.2 2.4 2.1 2.1 2.4-1.2c.6.4 1.2.7 1.9.9l.7 2.4h3l.7-2.4c.7-.2 1.3-.5 1.9-.9l2.4 1.2 2.1-2.1-1.2-2.4c.4-.6.7-1.2.9-1.9l2.4-.7v-3l-2.4-.7c-.2-.7-.5-1.3-.9-1.9l1.2-2.4-2.1-2.1-2.4 1.2c-.6-.4-1.2-.7-1.9-.9L13.2 2Zm1.5 7a3.7 3.7 0 1 0 0 7.4 3.7 3.7 0 0 0 0-7.4Z"/>',
  repair: '<path d="M20.8 4.2a5.2 5.2 0 0 1-6.6 6.6L7 18a2.1 2.1 0 1 1-3-3l7.2-7.2a5.2 5.2 0 0 1 6.6-6.6l-3.2 3.2 3 3Z" fill="currentColor"/><circle cx="5.5" cy="16.5" r=".9" fill="rgba(8,12,16,.55)"/>',
  medkit: '<path d="M5 6h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Zm5.5 3v3H7.6v3h2.9v3h3v-3h2.9v-3h-2.9V9ZM9 3h6v2H9Z" fill="currentColor"/>',
  extinguisher: '<path d="M10 8h6a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-6a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Zm2-4h3v3h-3Z" fill="currentColor"/><path d="M13.5 4.5H8.8C6.7 4.5 5 6.2 5 8.3v1.3M5 9.6 2.8 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  shell: '<path d="m12 2 4 6v10H8V8Z" fill="currentColor"/><path d="M6.5 18h11v4h-11Z" fill="currentColor"/><path d="M9 13h6" stroke="rgba(8,12,16,.55)" stroke-width="1.4"/>',
  scope: '<path d="M4 8h5l2 3h2l2-3h5l2 9h-7l-2-3h-2l-2 3H2Z" fill="currentColor"/><circle cx="7" cy="12" r="3" fill="rgba(8,12,16,.62)"/><circle cx="17" cy="12" r="3" fill="rgba(8,12,16,.62)"/>',
  autoAim: '<path d="M8 3H3v5m13-5h5v5M8 21H3v-5m13 5h5v-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="2" fill="currentColor"/>',
  crewCommander: '<circle cx="7" cy="14" r="4" fill="currentColor"/><circle cx="17" cy="14" r="4" fill="currentColor"/><path d="M10 12h4v3h-4M5 5h4v5H5m10-5h4v5h-4" fill="currentColor"/>',
  crewGunner: '<circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M12 2v5m0 10v5M2 12h5m10 0h5" stroke="currentColor" stroke-width="1.8"/>',
  crewDriver: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/><path d="m12 14 0 6M4.5 9l5.2 2M19.5 9l-5.2 2" stroke="currentColor" stroke-width="2"/>',
  crewLoader: '<path d="m12 2 3 6H9Z" fill="currentColor"/><path d="M9 8h6v10H9Zm-1 11h8v3H8Z" fill="currentColor"/>',
  track: '<rect x="6" y="2" width="12" height="20" rx="5.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="7" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="17" r="2" fill="currentColor"/>',
  engine: '<path d="M3 8h18v12H3Z" fill="currentColor"/><path d="M5 3h3v5m3-5h3v5m3-5h3v5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 12h3v4H7m7-4h3v4h-3" fill="rgba(8,12,16,.55)"/>',
  transmission: '<path d="M4 8h16v8H4Z" fill="currentColor"/><circle cx="8" cy="12" r="2.4" fill="rgba(8,12,16,.58)"/><circle cx="16" cy="12" r="2.4" fill="rgba(8,12,16,.58)"/><path d="M2 12h2m16 0h2" stroke="currentColor" stroke-width="2"/>',
  fuelTank: '<path d="M4 6h15l2 3v13H4Z" fill="currentColor"/><path d="M6 10 18 19m0-9L6 19" stroke="rgba(8,12,16,.58)" stroke-width="1.8"/><path d="M6 2h5v4H6Z" fill="currentColor"/>',
  ammoRack: '<path d="m7 2 2.5 6h-5Zm-2.5 6h5v12h-5Zm10-6L17 8h-5Zm-2.5 6h5v12h-5Z" fill="currentColor"/>',
  gun: '<path d="M10 2h4v15h-4ZM8 2h8v3H8ZM7 17h10v5H7Z" fill="currentColor"/>',
  radio: '<path d="M3 12h18v9H3Z" fill="currentColor"/><path d="M8 12V3" stroke="currentColor" stroke-width="2"/><path d="M11 7c2-1.7 4-1.7 6 0m-7-3c3-2.5 6-2.5 9 0" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  optics: '<circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4" stroke="currentColor" stroke-width="1.8"/>',
  turretRing: '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="5 3"/>',
  gunMount: '<path d="M4 16h16v5H4ZM7 11h10l2 5H5Z" fill="currentColor"/><circle cx="12" cy="10" r="4" fill="none" stroke="currentColor" stroke-width="2"/>',
  autoloader: '<circle cx="12" cy="13" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="m12 3 2.5 5h-5Zm-1.8 5h3.6v9h-3.6Z" fill="currentColor"/><path d="m18 8 2 3-3.5.3M6 18l-2-3 3.5-.3" fill="none" stroke="currentColor" stroke-width="1.7"/>',
  feedSystem: '<path d="M3 9h18v7H3Z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="7" cy="12.5" r="2" fill="currentColor"/><circle cx="12" cy="12.5" r="2" fill="currentColor"/><circle cx="17" cy="12.5" r="2" fill="currentColor"/><path d="m18 5 3 4-3 4" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  missileRack: '<path d="m5 3 3 4v12H4V7Zm11 0 3 4v12h-4V7Z" fill="currentColor"/><path d="M3 20h18" stroke="currentColor" stroke-width="2"/>',
  crew: '<circle cx="12" cy="7" r="4" fill="currentColor"/><path d="M4 22a8 8 0 0 1 16 0Z" fill="currentColor"/>',
  star: '<path d="m12 2 3 6 6.7.9-4.8 4.7 1.2 6.7-6.1-3.2-6.1 3.2 1.2-6.7-4.8-4.7L9 8Z" fill="currentColor"/>',
  shield: '<path d="m12 2 8 2.8v6c0 5-3.2 8.1-8 10.2-4.8-2.1-8-5.2-8-10.2v-6Z" fill="currentColor"/>',
  skull: '<path d="M12 2a8 8 0 0 0-4 14.9V21h8v-4.1A8 8 0 0 0 12 2Z" fill="currentColor"/><circle cx="9" cy="10" r="2" fill="rgba(8,12,16,.65)"/><circle cx="15" cy="10" r="2" fill="rgba(8,12,16,.65)"/><path d="M11 14h2v3h-2Z" fill="rgba(8,12,16,.65)"/>',
  damage: '<path d="m12 2 1.7 5.2 4.8-2.3-2.3 4.8 5.2 1.7-5.2 1.7 2.3 4.8-4.8-2.3L12 22l-1.7-5.2-4.8 2.3 2.3-4.8-5.2-1.7 5.2-1.7-2.3-4.8 4.8 2.3Z" fill="currentColor"/><circle cx="12" cy="12" r="2.6" fill="rgba(8,12,16,.58)"/>',
  penetration: '<path d="M15.5 3.5h5v17h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M2 12h13m-4-4 4 4-4 4" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/><path d="M18 7v10" stroke="currentColor" stroke-width="1.5" opacity=".5"/>',
  team: '<circle cx="12" cy="7" r="3.2" fill="currentColor"/><circle cx="5" cy="10" r="2.5" fill="currentColor" opacity=".72"/><circle cx="19" cy="10" r="2.5" fill="currentColor" opacity=".72"/><path d="M5.5 21a6.5 6.5 0 0 1 13 0ZM0 21a5 5 0 0 1 7.4-4.4M24 21a5 5 0 0 0-7.4-4.4" fill="currentColor"/>',
  check: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m7.5 12.2 3 3.1 6.3-7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  clock: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 6.5V12l3.8 2.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  rematch: '<path d="M20 7.5V3l-2.2 2.2A8.5 8.5 0 0 0 4.2 9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 16.5V21l2.2-2.2A8.5 8.5 0 0 0 19.8 15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  map: '<path d="m3 5 5-2 8 2 5-2v16l-5 2-8-2-5 2Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M8 3v16m8-14v16" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="10" r="2" fill="currentColor"/>',
};

/** Return a crisp inline SVG from the shared UI set. */
export function uiIconSVG(id, size = 24, color = 'currentColor', className = '') {
  const body = P[id];
  if (!body) return '';
  const cls = className ? ` class="${className}"` : '';
  return `<svg${cls} viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" style="color:${color}">${body}</svg>`;
}

export function uiIconIds() { return Object.keys(P); }
