const { Pool } = require('pg');

let pool = null;

async function initDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.warn('[db] DATABASE_URL not set — running without database. Rooms will not persist.');
    return;
  }

  pool = new Pool({ connectionString, max: 10 });

  // Test connection
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    console.log('[db] PostgreSQL connected');
  } finally {
    client.release();
  }

  // Run migrations
  await runMigrations();
}

async function runMigrations() {
  const db = getDb();
  if (!db) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS rooms (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      room_code VARCHAR(10) UNIQUE NOT NULL,
      name VARCHAR(100),
      current_item_id UUID,
      playback_status VARCHAR(20) DEFAULT 'idle',
      playback_timestamp DOUBLE PRECISION DEFAULT 0,
      playback_updated_at TIMESTAMPTZ DEFAULT NOW(),
      host_nickname VARCHAR(50) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS queue_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
      title VARCHAR(500) NOT NULL,
      media_type VARCHAR(20) NOT NULL,
      url TEXT NOT NULL,
      filename VARCHAR(255),
      format VARCHAR(20),
      duration DOUBLE PRECISION,
      added_by VARCHAR(50) NOT NULL,
      position INTEGER NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS room_participants (
      room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
      nickname VARCHAR(50) NOT NULL,
      is_host BOOLEAN DEFAULT FALSE,
      last_seen TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (room_id, nickname)
    );
  `);

  await db.query(`CREATE INDEX IF NOT EXISTS idx_queue_items_room_id ON queue_items(room_id);`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_room_participants_room_id ON room_participants(room_id);`);
  await db.query(`ALTER TABLE rooms ADD COLUMN IF NOT EXISTS last_command_id VARCHAR(64);`);
  await db.query(`ALTER TABLE rooms ADD COLUMN IF NOT EXISTS visualizer_id VARCHAR(40) DEFAULT 'spectrum';`);

  await db.query(`CREATE INDEX IF NOT EXISTS idx_rooms_updated_at ON rooms(updated_at);`);

  // music_library_index table for WebDAV library browser
  await db.query(`
    CREATE TABLE IF NOT EXISTS music_library_index (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      name TEXT NOT NULL,
      relative_path TEXT NOT NULL UNIQUE,
      parent_path TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('folder', 'file')),
      extension TEXT,
      playable BOOLEAN NOT NULL DEFAULT FALSE,
      size BIGINT,
      modified_at TIMESTAMPTZ,
      indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`CREATE INDEX IF NOT EXISTS idx_lib_parent_path ON music_library_index(parent_path);`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_lib_type ON music_library_index(type);`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_lib_playable ON music_library_index(playable);`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_lib_name_lower ON music_library_index(lower(name));`);

  console.log('[db] migrations complete');
}

function getDb() {
  return pool;
}

module.exports = { initDb, getDb };
