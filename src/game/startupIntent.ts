import type { RoomInvite } from '../net/roomInvite.ts';

export interface StartupLocation {
  search?: string;
  pathname?: string;
  href?: string;
}

interface RoomInviteModule {
  parseRoomInvite(value: unknown): RoomInvite | null;
}

export interface StartupIntent {
  studioRequested: boolean;
  studioMapId: string;
  pendingRoomInvite: Promise<RoomInvite | null> | null;
}

export function createStartupIntent(
  location: StartupLocation,
  loadRoomInvite: () => Promise<RoomInviteModule> =
    async () => await import('../net/roomInvite.ts'),
): StartupIntent {
  const params = new URLSearchParams(location?.search || '');
  const studioRequested = /^\/studio\/?$/.test(location?.pathname || '')
    || params.has('studio');
  const studioMapId = params.get('map') || 'verdant';
  const pendingRoomInvite = params.has('room')
    ? loadRoomInvite().then(({ parseRoomInvite }) => parseRoomInvite(location?.href))
    : null;
  return { studioRequested, studioMapId, pendingRoomInvite };
}
