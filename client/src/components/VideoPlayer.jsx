import React, { useRef, useEffect, useState } from 'react';
import { extractYouTubeId } from '../utils/mediaHandler.js';

/**
 * VideoPlayer handles HTML5 video and YouTube iframe embeds.
 * YouTube sync is approximate — host controls the real player,
 * but we can seek the iframe to the correct position.
 */
export default function VideoPlayer({ item, playback }) {
  const videoRef = useRef(null);
  const [youTubeId, setYouTubeId] = useState(null);

  const isYouTube = item?.mediaType === 'youtube' ||
    item?.url?.includes('youtube.com') ||
    item?.url?.includes('youtu.be') ||
    item?.url?.includes('youtube.com/embed/');

  useEffect(() => {
    if (isYouTube) {
      const id = extractYouTubeId(item.url);
      setYouTubeId(id);
    } else {
      setYouTubeId(null);
    }
  }, [item?.url, isYouTube]);

  // YouTube iframe embed
  if (isYouTube && youTubeId) {
    const isPlaying = playback.status === 'playing';
    const startTime = playback.timestamp || 0;

    return (
      <div className="youtube-wrap">
        <iframe
          src={`https://www.youtube.com/embed/${youTubeId}?enablejsapi=1&start=${Math.floor(startTime)}&autoplay=${isPlaying ? 1 : 0}&rel=0&modestbranding=1`}
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
