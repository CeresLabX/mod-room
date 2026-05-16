// VU Meter Deck — Left/right retro stereo VU meters
import React, { useEffect, useRef } from 'react';

function getCSSColor(varName, fallback) {
  if (typeof document === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || fallback;
}

export default function VUMeterDeck({ analyserNode, status }) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const levelsRef = useRef({ left: 0, right: 0, leftPeak: 0, rightPeak: 0 });
  const sizeRef = useRef({ W: 0, H: 0 });
  const fakeTimeRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');

    const primary = getCSSColor('--primary', '#00FF41');
    const accent = getCSSColor('--accent', '#00FFFF');
    const highlight = getCSSColor('--highlight', '#FF00FF');
    const dim = getCSSColor('--dim', '#008844');

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
      }
    };

    const ro = new ResizeObserver(syncSize);
    ro.observe(container);
    syncSize();

    const draw = () => {
      const { W, H } = sizeRef.current;
      if (W === 0 || H === 0) { rafRef.current = requestAnimationFrame(draw); return; }

      let left = 0, right = 0;
      if (analyserNode && dataArray) {
        analyserNode.getByteFrequencyData(dataArray);
        const half = Math.floor(bufferLength / 2);
        let leftSum = 0, rightSum = 0;
        for (let i = 0; i < half; i++) leftSum += dataArray[i];
        for (let i = half; i < bufferLength; i++) rightSum += dataArray[i];
        left = leftSum / (half * 255);
        right = rightSum / (half * 255);
      } else {
        fakeTimeRef.current += 0.04;
        left = 0.4 + 0.35 * Math.sin(fakeTimeRef.current * 1.1) + 0.1 * Math.sin(fakeTimeRef.current * 3.1);
        right = 0.45 + 0.3 * Math.sin(fakeTimeRef.current * 0.9 + 1.3) + 0.1 * Math.sin(fakeTimeRef.current * 2.7);
        left = Math.max(0, Math.min(1, left));
        right = Math.max(0, Math.min(1, right));
      }

      levelsRef.current.left = levelsRef.current.left * 0.7 + left * 0.3;
      levelsRef.current.right = levelsRef.current.right * 0.7 + right * 0.3;
      if (left > levelsRef.current.leftPeak) levelsRef.current.leftPeak = left;
      if (right > levelsRef.current.rightPeak) levelsRef.current.rightPeak = right;
      levelsRef.current.leftPeak *= 0.985;
      levelsRef.current.rightPeak *= 0.985;

      const l = levelsRef.current.left;
      const r = levelsRef.current.right;
      const lp = levelsRef.current.leftPeak;
      const rp = levelsRef.current.rightPeak;

      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, W, H);

      // Grid
      ctx.strokeStyle = dim + '40';
      ctx.lineWidth = 0.5;
      for (let i = 1; i < 10; i++) {
        const x = (i / 10) * W;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
      for (let i = 1; i < 6; i++) {
        const y = (i / 6) * H;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }

      // Scale labels
      ctx.fillStyle = dim;
      ctx.font = `${Math.max(8, Math.floor(H * 0.09))}px monospace`;
      ctx.textAlign = 'center';
      const labels = ['0', '-2', '-4', '-6', '-8', '-10', '-14', '-20', '-∞'];
      for (let i = 0; i < labels.length; i++) {
        ctx.fillText(labels[i], (i / (labels.length - 1)) * W, H - 2);
      }

      const meterH = H - Math.max(18, H * 0.15);
      const barW = (W / 2) - 16;

      // Left meter
      ctx.fillStyle = '#111';
      ctx.fillRect(4, 4, barW, meterH);

      const lH = l * meterH;
      const lGrad2 = ctx.createLinearGradient(0, meterH - lH, 0, meterH);
      lGrad2.addColorStop(0, accent);
      lGrad2.addColorStop(1, primary);
      ctx.fillStyle = lGrad2;
      ctx.shadowColor = l > 0.8 ? highlight : accent;
      ctx.shadowBlur = l > 0.7 ? 8 : 4;
      ctx.fillRect(4, meterH - lH + 4, barW, lH);
      ctx.shadowBlur = 0;

      const lpH = (1 - lp) * meterH;
      ctx.fillStyle = lp > 0.85 ? highlight : primary;
      ctx.fillRect(4, lpH + 4, barW, 2);

      // Right meter
      ctx.fillStyle = '#111';
      ctx.fillRect(W / 2 + 4, 4, barW, meterH);

      const rH = r * meterH;
      const rGrad = ctx.createLinearGradient(0, meterH - rH, 0, meterH);
      rGrad.addColorStop(0, accent);
      rGrad.addColorStop(1, primary);
      ctx.fillStyle = rGrad;
      ctx.shadowColor = r > 0.8 ? highlight : accent;
      ctx.shadowBlur = r > 0.7 ? 8 : 4;
      ctx.fillRect(W / 2 + 4, meterH - rH + 4, barW, rH);
      ctx.shadowBlur = 0;

      const rpH = (1 - rp) * meterH;
      ctx.fillStyle = rp > 0.85 ? highlight : primary;
      ctx.fillRect(W / 2 + 4, rpH + 4, barW, 2);

      // Labels
      ctx.fillStyle = primary;
      ctx.font = `bold ${Math.max(8, Math.floor(H * 0.1))}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText('◄ L', barW / 2 + 4, 14);
      ctx.fillText('R ►', W / 2 + barW / 2 + 4, 14);

      ctx.strokeStyle = dim + '60';
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, W - 1, H - 1);

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [analyserNode, status]);

  return (
    <div className="visualizer-display" style={{ padding: 0 }} ref={containerRef}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', background: '#0a0a0a' }} />
    </div>
  );
}
