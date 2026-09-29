import { classifyRoomFailure, type RoomFailureCode } from '../mp/session/roomFailure.ts';
import { t } from './i18n.ts';

const COPY_KEYS: Record<RoomFailureCode, { titleKey: string; detailKey: string }> = {
  room_service_unavailable: {
    titleKey: 'playMenu.roomFailure.roomServiceUnavailable.title',
    detailKey: 'playMenu.roomFailure.roomServiceUnavailable.detail',
  },
  invalid_room_code: {
    titleKey: 'playMenu.roomFailure.invalidRoomCode.title',
    detailKey: 'playMenu.roomFailure.invalidRoomCode.detail',
  },
  expired: {
    titleKey: 'playMenu.roomFailure.expired.title',
    detailKey: 'playMenu.roomFailure.expired.detail',
  },
  room_full: {
    titleKey: 'playMenu.roomFailure.roomFull.title',
    detailKey: 'playMenu.roomFailure.roomFull.detail',
  },
  kicked: {
    titleKey: 'playMenu.roomFailure.kicked.title',
    detailKey: 'playMenu.roomFailure.kicked.detail',
  },
  resume_denied: {
    titleKey: 'playMenu.roomFailure.resumeDenied.title',
    detailKey: 'playMenu.roomFailure.resumeDenied.detail',
  },
  room_closed: {
    titleKey: 'playMenu.roomFailure.roomClosed.title',
    detailKey: 'playMenu.roomFailure.roomClosed.detail',
  },
  access_denied: {
    titleKey: 'playMenu.roomFailure.accessDenied.title',
    detailKey: 'playMenu.roomFailure.accessDenied.detail',
  },
  connection_failed: {
    titleKey: 'playMenu.roomFailure.connectionFailed.title',
    detailKey: 'playMenu.roomFailure.connectionFailed.detail',
  },
};

/** Only curated text reaches the room error surface; transport prose may contain sensitive data. */
export function roomFailurePresentation(error: unknown) {
  const failure = classifyRoomFailure(error);
  const keys = COPY_KEYS[failure.code];
  return { ...failure, title: t(keys.titleKey), detail: t(keys.detailKey),
    editCode: failure.code !== 'room_service_unavailable',
  };
}
