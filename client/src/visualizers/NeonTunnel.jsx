// Neon Tunnel — fast, beat-reactive retro wireframe tunnel
import React, { useEffect, useRef } from 'react';

function css(v, f) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim() || f; }
function avg(data, a, b) {
  let sum = 0;
  const start = Math.max(0, Math.floor(a));
  const end = Math.max(start + 1, Math.floor(b));
  for (let i = start; i < end; i++) sum += data[Math.min(data.length - 1, i)] || 0;
  return sum / ((end - start) * 255);
}

export default function NeonTunnel({ analyserNode }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const sizeRef = useRef({ W: 0, H: 0 });
  const stateRef = useRef({ t: 0, bass: 0, mid: 0, high: 0, beat: 0, lastBass: 0 });

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    const primary = css('--primary', '#00FF41');
    const accent = css('--accent', '#00FFFF');
    const hi = css('--highlight', '#FF00FF');
    const data = analyserNode ? new Uint8Array(analyserNode.frequencyBinCount) : null;

    const sync = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = wrap.getBoundingClientRect();
      const W = Math.max(1, Math.floor(rect.width));
      const H = Math.max(1, Math.floor(rect.height));
      if (W === sizeRef.current.W && H === sizeRef.current.H) return;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sizeRef.current = { W, H };
    };

    const draw = () => {
      const { W, H } = sizeRef.current;
      if (!W || !H) { rafRef.current = requestAnimationFrame(draw); return; }
      const s = stateRef.current;

      let bass, mid, high;
      if (analyserNode && data) {
        analyserNode.getByteFrequencyData(data);
        bass = avg(data, 0, data.length * 0.12);
        mid = avg(data, data.length * 0.12, data.length * 0.5);
        high = avg(data, data.length * 0.5, data.length);
      } else {
        bass = 0.32 + 0.45 * Math.abs(Math.sin(s.t * 2.4));
        mid = 0.26 + 0.42 * Math.abs(Math.sin(s.t * 1.8 + 1.4));
        high = 0.18 + 0.45 * Math.abs(Math.sin(s.t * 3.3));
      }

      const deltaBass = Math.max(0, bass - s.lastBass);
      s.lastBass = bass;
      s.beat = Math.max(s.beat * 0.86, Math.min(1, deltaBass * 5.5));
      s.bass = s.bass * 0.55 + bass * 0.45;
      s.mid = s.mid * 0.62 + mid * 0.38;
      s.high = s.high * 0.5 + high * 0.5;

      // Faster baseline with beat kick, but bounded for smooth browsers.
      s.t += 0.035 + s.bass * 0.09 + s.mid * 0.035 + s.beat * 0.075;
      const t = s.t;
      const cx = W / 2 + Math.sin(t * 1.7) * W * 0.10 * (0.4 + s.mid);
      const cy = H / 2 + Math.cos(t * 1.35) * H * 0.10 * (0.35 + s.high);
      const maxR = Math.hypot(W, H) * (0.58 + s.beat * 0.1);

      ctx.fillStyle = `rgba(0,0,0,${0.30 - Math.min(0.12, s.beat * 0.1)})`;
      ctx.fillRect(0, 0, W, H);

      const rings = 24;
      const spokes = 30;
      const squash = 0.62 + s.mid * 0.12;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Radial spokes first: cheap, crisp motion cue.
      for (let i = 0; i < spokes; i++) {
        const a0 = (i / spokes) * Math.PI * 2 + t * (2.2 + s.high * 1.7);
        ctx.beginPath();
        for (let r = 1; r < rings; r++) {
          const p = ((r / rings) + t * 1.45) % 1;
          const twist = p * (5.5 + s.mid * 5) + Math.sin(t + i) * 0.1;
          const rad = p * p * maxR * (1 + s.bass * 0.45 + s.beat * 0.35);
          const x = cx + Math.cos(a0 + twist) * rad;
          const y = cy + Math.sin(a0 + twist) * rad * squash;
          if (r === 1) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `${accent}${Math.floor(34 + s.high * 120 + s.beat * 80).toString(16).padStart(2, '0')}`;
        ctx.lineWidth = 0.45 + s.high * 1.2 + s.beat * 0.8;
        ctx.stroke();
      }

      for (let r = 0; r < rings; r++) {
        const p = ((r / rings) + t * 1.45) % 1;
        const alpha = Math.max(0, 1 - p);
        const rad = p * p * maxR * (1 + s.bass * 0.5 + s.beat * 0.42);
        const twist = t * (6 + s.mid * 4) + p * 10;
        const color = r % 3 === 0 ? accent : r % 3 === 1 ? primary : hi;
        ctx.beginPath();
        for (let i = 0; i <= spokes; i++) {
          const a = (i / spokes) * Math.PI * 2 + twist;
          const wobble = 1 + Math.sin(a * 6 + t * 9) * (0.025 + s.high * 0.06);
          const x = cx + Math.cos(a) * rad * wobble;
          const y = cy + Math.sin(a) * rad * wobble * squash;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.shadowColor = color;
        ctx.shadowBlur = 2 + alpha * 6 + s.beat * 14;
        ctx.strokeStyle = `${color}${Math.floor(alpha * (110 + s.bass * 95 + s.beat * 45)).toString(16).padStart(2, '0')}`;
        ctx.lineWidth = 0.7 + alpha * 2.2 + s.beat * 1.8;
        ctx.stroke();
      }

      ctx.shadowBlur = 0;
      const core = 28 + s.bass * 80 + s.beat * 120;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, core);
      g.addColorStop(0, `${hi}${Math.floor(95 + s.beat * 120).toString(16).padStart(2, '0')}`);
      g.addColorStop(0.45, `${accent}${Math.floor(35 + s.bass * 70).toString(16).padStart(2, '0')}`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - core, cy - core, core * 2, core * 2);

      rafRef.current = requestAnimationFrame(draw);
    };

    const ro = new ResizeObserver(sync);
    ro.observe(wrap);
    sync();
    rafRef.current = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(rafRef.current); ro.disconnect(); };
  }, [analyserNode]);

  return (
    <div className="visualizer-display" style={{ padding: 0 }} ref={wrapRef}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', background: '#000' }} />
    </div>
  );
}
