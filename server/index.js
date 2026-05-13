require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const { initDb, getDb } = require('./db');
const roomRoutes = require('./routes/rooms');
const uploadRoutes = require('./routes/upload');

const app = express();
const server = http.createServer(app);

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

// Track connected sockets per room
const roomSockets = new Map(); // roomId → Set of socket ids

function getRoomClients(roomId) {
  return (roomSockets.get(roomId) || new Set()).size;
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
      const prevSet = roomSockets.get(currentRoom);
      if (prevSet) prevSet.delete(socket.id);
    }

    currentRoom = roomId;
    currentNickname = safeNickname;

    socket.join(roomId);

    if (!roomSockets.has(roomId)) roomSockets.set(roomId, new Set());
    roomSockets.get(roomId).add(socket.id);

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

    socket.emit('room-state', {
      room: {
        id: room.id,
        roomCode: room.room_code,
        name: room.name,
        hostNickname: room.host_nickname,
        playbackStatus: room.playback_status,
        playbackTimestamp: room.playback_timestamp,
        currentItemId: room.current_item_id,
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
    });

    // Broadcast join to room
    socket.to(roomId).emit('user-joined', {
      nickname: safeNickname,
      clientsCount: getRoomClients(roomId),
    });

    console.log(`[socket] ${safeNickname} joined room ${roomId} (${getRoomClients(roomId)} clients)`);
  });

  // Host controls
  socket.on('play', async ({ itemId }) => {
    if (!currentRoom || !currentNickname) return;
    const db = getDb();
    const roomRes = await db.query('SELECT * FROM rooms WHERE id = $1', [currentRoom]);
    if (!roomRes.rows.length || roomRes.rows[0].host_nickname !== currentNickname) {
      socket.emit('error', { message: 'Only the host can control playback' });
      return;
    }
    const updateCols = ['playback_status = $1', 'playback_updated_at = NOW()'];
    const updateVals = ['playing', currentRoom];
    if (itemId) {
      updateCols.push(`current_item_id = $${updateVals.length + 1}`);
      updateVals.push(itemId);
    }
    await db.query(
      `UPDATE rooms SET ${updateCols.join(', ')} WHERE id = $${updateVals.length}`,
      updateVals
    );
    io.to(currentRoom).emit('playback-update', { itemId: itemId || roomRes.rows[0].current_item_id, status: 'playing', timestamp: 0 });
  });

  socket.on('pause', async () => {
    if (!currentRoom || !currentNickname) return;
    const db = getDb();
    const roomRes = await db.query('SELECT * FROM rooms WHERE id = $1', [currentRoom]);
    if (!roomRes.rows.length || roomRes.rows[0].host_nickname !== currentNickname) {
      socket.emit('error', { message: 'Only the host can control playback' });
      return;
    }
    await db.query(
      'UPDATE rooms SET playback_status = $1, playback_updated_at = NOW() WHERE id = $2',
      ['paused', currentRoom]
    );
    io.to(currentRoom).emit('playback-update', { status: 'paused', timestamp: Date.now() });
  });

  socket.on('seek', async ({ timestamp }) => {
    if (!currentRoom || !currentNickname) return;
    const db = getDb();
    await db.query(
      'UPDATE rooms SET playback_timestamp = $1, playback_updated_at = NOW() WHERE id = $2',
      [timestamp, currentRoom]
    );
    io.to(currentRoom).emit('seek', { timestamp });
  });

  socket.on('next', async () => {
    if (!currentRoom || !currentNickname) return;
    const db = getDb();
    const roomRes = await db.query('SELECT * FROM rooms WHERE id = $1', [currentRoom]);
    if (!roomRes.rows.length || roomRes.rows[0].host_nickname !== currentNickname) {
      socket.emit('error', { message: 'Only the host can skip' });
      return;
    }

    // Get next item
    const queueRes = await db.query(
      'SELECT * FROM queue_items WHERE room_id = $1 ORDER BY position ASC LIMIT 2',
      [currentRoom]
    );
    if (queueRes.rows.length < 2) {
      // End of queue
      await db.query(
        'UPDATE rooms SET playback_status = $1, current_item_id = NULL, playback_timestamp = 0 WHERE id = $2',
        ['idle', currentRoom]
      );
      io.to(currentRoom).emit('playback-update', { status: 'idle', itemId: null });
      return;
    }

    const nextItem = queueRes.rows[1];
    await db.query(
      'UPDATE rooms SET current_item_id = $1, playback_status = $2, playback_timestamp = 0, playback_updated_at = NOW() WHERE id = $3',
      [nextItem.id, 'playing', currentRoom]
    );
    // Remove played item
    await db.query('DELETE FROM queue_items WHERE id = $1', [queueRes.rows[0].id]);
    // Reorder remaining
    await db.query(
      'UPDATE queue_items SET position = position - 1 WHERE room_id = $1 AND position > 1',
      [currentRoom]
    );
    const newQueue = await db.query(
      'SELECT * FROM queue_items WHERE room_id = $1 ORDER BY position ASC',
      [currentRoom]
    );
    io.to(currentRoom).emit('playback-update', { itemId: nextItem.id, status: 'playing', timestamp: 0 });
    io.to(currentRoom).emit('queue-updated', { queue: newQueue.rows.map(q => ({
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
      await db.query(
        'UPDATE rooms SET current_item_id = $1, playback_status = $2 WHERE id = $3',
        [newItem.id, 'playing', currentRoom]
      );
      io.to(currentRoom).emit('playback-update', { itemId: newItem.id, status: 'playing', timestamp: 0 });
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
    const isHost = roomRes.rows[0].host_nickname === currentNickname;

    if (item.added_by !== currentNickname && !isHost) {
      socket.emit('error', { message: 'You can only remove your own items' });
      return;
    }

    await db.query('DELETE FROM queue_items WHERE id = $1', [itemId]);
    await db.query(
      'UPDATE queue_items SET position = position - 1 WHERE room_id = $1 AND position > $2',
      [currentRoom, item.position]
    );

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
    io.to(currentRoom).emit('activity', {
      message: `${currentNickname} removed "${item.title}"`,
      ts: Date.now(),
    });
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
      const set = roomSockets.get(currentRoom);
      if (set) {
        set.delete(socket.id);
        const count = set.size;
        io.to(currentRoom).emit('user-left', {
          nickname: currentNickname,
          clientsCount: count,
        });
        if (count === 0) {
          // Mark room as inactive — cleaner participants list
          roomSockets.delete(currentRoom);
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
    Array.from(roomSockets.keys()),
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
