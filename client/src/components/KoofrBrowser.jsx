/**
 * KoofrBrowser — browse and add MOD/audio files from Koofr WebDAV.
 * Uses the Railway proxy (/api/koofr/list and /api/koofr/file) to avoid CORS.
 */

import React, { useState, useEffect } from 'react';

const MOD_FORMATS = new Set(['MOD', 'XM', 'S3M', 'IT', 'AHX', 'MPT', 'MED', 'MTM', '669', 'ULT', 'STM', 'OKT']);

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function getBadgeClass(name) {
  const ext = name.split('.').pop().toUpperCase();
  if (MOD_FORMATS.has(ext)) return 'badge-mod';
  if (['MP3', 'WAV', 'OGG'].includes(ext)) return 'badge-audio';
  if (['MID', 'MIDI'].includes(ext)) return 'badge-midi';
  return 'badge-default';
}

export default function KoofrBrowser({ onAdd }) {
  const [path, setPath] = useState('/public/music/mod');
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [addedPath, setAddedPath] = useState('');

  useEffect(() => {
    fetchFiles(path);
  }, [path]);

  async function fetchFiles(itemPath) {
    setLoading(true);
    setError('');
    setSelectedFile(null);
    try {
      const res = await fetch(`/api/koofr/list?path=${encodeURIComponent(itemPath)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to list files');
      setFiles(data.files || []);
    } catch (e) {
      setError(e.message || 'Failed to load files');
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }

  function navigateTo(item) {
    if (item.isDirectory) {
      setPath(item.path);
    } else {
      setSelectedFile(item);
      setAddedPath('');
    }
  }

  function navigateUp() {
    const parts = path.split('/').filter(Boolean);
    parts.pop();
    const newPath = '/' + parts.join('/');
    if (newPath !== path) setPath(newPath);
  }

  function handleAdd() {
    if (!selectedFile) return;
    const ext = selectedFile.name.split('.').pop().toUpperCase();
    const isAudio = MOD_FORMATS.has(ext) || ['MP3', 'WAV', 'OGG', 'MID', 'MIDI'].includes(ext);

    // The proxy URL the player will use to fetch this file
    const proxyUrl = `/api/koofr/file?path=${encodeURIComponent(selectedFile.path)}`;

    onAdd({
      url: proxyUrl,
      title: selectedFile.name,
      filename: selectedFile.name,
      mediaType: isAudio ? 'audio' : 'video',
      format: ext,
      duration: 0,
    });
    setAddedPath(selectedFile.path);
    setSelectedFile(null);
  }

  const trackerFiles = files.filter(f => !f.isDirectory && MOD_FORMATS.has(f.name.split('.').pop().toUpperCase()));
  const otherFiles = files.filter(f => !f.isDirectory && !MOD_FORMATS.has(f.name.split('.').pop().toUpperCase()));
  const directories = files.filter(f => f.isDirectory);

  return (
    <div className="koofr-browser">
      {/* Path breadcrumb */}
      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--dim)', marginBottom: 8, fontFamily: 'monospace' }}>
        KOOFR: {path}
      </div>

      {error && (
        <div style={{ color: 'var(--error)', fontSize: 'var(--font-size-xs)', marginBottom: 8 }}>
          !! {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 24, color: 'var(--dim)' }}>Loading...</div>
      ) : files.length === 0 && !error ? (
        <div style={{ textAlign: 'center', padding: 24, color: 'var(--dim)' }}>Empty folder</div>
      ) : (
        <div className="koofr-file-list">
          {/* Up button */}
          {path !== '/' && (
            <div className="koofr-item koofr-dir" onClick={navigateUp}>
              <span style={{ fontSize: 14 }}>📁</span>
              <span className="koofr-name">..</span>
            </div>
          )}

          {/* Directories */}
          {directories.map(dir => (
            <div key={dir.path} className="koofr-item koofr-dir" onClick={() => navigateTo(dir)}>
              <span style={{ fontSize: 14 }}>📁</span>
              <span className="koofr-name">{dir.name}</span>
            </div>
          ))}

          {/* Tracker MOD/XM files first */}
          {trackerFiles.map(file => (
            <div
              key={file.path}
              className={`koofr-item ${selectedFile?.path === file.path ? 'selected' : ''}`}
              onClick={() => navigateTo(file)}
            >
              <span style={{ fontSize: 14 }}>🎵</span>
              <span className="koofr-name">{file.name}</span>
              <span className={`badge ${getBadgeClass(file.name)}`} style={{ marginLeft: 'auto' }}>
                {file.name.split('.').pop().toUpperCase()}
              </span>
              {file.size > 0 && (
                <span style={{ color: 'var(--dim)', fontSize: 'var(--font-size-xs)', marginLeft: 8 }}>
                  {formatSize(file.size)}
                </span>
              )}
            </div>
          ))}

          {/* Other audio files */}
          {otherFiles.map(file => (
            <div
              key={file.path}
              className={`koofr-item ${selectedFile?.path === file.path ? 'selected' : ''}`}
              onClick={() => navigateTo(file)}
            >
              <span style={{ fontSize: 14 }}>🎵</span>
              <span className="koofr-name">{file.name}</span>
              <span className={`badge ${getBadgeClass(file.name)}`} style={{ marginLeft: 'auto' }}>
                {file.name.split('.').pop().toUpperCase()}
              </span>
              {file.size > 0 && (
                <span style={{ color: 'var(--dim)', fontSize: 'var(--font-size-xs)', marginLeft: 8 }}>
                  {formatSize(file.size)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {selectedFile && (
        <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-accent" onClick={handleAdd}>
            [ADD TO PLAYLIST: {selectedFile.name}]
          </button>
          <button className="btn btn-small" onClick={() => setSelectedFile(null)}>
            [CANCEL]
          </button>
        </div>
      )}

      {addedPath && (
        <div style={{ marginTop: 8, color: 'var(--accent)', fontSize: 'var(--font-size-xs)' }}>
          ✓ Added to playlist. Pick another file to keep building the queue.
        </div>
      )}

      <div className="format-note" style={{ marginTop: 12 }}>
        <strong>Tip:</strong> MOD/XM/S3M/IT tracker files play directly from Koofr via the built-in player. The Koofr picker stays open so you can add multiple songs.
      </div>
    </div>
  );
}
