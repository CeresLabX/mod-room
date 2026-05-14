import React, { useState, useRef, useCallback } from 'react';
import axios from 'axios';
import KoofrBrowser from './KoofrBrowser.jsx';
import { extractYouTubeId, isYouTubeUrl } from '../utils/mediaHandler.js';

const ALLOWED_AUDIO = ['mp3', 'wav', 'ogg', 'midi', 'mid', 'mod', 'xm', 's3m', 'it'];
const ALLOWED_VIDEO = ['mp4', 'webm', 'mpeg'];
const ALL_ALLOWED = [...ALLOWED_AUDIO, ...ALLOWED_VIDEO];
const MAX_SIZE_BYTES = 100 * 1024 * 1024;

export default function AddMediaModal({ onAdd, onClose }) {
  const [tab, setTab] = useState('url'); // 'url' | 'upload' | 'koofr'
  const [urlInput, setUrlInput] = useState('');
  const [youtubeId, setYoutubeId] = useState(null);
  const [urlError, setUrlError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef(null);

  const handleUrlChange = (e) => {
    const val = e.target.value;
    setUrlInput(val);
    setUrlError('');
    if (isYouTubeUrl(val)) {
      const id = extractYouTubeId(val);
      setYoutubeId(id);
    } else {
      setYoutubeId(null);
    }
  };

  const handleUrlSubmit = () => {
    const trimmed = urlInput.trim();
    if (!trimmed) { setUrlError('Enter a URL'); return; }

    if (isYouTubeUrl(trimmed)) {
      const id = extractYouTubeId(trimmed);
      onAdd({
        url: trimmed,
        title: `YouTube Video (${id})`,
        filename: trimmed,
        mediaType: 'youtube',
        format: 'YOUTUBE',
        duration: 0,
      });
    } else {
      // Try to detect format from URL
      const ext = (trimmed.split('.').pop() || '').toLowerCase().split('?')[0];
      if (!ALL_ALLOWED.includes(ext)) {
        setUrlError(`Unknown format ".${ext}" — try uploading the file instead`);
        return;
      }
      const isAudio = ALLOWED_AUDIO.includes(ext);
      onAdd({
        url: trimmed,
        title: trimmed.split('/').pop() || trimmed,
        filename: trimmed.split('/').pop() || trimmed,
        mediaType: isAudio ? 'audio' : 'video',
        format: ext.toUpperCase(),
        duration: 0,
      });
    }
  };

  const uploadFile = async (file) => {
    setUploading(true);
    setUploadError('');
    setUploadProgress('Uploading...');

    const ext = file.name.split('.').pop().toLowerCase();
    if (!ALL_ALLOWED.includes(ext)) {
      setUploadError(`File type .${ext} not allowed. Allowed: ${ALL_ALLOWED.join(', ')}`);
      setUploading(false);
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setUploadError(`File too large. Max: 100MB. Your file: ${(file.size / 1024 / 1024).toFixed(1)}MB`);
      setUploading(false);
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await axios.post('/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          if (e.total) {
            const pct = Math.round((e.loaded / e.total) * 100);
            setUploadProgress(`Uploading... ${pct}%`);
          } else {
            setUploadProgress('Uploading...');
          }
        },
      });

      setUploadProgress('Processing...');
      onAdd({
        url: res.data.url,
        title: res.data.filename,
        filename: res.data.filename,
        mediaType: res.data.mediaType,
        format: res.data.format,
        duration: 0,
      });
    } catch (e) {
      setUploadError(e.response?.data?.error || e.message || 'Upload failed');
      setUploading(false);
      setUploadProgress('');
    }
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  }, []);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) uploadFile(file);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleUrlSubmit();
    if (e.key === 'Escape') onClose();
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal fade-in" onKeyDown={handleKeyDown}>
        <div className="modal-title">+ ADD MEDIA +</div>
        <button className="modal-close" onClick={onClose}>[X CLOSE]</button>

        <div className="tab-bar">
          <button
            className={`tab ${tab === 'url' ? 'active' : ''}`}
            onClick={() => setTab('url')}
          >
            URL
          </button>
          <button
            className={`tab ${tab === 'upload' ? 'active' : ''}`}
            onClick={() => setTab('upload')}
          >
            UPLOAD
          </button>
          <button
            className={`tab ${tab === 'koofr' ? 'active' : ''}`}
            onClick={() => setTab('koofr')}
          >
            KOOFR
          </button>
        </div>

        {tab === 'url' && (
          <div className="url-input-wrap">
            <div>
              <label>MEDIA URL</label>
              <input
                type="text"
                placeholder="https:// ... (YouTube, MP3, WAV, OGG, MP4, WebM, MIDI, MOD/XM/S3M/IT)"
                value={urlInput}
                onChange={handleUrlChange}
                autoFocus
              />
            </div>
            {youtubeId && (
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--accent)' }}>
                ✓ YouTube detected: {youtubeId}
              </div>
            )}
            {urlError && (
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--error)' }}>
                !! {urlError}
              </div>
            )}
            <button className="btn btn-accent" onClick={handleUrlSubmit} style={{ marginTop: 8 }}>
              [ADD TO QUEUE]
            </button>
          </div>
        )}

        {tab === 'upload' && (
          <div className="url-input-wrap">
            <div
              className={`drop-zone ${dragging ? 'dragging' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept={`.${ALL_ALLOWED.join(',.')}`}
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
              <div style={{ fontSize: 24, marginBottom: 8 }}>📁</div>
              <div>DRAG & DROP</div>
              <div style={{ marginTop: 4 }}>or click to browse</div>
              <div style={{ marginTop: 8, color: 'var(--dim)', fontSize: 'var(--font-size-xs)' }}>
                Max 100MB · {ALL_ALLOWED.join(' · ').toUpperCase()}
              </div>
            </div>

            {uploading && (
              <div className="upload-progress">{uploadProgress}</div>
            )}
            {uploadError && (
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--error)' }}>
                !! {uploadError}
              </div>
            )}
          </div>
        )}

        {tab === 'koofr' && (
          <KoofrBrowser onAdd={onAdd} />
        )}

        <div className="format-note">
          <strong>Supported formats:</strong><br />
          Audio: MP3, WAV, OGG, MIDI, MOD, XM, S3M, IT<br />
          Video: MP4, WebM, MPEG<br />
          URLs: YouTube links or direct audio/video URLs
        </div>
      </div>
    </div>
  );
}
