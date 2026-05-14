// Room sync service — lightweight in-memory authoritative playback state
// per Kevin's spec: server calculates expected position; clients sync from it.

const activeRooms = new Map(); // roomId → { playbackState, connectedUsers, heartbeatInterval }

let commandSeq = 0;
function generateCommandId() {
  return `cmd-${Date.now()}-${++commandSeq}`;
}

function getOrCreateActiveRoom(roomId) {
  if (!activeRooms.has(roomId)) {
    activeRooms.set(roomId, {
      playbackState: null,
      connectedUsers: new Set(),
      socketNicknames: new Map(),
      heartbeatInterval: null,
    });
  }
  return activeRooms.get(roomId);
}

function deleteActiveRoom(roomId) {
  const room = activeRooms.get(roomId);
  if (room) {
    if (room.heartbeatInterval) {
      clearInterval(room.heartbeatInterval);
      room.heartbeatInterval = null;
    }
    activeRooms.delete(roomId);
  }
}

function getActiveRooms() {
  return activeRooms;
}

function getRoomClients(roomId) {
  const room = activeRooms.get(roomId);
  return room ? room.connectedUsers.size : 0;
}

function calculateExpectedPositionMs(state) {
  if (!state || !state.isPlaying) return state?.positionMsAtLastUpdate || 0;
  const elapsedMs = Date.now() - state.serverUpdatedAt;
  return state.positionMsAtLastUpdate + elapsedMs;
}

function buildPlaybackBroadcast(roomSync) {
  if (!roomSync || !roomSync.playbackState) return null;
  const state = roomSync.playbackState;
  const expectedPositionMs = calculateExpectedPositionMs(state);
  return {
    // New authoritative structure
    roomId: state.roomId,
    currentTrackId: state.currentTrackId,
    isPlaying: state.isPlaying,
    positionMsAtLastUpdate: state.positionMsAtLastUpdate,
    serverUpdatedAt: state.serverUpdatedAt,
    lastCommandId: state.lastCommandId,
    startedByUserId: state.startedByUserId,
    // Calculated fields for clients
    expectedPositionMs,
    serverTime: Date.now(),
    // Backward-compat fields (seconds-based for existing client sync)
    itemId: state.currentTrackId,
    status: state.isPlaying ? 'playing' : (state.currentTrackId ? 'paused' : 'idle'),
    timestamp: expectedPositionMs / 1000,
  };
}

function broadcastPlaybackState(io, roomId) {
  const roomSync = activeRooms.get(roomId);
  const broadcast = buildPlaybackBroadcast(roomSync);
  if (!broadcast) return;
  io.to(roomId).emit('playback-update', broadcast);
}

function startRoomHeartbeat(io, roomId) {
  const roomSync = activeRooms.get(roomId);
  if (!roomSync) return;
  if (roomSync.heartbeatInterval) clearInterval(roomSync.heartbeatInterval);

  roomSync.heartbeatInterval = setInterval(() => {
    if (roomSync.connectedUsers.size === 0) {
      clearInterval(roomSync.heartbeatInterval);
      roomSync.heartbeatInterval = null;
      activeRooms.delete(roomId);
      return;
    }
    broadcastPlaybackState(io, roomId);
  }, 5000);
}

function stopRoomHeartbeat(roomId) {
  const roomSync = activeRooms.get(roomId);
  if (roomSync && roomSync.heartbeatInterval) {
    clearInterval(roomSync.heartbeatInterval);
    roomSync.heartbeatInterval = null;
  }
}

function initPlaybackStateFromDb(roomId, dbRoom) {
  const roomSync = getOrCreateActiveRoom(roomId);
  if (!roomSync.playbackState && dbRoom.current_item_id) {
    roomSync.playbackState = {
      roomId,
      currentTrackId: dbRoom.current_item_id,
      isPlaying: dbRoom.playback_status === 'playing',
      positionMsAtLastUpdate: (dbRoom.playback_timestamp || 0) * 1000,
      serverUpdatedAt: new Date(dbRoom.playback_updated_at).getTime(),
      lastCommandId: dbRoom.last_command_id || null,
    };
  }
  return roomSync;
}

function updatePlaybackState(roomSync, updates) {
  if (!roomSync) return null;
  const now = Date.now();
  const commandId = generateCommandId();
  if (!roomSync.playbackState) {
    roomSync.playbackState = { positionMsAtLastUpdate: 0, serverUpdatedAt: now };
  }
  roomSync.playbackState = {
    ...roomSync.playbackState,
    ...updates,
    serverUpdatedAt: now,
    lastCommandId: commandId,
  };
  return roomSync.playbackState;
}

module.exports = {
  getOrCreateActiveRoom,
  deleteActiveRoom,
  getActiveRooms,
  getRoomClients,
  calculateExpectedPositionMs,
  buildPlaybackBroadcast,
  broadcastPlaybackState,
  startRoomHeartbeat,
  stopRoomHeartbeat,
  initPlaybackStateFromDb,
  updatePlaybackState,
};
