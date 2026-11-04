// The Russian 152 mm line's builds (release 269; DECISIONS "2026-11-04 Russian 152 mm line"), one demand-loaded group:
// the Object 292 on the T-80BV's builder, the Object 477 Molot and the Object 195 on their own hulls, the T-14 152 on the
// T-14's.
import { OBJECT292_PROFILES } from './object292.ts';
import { OBJECT477_MOLOT_PROFILES } from './object477Molot.ts';
import { OBJECT195_X_PROFILES } from './object195X.ts';
import { T14_152_X_PROFILES } from './t14_152X.ts';

export const RUSSIA_152_PROFILES = {
  ...OBJECT292_PROFILES, ...OBJECT477_MOLOT_PROFILES, ...OBJECT195_X_PROFILES, ...T14_152_X_PROFILES,
};
