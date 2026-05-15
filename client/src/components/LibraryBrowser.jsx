/**
 * LibraryBrowser — browse the indexed music library.
 * Uses /api/library (indexed from WebDAV) instead of /api/koofr/list.
 *
 * Features:
 * - Breadcrumb navigation
 * - Search within folder scope
 * - Folder/file distinction (folders open, files add)
 * - "Add all" button for playable files in current folder
 * - Loading / empty / no-results / error states
 * - Playable validation (never adds folders, never adds non-playable files)
 */

import React, { useState, useEffect, useCallback } from 'react';

const PLAYABLE_EXTENSIONS = new Set([
  'MOD','XM','S3M','IT','MPTM','MTM','STM','669',
  'AMF','AMS','DBM','DMF','DSM','FAR','MDL','MED',
  'OKT','PTM','ULT','UMX','DIGI','GDM','IMF','J2B',
  'PSM','C67','DTM','FMT','MO3','MT2','PLM','SFX','STP','SYMMOD',
  'WAV','MP3','OGG','FLAC','M4A','MID','MIDI',
]);

const TRACKER_EXTENSIONS = new Set([
  'MOD','XM','S3M','IT','MPTM','MTM','STM','669',
  'AMF','AMS','DBM','DMF','DSM','FAR','MDL','MED',
  'OKT','PTM','ULT','UMX','DIGI','GDM','IMF','J2B',
  'PSM','C67','DTM','FMT','MO3','MT2','PLM','SFX','STP','SYMMOD',
]);

const LIBRARY_ROOT = '/';

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function getBadgeClass(name) {
  const ext = (name.split('.').pop() || '').toUpperCase();
  if (TRACKER_EXTENSIONS.has(ext)) return 'badge-mod';
  if (['MP3','WAV','OGG','FLAC','M4A'].includes(ext)) return 'badge-audio';
  if (['MID','MIDI'].includes(ext)) return 'badge-midi';
  return 'badge-default';
}

function getExtension(name) {
  return (name.split('.').pop() || '').toUpperCase();
}

/** Split a path like "/Demoscene/Amiga/MODS" into breadcrumb segments */
function buildBreadcrumbs(fullPath) {
  if (fullPath === '/' || fullPath === LIBRARY_ROOT) return [{ label: 'Root', path: LIBRARY_ROOT }];
  const parts = fullPath.split('/').filter(Boolean);
  const crumbs = [{ label: 'Root', path: LIBRARY_ROOT }];
  let accum = '';
  for (const part of parts) {
    accum += '/' + part;
    crumbs.push({ label: part, path: accum });
  }
  return crumbs;
}

/** Build the WebDAV playback URL from a relative path */
function buildFileUrl(relativePath) {
  return `/api/library/file?relativePath=${encodeURIComponent(relativePath)}`;
}

