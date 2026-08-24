import { SOVIET_HEAVY_PROFILES } from '../profiles/soviet-heavy.js';
import { T90_PROFILES } from '../profiles/t90.js';
import { RUSSIA_PROFILES } from '../profiles/russia.js';
import { T72_PROFILES } from '../profiles/t72.js';
import { T80_PROFILES } from '../profiles/t80.js';
import { UKRAINE_PROFILES } from '../profiles/ukraine.js';
import { POLAND_PROFILES } from '../profiles/poland.js';

export const GROUP_PROFILES = {
  ...SOVIET_HEAVY_PROFILES,
  ...T90_PROFILES,
  ...RUSSIA_PROFILES,
  ...T72_PROFILES,
  ...T80_PROFILES,
  ...UKRAINE_PROFILES,
  ...POLAND_PROFILES,
};
