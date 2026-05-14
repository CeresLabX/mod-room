/**
 * Koofr WebDAV routes
 * Handles browsing and proxying files from Koofr to avoid CORS issues in the browser.
 * Uses Node.js 22 built-in fetch (no external deps).
 */

const express = require('express');
const router = express.Router();

const {
  KOOFR_EMAIL: email,
  KOOFR_PASSWORD: password,
  KOOFR_BASE_URL: baseUrl = 'https://app.koofr.net/dav/Koofr',
} = process.env;

if (!email || !password) {
  console.warn('[koofr] KOOFR_EMAIL / KOOFR_PASSWORD not set — Koofr browsing disabled');
}

const authHeader = () =>
  'Basic ' + Buffer.from(`${email}:${password}`).toString('base64');

/**
 * Parse a simple WebDAV PROPFIND response XML into an array of file objects.
 * Handles both single-item and multi-item responses.
 */
function parsePropfind(xml) {
  // Extract all <d:response> blocks
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

/**
 * GET /api/koofr/list?path=/public/music/mod
 * Lists files in a Koofr folder via WebDAV PROPFIND.
 */
router.get('/list', async (req, res) => {
  if (!email || !password) {
    return res.status(503).json({ error: 'Koofr not configured' });
  }

  const itemPath = (req.query.path || '/public/music/mod').replace(/\/$/, '');
  const koofrUrl = `${baseUrl}${itemPath}/`;

  try {
    const response = await fetch(koofrUrl, {
      method: 'PROPFIND',
      headers: {
        Authorization: authHeader(),
        Depth: '1',
        'Content-Type': 'application/xml',
      },
      body: '<?xml version="1.0" encoding="utf-8"?><propfind xmlns="DAV:"><prop><displayname/><getcontentlength/><getcontenttype/><resourcetype/></prop></propfind>',
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `Koofr error: ${response.status}` });
    }

    const xml = await response.text();
    const rawResponses = parsePropfind(xml);

    const files = [];
    for (const item of rawResponses) {
      if (!item.href || item.href === `${itemPath}/` || item.href === itemPath) continue;

      // Strip the /dav/Koofr prefix
      const cleanPath = item.href.replace(/^\/dav\/Koofr/, '');
      const name = item.displayName || decodeURIComponent(cleanPath.split('/').pop());

      // Detect format from extension
      const ext = name.split('.').pop().toUpperCase();
      const MOD_FORMATS = ['MOD', 'XM', 'S3M', 'IT', 'AHX', 'MPT', 'MED', 'MTM', '669', 'ULT', 'STM', 'OKT'];
      const isTracker = MOD_FORMATS.includes(ext);

      files.push({
        name,
        path: cleanPath,
        size: item.contentLength || 0,
        contentType: item.contentType || (item.isCollection ? 'folder' : 'application/octet-stream'),
        isDirectory: item.isCollection,
        format: ext,
        isTracker,
      });
    }

    // Sort: directories first, then by name
    files.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { numeric: true });
    });

    res.json({ files, path: itemPath });
  } catch (err) {
    console.error('[koofr] list error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/koofr/file?path=/public/music/mod/song.mod
 * Proxies a file from Koofr with CORS headers so the browser can fetch it.
 */
router.get('/file', async (req, res) => {
  if (!email || !password) {
    return res.status(503).json({ error: 'Koofr not configured' });
  }

  const itemPath = req.query.path;
  if (!itemPath) {
    return res.status(400).json({ error: 'path query parameter required' });
  }

  const koofrUrl = `${baseUrl}${itemPath}`;

  try {
    const response = await fetch(koofrUrl, {
      method: 'GET',
      headers: { Authorization: authHeader() },
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `Koofr error: ${response.status}` });
    }

    res.set('Access-Control-Allow-Origin', '*');
    res.set('Content-Type', response.headers.get('content-type') || 'application/octet-stream');
    const cl = response.headers.get('content-length');
    if (cl) res.set('Content-Length', cl);

    res.status(response.status);
    res.flushHeaders();

    for await (const chunk of response.body) {
      res.write(chunk);
    }
    res.end();
  } catch (err) {
    console.error('[koofr] file proxy error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});

module.exports = router;
