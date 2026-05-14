require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const { initDb, getDb } = require('./db');
const roomRoutes = require('./routes/rooms');
const uploadRoutes = require('./routes/upload');
const koofrRoutes = require('./routes/koofr');
const roomSync = require('./roomSync');

const app = express();
const server = http.createServer(app);

process.on('unhandledRejection', (err) => {
  console.error('[process] unhandled rejection:', err);
});
process.on('uncaughtException', (err) => {
  console.error('[process] uncaught exception:', err);
});

const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';

// CORS for development
app.use(cors({
  origin: NODE_ENV === 'production' ? false : ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true,
}));

app.use(express.json());

// Serve uploaded files
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
app.use('/uploads', express.static(UPLOAD_DIR));

// API routes
app.use('/api/rooms', roomRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/koofr', koofrRoutes);

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', ts: Date.now() }));

// Serve built React app in production
if (NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'public')));
  // SPA catch-all — serve index.html for any non-API/Socket route
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });
}

// Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: NODE_ENV === 'production' ? false : ['http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
  },
  path: '/socket.io',
});

function getRoomClients(roomId) {
  const room = roomSync.getActiveRooms().get(roomId);
  return room ? room.connectedUsers.size : 0;
}

io.on('connection', (socket) => {
  console.log(`[socket] connected: ${socket.id}`);

  let currentRoom = null;
  let currentNickname = null;

  socket.on('join-room', async ({ roomId, nickname }) => {
    if (!roomId || !nickname) {
      socket.emit('error', { message: 'roomId and nickname are required' });
      return;
    }

    // Sanitize nickname
    const safeNickname = sanitize(nickname).slice(0, 50);
    if (!safeNickname) {
      socket.emit('error', { message: 'Invalid nickname' });
      return;
    }

    const db = getDb();

    // Verify room exists
    const roomRes = await db.query('SELECT * FROM rooms WHERE id = $1', [roomId]);
    if (roomRes.rows.length === 0) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    const room = roomRes.rows[0];

    // Leave previous room if any
    if (currentRoom) {
      socket.leave(currentRoom);
      const prevRoom = roomSync.getActiveRooms().get(currentRoom);
      if (prevRoom) prevRoom.connectedUsers.delete(socket.id);
    }

    currentRoom = roomId;
    currentNickname = safeNickname;

    socket.join(roomId);

    // Register in in-memory sync service
    const roomSyncState = roomSync.initPlaybackStateFromDb(roomId, room);
    roomSyncState.connectedUsers.add(socket.id);
    if (!roomSyncState.heartbeatInterval) {
      roomSync.startRoomHeartbeat(io, roomId);
    }

    // Upsert participant
    await db.query(`
      INSERT INTO room_participants (room_id, nickname, is_host, last_seen)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (room_id, nickname) DO UPDATE SET last_seen = NOW()
    `, [roomId, safeNickname, room.host_nickname === safeNickname]);

    // Send full room state
    const queueRes = await db.query(
      'SELECT * FROM queue_items WHERE room_id = $1 ORDER BY position ASC',
      [roomId]
    );
    const usersRes = await db.query(
      'SELECT nickname, is_host FROM room_participants WHERE room_id = $1 ORDER BY last_seen DESC',
      [roomId]
    );

    const roomSyncForBroadcast = roomSync.getOrCreateActiveRoom(roomId);
    const broadcastState = roomSync.buildPlaybackBroadcast(roomSyncForBroadcast);
    const expectedPositionMs = broadcastState?.expectedPositionMs || 0;

    socket.emit('room-state', {
      room: {
        id: room.id,
        roomCode: room.room_code,
        name: room.name,
        hostNickname: room.host_nickname,
        playbackStatus: room.playback_status,
        playbackTimestamp: room.playback_timestamp,
        currentItemId: room.current_item_id,
        serverTime: Date.now(),
        expectedPositionMs,
      },
      queue: queueRes.rows.map(q => ({
        id: q.id,
        title: q.title,
        mediaType: q.media_type,
        url: q.url,
        filename: q.filename,
        format: q.format,
        duration: q.duration,
        addedBy: q.added_by,
        position: q.position,
      })),
      users: usersRes.rows.map(u => ({
        nickname: u.nickname,
        isHost: u.is_host,
      })),
      clientsCount: getRoomClients(roomId),
      playback: broadcastState,
    });

    // Broadcast join to room
    socket.to(roomId).emit('user-joined', {
      nickname: safeNickname,
      clientsCount: getRoomClients(roomId),
    });

    console.log(`[socket] ${safeNickname} joined room ${roomId} (${getRoomClients(roomId)} clients)`);
  });

  // Playback controls
  socket.on('play', async ({ itemId }) => {
    try {
      if (!currentRoom || !currentNickname) return;
      const db = getDb();
      const roomRes = await db.query('SELECT * FROM rooms WHERE id = $1', [currentRoom]);
      if (!roomRes.rows.length) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      const roomSyncState = roomSync.getOrCreateActiveRoom(currentRoom);
      let actualItemId = itemId || roomRes.rows[0].current_item_id;

      if (itemId) {
        const itemRes = await db.query(
          'SELECT id FROM queue_items WHERE id = $1 AND room_id = $2',
          [itemId, currentRoom]
        );
        if (!itemRes.rows.length) {
          socket.emit('error', { message: 'That item is no longer in the playlist' });
          return;
        }
        actualItemId = itemId;
      }

      roomSync.updatePlaybackState(roomSyncState, {
        roomId: currentRoom,
        currentTrackId: actualItemId,
        isPlaying: true,
        positionMsAtLastUpdate: 0,
        startedByUserId: currentNickname,
      });

      await db.query(
        'UPDATE rooms SET playback_status = $1, current_item_id = $2, playback_timestamp = $3, playback_updated_at = NOW(), last_command_id = $4 WHERE id = $5',
        ['playing', actualItemId, 0, roomSyncState.playbackState.lastCommandId, currentRoom]
      );

      roomSync.broadcastPlaybackState(io, currentRoom);
    } catch (err) {
      console.error('[socket] play failed:', err);
      socket.emit('error', { message: 'Playback failed; please try again.' });
    }
  });

  socket.on('pause', async () => {
    if (!currentRoom || !currentNickname) return;
    const db = getDb();
    const roomRes = await db.query('SELECT * FROM rooms WHERE id = $1', [currentRoom]);
    if (!roomRes.rows.length) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    const roomSyncState = roomSync.getOrCreateActiveRoom(currentRoom);
    const currentPosMs = roomSync.calculateExpectedPositionMs(roomSyncState.playbackState);

    roomSync.updatePlaybackState(roomSyncState, {
      isPlaying: false,
      positionMsAtLastUpdate: currentPosMs,
    });

    await db.query(
      'UPDATE rooms SET playback_status = $1, playback_timestamp = $2, playback_updated_at = NOW(), last_command_id = $3 WHERE id = $4',
      ['paused', currentPosMs / 1000, roomSyncState.playbackState.lastCommandId, currentRoom]
    );

    roomSync.broadcastPlaybackState(io, currentRoom);
  });

  socket.on('seek', async ({ timestamp }) => {
    if (!currentRoom || !currentNickname) return;
    const db = getDb();

    const roomSyncState = roomSync.getOrCreateActiveRoom(currentRoom);
    const isPlaying = roomSyncState.playbackState?.isPlaying || false;

    roomSync.updatePlaybackState(roomSyncState, {
      positionMsAtLastUpdate: timestamp * 1000,
      isPlaying,
    });

    await db.query(
      'UPDATE rooms SET playback_timestamp = $1, playback_updated_at = NOW(), last_command_id = $2 WHERE id = $3',
      [timestamp, roomSyncState.playbackState.lastCommandId, currentRoom]
    );

    roomSync.broadcastPlaybackState(io, currentRoom);
    io.to(currentRoom).emit('seek', { timestamp });
  });

  socket.on('next', async () => {
    if (!currentRoom || !currentNickname) return;
    const db = getDb();
    const roomRes = await db.query('SELECT * FROM rooms WHERE id = $1', [currentRoom]);
    if (!roomRes.rows.length) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    const roomSyncState = roomSync.getOrCreateActiveRoom(currentRoom);

    const queueRes = await db.query(
      'SELECT * FROM queue_items WHERE room_id = $1 ORDER BY position ASC',
      [currentRoom]
    );
    const queue = queueRes.rows;
    const currentIndex = queue.findIndex(q => q.id === roomRes.rows[0].current_item_id);
    const nextItem = queue[currentIndex >= 0 ? currentIndex + 1 : 0];

    if (!nextItem) {
      roomSync.updatePlaybackState(roomSyncState, {
        currentTrackId: null,
        isPlaying: false,
        positionMsAtLastUpdate: 0,
      });
      await db.query(
        'UPDATE rooms SET playback_status = $1, current_item_id = NULL, playback_timestamp = 0, playback_updated_at = NOW(), last_command_id = $2 WHERE id = $3',
        ['idle', roomSyncState.playbackState.lastCommandId, currentRoom]
      );
      roomSync.broadcastPlaybackState(io, currentRoom);
      return;
    }

    roomSync.updatePlaybackState(roomSyncState, {
      currentTrackId: nextItem.id,
      isPlaying: true,
      positionMsAtLastUpdate: 0,
    });

    await db.query(
      'UPDATE rooms SET current_item_id = $1, playback_status = $2, playback_timestamp = 0, playback_updated_at = NOW(), last_command_id = $3 WHERE id = $4',
      [nextItem.id, 'playing', roomSyncState.playbackState.lastCommandId, currentRoom]
    );

    roomSync.broadcastPlaybackState(io, currentRoom);
    io.to(currentRoom).emit('queue-updated', { queue: queue.map(q => ({
      id: q.id, title: q.title, mediaType: q.media_type, url: q.url,
      filename: q.filename, format: q.format, duration: q.duration,
      addedBy: q.added_by, position: q.position,
    }))});
  });

  socket.on('add-to-queue', async ({ item }) => {
    if (!currentRoom || !currentNickname) return;
    const db = getDb();

    const maxPosRes = await db.query(
      'SELECT COALESCE(MAX(position), 0) as maxpos FROM queue_items WHERE room_id = $1',
      [currentRoom]
    );
    const newPos = maxPosRes.rows[0].maxpos + 1;

    const insertRes = await db.query(
      `INSERT INTO queue_items (room_id, title, media_type, url, filename, format, duration, added_by, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        currentRoom,
        sanitize(item.title || item.filename || 'Unknown').slice(0, 500),
        item.mediaType,
        item.url,
        item.filename || null,
        item.format || null,
        item.duration || null,
        sanitize(currentNickname).slice(0, 50),
        newPos,
      ]
    );
    const newItem = insertRes.rows[0];

    // If nothing is playing, set as current and auto-start playback
    const roomRes = await db.query('SELECT * FROM rooms WHERE id = $1', [currentRoom]);
    const wasIdle = roomRes.rows[0].playback_status === 'idle' || !roomRes.rows[0].current_item_id;
    if (wasIdle) {
      const roomSyncState = roomSync.getOrCreateActiveRoom(currentRoom);
      roomSync.updatePlaybackState(roomSyncState, {
        roomId: currentRoom,
        currentTrackId: newItem.id,
        isPlaying: true,
        positionMsAtLastUpdate: 0,
        startedByUserId: currentNickname,
      });
      await db.query(
        'UPDATE rooms SET current_item_id = $1, playback_status = $2, playback_timestamp = 0, playback_updated_at = NOW(), last_command_id = $3 WHERE id = $4',
        [newItem.id, 'playing', roomSyncState.playbackState.lastCommandId, currentRoom]
      );
    }

    const queueRes = await db.query(
      'SELECT * FROM queue_items WHERE room_id = $1 ORDER BY position ASC',
      [currentRoom]
    );

    io.to(currentRoom).emit('queue-updated', {
      queue: queueRes.rows.map(q => ({
        id: q.id, title: q.title, mediaType: q.media_type, url: q.url,
        filename: q.filename, format: q.format, duration: q.duration,
        addedBy: q.added_by, position: q.position,
      }))
    });
    if (wasIdle) {
      roomSync.broadcastPlaybackState(io, currentRoom);
    }
    io.to(currentRoom).emit('activity', {
      message: `${currentNickname} added "${newItem.title}"`,
      ts: Date.now(),
    });
  });

  socket.on('remove-from-queue', async ({ itemId }) => {
    if (!currentRoom || !currentNickname) return;
    const db = getDb();

    // Check if user owns item or is host
    const itemRes = await db.query('SELECT * FROM queue_items WHERE id = $1 AND room_id = $2', [itemId, currentRoom]);
    if (!itemRes.rows.length) return;
    const item = itemRes.rows[0];

    const roomRes = await db.query('SELECT * FROM rooms WHERE id = $1', [currentRoom]);

    await db.query('DELETE FROM queue_items WHERE id = $1', [itemId]);
    await db.query(
      'UPDATE queue_items SET position = position - 1 WHERE room_id = $1 AND position > $2',
      [currentRoom, item.position]
    );

    const queueRes = await db.query(
      'SELECT * FROM queue_items WHERE room_id = $1 ORDER BY position ASC',
      [currentRoom]
    );

    if (roomRes.rows[0].current_item_id === itemId) {
      const replacement = queueRes.rows.find(q => q.position >= item.position) || queueRes.rows[queueRes.rows.length - 1];
      if (replacement) {
        const roomSyncState = roomSync.getOrCreateActiveRoom(currentRoom);
        roomSync.updatePlaybackState(roomSyncState, {
          currentTrackId: replacement.id,
          isPlaying: true,
          positionMsAtLastUpdate: 0,
        });
        await db.query(
          'UPDATE rooms SET current_item_id = $1, playback_status = $2, playback_timestamp = 0, playback_updated_at = NOW(), last_command_id = $3 WHERE id = $4',
          [replacement.id, 'playing', roomSyncState.playbackState.lastCommandId, currentRoom]
        );
        roomSync.broadcastPlaybackState(io, currentRoom);
      } else {
        const roomSyncState = roomSync.getOrCreateActiveRoom(currentRoom);
        roomSync.updatePlaybackState(roomSyncState, {
          currentTrackId: null,
          isPlaying: false,
          positionMsAtLastUpdate: 0,
        });
        await db.query(
          'UPDATE rooms SET current_item_id = NULL, playback_status = $1, playback_timestamp = 0, playback_updated_at = NOW(), last_command_id = $2 WHERE id = $3',
          ['idle', roomSyncState.playbackState.lastCommandId, currentRoom]
        );
        roomSync.broadcastPlaybackState(io, currentRoom);
      }
    }

    io.to(currentRoom).emit('queue-updated', {
      queue: queueRes.rows.map(q => ({
        id: q.id, title: q.title, mediaType: q.media_type, url: q.url,
        filename: q.filename, format: q.format, duration: q.duration,
        addedBy: q.added_by, position: q.position,
      }))
    });
    io.to(currentRoom).emit('activity', {
      message: `${currentNickname} removed "${item.title}"`,
      ts: Date.now(),
    });
  });

  socket.on('room-state-request', async () => {
    if (!currentRoom) return;
    const roomSyncState = roomSync.getOrCreateActiveRoom(currentRoom);
    roomSync.broadcastPlaybackState(io, currentRoom);
  });

  socket.on('reaction', async ({ emoji }) => {
    if (!currentRoom || !currentNickname) return;
    const safeEmoji = sanitize(emoji).slice(0, 8);
    if (!safeEmoji) return;
    io.to(currentRoom).emit('reaction', {
      nickname: currentNickname,
      emoji: safeEmoji,
      ts: Date.now(),
    });
  });

  socket.on('disconnect', async () => {
    console.log(`[socket] disconnected: ${socket.id}`);
    if (currentRoom && currentNickname) {
      const db = getDb();
      await db.query(
        'DELETE FROM room_participants WHERE room_id = $1 AND nickname = $2',
        [currentRoom, currentNickname]
      );
      const roomSyncState = roomSync.getActiveRooms().get(currentRoom);
      if (roomSyncState) {
        roomSyncState.connectedUsers.delete(socket.id);
        const count = roomSyncState.connectedUsers.size;
        io.to(currentRoom).emit('user-left', {
          nickname: currentNickname,
          clientsCount: count,
        });
        if (count === 0) {
          roomSync.stopRoomHeartbeat(currentRoom);
          roomSync.deleteActiveRoom(currentRoom);
        }
      }
    }
  });
});

// HTML sanitize utility
function sanitize(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>&"'`]/g, (c) => {
    const map = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
    return map[c] || c;
  });
}

// Inactivity cleanup — mark rooms updated on activity
setInterval(async () => {
  const db = getDb();
  await db.query('UPDATE rooms SET updated_at = NOW() WHERE id = ANY($1)', [
    Array.from(roomSync.getActiveRooms().keys()),
  ]);
}, 5 * 60 * 1000);

// Start
async function start() {
  await initDb();
  server.listen(PORT, () => {
    console.log(`MOD Room server running on port ${PORT} [${NODE_ENV}]`);
  });
}

start().catch(console.error);
