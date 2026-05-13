import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const THEMES = [
  { id: 'dos', label: 'DOS PHOSPHOR' },
  { id: 'amiga', label: 'AMIGA' },
  { id: 'winamp', label: 'WINAMP' },
  { id: 'bbs', label: 'BBS CYAN' },
];

export default function RoomLanding({ theme, applyTheme }) {
  const navigate = useNavigate();
  const [nickname, setNickname] = useState(localStorage.getItem('modroom-nick') || '');
  const [roomCode, setRoomCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    const nick = nickname.trim();
    if (!nick) { setError('Enter a nickname first!'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await axios.post('/api/rooms', { nickname: nick });
      localStorage.setItem('modroom-nick', nick);
      localStorage.setItem('modroom-host', '1');
      navigate(`/room/${res.data.roomId}`);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to create room');
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    const nick = nickname.trim();
    const code = roomCode.trim().toUpperCase();
    if (!nick) { setError('Enter a nickname first!'); return; }
    if (!code) { setError('Enter a room code!'); return; }
    setLoading(true);
    setError('');
    try {
      // Search for room by code
      const res = await axios.get(`/api/rooms/${code}`);
      localStorage.setItem('modroom-nick', nick);
      navigate(`/room/${res.data.id}`);
    } catch (e) {
      if (e.response?.status === 404) {
        // Try as room ID directly
        try {
          const res = await axios.get(`/api/rooms/${code}`);
          localStorage.setItem('modroom-nick', nick);
          navigate(`/room/${res.data.id}`);
        } catch {
          setError('Room not found');
        }
      } else {
        setError(e.response?.data?.error || 'Failed to join room');
      }
      setLoading(false);
    }
  };

  return (
    <div className="landing fade-in">
      <div className="landing-logo" aria-label="MOD ROOM ASCII art logo">
{`
██MMM    OOOO    DDDD
M MMM  OO    OO  D   DD
MM MMM OO    OO  D    DD
MMM MMM OO    OO  D    DD
MM  MMM OO    OO  D   DD
MM   MM  OOOO    DDDD

 ██████╗  █████╗ ███████╗███████╗
 ██╔══██╗██╔══██╗██╔════╝██╔════╝
 ██║  ██║███████║███████╗███████╗
 ██║  ██║██╔══██║╚════██║╚════██║
 ██████╔╝██║  ██║███████║███████║
 ╚═════╝ ╚═╝  ╚═╝╚══════╝╚══════╝
 ███╗   ███╗ █████╗ ██████╗ ███████╗
 ████╗ ████║██╔══██╗██╔══██╗██╔════╝
 ██╔████╔██║███████║██████╔╝███████╗
 ██║╚██╔╝██║██╔══██║██╔═══╝ ╚════██║
 ██║ ╚═╝ ██║██║  ██║██║     ███████║
 ╚═╝     ╚═╝╚═╝  ╚═╝╚═╝     ╚══════╝
`}
      </div>

      <div className="landing-subtitle">{'>> retro shared listening <<'}</div>

      <div className="theme-switcher">
        {THEMES.map(t => (
          <button
            key={t.id}
            className={`theme-btn ${theme === t.id ? 'active' : ''}`}
            onClick={() => applyTheme(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="landing-actions">
        <button
          className="btn btn-accent"
          onClick={handleCreate}
          disabled={loading}
        >
          {loading ? '[GENERATING...]' : '[CREATE NEW ROOM]'}
        </button>
      </div>

      <div className="landing-divider">OR JOIN EXISTING</div>

      <div className="join-form">
        <input
          type="text"
          placeholder="NICKNAME"
          value={nickname}
          onChange={e => setNickname(e.target.value)}
          maxLength={50}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
        />
        <input
          type="text"
          placeholder="ROOM CODE (e.g. LOUNGE-7742)"
          value={roomCode}
          onChange={e => setRoomCode(e.target.value)}
          maxLength={20}
          onKeyDown={e => e.key === 'Enter' && handleJoin()}
        />
        <button
          className="btn"
          onClick={handleJoin}
          disabled={loading}
        >
          {loading ? '[CONNECTING...]' : '[ENTER ROOM >>>]'}
        </button>
      </div>

      {error && (
        <div className="panel" style={{ maxWidth: 400, width: '100%', textAlign: 'center' }}>
          <span className="text-error" style={{ fontSize: 'var(--font-size-xs)' }}>
            !! {error}
          </span>
        </div>
      )}

      <div className="format-note text-dim" style={{ fontSize: 'var(--font-size-xs)', maxWidth: 500, textAlign: 'center', lineHeight: 2 }}>
        Supports: MP3 · WAV · OGG · MIDI · MOD/XM/S3M/IT · MP4 · WebM · YouTube
      </div>
    </div>
  );
}
