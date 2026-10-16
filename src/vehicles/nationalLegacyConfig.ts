// Additional owner-approved descendants of the original welded-turret concepts.
// Keep the twelve current national designs and their IDs unchanged.
import {HETMAN_II_DESIGN} from './hetmanIIDesign.ts';
import {ZUBR_II_DESIGN} from './zubrIIDesign.ts';
export const NATIONAL_LEGACY_CONFIG = [
  {id:'t72b3m_hetman_ii',name:'T-72B3M Hetman II (Concept)',nation:'Ukraine',package:'ua',
    donor:'t72b3m_2016',predecessor:'t72b3m_hetman',y:HETMAN_II_DESIGN.y,z:.114315,design:HETMAN_II_DESIGN},
  {id:'t72b3_zubr_ii',name:'T-72B3 Zubr II (Concept)',nation:'Poland',package:'pl',
    donor:'t72b3',predecessor:'t72b3_zubr',y:ZUBR_II_DESIGN.y,z:.065591,design:ZUBR_II_DESIGN},
] as const;
export const NATIONAL_LEGACY_IDS=NATIONAL_LEGACY_CONFIG.map(c=>c.id);
