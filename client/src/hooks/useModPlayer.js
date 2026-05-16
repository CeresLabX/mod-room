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

const DEFAULT_VOLUME = 0.2;
const VOLUME_KEY = 'modroom-volume';

function loadSavedVolume() {
  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    if (raw === null) return DEFAULT_VOLUME;
    const value = Number(raw);
    return Number.isFinite(value) ? Math.min(1, Math.max(0.01, value / 100)) : DEFAULT_VOLUME;
  } catch {
    return DEFAULT_VOLUME;
  }
}

function saveVolume(v) {
  try { localStorage.setItem(VOLUME_KEY, String(Math.round(v * 100))); } catch {}
}

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
  const [volume, setVolumeState] = useState(loadSavedVolume);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [analyserNode, setAnalyserNode] = useState(null);

  const audioContextRef = useRef(null);
  const workletNodeRef = useRef(null);
  const gainRef = useRef(null);
  const analyserRef = useRef(null);
  const currentItemRef = useRef(null);
  const volumeRef = useRef(loadSavedVolume());
  const [channelEnabled, setChannelEnabled] = useState(() => Array(16).fill(true));
  const channelEnabledRef = useRef(Array(16).fill(true));
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

    // Create gain + analyser chain. MOD worklet nodes do not expose a
    // working `.volume` property, so volume must be controlled via GainNode.
    const gain = ctx.createGain();
    gain.gain.value = volumeRef.current;
    gainRef.current = gain;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.55;
    analyserRef.current = analyser;
    setAnalyserNode(analyser);

    gain.connect(analyser);
    analyser.connect(ctx.destination);

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
      channelEnabledRef.current.forEach((enabled, channel) => {
        workletNode.port.postMessage({ type: 'set-channel-muted', channel, muted: !enabled });
      });

      // Reconnect to our gain/analyser chain
      workletNode.connect(gainRef.current);
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
        let resumed = false;
        try {
          if (ctx.state === 'suspended') {
            await ctx.resume();
          }
          resumed = ctx.state !== 'suspended';
        } catch (err) {
          if (err.name !== 'NotAllowedError') {
            throw err;
          }
          // NotAllowedError — fall through to blocked handling below
        }
        if (!resumed) {
          console.warn('[modplayer] Autoplay blocked — user interaction required');
          setAutoplayBlocked(true);
          setStatus('paused');
        } else {
          setAutoplayBlocked(false);
          setStatus('playing');
        }
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
    const next = Math.min(1, Math.max(0.01, Number(v) || DEFAULT_VOLUME));
    volumeRef.current = next;
    setVolumeState(next);
    saveVolume(next);
    if (gainRef.current) {
      gainRef.current.gain.value = next;
    }
  }, []);

  const setChannelEnabledAt = useCallback((channel, enabled) => {
    const index = Math.max(0, Math.min(15, Number(channel) || 0));
    const nextEnabled = Boolean(enabled);
    setChannelEnabled(prev => {
      const next = [...prev];
      next[index] = nextEnabled;
      channelEnabledRef.current = next;
      return next;
    });
    workletNodeRef.current?.port?.postMessage({
      type: 'set-channel-muted',
      channel: index,
      muted: !nextEnabled,
    });
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
      if (gainRef.current) {
        try { gainRef.current.disconnect(); } catch {}
      }
      if (analyserRef.current) {
        try { analyserRef.current.disconnect(); } catch {}
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
    channelEnabled,
    setChannelEnabledAt,
    syncTo: () => {}, // MOD seeking not yet supported
    loadItem,
  };
}
