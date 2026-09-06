export const QUALITY_GATE_FLOORS = Object.freeze({
  fleet: 90,
  exemplar: 92,
  preservation: 99,
});

export function requiredMinimumForQualityBar(qualityBar) {
  return QUALITY_GATE_FLOORS[qualityBar] ?? QUALITY_GATE_FLOORS.fleet;
}

/** Display-rounded minima are not decisions: 91.99 may be printed as 92.0. */
export function geometryReceiptPassed(receipt) {
  const floor=requiredMinimumForQualityBar(receipt?.qualityBar);
  const required=Math.max(floor,Number.isFinite(receipt?.requiredMinimum)?receipt.requiredMinimum:floor);
  const minimum=receipt?.rawGeoMin ?? receipt?.geoMin;
  const rawComponents=receipt?.rawComponents;
  return receipt?.gatePassed === true && Number.isFinite(minimum) && minimum>=required
    && (!rawComponents || (Object.values(rawComponents).length>0
      && Object.values(rawComponents).every(value=>Number.isFinite(value)&&value>=required)));
}

/** Scores and errors stay unrounded until after this decision. */
export function evaluateGeometryGate({ qualityBar, components }) {
  const requiredMinimum=requiredMinimumForQualityBar(qualityBar);
  const values=Object.values(components);
  const geoMin=values.length ? Math.min(...values) : NaN;
  return { geoMin, requiredMinimum,
    gatePassed:values.length>0 && values.every(value=>Number.isFinite(value)&&value>=requiredMinimum) };
}

/** Exemplar checks cannot average away one deficient valid component. Null
 * means the source cannot isolate it; a real zero remains a failure. */
export function evaluateFidelityGate({ qualityBar, totalScore, wholeScores,
  componentScores = {}, componentViews = {} }) {
  const requiredMinimum = requiredMinimumForQualityBar(qualityBar);
  const checks = [['aggregate', totalScore], ...Object.entries(wholeScores)
    .map(([view, score]) => [`whole.${view}`, score])];
  if (qualityBar === 'exemplar') {
    for (const [name, score] of Object.entries(componentScores)) {
      if (score != null) checks.push([`component.${name}`, score]);
    }
    for (const [name, views] of Object.entries(componentViews)) {
      for (const [view, score] of Object.entries(views || {})) {
        if (score != null) checks.push([`component.${name}.${view}`, score]);
      }
    }
  }
  const failures = checks.filter(([, value]) => !Number.isFinite(value) || value < requiredMinimum)
    .map(([metric, value]) => ({ metric, value, requiredMinimum }));
  return { gatePassed: failures.length === 0, requiredMinimum, failures };
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
