import React, { useEffect, useState, useRef } from 'react';
import { useAudioPlayer } from '../hooks/useAudioPlayer.js';
import { useModPlayer } from '../hooks/useModPlayer.js';
import { useTrackerPlayer } from '../hooks/useTrackerPlayer.js';
import Visualizer from './Visualizer.jsx';
import VideoPlayer from './VideoPlayer.jsx';
import LearnAboutMusicFormats from './LearnAboutMusicFormats.jsx';
import {
  ALL_TRACKER_EXTENSIONS,
  MODPLAYER_FORMATS,
  LIBOPENMPT_FORMATS,
} from '../utils/trackerFormats.js';

function isTrackerFormat(item) {
  if (!item) return false;
  const ext = (item.filename || item.url || '').split('.').pop().toLowerCase();
  const fmt = (item.format || '').toLowerCase();
  return ALL_TRACKER_EXTENSIONS.has(fmt) || ALL_TRACKER_EXTENSIONS.has(ext);
}

function isModPlayerFormat(item) {
  if (!item) return false;
  const ext = (item.filename || item.url || '').split('.').pop().toLowerCase();
  const fmt = (item.format || '').toLowerCase();
  return MODPLAYER_FORMATS.has(fmt) || MODPLAYER_FORMATS.has(ext);
}

function isTrackerWithSeeking(item) {
  if (!item) return false;
  const ext = (item.filename || item.url || '').split('.').pop().toLowerCase();
  const fmt = (item.format || '').toLowerCase();
  return LIBOPENMPT_FORMATS.has(fmt) || LIBOPENMPT_FORMATS.has(ext);
}

