import { useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.PROD
  ? window.location.origin
  : 'http://localhost:3001';

export function useSocket(handlers) {
  const socketRef = useRef(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('room-state', (data) => handlersRef.current.onRoomState?.(data));
    socket.on('playback-update', (data) => handlersRef.current.onPlaybackUpdate?.(data));
    socket.on('queue-updated', (data) => handlersRef.current.onQueueUpdated?.(data));
    socket.on('user-joined', (data) => handlersRef.current.onUserJoined?.(data));
    socket.on('user-left', (data) => handlersRef.current.onUserLeft?.(data));
    socket.on('activity', (data) => handlersRef.current.onActivity?.(data));
    socket.on('reaction', (data) => handlersRef.current.onReaction?.(data));
    socket.on('seek', (data) => handlersRef.current.onSeek?.(data));
    socket.on('error', (data) => handlersRef.current.onError?.(data));

    return () => socket.disconnect();
  }, []);

  const emit = useCallback((event, data) => {
    socketRef.current?.emit(event, data);
  }, []);

  return { socket: socketRef.current, emit };
}
