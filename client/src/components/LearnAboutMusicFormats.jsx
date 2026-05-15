/**
 * LearnAboutMusicFormats — modal showing information about all tracker formats.
 * Does NOT stop playback when opened.
 */

import React, { useState, useCallback } from 'react';
import { FORMAT_DATA } from '../utils/trackerFormats.js';

export default function LearnAboutMusicFormats({ onClose }) {
  const [search, setSearch] = useState('');

  const filtered = FORMAT_DATA.filter(f => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      f.extension.includes(q) ||
      f.name.toLowerCase().includes(q) ||
      f.description.toLowerCase().includes(q) ||
      f.format?.toLowerCase().includes(q)
    );
  });

  const handleBackdropClick = useCallback((e) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.85)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={handleBackdropClick}
    >
      <div
        style={{
          background: 'var(--bg-primary)',
          border: '2px solid var(--border)',
          borderRadius: 4,
          width: '100%',
          maxWidth: 760,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'var(--font-mono)',
          color: 'var(--text)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
        }}>
          <div>
            <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'bold', color: 'var(--accent)' }}>
              MUSIC FORMAT GUIDE
            </div>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--dim)', marginTop: 2 }}>
              Tracker files are different from MP3/WAV — they contain instructions, not audio samples
            </div>
          </div>
          <button
            className="btn btn-small"
            onClick={onClose}
            style={{ flexShrink: 0, marginLeft: 12 }}
          >
            [X CLOSE]
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <input
            type="text"
            placeholder="Search formats..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '6px 10px',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 2,
              color: 'var(--text)',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-size-sm)',
              outline: 'none',
            }}
          />
        </div>

        {/* Format list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 24, color: 'var(--dim)' }}>
              No formats match "{search}"
            </div>
          ) : (
            filtered.map(f => (
              <div
                key={f.extension}
                style={{
                  marginBottom: 20,
                  padding: 12,
                  background: 'var(--bg-secondary)',
                  border: `1px solid ${f.isExperimental ? 'var(--warning, #f39c12)' : 'var(--border)'}`,
                  borderRadius: 3,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{
                    display: 'inline-block',
                    padding: '1px 6px',
                    background: f.isExperimental ? 'rgba(243,156,18,0.2)' : 'rgba(46,204,113,0.15)',
                    border: `1px solid ${f.isExperimental ? '#f39c12' : '#2ecc71'}`,
                    borderRadius: 2,
                    fontSize: 'var(--font-size-xs)',
                    color: f.isExperimental ? '#f39c12' : '#2ecc71',
                    fontFamily: 'var(--font-mono)',
                  }}>
                    .{f.extension.toUpperCase()}
                  </span>
                  <span style={{ fontWeight: 'bold', fontSize: 'var(--font-size-sm)' }}>
                    {f.name}
                  </span>
                  {f.isExperimental && (
                    <span style={{ fontSize: 'var(--font-size-xs)', color: '#f39c12' }}>
                      (EXPERIMENTAL)
                    </span>
                  )}
                  <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--dim)', marginLeft: 'auto' }}>
                    Engine: {f.engine}
                  </span>
                </div>

                <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--dim)', marginBottom: 8, lineHeight: 1.5 }}>
                  {f.description}
                </p>

                {f.whyItMatters && f.whyItMatters.length > 0 && (
                  <ul style={{ margin: '6px 0', paddingLeft: 16, fontSize: 'var(--font-size-xs)' }}>
                    {f.whyItMatters.map((point, i) => (
                      <li key={i} style={{ color: 'var(--text)', marginBottom: 2 }}>{point}</li>
                    ))}
                  </ul>
                )}

                {f.whyForMusic && (
                  <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--accent)', marginTop: 6, fontStyle: 'italic' }}>
                    ♪ {f.whyForMusic}
                  </p>
                )}

                {f.references && f.references.length > 0 && (
                  <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {f.references.map((ref, i) => (
                      <a
                        key={i}
                        href={ref.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: 'var(--font-size-xs)',
                          color: 'var(--accent)',
                          textDecoration: 'none',
                        }}
                        onClick={e => e.stopPropagation()}
                      >
                        → {ref.label}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '10px 16px',
          borderTop: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
          fontSize: 'var(--font-size-xs)',
          color: 'var(--dim)',
          textAlign: 'center',
        }}>
          <strong style={{ color: 'var(--text)' }}>How trackers work:</strong>{' '}
          Unlike MP3/WAV (which store recorded audio), tracker files store <em>instructions</em> — which
          instrument plays which note at which time. This is why tracker files are tiny but can contain
          complex, multi-layered music.{' '}
          <a
            href="https://en.wikipedia.org/wiki/Tracker_(music_software)"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--accent)' }}
          >
            Learn more on Wikipedia →
          </a>
          <br />
          <a
            href="/music-formats"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--accent)', marginTop: 4, display: 'inline-block' }}
          >
            Open full format guide →
          </a>
        </div>
      </div>
    </div>
  );
}