function formatTime(s) {
  if (!s || isNaN(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function PlayerPanel({ item, playback, queue, isHost, onPlay, onPause, onSeek, onNext, emit }) {
  const [showVideo, setShowVideo] = useState(false);
  const [localStatus, setLocalStatus] = useState('idle');
  const [showFormatInfo, setShowFormatInfo] = useState(false);

  const handleEnded = () => {
    emit('next', {});
  };

  const handlePlayerError = (e) => {
    console.error('[player] error:', e);
  };

  const isTracker = isTrackerFormat(item);
  const isPureMod = isModPlayerFormat(item);
  const hasSeeking = isTrackerWithSeeking(item);

  // .mod files → useModPlayer
  // other trackers → useTrackerPlayer
  // everything else → useAudioPlayer
  const modPlayer = useModPlayer({
    item: isPureMod ? item : null,
    onEnded: handleEnded,
    onError: handlePlayerError,
  });

  const trackerPlayer = useTrackerPlayer({
    item: (isTracker && !isPureMod) ? item : null,
    onEnded: handleEnded,
    onError: handlePlayerError,
  });

  const htmlPlayer = useAudioPlayer({
    item: isTracker ? null : item,
    onEnded: handleEnded,
    onError: handlePlayerError,
  });

  const active = isPureMod ? modPlayer : isTracker ? trackerPlayer : htmlPlayer;
  const {
    status, currentTime, duration, volume, analyserNode, analyserRef, animFrameRef,
    playerRef, play, pause, stop, seek, changeVolume, syncTo,
    autoplayBlocked, clearAutoplayBlocked, metadata,
  } = active;

  const progressPct = duration ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  useEffect(() => {
    setLocalStatus(status);
  }, [status, item?.id]);

  // Keep player in sync with server state
  useEffect(() => {
    if (playback.status === 'playing' && status !== 'playing') {
      play();
    } else if (playback.status === 'paused' && status === 'playing') {
      pause();
    }
    if (playback.timestamp !== undefined && Math.abs(currentTime - playback.timestamp) > 3) {
      syncTo(playback.timestamp);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id, playback.itemId, playback.status, playback.timestamp, status]);

  // Unlock audio on any user click
  useEffect(() => {
    if (!autoplayBlocked) return;
    const unlockAudio = () => {
      clearAutoplayBlocked();
      if (playback.status === 'playing') {
        play();
      }
    };
    document.addEventListener('click', unlockAudio);
    return () => document.removeEventListener('click', unlockAudio);
  }, [autoplayBlocked, playback.status, play, clearAutoplayBlocked]);

  const playbackRef = useRef(playback);
  useEffect(() => { playbackRef.current = playback; }, [playback]);

  const syncStateRef = useRef({ currentTime, status, syncTo, play, isTracker: isTracker && !isPureMod, hasSeeking });
  useEffect(() => {
    syncStateRef.current = { currentTime, status, syncTo, play, isTracker: isTracker && !isPureMod, hasSeeking };
  }, [currentTime, status, syncTo, play, isTracker, isPureMod, hasSeeking]);

  // Periodic sync — correct drift
  useEffect(() => {
    const interval = setInterval(() => {
      const p = playbackRef.current;
      const s = syncStateRef.current;
      if (p.positionMsAtLastUpdate === undefined || p.positionMsAtLastUpdate === null || !p.serverUpdatedAt) return;

      let expectedMs = p.positionMsAtLastUpdate;
      if (p.isPlaying) {
        const now = Date.now();
        if (p.serverTime && p.expectedPositionMs !== undefined) {
          expectedMs = p.expectedPositionMs + (now - p.serverTime);
        } else {
          expectedMs = p.positionMsAtLastUpdate + (now - p.serverUpdatedAt);
        }
      }

      const expectedSec = expectedMs / 1000;
      const drift = Math.abs(s.currentTime - expectedSec);

      // Only skip for pure .mod (no seeking), allow resync for trackers with seeking
      if (!s.isTracker || s.hasSeeking) {
        if (drift > 2) {
          s.syncTo(expectedSec);
        }
      }

      if (p.status === 'playing' && s.status !== 'playing') {
        s.play().catch(() => {});
      }
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleProgressClick = (e) => {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const time = ratio * duration;
    seek(time);
    onSeek(time);
  };

  const handleSkipBack = () => {
    if (!duration) return;
    const time = Math.max(0, currentTime - 10);
    seek(time);
    onSeek(time);
  };

  const handleSkipForward = () => {
    if (!duration) return;
    const time = Math.min(duration, currentTime + 10);
    seek(time);
    onSeek(time);
  };

  const handleVolumeChange = (e) => {
    changeVolume(parseFloat(e.target.value));
  };

  const handlePlayPause = () => {
    if (localStatus === 'playing') {
      pause();
      onPause();
      setLocalStatus('paused');
    } else {
      play();
      onPlay();
      setLocalStatus('playing');
    }
  };

  const handleResync = () => {
    if (playback.timestamp !== undefined) {
      syncTo(playback.timestamp);
      setCurrentTime(playback.timestamp);
    }
  };

  const isVideoType = item?.mediaType === 'video' || ['MP4', 'WEBM', 'MPEG'].includes(item?.format);
  const isYouTube = item?.mediaType === 'youtube' || item?.url?.includes('youtube.com') || item?.url?.includes('youtu.be');
  const noItem = !item;

  // Track info: show format badge and any metadata from the tracker player
  const trackerMeta = isTracker ? metadata : null;

  return (
    <div className="player-panel">
      {showFormatInfo && <LearnAboutMusicFormats onClose={() => setShowFormatInfo(false)} />}

      <div className="player-section">
        <div className="now-playing">{'▶ NOW PLAYING'}</div>
        {item ? (
          <>
            <div className="track-title">{item.title || item.filename || 'Unknown'}</div>
            <div className="track-meta">
              <span
                className={`badge badge-${item.mediaType || 'audio'}`}
                style={{ cursor: 'pointer' }}
                onClick={() => setShowFormatInfo(true)}
                title="Learn about this format"
              >
                {isPureMod ? 'MOD' : isTracker ? (item.format || 'TRACKER') : (item.format || 'AUDIO')}
              </span>
              <button
                className="btn btn-small"
                style={{ fontSize: 'var(--font-size-xs)', padding: '1px 6px', marginLeft: 4 }}
                onClick={() => setShowFormatInfo(true)}
                title="Learn about music formats"
              >
                ⓘ
              </button>
              <span>by {item.addedBy}</span>
              {isYouTube && <span className="badge badge-youtube">YOUTUBE</span>}
              {item.mediaType === 'midi' && <span className="badge badge-midi">MIDI</span>}
              {isTracker && <span className="badge badge-mod">TRACKER</span>}
            </div>
            {trackerMeta && (
              <div className="track-meta" style={{ marginTop: 4, fontSize: 'var(--font-size-xs)', color: 'var(--dim)' }}>
                {trackerMeta.channels && <span>Ch: {trackerMeta.channels} | </span>}
                {trackerMeta.instruments && <span>Instr: {trackerMeta.instruments} | </span>}
                {trackerMeta.patterns && <span>Patt: {trackerMeta.patterns} | </span>}
                {trackerMeta.durationSeconds && (
                  <span>~{formatTime(trackerMeta.durationSeconds)}</span>
                )}
                {trackerMeta.warnings && trackerMeta.warnings.some(w => w.includes('experimental')) && (
                  <span style={{ color: '#f39c12' }}> | ⚠ AHX experimental</span>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="track-title text-dim">— NO TRACK LOADED —</div>
        )}
      </div>

      <div className="visualizer-section">
        {noItem ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
            <div style={{ textAlign: 'center', color: 'var(--dim)', fontSize: 'var(--font-size-xs)' }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>🎵</div>
              <div>Queue is empty</div>
              <div>Add some media!</div>
            </div>
          </div>
        ) : isYouTube ? (
          <VideoPlayer item={item} playback={playback} />
        ) : isVideoType ? (
          <VideoPlayer item={item} playback={playback} />
        ) : (
          <Visualizer
            analyserNode={analyserNode}
            analyserRef={analyserRef}
            animFrameRef={animFrameRef}
            playerRef={playerRef}
            status={status}
          />
        )}
      </div>

      <div className="player-section">
        <div className="progress-bar-wrap" onClick={handleProgressClick}>
          <div className="progress-bar">
            <div className="progress-bar-fill" style={{ width: `${progressPct}%` }} />
          </div>
          <div className="progress-time">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {isPureMod && (
          <div className="text-dim text-xs" style={{ textAlign: 'center', marginTop: 4, marginBottom: 4 }}>
            ⓘ Seeking not supported for .MOD files
          </div>
        )}

        <div className="player-controls">
          {autoplayBlocked ? (
            <div style={{ textAlign: 'center', padding: '4px 0' }}>
              <button className="btn" style={{ background: '#c0392b', color: '#fff', fontWeight: 'bold', border: '2px solid #fff' }} onClick={() => { clearAutoplayBlocked(); play(); }}>
                🔇 CLICK ANYWHERE TO START AUDIO
              </button>
              <div className="text-dim text-xs" style={{ marginTop: 6 }}>
                Your browser blocks audio until you interact with the page
              </div>
            </div>
          ) : (
            <>
              {!isPureMod && (
                <button className="btn btn-small" onClick={handleSkipBack} disabled={noItem || !duration}>[⏪ -10s]</button>
              )}
              <>
                {localStatus === 'playing' || status === 'playing' ? (
                  <button className="btn btn-small" onClick={handlePlayPause}>[⏸ PAUSE]</button>
                ) : (
                  <button className="btn btn-small" onClick={handlePlayPause} disabled={noItem}>[▶ PLAY]</button>
                )}
                <button className="btn btn-small" onClick={onNext} disabled={queue.length <= 1}>[⏭ NEXT]</button>
                <button className="btn btn-small" onClick={() => { stop(); onPause(); setLocalStatus('idle'); }}>[⏹ STOP]</button>
              </>
              {!isPureMod && (
                <button className="btn btn-small" onClick={handleSkipForward} disabled={noItem || !duration}>[⏩ +10s]</button>
              )}
              {hasSeeking && (
                <button
                  className="btn btn-small"
                  onClick={handleResync}
                  title="Resync to server position"
                  style={{ color: 'var(--accent)' }}
                >
                  [⟳ RESYNC]
                </button>
              )}
            </>
          )}
        </div>

        <div className="volume-wrap">
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--dim)' }}>VOL</span>
          <input
            type="range"
            className="volume-slider"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            onChange={handleVolumeChange}
          />
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--dim)' }}>
            {Math.round(volume * 100)}%
          </span>
        </div>
      </div>

      <div className="cmd-log">
        {noItem
          ? 'C:\\MODROOM> Waiting for queue...'
          : `C:\\MODROOM> Playing: ${item.title || item.filename} [${formatTime(currentTime)}/${formatTime(duration)}]`
        }
      </div>
    </div>
  );
}
