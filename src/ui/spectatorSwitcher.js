const SAFE_SPEC_ID = /^[a-z0-9_]+$/;

/** Build the small amount of presentation data the spectator card needs. */
export function spectatorCardModel(payload = {}) {
  const count = Math.max(1, Number.parseInt(payload.count, 10) || 1);
  const parsedIndex = Number.parseInt(payload.index, 10);
  const index = Math.min(count, Math.max(1, Number.isFinite(parsedIndex) ? parsedIndex : 1));
  const specId = SAFE_SPEC_ID.test(String(payload.specId || '')) ? String(payload.specId) : '';
  return {
    count,
    index,
    counter: `${String(index).padStart(2, '0')} / ${String(count).padStart(2, '0')}`,
    scope: payload.allTeams ? 'Live vehicle' : 'Allied vehicle',
    icon: specId ? `/icons/${specId}_angle.webp` : '',
  };
}

export function spectatorSwitcherMarkup() {
  return '<div class="portrait" aria-hidden="true"><img alt=""><span></span></div>' +
    '<div class="identity">' +
      '<span class="status"><i></i><span class="scope">Allied vehicle</span><b class="counter">01 / 01</b></span>' +
      '<span class="who"><b class="nick"></b><span class="veh"></span></span>' +
    '</div>' +
    '<div class="switch" role="group" aria-label="Switch spectated vehicle">' +
      '<button type="button" class="cycle prev" aria-label="Previous vehicle"><kbd aria-hidden="true">A</kbd><span aria-hidden="true">Previous</span></button>' +
      '<button type="button" class="cycle next" aria-label="Next vehicle"><span aria-hidden="true">Next</span><kbd aria-hidden="true">D</kbd></button>' +
    '</div>' +
    '<button type="button" class="gar" aria-label="Return to garage"><span>Garage</span><i aria-hidden="true"></i></button>';
}
