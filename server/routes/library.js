/**
 * Library routes — indexed music library from WebDAV.
 * Serves the browser UI and handles search/reindex.
 */

const express = require('express');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');
const router = express.Router();

const {
  KOOFR_EMAIL: email,
  KOOFR_PASSWORD: password,
  KOOFR_BASE_URL: baseUrl = 'https://app.koofr.net/dav/Koofr',
  WEBDAV_ROOT_PATH: webdavRoot = '/Vectrix/public',
  LIBRARY_REINDEX_TOKEN: reindexToken,
  DATABASE_URL,
} = process.env;

const KOOFR_ROOT = webdavRoot;

const PLAYABLE_EXTENSIONS = new Set([
  'MOD','XM','S3M','IT','MPTM','MTM','STM','669',
  'AMF','AMS','DBM','DMF','DSM','FAR','MDL','MED',
  'OKT','PTM','ULT','UMX',
  'WAV','MP3','OGG','FLAC','M4A',
]);

function isPlayable(ext) {
  return PLAYABLE_EXTENSIONS.has(ext.toUpperCase());
}

const authHeader = () =>
  'Basic ' + Buffer.from(`${email}:${password}`).toString('base64');

// ─── Database helpers ──────────────────────────────────────────────────────────

let pool = null;
function getPool() {
  if (!pool && DATABASE_URL) {
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: DATABASE_URL, max: 5 });
  }
  return pool;
}

async function getDb() {
  const p = getPool();
  if (!p) return null;
  const client = await p.connect();
  return client;
}

function releaseDb(client) {
  if (client) client.release();
}

// ─── Safe path validation ────────────────────────────────────────────────────

function isUnderRoot(itemPath, root) {
  if (itemPath === root) return true;
  return itemPath.startsWith(root + '/');
}

function safeRelativePath(itemPath) {
  // Returns the path relative to KOOFR_ROOT, or null if traversal detected
  const rel = itemPath.startsWith(KOOFR_ROOT)
    ? itemPath.slice(KOOFR_ROOT.length)
    : itemPath;
  if (rel.startsWith('..') || rel.includes('/..')) return null;
  return rel || '/';
}

// ─── WebDAV helpers ─────────────────────────────────────────────────────────

function parsePropfind(xml) {
  const responses = [];
  const re = /<d:response>([\s\S]*?)<\/d:response>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const block = m[1];
    const hrefMatch = block.match(/<d:href>([^<]*)<\/d:href>/i);
    const href = hrefMatch ? decodeURIComponent(hrefMatch[1]) : '';
    const displayMatch = block.match(/<d:displayname>([^<]*)<\/d:displayname>/i);
    const displayName = displayMatch ? displayMatch[1] : '';
    const lenMatch = block.match(/<d:getcontentlength[^>]*>([^<]*)<\/d:getcontentlength>/i);
    const contentLength = lenMatch ? parseInt(lenMatch[1], 10) : 0;
    const typeMatch = block.match(/<d:getcontenttype>([^<]*)<\/d:getcontenttype>/i);
    const contentType = typeMatch ? typeMatch[1] : '';
    const isCollection = /<d:collection\/?>/i.test(block);
    responses.push({ href, displayName, contentLength, contentType, isCollection });
  }
  return responses;
}

async function webdavList(webdavPath) {
  const koofrUrl = `${baseUrl}${webdavPath}/`;
  const response = await fetch(koofrUrl, {
    method: 'PROPFIND',
    headers: {
      Authorization: authHeader(),
      Depth: '1',
      'Content-Type': 'application/xml',
    },
    body: '<?xml version="1.0" encoding="utf-8"?><propfind xmlns="DAV:"><prop><displayname/><getcontentlength/><getcontenttype/><resourcetype/><getlastmodified/></prop></propfind>',
  });

  if (!response.ok) {
    throw new Error(`WebDAV error ${response.status} for ${webdavPath}`);
  }

  const xml = await response.text();
  return parsePropfind(xml);
}

