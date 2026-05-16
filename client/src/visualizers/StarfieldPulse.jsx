// Starfield Pulse — DOS demo-scene starfield that pulses with bass
import React, { useEffect, useRef, useState } from 'react';

function getCSSColor(varName, fallback) {
  if (typeof document === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || fallback;
}

function initStars(count, W, H) {
  return Array.from({ length: count }, () => ({
    x: Math.random() * W,
    y: Math.random() * H,
    z: Math.random() * 3 + 0.5,
    size: Math.random() * 2 + 1,
  }));
}

export default function StarfieldPulse({ analyserNode, status }) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const starsRef = useRef([]);
  const sizeRef = useRef({ W: 0, H: 0 });
  const [bars, setBars] = useState([0, 0, 0, 0, 0, 0, 0, 0]);
  const barsRef = useRef([0, 0, 0, 0, 0, 0, 0, 0]);
  const fakeTimeRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');

    const fakeBars = () => {
      fakeTimeRef.current += 0.05;
      return [
        0.3 + 0.4 * Math.sin(fakeTimeRef.current * 1.1),
        0.5 + 0.3 * Math.sin(fakeTimeRef.current * 0.9 + 1),
        0.4 + 0.3 * Math.sin(fakeTimeRef.current * 1.3 + 2),
        0.6 + 0.3 * Math.sin(fakeTimeRef.current * 0.7 + 0.5),
        0.3 + 0.4 * Math.sin(fakeTimeRef.current * 1.5 + 1.5),
        0.5 + 0.3 * Math.sin(fakeTimeRef.current * 0.8 + 3),
        0.4 + 0.3 * Math.sin(fakeTimeRef.current * 1.2 + 0.8),
        0.6 + 0.3 * Math.sin(fakeTimeRef.current * 1.0 + 2.5),
      ];
    };

    const primary = getCSSColor('--primary', '#00FF41');
    const accent = getCSSColor('--accent', '#00FFFF');
    const highlight = getCSSColor('--highlight', '#FF00FF');

    let bufferLength = 0;
    let dataArray = null;
    if (analyserNode) {
      bufferLength = analyserNode.frequencyBinCount;
      dataArray = new Uint8Array(bufferLength);
    }

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
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        sizeRef.current = { W, H };
        starsRef.current = initStars(80, W, H);
      }
    };

    const ro = new ResizeObserver(syncSize);
    ro.observe(container);
    syncSize();

    const draw = () => {
      const { W, H } = sizeRef.current;
      if (W === 0 || H === 0) { rafRef.current = requestAnimationFrame(draw); return; }

      let bassLevel = 0;
      if (analyserNode && dataArray) {
        analyserNode.getByteFrequencyData(dataArray);
        const bass = Array.from({ length: Math.min(4, bufferLength) }, (_, i) => dataArray[i] / 255);
        bassLevel = bass.reduce((a, b) => a + b, 0) / bass.length;
        const mid = Array.from({ length: Math.min(4, bufferLength) }, (_, i) => dataArray[Math.min(bufferLength - 1, i + 4)] / 255);
        const midLevel = mid.reduce((a, b) => a + b, 0) / mid.length;
        setBars(prev => {
          const next = [...prev];
          for (let i = 0; i < 8; i++) {
            const target = i < 4 ? bassLevel : midLevel;
            next[i] = next[i] * 0.7 + target * 0.3;
          }
          return next;
        });
        barsRef.current = Array.from({ length: 8 }, (_, i) => i < 4 ? bassLevel : midLevel);
      } else {
        const fb = fakeBars();
        bassLevel = (fb[0] + fb[1] + fb[2] + fb[3]) / 4;
        setBars(fb);
        barsRef.current = fb;
      }

      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(0, 0, W, H);

      if (Math.random() < 0.02) {
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.fillRect(0, Math.random() * H, W, 2);
      }

      const stars = starsRef.current;
      const bassStretch = 1 + bassLevel * 4;

      for (const star of stars) {
        star.z -= 0.02 * star.z;
        if (star.z <= 0) {
          star.x = Math.random() * W;
          star.y = Math.random() * H;
          star.z = 3.5;
        }

        const scale = 1 / star.z;
        const sx = (star.x - W / 2) * scale * bassStretch + W / 2;
        const sy = (star.y - H / 2) * scale * bassStretch + H / 2;
        const stretch = bassLevel * 10 * star.z;
        const color = star.z > 2 ? accent : primary;
        const alpha = Math.min(1, (3 - star.z) / 2);

        if (sx >= 0 && sx <= W && sy >= 0 && sy <= H) {
          ctx.beginPath();
          ctx.arc(sx, sy, star.size * scale * (1 + bassLevel), 0, Math.PI * 2);
          ctx.fillStyle = color + Math.floor(alpha * 200).toString(16).padStart(2, '0');
          ctx.shadowColor = color;
          ctx.shadowBlur = 8 * bassLevel;
          ctx.fill();

          if (stretch > 1) {
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(sx - star.x * 0.02 * bassLevel, sy - star.y * 0.02 * bassLevel);
            ctx.strokeStyle = color + '80';
            ctx.lineWidth = Math.max(0.5, star.size * scale);
            ctx.stroke();
          }
        }
      }

      if (bassLevel > 0.3) {
        ctx.strokeStyle = accent + '30';
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, W - 2, H - 2);
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
    <div className="visualizer-display" style={{ padding: 0, alignItems: 'stretch' }} ref={containerRef}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', background: '#000' }} />
    </div>
  );
}
