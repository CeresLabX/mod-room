// VU Meter Deck — polished retro stereo + 16-channel activity deck
import React, { useEffect, useRef } from 'react';

function css(v, f) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim() || f; }
function band(data, start, end) {
  let sum = 0;
  const a = Math.max(0, Math.floor(start));
  const b = Math.max(a + 1, Math.floor(end));
  for (let i = a; i < b; i++) sum += data[Math.min(data.length - 1, i)] || 0;
  return sum / ((b - a) * 255);
}

export default function VUMeterDeck({ analyserNode }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const sizeRef = useRef({ W: 0, H: 0 });
  const stateRef = useRef({ l: 0, r: 0, lp: 0, rp: 0, ch: Array(16).fill(0), t: 0 });

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext('2d');
    const primary = css('--primary', '#00FF41');
    const accent = css('--accent', '#00FFFF');
    const hi = css('--highlight', '#FF00FF');
    const dim = css('--dim', '#008844');
    const data = analyserNode ? new Uint8Array(analyserNode.frequencyBinCount) : null;

    const syncSize = () => {
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

    const rounded = (x, y, w, h, r = 8) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    };

    const drawLedMeter = (label, value, peak, x, y, w, h) => {
      rounded(x, y, w, h, 10);
      ctx.fillStyle = '#050805';
      ctx.fill();
      ctx.strokeStyle = `${dim}80`;
      ctx.lineWidth = 1;
      ctx.stroke();

      const titleH = Math.max(18, h * 0.2);
      ctx.fillStyle = '#0b140b';
      ctx.fillRect(x + 1, y + 1, w - 2, titleH);
      ctx.fillStyle = accent;
      ctx.font = `bold ${Math.max(11, titleH * 0.48)}px monospace`;
      ctx.textAlign = 'left';
      ctx.fillText(label, x + 12, y + titleH * 0.68);
      ctx.textAlign = 'right';
      ctx.fillStyle = value > 0.82 ? hi : primary;
      ctx.fillText(`${Math.round(value * 100).toString().padStart(3, ' ')}%`, x + w - 12, y + titleH * 0.68);

      const meterY = y + titleH + 10;
      const meterH = h - titleH - 26;
      const segs = Math.max(30, Math.floor(w / 13));
      const gap = 3;
      const sw = (w - 24 - gap * (segs - 1)) / segs;
      for (let i = 0; i < segs; i++) {
        const p = (i + 1) / segs;
        const active = p <= value;
        const color = p > 0.88 ? hi : p > 0.68 ? accent : primary;
        ctx.fillStyle = active ? color : `${dim}24`;
        ctx.shadowColor = color;
        ctx.shadowBlur = active ? 5 + value * 11 : 0;
        rounded(x + 12 + i * (sw + gap), meterY, sw, meterH, 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      const px = x + 12 + Math.min(1, peak) * (w - 24);
      ctx.fillStyle = peak > 0.88 ? hi : accent;
      ctx.fillRect(px - 2, meterY - 4, 4, meterH + 8);

      ctx.fillStyle = `${dim}aa`;
      ctx.font = `${Math.max(9, h * 0.09)}px monospace`;
      ctx.textAlign = 'center';
      ['-40', '-24', '-12', '-6', '0', '+3'].forEach((mark, i) => {
        ctx.fillText(mark, x + 12 + (i / 5) * (w - 24), y + h - 7);
      });
    };

    const draw = () => {
      const { W, H } = sizeRef.current;
      if (!W || !H) { rafRef.current = requestAnimationFrame(draw); return; }
      const s = stateRef.current;
      s.t += 0.045;

      let bass = 0.35, mid = 0.32, high = 0.25;
      if (analyserNode && data) {
        analyserNode.getByteFrequencyData(data);
        bass = band(data, 0, data.length * 0.16);
        mid = band(data, data.length * 0.16, data.length * 0.55);
        high = band(data, data.length * 0.55, data.length);
      } else {
        bass = 0.3 + 0.45 * Math.abs(Math.sin(s.t * 1.7));
        mid = 0.25 + 0.4 * Math.abs(Math.sin(s.t * 1.2 + 1));
        high = 0.2 + 0.35 * Math.abs(Math.sin(s.t * 2.6));
      }

      const lTarget = Math.min(1, (bass * 0.62 + mid * 0.32 + high * 0.12) * 1.85);
      const rTarget = Math.min(1, (bass * 0.5 + mid * 0.45 + high * 0.18) * 1.8);
      s.l = s.l * 0.72 + lTarget * 0.28;
      s.r = s.r * 0.72 + rTarget * 0.28;
      s.lp = Math.max(s.lp * 0.976, s.l);
      s.rp = Math.max(s.rp * 0.976, s.r);

      ctx.fillStyle = '#020402';
      ctx.fillRect(0, 0, W, H);
      const glow = ctx.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, Math.max(W, H) * 0.7);
      glow.addColorStop(0, `rgba(0,255,180,${0.06 + bass * 0.05})`);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);

      const pad = Math.max(12, W * 0.018);
      const topH = Math.max(70, H * 0.3);
      drawLedMeter('LEFT BUS', s.l, s.lp, pad, pad, W - pad * 2, topH);
      drawLedMeter('RIGHT BUS', s.r, s.rp, pad, pad * 2 + topH, W - pad * 2, topH);

      const gridY = pad * 3 + topH * 2;
      const gridH = Math.max(40, H - gridY - pad);
      const cols = 16;
      const gap = 5;
      const cellW = (W - pad * 2 - gap * (cols - 1)) / cols;
      for (let i = 0; i < cols; i++) {
        const target = data ? band(data, (i / cols) * data.length, ((i + 1) / cols) * data.length) : 0.2 + 0.5 * Math.abs(Math.sin(s.t * (1.4 + i * 0.04) + i));
        s.ch[i] = s.ch[i] * 0.62 + Math.min(1, target * 2.1) * 0.38;
        const x = pad + i * (cellW + gap);
        ctx.fillStyle = '#061006';
        ctx.fillRect(x, gridY, cellW, gridH);
        ctx.strokeStyle = `${dim}55`;
        ctx.strokeRect(x + 0.5, gridY + 0.5, cellW - 1, gridH - 1);
        const fillH = Math.max(2, (gridH - 18) * s.ch[i]);
        const color = s.ch[i] > 0.82 ? hi : s.ch[i] > 0.58 ? accent : primary;
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 5 + s.ch[i] * 10;
        ctx.fillRect(x + 4, gridY + gridH - 15 - fillH, Math.max(2, cellW - 8), fillH);
        ctx.shadowBlur = 0;
        ctx.fillStyle = `${dim}dd`;
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(String(i + 1).padStart(2, '0'), x + cellW / 2, gridY + gridH - 4);
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    const ro = new ResizeObserver(syncSize);
    ro.observe(wrap);
    syncSize();
    rafRef.current = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(rafRef.current); ro.disconnect(); };
  }, [analyserNode]);

  return (
    <div className="visualizer-display" style={{ padding: 0 }} ref={wrapRef}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', background: '#000' }} />
    </div>
  );
}
