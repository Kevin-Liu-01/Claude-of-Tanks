import { createLobby } from './lobby.js';
import { LobbyHostRuntime } from './lobbyRuntime.js';
import { createWebRTCPeer } from './webrtcPeer.ts';
import { MatchClientRuntime } from './matchRuntime.js';
import { maybeCreateAdverseNetworkTransport } from './adverseNetworkTransport.js';

/**
 * Compose signaling, one WebRTC peer per remote participant, and canonical
 * lobby policy for a browser-hosted LAN/private room.
 */
export class PrivateRoomHostSession {
  constructor({
    signaling,
    roomInfo,
    hostName,
    hostSpecId = null,
    hostEquipment = [],
    hostCamo = 'factory',
    mapId = 'random',
    teamSize = 2,
    iceServers = [],
    relayOnly = false,
    RTCPeerConnectionImpl = null,
    isVehicleAllowed = () => true,
    isCamoAllowed = () => true,
    isMapAllowed = () => true,
    onStart = null,
    onError = null,
  } = {}) {
    if (!signaling || !roomInfo || !roomInfo.peerId || !roomInfo.roomCode) {
      throw new TypeError('signaling and created room info are required');
    }
    this.signaling = signaling;
    this.roomInfo = roomInfo;
    this.iceServers = iceServers;
    this.relayOnly = relayOnly;
    this.RTCPeerConnectionImpl = RTCPeerConnectionImpl;
    this.isVehicleAllowed = isVehicleAllowed;
    this.isCamoAllowed = isCamoAllowed;
    this.isMapAllowed = isMapAllowed;
    this.onError = onError;
    this.peers = new Map();
    this.matchRuntime = null;
    this.lobby = createLobby({
      roomCode: roomInfo.roomCode,
      hostId: roomInfo.peerId,
      hostName,
      hostSpecId,
      hostEquipment,
      hostCamo,
      maxPlayers: roomInfo.maxPlayers || 14,
      mode: roomInfo.mode || 'private',
      mapId,
      teamSize,
    });
    this.runtime = new LobbyHostRuntime({
      lobby: this.lobby,
      isVehicleAllowed,
      isCamoAllowed,
      isMapAllowed,
      onStart,
    });
    this.unsubscribeSignal = signaling.onEvent((message) => this.#event(message));
    for (const peer of roomInfo.peers || []) {
      if (peer.peerId === roomInfo.peerId) continue;
      this.#joinPeer(peer).catch((error) => this.#fail(error));
    }
  }

  #fail(error) {
    if (this.onError) this.onError(error);
  }

  #event(message) {
    if (!message || !message.payload || message.payload.roomCode !== this.roomInfo.roomCode) return;
    if (message.type === 'peer_joined') {
      this.#joinPeer(message.payload).catch((error) => this.#fail(error));
    } else if (message.type === 'room_signal') {
      const session = this.peers.get(message.payload.fromPeerId);
      if (session && message.payload.fromSessionId === session.sessionId) {
        session.handleSignal(message.payload.signal).catch((error) => this.#fail(error));
      }
    } else if (message.type === 'peer_left') {
      const session = this.peers.get(message.payload.peerId);
      // Remove the canonical room seat before closing the RTC channels. Their
      // close callback is intentionally treated as recoverable transport loss.
      this.matchRuntime?.detachPeer?.(message.payload.peerId, 'peer_left');
      this.runtime.detachPeer(message.payload.peerId, 'peer_left');
      if (session) session.close('peer_left');
      this.peers.delete(message.payload.peerId);
    } else if (message.type === 'signaling_resumed') {
      // The durable room response is the source of truth after a socket gap.
      // Reconcile peers that may have joined while this host instance could
      // not receive pub/sub or mailbox wake-ups.
      for (const peer of message.payload.peers || []) {
        if (peer.peerId === this.roomInfo.peerId) continue;
        this.#joinPeer(peer).catch((error) => this.#fail(error));
      }
    }
  }

