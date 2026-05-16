const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const roomSync = require('../roomSync');

// Validate UUID format — return 400 if invalid
function validateUUID(str, res) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!str || !uuidRegex.test(str)) {
    res.status(400).json({ error: 'Invalid room ID format' });
    return false;
  }
  return true;
}

// Generate a human-readable room code like "VAULT-3921"
// Note: room_code column is VARCHAR(10), so words must be <= 5 chars
function generateRoomCode() {
  const words = ['VAULT', 'CHILL', 'DEN-5', 'DEN-8', 'FOYER', 'STACK'];
  const word = words[Math.floor(Math.random() * words.length)];
  const num = Math.floor(1000 + Math.random() * 9000);
  return `${word}-${num}`;
}

// Sanitize
function sanitize(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>&"'`]/g, (c) => {
    const map = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
    return map[c] || c;
  });
}

// Create room
router.post('/', async (req, res) => {
  try {
    const db = getDb();
    const { nickname } = req.body;

    if (!nickname || typeof nickname !== 'string' || nickname.trim().length === 0) {
      return res.status(400).json({ error: 'nickname is required' });
    }

    const safeNickname = sanitize(nickname.trim()).slice(0, 50);
    if (!safeNickname) return res.status(400).json({ error: 'Invalid nickname' });

    let roomCode;
    let attempts = 0;

    // Find unique code
    do {
      roomCode = generateRoomCode();
      const existing = db ? await db.query('SELECT id FROM rooms WHERE room_code = $1', [roomCode]) : { rows: [] };
      if (existing.rows.length === 0) break;
      attempts++;
    } while (attempts < 10);

    if (!db) {
      const id = uuidv4();
      return res.json({ roomId: id, roomCode, nickname: safeNickname });
    }

    const result = await db.query(
      `INSERT INTO rooms (room_code, host_nickname, name)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [roomCode, safeNickname, `${safeNickname}'s Room`]
    );

    const room = result.rows[0];
    res.json({ roomId: room.id, roomCode: room.room_code, nickname: safeNickname });
  } catch (err) {
    console.error('[/rooms POST error]', err.message);
    res.status(500).json({ error: 'Failed to create room', detail: err.message });
  }
});

// Lookup room by room code (e.g. "FOYER-5643")
router.get('/code/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const db = getDb();
    if (!db) return res.status(503).json({ error: 'Database not configured' });
    // room_code is VARCHAR(10), alphanumeric + hyphen
    if (!code || !/^[A-Z0-9][A-Z0-9-]{0,9}$/.test(code)) {
      return res.status(400).json({ error: 'Invalid room code format' });
    }
    const roomRes = await db.query('SELECT id FROM rooms WHERE room_code = $1', [code.toUpperCase()]);
    if (!roomRes.rows.length) return res.status(404).json({ error: 'Room not found' });
    res.json({ id: roomRes.rows[0].id });
  } catch (err) {
    console.error('[/rooms/code/:code GET error]', err.message);
    res.status(500).json({ error: 'Failed to lookup room', detail: err.message });
  }
});

// Get room snapshot. Accept either canonical UUID or human room code.
router.get('/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;
    const db = getDb();

    if (!db) return res.status(503).json({ error: 'Database not configured' });

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const roomRes = uuidRegex.test(roomId)
      ? await db.query('SELECT * FROM rooms WHERE id = $1', [roomId])
      : await db.query('SELECT * FROM rooms WHERE room_code = $1', [roomId.toUpperCase()]);
    if (!roomRes.rows.length) return res.status(404).json({ error: 'Room not found' });

    const room = roomRes.rows[0];
    const canonicalRoomId = room.id;
    const queueRes = await db.query(
      'SELECT * FROM queue_items WHERE room_id = $1 ORDER BY position ASC',
      [canonicalRoomId]
    );
    const usersRes = await db.query(
      'SELECT nickname, is_host FROM room_participants WHERE room_id = $1 ORDER BY last_seen DESC',
      [canonicalRoomId]
    );

    res.json({
      id: room.id,
      roomCode: room.room_code,
      name: room.name,
      hostNickname: room.host_nickname,
      playbackStatus: room.playback_status,
      playbackTimestamp: room.playback_timestamp,
      currentItemId: room.current_item_id,
      visualizerId: room.visualizer_id || 'spectrum',
      queue: queueRes.rows.map(q => ({ 
        id: q.id, title: q.title, mediaType: q.media_type, url: q.url,
        filename: q.filename, format: q.format, duration: q.duration,
        addedBy: q.added_by, position: q.position,
      })),
      users: usersRes.rows.map(u => ({ nickname: u.nickname, isHost: u.is_host })),
    });
  } catch (err) {
    console.error('[/rooms/:roomId GET error]', err.message);
    res.status(500).json({ error: 'Failed to get room', detail: err.message });
  }
});


