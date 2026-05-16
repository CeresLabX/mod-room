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
  const [visualizerId, setVisualizerId] = useState('spectrum');

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
    setVisualizerId(data.room?.visualizerId || 'spectrum');
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


  const hydrateFromRoomSnapshot = useCallback((room, nextQueue = [], nextUsers = []) => {
    setRoomData(room);
    setQueue(nextQueue);
    setUsers(nextUsers);
    setVisualizerId(room?.visualizerId || 'spectrum');
    queueRef.current = nextQueue;
    usersRef.current = nextUsers;

    const playbackData = {
      status: room?.playbackStatus || 'idle',
      itemId: room?.currentItemId || null,
      timestamp: room?.playbackTimestamp || 0,
      positionMsAtLastUpdate: (room?.playbackTimestamp || 0) * 1000,
      serverUpdatedAt: Date.now(),
      isPlaying: room?.playbackStatus === 'playing',
    };
    playbackRef.current = playbackData;
    setPlayback({ ...playbackData });
    setCurrentItem(findCurrentItem(nextQueue, room?.currentItemId));
  }, [findCurrentItem]);

  // HTTP snapshot fallback for refreshes or stale sockets. Socket room-state is
  // still preferred when it arrives, but the page should not look empty while
  // waiting for Socket.IO.
  useEffect(() => {
    if (!nickname) return;
    let cancelled = false;
    async function loadSnapshot() {
      try {
        const res = await axios.get(`/api/rooms/${encodeURIComponent(roomId)}`);
        if (cancelled) return;
        hydrateFromRoomSnapshot(res.data, res.data.queue || [], res.data.users || []);
      } catch (err) {
        console.warn('[room] HTTP snapshot failed:', err?.response?.data?.error || err.message);
      }
    }
    loadSnapshot();
    return () => { cancelled = true; };
  }, [hydrateFromRoomSnapshot, nickname, roomId]);

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

  const handleVisualizerUpdate = useCallback((data) => {
    if (data?.visualizerId) setVisualizerId(data.visualizerId);
  }, []);

  const handleError = useCallback((data) => {
    setError(data.message);
    setTimeout(() => setError(''), 5000);
  }, []);

  const joinRoom = useCallback((socketLike) => {
    if (!nickname) { navigate('/'); return; }
    socketLike.emit('join-room', { roomId, nickname });
  }, [roomId, nickname, navigate]);

  const { socket: socketRef, emit } = useSocket({
    onConnect: ({ socket }) => joinRoom(socket),
    onRoomState: handleRoomState,
    onPlaybackUpdate: handlePlaybackUpdate,
    onQueueUpdated: handleQueueUpdated,
    onUserJoined: handleUserJoined,
    onUserLeft: handleUserLeft,
    onActivity: handleActivity,
    onReaction: onReactionFromServer,
    onSeek: onSeekFromServer,
    onVisualizerUpdate: handleVisualizerUpdate,
    onError: handleError,
  });

  // Validate local identity on mount; actual room join happens on every
  // socket connect/reconnect so a refresh is treated like a clean rejoin.
  useEffect(() => {
    if (!nickname) navigate('/');
  }, [nickname, navigate]);

  // Keep URL in sync with room code (so shared URLs use code, not UUID)
  useEffect(() => {
    if (roomData?.roomCode && roomId !== roomData.roomCode) {
      window.history.replaceState(null, '', `/room/${roomData.roomCode}`);
    }
  }, [roomData?.roomCode]);


  const applyPlaybackResponse = useCallback((data) => {
    const nextQueue = data.queue || queueRef.current || [];
    if (Array.isArray(data.queue)) {
      handleQueueUpdated({ queue: nextQueue });
    }
    const nextPlayback = {
      ...playbackRef.current,
      status: data.playbackStatus || 'idle',
      itemId: data.currentItemId || null,
      timestamp: data.timestamp || 0,
      positionMsAtLastUpdate: (data.timestamp || 0) * 1000,
      serverUpdatedAt: Date.now(),
      expectedPositionMs: (data.timestamp || 0) * 1000,
      serverTime: Date.now(),
      isPlaying: data.playbackStatus === 'playing',
    };
    playbackRef.current = nextPlayback;
    setPlayback({ ...nextPlayback });
    setCurrentItem(findCurrentItem(nextQueue, data.currentItemId));
  }, [findCurrentItem, handleQueueUpdated]);

  const postPlaybackControl = useCallback(async (action, body = {}) => {
    const targetRoomId = roomData?.id || roomId;
    const res = await axios.post(`/api/rooms/${encodeURIComponent(targetRoomId)}/${action}`, body);
    if (!res.data?.ok) throw new Error(res.data?.error || `Failed to ${action}`);
    applyPlaybackResponse(res.data);
    return res.data;
  }, [applyPlaybackResponse, roomData?.id, roomId]);

  // Playback handlers
  const handlePlay = async () => {
    if (!currentItem) return;
    try {
      await postPlaybackControl('play', { itemId: currentItem.id });
    } catch (err) {
      console.warn('[playback] HTTP play failed, trying socket:', err?.message || err);
      emit('play', { itemId: currentItem.id });
    }
  };

  const handlePause = async () => {
    try {
      await postPlaybackControl('pause');
    } catch (err) {
      console.warn('[playback] HTTP pause failed, trying socket:', err?.message || err);
      emit('pause', {});
    }
  };

  const handleStop = async () => {
    try {
      await postPlaybackControl('stop');
    } catch (err) {
      console.warn('[playback] HTTP stop failed, pausing locally:', err?.message || err);
      emit('pause', {});
    }
  };

  const handleSeek = (timestamp) => {
    emit('seek', { timestamp });
  };

  const handleNext = async () => {
    try {
      const targetRoomId = roomData?.id || roomId;
      const res = await axios.post(`/api/rooms/${encodeURIComponent(targetRoomId)}/next`);
      if (!res.data?.ok) throw new Error(res.data?.error || 'Failed to advance queue');
      const nextQueue = res.data.queue || [];
      handleQueueUpdated({ queue: nextQueue });
      playbackRef.current = {
        ...playbackRef.current,
        status: res.data.playbackStatus || 'idle',
        itemId: res.data.currentItemId || null,
        timestamp: 0,
        positionMsAtLastUpdate: 0,
        serverUpdatedAt: Date.now(),
        isPlaying: res.data.playbackStatus === 'playing',
      };
      setPlayback({ ...playbackRef.current });
      setCurrentItem(findCurrentItem(nextQueue, res.data.currentItemId));
    } catch (err) {
      console.warn('[queue] HTTP next failed, trying socket:', err?.message || err);
      emit('next', {});
    }
  };

  const ensureSocketReady = useCallback(async () => {
    const socket = socketRef.current;
    if (!socket) {
      throw new Error('Socket is not ready yet — try again in a moment');
    }

    if (!socket.connected) {
      await new Promise((resolve, reject) => {
        let lastConnectError = null;
        const timer = setTimeout(() => {
          cleanup();
          reject(new Error(lastConnectError?.message || 'Could not reconnect to server'));
        }, 10000);
        const cleanup = () => {
          clearTimeout(timer);
          socket.off('connect', onConnect);
          socket.off('connect_error', onError);
        };
        const onConnect = () => {
          cleanup();
          resolve();
        };
        const onError = (err) => {
          // Do not fail on the first transport error. Some networks/Railway
          // edges reject the WebSocket probe while polling still works.
          lastConnectError = err instanceof Error ? err : new Error(err?.message || 'Socket connection failed');
          console.warn('[socket] connect attempt failed, waiting for fallback/retry:', lastConnectError.message);
        };
        socket.on('connect', onConnect);
        socket.on('connect_error', onError);
        socket.connect();
      });
    }

    // If a page was left open across a deploy/reconnect, make sure this socket
    // has rejoined the room before queue mutations. The server stores room
    // membership per socket connection, so a connected-but-not-joined socket
    // will correctly reject add-to-queue. Waiting for room-state removes that
    // race instead of surfacing a misleading "not connected" error.
    if (!roomData?.id) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          cleanup();
          reject(new Error('Joined server, but room sync timed out'));
        }, 8000);
        const cleanup = () => {
          clearTimeout(timer);
          socket.off('room-state', onRoomState);
          socket.off('error', onSocketError);
        };
        const onRoomState = () => {
          cleanup();
          resolve();
        };
        const onSocketError = (data) => {
          cleanup();
          reject(new Error(data?.message || 'Room join failed'));
        };
        socket.once('room-state', onRoomState);
        socket.once('error', onSocketError);
        joinRoom(socket);
      });
    }

    return socket;
  }, [joinRoom, roomData?.id, socketRef]);

  const addToQueueViaHttp = useCallback(async (item) => {
    const targetRoomId = roomData?.id || roomId;
    console.info('[queue] Adding via HTTP queue endpoint');
    const res = await axios.post(`/api/rooms/${encodeURIComponent(targetRoomId)}/queue`, {
      item,
      nickname,
    });
    if (!res.data?.ok) {
      throw new Error(res.data?.error || 'Failed to add item');
    }
    if (Array.isArray(res.data.queue)) {
      handleQueueUpdated({ queue: res.data.queue });

      // If the server made this the current item, hydrate local playback too.
      // This matters when Socket.IO is connected poorly or not joined yet: the
      // HTTP insert is persisted, but this browser may miss the socket playback
      // broadcast and otherwise appear to add-but-not-play until refresh.
      const currentItemId = res.data.currentItemId || res.data.itemId;
      const addedOrCurrent = res.data.queue.find(q => q.id === currentItemId) || null;
      if (addedOrCurrent && (!playbackRef.current.itemId || playbackRef.current.itemId === currentItemId)) {
        playbackRef.current = {
          ...playbackRef.current,
          status: res.data.playbackStatus || 'playing',
          itemId: currentItemId,
          timestamp: 0,
          positionMsAtLastUpdate: 0,
          serverUpdatedAt: Date.now(),
          isPlaying: (res.data.playbackStatus || 'playing') === 'playing',
        };
        setPlayback({ ...playbackRef.current });
        setCurrentItem(addedOrCurrent);
      }
    }
    return res.data;
  }, [handleQueueUpdated, nickname, roomData?.id, roomId]);

  const handleAddToQueue = async (item, options = {}) => {
    // Use HTTP as the source-of-truth mutation path. Socket.IO is still used for
    // room sync/broadcasts, but making Add wait on a socket ACK caused slow or
    // phantom adds on flaky WebSocket connections.
    const response = await addToQueueViaHttp(item);

    if (!options.keepOpen) {
      setShowAddMedia(false);
    }
    return response;
  };

  const handleRemoveFromQueue = (itemId) => {
    emit('remove-from-queue', { itemId });
  };

  const handlePlayItem = async (itemId) => {
    try {
      await postPlaybackControl('play', { itemId });
    } catch (err) {
      console.warn('[playback] HTTP queue-item play failed, trying socket:', err?.message || err);
      emit('play', { itemId });
    }
  };

  const handleReaction = (emoji) => {
    emit('reaction', { emoji });
  };

  const handleVisualizerSelect = (id) => {
    setVisualizerId(id);
    emit('visualizer-select', { visualizerId: id });
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
          onStop={handleStop}
          onSeek={handleSeek}
          onNext={handleNext}
          emit={emit}
          visualizerId={visualizerId}
          onVisualizerSelect={handleVisualizerSelect}
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
