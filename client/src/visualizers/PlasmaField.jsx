// Plasma Field — Old-school Amiga demo-scene plasma
import React, { useEffect, useRef, useState } from 'react';

function getCSSColor(varName, fallback) {
  if (typeof document === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || fallback;
}

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

export default function PlasmaField({ analyserNode, status }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const timeRef = useRef(0);
  const [energy, setEnergy] = useState(0.3);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const primary = getCSSColor('--primary', '#00FF41');
    const accent = getCSSColor('--accent', '#00FFFF');
    const highlight = getCSSColor('--highlight', '#FF00FF');

    let bufferLength = 0;
    let dataArray = null;
    if (analyserNode) {
      bufferLength = analyserNode.frequencyBinCount;
      dataArray = new Uint8Array(bufferLength);
    }

    // Low-res pixel effect — draw to offscreen then scale
    const offCanvas = document.createElement('canvas');
    const offCtx = offCanvas.getContext('2d');
    const PIXEL = 4; // block size
    offCanvas.width = 100;
    offCanvas.height = 30;

    const draw = () => {
      const W = canvas.width;
      const H = canvas.height;

      // Get audio energy
      let e = 0.3;
      if (analyserNode && dataArray) {
        analyserNode.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
        e = sum / (bufferLength * 255);
        e = clamp(e * 1.5, 0, 1);
        setEnergy(e);
      } else {
        timeRef.current += 0.025;
        e = 0.4 + 0.35 * Math.abs(Math.sin(timeRef.current * 0.7)) + 0.1 * Math.sin(timeRef.current * 2.3);
        e = clamp(e, 0, 1);
        setEnergy(e);
      }

      const t = timeRef.current;
      const offW = offCanvas.width;
      const offH = offCanvas.height;

      // Plasma function
      const plasma = (x, y) => {
        const v1 = Math.sin(x * 0.1 + t * 1.1);
        const v2 = Math.sin((y * 0.1 + t * 0.9) * 0.5 + t * 0.7);
        const v3 = Math.sin((x * 0.1 + y * 0.1 + t * 1.3) * 0.5);
        const dx = x - offW / 2;
        const dy = y - offH / 2;
        const v4 = Math.sin(Math.sqrt(dx * dx + dy * dy) * 0.1 + t * 1.7);
        return (v1 + v2 + v3 + v4) / 4;
      };

      // Draw low-res plasma
      const imgData = offCtx.createImageData(offW, offH);
      const data = imgData.data;
      for (let py = 0; py < offH; py++) {
        for (let px = 0; px < offW; px++) {
          const v = plasma(px, py); // -1 to 1
          const t2 = (v + 1) * 0.5; // 0 to 1

          // Color cycling through primary → accent → highlight → primary
          let r, g, b;
          if (t2 < 0.33) {
            const tt = t2 / 0.33;
            r = Math.floor(lerp(0, 0, tt));
            g = Math.floor(lerp(255, 255, tt));
            b = Math.floor(lerp(65, 255, tt));
          } else if (t2 < 0.66) {
            const tt = (t2 - 0.33) / 0.33;
            r = Math.floor(lerp(0, 255, tt));
            g = Math.floor(lerp(255, 0, tt));
            b = 255;
          } else {
            const tt = (t2 - 0.66) / 0.34;
            r = 255;
            g = Math.floor(lerp(0, 255, tt));
            b = Math.floor(lerp(255, 0, tt));
          }

          const idx = (py * offW + px) * 4;
          data[idx] = clamp(r + e * 40, 0, 255);
          data[idx + 1] = clamp(g + e * 20, 0, 255);
          data[idx + 2] = clamp(b, 0, 255);
          data[idx + 3] = 255;
        }
      }
      offCtx.putImageData(imgData, 0, 0);

      // Clear main canvas
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);

      // Scale up plasma with glow
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(offCanvas, 0, 0, W, H);

      // Scanline overlay
      ctx.fillStyle = 'rgba(0,0,0,0.1)';
      for (let y = 0; y < H; y += 2) {
        ctx.fillRect(0, y, W, 1);
      }

      // Glow overlay based on energy
      if (e > 0.4) {
        const grad = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, W * 0.6);
        grad.addColorStop(0, accent + Math.floor((e - 0.4) * 100).toString(16).padStart(2, '0'));
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
      }

      if (!analyserNode) timeRef.current += 0.025;
      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [analyserNode, status]);

  return (
    <div className="visualizer-display" style={{ padding: 0 }}>
      <canvas
        ref={canvasRef}
        width={400}
        height={120}
        style={{ width: '100%', height: '100%', background: '#000' }}
      />
    </div>
  );
}
