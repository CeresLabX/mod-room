import React, { useState, useEffect, useRef } from 'react';

const BAR_COUNT = 24;

// Fallback: fake animated bars
function FakeBars({ count = BAR_COUNT }) {
  const [heights, setHeights] = useState(() => Array(count).fill(0).map(() => Math.random() * 60 + 10));
  const intervalRef = useRef(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setHeights(prev => prev.map(() => Math.random() * 80 + 10));
    }, 120);
    return () => clearInterval(intervalRef.current);
  }, []);

  return (
    <div className="visualizer-display">
      {heights.map((h, i) => (
        <div
          key={i}
          className="eq-bar"
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  );
}

// Spectrum bars via Web Audio
function SpectrumBars({ analyserNode, animFrameRef, playerRef }) {
  const [bars, setBars] = useState(Array(BAR_COUNT).fill(0));
  const canvasRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!analyserNode) return;

    const bufferLength = analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      analyserNode.getByteFrequencyData(dataArray);
      const step = Math.floor(bufferLength / BAR_COUNT);
      const newBars = Array(BAR_COUNT).fill(0).map((_, i) => {
        const val = dataArray[i * step] || 0;
        return (val / 255) * 100;
      });
      setBars(newBars);
      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [analyserNode]);

  return (
    <div className="visualizer-display">
      {bars.map((h, i) => (
        <div
          key={i}
          className="eq-bar"
          style={{ height: `${Math.max(2, h)}%` }}
        />
      ))}
    </div>
  );
}

// Oscilloscope waveform
function Oscilloscope({ analyserNode, animFrameRef, playerRef }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!analyserNode) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;

    const bufferLength = analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      // Also get time domain
      const timeData = new Uint8Array(bufferLength);
      analyserNode.getByteTimeDomainData(timeData);

      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(0, 0, W, H);

      ctx.lineWidth = 2;
      ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#00FF41';
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = 8;
      ctx.beginPath();

      const sliceWidth = W / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = timeData[i] / 128.0;
        const y = (v * H) / 2;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
        x += sliceWidth;
      }

      ctx.lineTo(W, H / 2);
      ctx.stroke();

      // Grid lines
      ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--dim').trim() || '#008844';
      ctx.shadowBlur = 0;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, H / 2);
      ctx.lineTo(W, H / 2);
      ctx.stroke();

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [analyserNode]);

  return (
    <div className="visualizer-display" style={{ padding: 0 }}>
      <canvas
        ref={canvasRef}
        className="oscilloscope"
        width={400}
        height={100}
        style={{ width: '100%', height: '100%', background: '#000' }}
      />
    </div>
  );
}

// Fake tracker-style channel meters
function TrackerMeters({ analyserNode, animFrameRef, playerRef }) {
  const [levels, setLevels] = useState(Array(8).fill(0));
  const rafRef = useRef(null);

  useEffect(() => {
    if (!analyserNode) {
      // Fake animation
      const interval = setInterval(() => {
        setLevels(prev => prev.map(() => Math.random() * 80 + 5));
      }, 100);
      return () => clearInterval(interval);
    }

    const bufferLength = analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      analyserNode.getByteFrequencyData(dataArray);
      const step = Math.floor(bufferLength / 8);
      const newLevels = Array(8).fill(0).map((_, i) => {
        const val = dataArray[i * step] || 0;
        return (val / 255) * 100;
      });
      setLevels(newLevels);
      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [analyserNode]);

  return (
    <div className="visualizer-display" style={{ flexDirection: 'column', justifyContent: 'center' }}>
      <div className="tracker-meters">
        {levels.map((level, i) => (
          <div key={i} className="tracker-channel">
            <span className="tracker-ch-num">CH{i + 1}</span>
            <div className="tracker-level">
              <div className="tracker-level-fill" style={{ width: `${level}%` }} />
            </div>
            <span style={{ color: 'var(--dim)', fontSize: 'var(--font-size-xs)', width: 28 }}>
              {Math.round(level)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Visualizer({ analyserNode, analyserRef, animFrameRef, playerRef, status }) {
  const [mode, setMode] = useState('spectrum');

  // No analyser = use fake bars
  if (!analyserNode) {
    return <FakeBars count={BAR_COUNT} />;
  }

  return (
    <>
      <div className="visualizer-tabs">
        <button
          className={`visualizer-tab ${mode === 'spectrum' ? 'active' : ''}`}
          onClick={() => setMode('spectrum')}
        >
          SPECTRUM
        </button>
        <button
          className={`visualizer-tab ${mode === 'scope' ? 'active' : ''}`}
          onClick={() => setMode('scope')}
        >
          SCOPE
        </button>
        <button
          className={`visualizer-tab ${mode === 'tracker' ? 'active' : ''}`}
          onClick={() => setMode('tracker')}
        >
          TRACKER
        </button>
      </div>

      {mode === 'spectrum' && (
        <SpectrumBars
          analyserNode={analyserNode}
          analyserRef={analyserRef}
          animFrameRef={animFrameRef}
          playerRef={playerRef}
        />
      )}
      {mode === 'scope' && (
        <Oscilloscope
          analyserNode={analyserNode}
          analyserRef={analyserRef}
          animFrameRef={animFrameRef}
          playerRef={playerRef}
        />
      )}
      {mode === 'tracker' && (
        <TrackerMeters
          analyserNode={analyserNode}
          analyserRef={analyserRef}
          animFrameRef={animFrameRef}
          playerRef={playerRef}
        />
      )}
    </>
  );
}
