import { assembledSourcePath } from './supplied-source-assemblies.mjs';
// Local QA only. Playable model registration never imports this module.
import { ADDITIONAL_SUPPLIED_SOURCE_STUDIES } from '../src/vehicles/suppliedSourceStudyIndex.ts';

export const SUPPLIED_SOURCE_COMPARISON_IDS = Object.freeze([
  'kurganets25_x', ...ADDITIONAL_SUPPLIED_SOURCE_STUDIES.map(study => study.id),
]);

export const SUPPLIED_SOURCE_REFERENCE_OVERRIDES = Object.freeze(Object.fromEntries(
  SUPPLIED_SOURCE_COMPARISON_IDS.map(id => [id, {
    source: 'glb', qualityBar: 'exemplar', glb: {
      path: assembledSourcePath(id, `/models/community-candidates/${id}_source.glb`),
      fixedMount: true, componentMasks: false, paintUntextured: true,
    },
  }]),
));
