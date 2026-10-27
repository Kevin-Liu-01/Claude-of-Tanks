// Challenger 1 Mk 3 (release 262): the historical rebuild shared with the Mk 2 (challenger1Historic.ts), in its Op
// Granby fit. Owner 2026-10-27 retired the supplied-file proportions ("based on proper historical referrences so they
// will no longer look so chungus"); the earlier supplied-file build is in git history before release 262.
import {buildChallenger1Historic} from './challenger1Historic.ts';
import {CR1_HISTORIC} from './challenger1HistoricFrame.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';

export const buildChallenger1X=(P:TankBuilderPort):void=>buildChallenger1Historic(P,'mk3');
export const CHALLENGER1_X_DATUMS=Object.freeze({challenger1_mk3:CR1_HISTORIC});
export const CHALLENGER1_X_PROFILES=Object.freeze({challenger1_mk3:{build:buildChallenger1X}});
