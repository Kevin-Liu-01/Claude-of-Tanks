/**
 * The phone controller's link (docs/PHONE-CONTROLLER.md), one module for both pages: the signaling socket to the
 * pairing (`/pad/*`), the WebRTC peer that carries input, and the capped relay of last resort.
 *
 * The phone offers, the desktop answers. Two data channels: `axes` (unreliable, unordered: a late stick frame is
 * worthless) and `ctl` (reliable, ordered: buttons, status, pings). From the moment of pairing until a channel opens,
 * and for good when ICE fails, frames travel over the signaling socket as `relay` envelopes, which the pairing counts
 * against its budget (each is a billed Durable Object message), so the phone sends them at PAD_RELAY_HZ, changed frames
 * only. The signaling socket stays open for the life of the pairing (its keepalive is the host's free auto-response),
 * so a re-offer or a resume needs no new code. Browser-only (WebSocket, RTCPeerConnection), injectable for tests.
 */
import {
  PAD_KEEPALIVE_REQUEST, PAD_RELAY_AXES, PAD_RELAY_CTL, PAD_RELAY_HZ, padAxesFromRelay, padAxesToRelay, readPadCtl,
  readPadHostMessage,
} from './padProtocol.ts';
import type { PadCtlMessage, PadEndReason, PadHostMessage, PadIceServer, PadRole } from './padProtocol.ts';

/** Where the link is. `live` names its path: a direct or TURN data channel, or the relay. */
export type PadLinkState =
  | { kind: 'connecting' }
  | { kind: 'waiting'; code: string; expiresAt: number }
  | { kind: 'linking' }
  | { kind: 'live'; path: 'direct' | 'turn' | 'relay' }
  | { kind: 'away' }
  | { kind: 'ended'; reason: PadEndReason | 'unreachable' | 'relay_spent' };

export interface PadLinkOptions {
  role: PadRole;
  /** The ws(s):// origin serving `/pad/*`. */
  serviceUrl: string;
  /** The phone's code (join), or a resume of an earlier pairing. Absent on the desktop: `/pad/new`. */
  code?: string;
  resume?: { code: string; token: string };
  onState(state: PadLinkState): void;
  /** An axes frame arrived (desktop). */
  onAxes?(bytes: Uint8Array): void;
  onCtl?(message: PadCtlMessage): void;
  /** The resume token for this pairing (the phone keeps it in sessionStorage). */
  onToken?(code: string, token: string): void;
  createSocket?: (url: string) => WebSocket;
  createPeer?: (config: RTCConfiguration) => RTCPeerConnection;
  now?: () => number;
  /** How long the data channel may take before the link settles on the relay. */
  rtcTimeoutMs?: number;
}

export interface PadLink {
  readonly state: PadLinkState;
  /** Send one axes frame (phone). `changed` false lets the relay skip a repeat. */
  sendAxes(bytes: Uint8Array, changed: boolean): void;
  sendCtl(message: PadCtlMessage): boolean;
  /** True while a data channel carries the frames (not the relay). */
  readonly direct: boolean;
  /** End the pairing for both sides. */
  end(): void;
  /** Close this side only (the page is leaving); the other side sees it away. */
  dispose(): void;
}

const KEEPALIVE_MS = 15_000;
const RECONNECT_MAX_MS = 8_000;
const RECONNECT_WINDOW_MS = 60_000;

