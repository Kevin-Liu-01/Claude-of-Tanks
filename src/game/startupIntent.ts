import type { RuntimeValue } from '../runtimeTypes.ts';
import type { RoomInvite } from '../mp/session/roomInvite.ts';
import { resolveLocalePath } from '../ui/localeRouting.ts';

interface StartupLocation {
  search?: string;
  pathname?: string;
  href?: string;
}

interface RoomInviteModule {
  parseRoomInvite(value: RuntimeValue): RoomInvite | null;
}

interface StartupIntent {
  studioRequested: boolean;
  studioMapId: string;
  pendingRoomInvite: Promise<RoomInvite | null> | null;
}

export function createStartupIntent(
  location: StartupLocation,
  loadRoomInvite: () => Promise<RoomInviteModule> =
    async () => await import('../mp/session/roomInvite.ts'),
): StartupIntent {
  const params = new URLSearchParams(location?.search || '');
  const studioRequested = resolveLocalePath(location?.pathname || '/').pathname === '/studio'
    || params.has('studio');
  const studioMapId = params.get('map') || 'verdant';
  const pendingRoomInvite = params.has('room')
    ? loadRoomInvite().then(({ parseRoomInvite }) => parseRoomInvite(location?.href))
    : null;
  return { studioRequested, studioMapId, pendingRoomInvite };
}
