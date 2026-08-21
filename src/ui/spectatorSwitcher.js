import { uiIconSVG } from './uiIcons.js';

const SAFE_SPEC_ID = /^[a-z0-9_]+$/;

/** Build the small amount of presentation data the spectator card needs. */
export function spectatorCardModel(payload = {}) {
  const specId = SAFE_SPEC_ID.test(String(payload.specId || '')) ? String(payload.specId) : '';
  const count = Number.isInteger(payload.count) && payload.count > 0 ? payload.count : 0;
  const index = Number.isInteger(payload.index) && payload.index > 0
    ? Math.min(payload.index, count || payload.index)
    : 0;
  return {
    icon: specId ? `/icons/${specId}_angle.webp` : '',
    position: count && index ? `${index} / ${count}` : '',
  };
}

export function spectatorSwitcherMarkup() {
  return '<div class="portrait" aria-hidden="true"><img alt=""></div>' +
    '<div class="identity" aria-live="polite">' +
      '<span class="spec-status">' +
        uiIconSVG('scope', 14) +
        '<span>Spectating</span><b class="idx" hidden></b>' +
      '</span>' +
      '<span class="who"><b class="nick"></b><span class="veh"></span></span>' +
    '</div>' +
    '<div class="switch" role="group" aria-label="Switch spectated vehicle">' +
      '<button type="button" class="cycle prev" aria-label="Previous vehicle">' +
        '<span class="cycle-icon" aria-hidden="true">' + uiIconSVG('chevronLeft', 13) + '</span>' +
        '<span class="cycle-copy" aria-hidden="true"><span class="cycle-label">Previous</span><kbd>A</kbd></span>' +
      '</button>' +
      '<button type="button" class="cycle next" aria-label="Next vehicle">' +
        '<span class="cycle-copy" aria-hidden="true"><kbd>D</kbd><span class="cycle-label">Next</span></span>' +
        '<span class="cycle-icon" aria-hidden="true">' + uiIconSVG('chevronRight', 13) + '</span>' +
      '</button>' +
    '</div>' +
    '<button type="button" class="gar" aria-label="Return to garage">' +
      '<span class="gar-icon" aria-hidden="true">' + uiIconSVG('garage', 17) + '</span>' +
      '<span>Garage</span>' +
    '</button>';
}