export function createPadLink(options: PadLinkOptions): PadLink {
  const now = options.now ?? (() => performance.now());
  const createSocket = options.createSocket ?? ((url: string) => new WebSocket(url));
  const createPeer = options.createPeer ?? ((config: RTCConfiguration) => new RTCPeerConnection(config));
  const rtcTimeoutMs = options.rtcTimeoutMs ?? 10_000;
  const role = options.role;
  let code = options.resume?.code ?? options.code ?? '';
  let token = options.resume?.token ?? '';
  let state: PadLinkState = { kind: 'connecting' };
  let socket: WebSocket | null = null;
  let keepalive: ReturnType<typeof setInterval> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectSince = 0;
  let reconnectDelay = 500;
  let paired = false;
  let peerHere = false;
  let ended = false;
  let relaySpent = false;
  let lastRelayAt = -Infinity;
  let pc: RTCPeerConnection | null = null;
  let axes: RTCDataChannel | null = null;
  let ctl: RTCDataChannel | null = null;
  let iceServers: PadIceServer[] | null = null;
  let iceWaiters: Array<(servers: PadIceServer[]) => void> = [];
  let pendingCandidates: RTCIceCandidateInit[] = [];
  let rtcTimer: ReturnType<typeof setTimeout> | null = null;
  let offered = false;
  let livePath: 'direct' | 'turn' | 'relay' = 'relay';

  const setState = (next: PadLinkState): void => {
    if (ended && next.kind !== 'ended') return;
    state = next;
    options.onState(next);
  };
  const send = (message: object): void => {
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  };
  const channelsOpen = (): boolean => axes?.readyState === 'open' && ctl?.readyState === 'open';

  // ---- the signaling socket ----------------------------------------------------------------------------------
  function connect(): void {
    const path = token && code ? `/pad/resume/${code}` : role === 'desktop' ? '/pad/new' : `/pad/join/${code}`;
    let ws: WebSocket;
    try { ws = createSocket(`${options.serviceUrl}${path}`); } catch { fail('unreachable'); return; }
    socket = ws;
    ws.addEventListener('open', () => {
      if (socket !== ws) return;
      reconnectDelay = 500;
      reconnectSince = 0;
      if (token && code) send({ t: 'resume', token });
      clearInterval(keepalive!);
      keepalive = setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.send(PAD_KEEPALIVE_REQUEST); }, KEEPALIVE_MS);
    });
    ws.addEventListener('message', (event) => {
      if (socket !== ws || typeof event.data !== 'string' || event.data === 'pong') return;
      const message = readPadHostMessage(event.data);
      if (message) onHost(message);
    });
    ws.addEventListener('close', () => {
      if (socket !== ws) return;
      socket = null;
      clearInterval(keepalive!);
      keepalive = null;
      if (ended) return;
      // a pairing survives a dropped socket: come back with the token (a code never shown dies with its socket)
      if (!token || !paired && role === 'phone') { fail(state.kind === 'connecting' ? 'unreachable' : 'unknown'); return; }
      if (!reconnectSince) reconnectSince = now();
      if (now() - reconnectSince > RECONNECT_WINDOW_MS) { fail('unreachable'); return; }
      if (!channelsOpen()) setState({ kind: 'away' });
      reconnectTimer = setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(RECONNECT_MAX_MS, reconnectDelay * 2);
    });
  }

  function onHost(message: PadHostMessage): void {
    switch (message.t) {
      case 'code':
        code = message.code; token = message.token;
        options.onToken?.(code, token);
        setState({ kind: 'waiting', code, expiresAt: message.expiresAt });
        return;
      case 'joined':
        token = message.token; paired = true;
        options.onToken?.(code, token);
        return;
      case 'resumed':
        paired = true;
        return;
      case 'peer':
        peerHere = message.state === 'here';
        paired = true;
        if (!peerHere) { if (!channelsOpen()) setState({ kind: 'away' }); return; }
        if (channelsOpen()) { setState({ kind: 'live', path: livePath }); return; }
        setState({ kind: 'linking' });
        // the relay carries input at once; the data channel takes over when it opens
        if (role === 'phone') { offered = false; void startOffer(); }
        else if (!iceServers) send({ t: 'ice' });
        return;
      case 'ice':
        iceServers = message.iceServers;
        for (const waiter of iceWaiters.splice(0)) waiter(message.iceServers);
        return;
      case 'signal': void onSignal(message); return;
      case 'relay': onRelay(message.data); return;
      case 'relay_spent':
        relaySpent = true;
        if (!channelsOpen()) fail('relay_spent');
        return;
      case 'error':
        if (message.code === 'rate_limit' && !iceServers) for (const waiter of iceWaiters.splice(0)) waiter([]);
        return;
      case 'end': fail(message.reason); return;
    }
  }

  function fail(reason: PadEndReason | 'unreachable' | 'relay_spent'): void {
    if (ended) return;
    ended = true;
    teardownPeer();
    clearTimeout(reconnectTimer!);
    clearInterval(keepalive!);
    const ws = socket;
    socket = null;
    try { ws?.close(1000, 'end'); } catch { /* closed */ }
    state = { kind: 'ended', reason };
    options.onState(state);
  }

  // ---- the peer --------------------------------------------------------------------------------------------
  const iceGrant = (): Promise<PadIceServer[]> => {
    if (iceServers) return Promise.resolve(iceServers);
    return new Promise((resolve) => {
      iceWaiters.push(resolve);
      if (iceWaiters.length === 1) send({ t: 'ice' });
      setTimeout(() => { const at = iceWaiters.indexOf(resolve); if (at >= 0) { iceWaiters.splice(at, 1); resolve([]); } }, 4000);
    });
  };

  function teardownPeer(): void {
    clearTimeout(rtcTimer!);
    rtcTimer = null;
    for (const channel of [axes, ctl]) { try { channel?.close(); } catch { /* closed */ } }
    try { pc?.close(); } catch { /* closed */ }
    pc = null; axes = null; ctl = null;
    pendingCandidates = [];
  }

  function wireChannel(channel: RTCDataChannel): void {
    channel.binaryType = 'arraybuffer';
    if (channel.label === 'axes') axes = channel; else if (channel.label === 'ctl') ctl = channel; else return;
    channel.addEventListener('open', () => { if (channelsOpen()) void onChannelsOpen(); });
    // a channel torn down for a new peer closes later, beside its replacement: only the live pair's close counts
    channel.addEventListener('close', () => { if ((channel === axes || channel === ctl) && !ended && peerHere && pc) onPeerLost(); });
    channel.addEventListener('message', (event) => {
      if (channel.label === 'axes') {
        if (event.data instanceof ArrayBuffer) options.onAxes?.(new Uint8Array(event.data));
      } else if (typeof event.data === 'string') {
        const message = readPadCtl(event.data);
        if (message) options.onCtl?.(message);
      }
    });
  }

  function newPeer(servers: PadIceServer[]): RTCPeerConnection {
    teardownPeer();
    const peer = createPeer({ iceServers: servers as RTCIceServer[] });
    pc = peer;
    peer.addEventListener('icecandidate', (event) => {
      if (pc === peer && event.candidate) send({ t: 'signal', kind: 'candidate', candidate: event.candidate.toJSON() });
    });
    peer.addEventListener('connectionstatechange', () => {
      if (pc !== peer) return;
      if (peer.connectionState === 'failed') onPeerLost();
    });
    peer.addEventListener('datachannel', (event) => wireChannel(event.channel));
    clearTimeout(rtcTimer!);
    rtcTimer = setTimeout(() => {
      // the data channel did not open in time: the relay carries the pairing (its budget permitting)
      if (pc === peer && !channelsOpen()) { teardownPeer(); if (peerHere && !ended) setState({ kind: 'live', path: 'relay' }); }
    }, rtcTimeoutMs);
    return peer;
  }

  async function startOffer(): Promise<void> {
    if (offered || ended) return;
    offered = true;
    const servers = await iceGrant();
    if (ended || !peerHere) return;
    const peer = newPeer(servers);
    wireChannel(peer.createDataChannel('axes', { ordered: false, maxRetransmits: 0 }));
    wireChannel(peer.createDataChannel('ctl', { ordered: true }));
    const offer = await peer.createOffer();
    if (pc !== peer) return;
    await peer.setLocalDescription(offer);
    send({ t: 'signal', kind: 'offer', sdp: offer.sdp });
  }

  async function onSignal(message: Extract<PadHostMessage, { t: 'signal' }>): Promise<void> {
    if (message.kind === 'offer' && role === 'desktop' && message.sdp) {
      const servers = await iceGrant();
      if (ended) return;
      const peer = newPeer(servers);
      await peer.setRemoteDescription({ type: 'offer', sdp: message.sdp });
      for (const candidate of pendingCandidates.splice(0)) await peer.addIceCandidate(candidate).catch(() => {});
      const answer = await peer.createAnswer();
      if (pc !== peer) return;
      await peer.setLocalDescription(answer);
      send({ t: 'signal', kind: 'answer', sdp: answer.sdp });
    } else if (message.kind === 'answer' && role === 'phone' && message.sdp && pc && !pc.remoteDescription) {
      await pc.setRemoteDescription({ type: 'answer', sdp: message.sdp });
      for (const candidate of pendingCandidates.splice(0)) await pc.addIceCandidate(candidate).catch(() => {});
    } else if (message.kind === 'candidate' && message.candidate && typeof message.candidate === 'object') {
      const candidate = message.candidate as RTCIceCandidateInit;
      if (pc?.remoteDescription) await pc.addIceCandidate(candidate).catch(() => {});
      else pendingCandidates.push(candidate);
    }
  }

  async function onChannelsOpen(): Promise<void> {
    clearTimeout(rtcTimer!);
    livePath = 'direct';
    try {
      const stats = await pc?.getStats();
      stats?.forEach((report: { type?: string; state?: string; nominated?: boolean; localCandidateId?: string; candidateType?: string; id?: string }) => {
        if (report.type !== 'candidate-pair' || report.state !== 'succeeded' || !report.nominated || !report.localCandidateId) return;
        const local = stats.get(report.localCandidateId) as { candidateType?: string } | undefined;
        if (local?.candidateType === 'relay') livePath = 'turn';
      });
    } catch { /* the path stays direct */ }
    if (channelsOpen()) setState({ kind: 'live', path: livePath });
  }

  function onPeerLost(): void {
    teardownPeer();
    livePath = 'relay';
    if (ended) return;
    setState(relaySpent ? { kind: 'away' } : { kind: 'live', path: 'relay' });
    // the phone offers again once (a network change, a sleeping radio); the relay carries input meanwhile
    if (role === 'phone' && peerHere) { offered = false; setTimeout(() => void startOffer(), 1000); }
  }

  // ---- the relay ---------------------------------------------------------------------------------------------
  function onRelay(data: string): void {
    if (data.startsWith(PAD_RELAY_AXES)) {
      const bytes = padAxesFromRelay(data.slice(1));
      if (bytes) options.onAxes?.(bytes);
    } else if (data.startsWith(PAD_RELAY_CTL)) {
      const message = readPadCtl(data.slice(1));
      if (message) options.onCtl?.(message);
    }
  }

  connect();

  return {
    get state() { return state; },
    get direct() { return channelsOpen(); },
    sendAxes(bytes, changed) {
      if (axes?.readyState === 'open') { try { axes.send(bytes as Uint8Array<ArrayBuffer>); } catch { /* closing */ } return; }
      if (!paired || !peerHere || relaySpent) return;
      const at = now();
      // the relay is billed per message: changed frames only, at most PAD_RELAY_HZ, and a 3 Hz pulse for held controls
      if (at - lastRelayAt < 1000 / PAD_RELAY_HZ || (!changed && at - lastRelayAt < 333)) return;
      lastRelayAt = at;
      send({ t: 'relay', data: PAD_RELAY_AXES + padAxesToRelay(bytes) });
    },
    sendCtl(message) {
      if (ctl?.readyState === 'open') { try { ctl.send(JSON.stringify(message)); return true; } catch { return false; } }
      if (!paired || !peerHere || relaySpent) return false;
      send({ t: 'relay', data: PAD_RELAY_CTL + JSON.stringify(message) });
      return true;
    },
    end() {
      send({ t: 'end' });
      fail('ended');
    },
    dispose() {
      ended = true;
      teardownPeer();
      clearTimeout(reconnectTimer!);
      clearInterval(keepalive!);
      try { socket?.close(1000, 'leave'); } catch { /* closed */ }
      socket = null;
    },
  };
}
