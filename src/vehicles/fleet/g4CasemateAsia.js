import { WW2_PROFILES } from '../profiles/ww2.js';
import { CASEMATE_PROFILES } from '../profiles/casemate.js';
import { MERKAVA_PROFILES } from '../profiles/merkava.js';
import { AFV_FAMILY_PROFILES } from '../profiles/afvFamily.js';
import { CHINA_PROFILES } from '../profiles/china.js';
import { KOREA_PROFILES } from '../profiles/korea.js';
import { JAPAN_PROFILES } from '../profiles/japan.js';
import { GERMANY_PROFILES } from '../profiles/germany.js';

// Sweden is the final author of strv103 in the eager union. Keep that exact
// ownership independent of dynamic chunk resolution order.
const { strv103: _shadowedStrv103, ...CASEMATE_ACTIVE_PROFILES } = CASEMATE_PROFILES;

export const GROUP_PROFILES = {
  ...CASEMATE_ACTIVE_PROFILES,
  ...WW2_PROFILES,
  ...MERKAVA_PROFILES,
  ...AFV_FAMILY_PROFILES,
  ...CHINA_PROFILES,
  ...KOREA_PROFILES,
  ...JAPAN_PROFILES,
  ...GERMANY_PROFILES,
};