// Add item to queue via HTTP fallback. This keeps Library Add working even if
// Socket.IO/WebSocket is unreliable in the browser. The server still broadcasts
// the updated queue over Socket.IO for any connected clients.
router.post('/:roomId/queue', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { item, nickname } = req.body || {};
    const db = getDb();

    if (!db) return res.status(503).json({ error: 'Database not configured' });
    if (!item || typeof item !== 'object') return res.status(400).json({ error: 'item is required' });
    if (!nickname || typeof nickname !== 'string') return res.status(400).json({ error: 'nickname is required' });

    const safeNickname = sanitize(nickname.trim()).slice(0, 50);
    if (!safeNickname) return res.status(400).json({ error: 'Invalid nickname' });

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const roomRes = uuidRegex.test(roomId)
      ? await db.query('SELECT * FROM rooms WHERE id = $1', [roomId])
      : await db.query('SELECT * FROM rooms WHERE room_code = $1', [roomId.toUpperCase()]);
    if (!roomRes.rows.length) return res.status(404).json({ error: 'Room not found' });

    const room = roomRes.rows[0];
    const canonicalRoomId = room.id;

    await db.query(`
      INSERT INTO room_participants (room_id, nickname, is_host, last_seen)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (room_id, nickname) DO UPDATE SET last_seen = NOW()
    `, [canonicalRoomId, safeNickname, room.host_nickname === safeNickname]);

    const maxPosRes = await db.query(
      'SELECT COALESCE(MAX(position), 0) as maxpos FROM queue_items WHERE room_id = $1',
      [canonicalRoomId]
    );
    const newPos = maxPosRes.rows[0].maxpos + 1;

    const insertRes = await db.query(
      `INSERT INTO queue_items (room_id, title, media_type, url, filename, format, duration, added_by, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        canonicalRoomId,
        sanitize(item.title || item.filename || 'Unknown').slice(0, 500),
        item.mediaType,
        item.url,
        item.filename || null,
        item.format || null,
        item.duration || null,
        safeNickname,
        newPos,
      ]
    );
    const newItem = insertRes.rows[0];

    const wasIdle = room.playback_status === 'idle' || !room.current_item_id;
    if (wasIdle) {
      const roomSyncState = roomSync.getOrCreateActiveRoom(canonicalRoomId);
      roomSync.updatePlaybackState(roomSyncState, {
        roomId: canonicalRoomId,
        currentTrackId: newItem.id,
        isPlaying: true,
        positionMsAtLastUpdate: 0,
        startedByUserId: safeNickname,
      });
      await db.query(
        'UPDATE rooms SET current_item_id = $1, playback_status = $2, playback_timestamp = 0, playback_updated_at = NOW(), last_command_id = $3 WHERE id = $4',
        [newItem.id, 'playing', roomSyncState.playbackState.lastCommandId, canonicalRoomId]
      );
    }

    const queueRes = await db.query(
      'SELECT * FROM queue_items WHERE room_id = $1 ORDER BY position ASC',
      [canonicalRoomId]
    );
    const queue = queueRes.rows.map(q => ({
      id: q.id, title: q.title, mediaType: q.media_type, url: q.url,
      filename: q.filename, format: q.format, duration: q.duration,
      addedBy: q.added_by, position: q.position,
    }));

    const io = req.app.locals.io;
    if (io) {
      io.to(canonicalRoomId).emit('queue-updated', { queue });
      if (wasIdle) roomSync.broadcastPlaybackState(io, canonicalRoomId);
      io.to(canonicalRoomId).emit('activity', {
        message: `${safeNickname} added "${newItem.title}"`,
        ts: Date.now(),
      });
    }

    const updatedRoomRes = await db.query(
      'SELECT current_item_id, playback_status FROM rooms WHERE id = $1',
      [canonicalRoomId]
    );
    const updatedRoom = updatedRoomRes.rows[0] || {};

    res.json({
      ok: true,
      itemId: newItem.id,
      currentItemId: updatedRoom.current_item_id || newItem.id,
      playbackStatus: updatedRoom.playback_status || (wasIdle ? 'playing' : room.playback_status),
      queue,
    });
  } catch (err) {
    console.error('[/rooms/:roomId/queue POST error]', err.message);
    res.status(500).json({ error: 'Failed to add item', detail: err.message });
  }
});

// Join room
router.post('/:roomId/join', async (req, res) => {
  try {
    if (!validateUUID(req.params.roomId, res)) return;
    const { roomId } = req.params;
    const { nickname } = req.body;
    const db = getDb();

    if (!nickname || typeof nickname !== 'string') {
      return res.status(400).json({ error: 'nickname is required' });
    }

    const safeNickname = sanitize(nickname.trim()).slice(0, 50);
    if (!safeNickname) return res.status(400).json({ error: 'Invalid nickname' });

    if (!db) return res.json({ roomId, nickname: safeNickname });

    const roomRes = await db.query('SELECT * FROM rooms WHERE id = $1', [roomId]);
    if (!roomRes.rows.length) return res.status(404).json({ error: 'Room not found' });

    await db.query(`
      INSERT INTO room_participants (room_id, nickname, is_host, last_seen)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (room_id, nickname) DO UPDATE SET last_seen = NOW()
    `, [roomId, safeNickname, roomRes.rows[0].host_nickname === safeNickname]);

    res.json({ roomId, nickname: safeNickname });
  } catch (err) {
    console.error('[/rooms/:roomId/join POST error]', err.message);
    res.status(500).json({ error: 'Failed to join room', detail: err.message });
  }
});



function mapQueueRows(rows) {
  return rows.map(q => ({
    id: q.id, title: q.title, mediaType: q.media_type, url: q.url,
    filename: q.filename, format: q.format, duration: q.duration,
    addedBy: q.added_by, position: q.position,
  }));
}

async function resolveRoom(db, roomId) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const roomRes = uuidRegex.test(roomId)
    ? await db.query('SELECT * FROM rooms WHERE id = $1', [roomId])
    : await db.query('SELECT * FROM rooms WHERE room_code = $1', [roomId.toUpperCase()]);
  return roomRes.rows[0] || null;
}

async function roomQueue(db, roomId) {
  const queueRes = await db.query(
    'SELECT * FROM queue_items WHERE room_id = $1 ORDER BY position ASC',
    [roomId]
  );
  return mapQueueRows(queueRes.rows);
}

function broadcastRoomPlayback(req, roomId, queue) {
  const io = req.app.locals.io;
  if (!io) return;
  io.to(roomId).emit('queue-updated', { queue });
  roomSync.broadcastPlaybackState(io, roomId);
}

// Play/resume a queue item via HTTP. Used as the reliable control path; Socket.IO
// still receives broadcasts for synced clients.
router.post('/:roomId/play', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { itemId } = req.body || {};
    const db = getDb();
    if (!db) return res.status(503).json({ error: 'Database not configured' });

    const room = await resolveRoom(db, roomId);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    const canonicalRoomId = room.id;
    const actualItemId = itemId || room.current_item_id;
    if (!actualItemId) return res.status(400).json({ error: 'No item selected' });

    const itemRes = await db.query('SELECT id FROM queue_items WHERE id = $1 AND room_id = $2', [actualItemId, canonicalRoomId]);
    if (!itemRes.rows.length) return res.status(404).json({ error: 'Queue item not found' });

    const startMs = actualItemId === room.current_item_id ? (room.playback_timestamp || 0) * 1000 : 0;
    const roomSyncState = roomSync.getOrCreateActiveRoom(canonicalRoomId);
    roomSync.updatePlaybackState(roomSyncState, {
      roomId: canonicalRoomId,
      currentTrackId: actualItemId,
      isPlaying: true,
      positionMsAtLastUpdate: startMs,
    });
    await db.query(
      'UPDATE rooms SET current_item_id = $1, playback_status = $2, playback_timestamp = $3, playback_updated_at = NOW(), last_command_id = $4 WHERE id = $5',
      [actualItemId, 'playing', startMs / 1000, roomSyncState.playbackState.lastCommandId, canonicalRoomId]
    );

    const queue = await roomQueue(db, canonicalRoomId);
    broadcastRoomPlayback(req, canonicalRoomId, queue);
    res.json({ ok: true, queue, currentItemId: actualItemId, playbackStatus: 'playing', timestamp: startMs / 1000 });
  } catch (err) {
    console.error('[/rooms/:roomId/play POST error]', err.message);
    res.status(500).json({ error: 'Failed to play item', detail: err.message });
  }
});

router.post('/:roomId/pause', async (req, res) => {
  try {
    const { roomId } = req.params;
    const db = getDb();
    if (!db) return res.status(503).json({ error: 'Database not configured' });

    const room = await resolveRoom(db, roomId);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    const canonicalRoomId = room.id;
    const roomSyncState = roomSync.getOrCreateActiveRoom(canonicalRoomId);
    if (!roomSyncState.playbackState) roomSync.initPlaybackStateFromDb(canonicalRoomId, room);
    const currentPosMs = roomSync.calculateExpectedPositionMs(roomSyncState.playbackState || {
      isPlaying: room.playback_status === 'playing',
      positionMsAtLastUpdate: (room.playback_timestamp || 0) * 1000,
      serverUpdatedAt: new Date(room.playback_updated_at || Date.now()).getTime(),
    });

    roomSync.updatePlaybackState(roomSyncState, {
      roomId: canonicalRoomId,
      currentTrackId: room.current_item_id,
      isPlaying: false,
      positionMsAtLastUpdate: currentPosMs,
    });
    await db.query(
      'UPDATE rooms SET playback_status = $1, playback_timestamp = $2, playback_updated_at = NOW(), last_command_id = $3 WHERE id = $4',
      ['paused', currentPosMs / 1000, roomSyncState.playbackState.lastCommandId, canonicalRoomId]
    );

    const queue = await roomQueue(db, canonicalRoomId);
    broadcastRoomPlayback(req, canonicalRoomId, queue);
    res.json({ ok: true, queue, currentItemId: room.current_item_id, playbackStatus: 'paused', timestamp: currentPosMs / 1000 });
  } catch (err) {
    console.error('[/rooms/:roomId/pause POST error]', err.message);
    res.status(500).json({ error: 'Failed to pause playback', detail: err.message });
  }
});

router.post('/:roomId/stop', async (req, res) => {
  try {
    const { roomId } = req.params;
    const db = getDb();
    if (!db) return res.status(503).json({ error: 'Database not configured' });

    const room = await resolveRoom(db, roomId);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    const canonicalRoomId = room.id;
    const roomSyncState = roomSync.getOrCreateActiveRoom(canonicalRoomId);
    roomSync.updatePlaybackState(roomSyncState, {
      roomId: canonicalRoomId,
      currentTrackId: room.current_item_id,
      isPlaying: false,
      positionMsAtLastUpdate: 0,
    });
    await db.query(
      'UPDATE rooms SET playback_status = $1, playback_timestamp = 0, playback_updated_at = NOW(), last_command_id = $2 WHERE id = $3',
      ['paused', roomSyncState.playbackState.lastCommandId, canonicalRoomId]
    );

    const queue = await roomQueue(db, canonicalRoomId);
    broadcastRoomPlayback(req, canonicalRoomId, queue);
    res.json({ ok: true, queue, currentItemId: room.current_item_id, playbackStatus: 'paused', timestamp: 0 });
  } catch (err) {
    console.error('[/rooms/:roomId/stop POST error]', err.message);
    res.status(500).json({ error: 'Failed to stop playback', detail: err.message });
  }
});

// Advance to next queue item via HTTP. Socket.IO still broadcasts the update,
// but this keeps the button reliable even if this browser's socket is stale.
router.post('/:roomId/next', async (req, res) => {
  try {
    const { roomId } = req.params;
    const db = getDb();
    if (!db) return res.status(503).json({ error: 'Database not configured' });

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const roomRes = uuidRegex.test(roomId)
      ? await db.query('SELECT * FROM rooms WHERE id = $1', [roomId])
      : await db.query('SELECT * FROM rooms WHERE room_code = $1', [roomId.toUpperCase()]);
    if (!roomRes.rows.length) return res.status(404).json({ error: 'Room not found' });

    const room = roomRes.rows[0];
    const canonicalRoomId = room.id;
    const roomSyncState = roomSync.getOrCreateActiveRoom(canonicalRoomId);

    const queueRes = await db.query(
      'SELECT * FROM queue_items WHERE room_id = $1 ORDER BY position ASC',
      [canonicalRoomId]
    );
    const queueRows = queueRes.rows;
    const currentIndex = queueRows.findIndex(q => q.id === room.current_item_id);
    const nextItem = queueRows[currentIndex >= 0 ? currentIndex + 1 : 0];

    let playbackStatus = 'idle';
    let currentItemId = null;
    if (nextItem) {
      currentItemId = nextItem.id;
      playbackStatus = 'playing';
      roomSync.updatePlaybackState(roomSyncState, {
        roomId: canonicalRoomId,
        currentTrackId: currentItemId,
        isPlaying: true,
        positionMsAtLastUpdate: 0,
      });
      await db.query(
        'UPDATE rooms SET current_item_id = $1, playback_status = $2, playback_timestamp = 0, playback_updated_at = NOW(), last_command_id = $3 WHERE id = $4',
        [currentItemId, playbackStatus, roomSyncState.playbackState.lastCommandId, canonicalRoomId]
      );
    } else {
      roomSync.updatePlaybackState(roomSyncState, {
        currentTrackId: null,
        isPlaying: false,
        positionMsAtLastUpdate: 0,
      });
      await db.query(
        'UPDATE rooms SET current_item_id = NULL, playback_status = $1, playback_timestamp = 0, playback_updated_at = NOW(), last_command_id = $2 WHERE id = $3',
        [playbackStatus, roomSyncState.playbackState.lastCommandId, canonicalRoomId]
      );
    }

    const queue = queueRows.map(q => ({
      id: q.id, title: q.title, mediaType: q.media_type, url: q.url,
      filename: q.filename, format: q.format, duration: q.duration,
      addedBy: q.added_by, position: q.position,
    }));

    const io = req.app.locals.io;
    if (io) {
      io.to(canonicalRoomId).emit('queue-updated', { queue });
      roomSync.broadcastPlaybackState(io, canonicalRoomId);
    }

    res.json({ ok: true, queue, currentItemId, playbackStatus });
  } catch (err) {
    console.error('[/rooms/:roomId/next POST error]', err.message);
    res.status(500).json({ error: 'Failed to advance queue', detail: err.message });
  }
});

// Delete room (host only — must provide correct nickname)
router.delete('/:roomId', async (req, res) => {
  try {
    if (!validateUUID(req.params.roomId, res)) return;
    const { roomId } = req.params;
    const { nickname } = req.body;
    const db = getDb();

    if (!db) return res.status(503).json({ error: 'Database not configured' });

    const roomRes = await db.query('SELECT * FROM rooms WHERE id = $1', [roomId]);
    if (!roomRes.rows.length) return res.status(404).json({ error: 'Room not found' });
    if (roomRes.rows[0].host_nickname !== sanitize(nickname).slice(0, 50)) {
      return res.status(403).json({ error: 'Only the host can delete the room' });
    }

    await db.query('DELETE FROM rooms WHERE id = $1', [roomId]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[/rooms/:roomId DELETE error]', err.message);
    res.status(500).json({ error: 'Failed to delete room', detail: err.message });
  }
});

// Get sync state
router.get('/:roomId/sync', async (req, res) => {
  try {
    if (!validateUUID(req.params.roomId, res)) return;
    const { roomId } = req.params;
    const db = getDb();

    if (!db) return res.status(503).json({ error: 'Database not configured' });

    const roomRes = await db.query('SELECT * FROM rooms WHERE id = $1', [roomId]);
    if (!roomRes.rows.length) return res.status(404).json({ error: 'Room not found' });

    const room = roomRes.rows[0];
    res.json({
      currentItemId: room.current_item_id,
      status: room.playback_status,
      timestamp: room.playback_timestamp,
      updatedAt: room.playback_updated_at,
    });
  } catch (err) {
    console.error('[/rooms/:roomId/sync GET error]', err.message);
    res.status(500).json({ error: 'Failed to get sync state', detail: err.message });
  }
});

module.exports = router;
