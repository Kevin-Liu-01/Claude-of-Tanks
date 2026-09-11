import type { RuntimeValue } from '../runtimeTypes.ts';
import { classifyPrivateRoomFailure, type PrivateRoomFailureCode } from '../net/roomFailure.ts';
import { t } from './i18n.ts';

interface FailureCopy {
  title: string;
  detail: string;
}

const COPY_KEYS: Record<PrivateRoomFailureCode, { titleKey: string; detailKey: string }> = {
  signaling_unavailable: {
    titleKey: 'playMenu.roomFailure.signalingUnavailable.title',
    detailKey: 'playMenu.roomFailure.signalingUnavailable.detail',
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
  host_left: {
    titleKey: 'playMenu.roomFailure.hostLeft.title',
    detailKey: 'playMenu.roomFailure.hostLeft.detail',
  },
  host_runtime_failed: {
    titleKey: 'playMenu.roomFailure.hostRuntimeFailed.title',
    detailKey: 'playMenu.roomFailure.hostRuntimeFailed.detail',
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
  rtc_connect_timeout: {
    titleKey: 'playMenu.roomFailure.rtcConnectTimeout.title',
    detailKey: 'playMenu.roomFailure.rtcConnectTimeout.detail',
  },
  rtc_recovery_exhausted: {
    titleKey: 'playMenu.roomFailure.rtcRecoveryExhausted.title',
    detailKey: 'playMenu.roomFailure.rtcRecoveryExhausted.detail',
  },
  connection_failed: {
    titleKey: 'playMenu.roomFailure.connectionFailed.title',
    detailKey: 'playMenu.roomFailure.connectionFailed.detail',
  },
};

function resolveCopy(code: PrivateRoomFailureCode): FailureCopy {
  const keys = COPY_KEYS[code];
  return { title: t(keys.titleKey), detail: t(keys.detailKey) };
}

/** Only curated text reaches the room error surface; transport prose may contain sensitive data. */
export function privateRoomFailurePresentation(error: RuntimeValue) {
  const failure = classifyPrivateRoomFailure(error);
  return { ...failure, ...resolveCopy(failure.code),
    editCode: failure.code !== 'signaling_unavailable',
    editSettings: failure.code === 'signaling_unavailable' || failure.code === 'access_denied'
      || failure.code === 'rtc_connect_timeout' || failure.code === 'connection_failed',
  };
}
