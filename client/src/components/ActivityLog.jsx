import React, { useEffect, useRef } from 'react';

function formatTs(ts) {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
}

export default function ActivityLog({ activities }) {
  const logRef = useRef(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [activities.length]);

  return (
    <div className="activity-panel">
      <div className="activity-header">
        {'>> ACTIVITY LOG'}
      </div>
      <div className="activity-log" ref={logRef}>
        {activities.length === 0 ? (
          <div className="activity-entry">No activity yet...</div>
        ) : (
          activities.slice(-50).map((a, i) => (
            <div key={i} className={`activity-entry ${a.type}`}>
              <span style={{ color: 'var(--dim)', marginRight: 4 }}>[{formatTs(a.ts)}]</span>
              {a.message}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
