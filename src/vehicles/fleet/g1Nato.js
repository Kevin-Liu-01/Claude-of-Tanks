import { UK_PROFILES } from '../profiles/uk.js';
import { CHALLENGER_PROFILES } from '../profiles/challenger.js';
import { LEOPARD_PROFILES } from '../profiles/leopard.js';
import { ITALY_PROFILES } from '../profiles/italy.js';
import { SWEDEN_PROFILES } from '../profiles/sweden.js';

export const GROUP_PROFILES = {
  ...UK_PROFILES,
  ...CHALLENGER_PROFILES,
  ...LEOPARD_PROFILES,
  ...ITALY_PROFILES,
  ...SWEDEN_PROFILES,
};
