/**
 * useTrackerPlayer — React hook for playing tracker files via chiptune3/libopenmpt.
 * Similar interface to useModPlayer.
 *
 * item shape: { url, filename, format, ... }
 */

import { useRef, useState, useEffect, useCallback } from 'react';
import { getAdapterForFile } from '../utils/getTrackerAdapter.js';
import { AhxPlayerAdapter } from '../utils/AhxPlayerAdapter.js';

const DEFAULT_VOLUME = 0.2;
const VOLUME_KEY = 'modroom-volume';
function loadSavedVolume() {
  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    if (raw === null) return DEFAULT_VOLUME;
    const value = Number(raw);
    return Number.isFinite(value) ? Math.min(1, Math.max(0.01, value / 100)) : DEFAULT_VOLUME;
  } catch { return DEFAULT_VOLUME; }
}
function saveVolume(v) {
  try { localStorage.setItem(VOLUME_KEY, String(Math.round(v * 100))); } catch {}
}

export function useTrackerPlayer({ item, audioContext, onEnded, onError }) {
  const [status, setStatus] = useState('idle'); // idle, loading, playing, paused, error
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(loadSavedVolume);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [analyserNode, setAnalyserNode] = useState(null);
  const [metadata, setMetadata] = useState(null);
  const [isTrackerPlayer] = useState(true);

  const adapterRef = useRef(null);
  const audioContextRef = useRef(null);
  const currentItemRef = useRef(null);
  const volumeRef = useRef(loadSavedVolume());
  const positionTimerRef = useRef(null);
  const pendingPlayRef = useRef(false);
  const statusRef = useRef('idle');
  const endedRef = useRef(false);
  const onEndedRef = useRef(onEnded);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // ── Load a tracker file ─────────────────────────────────────────────
  const loadItem = useCallback(async (newItem) => {
    const filename = newItem?.filename || newItem?.url?.split('/').pop() || 'unknown';
    const ext = (filename || '').split('.').pop().toLowerCase();

    try {
      setStatus('loading');
      currentItemRef.current = newItem;
      endedRef.current = false;
      setCurrentTime(0);
      setDuration(0);
      setMetadata(null);

      // Dispose old adapter
      if (adapterRef.current) {
        try { adapterRef.current.dispose(); } catch {}
        adapterRef.current = null;
      }

      if (!newItem) return;

      // Use provided AudioContext or create one
      const ctx = audioContext || audioContextRef.current;
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        const newCtx = new AC({ sampleRate: 44100 });
        audioContextRef.current = newCtx;
      }
      const activeCtx = audioContext || audioContextRef.current;

      // Fetch the file with timeout
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      let response;
      let arrayBuffer;
      try {
        response = await fetch(newItem.url, { signal: controller.signal });
        if (!response.ok) throw new Error(`Failed to fetch tracker: ${response.status}`);
        arrayBuffer = await response.arrayBuffer();
      } finally {
        clearTimeout(timeout);
      }

      // Log for debugging non-.mod tracker files
      console.info(`[tracker-player] Loading: "${filename}" (.${ext}) from ${newItem.url}`);

      // Create adapter
      const adapter = getAdapterForFile(filename, activeCtx);
      adapterRef.current = adapter;

      // Set volume
      adapter.setVolume(volumeRef.current);

      // Set up analyser
      const analyser = adapter.getAnalyserNode();
      if (analyser) {
        setAnalyserNode(analyser);
      }

      // Load the file
      const meta = await adapter.load(arrayBuffer, filename);
      setMetadata(meta);
      setDuration(meta.durationSeconds || 0);

      // Handle AHX specially — it's experimental and can't play yet
      if (meta.warnings && meta.warnings.some(w => w.includes('experimental'))) {
        setStatus('paused');
        return;
      }

      // Start position tracking
      if (positionTimerRef.current) clearInterval(positionTimerRef.current);
      positionTimerRef.current = setInterval(() => {
        const a = adapterRef.current;
        if (!a || statusRef.current !== 'playing') return;
        const pos = a.getPositionSeconds();
        setCurrentTime(pos);
        const dur = a.getDurationSeconds();
        if (dur !== null && dur > 0 && pos >= dur - 0.1) {
          setCurrentTime(dur);
          setStatus('idle');
          if (!endedRef.current) {
            endedRef.current = true;
            onEndedRef.current && onEndedRef.current();
          }
          clearInterval(positionTimerRef.current);
          positionTimerRef.current = null;
        }
      }, 250);

      if (pendingPlayRef.current || newItem.autoPlay) {
        pendingPlayRef.current = false;
        let resumed = false;
        try {
          if (activeCtx.state === 'suspended') {
            await activeCtx.resume();
          }
          resumed = activeCtx.state !== 'suspended';
        } catch (err) {
          if (err.name !== 'NotAllowedError') throw err;
        }
        if (!resumed) {
          console.warn('[tracker] autoplay blocked');
          setAutoplayBlocked(true);
          setStatus('paused');
        } else {
          setAutoplayBlocked(false);
          setStatus('playing');
          adapter.playFrom(0);
        }
      } else {
        if (activeCtx.state === 'running') {
          await activeCtx.suspend().catch(() => {});
        }
        setStatus('paused');
      }

    } catch (err) {
      console.error(`[tracker] load failed for "${filename}" (.${ext}):`, err.message || err);
      setStatus('error');
      onErrorRef.current && onErrorRef.current(err);
    }
  }, [audioContext]);

  // ── Play / Pause / Stop / Seek ──────────────────────────────────────
  const play = useCallback(async () => {
    const adapter = adapterRef.current;
    const ctx = audioContextRef.current;
    if (!adapter) {
      pendingPlayRef.current = true;
      return;
    }

    if (adapter instanceof AhxPlayerAdapter) {
      console.warn('[tracker] AHX playback not available');
      return;
    }

    try {
      const activeCtx = audioContext || ctx;
      if (activeCtx.state === 'suspended') {
        await activeCtx.resume().catch(err => {
          if (err.name !== 'NotAllowedError') throw err;
          setAutoplayBlocked(true);
          setStatus('paused');
          return;
        });
      }
      setAutoplayBlocked(false);
      setStatus('playing');
      adapter.playFrom(currentTime);
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setAutoplayBlocked(true);
        setStatus('paused');
        return;
      }
      console.error('[tracker] play failed:', err);
      setStatus('error');
    }
  }, [audioContext, currentTime]);

  const pause = useCallback(() => {
    if (adapterRef.current) {
      adapterRef.current.pause();
    }
    setStatus('paused');
  }, []);

  const stop = useCallback(() => {
    if (adapterRef.current) {
      adapterRef.current.stop();
    }
    setStatus('idle');
    setCurrentTime(0);
  }, []);

  const seek = useCallback((time) => {
    if (adapterRef.current) {
      adapterRef.current.seek(time);
    }
    setCurrentTime(time);
  }, []);

  const changeVolume = useCallback((v) => {
    const next = Math.min(1, Math.max(0.01, Number(v) || DEFAULT_VOLUME));
    volumeRef.current = next;
    setVolumeState(next);
    saveVolume(next);
    if (adapterRef.current) {
      adapterRef.current.setVolume(next);
    }
  }, []);

  const clearAutoplayBlocked = useCallback(() => {
    setAutoplayBlocked(false);
  }, []);

  const syncTo = useCallback((secs) => {
    if (adapterRef.current) {
      adapterRef.current.seek(secs);
      setCurrentTime(secs);
    }
  }, []);

  // ── Load new item ────────────────────────────────────────────────────
  useEffect(() => {
    if (item) {
      loadItem(item);
    } else {
      if (positionTimerRef.current) clearInterval(positionTimerRef.current);
      positionTimerRef.current = null;
      endedRef.current = false;
      setStatus('idle');
      setCurrentTime(0);
      setDuration(0);
      setMetadata(null);
      if (adapterRef.current) {
        try { adapterRef.current.dispose(); } catch {}
        adapterRef.current = null;
      }
    }
  }, [item?.id, loadItem]);

  // ── Cleanup on unmount ───────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (positionTimerRef.current) clearInterval(positionTimerRef.current);
      if (adapterRef.current) {
        try { adapterRef.current.dispose(); } catch {}
      }
    };
  }, []);

  return {
    status,
    currentTime,
    duration,
    volume,
    analyserNode,
    analyserRef: { current: analyserNode },
    isTrackerPlayer,
    autoplayBlocked,
    clearAutoplayBlocked,
    play,
    pause,
    stop,
    seek,
    changeVolume,
    syncTo,
    loadItem,
    metadata,
  };
}
