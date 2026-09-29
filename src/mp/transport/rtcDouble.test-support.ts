/**
 * A scripted WebRTC world for the receipts (P2 client lane): peer-connection and data-channel doubles with the
 * structural shapes `webRtcTransport.ts` and `rtcClientLink.ts` touch, wired through their SDP so an offer answered
 * by another double connects the two — every channel the offerer created appears on the answerer's `ondatachannel`,
 * both open, `send` delivers the bytes to the mirror on the world's scheduler with bufferedAmount accounting, and a
 * close reaches the other side. Candidates, connection states and stats are scripted by the test. No timers of its
 * own: `flush()` delivers everything queued (the receipts run on virtual time).
 */
import type {
  RtcDataChannelLike, RtcIceCandidateInitLike, RtcIceCandidateLike, RtcIceConfig, RtcPeerConnectionLike, RtcSessionDescriptionLike,
  RtcStatsLike, RtcStatsReportLike,
} from './webRtcTransport.ts';

export interface ScriptedPairTypes {
  local: 'host' | 'srflx' | 'prflx' | 'relay';
  remote: 'host' | 'srflx' | 'prflx' | 'relay';
  rttS?: number;
}

export class FakeDataChannel implements RtcDataChannelLike {
  readonly label: string;
  readyState = 'connecting';
  binaryType = 'blob';
  bufferedAmount = 0;
  onopen: ((event: unknown) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  /** Bytes handed to `send`, oldest first. */
  readonly sent: Uint8Array[] = [];
  /** Held back from the mirror while true (the test models congestion: bufferedAmount grows). */
  congested = false;
  mirror: FakeDataChannel | null = null;
  private readonly world: RtcWorld;
  private readonly inFlight: Uint8Array[] = [];

  constructor(world: RtcWorld, label: string) {
    this.world = world;
    this.label = label;
  }

  send(data: Uint8Array): void {
    if (this.readyState !== 'open') throw new Error(`data channel ${this.label} is ${this.readyState}`);
    const copy = data.slice();
    this.sent.push(copy);
    this.bufferedAmount += copy.byteLength;
    this.inFlight.push(copy);
    this.world.queue(() => this.drain());
  }

  /** Deliver what congestion held back. */
  drain(): void {
    while (!this.congested && this.inFlight.length) {
      const bytes = this.inFlight.shift()!;
      this.bufferedAmount -= bytes.byteLength;
      const mirror = this.mirror;
      if (mirror && mirror.readyState === 'open') mirror.onmessage?.({ data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
    }
  }

  /** The world opened the channel (both ends). */
  open(): void {
    if (this.readyState === 'open') return;
    this.readyState = 'open';
    this.onopen?.({ type: 'open' });
  }

  /** A graceful close: what was sent before it still reaches the mirror (SCTP flushes), then the mirror closes. */
  close(): void {
    if (this.readyState === 'closed' || this.readyState === 'closing') return;
    this.readyState = 'closed';
    const mirror = this.mirror;
    this.onclose?.({ type: 'close' });
    this.world.queue(() => {
      this.congested = false;
      this.drain();
      if (mirror && mirror.readyState !== 'closed') mirror.close();
    });
  }

  /** The network dropped this channel (no graceful close reaches the mirror until its own timers say so). */
  drop(): void {
    if (this.readyState === 'closed') return;
    this.readyState = 'closed';
    this.inFlight.length = 0;
    this.onclose?.({ type: 'close' });
  }
}

export class FakePeerConnection implements RtcPeerConnectionLike {
  readonly id: number;
  readonly config: RtcIceConfig;
  connectionState = 'new';
  /** 'complete' by default (an offer leaves at once); a test sets 'gathering' and calls `completeGathering` to model the wait. */
  iceGatheringState = 'complete';
  onicegatheringstatechange: ((event: unknown) => void) | null = null;
  onicecandidate: ((event: { candidate: RtcIceCandidateLike | null }) => void) | null = null;
  onconnectionstatechange: ((event: unknown) => void) | null = null;
  ondatachannel: ((event: { channel: RtcDataChannelLike }) => void) | null = null;
  readonly channels: FakeDataChannel[] = [];
  localDescription: RtcSessionDescriptionLike | null = null;
  remoteDescription: RtcSessionDescriptionLike | null = null;
  readonly addedCandidates: RtcIceCandidateInitLike[] = [];
  /** What `getStats` reports once connected; null keeps the report empty. */
  pairTypes: ScriptedPairTypes | null;
  /** Reject the next description call with this error (the test scripts a failing negotiation). */
  failNextDescription: Error | null = null;
  closed = false;
  peer: FakePeerConnection | null = null;
  private readonly world: RtcWorld;

  constructor(world: RtcWorld, id: number, config: RtcIceConfig, pairTypes: ScriptedPairTypes | null) {
    this.world = world;
    this.id = id;
    this.config = config;
    this.pairTypes = pairTypes;
  }

  createDataChannel(label: string): FakeDataChannel {
    if (this.closed) throw new Error('peer connection closed');
    const channel = new FakeDataChannel(this.world, label);
    this.channels.push(channel);
    return channel;
  }

  createOffer(): Promise<RtcSessionDescriptionLike> {
    return Promise.resolve({ type: 'offer', sdp: `v=0 offer pc${this.id}` });
  }

  createAnswer(): Promise<RtcSessionDescriptionLike> {
    return Promise.resolve({ type: 'answer', sdp: `v=0 answer pc${this.id}` });
  }

  setLocalDescription(description: RtcSessionDescriptionLike): Promise<void> {
    if (this.failNextDescription) { const error = this.failNextDescription; this.failNextDescription = null; return Promise.reject(error); }
    this.localDescription = description;
    return Promise.resolve();
  }

  setRemoteDescription(description: RtcSessionDescriptionLike): Promise<void> {
    if (this.failNextDescription) { const error = this.failNextDescription; this.failNextDescription = null; return Promise.reject(error); }
    this.remoteDescription = description;
    const match = /\bpc(\d+)\b/.exec(description.sdp ?? '');
    const other = match ? this.world.connections.get(Number(match[1])) ?? null : null;
    if (other && description.type === 'answer') this.world.link(this, other);
    return Promise.resolve();
  }

  addIceCandidate(candidate: RtcIceCandidateInitLike): Promise<void> {
    this.addedCandidates.push(candidate);
    return Promise.resolve();
  }

  getStats(): Promise<RtcStatsReportLike> {
    const entries: RtcStatsLike[] = [];
    if (this.pairTypes && this.connectionState === 'connected') {
      entries.push({ type: 'local-candidate', id: 'L1', candidateType: this.pairTypes.local });
      entries.push({ type: 'remote-candidate', id: 'R1', candidateType: this.pairTypes.remote });
      entries.push({ type: 'candidate-pair', id: 'P1', state: 'succeeded', nominated: true, localCandidateId: 'L1', remoteCandidateId: 'R1', currentRoundTripTime: this.pairTypes.rttS ?? 0.012 });
      entries.push({ type: 'transport', id: 'T1', selectedCandidatePairId: 'P1' });
    }
    return Promise.resolve({ forEach: (callback) => { for (const entry of entries) callback(entry); } });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.connectionState = 'closed';
    for (const channel of this.channels) channel.close();
  }

  /** A gathered candidate (the test scripts trickle ICE). */
  emitCandidate(init: RtcIceCandidateInitLike | null): void {
    this.onicecandidate?.({ candidate: init ? { ...init, toJSON: () => init } : null });
  }

  /** Gathering ends: the candidates join the local description's SDP (as a browser's does) and the state change fires. */
  completeGathering(candidates: string[] = []): void {
    if (this.localDescription) this.localDescription = { ...this.localDescription, sdp: `${this.localDescription.sdp ?? ''}${candidates.map((candidate) => `\na=candidate:${candidate}`).join('')}` };
    this.iceGatheringState = 'complete';
    this.onicegatheringstatechange?.({ type: 'icegatheringstatechange' });
  }

  /** The ICE agent gave up. */
  fail(): void {
    this.setConnectionState('failed');
  }

  setConnectionState(state: string): void {
    if (this.closed) return;
    this.connectionState = state;
    this.onconnectionstatechange?.({ type: 'connectionstatechange' });
  }
}

export interface RtcWorldOptions {
  /** The pair types every connection reports once connected (a test may override per connection). */
  pairTypes?: ScriptedPairTypes | null;
}

export class RtcWorld {
  readonly connections = new Map<number, FakePeerConnection>();
  private readonly pending: Array<() => void> = [];
  private nextId = 1;
  private readonly defaultPairTypes: ScriptedPairTypes | null;

  constructor({ pairTypes = { local: 'host', remote: 'host' } }: RtcWorldOptions = {}) {
    this.defaultPairTypes = pairTypes;
  }

  /** The factory a transport or an acceptor takes. */
  readonly createPeerConnection = (config: RtcIceConfig): FakePeerConnection => {
    const pc = new FakePeerConnection(this, this.nextId++, config, this.defaultPairTypes);
    this.connections.set(pc.id, pc);
    return pc;
  };

  /** @internal a delivery scheduled on the world's queue */
  queue(task: () => void): void { this.pending.push(task); }

  /** Deliver everything queued (channel opens, frames, closes), including what the deliveries queue themselves. */
  flush(): number {
    let ran = 0;
    while (this.pending.length) { this.pending.shift()!(); ran++; }
    return ran;
  }

  /** @internal the offerer accepted the answerer's answer: mirror the channels and open both ends */
  link(offerer: FakePeerConnection, answerer: FakePeerConnection): void {
    offerer.peer = answerer;
    answerer.peer = offerer;
    this.queue(() => {
      if (offerer.closed || answerer.closed) return;
      offerer.setConnectionState('connected');
      answerer.setConnectionState('connected');
      for (const channel of offerer.channels) {
        if (channel.mirror || channel.readyState === 'closed') continue;
        const mirror = new FakeDataChannel(this, channel.label);
        mirror.mirror = channel;
        channel.mirror = mirror;
        answerer.channels.push(mirror);
        answerer.ondatachannel?.({ channel: mirror });
        this.queue(() => { mirror.open(); channel.open(); });
      }
    });
  }
}

/** A signaling relay double applying the room's rules: both seats known, one of them the current host, the generation current. */
export class FakeSignalRelay {
  private readonly listeners = new Map<string, Set<(signal: { to: string; from: string; generation: number; kind: 'offer' | 'answer' | 'candidate'; sdp?: string; candidate?: RtcIceCandidateInitLike }) => void>>();
  readonly delivered: Array<{ from: string; to: string; kind: string; generation: number }> = [];
  readonly refused: Array<{ from: string; to: string; kind: string; generation: number; why: string }> = [];
  hostId: string;
  generation: number;
  /** Signals wait here until `flush` when true (the test models relay latency). */
  hold = false;
  private readonly queued: Array<() => void> = [];
  /** Offers relayed to a seat with no listener yet (the room client's recent-offer buffer): `recentOffers()` drains them. */
  private readonly undelivered = new Map<string, Array<{ to: string; from: string; generation: number; kind: 'offer' | 'answer' | 'candidate'; sdp?: string; candidate?: RtcIceCandidateInitLike }>>();

  constructor(hostId: string, generation = 1) {
    this.hostId = hostId;
    this.generation = generation;
  }

  /** The signaler a seat holds (the seat is known to the relay from here on, listener or not — as a joined seat is to the room). */
  signalerFor(playerId: string) {
    if (!this.listeners.has(playerId)) this.listeners.set(playerId, new Set());
    return {
      target: () => (this.hostId ? { hostId: this.hostId, generation: this.generation } : null),
      sendSignal: (payload: { to: string; generation: number; kind: 'offer' | 'answer' | 'candidate'; sdp?: string; candidate?: RtcIceCandidateInitLike }) => this.relay(playerId, payload),
      onSignal: (listener: (signal: { to: string; from: string; generation: number; kind: 'offer' | 'answer' | 'candidate'; sdp?: string; candidate?: RtcIceCandidateInitLike }) => void) => {
        if (!this.listeners.has(playerId)) this.listeners.set(playerId, new Set());
        this.listeners.get(playerId)!.add(listener);
        return () => { this.listeners.get(playerId)?.delete(listener); };
      },
      recentOffers: () => {
        const offers = (this.undelivered.get(playerId) ?? []).filter((signal) => signal.kind === 'offer' && signal.generation === this.generation);
        this.undelivered.delete(playerId);
        return offers;
      },
    };
  }

  private relay(from: string, payload: { to: string; generation: number; kind: 'offer' | 'answer' | 'candidate'; sdp?: string; candidate?: RtcIceCandidateInitLike }): boolean {
    const record = { from, to: payload.to, kind: payload.kind, generation: payload.generation };
    if (payload.generation !== this.generation) { this.refused.push({ ...record, why: 'stale_generation' }); return true; }
    if (from !== this.hostId && payload.to !== this.hostId) { this.refused.push({ ...record, why: 'no_host_endpoint' }); return true; }
    if (!this.listeners.has(payload.to)) { this.refused.push({ ...record, why: 'unknown_seat' }); return true; }
    const deliver = () => {
      this.delivered.push(record);
      const listeners = [...(this.listeners.get(payload.to) ?? [])];
      // a seat that is in the room but has no acceptor listening yet keeps the offer for the acceptor it will make (the room client's rule)
      if (payload.kind === 'offer' && listeners.length === 0) {
        if (!this.undelivered.has(payload.to)) this.undelivered.set(payload.to, []);
        this.undelivered.get(payload.to)!.push({ ...payload, from });
      }
      for (const listener of listeners) listener({ ...payload, from });
    };
    if (this.hold) this.queued.push(deliver);
    else deliver();
    return true;
  }

  flush(): void {
    while (this.queued.length) this.queued.shift()!();
  }

  /** Deliver a signal past the relay's rules (a race the room lost: the transport's own filter is the last line). */
  inject(from: string, payload: { to: string; generation: number; kind: 'offer' | 'answer' | 'candidate'; sdp?: string; candidate?: RtcIceCandidateInitLike }): void {
    for (const listener of [...(this.listeners.get(payload.to) ?? [])]) listener({ ...payload, from });
  }

  /** The room elected a new host. */
  elect(hostId: string): void {
    this.hostId = hostId;
    this.generation++;
  }
}
