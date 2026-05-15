// Pixel Equalizer — Chunky DOS/VGA-style block equalizer
import React, { useEffect, useRef, useState } from 'react';

function getCSSColor(varName, fallback) {
  if (typeof document === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || fallback;
}

export default function PixelEqualizer({ analyserNode, status }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const fakeTimeRef = useRef(0);
  const [bars, setBars] = useState(Array(16).fill(0));
  const barsRef = useRef(Array(16).fill(0));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const primary = getCSSColor('--primary', '#00FF41');
    const accent = getCSSColor('--accent', '#00FFFF');
    const highlight = getCSSColor('--highlight', '#FF00FF');
    const dim = getCSSColor('--dim', '#004400');

    const COLS = 16;
    const ROWS = 12;
    const BLOCK_W = 24;
    const BLOCK_H = 8;
    const GAP = 2;
    const W = COLS * (BLOCK_W + GAP) - GAP;
    const H = ROWS * (BLOCK_H + GAP) - GAP;
    canvas.width = W;
    canvas.height = H;

    let bufferLength = 0;
    let dataArray = null;
    if (analyserNode) {
      bufferLength = analyserNode.frequencyBinCount;
      dataArray = new Uint8Array(bufferLength);
    }

    const draw = () => {
      // Get bands
      let newBars;
      if (analyserNode && dataArray) {
        analyserNode.getByteFrequencyData(dataArray);
        const step = Math.floor(bufferLength / COLS);
        newBars = Array.from({ length: COLS }, (_, i) => {
          const val = dataArray[Math.min(i * step + step / 2, bufferLength - 1)] / 255;
          return barsRef.current[i] * 0.7 + val * 0.3;
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

      // Clear
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, W, H);

      // Border
      ctx.strokeStyle = dim + '80';
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, W - 1, H - 1);

      // Grid overlay (subtle)
      ctx.strokeStyle = dim + '20';
      ctx.lineWidth = 0.5;
      for (let x = BLOCK_W + GAP; x < W; x += BLOCK_W + GAP) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
      for (let y = BLOCK_H + GAP; y < H; y += BLOCK_H + GAP) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }

      // Draw blocks column by column
      for (let col = 0; col < COLS; col++) {
        const level = newBars[col]; // 0..1
        const filledRows = Math.round(level * ROWS);
        const x = col * (BLOCK_W + GAP);

        for (let row = 0; row < ROWS; row++) {
          const y = (ROWS - 1 - row) * (BLOCK_H + GAP);
          const isActive = row < filledRows;

          if (isActive) {
            // Color gradient by row
            const color = row < 3 ? highlight : row < 7 ? accent : primary;
            const brightness = row / ROWS;
            ctx.fillStyle = color;
            ctx.shadowColor = color;
            ctx.shadowBlur = row >= filledRows - 1 ? 6 : 2;
            ctx.fillRect(x, y, BLOCK_W, BLOCK_H);
            ctx.shadowBlur = 0;

            // Pixel highlight (top-left shine)
            if (row >= filledRows - 1 && level > 0.2) {
              ctx.fillStyle = 'rgba(255,255,255,0.3)';
              ctx.fillRect(x + 1, y + 1, 4, 2);
            }
          } else {
            // Inactive block
            ctx.fillStyle = '#0d1a0d';
            ctx.fillRect(x, y, BLOCK_W, BLOCK_H);
            ctx.strokeStyle = dim + '40';
            ctx.lineWidth = 0.5;
            ctx.strokeRect(x + 0.5, y + 0.5, BLOCK_W - 1, BLOCK_H - 1);
          }
        }
      }

      // Segmented look (horizontal dividers in each block)
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 1;
      for (let row = 0; row < ROWS; row++) {
        const y = row * (BLOCK_H + GAP) + BLOCK_H;
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
    return () => cancelAnimationFrame(rafRef.current);
  }, [analyserNode, status]);

  return (
    <div className="visualizer-display" style={{ padding: 0, justifyContent: 'center' }}>
      <canvas
        ref={canvasRef}
        style={{ background: '#0a0a0a' }}
      />
    </div>
  );
}
