import { useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.PROD
  ? window.location.origin
  : 'http://localhost:3001';

export function useSocket({ onRoomState, onPlaybackUpdate, onQueueUpdated,
  onUserJoined, onUserLeft, onActivity, onReaction, onSeek, onError }) {

  const socketRef = useRef(null);

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('room-state', (data) => onRoomState && onRoomState(data));
    socket.on('playback-update', (data) => onPlaybackUpdate && onPlaybackUpdate(data));
    socket.on('queue-updated', (data) => onQueueUpdated && onQueueUpdated(data));
    socket.on('user-joined', (data) => onUserJoined && onUserJoined(data));
    socket.on('user-left', (data) => onUserLeft && onUserLeft(data));
    socket.on('activity', (data) => onActivity && onActivity(data));
    socket.on('reaction', (data) => onReaction && onReaction(data));
    socket.on('seek', (data) => onSeek && onSeek(data));
    socket.on('error', (data) => onError && onError(data));

    return () => socket.disconnect();
  }, []);

  const emit = useCallback((event, data) => {
    socketRef.current?.emit(event, data);
  }, []);

  return { socket: socketRef.current, emit };
}
