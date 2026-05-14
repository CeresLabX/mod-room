/**
 * useModPlayer — plays MOD/XM/S3M/IT tracker files via AudioWorklet.
 * Uses the modplayer package (Protracker engine + AudioWorklet).
 *
 * Architecture:
 * - One persistent AudioContext for all MOD tracks (worklet registration is per-context)
 * - MOD files fetched from URL → passed to loadWorkletFromBuffer
 * - Player node connected to analyser → destination
 */

import { useRef, useState, useEffect, useCallback } from 'react';
import { loadWorkletFromBuffer } from 'modplayer';
import { Protracker } from 'modplayer';

// Cache the worklet URL so it's only fetched/registered once
let workletUrlCache = null;
let workletLoadPromise = null;

async function getWorkletUrl() {
  if (workletUrlCache) return workletUrlCache;
  if (workletLoadPromise) return workletLoadPromise;

  workletLoadPromise = (async () => {
    // Vite transforms the ?worker&url import into a blob URL for the worket script
    const url = await import('modplayer/worklet?worker&url');
    workletUrlCache = url.default || url;
    return workletUrlCache;
  })();

  return workletLoadPromise;
}

export function useModPlayer({ item, onEnded, onError }) {
  const [status, setStatus] = useState('idle'); // idle, loading, playing, paused, error
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.8);
  const [analyserNode, setAnalyserNode] = useState(null);

  const audioContextRef = useRef(null);
  const workletNodeRef = useRef(null);
  const analyserRef = useRef(null);
  const currentItemRef = useRef(null);
  const volumeRef = useRef(0.8);
  const positionTimerRef = useRef(null);

  // ── Init AudioContext + worklet (once) ────────────────────────────────
  const ensureContext = useCallback(async () => {
    if (audioContextRef.current) return audioContextRef.current;

    const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 44100 });
    audioContextRef.current = ctx;

    // Register the AudioWorklet
    const workletUrl = await getWorkletUrl();
    await ctx.audioWorklet.addModule(workletUrl);

    // Create analyser
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 128;
    analyserRef.current = analyser;
    setAnalyserNode(analyser);

    return ctx;
  }, []);

  // ── Load a MOD file ──────────────────────────────────────────────────
  const loadItem = useCallback(async (newItem) => {
    try {
      setStatus('loading');
      currentItemRef.current = newItem;
      setCurrentTime(0);

      // Stop any current playback
      if (workletNodeRef.current) {
        try { workletNodeRef.current.stop?.(); } catch {}
        try { workletNodeRef.current.disconnect(); } catch {}
        workletNodeRef.current = null;
      }

      // Fetch the MOD file
      const response = await fetch(newItem.url);
      if (!response.ok) throw new Error(`Failed to fetch MOD: ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuffer);

      // Get sample rate from context
      const ctx = await ensureContext();
      if (ctx.state === 'suspended') await ctx.resume();

      // Create the worklet node
      const ext = (newItem.filename || newItem.url).split('.').pop().toLowerCase();
      const workletNode = loadWorkletFromBuffer(ext, uint8, ctx, {
        options: { autoplay: false, repeat: true },
      });

      // Reconnect to our analyser chain
      workletNode.connect(analyserRef.current);
      analyserRef.current.connect(ctx.destination);
      workletNodeRef.current = workletNode;

      // Estimate duration from Protracker
      const protracker = new Protracker();
      if (protracker.parse(uint8)) {
        protracker.initialize();
        // songlen is in positions, speed is rows/beat, bpm is beats/minute
        const songLen = protracker.songlen || 64;
        const speed = protracker.speed || 6;
        const bpm = protracker.bpm || 125;
        const rowsPerPos = 64;
        const seconds = (songLen * rowsPerPos * speed) / (bpm * 2.5);
        setDuration(Math.max(seconds, 10));
      } else {
        setDuration(0);
      }

      // Track position for UI
      if (positionTimerRef.current) clearInterval(positionTimerRef.current);
      let elapsed = 0;
      positionTimerRef.current = setInterval(() => {
        if (status === 'playing') {
          elapsed += 0.25;
          setCurrentTime(elapsed);
        }
      }, 250);

      setStatus('paused');

      // Handle worklet errors
      workletNode.port.onmessage = (e) => {
        if (e.data?.type === 'ended') {
          setStatus('idle');
          onEnded && onEnded();
        }
      };

      // Autoplay if requested
      if (newItem.autoPlay) {
        setTimeout(() => play(), 100);
      }
    } catch (err) {
      console.error('[modplayer] load failed:', err);
      setStatus('error');
      onError && onError(err);
    }
  }, [ensureContext, onEnded, onError, status]);

  // ── Play / Pause / Stop ──────────────────────────────────────────────
  const play = useCallback(async () => {
    const node = workletNodeRef.current;
    const ctx = audioContextRef.current;
    if (!node || !ctx) return;

    try {
      if (ctx.state === 'suspended') await ctx.resume();
      node.start?.();
      setStatus('playing');
    } catch (err) {
      console.error('[modplayer] play failed:', err);
    }
  }, []);

  const pause = useCallback(() => {
    const node = workletNodeRef.current;
    if (!node) return;
    try { node.pause?.(); } catch {}
    try { node.stop?.(); } catch {}
    setStatus('paused');
  }, []);

  const stop = useCallback(() => {
    const node = workletNodeRef.current;
    if (!node) return;
    try { node.stop?.(); } catch {}
    setStatus('idle');
    setCurrentTime(0);
  }, []);

  const seek = useCallback((time) => {
    // Seeking in a MOD is complex — for now just reset
    setCurrentTime(time);
  }, []);

  const changeVolume = useCallback((v) => {
    volumeRef.current = v;
    setVolumeState(v);
    if (workletNodeRef.current) {
      workletNodeRef.current.volume = v;
    }
  }, []);

  // ── Load new item ────────────────────────────────────────────────────
  useEffect(() => {
    if (item) {
      loadItem(item);
    }
  }, [item]);

  // ── Cleanup on unmount ───────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (positionTimerRef.current) clearInterval(positionTimerRef.current);
      if (workletNodeRef.current) {
        try { workletNodeRef.current.disconnect(); } catch {}
      }
      if (audioContextRef.current) {
        try { audioContextRef.current.close(); } catch {}
      }
    };
  }, []);

  return {
    status,
    currentTime,
    duration,
    volume,
    analyserNode,
    analyserRef,
    playerRef: workletNodeRef,
    isModPlayer: true,
    play,
    pause,
    stop,
    seek,
    changeVolume,
    syncTo: () => {}, // MOD seeking not yet supported
    loadItem,
  };
}
