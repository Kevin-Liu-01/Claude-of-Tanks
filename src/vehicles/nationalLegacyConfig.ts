// Additional owner-approved descendants of the original welded-turret concepts.
// Keep the twelve current national designs and their IDs unchanged.
import {HETMAN_II_DESIGN} from './hetmanIIDesign.ts';
import {ZUBR_II_DESIGN} from './zubrIIDesign.ts';
export const NATIONAL_LEGACY_CONFIG = [
  {id:'ua_t72b3m_hetman_ii',name:'T-72B3M Hetman II (Concept)',nation:'Ukraine',package:'ua',
    donor:'t72b3m_x',predecessor:'ua_t72b3m_modern',y:1.545,z:.114315,design:HETMAN_II_DESIGN},
  {id:'pl_t72b3_zubr_ii',name:'T-72B3 Zubr II (Concept)',nation:'Poland',package:'pl',
    donor:'t72b3_x',predecessor:'pl_t72b3_modern',y:1.475,z:.065591,design:ZUBR_II_DESIGN},
] as const;
export const NATIONAL_LEGACY_IDS=NATIONAL_LEGACY_CONFIG.map(c=>c.id);
