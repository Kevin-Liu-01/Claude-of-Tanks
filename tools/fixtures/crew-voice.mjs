import '../../src/ui/motion.css';
import '../../src/ui/responsiveSurfaces.css';
import { createInput } from '../../src/game/input.ts';
import { createSettings } from '../../src/ui/settings.ts';
import { createBus } from '../../src/game/stateCore.ts';
import { setLocale } from '../../src/ui/i18n.ts';
import { installResponsiveLayout } from '../../src/ui/responsiveLayout.ts';

const params = new URLSearchParams(location.search);
setLocale(params.get('locale') || 'en-US');
installResponsiveLayout();
const input = createInput();
const bus = createBus();
const volumes = [];
bus.on('ui:volumes', event => volumes.push(event));
if (params.has('audio')) {
  const { createAudio } = await import('../../src/audio/audioEngine.ts');
  const audio = createAudio();
  audio.bindBus(bus);
  document.addEventListener('pointerdown', () => audio.resume(), { once: true });
}
const settings = createSettings({ input, bus });
settings.open();
settings.root.querySelector('[data-tab="sound"]').click();
window.__CREW_VOICE_TEST = { input, bus, settings, volumes };
