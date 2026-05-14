import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useSocket } from '../hooks/useSocket.js';
import { useAudioPlayer } from '../hooks/useAudioPlayer.js';
import PlayerPanel from './PlayerPanel.jsx';
import QueuePanel from './QueuePanel.jsx';
import AddMediaModal from './AddMediaModal.jsx';
import UserList from './UserList.jsx';
import ActivityLog from './ActivityLog.jsx';

const REACTIONS = ['🎵', '🔥', '😂', '👍', '👏', '🤘', '💯', '🎸'];

export default function RoomView({ theme, applyTheme }) {
  const { roomId } = useParams();
  const navigate = useNavigate();

  const nickname = localStorage.getItem('modroom-nick') || '';
  const isHost = localStorage.getItem('modroom-host') === '1';

  const [roomData, setRoomData] = useState(null);
  const [queue, setQueue] = useState([]);
  const [users, setUsers] = useState([]);
  const [activities, setActivities] = useState([]);
  const [playback, setPlayback] = useState({ status: 'idle', itemId: null, timestamp: 0 });
  const [currentItem, setCurrentItem] = useState(null);
  const [showAddMedia, setShowAddMedia] = useState(false);
  const [error, setError] = useState('');

  const playbackRef = useRef({ status: 'idle', itemId: null, timestamp: 0 });
  const queueRef = useRef([]);
  const usersRef = useRef([]);

  // Find current item from queue
  const findCurrentItem = useCallback((q, itemId) => {
    return q.find(i => i.id === itemId) || null;
  }, []);

  // Handle room state from server
  const handleRoomState = useCallback((data) => {
    setRoomData(data.room);
    setQueue(data.queue || []);
    setUsers(data.users || []);
    queueRef.current = data.queue || [];
    usersRef.current = data.users || [];

    // Use expectedPositionMs from server if available (new sync system)
    const expectedTimestamp = data.room?.expectedPositionMs !== undefined
      ? data.room.expectedPositionMs / 1000
      : (data.room?.playbackTimestamp || 0);

    // Store full playback state for periodic sync
    const playbackData = data.playback || {};
    playbackRef.current = {
      status: data.room.playbackStatus || 'idle',
      itemId: data.room.currentItemId,
      timestamp: expectedTimestamp,
      positionMsAtLastUpdate: playbackData.positionMsAtLastUpdate,
      serverUpdatedAt: playbackData.serverUpdatedAt,
      isPlaying: playbackData.isPlaying,
      lastCommandId: playbackData.lastCommandId,
      expectedPositionMs: data.room?.expectedPositionMs,
      serverTime: data.room?.serverTime,
    };
    setPlayback({ ...playbackRef.current });
    const item = findCurrentItem(data.queue || [], data.room.currentItemId);
    setCurrentItem(item);
    setActivities(a => [...a, { message: `Joined room as "${nickname}"`, type: 'join', ts: Date.now() }]);
  }, [nickname, findCurrentItem]);

  const handlePlaybackUpdate = useCallback((data) => {
    // Conflict detection: ignore stale updates
    if (data.serverUpdatedAt && playbackRef.current.serverUpdatedAt && data.serverUpdatedAt < playbackRef.current.serverUpdatedAt) {
      console.log('[sync] Ignoring stale playback update');
      return;
    }

    const nextItemId = data.itemId || playbackRef.current.itemId;
    playbackRef.current = {
      ...playbackRef.current,
      status: data.status,
      itemId: nextItemId,
      timestamp: data.timestamp !== undefined ? data.timestamp : playbackRef.current.timestamp,
      positionMsAtLastUpdate: data.positionMsAtLastUpdate !== undefined ? data.positionMsAtLastUpdate : playbackRef.current.positionMsAtLastUpdate,
      serverUpdatedAt: data.serverUpdatedAt !== undefined ? data.serverUpdatedAt : playbackRef.current.serverUpdatedAt,
      isPlaying: data.isPlaying !== undefined ? data.isPlaying : playbackRef.current.isPlaying,
      lastCommandId: data.lastCommandId || playbackRef.current.lastCommandId,
      expectedPositionMs: data.expectedPositionMs !== undefined ? data.expectedPositionMs : playbackRef.current.expectedPositionMs,
      serverTime: data.serverTime || playbackRef.current.serverTime,
    };
    setPlayback({ ...playbackRef.current });
    if (nextItemId) {
      const item = findCurrentItem(queueRef.current, nextItemId);
      setCurrentItem(item);
    }
  }, [findCurrentItem]);

  const handleQueueUpdated = useCallback((data) => {
    const nextQueue = data.queue || [];
    setQueue(nextQueue);
    queueRef.current = nextQueue;

    const playbackItemId = playbackRef.current.itemId;
    if (playbackItemId) {
      const updatedCurrent = nextQueue.find(i => i.id === playbackItemId);
      if (updatedCurrent) {
        setCurrentItem(updatedCurrent);
        return;
      }
    }

    if (currentItem) {
      const updated = nextQueue.find(i => i.id === currentItem.id);
      if (!updated) {
        // current item was removed — advance to next
        const next = nextQueue[0] || null;
        setCurrentItem(next);
        if (next) {
          playbackRef.current.itemId = next.id;
        }
      }
    } else if (nextQueue.length && playbackRef.current.status === 'playing') {
      // Server can emit playback-update before queue-updated after the first add.
      // Once the queue arrives, hydrate the current item so the player can load it.
      setCurrentItem(nextQueue[0]);
      playbackRef.current.itemId = nextQueue[0].id;
    }
  }, [currentItem]);

  const handleUserJoined = useCallback((data) => {
    setUsers(u => {
      const updated = u.filter(x => x.nickname !== data.nickname);
      updated.push({ nickname: data.nickname, isHost: false });
      usersRef.current = updated;
      return updated;
    });
    setActivities(a => [...a, { message: `${data.nickname} joined the room`, type: 'join', ts: Date.now() }]);
  }, []);

  const handleUserLeft = useCallback((data) => {
    setUsers(u => {
      const updated = u.filter(x => x.nickname !== data.nickname);
      usersRef.current = updated;
      return updated;
    });
    setActivities(a => [...a, { message: `${data.nickname} left the room`, type: 'leave', ts: Date.now() }]);
  }, []);

  const handleActivity = useCallback((data) => {
    setActivities(a => [...a.slice(-49), { message: data.message, type: 'add', ts: data.ts }]);
  }, []);

  const onReactionFromServer = useCallback((data) => {
    setActivities(a => [...a.slice(-49), {
      message: `${data.nickname} reacted ${data.emoji}`,
      type: 'reaction',
      ts: data.ts,
    }]);
  }, []);

  const onSeekFromServer = useCallback((data) => {
    playbackRef.current.timestamp = data.timestamp;
    setPlayback(prev => ({ ...prev, timestamp: data.timestamp }));
    // Player component will handle seek via syncTo in its sync effect
  }, []);

  const handleError = useCallback((data) => {
    setError(data.message);
    setTimeout(() => setError(''), 5000);
  }, []);

  const { emit } = useSocket({
    onRoomState: handleRoomState,
    onPlaybackUpdate: handlePlaybackUpdate,
    onQueueUpdated: handleQueueUpdated,
    onUserJoined: handleUserJoined,
    onUserLeft: handleUserLeft,
    onActivity: handleActivity,
    onReaction: onReactionFromServer,
    onSeek: onSeekFromServer,
    onError: handleError,
  });

  // Join room on mount
  useEffect(() => {
    if (!nickname) { navigate('/'); return; }
    emit('join-room', { roomId, nickname });
  }, [roomId]);

  // Keep URL in sync with room code (so shared URLs use code, not UUID)
  useEffect(() => {
    if (roomData?.roomCode && roomId !== roomData.roomCode) {
      window.history.replaceState(null, '', `/room/${roomData.roomCode}`);
    }
  }, [roomData?.roomCode]);

  // Playback handlers
  const handlePlay = () => {
    if (!currentItem) return;
    emit('play', { itemId: currentItem.id });
  };

  const handlePause = () => {
    emit('pause', {});
  };

  const handleSeek = (timestamp) => {
    emit('seek', { timestamp });
  };

  const handleNext = () => {
    emit('next', {});
  };

  const handleAddToQueue = (item, options = {}) => {
    emit('add-to-queue', { item });
    if (!options.keepOpen) {
      setShowAddMedia(false);
    }
  };

  const handleRemoveFromQueue = (itemId) => {
    emit('remove-from-queue', { itemId });
  };

  const handlePlayItem = (itemId) => {
    emit('play', { itemId });
  };

  const handleReaction = (emoji) => {
    emit('reaction', { emoji });
  };

  const THEMES = [
    { id: 'dos', label: 'DOS' },
    { id: 'amiga', label: 'AMG' },
    { id: 'winamp', label: 'WIN' },
    { id: 'bbs', label: 'BBS' },
  ];

  return (
    <div className="room-view fade-in">
      <header className="room-header">
        <div className="room-header-title">
          ROOM: {roomData?.roomCode || '...'}
          {isHost && <span style={{ color: 'var(--highlight)', marginLeft: 8 }}>[HOST]</span>}
        </div>
        <div className="room-header-status">
          {playback.status === 'playing' ? '▶ PLAYING' : playback.status === 'paused' ? '⏸ PAUSED' : '⏹ IDLE'}
          {' · '}{queue.length} item{queue.length !== 1 ? 's' : ''} in queue
        </div>
        <div className="theme-switcher" style={{ gap: 4 }}>
          {THEMES.map(t => (
            <button
              key={t.id}
              className={`theme-btn ${theme === t.id ? 'active' : ''}`}
              onClick={() => applyTheme(t.id)}
              style={{ fontSize: 'var(--font-size-xs)', padding: '2px 6px' }}
            >
              {t.label}
            </button>
          ))}
          <button className="btn btn-small" onClick={() => navigate('/')} style={{ marginLeft: 8 }}>
            [EXIT]
          </button>
        </div>
      </header>

      {error && (
        <div style={{ padding: '4px 16px', background: 'rgba(255,0,0,0.1)', borderBottom: '1px solid var(--error)', color: 'var(--error)', fontSize: 'var(--font-size-xs)' }}>
          !! {error}
        </div>
      )}

      <div className="room-main">
        <PlayerPanel
          item={currentItem}
          playback={playback}
          queue={queue}
          isHost={isHost}
          onPlay={handlePlay}
          onPause={handlePause}
          onSeek={handleSeek}
          onNext={handleNext}
          emit={emit}
        />

        <QueuePanel
          queue={queue}
          currentItemId={currentItem?.id}
          playbackStatus={playback.status}
          isHost={isHost}
          nickname={nickname}
          onAddMedia={() => setShowAddMedia(true)}
          onRemove={handleRemoveFromQueue}
          onPlayItem={handlePlayItem}
        />

        <div className="right-col">
          <UserList users={users} nickname={nickname} hostNickname={roomData?.hostNickname} />

          <ActivityLog activities={activities} />

          <div className="reactions-bar">
            {REACTIONS.map(e => (
              <button
                key={e}
                className="reaction-btn"
                onClick={() => handleReaction(e)}
                title={`React ${e}`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      </div>

      {showAddMedia && (
        <AddMediaModal
          onAdd={handleAddToQueue}
          onClose={() => setShowAddMedia(false)}
        />
      )}
    </div>
  );
}
