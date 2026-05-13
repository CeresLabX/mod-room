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
    if (playerRef.current) {
      playerRef.current.pause();
      playerRef.current.src = '';
      playerRef.current = null;
    }
  }, []);

  const initWebAudio = useCallback((element) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (sourceRef.current) { try { sourceRef.current.disconnect(); } catch {} }
      const ctx = audioContextRef.current;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      analyserRef.current = analyser;
      setAnalyserNode(analyser);
      const source = ctx.createMediaElementSource(element);
      source.connect(analyser);
      analyser.connect(ctx.destination);
      sourceRef.current = source;
    } catch (e) {
      console.warn('[player] Web Audio init failed:', e);
      setAnalyserNode(null);
    }
  }, []);

  // Load and play a new item
  const loadItem = useCallback(async (newItem) => {
    cleanup();
    setStatus('loading');
    setCurrentTime(0);
    setDuration(0);

    try {
      const player = await getPlayer(newItem, {
        onLoaded: () => {
          if (playerRef.current) {
            setDuration(playerRef.current.duration || 0);
          }
        },
        onTimeUpdate: (t) => setCurrentTime(t),
        onEnded: () => { setStatus('idle'); onEnded && onEnded(); },
        onError: (e) => {
          console.error('[player] error:', e);
          setStatus('error');
          onError && onError(e);
        },
        onCanPlay: () => {
          setStatus('paused');
          if (playerRef.current) {
            playerRef.current.volume = volume;
            if (analyserRef.current) {
              // already initialized
            } else {
              initWebAudio(playerRef.current);
            }
          }
        },
      });

      playerRef.current = player;

      // If a play was requested while loading, fire it now
      if (pendingPlayRef.current) {
        pendingPlayRef.current = false;
        setTimeout(() => player.play().then(() => setStatus('playing')).catch(() => {}), 50);
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
        await audioContextRef.current.resume();
      }
      await playerRef.current.play();
      setStatus('playing');
    } catch (e) {
      console.error('[player] play failed:', e);
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
