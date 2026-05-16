// Pixel Equalizer — Chunky DOS/VGA-style block equalizer
import React, { useEffect, useRef, useState } from 'react';

function getCSSColor(varName, fallback) {
  if (typeof document === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || fallback;
}

export default function PixelEqualizer({ analyserNode, status }) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const fakeTimeRef = useRef(0);
  const sizeRef = useRef({ W: 0, H: 0 });
  const COLS = 80;
  const ROWS = 24;
  const [bars, setBars] = useState(Array(COLS).fill(0));
  const barsRef = useRef(Array(COLS).fill(0));

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');

    const primary = getCSSColor('--primary', '#00FF41');
    const accent = getCSSColor('--accent', '#00FFFF');
    const highlight = getCSSColor('--highlight', '#FF00FF');
    const dim = getCSSColor('--dim', '#004400');

    const GAP = 1;

    let bufferLength = 0;
    let dataArray = null;
    if (analyserNode) {
      bufferLength = analyserNode.frequencyBinCount;
      dataArray = new Uint8Array(bufferLength);
    }

    const syncSize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      const availW = Math.floor(rect.width);
      const availH = Math.floor(rect.height);
      if (availW === 0 || availH === 0) return;

      // Compute block sizes to fill the whole frame with many more columns.
      const blockW = Math.max(2, Math.floor((availW - GAP * (COLS - 1)) / COLS));
      const blockH = Math.max(2, Math.floor((availH - GAP * (ROWS - 1)) / ROWS));
      const W = availW;
      const H = availH;

      if (W !== sizeRef.current.W || H !== sizeRef.current.H) {
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        canvas.style.width = W + 'px';
        canvas.style.height = H + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        sizeRef.current = { W, H, blockW, blockH };
      }
    };

    const ro = new ResizeObserver(syncSize);
    ro.observe(container);
    syncSize();

    const draw = () => {
      const { W, H, blockW, blockH } = sizeRef.current;
      if (W === 0 || H === 0) { rafRef.current = requestAnimationFrame(draw); return; }

      let newBars;
      if (analyserNode && dataArray) {
        analyserNode.getByteFrequencyData(dataArray);
        newBars = Array.from({ length: COLS }, (_, i) => {
          const pos = (i / Math.max(1, COLS - 1)) * (bufferLength - 1);
          const lo = Math.floor(pos);
          const hi = Math.min(bufferLength - 1, lo + 1);
          const frac = pos - lo;
          const val = ((dataArray[lo] || 0) * (1 - frac) + (dataArray[hi] || 0) * frac) / 255;
          const boosted = Math.min(1, val * 1.45);
          return barsRef.current[i] * 0.62 + boosted * 0.38;
        });
      } else {
        fakeTimeRef.current += 0.04;
        newBars = Array.from({ length: COLS }, (_, i) => {
          const base = 0.3 + 0.4 * Math.abs(Math.sin(fakeTimeRef.current + i * 0.4));
          return barsRef.current[i] * 0.7 + base * 0.3;
        });
      }
      barsRef.current = newBars;
      setBars([...newBars]);

      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, W, H);

      ctx.strokeStyle = dim + '80';
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, W - 1, H - 1);

      ctx.strokeStyle = dim + '20';
      ctx.lineWidth = 0.5;
      for (let x = blockW + GAP; x < W; x += blockW + GAP) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
      for (let y = blockH + GAP; y < H; y += blockH + GAP) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }

      for (let col = 0; col < COLS; col++) {
        const level = newBars[col];
        const filledRows = Math.round(level * ROWS);
        const x = col * (blockW + GAP);

        for (let row = 0; row < ROWS; row++) {
          const y = (ROWS - 1 - row) * (blockH + GAP);
          const isActive = row < filledRows;

          if (isActive) {
            const color = row > ROWS * 0.78 ? highlight : row > ROWS * 0.52 ? accent : primary;
            ctx.fillStyle = color;
            ctx.shadowColor = color;
            ctx.shadowBlur = row >= filledRows - 1 ? 6 : 2;
            ctx.fillRect(x, y, blockW, blockH);
            ctx.shadowBlur = 0;

            if (row >= filledRows - 1 && level > 0.2) {
              ctx.fillStyle = 'rgba(255,255,255,0.3)';
              ctx.fillRect(x + 1, y + 1, Math.max(2, Math.floor(blockW * 0.2)), Math.max(1, Math.floor(blockH * 0.3)));
            }
          } else {
            ctx.fillStyle = '#0d1a0d';
            ctx.fillRect(x, y, blockW, blockH);
            ctx.strokeStyle = dim + '40';
            ctx.lineWidth = 0.5;
            ctx.strokeRect(x + 0.5, y + 0.5, blockW - 1, blockH - 1);
          }
        }
      }

      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 1;
      for (let row = 0; row < ROWS; row++) {
        const y = row * (blockH + GAP) + blockH;
        if (y < H) {
          ctx.beginPath();
          ctx.moveTo(0, y - 1);
          ctx.lineTo(W, y - 1);
          ctx.stroke();
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [analyserNode, status]);

  return (
    <div className="visualizer-display" style={{ padding: 0, justifyContent: 'stretch', alignItems: 'stretch' }} ref={containerRef}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', background: '#0a0a0a', imageRendering: 'pixelated' }} />
    </div>
  );
}
