import React, { useRef, useEffect, useMemo, useState } from 'react';
import { extractYouTubeId } from '../utils/mediaHandler.js';

/**
 * VideoPlayer handles HTML5 video and YouTube iframe embeds.
 *
 * Important: never put the live playback timestamp in the YouTube iframe src.
 * The server heartbeat updates that timestamp every few seconds; changing src
 * remounts/reloads the iframe, which appears as a blink for everyone.
 * Keep src stable per video and control playback with YouTube postMessage.
 */
export default function VideoPlayer({ item, playback }) {
  const videoRef = useRef(null);
  const iframeRef = useRef(null);
  const lastYouTubeSyncRef = useRef({ itemId: null, status: null, seekAt: null });
  const [youTubeId, setYouTubeId] = useState(null);

  const isYouTube = item?.mediaType === 'youtube' ||
    item?.url?.includes('youtube.com') ||
    item?.url?.includes('youtu.be') ||
    item?.url?.includes('youtube.com/embed/');

  useEffect(() => {
    if (isYouTube) {
      const id = extractYouTubeId(item.url);
      setYouTubeId(id);
      lastYouTubeSyncRef.current = { itemId: item?.id || item?.url, status: null, seekAt: null };
    } else {
      setYouTubeId(null);
    }
  }, [item?.id, item?.url, isYouTube]);

  const youtubeSrc = useMemo(() => {
    if (!isYouTube || !youTubeId) return null;
    const origin = encodeURIComponent(window.location.origin);
    return `https://www.youtube.com/embed/${youTubeId}?enablejsapi=1&origin=${origin}&autoplay=0&rel=0&modestbranding=1`;
  }, [isYouTube, youTubeId]);

  const sendYouTubeCommand = (func, args = []) => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage(JSON.stringify({ event: 'command', func, args }), 'https://www.youtube.com');
  };

  // Sync YouTube without reloading the iframe. Seek only when the authoritative
  // position jumps meaningfully; play/pause can be idempotent.
  useEffect(() => {
    if (!isYouTube || !youTubeId || !iframeRef.current) return;

    const sync = lastYouTubeSyncRef.current;
    const itemKey = item?.id || item?.url;
    const expectedSec = playback.timestamp || 0;

    if (sync.itemId !== itemKey) {
      sync.itemId = itemKey;
      sync.status = null;
      sync.seekAt = null;
    }

    if (sync.seekAt === null || Math.abs(sync.seekAt - expectedSec) > 3) {
      sendYouTubeCommand('seekTo', [Math.max(0, expectedSec), true]);
      sync.seekAt = expectedSec;
    }

    if (playback.status !== sync.status) {
      if (playback.status === 'playing') sendYouTubeCommand('playVideo');
      else if (playback.status === 'paused' || playback.status === 'idle') sendYouTubeCommand('pauseVideo');
      sync.status = playback.status;
    }
  }, [isYouTube, youTubeId, item?.id, item?.url, playback.status, playback.timestamp]);

  // YouTube iframe embed
  if (isYouTube && youTubeId) {
    return (
      <div className="youtube-wrap">
        <iframe
          ref={iframeRef}
          src={youtubeSrc}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title={item.title || 'YouTube video'}
        />
      </div>
    );
  }

  // HTML5 video
  return (
    <div className="video-wrap">
      <video
        ref={videoRef}
        key={item?.url}
        src={item?.url}
        controls={false}
        crossOrigin="anonymous"
        onLoadedMetadata={() => {
          if (videoRef.current && playback.timestamp > 0) {
            videoRef.current.currentTime = playback.timestamp;
          }
        }}
        onTimeUpdate={() => {
          // Could emit time for sync, but host controls
        }}
      />
    </div>
  );
}
