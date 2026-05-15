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
      autoConnect: false,
    });
    socketRef.current = socket;

    const notifyConnected = (reconnected = false) => {
      handlersRef.current.onConnect?.({ socket, socketId: socket.id, reconnected });
    };

    socket.on('connect', () => notifyConnected(false));
    socket.io.on('reconnect', () => notifyConnected(true));

    socket.on('room-state', (data) => handlersRef.current.onRoomState?.(data));
    socket.on('playback-update', (data) => handlersRef.current.onPlaybackUpdate?.(data));
    socket.on('queue-updated', (data) => handlersRef.current.onQueueUpdated?.(data));
    socket.on('user-joined', (data) => handlersRef.current.onUserJoined?.(data));
    socket.on('user-left', (data) => handlersRef.current.onUserLeft?.(data));
    socket.on('activity', (data) => handlersRef.current.onActivity?.(data));
    socket.on('reaction', (data) => handlersRef.current.onReaction?.(data));
    socket.on('seek', (data) => handlersRef.current.onSeek?.(data));
    socket.on('error', (data) => handlersRef.current.onError?.(data));

    // Connect only after all listeners are attached. This prevents the room
    // rejoin from being missed on fast refreshes where Socket.IO connects
    // before React has registered the join handler.
    socket.connect();

    return () => socket.disconnect();
  }, []);

  const emit = useCallback((event, data) => {
    socketRef.current?.emit(event, data);
  }, []);

  return { socket: socketRef, emit };
}
