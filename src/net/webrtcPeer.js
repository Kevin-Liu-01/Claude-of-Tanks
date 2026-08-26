import { createWebRTCSplitTransport } from './channelTransport.js';

export const MATCH_CONTROL_CHANNEL_LABEL = 'cot-match-v1';
export const MATCH_STATE_CHANNEL_LABEL = 'cot-state-v1';
// Kept as an import-compatible alias for existing tooling and tests.
export const MATCH_CHANNEL_LABEL = MATCH_CONTROL_CHANNEL_LABEL;

function rtcConstructor(injected) {
  const Ctor = injected || globalThis.RTCPeerConnection;
  if (typeof Ctor !== 'function') {
    throw new Error('RTCPeerConnection is unavailable in this browser');
  }
  return Ctor;
}

function validateIceConfig(iceServers, relayOnly) {
  if (!Array.isArray(iceServers)) throw new TypeError('iceServers must be an array');
  if (relayOnly) {
    const hasTurn = iceServers.some((server) => {
      const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
      return urls.some((url) => typeof url === 'string' && /^turns?:/i.test(url));
    });
    if (!hasTurn) throw new Error('relay-only WebRTC requires a TURN server');
  }
}

function signalCandidate(candidate) {
  return candidate && typeof candidate.toJSON === 'function' ? candidate.toJSON() : candidate;
}

/**
 * Create one WebRTC peer. Signaling is injected and may be backed by a LAN
 * rendezvous server, production WebSocket service, or manual debug exchange.
 */