  async #joinPeer({ peerId, player, sessionId: rawSessionId }) {
    const sessionId = String(rawSessionId || '');
    const existing = this.peers.get(peerId);
    if (existing && existing.sessionId === sessionId) {
      if (['new', 'connecting', 'connected'].includes(existing.connectionState)) return;
      if (['disconnected', 'failed'].includes(existing.connectionState)) {
        existing.restartIce();
        return;
      }
      // A bounded initial-connect timeout leaves a closed peer in the map
      // until the durable signaling member resumes. Rebuild it here instead
      // of trying to restart a closed RTCPeerConnection.
    }
    if (existing) {
      existing.close('peer_replaced');
      this.peers.delete(peerId);
    }
    const session = createWebRTCPeer({
      role: 'host',
      iceServers: this.iceServers,
      relayOnly: this.relayOnly,
      RTCPeerConnectionImpl: this.RTCPeerConnectionImpl,
      onSignal: (signal) => this.signaling.sendSignal(peerId, signal, sessionId),
    });
    session.sessionId = sessionId;
    this.peers.set(peerId, session);
    await session.start();
    const transport = await session.transportReady;
    const cleanPlayer = { name: player && player.name || 'Player' };
    if (this.matchRuntime) {
      try {
        this.matchRuntime.rejoinPeer({
          peerId,
          transport,
          player: cleanPlayer,
          metadata: { mode: this.roomInfo.mode || 'private' },
        });
      } catch (error) {
        session.close(error?.code || 'room_rejoin_failed');
        this.peers.delete(peerId);
        throw error;
      }
    } else {
      this.runtime.attachPeer({ peerId, transport, player: cleanPlayer });
    }
  }

  command(command) {
    return this.runtime.command(this.roomInfo.peerId, command);
  }

  /** Release open remote channels for AuthoritativeMatchRuntime attachment. */
  takeMatchChannels() {
    // Keep rendezvous listening after handoff. Gameplay never traverses this
    // socket, but a browser that reloads after a round needs it to establish
    // a fresh WebRTC channel into the still-live room.
    return this.runtime.releaseTransports();
  }

  bindMatchRuntime(runtime) {
    this.matchRuntime = runtime || null;
  }

  close(reason = 'host_closed') {
    if (this.unsubscribeSignal) this.unsubscribeSignal();
    this.runtime.close(reason);
    for (const session of this.peers.values()) session.close(reason);
    this.peers.clear();
    this.signaling.close(reason);
  }
}

