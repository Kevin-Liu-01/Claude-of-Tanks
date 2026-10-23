// accessibility-settings.mjs — the settings panel on its Accessibility tab (brand-ui BUI-F9), for captures and the
// redesign (BUI-S4). Copyright © 2026 Kevin B. Liu.
//   ?locale=zh-CN       the panel in Chinese
//   ?tab=<id>           another tab (default accessibility)
//   ?prefs=<json>       an accessibility record applied first (as a stored one would be), e.g.
//                       {"colorPreset":"deutan","highContrast":true,"textScale":1.5}
// A coarse pointer (a phone, or a browser emulating touch) gets the touch layout through responsiveLayout.ts.
import '../../src/ui/tokens/tokens.css';
import '../../src/ui/motion.css';
import '../../src/ui/responsiveSurfaces.css';
import { createInput } from '../../src/game/input.ts';
import { createSettings } from '../../src/ui/settings.ts';
import { createBus } from '../../src/game/stateCore.ts';
import { setLocale } from '../../src/ui/i18n.ts';
import { installResponsiveLayout } from '../../src/ui/responsiveLayout.ts';
import { installAccessibility } from '../../src/ui/accessibilityPreferences.ts';
import { applyAccessibility, normalizeAccessibility } from '../../src/ui/accessibilitySettings.ts';

const params = new URLSearchParams(location.search);
setLocale(params.get('locale') || 'en-US');
installResponsiveLayout();
installAccessibility();
if (params.get('prefs')) applyAccessibility(normalizeAccessibility(JSON.parse(params.get('prefs'))));
const input = createInput();
const bus = createBus();
const settings = createSettings({ input, bus });
settings.open();
settings.root.querySelector(`[data-tab="${params.get('tab') || 'accessibility'}"]`)?.click();
window.__ACCESSIBILITY_SETTINGS = { input, bus, settings };
