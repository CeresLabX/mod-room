import { useRef, useState, useEffect, useCallback } from 'react';
import { getPlayer } from '../utils/mediaHandler.js';

export function useAudioPlayer({ item, onEnded, onError }) {
  const [status, setStatus] = useState('idle'); // idle, loading, playing, paused, error
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [analyserNode, setAnalyserNode] = useState(null);
  const playerRef = useRef(null);
  const audioContextRef = useRef(null);
  const sourceRef = useRef(null);
  const analyserRef = useRef(null);
  const animFrameRef = useRef(null);
  const pendingPlayRef = useRef(false); // track play requests during item load

  const cleanup = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (sourceRef.current) { try { sourceRef.current.disconnect(); } catch {} }
    if (audioContextRef.current) { try { audioContextRef.current.close(); } catch {} }
    if (playerRef.current) {
      playerRef.current.pause();
      playerRef.current.src = '';
      playerRef.current = null;
    }
    audioContextRef.current = null;
    sourceRef.current = null;
  }, []);

  const initWebAudio = useCallback((element) => {
    if (!element) return;
    try {
      // Close existing context — createMediaElementSource is single-use per context
      if (audioContextRef.current) {
        try { audioContextRef.current.close(); } catch {}
      }
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      analyserRef.current = analyser;
      setAnalyserNode(analyser);
      try {
        const source = ctx.createMediaElementSource(element);
        source.connect(analyser);
        analyser.connect(ctx.destination);
        sourceRef.current = source;
      } catch (e) {
        console.warn('[player] MediaElementSource failed:', e.message);
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      }
    } catch (e) {
      console.warn('[player] Web Audio init failed:', e);
      setAnalyserNode(null);
    }
  }, []);

  // Load and play a new item
  const loadItem = useCallback(async (newItem) => {
    // Capture old player ref so its pending async callbacks stay safe
    cleanup();
    setStatus('loading');
    setCurrentTime(0);
    setDuration(0);

    try {
      const player = await getPlayer(newItem, {
        onLoaded: () => {
          if (player) setDuration(player.duration || 0);
        },
        onTimeUpdate: (t) => setCurrentTime(t),
        onEnded: () => { setStatus('idle'); onEnded && onEnded(); },
        onError: (e) => {
          console.error('[player] error:', e.message || e);
          setStatus('error');
          onError && onError(e);
        },
        onCanPlay: () => {
          setStatus('paused');
          if (player) {
            player.volume = volume;
            initWebAudio(player);
          }
        },
      });

      playerRef.current = player;

      if (pendingPlayRef.current) {
        pendingPlayRef.current = false;
        setTimeout(() => {
          if (playerRef.current) {
            playerRef.current.play().then(() => setStatus('playing')).catch((err) => {
              console.warn('[player] auto-play blocked:', err.message);
              setStatus('paused');
            });
          }
        }, 50);
      }
    } catch (e) {
      console.error('[player] load failed:', e);
      setStatus('error');
      onError && onError(e);
    }
  }, [cleanup, volume, initWebAudio, onEnded, onError]);

  // When item changes, load it
  useEffect(() => {
    if (item) {
      pendingPlayRef.current = false; // reset on new item
      loadItem(item);
    } else {
      cleanup();
      setStatus('idle');
    }
  }, [item]);

  const play = useCallback(async () => {
    if (!playerRef.current) {
      // Player not ready yet — mark pending, loadItem will pick it up
      pendingPlayRef.current = true;
      return;
    }
    try {
      if (audioContextRef.current?.state === 'suspended') {
        await audioContextRef.current.resume().catch((err) => {
          console.warn('[player] audio resume failed:', err.message);
        });
      }
      await playerRef.current.play().catch((err) => {
        console.warn('[player] play blocked:', err.message);
        pendingPlayRef.current = true;
        setStatus('paused');
        return;
      });
      setStatus('playing');
    } catch (e) {
      if (e) console.error('[player] play failed:', e.message || e);
    }
  }, []);

  const pause = useCallback(() => {
    if (!playerRef.current) return;
    playerRef.current.pause();
    setStatus('paused');
  }, []);

  const stop = useCallback(() => {
    if (!playerRef.current) return;
    playerRef.current.pause();
    playerRef.current.currentTime = 0;
    setStatus('idle');
    setCurrentTime(0);
  }, []);

  const seek = useCallback((time) => {
    if (!playerRef.current) return;
    playerRef.current.currentTime = time;
    setCurrentTime(time);
  }, []);

  const changeVolume = useCallback((v) => {
    setVolume(v);
    if (playerRef.current) playerRef.current.volume = v;
  }, []);

  // Sync position from server
  const syncTo = useCallback((timestamp) => {
    if (!playerRef.current || !duration) return;
    const diff = Math.abs(playerRef.current.currentTime - timestamp);
    if (diff > 3) {
      playerRef.current.currentTime = timestamp;
      setCurrentTime(timestamp);
    }
  }, [duration]);

  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  return {
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
  };
}
