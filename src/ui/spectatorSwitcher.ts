import { uiIconSVG } from './uiIcons.ts';

const SAFE_SPEC_ID = /^[a-z0-9_]+$/;

/** Build the small amount of presentation data the spectator card needs. */
export interface SpectatorCardPayload {
  readonly specId?: string;
  readonly count?: number;
  readonly index?: number;
}

export interface SpectatorCardModel {
  readonly icon: string;
  readonly position: string;
}

export function spectatorCardModel(payload: SpectatorCardPayload = {}): SpectatorCardModel {
  const specId = SAFE_SPEC_ID.test(String(payload.specId || '')) ? String(payload.specId) : '';
  const rawCount = payload.count ?? 0;
  const rawIndex = payload.index ?? 0;
  const count = Number.isInteger(rawCount) && rawCount > 0 ? rawCount : 0;
  const index = Number.isInteger(rawIndex) && rawIndex > 0
    ? Math.min(rawIndex, count || rawIndex)
    : 0;
  return {
    icon: specId ? `/icons/${specId}_angle.webp` : '',
    position: count && index ? `${index} / ${count}` : '',
  };
}

export function spectatorSwitcherMarkup(): string {
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
        '<kbd aria-hidden="true">A</kbd>' +
      '</button>' +
      '<button type="button" class="cycle next" aria-label="Next vehicle">' +
        '<kbd aria-hidden="true">D</kbd>' +
        '<span class="cycle-icon" aria-hidden="true">' + uiIconSVG('chevronRight', 13) + '</span>' +
      '</button>' +
    '</div>' +
    '<button type="button" class="gar" aria-label="Return to garage">' +
      '<span class="gar-icon" aria-hidden="true">' + uiIconSVG('garage', 17) + '</span>' +
      '<span>Garage</span>' +
    '</button>';
}
