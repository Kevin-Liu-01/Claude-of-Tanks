import { createLobby } from './lobby.js';
import { LobbyHostRuntime } from './lobbyRuntime.js';
import { createWebRTCPeer } from './webrtcPeer.js';
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
      if (session) session.handleSignal(message.payload.signal).catch((error) => this.#fail(error));
    } else if (message.type === 'peer_left') {
      const session = this.peers.get(message.payload.peerId);
      if (session) session.close('peer_left');
      this.peers.delete(message.payload.peerId);
      this.runtime.detachPeer(message.payload.peerId, 'peer_left');
    }
  }

  async #joinPeer({ peerId, player }) {
    if (this.peers.has(peerId)) {
      this.peers.get(peerId).close('peer_replaced');
      this.peers.delete(peerId);
    }
    const session = createWebRTCPeer({
      role: 'host',
      iceServers: this.iceServers,
      relayOnly: this.relayOnly,
      RTCPeerConnectionImpl: this.RTCPeerConnectionImpl,
      onSignal: (signal) => this.signaling.sendSignal(peerId, signal),
    });
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
  } = {}) {
    if (!signaling || !roomInfo || !roomInfo.peerId || !roomInfo.hostId) {
      throw new TypeError('signaling and joined room info are required');
    }
    this.signaling = signaling;
    this.roomInfo = roomInfo;
    this.onError = onError;
    this.runtime = null;
    this.peer = createWebRTCPeer({
      role: 'client',
      iceServers,
      relayOnly,
      RTCPeerConnectionImpl,
      onSignal: (signal) => signaling.sendSignal(roomInfo.hostId, signal),
    });
    this.unsubscribeSignal = signaling.onEvent((message) => {
      if (message && message.type === 'room_signal' && message.payload &&
          message.payload.roomCode === roomInfo.roomCode &&
          message.payload.fromPeerId === roomInfo.hostId) {
        this.peer.handleSignal(message.payload.signal).catch((error) => {
          if (this.onError) this.onError(error);
        });
      } else if (message && message.type === 'room_closed' && message.payload &&
                 message.payload.roomCode === roomInfo.roomCode) {
        this.close(message.payload.reason || 'room_closed');
      }
    });
    this.ready = this.peer.transportReady.then((transport) => {
      const client = new MatchClientRuntime({ transport, playerId: roomInfo.peerId });
      client.connect({ mode: roomInfo.mode || 'private', phase: 'lobby' });
      this.runtime = client;
      return {
        onState: (listener) => client.onRoomState(listener),
        submit: (command) => client.submitRoomCommand(command),
        get errors() { return client.errors; },
        get closed() { return client.closed; },
      };
    });
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
    if (this.unsubscribeSignal) this.unsubscribeSignal();
    if (this.runtime && !this.runtime.closed) this.runtime.close(reason);
    this.peer.close(reason);
    this.signaling.close(reason);
  }
}
