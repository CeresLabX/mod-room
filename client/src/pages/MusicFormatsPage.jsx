/**
 * MusicFormatsPage — standalone page version of the format guide.
 * Accessed via /music-formats route.
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FORMAT_DATA } from '../utils/trackerFormats.js';

export default function MusicFormatsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const filtered = FORMAT_DATA.filter(f => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      f.extension.includes(q) ||
      f.name.toLowerCase().includes(q) ||
      f.description.toLowerCase().includes(q)
    );
  });

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-primary)',
      color: 'var(--text)',
      fontFamily: 'var(--font-mono)',
      padding: '24px 16px',
    }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <button
            className="btn btn-small"
            onClick={() => navigate(-1)}
            style={{ marginBottom: 16 }}
          >
            [← BACK]
          </button>
          <h1 style={{
            fontSize: 'var(--font-size-lg)',
            color: 'var(--accent)',
            marginBottom: 8,
          }}>
            TRACKER MUSIC FORMAT GUIDE
          </h1>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--dim)' }}>
            Tracker files store music as <em>instructions</em> — notes, instruments, and effects — not
            recorded audio. This makes them tiny but incredibly expressive.
          </p>
        </div>

        {/* Search */}
        <div style={{ marginBottom: 20 }}>
          <input
            type="text"
            placeholder="Search formats..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
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

        {/* Stats bar */}
        <div style={{
          display: 'flex',
          gap: 16,
          marginBottom: 20,
          padding: '8px 12px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 3,
          fontSize: 'var(--font-size-xs)',
          color: 'var(--dim)',
          flexWrap: 'wrap',
        }}>
          <span>Total formats: <strong style={{ color: 'var(--text)' }}>{FORMAT_DATA.length}</strong></span>
          <span>Supported: <strong style={{ color: '#2ecc71' }}>{FORMAT_DATA.filter(f => !f.isExperimental).length}</strong></span>
          <span>Experimental: <strong style={{ color: '#f39c12' }}>{FORMAT_DATA.filter(f => f.isExperimental).length}</strong></span>
          <span>Engines: <strong style={{ color: 'var(--text)' }}>libopenmpt, ahx, modplayer</strong></span>
        </div>

        {/* Format cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {filtered.map(f => (
            <div
              key={f.extension}
              style={{
                padding: 16,
                background: 'var(--bg-secondary)',
                border: `1px solid ${f.isExperimental ? '#f39c12' : 'var(--border)'}`,
                borderRadius: 4,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span style={{
                  display: 'inline-block',
                  padding: '2px 8px',
                  background: f.isExperimental ? 'rgba(243,156,18,0.15)' : 'rgba(46,204,113,0.12)',
                  border: `1px solid ${f.isExperimental ? '#f39c12' : '#2ecc71'}`,
                  borderRadius: 2,
                  fontSize: 'var(--font-size-sm)',
                  color: f.isExperimental ? '#f39c12' : '#2ecc71',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 'bold',
                  minWidth: 56,
                  textAlign: 'center',
                }}>
                  .{f.extension.toUpperCase()}
                </span>
                <span style={{ fontWeight: 'bold', fontSize: 'var(--font-size-base)' }}>
                  {f.name}
                </span>
                {f.isExperimental && (
                  <span style={{ fontSize: 'var(--font-size-xs)', color: '#f39c12', background: 'rgba(243,156,18,0.1)', padding: '1px 6px', borderRadius: 2 }}>
                    EXPERIMENTAL
                  </span>
                )}
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--dim)', marginLeft: 'auto' }}>
                  Engine: <strong style={{ color: 'var(--text)' }}>{f.engine}</strong>
                </span>
              </div>

              <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--dim)', marginBottom: 10, lineHeight: 1.6 }}>
                {f.description}
              </p>

              {f.whyItMatters && (
                <ul style={{ margin: '0 0 10px', paddingLeft: 20, fontSize: 'var(--font-size-sm)' }}>
                  {f.whyItMatters.map((point, i) => (
                    <li key={i} style={{ color: 'var(--text)', marginBottom: 3, lineHeight: 1.5 }}>{point}</li>
                  ))}
                </ul>
              )}

              {f.whyForMusic && (
                <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--accent)', marginBottom: 10, fontStyle: 'italic' }}>
                  ♪ {f.whyForMusic}
                </p>
              )}

              {f.references && (
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {f.references.map((ref, i) => (
                    <a
                      key={i}
                      href={ref.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 'var(--font-size-xs)', color: 'var(--accent)', textDecoration: 'none' }}
                    >
                      → {ref.label}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--dim)' }}>
            No formats match "{search}"
          </div>
        )}

        {/* Bottom info */}
        <div style={{
          marginTop: 32,
          padding: 16,
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 4,
          fontSize: 'var(--font-size-sm)',
          color: 'var(--dim)',
          textAlign: 'center',
          lineHeight: 1.6,
        }}>
          <strong style={{ color: 'var(--text)' }}>What makes tracker music special?</strong>
          <br />
          MP3 and WAV files store <em>recordings</em> of sound. A 3-minute song can be 3–10 MB.
          Tracker files store the <em>recipe</em> — which instrument plays which note, when, and how.
          A complete song can be just 10–100 KB. The music plays back by executing those instructions
          in real time, just like a music sequencer.
          <br /><br />
          <a
            href="https://en.wikipedia.org/wiki/Tracker_(music_software)"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--accent)' }}
          >
            Read more on Wikipedia →
          </a>
        </div>
      </div>
    </div>
  );
}
