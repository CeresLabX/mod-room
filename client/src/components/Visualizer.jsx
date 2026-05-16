import React, { useState, useEffect, useRef, useCallback } from 'react';
import { registry, VISUALIZER_NONE } from '../visualizers/registry.js';

// ─── Existing visualizers (retained inline) ────────────────────────────────

const BAR_COUNT = 24;

function FakeBars({ count = BAR_COUNT }) {
  const [heights, setHeights] = useState(() =>
    Array(count).fill(0).map(() => Math.random() * 60 + 10)
  );
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
        <div key={i} className="eq-bar" style={{ height: `${h}%` }} />
      ))}
    </div>
  );
}

function SpectrumBars({ analyserNode }) {
  const [bars, setBars] = useState(Array(BAR_COUNT).fill(0));
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
        <div key={i} className="eq-bar" style={{ height: `${Math.max(2, h)}%` }} />
      ))}
    </div>
  );
}

function Oscilloscope({ analyserNode }) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const sizeRef = useRef({ W: 0, H: 0 });

  useEffect(() => {
    if (!analyserNode) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');

    const bufferLength = analyserNode.frequencyBinCount;
    const timeData = new Uint8Array(bufferLength);

    const syncSize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      const W = Math.floor(rect.width);
      const H = Math.floor(rect.height);
      if (W === 0 || H === 0) return;
      if (W !== sizeRef.current.W || H !== sizeRef.current.H) {
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        canvas.style.width = W + 'px';
        canvas.style.height = H + 'px';
        ctx.scale(dpr, dpr);
        sizeRef.current = { W, H };
      }
    };

    const ro = new ResizeObserver(syncSize);
    ro.observe(container);
    syncSize();

    const getColor = () =>
      getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#00FF41';
    const getDim = () =>
      getComputedStyle(document.documentElement).getPropertyValue('--dim').trim() || '#008844';

    const draw = () => {
      const { W, H } = sizeRef.current;
      if (W === 0 || H === 0) { rafRef.current = requestAnimationFrame(draw); return; }
      analyserNode.getByteTimeDomainData(timeData);

      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(0, 0, W, H);

      ctx.lineWidth = 2;
      ctx.strokeStyle = getColor();
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = 8;
      ctx.beginPath();

      const sliceWidth = W / bufferLength;
      let x = 0;
      for (let i = 0; i < bufferLength; i++) {
        const v = timeData[i] / 128.0;
        const y = (v * H) / 2;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += sliceWidth;
      }
      ctx.lineTo(W, H / 2);
      ctx.stroke();

      ctx.strokeStyle = getDim();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, H / 2);
      ctx.lineTo(W, H / 2);
      ctx.stroke();

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [analyserNode]);

  return (
    <div className="visualizer-display" style={{ padding: 0 }} ref={containerRef}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', background: '#000' }} />
    </div>
  );
}

function TrackerMeters({ analyserNode }) {
  const [levels, setLevels] = useState(Array(8).fill(0));
  const rafRef = useRef(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!analyserNode) {
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

// ─── Lazy-loaded new visualizers ──────────────────────────────────────────

const LAZY_VISUALIZERS = {
  'starfield':    () => import('../visualizers/StarfieldPulse.jsx' /* @vite-ignore */),
  'vu-meters':    () => import('../visualizers/VUMeterDeck.jsx' /* @vite-ignore */),
  'neon-tunnel':  () => import('../visualizers/NeonTunnel.jsx' /* @vite-ignore */),
  'plasma':       () => import('../visualizers/PlasmaField.jsx' /* @vite-ignore */),
  'pixel-eq':     () => import('../visualizers/PixelEqualizer.jsx' /* @vite-ignore */),
  'piano-roll':   () => import('../visualizers/PianoRoll.jsx' /* @vite-ignore */),
  'matrix-rain':  () => import('../visualizers/MatrixRain.jsx' /* @vite-ignore */),
};

// ─── Visualizer selector UI ─────────────────────────────────────────────────

const STORAGE_KEY = 'modroom-visualizer';

function loadSavedVisualizer() {
  try {
    return localStorage.getItem(STORAGE_KEY) || 'spectrum';
  } catch {
    return 'spectrum';
  }
}

function saveVisualizer(id) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {}
}

export default function Visualizer({ analyserNode, status }) {
  const [selected, setSelected] = useState(loadSavedVisualizer);
  const [LazyComp, setLazyComp] = useState(null);
  const lazyModRef = useRef(null);

  const handleSelect = useCallback((id) => {
    setSelected(id);
    saveVisualizer(id);
    setLazyComp(null);
    lazyModRef.current = null;
  }, []);

  // Load lazy component when selected changes to a lazy one
  useEffect(() => {
    const loader = LAZY_VISUALIZERS[selected];
    if (loader) {
      loader().then(mod => {
        setLazyComp(() => mod.default);
      }).catch(err => {
        console.error('[visualizer] failed to load', selected, err);
        setLazyComp(null);
      });
    }
  }, [selected]);

  // No analyser → always show fake bars
  if (!analyserNode) {
    return <FakeBars count={BAR_COUNT} />;
  }

  // None/off mode
  if (selected === VISUALIZER_NONE) {
    return (
      <div className="visualizer-display" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div className="text-dim text-xs" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>○</div>
          <div>Visualizer OFF</div>
          <div style={{ marginTop: 4 }}>Select a visualizer to reactivate</div>
        </div>
      </div>
    );
  }

  const currentRegistry = registry.find(v => v.id === selected);
  const otherOptions = registry.filter(v => v.id !== selected);

  return (
    <>
      <div className="visualizer-selector">
        <select
          className="visualizer-select"
          value={selected}
          onChange={e => handleSelect(e.target.value)}
        >
          {currentRegistry
            ? <option value={currentRegistry.id}>{currentRegistry.name}</option>
            : null}
          {otherOptions.map(v => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
          <option value={VISUALIZER_NONE}>— OFF —</option>
        </select>
        <button
          className="btn btn-small"
          title="Random visualizer"
          onClick={() => {
            const ids = registry.map(v => v.id).filter(id => id !== VISUALIZER_NONE);
            const pick = ids[Math.floor(Math.random() * ids.length)];
            handleSelect(pick);
          }}
        >
          [⟳]
        </button>
        {currentRegistry && (
          <span className="visualizer-desc">{currentRegistry.description}</span>
        )}
      </div>

      {selected === 'spectrum' && <SpectrumBars analyserNode={analyserNode} />}
      {selected === 'scope' && <Oscilloscope analyserNode={analyserNode} />}
      {selected === 'tracker' && <TrackerMeters analyserNode={analyserNode} />}
      {LazyComp && <LazyComp analyserNode={analyserNode} status={status} />}
    </>
  );
}
