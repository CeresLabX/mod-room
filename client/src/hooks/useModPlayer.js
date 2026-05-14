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

function estimateProtrackerDuration(buffer) {
  const protracker = new Protracker();
  if (!protracker.parse(buffer)) return 0;

  protracker.initialize();
  protracker.flags = 1 + 2;
  protracker.repeat = false;
  protracker.play();

  const chunkSize = 2048;
  const channels = [new Float32Array(chunkSize), new Float32Array(chunkSize)];
  const maxSamples = protracker.samplerate * 60 * 15; // hard cap: 15 minutes
  let samples = 0;

  while (!protracker.endofsong && samples < maxSamples) {
    protracker.mix(channels);
    samples += chunkSize;
  }

  return samples / protracker.samplerate;
}

export function useModPlayer({ item, onEnded, onError }) {
  const [status, setStatus] = useState('idle'); // idle, loading, playing, paused, error
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.8);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [analyserNode, setAnalyserNode] = useState(null);

  const audioContextRef = useRef(null);
  const workletNodeRef = useRef(null);
  const analyserRef = useRef(null);
  const currentItemRef = useRef(null);
  const volumeRef = useRef(0.8);
  const positionTimerRef = useRef(null);
  const pendingPlayRef = useRef(false);
  const statusRef = useRef('idle');
  const durationRef = useRef(0);
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

  // ── Init AudioContext + worklet (once) ────────────────────────────────
  const ensureContext = useCallback(async () => {
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') return audioContextRef.current;

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
      endedRef.current = false;
      setCurrentTime(0);
      setDuration(0);
      durationRef.current = 0;

      // Stop any current playback
      if (workletNodeRef.current) {
        try { workletNodeRef.current.stop?.(); } catch {}
        try { workletNodeRef.current.disconnect(); } catch {}
        workletNodeRef.current = null;
      }

      // Fetch the MOD file. Keep this bounded so a stuck Koofr/Railway stream
      // leaves the player in an error state instead of hanging indefinitely.
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      let response;
      let arrayBuffer;
      try {
        response = await fetch(newItem.url, { signal: controller.signal });
        if (!response.ok) throw new Error(`Failed to fetch MOD: ${response.status}`);
        arrayBuffer = await response.arrayBuffer();
      } finally {
        clearTimeout(timeout);
      }
      const uint8 = new Uint8Array(arrayBuffer);

      const ctx = await ensureContext();

      // Create the worklet node. modplayer does not expose play/pause commands;
      // it only starts the Protracker engine from the constructor when autoplay
      // is true, so pause/play is handled by suspending/resuming the context.
      const ext = (newItem.filename || newItem.url).split('.').pop().toLowerCase();
      const workletNode = loadWorkletFromBuffer(ext, uint8, ctx, {
        options: { autoplay: true, repeat: false },
      });

      // Reconnect to our analyser chain
      workletNode.connect(analyserRef.current);
      analyserRef.current.connect(ctx.destination);
      workletNodeRef.current = workletNode;

      // Estimate duration by simulating the Protracker engine to the actual end
      // of the song. The old row-count formula made many songs show the same
      // short/static length and broke the progress bar.
      const seconds = estimateProtrackerDuration(uint8);
      durationRef.current = seconds;
      setDuration(seconds);

      // Track position for UI
      if (positionTimerRef.current) clearInterval(positionTimerRef.current);
      let elapsed = 0;
      positionTimerRef.current = setInterval(() => {
        if (statusRef.current === 'playing') {
          elapsed += 0.25;
          const songDuration = durationRef.current;
          if (songDuration > 0 && elapsed >= songDuration) {
            elapsed = songDuration;
            setCurrentTime(songDuration);
            setStatus('idle');
            if (!endedRef.current) {
              endedRef.current = true;
              onEndedRef.current && onEndedRef.current();
            }
            clearInterval(positionTimerRef.current);
            positionTimerRef.current = null;
            return;
          }
          setCurrentTime(elapsed);
        }
      }, 250);

      if (pendingPlayRef.current || newItem.autoPlay) {
        pendingPlayRef.current = false;
        if (ctx.state === 'suspended') await ctx.resume();
        setStatus('playing');
      } else {
        if (ctx.state === 'running') await ctx.suspend().catch(() => {});
        setStatus('paused');
      }

      // Handle worklet errors
      workletNode.port.onmessage = (e) => {
        if (e.data?.type === 'ended') {
          setStatus('idle');
          if (!endedRef.current) {
            endedRef.current = true;
            onEndedRef.current && onEndedRef.current();
          }
        }
      };

    } catch (err) {
      console.error('[modplayer] load failed:', err);
      setStatus('error');
      onErrorRef.current && onErrorRef.current(err);
    }
  }, [ensureContext]);

  // ── Play / Pause / Stop ──────────────────────────────────────────────
  const play = useCallback(async () => {
    const node = workletNodeRef.current;
    const ctx = audioContextRef.current;
    if (!node || !ctx) {
      pendingPlayRef.current = true;
      return;
    }

    try {
      // modplayer AudioWorklet playback is controlled by the AudioContext.
      if (ctx.state === 'suspended') {
        await ctx.resume().catch(err => {
          console.warn('[modplayer] AudioContext.resume() failed:', err.message);
          throw err;
        });
      }
      if (ctx.state === 'closed') {
        pendingPlayRef.current = true;
        console.warn('[modplayer] AudioContext is closed — cannot start playback');
        return;
      }
      setAutoplayBlocked(false);
      setStatus('playing');
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        console.warn('[modplayer] Autoplay blocked — user interaction required');
        setAutoplayBlocked(true);
        setStatus('paused');
        return;
      }
      console.error('[modplayer] play failed:', err.message || err);
      setStatus('error');
    }
  }, []);

  const pause = useCallback(() => {
    const ctx = audioContextRef.current;
    pendingPlayRef.current = false;
    if (ctx && ctx.state === 'running') {
      ctx.suspend().catch(() => {});
    }
    setStatus('paused');
  }, []);

  const stop = useCallback(() => {
    const ctx = audioContextRef.current;
    pendingPlayRef.current = false;
    if (ctx && ctx.state === 'running') {
      ctx.suspend().catch(() => {});
    }
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

  const clearAutoplayBlocked = useCallback(() => {
    setAutoplayBlocked(false);
  }, []);

  // ── Load new item ────────────────────────────────────────────────────
  useEffect(() => {
    if (item) {
      loadItem(item);
    } else {
      if (positionTimerRef.current) clearInterval(positionTimerRef.current);
      positionTimerRef.current = null;
      endedRef.current = false;
      durationRef.current = 0;
      setStatus('idle');
      setCurrentTime(0);
      setDuration(0);
      if (workletNodeRef.current) {
        try { workletNodeRef.current.disconnect(); } catch {}
        workletNodeRef.current = null;
      }
    }
  }, [item?.id, loadItem]);

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
    autoplayBlocked,
    clearAutoplayBlocked,
    play,
    pause,
    stop,
    seek,
    changeVolume,
    syncTo: () => {}, // MOD seeking not yet supported
    loadItem,
  };
}
