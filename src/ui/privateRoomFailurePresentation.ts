import type { RuntimeValue } from '../runtimeTypes.ts';
import { classifyPrivateRoomFailure, type PrivateRoomFailureCode } from '../net/roomFailure.ts';

interface FailureCopy {
  title: string;
  detail: string;
}

const COPY: Record<PrivateRoomFailureCode, FailureCopy> = {
  signaling_unavailable: {
    title: 'Room service unavailable',
    detail: 'We could not reach the room service. Check your connection or signaling address, then try again when the service is available.',
  },
  invalid_room_code: {
    title: 'Check the room code',
    detail: 'Enter the six-character code from your host, or open their complete invite link.',
  },
  expired: {
    title: 'Room not found or expired',
    detail: 'This room is no longer available. Ask the host for a new invite or create another room.',
  },
  room_full: {
    title: 'This room is full',
    detail: 'There are no open seats. Ask the host to make space, or join a different room.',
  },
  host_left: {
    title: 'The host closed the room',
    detail: 'This room has ended because its host left. Ask for a new invite or create another room.',
  },
  host_runtime_failed: {
    title: 'The host could not continue',
    detail: 'The host stopped this match after a simulation error. The match cannot continue safely. Return to the garage or ask for a new invite.',
  },
  kicked: {
    title: 'Removed from the room',
    detail: 'The host removed your seat. Return to the garage or join a different room.',
  },
  resume_denied: {
    title: 'This connection was replaced',
    detail: 'Your room seat belongs to another connection. Continue in that tab, or use a new invite. This tab will not take the seat back automatically.',
  },
  room_closed: {
    title: 'This room has ended',
    detail: 'The room is closed. Ask the host for a new invite or create another room.',
  },
  access_denied: {
    title: 'Room access unavailable',
    detail: 'This room or signaling server is not accepting the connection. Check the invite and connection settings with the host.',
  },
  rtc_connect_timeout: {
    title: 'Could not connect to the host',
    detail: 'The host did not connect in time. Check that the host is still online. LAN players must share a reachable local network; private rooms may need a relay.',
  },
  rtc_recovery_exhausted: {
    title: 'Connection could not recover',
    detail: 'The reconnect limit was reached. The game has stopped waiting. Check that the host is online before trying again.',
  },
  connection_failed: {
    title: 'Room connection failed',
    detail: 'The connection could not finish. Check your network and invite, then try again or return to the garage.',
  },
};

/** Only curated text reaches the room error surface; transport prose may contain sensitive data. */
export function privateRoomFailurePresentation(error: RuntimeValue) {
  const failure = classifyPrivateRoomFailure(error);
  return { ...failure, ...COPY[failure.code],
    editCode: failure.code !== 'signaling_unavailable',
    editSettings: failure.code === 'signaling_unavailable' || failure.code === 'access_denied'
      || failure.code === 'rtc_connect_timeout' || failure.code === 'connection_failed',
  };
}
