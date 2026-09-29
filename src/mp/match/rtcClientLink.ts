/**
 * The host side of the peer-to-peer link (P2 client lane, 2026-09-28; docs/MULTIPLAYER-V2.md §13): the actor's
 * `ClientLink` over a WebRTC data channel, and the acceptor that turns the room's relayed offers into links.
 * `createRtcHostAcceptor` takes every `room_signal` offer addressed to the host for the current generation, builds one
 * peer connection per peer (a re-offer replaces the peer's previous connection: that is a reconnect), answers through
 * the room once its ICE gathering is done (the candidates inside the answer's SDP, a late one trickled — the transport's
 * rule), applies the peer's candidates, and hands each opened `match` channel to the owner as
 * a `ClientLink` whose label is a peer ordinal, never an identity. The link sends the wire CLOSE before closing the
 * channel, as the WebSocket service's socket link does. WebRTC stays behind the transport's structural shapes and
 * factory, so the receipt runs on the scripted world.
 */
import type { ClientLink } from '../../../server/match/link.ts';
import { CLOSE_REASON, MAX_MESSAGE_BYTES, MESSAGE_TYPE } from '../wire/constants.ts';
import type { CloseReasonId } from '../wire/constants.ts';
import { encodeMessage } from '../wire/codec.ts';
import { ICE_GATHER_CAP_MS, RTC_MATCH_CHANNEL_LABEL, awaitIceGathering, candidateInit, selectedCandidateTypes } from '../transport/webRtcTransport.ts';
import type {
  RtcCandidatePairTypes, RtcDataChannelLike, RtcIceCandidateInitLike, RtcIceConfig, RtcPeerConnectionFactory, RtcPeerConnectionLike,
  RtcRelayedSignal, Signaler,
} from '../transport/webRtcTransport.ts';

export interface RtcClientLink extends ClientLink {
  readonly channel: RtcDataChannelLike;
  readonly bytesSent: number;
  readonly bytesReceived: number;
  readonly framesSent: number;
  readonly framesReceived: number;
  readonly framesRejected: number;
  /** The wire reason this link closed with (null while open or when the channel closed by itself). */
  readonly closeReason: CloseReasonId | null;
  /**
   * Close the channel without a wire CLOSE: the peer sees a lost link and waits for the room's election instead of
   * a closed match (a host that leaves or migrates away; a host whose tab dies looks the same).
   */
  abandon(): void;
}

function frameBytes(data: unknown): Uint8Array | null {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return null;
}

/** Wrap one open data channel as the actor's ClientLink. */
export function createRtcClientLink(channel: RtcDataChannelLike, label: string, { maxFrameBytes = MAX_MESSAGE_BYTES }: { maxFrameBytes?: number } = {}): RtcClientLink {
  let closed = false;
  let messageListener: ((bytes: Uint8Array) => void) | null = null;
  let closeListener: (() => void) | null = null;
  let closeReason: CloseReasonId | null = null;
  const counters = { bytesSent: 0, bytesReceived: 0, framesSent: 0, framesReceived: 0, framesRejected: 0 };
  channel.binaryType = 'arraybuffer';
  const finish = (): void => {
    if (closed) return;
    closed = true;
    channel.onmessage = null;
    channel.onclose = null;
    channel.onerror = null;
    const notify = closeListener;
    closeListener = null;
    messageListener = null;
    notify?.();
  };
  channel.onmessage = (event) => {
    if (closed) return;
    const bytes = frameBytes(event.data);
    if (!bytes || bytes.byteLength > maxFrameBytes) { counters.framesRejected++; return; }
    counters.framesReceived++;
    counters.bytesReceived += bytes.byteLength;
    messageListener?.(bytes);
  };
  channel.onclose = () => finish();
  channel.onerror = () => { /* the close follows */ };
  return {
    label,
    channel,
    get bufferedAmount() { return closed ? 0 : Number(channel.bufferedAmount) || 0; },
    get closed() { return closed; },
    get bytesSent() { return counters.bytesSent; },
    get bytesReceived() { return counters.bytesReceived; },
    get framesSent() { return counters.framesSent; },
    get framesReceived() { return counters.framesReceived; },
    get framesRejected() { return counters.framesRejected; },
    get closeReason() { return closeReason; },
    send(bytes) {
      if (closed || channel.readyState !== 'open') throw new Error('link closed');
      channel.send(bytes);
      counters.framesSent++;
      counters.bytesSent += bytes.byteLength;
    },
    close(reason, detail = '') {
      if (closed) return;
      closeReason = reason;
      if (channel.readyState === 'open') {
        try { channel.send(encodeMessage({ type: MESSAGE_TYPE.CLOSE, reason, detail: detail.slice(0, 200) })); } catch { /* the channel is going */ }
      }
      finish();
      try { channel.close(); } catch { /* already closed */ }
    },
    abandon() {
      if (closed) return;
      finish();
      try { channel.close(); } catch { /* already closed */ }
    },
    onMessage(listener) { messageListener = listener; },
    onClose(listener) { closeListener = listener; },
  };
}