export class PrivateRoomClientSession {
  constructor({
    signaling,
    roomInfo,
    iceServers = [],
    relayOnly = false,
    RTCPeerConnectionImpl = null,
    onError = null,
    onConnectionState = null,
    disconnectedRebuildDelayMs = 8_000,
    failedRebuildDelayMs = 2_000,
    connectTimeoutMs = 60_000,
    initialRebuildDelaysMs = [250, 1_000],
  } = {}) {
    if (!signaling || !roomInfo || !roomInfo.peerId || !roomInfo.hostId) {
      throw new TypeError('signaling and joined room info are required');
    }
    this.signaling = signaling;
    this.roomInfo = roomInfo;
    this.onError = onError;
    this.iceServers = iceServers;
    this.relayOnly = relayOnly;
    this.RTCPeerConnectionImpl = RTCPeerConnectionImpl;
    this.onConnectionState = typeof onConnectionState === 'function' ? onConnectionState : null;
    if (!Number.isFinite(disconnectedRebuildDelayMs) || disconnectedRebuildDelayMs < 0 ||
        !Number.isFinite(failedRebuildDelayMs) || failedRebuildDelayMs < 0 ||
        !Number.isFinite(connectTimeoutMs) || connectTimeoutMs <= 0) {
      throw new TypeError('RTC rebuild delays must be non-negative milliseconds');
    }
    if (!Array.isArray(initialRebuildDelaysMs) || initialRebuildDelaysMs.some(
      (delay) => !Number.isFinite(delay) || delay < 0,
    )) throw new TypeError('initial RTC rebuild delays must be non-negative milliseconds');
    this.disconnectedRebuildDelayMs = disconnectedRebuildDelayMs;
    this.failedRebuildDelayMs = failedRebuildDelayMs;
    this.connectTimeoutMs = connectTimeoutMs;
    this.initialRebuildDelaysMs = [...initialRebuildDelaysMs];
    this.recoveryTimer = null;
    this.replacePromise = null;
    this.closed = false;
    this.runtime = null;
    this.hostSessionId = String(
      roomInfo.peers?.find((peer) => peer.peerId === roomInfo.hostId)?.sessionId || '',
    );
    this.peer = this.#createPeer();
    this.unsubscribeSignal = signaling.onEvent((message) => {
      if (message && message.type === 'room_signal' && message.payload &&
          message.payload.roomCode === roomInfo.roomCode &&
          message.payload.fromPeerId === roomInfo.hostId &&
          message.payload.fromSessionId === this.hostSessionId) {
        this.peer.handleSignal(message.payload.signal).catch((error) => {
          if (this.onError) this.onError(error);
        });
      } else if (message && message.type === 'peer_joined' && message.payload &&
                 message.payload.roomCode === roomInfo.roomCode &&
                 message.payload.peerId === roomInfo.hostId) {
        const nextSessionId = String(message.payload.sessionId || '');
        if (nextSessionId && nextSessionId !== this.hostSessionId) {
          this.hostSessionId = nextSessionId;
          this.#replacePeer().catch((error) => {
            if (this.onError) this.onError(error);
          });
        } else if (['failed', 'disconnected'].includes(this.peer.connectionState)) {
          this.peer.restartIce();
        }
      } else if (message && message.type === 'room_closed' && message.payload &&
                 message.payload.roomCode === roomInfo.roomCode) {
        this.close(message.payload.reason || 'room_closed');
      } else if (message && message.type === 'signaling_resumed' && message.payload &&
                 message.payload.roomCode === roomInfo.roomCode) {
        const host = message.payload.peers?.find((peer) => peer.peerId === roomInfo.hostId);
        const nextSessionId = String(host?.sessionId || '');
        if (nextSessionId && nextSessionId !== this.hostSessionId) {
          this.hostSessionId = nextSessionId;
          this.#replacePeer().catch((error) => {
            if (this.onError) this.onError(error);
          });
        } else if (this.peer.connectionState !== 'connected') {
          this.peer.restartIce();
        }
      }
    });
    this.ready = this.#bindInitialPeer(this.peer).catch(
      (error) => this.#recoverInitialPeer(error),
    );
  }

  #createPeer() {
    return createWebRTCPeer({
      role: 'client',
      iceServers: this.iceServers,
      relayOnly: this.relayOnly,
      RTCPeerConnectionImpl: this.RTCPeerConnectionImpl,
      connectTimeoutMs: this.connectTimeoutMs,
      onSignal: (signal) => this.signaling.sendSignal(
        this.roomInfo.hostId,
        signal,
        this.hostSessionId,
      ),
      onConnectionStateChange: (state) => this.#connectionStateChanged(state),
    });
  }

  #connectionStateChanged(state) {
    if (this.closed) return;
    this.onConnectionState?.(state);
    if (state === 'connected') {
      if (this.recoveryTimer) clearTimeout(this.recoveryTimer);
      this.recoveryTimer = null;
      return;
    }
    if (!this.runtime || (state !== 'failed' && state !== 'disconnected') ||
        this.recoveryTimer || this.replacePromise) return;
    const peer = this.peer;
    const delayMs = state === 'failed'
      ? this.failedRebuildDelayMs : this.disconnectedRebuildDelayMs;
    this.recoveryTimer = setTimeout(() => {
      this.recoveryTimer = null;
      if (this.closed || this.peer !== peer || peer.connectionState === 'connected') return;
      this.#replacePeer({ renewSignaling: true }).catch((error) => {
        if (this.onError) this.onError(error);
      });
    }, delayMs);
  }

  #bindInitialPeer(peer) {
    return peer.transportReady.then((transport) => {
      if (this.closed || this.peer !== peer) {
        transport.close('rtc_generation_replaced');
        throw Object.assign(new Error('RTC generation was replaced'), {
          code: 'rtc_generation_replaced',
        });
      }
      return this.#attachInitialTransport(transport);
    });
  }

  #attachInitialTransport(transport) {
    if (this.runtime) return this.#roomAdapter();
    // Once RTC is established, pub/sub remains the fast path and the
    // durable mailbox only needs a low-frequency closure/rejoin safety net.
    if (typeof this.signaling.setEventPollInterval === 'function') {
      this.signaling.setEventPollInterval(2_000);
    }
    const client = new MatchClientRuntime({
      transport,
      playerId: this.roomInfo.peerId,
    });
    client.connect({ mode: this.roomInfo.mode || 'private', phase: 'lobby' });
    this.runtime = client;
    return this.#roomAdapter();
  }

  #roomAdapter() {
    const client = this.runtime;
    return {
      onState: (listener) => client.onRoomState(listener),
      submit: (command) => client.submitRoomCommand(command),
      get errors() { return client.errors; },
      get closed() { return client.closed; },
    };
  }

  async #recoverInitialPeer(initialError) {
    let error = initialError;
    for (const delayMs of this.initialRebuildDelaysMs) {
      if (this.closed) throw error;
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
      if (this.closed) throw error;
      try {
        return await this.#replacePeer({ renewSignaling: true });
      } catch (nextError) {
        error = nextError;
      }
    }
    throw error;
  }

  #replacePeer({ renewSignaling = false } = {}) {
    if (this.replacePromise) return this.replacePromise;
    const replacement = this.#replacePeerNow(renewSignaling).finally(() => {
      if (this.replacePromise === replacement) this.replacePromise = null;
    });
    this.replacePromise = replacement;
    return replacement;
  }

  async #replacePeerNow(renewSignaling) {
    const previous = this.runtime?.roomState?.players?.find(
      (player) => player.id === this.roomInfo.peerId,
    ) || null;
    const oldPeer = this.peer;
    const nextPeer = this.#createPeer();
    this.peer = nextPeer;
    oldPeer.close('host_session_replaced');
    if (renewSignaling) await this.signaling.restartRoomSession('rtc_session_rebuild');
    const transport = await nextPeer.transportReady;
    if (this.peer !== nextPeer || this.closed) {
      transport.close('rtc_generation_replaced');
      throw Object.assign(new Error('RTC generation was replaced'), {
        code: 'rtc_generation_replaced',
      });
    }
    if (!this.runtime) return this.#attachInitialTransport(transport);
    this.runtime.reconnectTransport(transport, {
      mode: this.roomInfo.mode || 'private',
      phase: 'lobby',
    });
    if (previous?.specId) {
      this.runtime.submitRoomCommand({ type: 'select_vehicle', specId: previous.specId });
    }
    if (Array.isArray(previous?.equipment)) {
      this.runtime.submitRoomCommand({ type: 'select_equipment', equipment: previous.equipment });
    }
    if (previous?.camo) {
      this.runtime.submitRoomCommand({ type: 'select_camo', camo: previous.camo });
    }
    if (previous?.team) {
      this.runtime.submitRoomCommand({ type: 'set_team', team: previous.team });
    }
  }

  async submit(command) {
    await this.ready;
    return this.runtime.submitRoomCommand(command);
  }

  async takeMatchTransport() {
    await this.ready;
    return this.runtime.transport;
  }

  async takeMatchClient() {
    await this.ready;
    if (!this.runtime.connected) {
      const wrapped = maybeCreateAdverseNetworkTransport(this.runtime.transport);
      if (wrapped !== this.runtime.transport) this.runtime.replaceTransport(wrapped);
    }
    this.runtime.beginMatchHandshake({ mode: this.roomInfo.mode || 'private' });
    return this.runtime;
  }

  close(reason = 'client_closed') {
    this.closed = true;
    if (this.recoveryTimer) clearTimeout(this.recoveryTimer);
    this.recoveryTimer = null;
    if (this.unsubscribeSignal) this.unsubscribeSignal();
    if (this.runtime && !this.runtime.closed) this.runtime.close(reason);
    this.peer.close(reason);
    this.signaling.close(reason);
  }
}
