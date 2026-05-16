// Starfield Pulse — audio-reactive warp-speed demo-scene starfield
import React, { useEffect, useRef } from 'react';

function css(v, f) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim() || f; }
function avg(data, a, b) { let s = 0, n = 0; for (let i = a; i < b; i++) { s += data[Math.min(data.length - 1, i)] || 0; n++; } return n ? s / (n * 255) : 0; }
function initStars(count, W, H) {
  return Array.from({ length: count }, () => ({
    x: (Math.random() - 0.5) * W * 2,
    y: (Math.random() - 0.5) * H * 2,
    z: Math.random() * W,
    pz: 0,
    size: Math.random() * 1.6 + 0.6,
  }));
}

export default function StarfieldPulse({ analyserNode }) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const starsRef = useRef([]);
  const sizeRef = useRef({ W: 0, H: 0 });
  const energyRef = useRef({ bass: 0, mid: 0, high: 0, total: 0 });
  const timeRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    const primary = css('--primary', '#00FF41');
    const accent = css('--accent', '#00FFFF');
    const highlight = css('--highlight', '#FF00FF');
    const data = analyserNode ? new Uint8Array(analyserNode.frequencyBinCount) : null;

    const syncSize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      const W = Math.floor(rect.width), H = Math.floor(rect.height);
      if (!W || !H) return;
      if (W !== sizeRef.current.W || H !== sizeRef.current.H) {
        canvas.width = W * dpr; canvas.height = H * dpr;
        canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        sizeRef.current = { W, H };
        starsRef.current = initStars(Math.max(220, Math.floor(W * H / 1800)), W, H);
      }
    };
    const ro = new ResizeObserver(syncSize); ro.observe(container); syncSize();

    const draw = () => {
      const { W, H } = sizeRef.current;
      if (!W || !H) { rafRef.current = requestAnimationFrame(draw); return; }
      timeRef.current += 1;
      let bass, mid, high, total;
      if (analyserNode && data) {
        analyserNode.getByteFrequencyData(data);
        bass = avg(data, 0, Math.max(3, data.length * 0.10));
        mid = avg(data, data.length * 0.12, data.length * 0.45);
        high = avg(data, data.length * 0.45, data.length);
        total = avg(data, 0, data.length);
      } else {
        const t = timeRef.current * 0.035;
        bass = 0.45 + 0.35 * Math.abs(Math.sin(t * 1.7));
        mid = 0.35 + 0.35 * Math.abs(Math.sin(t * 1.1 + 1));
        high = 0.25 + 0.25 * Math.abs(Math.sin(t * 2.3));
        total = (bass + mid + high) / 3;
      }
      const e = energyRef.current;
      e.bass = e.bass * 0.70 + bass * 0.30;
      e.mid = e.mid * 0.75 + mid * 0.25;
      e.high = e.high * 0.65 + high * 0.35;
      e.total = e.total * 0.75 + total * 0.25;

      ctx.fillStyle = `rgba(0,0,0,${0.28 - Math.min(0.12, e.total * 0.08)})`;
      ctx.fillRect(0, 0, W, H);
      const cx = W / 2 + Math.sin(timeRef.current * 0.017) * W * 0.08 * e.mid;
      const cy = H / 2 + Math.cos(timeRef.current * 0.013) * H * 0.08 * e.high;
      const speed = 2.5 + e.bass * 42 + e.total * 16;

      for (const s of starsRef.current) {
        s.pz = s.z;
        s.z -= speed * (0.35 + s.size * 0.45);
        if (s.z < 1) {
          s.x = (Math.random() - 0.5) * W * 2;
          s.y = (Math.random() - 0.5) * H * 2;
          s.z = W;
          s.pz = s.z;
        }
        const k = W / s.z;
        const pk = W / s.pz;
        const x = s.x * k + cx, y = s.y * k + cy;
        const px = s.x * pk + cx, py = s.y * pk + cy;
        if (x < -50 || x > W + 50 || y < -50 || y > H + 50) continue;
        const color = s.size > 1.5 ? highlight : e.high > 0.35 ? accent : primary;
        ctx.strokeStyle = color + Math.floor(Math.min(255, 90 + e.total * 165)).toString(16).padStart(2, '0');
        ctx.lineWidth = Math.max(1, s.size * (0.8 + e.bass * 2.2));
        ctx.shadowColor = color; ctx.shadowBlur = 4 + e.bass * 14;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke();
      }
      ctx.shadowBlur = 0;
      if (e.bass > 0.28) {
        ctx.strokeStyle = accent + Math.floor(e.bass * 150).toString(16).padStart(2, '0');
        ctx.lineWidth = 1 + e.bass * 5;
        ctx.strokeRect(2, 2, W - 4, H - 4);
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(rafRef.current); ro.disconnect(); };
  }, [analyserNode]);

  return <div className="visualizer-display" style={{ padding: 0 }} ref={containerRef}><canvas ref={canvasRef} style={{ width: '100%', height: '100%', background: '#000' }} /></div>;
}