export type RtcHostPeerState = 'answering' | 'connecting' | 'open' | 'closed';

export interface RtcHostPeer {
  playerId: string;
  /** The label the link carries (`peer<ordinal>`). */
  label: string;
  state: RtcHostPeerState;
  generation: number;
  pc: RtcPeerConnectionLike;
  link: RtcClientLink | null;
  candidatePair: RtcCandidatePairTypes | null;
  offeredAtMs: number;
  openedAtMs: number | null;
}

export interface RtcHostAcceptorOptions {
  /** The host's own room signaler (offers and candidates arrive on it; answers and candidates leave through it). */
  signaler: Signaler;
  hostId: string;
  /** The current host generation (the room's newest election); offers for another generation are ignored. */
  generation: () => number;
  ice?: RtcIceConfig | (() => Promise<RtcIceConfig> | RtcIceConfig);
  createPeerConnection?: RtcPeerConnectionFactory;
  /** An opened `match` channel from a peer, as a ClientLink. */
  onLink(link: RtcClientLink, peer: Readonly<RtcHostPeer>): void;
  onPeerState?(peer: Readonly<RtcHostPeer>): void;
  /** Peers this host serves at most (the wire's seats minus the host). */
  maxPeers?: number;
  /** A peer whose channel has not opened within this time is dropped (it will offer again). */
  connectTimeoutMs?: number;
  clock?: () => number;
  setTimer?: (callback: () => void, delayMs: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface RtcHostAcceptorStats {
  offers: number;
  staleOffers: number;
  refusedOffers: number;
  answers: number;
  candidatesSent: number;
  candidatesReceived: number;
  links: number;
  timeouts: number;
  bytesSent: number;
  bytesReceived: number;
}

export interface RtcHostAcceptor {
  readonly peers: ReadonlyMap<string, RtcHostPeer>;
  /** Peers whose link is open. */
  readonly connected: number;
  /** Bytes every link sent so far (the status model samples the uplink from it). */
  readonly bytesSent: number;
  /** The open links whose selected pair relays through TURN. */
  readonly relayed: number;
  stats(): RtcHostAcceptorStats;
  /** Drop one peer (its link closes with `reason`). */
  drop(playerId: string, reason?: CloseReasonId, detail?: string): void;
  /** End every link: with a wire CLOSE (`reason`), or silently (`null`: the host is leaving, the peers wait for the election). */
  close(reason?: CloseReasonId | null, detail?: string): void;
}

const NO_ICE: RtcIceConfig = Object.freeze({ iceServers: [], relayOnly: false });
const DEFAULT_CONNECT_TIMEOUT_MS = 15_000;
const MAX_PENDING_CANDIDATES = 64;

function defaultPeerConnectionFactory(config: RtcIceConfig): RtcPeerConnectionLike {
  const Ctor = (globalThis as { RTCPeerConnection?: new (configuration: Record<string, unknown>) => RtcPeerConnectionLike }).RTCPeerConnection;
  if (typeof Ctor !== 'function') throw new Error('RTCPeerConnection is unavailable in this runtime');
  return new Ctor({ iceServers: config.iceServers, iceTransportPolicy: config.relayOnly ? 'relay' : 'all', bundlePolicy: 'max-bundle' });
}

export function createRtcHostAcceptor({
  signaler,
  hostId,
  generation,
  ice = NO_ICE,
  createPeerConnection = defaultPeerConnectionFactory,
  onLink,
  onPeerState = () => {},
  maxPeers = 63,
  connectTimeoutMs = DEFAULT_CONNECT_TIMEOUT_MS,
  clock = () => (typeof performance === 'object' ? performance.now() : Date.now()),
  setTimer = (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimer = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}: RtcHostAcceptorOptions): RtcHostAcceptor {
  if (!signaler || typeof signaler.onSignal !== 'function' || typeof signaler.sendSignal !== 'function') throw new TypeError('a signaler is required');
  if (typeof hostId !== 'string' || !hostId) throw new TypeError('the host id is required');
  if (typeof onLink !== 'function') throw new TypeError('onLink is required');
  const resolveIce = typeof ice === 'function' ? async () => ice() : async () => ice;
  const peers = new Map<string, RtcHostPeer>();
  interface Internal { peer: RtcHostPeer; timer: unknown; pending: RtcIceCandidateInitLike[]; described: boolean; answered: boolean; retired: boolean }
  const internals = new Map<RtcHostPeer, Internal>();
  let ordinal = 0;
  let closed = false;
  const counters: RtcHostAcceptorStats = { offers: 0, staleOffers: 0, refusedOffers: 0, answers: 0, candidatesSent: 0, candidatesReceived: 0, links: 0, timeouts: 0, bytesSent: 0, bytesReceived: 0 };

  const setState = (peer: RtcHostPeer, state: RtcHostPeerState): void => {
    if (peer.state === state) return;
    peer.state = state;
    onPeerState(peer);
  };

  /** Retire a peer's connection; its link (if open) closes with `reason`, or silently when `reason` is null. */
  const retire = (peer: RtcHostPeer, reason: CloseReasonId | null, detail = '', abandon = false): void => {
    const internal = internals.get(peer);
    if (!internal || internal.retired) return;
    internal.retired = true;
    if (internal.timer !== null) { clearTimer(internal.timer); internal.timer = null; }
    internals.delete(peer);
    if (peers.get(peer.playerId) === peer) peers.delete(peer.playerId);
    const { pc, link } = peer;
    pc.onicecandidate = null; pc.onconnectionstatechange = null; pc.ondatachannel = null;
    if (link) {
      // The link's bytes stay in the uplink total whether the owner closed it (the actor's detach) or the acceptor does.
      counters.bytesSent += link.bytesSent;
      counters.bytesReceived += link.bytesReceived;
      if (!link.closed) {
        if (reason !== null) link.close(reason, detail);
        else if (abandon) link.abandon();
      }
    }
    try { pc.close(); } catch { /* already closed */ }
    setState(peer, 'closed');
  };

  const accept = (signal: RtcRelayedSignal, config: RtcIceConfig): void => {
    const current = generation();
    if (signal.generation !== current) { counters.staleOffers++; return; }
    const previous = peers.get(signal.from);
    if (previous) retire(previous, CLOSE_REASON.REPLACED, 'peer offered again');
    if (peers.size >= maxPeers) { counters.refusedOffers++; return; }
    let pc: RtcPeerConnectionLike;
    try { pc = createPeerConnection(config); } catch { counters.refusedOffers++; return; }
    const peer: RtcHostPeer = {
      playerId: signal.from, label: `peer${++ordinal}`, state: 'answering', generation: current, pc, link: null, candidatePair: null,
      offeredAtMs: clock(), openedAtMs: null,
    };
    const internal: Internal = { peer, timer: null, pending: [], described: false, answered: false, retired: false };
    peers.set(peer.playerId, peer);
    internals.set(peer, internal);
    const live = () => internals.get(peer) === internal && !internal.retired;
    internal.timer = setTimer(() => {
      internal.timer = null;
      if (!live() || peer.state === 'open') return;
      counters.timeouts++;
      retire(peer, null, 'channel did not open');
    }, connectTimeoutMs);
    pc.onicecandidate = (event) => {
      // gathered before the answer left: inside its SDP; after: a late candidate, trickled
      if (!live() || !event.candidate || !internal.answered) return;
      const init = candidateInit(event.candidate);
      if (!init.candidate) return;
      if (signaler.sendSignal({ to: peer.playerId, generation: peer.generation, kind: 'candidate', candidate: init })) counters.candidatesSent++;
    };
    pc.onconnectionstatechange = () => {
      if (!live()) return;
      const state = pc.connectionState;
      if (state === 'failed' || state === 'closed') retire(peer, null, `peer connection ${state}`);
    };
    pc.ondatachannel = ({ channel }) => {
      if (!live() || channel.label !== RTC_MATCH_CHANNEL_LABEL) { try { channel.close(); } catch { /* ignored */ } return; }
      const opened = (): void => {
        if (!live() || peer.link) return;
        if (internal.timer !== null) { clearTimer(internal.timer); internal.timer = null; }
        const link = createRtcClientLink(channel, peer.label);
        peer.link = link;
        peer.openedAtMs = clock();
        counters.links++;
        link.onClose(() => { if (live()) retire(peer, null, 'link closed'); });
        setState(peer, 'open');
        if (typeof pc.getStats === 'function') {
          void pc.getStats().then((report) => { if (live()) peer.candidatePair = selectedCandidateTypes(report); }).catch(() => { /* diagnostics */ });
        }
        onLink(link, peer);
      };
      setState(peer, 'connecting');
      if (channel.readyState === 'open') opened();
      else channel.onopen = () => opened();
    };
    void pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp ?? '' }).then(() => {
      if (!live()) return;
      internal.described = true;
      const queued = internal.pending.splice(0);
      for (const candidate of queued) void pc.addIceCandidate(candidate).catch(() => { /* stale */ });
      return pc.createAnswer();
    }).then((answer) => {
      if (!answer || !live()) return;
      return pc.setLocalDescription(answer).then(() => {
        const send = (): void => {
          if (!live()) return;
          const sdp = pc.localDescription?.sdp ?? answer.sdp ?? '';
          if (!sdp || !signaler.sendSignal({ to: peer.playerId, generation: peer.generation, kind: 'answer', sdp })) throw new Error('the room refused the answer');
          internal.answered = true;
          counters.answers++;
          setState(peer, 'connecting');
        };
        const gathering = awaitIceGathering(pc, ICE_GATHER_CAP_MS, setTimer, clearTimer);
        return gathering ? gathering.then(send) : send();
      });
    }).catch(() => {
      if (live()) retire(peer, null, 'negotiation failed');
    });
  };

  const unsubscribe = signaler.onSignal((signal) => {
    if (closed || signal.to !== hostId) return;
    if (signal.kind === 'offer') {
      counters.offers++;
      if (!signal.sdp) { counters.refusedOffers++; return; }
      void resolveIce().then((config) => { if (!closed) accept(signal, config); }, () => { if (!closed) accept(signal, NO_ICE); });
      return;
    }
    if (signal.kind === 'candidate' && signal.candidate) {
      const peer = peers.get(signal.from);
      const internal = peer ? internals.get(peer) : null;
      if (!peer || !internal || signal.generation !== peer.generation) return;
      counters.candidatesReceived++;
      if (!internal.described) {
        if (internal.pending.length < MAX_PENDING_CANDIDATES) internal.pending.push(signal.candidate);
        return;
      }
      void peer.pc.addIceCandidate(signal.candidate).catch(() => { /* stale */ });
    }
    // An answer never reaches the host: the host answers, the peer offers.
  });

  return {
    peers,
    get connected() { let count = 0; for (const peer of peers.values()) if (peer.state === 'open') count++; return count; },
    get bytesSent() { let total = counters.bytesSent; for (const peer of peers.values()) if (peer.link) total += peer.link.bytesSent; return total; },
    get relayed() { let count = 0; for (const peer of peers.values()) if (peer.state === 'open' && peer.candidatePair?.viaTurn) count++; return count; },
    stats() {
      let bytesSent = counters.bytesSent;
      let bytesReceived = counters.bytesReceived;
      for (const peer of peers.values()) if (peer.link) { bytesSent += peer.link.bytesSent; bytesReceived += peer.link.bytesReceived; }
      return { ...counters, bytesSent, bytesReceived };
    },
    drop(playerId, reason = CLOSE_REASON.ROOM_CLOSED, detail = '') {
      const peer = peers.get(playerId);
      if (peer) retire(peer, reason, detail);
    },
    close(reason = CLOSE_REASON.ROOM_CLOSED, detail = '') {
      if (closed) return;
      closed = true;
      unsubscribe();
      for (const peer of [...peers.values()]) retire(peer, reason, detail, reason === null);
    },
  };
}
