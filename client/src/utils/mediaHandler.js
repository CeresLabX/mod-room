/**
 * Media handler — returns the appropriate player element for a given media item.
 * Supports: audio (native), video (native), YouTube (iframe), MIDI/MOD (jzz)
 */

let jzzInstance = null;

async function getJZZ() {
  if (!jzzInstance) {
    try {
      const JZZ = (await import('jzz')).default;
      jzzInstance = JZZ;
      await JZZ().openMidiOutput(); // try to open a MIDI output
    } catch (e) {
      console.warn('[jzz] init warning:', e);
      jzzInstance = null;
    }
  }
  return jzzInstance;
}

// YouTube URL → video ID
export function extractYouTubeId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

export function isYouTubeUrl(url) {
  return extractYouTubeId(url) !== null;
}

function detectMediaType(item) {
  if (item.mediaType) return item.mediaType;
  if (isYouTubeUrl(item.url)) return 'youtube';
  const ext = (item.filename || item.url).split('.').pop().toLowerCase();
  const audioExts = ['mp3', 'wav', 'ogg', 'midi', 'mid', 'mod', 'xm', 's3m', 'it'];
  if (audioExts.includes(ext)) return 'audio';
  return 'video';
}

function detectFormat(item) {
  if (item.format) return item.format;
  const ext = (item.filename || item.url).split('.').pop().toLowerCase();
  return ext.toUpperCase();
}

export async function getPlayer(item, callbacks = {}) {
  const type = detectMediaType(item);
  const fmt = detectFormat(item);
  const { onLoaded, onTimeUpdate, onEnded, onError, onCanPlay } = callbacks;

  // ── AUDIO ────────────────────────────────────────────────────────────────
  if (type === 'audio') {
    const el = new Audio();
    el.crossOrigin = 'anonymous';
    el.src = item.url;

    if (onLoaded) el.addEventListener('loadedmetadata', () => onLoaded());
    if (onTimeUpdate) el.addEventListener('timeupdate', () => onTimeUpdate(el.currentTime));
    if (onEnded) el.addEventListener('ended', onEnded);
    if (onError) el.addEventListener('error', (e) => onError(new Error(`Audio load error: ${el.error?.message || 'unknown'}`)));
    if (onCanPlay) el.addEventListener('canplay', onCanPlay);

    el.load();
    return el;
  }

  // ── MIDI ─────────────────────────────────────────────────────────────────
  if (type === 'midi' || fmt === 'MID' || fmt === 'MIDI') {
    const JZZ = await getJZZ();
    if (!JZZ) {
      throw new Error('MIDI playback unavailable — jzz could not initialize');
    }

    // Return a pseudo-player that plays via jzz
    const player = {
      play: async () => {
        try {
          await JZZ().playMIDI(item.url);
        } catch (e) {
          throw new Error(`MIDI playback failed: ${e.message}`);
        }
      },
      pause: () => {},
      resume: () => {},
      stop: () => {},
      get currentTime() { return 0; },
      set currentTime(t) {},
      get duration() { return 0; },
      volume: 1,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    // Auto-play after short delay (jzz is not a media element)
    setTimeout(() => callbacks.onCanPlay && callbacks.onCanPlay(), 100);
    return player;
  }

  // ── MOD/XM/S3M/IT ─────────────────────────────────────────────────────────
  if (type === 'mod' || ['MOD', 'XM', 'S3M', 'IT'].includes(fmt)) {
    const JZZ = await getJZZ();
    if (!JZZ) {
      throw new Error('Tracker module playback unavailable — jzz could not initialize');
    }

    // jzz can load MOD/XM files
    const player = {
      play: async () => {
        try {
          const port = await JZZ().openMidiOutput().catch(() => null);
          // jzz doesn't directly play MOD files without SoundFont
          // Try loading it as a module
          await JZZ().load({ file: item.url });
          // This may not work for all MOD/XM files in browser
          console.warn('[jzz] MOD/XM playback is experimental — sound quality depends on SoundFont');
        } catch (e) {
          throw new Error(`Module playback failed: ${e.message}`);
        }
      },
      pause: () => {},
      resume: () => {},
      stop: () => {},
      get currentTime() { return 0; },
      set currentTime(t) {},
      get duration() { return 0; },
      volume: 1,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    setTimeout(() => callbacks.onCanPlay && callbacks.onCanPlay(), 100);
    return player;
  }

  // ── YOUTUBE ────────────────────────────────────────────────────────────────
  if (type === 'youtube') {
    const videoId = extractYouTubeId(item.url);
    if (!videoId) throw new Error('Invalid YouTube URL');

    // Return a pseudo-player that the VideoPlayer component handles via iframe
    return {
      isYouTube: true,
      videoId,
      url: item.url,
      play: () => {},
      pause: () => {},
      stop: () => {},
      get currentTime() { return 0; },
      set currentTime(t) {},
      get duration() { return 0; },
      volume: 1,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
  }

  // ── VIDEO ────────────────────────────────────────────────────────────────
  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.src = item.url;
  video.preload = 'metadata';

  if (onLoaded) video.addEventListener('loadedmetadata', () => onLoaded());
  if (onTimeUpdate) video.addEventListener('timeupdate', () => onTimeUpdate(video.currentTime));
  if (onEnded) video.addEventListener('ended', onEnded);
  if (onError) video.addEventListener('error', (e) => onError(new Error(`Video load error: ${video.error?.message || 'unknown'}`)));
  if (onCanPlay) video.addEventListener('canplay', onCanPlay);

  video.load();
  return video;
}

export function canPlayType(item) {
  const type = detectMediaType(item);
  const fmt = detectFormat(item);

  if (type === 'youtube') return true;
  if (type === 'audio') {
    const el = new Audio();
    const canPlay = el.canPlayType(`audio/${fmt.toLowerCase()}`);
    return canPlay === 'probably' || canPlay === 'maybe';
  }
  if (type === 'video') return true;
  if (['MID', 'MIDI'].includes(fmt)) {
    // We can try jzz but can't guarantee
    return true;
  }
  if (['MOD', 'XM', 'S3M', 'IT'].includes(fmt)) {
    return true; // experimental
  }
  return true; // optimistic
}

export function getUnsupportedMessage(item) {
  const fmt = detectFormat(item);
  const type = detectMediaType(item);

  if (type === 'youtube') return 'YouTube videos require an internet connection.';
  if (['MID', 'MIDI'].includes(fmt)) return 'MIDI playback uses jzz + SoundFont. Sound quality depends on your system.';
  if (['MOD', 'XM', 'S3M', 'IT'].includes(fmt)) return 'Tracker module playback is experimental. MOD/XM synthesis quality depends on available SoundFonts.';
  return `Format ${fmt} may not be supported in your browser.`;
}
