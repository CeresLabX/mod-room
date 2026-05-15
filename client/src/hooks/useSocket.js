import { useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

// Always use the current origin — works in dev (Vite proxy), staging, and production
// without relying on NODE_ENV being set correctly at build time.
const SOCKET_URL = window.location.origin;

export function useSocket(handlers) {
  const socketRef = useRef(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      path: '/socket.io',
      // Start with HTTP long-polling, then upgrade to WebSocket when available.
      // Railway / mobile networks can intermittently reject the initial WS
      // handshake; polling-first keeps add-to-queue usable instead of showing
      // a scary "websocket error".
      transports: ['polling', 'websocket'],
      upgrade: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 3000,
      timeout: 10000,
      tryAllTransports: true,
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
