// battle-pause.mjs — the in-battle pause veil and the controls hint strip (src/ui/settings.ts) over a battle still, for
// captures. Copyright © 2026 Kevin B. Liu.
//   ?state=pause        the pause veil, as a focus return with the pointer unlocked shows it (the default)
//   ?state=hints        the controls hint strip, as a player's first battles show it
//   ?locale=zh-CN       the surfaces in Chinese
// A coarse pointer (a phone, or a browser emulating touch) gets the touch layout through responsiveLayout.ts.
import '../../src/ui/tokens/tokens.css';
import '../../src/ui/motion.css';
import '../../src/ui/components/components.css';
import '../../src/ui/responsiveSurfaces.css';
import { createInput } from '../../src/game/input.ts';
import { createSettings } from '../../src/ui/settings.ts';
import { createBus } from '../../src/game/stateCore.ts';
import { setLocale } from '../../src/ui/i18n.ts';
import { installResponsiveLayout } from '../../src/ui/responsiveLayout.ts';

const params = new URLSearchParams(location.search);
await setLocale(params.get('locale') || 'en-US');
installResponsiveLayout();
const input = createInput();
const bus = createBus();
const settings = createSettings({ input, bus, isBattleActive: () => true });
bus.emit('phase:change', { phase: 'battle' });
const state = params.get('state') || 'pause';
if (state === 'pause') window.dispatchEvent(new Event('focus'));
if (state === 'hints') settings.showHints();
window.__BATTLE_PAUSE = { input, bus, settings };
