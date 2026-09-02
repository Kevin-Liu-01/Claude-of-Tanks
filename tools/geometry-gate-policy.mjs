export const QUALITY_GATE_FLOORS = Object.freeze({
  fleet: 90,
  exemplar: 92,
});

export function requiredMinimumForQualityBar(qualityBar) {
  return QUALITY_GATE_FLOORS[qualityBar] ?? QUALITY_GATE_FLOORS.fleet;
}

export function unavailableOracleReport(id, qualityBar = 'fleet') {
  const requiredMinimum = requiredMinimumForQualityBar(qualityBar);
  return {
    id,
    geoMin: 0,
    requiredMinimum,
    qualityBar,
    gatePassed: false,
    components: { oracleAvailability: 0 },
    error: 'registered comparison oracle unavailable in this worktree',
  };
}
