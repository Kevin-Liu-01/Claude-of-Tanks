// Owner-selected supplied-file Challenger, independently authored from scalar
// measurements. No historical photo/donor builder is in this runtime closure.
import {buildChallenger1Supplied} from './challenger1XSupplied.ts';
import {CHALLENGER1_SUPPLIED_DATUMS} from './challenger1XSuppliedFrame.ts';

export const buildChallenger1X=buildChallenger1Supplied;
export const CHALLENGER1_X_DATUMS=Object.freeze({challenger1_x:CHALLENGER1_SUPPLIED_DATUMS});
export const CHALLENGER1_X_PROFILES=Object.freeze({challenger1_x:{build:buildChallenger1Supplied}});