export function createWebRTCPeer({
  role,
  onSignal,
  iceServers = [],
  relayOnly = false,
  RTCPeerConnectionImpl = null,
  transportOptions = {},
  recoveryDelaysMs = [0, 3_000, 7_000, 15_000, 30_000],
  disconnectGraceMs = 4_000,
  initialRecoveryDelayMs = 8_000,
  connectTimeoutMs = 30_000,
} = {}) {
  if (role !== 'host' && role !== 'client') throw new TypeError('role must be host or client');
  if (typeof onSignal !== 'function') throw new TypeError('onSignal callback is required');
  validateIceConfig(iceServers, relayOnly);
  if (!Array.isArray(recoveryDelaysMs) || recoveryDelaysMs.length === 0 ||
      recoveryDelaysMs.some((delay) => !Number.isFinite(delay) || delay < 0)) {
    throw new TypeError('RTC recovery delays must be a non-empty array of milliseconds');
  }
  if (!Number.isFinite(initialRecoveryDelayMs) || initialRecoveryDelayMs < 0 ||
      !Number.isFinite(connectTimeoutMs) || connectTimeoutMs <= 0) {
    throw new TypeError('RTC recovery and connection timeouts must be valid milliseconds');
  }
  const Ctor = rtcConstructor(RTCPeerConnectionImpl);
  const peerConnection = new Ctor({
    iceServers,
    iceTransportPolicy: relayOnly ? 'relay' : 'all',
    bundlePolicy: 'max-bundle',
    iceCandidatePoolSize: 4,
  });
  const pendingCandidates = [];
  const channels = new Map();
  let remoteDescriptionSet = false;
  let closed = false;
  let transport = null;
  let settleTransport;
  let rejectTransport;
  let recoveryTimer = null;
  let recoveryAttempts = 0;
  let negotiationChain = Promise.resolve();
  let connectTimer = null;
  const transportReady = new Promise((resolve, reject) => {
    settleTransport = resolve;
    rejectTransport = reject;
  });

  function settleIfReady() {
    if (transport || closed) return;
    const control = channels.get(MATCH_CONTROL_CHANNEL_LABEL);
    const state = channels.get(MATCH_STATE_CHANNEL_LABEL);
    if (!control || !state || control.readyState !== 'open' || state.readyState !== 'open') return;
    transport = createWebRTCSplitTransport(control, state, transportOptions);
    if (connectTimer) clearTimeout(connectTimer);
    connectTimer = null;
    clearRecovery();
    settleTransport(transport);
  }

  function attachChannel(channel) {
    if (closed) {
      if (channel && typeof channel.close === 'function') channel.close();
      return;
    }
    if (channel.label !== MATCH_CONTROL_CHANNEL_LABEL && channel.label !== MATCH_STATE_CHANNEL_LABEL) {
      channel.close();
      rejectTransport(new Error(`unexpected data channel: ${channel.label}`));
      return;
    }
    const existing = channels.get(channel.label);
    if (existing && existing !== channel) existing.close();
    if (channel.label === MATCH_STATE_CHANNEL_LABEL) channel.binaryType = 'arraybuffer';
    channels.set(channel.label, channel);
    if (channel.readyState === 'open') settleIfReady();
    else channel.addEventListener('open', settleIfReady, { once: true });
  }

  peerConnection.onicecandidate = (event) => {
    if (!event.candidate || closed) return;
    onSignal({ kind: 'ice', candidate: signalCandidate(event.candidate) });
  };
  function clearRecovery() {
    if (recoveryTimer) clearTimeout(recoveryTimer);
    recoveryTimer = null;
  }

  function queueNegotiation(task) {
    const pending = negotiationChain.then(task);
    negotiationChain = pending.catch(() => {});
    return pending;
  }

  function scheduleRecovery(initialDelay = null) {
    if (closed || recoveryTimer || peerConnection.connectionState === 'connected') return;
    const delay = initialDelay == null
      ? recoveryDelaysMs[Math.min(recoveryAttempts, recoveryDelaysMs.length - 1)]
      : initialDelay;
    recoveryTimer = setTimeout(() => {
      recoveryTimer = null;
      if (closed || peerConnection.connectionState === 'connected') return;
      recoveryAttempts++;
      if (role === 'host') {
        queueNegotiation(async () => {
          if (typeof peerConnection.restartIce === 'function') peerConnection.restartIce();
          const offer = await peerConnection.createOffer({ iceRestart: true });
          await peerConnection.setLocalDescription(offer);
          onSignal({ kind: 'description', description: peerConnection.localDescription });
        }).catch(() => {});
      } else {
        // The host remains the offerer, avoiding glare while still letting a
        // client whose ICE agent noticed the failure first request recovery.
        onSignal({ kind: 'restart' });
      }
      scheduleRecovery();
    }, delay);
    if (typeof recoveryTimer.unref === 'function') recoveryTimer.unref();
  }

  peerConnection.onconnectionstatechange = () => {
    const state = peerConnection.connectionState;
    if (state === 'connected') {
      clearRecovery();
      recoveryAttempts = 0;
    } else if (state === 'disconnected') {
      scheduleRecovery(disconnectGraceMs);
    } else if (state === 'failed') {
      clearRecovery();
      scheduleRecovery(0);
    } else if (state === 'closed') session.close('rtc_closed');
  };
  if (role === 'client') {
    peerConnection.ondatachannel = (event) => attachChannel(event.channel);
  }

  async function drainCandidates() {
    while (pendingCandidates.length) {
      await peerConnection.addIceCandidate(pendingCandidates.shift());
    }
  }

  function start() {
    return queueNegotiation(async () => {
      if (role !== 'host') return;
      const controlChannel = peerConnection.createDataChannel(MATCH_CONTROL_CHANNEL_LABEL, {
        ordered: true,
      });
      const stateChannel = peerConnection.createDataChannel(MATCH_STATE_CHANNEL_LABEL, {
        ordered: false,
        maxRetransmits: 0,
      });
      attachChannel(controlChannel);
      attachChannel(stateChannel);
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      onSignal({ kind: 'description', description: peerConnection.localDescription });
      scheduleRecovery(initialRecoveryDelayMs);
    });
  }

  function handleSignal(signal) {
    return queueNegotiation(async () => {
      if (closed) return;
      if (!signal || typeof signal !== 'object') throw new TypeError('invalid RTC signal');
      if (signal.kind === 'restart') {
        if (role !== 'host') throw new Error('only the host accepts RTC restart requests');
        clearRecovery();
        scheduleRecovery(0);
        return;
      }
      if (signal.kind === 'ice') {
        if (!signal.candidate) return;
        if (remoteDescriptionSet) await peerConnection.addIceCandidate(signal.candidate);
        else pendingCandidates.push(signal.candidate);
        return;
      }
      if (signal.kind !== 'description' || !signal.description) {
        throw new TypeError('unknown RTC signal');
      }
      const description = signal.description;
      if (role === 'host' && description.type !== 'answer') {
        throw new Error('host expected an answer');
      }
      if (role === 'client' && description.type !== 'offer') {
        throw new Error('client expected an offer');
      }
      await peerConnection.setRemoteDescription(description);
      remoteDescriptionSet = true;
      await drainCandidates();
      if (role === 'client') {
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        onSignal({ kind: 'description', description: peerConnection.localDescription });
        scheduleRecovery(initialRecoveryDelayMs);
      }
    });
  }

  const session = {
    role,
    peerConnection,
    transportReady,
    start,
    handleSignal,
    close(reason = 'rtc_closed') {
      if (closed) return;
      closed = true;
      clearRecovery();
      if (connectTimer) clearTimeout(connectTimer);
      connectTimer = null;
      pendingCandidates.length = 0;
      if (transport) transport.close(reason);
      else {
        for (const channel of channels.values()) channel.close();
        rejectTransport(new Error(reason));
      }
      channels.clear();
      peerConnection.onicecandidate = null;
      peerConnection.ondatachannel = null;
      peerConnection.onconnectionstatechange = null;
      peerConnection.close();
    },
    restartIce() {
      clearRecovery();
      scheduleRecovery(0);
    },
    get connectionState() { return peerConnection.connectionState; },
    get recoveryAttempts() { return recoveryAttempts; },
  };
  connectTimer = setTimeout(() => {
    if (closed || transport) return;
    const seconds = Math.max(1, Math.ceil(connectTimeoutMs / 1_000));
    const error = Object.assign(new Error(`WebRTC could not connect within ${seconds} seconds.`), {
      code: 'rtc_connect_timeout',
    });
    rejectTransport(error);
    session.close('rtc_connect_timeout');
  }, connectTimeoutMs);
  return session;
}
