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
} = {}) {
  if (role !== 'host' && role !== 'client') throw new TypeError('role must be host or client');
  if (typeof onSignal !== 'function') throw new TypeError('onSignal callback is required');
  validateIceConfig(iceServers, relayOnly);
  const Ctor = rtcConstructor(RTCPeerConnectionImpl);
  const peerConnection = new Ctor({
    iceServers,
    iceTransportPolicy: relayOnly ? 'relay' : 'all',
    bundlePolicy: 'max-bundle',
  });
  const pendingCandidates = [];
  const channels = new Map();
  let remoteDescriptionSet = false;
  let closed = false;
  let transport = null;
  let settleTransport;
  let rejectTransport;
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
  peerConnection.onconnectionstatechange = () => {
    const state = peerConnection.connectionState;
    if (state === 'failed' || state === 'closed') session.close(`rtc_${state}`);
  };
  if (role === 'client') {
    peerConnection.ondatachannel = (event) => attachChannel(event.channel);
  }

  async function drainCandidates() {
    while (pendingCandidates.length) {
      await peerConnection.addIceCandidate(pendingCandidates.shift());
    }
  }

  async function start() {
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
  }

  async function handleSignal(signal) {
    if (closed) return;
    if (!signal || typeof signal !== 'object') throw new TypeError('invalid RTC signal');
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
    }
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
    get connectionState() { return peerConnection.connectionState; },
  };
  return session;
}
