import { createLobby } from './lobby.js';
import { LobbyClientRuntime, LobbyHostRuntime } from './lobbyRuntime.js';
import { createWebRTCPeer } from './webrtcPeer.js';

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
    mapId = 'random',
    teamSize = 2,
    iceServers = [],
    relayOnly = false,
    RTCPeerConnectionImpl = null,
    isVehicleAllowed = () => true,
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
    this.onError = onError;
    this.peers = new Map();
    this.lobby = createLobby({
      roomCode: roomInfo.roomCode,
      hostId: roomInfo.peerId,
      hostName,
      hostSpecId,
      hostEquipment,
      maxPlayers: roomInfo.maxPlayers || 14,
      mode: roomInfo.mode || 'private',
      mapId,
      teamSize,
    });
    this.runtime = new LobbyHostRuntime({
      lobby: this.lobby,
      isVehicleAllowed,
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
    if (this.peers.has(peerId)) return;
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
    this.runtime.attachPeer({
      peerId,
      transport,
      player: { name: player && player.name || 'Player' },
    });
  }

  command(command) {
    return this.runtime.command(this.roomInfo.peerId, command);
  }

  /** Release open remote channels for AuthoritativeMatchRuntime attachment. */
  takeMatchChannels() {
    return this.runtime.releaseTransports();
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
      this.runtime = new LobbyClientRuntime({ transport });
      return this.runtime;
    });
  }

  async submit(command) {
    const runtime = this.runtime || await this.ready;
    return runtime.submit(command);
  }

  async takeMatchTransport() {
    const runtime = this.runtime || await this.ready;
    return runtime.releaseTransport();
  }

  close(reason = 'client_closed') {
    if (this.unsubscribeSignal) this.unsubscribeSignal();
    if (this.runtime && !this.runtime.closed) this.runtime.close(reason);
    this.peer.close(reason);
    this.signaling.close(reason);
  }
}
