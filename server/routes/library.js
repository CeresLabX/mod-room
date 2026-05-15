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

// Known directory names at the root of /Vectrix/public — these are format subdirectories, NOT file extensions
const KNOWN_DIRS = new Set([
  'MOD', 'XM', 'S3M', 'IT', '669', 'AMF', 'AMS', 'DBM', 'DMF', 'DSM', 'FAR',
  'MDL', 'MED', 'OKT', 'PTM', 'ULT', 'UMX', 'SNAPSHOT', 'DIGI', 'C67',
  'J2B', 'MO3', 'MT2', 'PLM', 'PSM', 'PTM', 'SFX', 'STP', 'SYMMOD',
  'HVL', 'IMF', 'FMT', 'GDM', 'DTM', 'MT2',
]);

const PLAYABLE_EXTENSIONS = new Set([
  'MOD','XM','S3M','IT','MPTM','MTM','STM','669',
  'AMF','AMS','DBM','DMF','DSM','FAR','MDL','MED',
  'OKT','PTM','ULT','UMX','WAV','MP3','OGG','FLAC','M4A',
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

// ─── Safe path validation ────────────────────────────────────────────────────

function isUnderRoot(itemPath, root) {
  if (itemPath === root) return true;
  return itemPath.startsWith(root + '/');
}

function safeRelativePath(itemPath) {
  const rel = itemPath.startsWith(KOOFR_ROOT)
    ? itemPath.slice(KOOFR_ROOT.length)
    : itemPath;
  if (rel.startsWith('..') || rel.includes('/..')) return null;
  return rel || '/';
}

// ─── WebDAV helpers ─────────────────────────────────────────────────────────

/**
 * Use PROPFIND Depth:0 on an item to determine if it's a collection (directory).
 * Koofr marks everything as non-collection in Depth:1, so we probe individually.
 */
async function isDirectory(webdavPath) {
  const koofrUrl = `${baseUrl}${webdavPath}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  const response = await fetch(koofrUrl, {
    method: 'PROPFIND',
    headers: {
      Authorization: authHeader(),
      Depth: '0',
      'Content-Type': 'application/xml',
    },
    body: '<?xml version="1.0" encoding="utf-8"?><propfind xmlns="DAV:"><prop><resourcetype/></prop></propfind>',
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));

  if (response.status === 207) {
    const xml = await response.text();
    return /<d:collection\/?>/i.test(xml);
  }
  // 200/301/404 = file or invalid
  return false;
}

/**
 * List immediate children of a WebDAV directory.
 * Detects directories by checking if PROPFIND returns 207 Multi-Status (directory)
 * vs 200 OK (file). Falls back to extension heuristics for edge cases.
 */
async function webdavList(webdavPath) {
  const koofrUrl = `${baseUrl}${webdavPath}/`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  let response;
  try {
    response = await fetch(koofrUrl, {
      method: 'PROPFIND',
      headers: {
        Authorization: authHeader(),
        Depth: '1',
        'Content-Type': 'application/xml',
      },
      body: '<?xml version="1.0" encoding="utf-8"?><propfind xmlns="DAV:"><prop><displayname/><getcontentlength/><getcontenttype/><resourcetype/></prop></propfind>',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`WebDAV error ${response.status} for ${webdavPath}`);
  }

  const xml = await response.text();
  const responses = parsePropfind(xml);

  const items = [];
  for (const item of responses) {
    if (!item.href || item.href === `${webdavPath}/` || item.href === webdavPath) continue;

    // Strip /dav/Koofr prefix to get absolute Koofr path
    const absPath = item.href.replace(/^\/dav\/Koofr/, '');
    const relPath = absPath.startsWith(KOOFR_ROOT)
      ? absPath.slice(KOOFR_ROOT.length)
      : absPath;
    const relClean = relPath.replace(/^\//, '').replace(/\/$/, '');

    // Determine name
    const name = item.displayName || relClean.split('/').pop() || '';

    // Determine if directory:
    // - It's a FILE if: has a playable extension (song.mod) OR has an extension but is NOT a known folder (readme.txt)
    // - It's a DIRECTORY if: no extension, OR it's a known folder name (MOD/XM/669/etc), OR marked as collection
    const ext = name.includes('.') ? name.split('.').pop().toUpperCase() : '';
    const isPlayableExt = isPlayable(ext);
    const isKnownFolder = KNOWN_DIRS.has(name.toUpperCase());
    const isFile = isPlayableExt || (ext && !isKnownFolder);
    const isDirectory = !isFile;

    items.push({
      name,
      relPath: relClean,
      parentPath: relClean.includes('/') ? relClean.substring(0, relClean.lastIndexOf('/')) : '',
      isDirectory,
      extension: ext,
      playable: isPlayableExt,
      size: item.contentLength || 0,
    });
  }

  return items;
}

function parsePropfind(xml) {
  const responses = [];
  // Match both <D:response> and <d:response> (Koofr uses uppercase D)
  const re = /<D:response>([\s\S]*?)<\/D:response>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const block = m[1];
    const hrefMatch = block.match(/<D:href>([^<]*)<\/D:href>/i);
    const href = hrefMatch ? decodeURIComponent(hrefMatch[1]) : '';
    const displayMatch = block.match(/<D:displayname>([^<]*)<\/D:displayname>/i);
    const displayName = displayMatch ? displayMatch[1] : '';
    const lenMatch = block.match(/<D:getcontentlength[^>]*>([^<]*)<\/D:getcontentlength>/i);
    const contentLength = lenMatch ? parseInt(lenMatch[1], 10) : 0;
    const typeMatch = block.match(/<D:getcontenttype>([^<]*)<\/D:getcontenttype>/i);
    const contentType = typeMatch ? typeMatch[1] : '';
    // Match <D:collection> or <D:collection ...> with xmlns/other attributes before >
    const isCollection = /<D:collection[^>]*>/i.test(block) || /<d:collection[^>]*>/i.test(block);
    responses.push({ href, displayName, contentLength, contentType, isCollection });
  }
  return responses;
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
    const scope = relPath === '/' ? '' : relPath;
    const pattern = scope ? scope + '/%' : '%';

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

router.get('/debug-list', async (req, res) => {
  if (!email || !password) return res.status(503).json({ error: 'no creds' });
  try {
    const items = await webdavList(KOOFR_ROOT);
    res.json({ count: items.length, items: items.slice(0, 5).map(i => ({
      name: i.name, isDirectory: i.isDirectory, ext: i.extension, playable: i.playable
    }))});
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/library/reindex
 * Rebuilds the library index from WebDAV via recursive walk.
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

  const stats = { folders: 0, files: 0, playable: 0, skipped: 0 };

  async function upsertItem(item) {
    const { name, relPath, parentPath, isDirectory, extension, playable, size } = item;
    const type = isDirectory ? 'folder' : 'file';
    try {
      await db.query(
        `INSERT INTO music_library_index (id, name, relative_path, parent_path, type, extension, playable, size, indexed_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT (relative_path) DO UPDATE SET
           name = EXCLUDED.name, parent_path = EXCLUDED.parent_path,
           type = EXCLUDED.type, extension = EXCLUDED.extension,
           playable = EXCLUDED.playable, size = EXCLUDED.size, indexed_at = NOW()`,
        [name, relPath, parentPath, type, extension || null, playable, size || null]
      );
    } catch (e) {
      console.warn(`[library] upsert failed for ${relPath}: ${e.message}`);
    }
  }

  /**
   * Recursively walk the WebDAV tree starting at webdavPath (absolute Koofr path).
   * parentRel is the relative path from KOOFR_ROOT.
   */
  async function walk(webdavPath, parentRel) {
    let items;
    try {
      items = await webdavList(webdavPath);
    } catch (e) {
      if (e.name === 'AbortError') {
        console.warn(`[library] timeout listing ${webdavPath} — skipping`);
      } else {
        console.warn(`[library] failed to list ${webdavPath}: ${e.message}`);
      }
      return;
    }

    // Log first few items of first call to debug detection
    if (stats.folders === 0 && stats.files === 0) {
      console.log(`[library] walk(${webdavPath}) got ${items.length} items, first 5:`);
      for (const item of items.slice(0, 5)) {
        console.log(`  name=${item.name} isDir=${item.isDirectory} ext=${item.extension} playable=${item.playable} relPath=${item.relPath}`);
      }
    } else if ((stats.folders + stats.files) % 100 === 0) {
      console.log(`[library] progress: folders=${stats.folders} files=${stats.files} playable=${stats.playable}`);
    }

    for (const item of items) {
      if (item.isDirectory) {
        stats.folders++;
        await upsertItem(item);
        try {
          await walk(KOOFR_ROOT + '/' + item.relPath, item.relPath);
        } catch (e) {
          console.warn(`[library] failed to walk ${item.relPath}: ${e.message}`);
        }
      } else {
        if (item.playable) stats.playable++; else stats.skipped++;
        stats.files++;
        await upsertItem(item);
      }
    }
  }

  try {
    await walk(KOOFR_ROOT, '');

    // Prune stale entries (not touched during this reindex)
    const deleted = await db.query(
      `DELETE FROM music_library_index WHERE indexed_at < NOW() - INTERVAL '5 seconds' RETURNING id`
    );
    if (deleted.rowCount > 0) {
      console.log(`[library] pruned ${deleted.rowCount} stale entries`);
    }

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
