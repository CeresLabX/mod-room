// Matrix Rain — Falling characters, tracker symbols, numbers
import React, { useEffect, useRef, useState } from 'react';

function getCSSColor(varName, fallback) {
  if (typeof document === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || fallback;
}

const CHARS = '01アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン$_%#@&ABCDEFGHIJKLMNOPQRSTUVWXYZ<>{}[]=+-*/\\|~^';
const TRACKER_CHARS = '01DBFHIKLMNOPRSTVXZabcdefhiklmnoqrstvxz♩♪♫♬≡≈∞∫⊕⊗⊘⊙⊚⊛⌂◊○●◐◑◒◓▲△▼▽◆◇□■░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌';

function initRain(cols, charW) {
  return Array.from({ length: cols }, () => ({
    x: 0,
    y: Math.random() * -200,
    speed: 0.8 + Math.random() * 1.2,
    chars: Array.from({ length: Math.floor(8 + Math.random() * 16) }, () =>
      TRACKER_CHARS[Math.floor(Math.random() * TRACKER_CHARS.length)]
    ),
    length: 8 + Math.floor(Math.random() * 16),
    bright: Math.random() > 0.8,
  }));
}

export default function MatrixRain({ analyserNode, status }) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const rainRef = useRef([]);
  const sizeRef = useRef({ W: 0, H: 0, charW: 10, charH: 14 });
  const [energy, setEnergy] = useState(0.2);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');

    const primary = getCSSColor('--primary', '#00FF41');
    const accent = getCSSColor('--accent', '#00FFFF');

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

      // Roughly 3x denser than before.
      const charH = Math.max(6, Math.floor(H / 42));
      const charW = Math.max(4, Math.floor(charH * 0.7));

      if (W !== sizeRef.current.W || H !== sizeRef.current.H) {
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        canvas.style.width = W + 'px';
        canvas.style.height = H + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const cols = Math.floor(W / charW);
        rainRef.current = initRain(cols, charW);
        sizeRef.current = { W, H, charW, charH };
      }
    };

    const ro = new ResizeObserver(syncSize);
    ro.observe(container);
    syncSize();

    let fakeTime = 0;

    const draw = () => {
      const { W, H, charW, charH } = sizeRef.current;
      if (W === 0 || H === 0) { rafRef.current = requestAnimationFrame(draw); return; }

      ctx.fillStyle = 'rgba(0,0,0,0.1)';
      ctx.fillRect(0, 0, W, H);

      let e = 0.2;
      if (analyserNode && dataArray) {
        analyserNode.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
        e = sum / (bufferLength * 255);
        e = Math.max(0, Math.min(1, e * 1.5));
        setEnergy(e);
      } else {
        fakeTime += 0.02;
        e = 0.15 + 0.3 * Math.abs(Math.sin(fakeTime * 0.8)) + 0.1 * Math.sin(fakeTime * 2.1);
        e = Math.max(0, Math.min(1, e));
        setEnergy(e);
      }

      const speedMult = 0.75 + e * 3.2;

      for (let ci = 0; ci < rainRef.current.length; ci++) {
        const col = rainRef.current[ci];
        col.y += col.speed * speedMult;

        if (Math.random() < 0.05 + e * 0.16) {
          const idx = Math.floor(Math.random() * col.chars.length);
          col.chars[idx] = TRACKER_CHARS[Math.floor(Math.random() * TRACKER_CHARS.length)];
        }

        if (col.y - col.length * charH > H) {
          col.y = -charH;
          col.speed = 0.9 + Math.random() * (1.6 + e * 2.2);
          col.length = 10 + Math.floor(Math.random() * 26);
          col.bright = Math.random() > (0.84 - e * 0.35);
        }

        const x = ci * charW;

        for (let i = 0; i < col.chars.length; i++) {
          const charY = col.y - i * charH;
          if (charY < -charH || charY > H) continue;

          const isHead = i === 0;
          const distFromHead = i / col.chars.length;

          let alpha, color;
          if (isHead) {
            alpha = 1;
            color = '#ccffcc';
          } else {
            alpha = Math.max(0, 1 - distFromHead * 1.2);
            color = distFromHead > 0.7 ? accent : primary;
          }

          if (alpha < 0.05) continue;

          ctx.font = `bold ${Math.max(5, charH - 1)}px monospace`;
          ctx.textAlign = 'center';
          ctx.fillStyle = color + Math.floor(alpha * 220).toString(16).padStart(2, '0');
          ctx.shadowColor = color;
          ctx.shadowBlur = isHead ? 12 : 3;
          ctx.fillText(col.chars[i], x + charW / 2, charY);
        }
      }

      ctx.shadowBlur = 0;

      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      for (let y = 0; y < H; y += 3) {
        ctx.fillRect(0, y, W, 1);
      }

      if (e > 0.4) {
        ctx.strokeStyle = primary + Math.floor(e * 80).toString(16).padStart(2, '0');
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
    <div className="visualizer-display" style={{ padding: 0 }} ref={containerRef}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', background: '#000' }} />
    </div>
  );
}
