const SAFE_SPEC_ID = /^[a-z0-9_]+$/;

/** Build the small amount of presentation data the spectator card needs. */
export function spectatorCardModel(payload = {}) {
  const specId = SAFE_SPEC_ID.test(String(payload.specId || '')) ? String(payload.specId) : '';
  return {
    icon: specId ? `/icons/${specId}_angle.webp` : '',
  };
}

export function spectatorSwitcherMarkup() {
  return '<div class="portrait" aria-hidden="true"><img alt=""></div>' +
    '<div class="identity">' +
      '<span class="who"><b class="nick"></b><span class="veh"></span></span>' +
    '</div>' +
    '<div class="switch" role="group" aria-label="Switch spectated vehicle">' +
      '<button type="button" class="cycle prev" aria-label="Previous vehicle"><kbd aria-hidden="true">A</kbd><span aria-hidden="true">Previous</span></button>' +
      '<button type="button" class="cycle next" aria-label="Next vehicle"><kbd aria-hidden="true">D</kbd><span aria-hidden="true">Next</span></button>' +
    '</div>' +
    '<button type="button" class="gar" aria-label="Return to garage"><span>Garage</span><i aria-hidden="true"></i></button>';
}
