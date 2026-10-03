// Data-only bridge: specs and release measurements never load a geometry pack.
import {NATIONAL_UKRAINE_DESIGNS} from './nationalUkraineDesign.ts';
import {NATIONAL_POLAND_DESIGNS} from './nationalPolandDesign.ts';
import {NATIONAL_CHINA_DESIGNS} from './nationalChinaDesign.ts';
import {NATIONAL_RUSSIA_DESIGNS} from './nationalRussiaDesign.ts';
import {NATIONAL_TURRET_DROPS,type NationalModernizationConfig} from './nationalModernizationConfig.ts';
export const NATIONAL_GUN_PIVOT = [0,.43,.90] as const;
export const NATIONAL_BARREL_LENGTH = 5.20;
export const NATIONAL_BARREL_RADIUS = .105;
export function nationalModernizationDesign(c:NationalModernizationConfig) {
 const design={ua:NATIONAL_UKRAINE_DESIGNS,pl:NATIONAL_POLAND_DESIGNS,cn:NATIONAL_CHINA_DESIGNS,ru:NATIONAL_RUSSIA_DESIGNS}[c.package][c.model];
 return {...design,heightM:design.heightM-NATIONAL_TURRET_DROPS[c.model]};
}
