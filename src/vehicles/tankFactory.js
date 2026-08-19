// Public fleet factory facade. It evaluates spec packs in donor order, seals
// the selectable roster, and configures the cycle-free implementation once.

import { configureTankFactory } from './tankFactoryCore.js';
import { MODERN3_BUILDERS } from './modern3.js';
import { FRANCE_BUILDERS } from './france.js';
import { MODERN2_BUILDERS } from './modern2.js';
import { MODERN1_BUILDERS } from './modern1.js';
import { CHALLENGER_BUILDERS } from './profiles/challenger.js';
import { FITTINGS } from './profiles/kit.js';
import { PROFILED_BUILDERS } from './profiledProcedurals.js';

// These modules register specs at evaluation time. Keep donor waves ahead of
// their derivatives so every clone observes a complete source record.
import './variants.js';
import './userdrops.js';
import './userdrops2.js';
import './userdrops3.js';
import './userdrops4.js';
import './userdrops5.js';
import './userdrops6.js';
import './ukraine.js';
import './china.js';
import './sweden.js';
import './poland.js';
import './korea.js';
import './japan.js';
import './germany.js';
import './afvFamily.js';

import { finalizeFirstPartyRoster } from './specs.js';
import { applyNativeFamilyOrder } from './fleetOrder.js';

finalizeFirstPartyRoster();
applyNativeFamilyOrder();
configureTankFactory({
  canonicalBuilderPacks: [
    ['modern1', MODERN1_BUILDERS],
    ['challenger', CHALLENGER_BUILDERS],
    ['modern2', MODERN2_BUILDERS],
    ['modern3', MODERN3_BUILDERS],
    ['france', FRANCE_BUILDERS],
  ],
  profiledBuilders: PROFILED_BUILDERS,
  fittings: FITTINGS,
});

export { KIT, createTank } from './tankFactoryCore.js';
