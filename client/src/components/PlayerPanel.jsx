import React, { useEffect, useRef, useState } from 'react';
import { useAudioPlayer } from '../hooks/useAudioPlayer.js';
import Visualizer from './Visualizer.jsx';
import VideoPlayer from './VideoPlayer.jsx';

function formatTime(s) {
  if (!s || isNaN(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function PlayerPanel({ item, playback, queue, isHost, onPlay, onPause, onSeek, onNext, emit }) {
  const [showVideo, setShowVideo] = useState(false);
  const [localStatus, setLocalStatus] = useState('idle');

  const handleEnded = () => {
    emit('next', {});
  };

  const handlePlayerError = (e) => {
    console.error('[player] error:', e);
  };

  const {
    status,
    currentTime,
    duration,
    volume,
    analyserNode,
    analyserRef,
    animFrameRef,
    playerRef,
    play,
    pause,
    stop,
    seek,
    changeVolume,
    syncTo,
    loadItem,
  } = useAudioPlayer({
    item,
    onEnded: handleEnded,
    onError: handlePlayerError,
  });

  // Sync playback state from server
  useEffect(() => {
    if (playback.status === 'playing' && status !== 'playing') {
      play();
    } else if (playback.status === 'paused' && status === 'playing') {
      pause();
    }
    if (playback.timestamp && Math.abs(currentTime - playback.timestamp) > 3) {
      syncTo(playback.timestamp);
    }
  }, [playback.status, playback.timestamp]);

  // Sync when item changes
  useEffect(() => {
    if (item) {
      loadItem(item);
      if (playback.status === 'playing') {
        setTimeout(play, 100);
      }
    }
  }, [item?.id]);

  const handleProgressClick = (e) => {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const time = ratio * duration;
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

  // Determine what to show
  const isVideoType = item?.mediaType === 'video' || ['MP4', 'WEBM', 'MPEG'].includes(item?.format);
  const isYouTube = item?.mediaType === 'youtube' || item?.url?.includes('youtube.com') || item?.url?.includes('youtu.be');

  const noItem = !item;

  return (
    <div className="player-panel">
      {/* Now playing header */}
      <div className="player-section">
        <div className="now-playing">{'▶ NOW PLAYING'}</div>
        {item ? (
          <>
            <div className="track-title">{item.title || item.filename || 'Unknown'}</div>
            <div className="track-meta">
              <span className={`badge badge-${item.mediaType || 'audio'}`}>{item.format || 'AUDIO'}</span>
              <span>by {item.addedBy}</span>
              {isYouTube && <span className="badge badge-youtube">YOUTUBE</span>}
              {item.mediaType === 'midi' && <span className="badge badge-midi">MIDI</span>}
            </div>
          </>
        ) : (
          <div className="track-title text-dim">— NO TRACK LOADED —</div>
        )}
      </div>

      {/* Video player or visualizer */}
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

      {/* Controls */}
      <div className="player-section">
        <div className="progress-bar-wrap" onClick={handleProgressClick}>
          <div className="progress-bar">
            <div
              className="progress-bar-fill"
              style={{ width: duration ? `${(currentTime / duration) * 100}%` : '0%' }}
            />
          </div>
          <div className="progress-time">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        <div className="player-controls">
          {isHost ? (
            <>
              {localStatus === 'playing' || status === 'playing' ? (
                <button className="btn btn-small" onClick={handlePlayPause}>[⏸ PAUSE]</button>
              ) : (
                <button className="btn btn-small" onClick={handlePlayPause} disabled={noItem}>[▶ PLAY]</button>
              )}
              <button className="btn btn-small" onClick={onNext} disabled={queue.length <= 1}>[⏭ NEXT]</button>
              <button className="btn btn-small" onClick={() => { stop(); onPause(); setLocalStatus('idle'); }}>[⏹ STOP]</button>
            </>
          ) : (
            <span className="text-dim text-xs">
              {playback.status === 'playing' ? '▶ SYNCED TO ROOM' : playback.status === 'paused' ? '⏸ PAUSED BY HOST' : '⏹ IDLE'}
            </span>
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

      {/* DOS command log */}
      <div className="cmd-log">
        {noItem
          ? 'C:\\MODROOM> Waiting for queue...'
          : `C:\\MODROOM> Playing: ${item.title || item.filename} [${formatTime(currentTime)}/${formatTime(duration)}]`
        }
      </div>
    </div>
  );
}