export default function LibraryBrowser({ onAdd }) {
  const [currentPath, setCurrentPath] = useState(LIBRARY_ROOT);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null); // null = not searching
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [addedPath, setAddedPath] = useState('');
  const [addingPath, setAddingPath] = useState('');
  const [addError, setAddError] = useState('');
  const [addAllLoading, setAddAllLoading] = useState(false);

  const breadcrumbs = buildBreadcrumbs(currentPath);
  const displayItems = searchResults !== null ? searchResults : items;
  const isSearching = searchResults !== null;

  // Load folder contents
  const clearAddFeedback = useCallback(() => {
    setAddedPath('');
    setAddingPath('');
    setAddError('');
  }, []);

  const loadFolder = useCallback(async (path) => {
    setLoading(true);
    setError('');
    setSearchQuery('');
    setSearchResults(null);
    setSelectedFile(null);
    try {
      const res = await fetch(`/api/library?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load library');
      setItems(data.items || []);
      setCurrentPath(path);
    } catch (e) {
      setError(e.message || 'Failed to load folder');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadFolder(LIBRARY_ROOT);
  }, [loadFolder]);

  // Search with debounce
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await fetch(
          `/api/library/search?path=${encodeURIComponent(currentPath)}&q=${encodeURIComponent(searchQuery)}`
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Search failed');
        setSearchResults(data.items || []);
      } catch (e) {
        setError(e.message);
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, currentPath]);

  function navigateToFolder(path) {
    loadFolder(path);
  }

  async function handleItemClick(item) {
    if (item.type === 'folder') {
      navigateToFolder(item.relativePath);
      return;
    }

    if (!item.playable || addingPath) return;
    setAddError('');
    setAddedPath('');
    setAddingPath(item.relativePath);
    const proxyUrl = buildFileUrl(item.relativePath);
    try {
      await onAdd({
        url: proxyUrl,
        title: item.name,
        filename: item.name,
        mediaType: 'audio',
        format: item.extension || getExtension(item.name),
        duration: 0,
      });
      setAddedPath(item.relativePath);
    } catch (err) {
      setAddError(err?.message || 'Failed to add — check connection');
    } finally {
      setAddingPath('');
      setSelectedFile(null);
    }
  }

  async function handleAddAll() {
    const playableFiles = items.filter(i => i.type === 'file' && i.playable);
    if (playableFiles.length === 0) return;
    setAddAllLoading(true);
    setAddError('');
    setAddedPath('');
    setAddingPath('__add_all__');
    try {
      for (const file of playableFiles) {
        const proxyUrl = buildFileUrl(file.relativePath);
        await onAdd({
          url: proxyUrl,
          title: file.name,
          filename: file.name,
          mediaType: 'audio',
          format: file.extension || getExtension(file.name),
          duration: 0,
        });
      }
      setAddedPath('__add_all__');
    } catch (err) {
      setAddError(err?.message || 'Failed to add all — check connection');
    } finally {
      setAddingPath('');
      setAddAllLoading(false);
    }
  }

  const playableCount = items.filter(i => i.type === 'file' && i.playable).length;
  const folders = displayItems.filter(i => i.type === 'folder');
  const playableFiles = displayItems.filter(i => i.type === 'file' && i.playable);
  const nonPlayableFiles = displayItems.filter(i => i.type === 'file' && !i.playable);

  return (
    <div className="koofr-browser">
      {/* Breadcrumb navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
        {breadcrumbs.map((crumb, i) => (
          <React.Fragment key={crumb.path}>
            {i > 0 && <span style={{ color: 'var(--dim)', fontSize: 12 }}>/</span>}
            <button
              onClick={() => navigateToFolder(crumb.path)}
              style={{
                background: 'none',
                border: 'none',
                color: i === breadcrumbs.length - 1 ? 'var(--text)' : 'var(--accent)',
                cursor: 'pointer',
                fontSize: 'var(--font-size-xs)',
                fontFamily: 'monospace',
                padding: '2px 4px',
                borderRadius: 3,
              }}
            >
              {crumb.label}
            </button>
          </React.Fragment>
        ))}
      </div>

      {/* Search bar */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <input
          type="text"
          placeholder="Search in this folder..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{
            flex: 1,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            color: 'var(--text)',
            padding: '6px 10px',
            fontSize: 'var(--font-size-sm)',
            fontFamily: 'var(--font-mono)',
            outline: 'none',
          }}
        />
        {searchQuery && (
          <button
            onClick={() => { setSearchQuery(''); setSearchResults(null); }}
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              color: 'var(--dim)',
              cursor: 'pointer',
              padding: '6px 8px',
              fontSize: 'var(--font-size-xs)',
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Add all button */}
      {!isSearching && !loading && playableCount > 0 && (
        <div style={{ marginBottom: 8 }}>
          <button
            className="btn btn-small"
            onClick={handleAddAll}
            disabled={addAllLoading}
          >
            {addAllLoading ? '[ADDING...]' : `[ADD ALL ${playableCount} FILES]`}
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ color: 'var(--error)', fontSize: 'var(--font-size-xs)', marginBottom: 8 }}>
          !! {error}
          <button
            onClick={() => loadFolder(currentPath)}
            style={{ marginLeft: 8, background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', textDecoration: 'underline', fontSize: 'inherit' }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading */}
      {(loading || searchLoading) && (
        <div style={{ textAlign: 'center', padding: 24, color: 'var(--dim)' }}>
          {searchLoading ? 'Searching...' : 'Loading...'}
        </div>
      )}

      {/* Empty / no results */}
      {!loading && !searchLoading && displayItems.length === 0 && !error && (
        <div style={{ textAlign: 'center', padding: 24, color: 'var(--dim)' }}>
          {isSearching ? 'No results found' : 'Empty folder'}
        </div>
      )}

      {/* File list */}
      {!loading && !searchLoading && displayItems.length > 0 && (
        <div className="koofr-file-list">
          {/* Folders first */}
          {folders.map(folder => (
            <div
              key={folder.id || folder.relativePath}
              className="koofr-item koofr-dir"
              onClick={() => handleItemClick(folder)}
            >
              <span style={{ fontSize: 14 }}>📁</span>
              <span className="koofr-name">{folder.name}</span>
              <span style={{ marginLeft: 'auto', color: 'var(--dim)', fontSize: 'var(--font-size-xs)' }}>folder</span>
            </div>
          ))}

          {/* Playable files */}
          {playableFiles.map(file => (
            <div
              key={file.id || file.relativePath}
              className={`koofr-item ${selectedFile?.relativePath === file.relativePath ? 'selected' : ''}`}
              onClick={() => handleItemClick(file)}
              style={{ opacity: addingPath && addingPath !== file.relativePath ? 0.55 : 1 }}
              title={addingPath === file.relativePath ? 'Adding to playlist...' : 'Click to add to playlist'}
            >
              <span style={{ fontSize: 14 }}>{addingPath === file.relativePath ? '⏳' : '🎵'}</span>
              <span className="koofr-name">{file.name}</span>
              {addingPath === file.relativePath && (
                <span style={{ marginLeft: 'auto', color: 'var(--accent)', fontSize: 'var(--font-size-xs)' }}>ADDING...</span>
              )}
              <span className={`badge ${getBadgeClass(file.name)}`} style={{ marginLeft: addingPath === file.relativePath ? 8 : 'auto' }}>
                {getExtension(file.name)}
              </span>
              {file.size > 0 && (
                <span style={{ color: 'var(--dim)', fontSize: 'var(--font-size-xs)', marginLeft: 8 }}>
                  {formatSize(file.size)}
                </span>
              )}
            </div>
          ))}

          {/* Non-playable files (hidden by default but could show as disabled) */}
          {nonPlayableFiles.length > 0 && !isSearching && (
            <div style={{ marginTop: 4 }}>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--dim)', padding: '4px 0' }}>
                {nonPlayableFiles.length} unsupported file{nonPlayableFiles.length !== 1 ? 's' : ''} hidden
              </div>
            </div>
          )}
        </div>
      )}

      {/* Added confirmation / error */}
      {addError && (
        <div style={{ marginTop: 8, color: 'var(--error)', fontSize: 'var(--font-size-xs)' }}>
          ✗ {addError}
        </div>
      )}
      {addedPath && addedPath !== '__add_all__' && !addError && (
        <div style={{ marginTop: 8, color: 'var(--accent)', fontSize: 'var(--font-size-xs)' }}>
          ✓ Added to playlist. Pick another file to keep building the queue.
        </div>
      )}
      {addedPath === '__add_all__' && (
        <div style={{ marginTop: 8, color: 'var(--accent)', fontSize: 'var(--font-size-xs)' }}>
          ✓ {playableCount} playable files added to playlist.
        </div>
      )}

      <div className="format-note" style={{ marginTop: 12 }}>
        <strong>Tip:</strong> Click a folder to open it. Click a music file to add it to the playlist. Use the search box to find files within this folder.
      </div>
    </div>
  );
}
