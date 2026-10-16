import { assembledSourcePath } from './supplied-source-assemblies.mjs';
import { tankSeedId } from '../src/vehicles/tankIdAliases.ts';
import { GRIFFIN_PROPORTION_REFERENCE } from './griffin-proportion-registration.mjs';
// Local QA only. Playable model registration never imports this module.
import { ADDITIONAL_SUPPLIED_SOURCE_STUDIES } from '../src/vehicles/suppliedSourceStudyIndex.ts';

export const SUPPLIED_SOURCE_COMPARISON_IDS = Object.freeze([
  'puma_s1', 'type89', 'kurganets25', ...ADDITIONAL_SUPPLIED_SOURCE_STUDIES.map(study => study.id),
]);

export const SUPPLIED_SOURCE_REFERENCE_OVERRIDES = Object.freeze(Object.fromEntries(
  SUPPLIED_SOURCE_COMPARISON_IDS.map(id => [id, {
    source: 'glb', qualityBar: 'exemplar', glb: {
      path: id === 'griffin50mm' ? GRIFFIN_PROPORTION_REFERENCE.path
        : assembledSourcePath(id, `/models/community-candidates/${tankSeedId(id)}_source.glb`),
      fixedMount: true, componentMasks: false, paintUntextured: true,
    },
  }]),
));
