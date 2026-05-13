const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');

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

// Get room
router.get('/:roomId', async (req, res) => {
  const { roomId } = req.params;
  const db = getDb();

  if (!db) return res.status(503).json({ error: 'Database not configured' });

  const roomRes = await db.query('SELECT * FROM rooms WHERE id = $1', [roomId]);
  if (!roomRes.rows.length) return res.status(404).json({ error: 'Room not found' });

  const room = roomRes.rows[0];
  const queueRes = await db.query(
    'SELECT * FROM queue_items WHERE room_id = $1 ORDER BY position ASC',
    [roomId]
  );
  const usersRes = await db.query(
    'SELECT nickname, is_host FROM room_participants WHERE room_id = $1 ORDER BY last_seen DESC',
    [roomId]
  );

  res.json({
    id: room.id,
    roomCode: room.room_code,
    name: room.name,
    hostNickname: room.host_nickname,
    playbackStatus: room.playback_status,
    playbackTimestamp: room.playback_timestamp,
    currentItemId: room.current_item_id,
    queue: queueRes.rows.map(q => ({
      id: q.id, title: q.title, mediaType: q.media_type, url: q.url,
      filename: q.filename, format: q.format, duration: q.duration,
      addedBy: q.added_by, position: q.position,
    })),
    users: usersRes.rows.map(u => ({ nickname: u.nickname, isHost: u.is_host })),
  });
});

// Join room
router.post('/:roomId/join', async (req, res) => {
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
});

// Delete room (host only — must provide correct nickname)
router.delete('/:roomId', async (req, res) => {
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
});

// Get sync state
router.get('/:roomId/sync', async (req, res) => {
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
});

module.exports = router;
