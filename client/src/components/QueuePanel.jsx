import React from 'react';

function formatTime(s) {
  if (!s || isNaN(s)) return '?:??';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function getBadgeClass(format) {
  const f = (format || '').toUpperCase();
  if (f === 'YOUTUBE') return 'badge-youtube';
  if (['MID', 'MIDI'].includes(f)) return 'badge-midi';
  if (['MP4', 'WEBM', 'MPEG'].includes(f)) return 'badge-video';
  return 'badge-audio';
}

export default function QueuePanel({ queue, currentItemId, isHost, nickname, onAddMedia, onRemove, onPlayItem }) {
  return (
    <div className="queue-panel">
      <div className="queue-header">
        <span className="queue-header-title">
          {'>> QUEUE'} ({queue.length})
        </span>
        <button className="btn btn-small btn-accent" onClick={onAddMedia}>
          [+ ADD]
        </button>
      </div>

      <div className="queue-list">
        {queue.length === 0 ? (
          <div className="queue-empty">
            <div>Queue is empty</div>
            <div style={{ marginTop: 8 }}>
              <button className="btn btn-small btn-accent" onClick={onAddMedia}>
                [+ ADD MEDIA]
              </button>
            </div>
          </div>
        ) : (
          queue.map((item, idx) => {
            const isCurrent = item.id === currentItemId;
            return (
              <div
                key={item.id}
                className={`queue-item ${isCurrent ? 'now-playing' : ''}`}
              >
                <span className="queue-pos">
                  {isCurrent ? '▶' : `#${idx + 1}`}
                </span>

                <div className="queue-info">
                  <div className="queue-title">{item.title || item.filename || 'Unknown'}</div>
                  <div className="queue-meta">
                    <span className={`badge ${getBadgeClass(item.format)}`}>
                      {item.format || item.mediaType?.toUpperCase() || 'AUDIO'}
                    </span>
                    {' · '}
                    <span>{item.addedBy}</span>
                    {item.duration > 0 && (
                      <>
                        {' · '}
                        <span>{formatTime(item.duration)}</span>
                      </>
                    )}
                  </div>
                </div>

                <button
                  className="queue-play"
                  onClick={() => onPlayItem(item.id)}
                  title="Play this item"
                >
                  [▶]
                </button>

                {(isHost || item.addedBy === nickname) && (
                  <button
                    className="queue-remove"
                    onClick={() => onRemove(item.id)}
                    title="Remove from queue"
                  >
                    [X]
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