// ─── Index routes ────────────────────────────────────────────────────────────

/**
 * GET /api/library?path=<relative path>
 * Returns immediate children of the given path from the database index.
 */
router.get('/', async (req, res) => {
  if (!email || !password) {
    return res.status(503).json({ error: 'Library not configured' });
  }

  const relPath = safeRelativePath(req.query.path || KOOFR_ROOT) || KOOFR_ROOT;
  const parentPath = relPath === '/' ? '' : relPath;

  const db = getPool();
  if (!db) {
    return res.status(503).json({ error: 'Database not available' });
  }

  try {
    const result = await db.query(
      `SELECT id, name, relative_path, parent_path, type, extension, playable, size
       FROM music_library_index
       WHERE parent_path = $1
       ORDER BY (type='folder') DESC, lower(name) ASC`,
      [parentPath]
    );

    const items = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      relativePath: '/' + row.relative_path,
      parentPath: '/' + row.parent_path,
      type: row.type,
      extension: row.extension,
      playable: row.playable,
      size: row.size,
    }));

    res.json({ items, path: '/' + parentPath });
  } catch (err) {
    console.error('[library] list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/library/search?path=<relative path>&q=<query>
 * Searches within the given folder scope using the index.
 */
router.get('/search', async (req, res) => {
  if (!email || !password) {
    return res.status(503).json({ error: 'Library not configured' });
  }

  const relPath = safeRelativePath(req.query.path || KOOFR_ROOT) || KOOFR_ROOT;
  const q = (req.query.q || '').trim();

  if (!q) {
    return res.json({ items: [], path: relPath, q: '' });
  }

  const db = getPool();
  if (!db) {
    return res.status(503).json({ error: 'Database not available' });
  }

  try {
    // Scope search: items under relPath
    const scope = relPath === '/' ? '' : relPath;
    const pattern = scope ? `${scope}/%` : '%';

    const result = await db.query(
      `SELECT id, name, relative_path, parent_path, type, extension, playable, size
       FROM music_library_index
       WHERE relative_path LIKE $1 AND lower(name) LIKE $2
       ORDER BY (type='folder') DESC, lower(name) ASC
       LIMIT 100`,
      [pattern, `%${q.toLowerCase()}%`]
    );

    const items = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      relativePath: '/' + row.relative_path,
      parentPath: '/' + row.parent_path,
      type: row.type,
      extension: row.extension,
      playable: row.playable,
      size: row.size,
    }));

    res.json({ items, path: relPath, q });
  } catch (err) {
    console.error('[library] search error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/library/reindex
 * Rebuilds the library index from WebDAV.
 * Protected by LIBRARY_REINDEX_TOKEN header.
 */
router.post('/reindex', async (req, res) => {
  const token = req.headers['x-reindex-token'];
  if (!reindexToken || token !== reindexToken) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (!email || !password) {
    return res.status(503).json({ error: 'WebDAV credentials not configured' });
  }

  const db = getPool();
  if (!db) {
    return res.status(503).json({ error: 'Database not available' });
  }

  console.log('[library] Starting reindex from', KOOFR_ROOT);

  try {
    // Walk the WebDAV tree recursively
    const stats = { folders: 0, files: 0, playable: 0, skipped: 0 };

    async function walk(webdavPath, parentRel) {
      const items = await webdavList(webdavPath);

      for (const item of items) {
        // Skip the parent entry itself
        if (!item.href || item.href === webdavPath + '/' || item.href === webdavPath) continue;

        // Get clean relative path
        const cleanHref = item.href.replace(/^\/dav\/Koofr/, '');
        const relPath = cleanHref.startsWith(KOOFR_ROOT)
          ? cleanHref.slice(KOOFR_ROOT.length)
          : cleanHref;
        const relPathClean = relPath.replace(/^\//, '').replace(/\/$/, '');
        const name = item.displayName || relPathClean.split('/').pop() || '';
        const parentRel2 = relPathClean.includes('/')
          ? relPathClean.substring(0, relPathClean.lastIndexOf('/'))
          : '';

        if (item.isCollection) {
          stats.folders++;
          await db.query(
            `INSERT INTO music_library_index (id, name, relative_path, parent_path, type, playable, indexed_at)
             VALUES (gen_random_uuid(), $1, $2, $3, 'folder', false, NOW())
             ON CONFLICT (relative_path) DO UPDATE SET
               name = EXCLUDED.name, parent_path = EXCLUDED.parent_path, indexed_at = NOW()`,
            [name, relPathClean, parentRel2]
          );
          // Recurse into subfolder
          try {
            await walk(cleanHref, relPathClean);
          } catch (e) {
            console.warn(`[library] failed to walk ${cleanHref}: ${e.message}`);
          }
        } else {
          const ext = name.includes('.') ? name.split('.').pop().toUpperCase() : '';
          const playable = isPlayable(ext);
          if (playable) stats.playable++; else stats.skipped++;
          stats.files++;

          await db.query(
            `INSERT INTO music_library_index (id, name, relative_path, parent_path, type, extension, playable, size, indexed_at)
             VALUES (gen_random_uuid(), $1, $2, $3, 'file', $4, $5, $6, NOW())
             ON CONFLICT (relative_path) DO UPDATE SET
               name = EXCLUDED.name, parent_path = EXCLUDED.parent_path,
               extension = EXCLUDED.extension, playable = EXCLUDED.playable,
               size = EXCLUDED.size, indexed_at = NOW()`,
            [name, relPathClean, parentRel2, ext, playable, item.contentLength || null]
          );
        }
      }
    }

    await walk(KOOFR_ROOT, '');

    // Remove stale entries (not updated during this reindex)
    await db.query(
      `DELETE FROM music_library_index WHERE indexed_at < NOW() - INTERVAL '5 seconds'`
    );

    console.log(`[library] Reindex complete: ${stats.folders} folders, ${stats.files} files, ${stats.playable} playable, ${stats.skipped} skipped`);

    res.json({
      ok: true,
      folders: stats.folders,
      files: stats.files,
      playable: stats.playable,
      skipped: stats.skipped,
    });
  } catch (err) {
    console.error('[library] reindex error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/library/file?relativePath=<path>
 * Proxies a file from WebDAV to the frontend player.
 */
router.get('/file', async (req, res) => {
  if (!email || !password) {
    return res.status(503).json({ error: 'Library not configured' });
  }

  let relPath = req.query.relativePath;
  if (!relPath) {
    return res.status(400).json({ error: 'relativePath query parameter required' });
  }

  // Security: enforce KOOFR_ROOT boundary
  const fullPath = relPath.startsWith('/') ? KOOFR_ROOT + relPath : KOOFR_ROOT + '/' + relPath;
  if (!isUnderRoot(fullPath, KOOFR_ROOT)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const koofrUrl = `${baseUrl}${fullPath}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  res.on('close', () => controller.abort());

  try {
    const response = await fetch(koofrUrl, {
      method: 'GET',
      headers: { Authorization: authHeader() },
      signal: controller.signal,
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `Koofr error: ${response.status}` });
    }

    res.set('Access-Control-Allow-Origin', '*');
    res.set('Content-Type', response.headers.get('content-type') || 'application/octet-stream');
    const cl = response.headers.get('content-length');
    if (cl) res.set('Content-Length', cl);

    res.status(response.status);
    await pipeline(Readable.fromWeb(response.body), res);
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error('[library] file proxy error:', err.message);
    }
    if (!res.headersSent) {
      res.status(err.name === 'AbortError' ? 504 : 500).json({
        error: err.name === 'AbortError' ? 'Request timed out' : err.message,
      });
    } else {
      res.destroy(err);
    }
  } finally {
    clearTimeout(timeout);
  }
});

module.exports = router;
