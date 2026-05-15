// Matrix Rain — Falling characters, tracker symbols, numbers
import React, { useEffect, useRef, useState } from 'react';

function getCSSColor(varName, fallback) {
  if (typeof document === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || fallback;
}

const CHARS = '01アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン$_%#@&ABCDEFGHIJKLMNOPQRSTUVWXYZ<>{}[]=+-*/\\|~^';
// Tracker symbols
const TRACKER_CHARS = '01DBFHIKLMNOPRSTVXZabcdefhiklmnoqrstvxz♩♪♫♬≡≈∞∫⊕⊗⊘⊙⊚⊛⌂◊○●◐◑◒◓▲△▼▽◆◇□■░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌♪♫░▒▓';

// Each column has its own rain
function initRain(cols) {
  return Array.from({ length: cols }, () => ({
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
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const rainRef = useRef([]);
  const [energy, setEnergy] = useState(0.2);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const primary = getCSSColor('--primary', '#00FF41');
    const accent = getCSSColor('--accent', '#00FFFF');

    const CHAR_W = 10;
    const CHAR_H = 14;

    let bufferLength = 0;
    let dataArray = null;
    if (analyserNode) {
      bufferLength = analyserNode.frequencyBinCount;
      dataArray = new Uint8Array(bufferLength);
    }

    const init = () => {
      const W = canvas.width;
      const cols = Math.floor(W / CHAR_W);
      rainRef.current = initRain(cols);
    };

    init();

    let fakeTime = 0;

    const draw = () => {
      const W = canvas.width;
      const H = canvas.height;

      // Fade trail
      ctx.fillStyle = 'rgba(0,0,0,0.1)';
      ctx.fillRect(0, 0, W, H);

      // Get energy
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

      const speedMult = 0.5 + e * 1.5;

      // Draw each rain column
      for (const col of rainRef.current) {
        col.y += col.speed * speedMult;

        // Randomly change characters
        if (Math.random() < 0.05) {
          const idx = Math.floor(Math.random() * col.chars.length);
          col.chars[idx] = TRACKER_CHARS[Math.floor(Math.random() * TRACKER_CHARS.length)];
        }

        // Reset if off screen
        if (col.y - col.length * CHAR_H > H) {
          col.y = -CHAR_H;
          col.speed = 0.8 + Math.random() * 1.2;
          col.length = 8 + Math.floor(Math.random() * 16);
          col.bright = Math.random() > 0.8;
        }

        const x = rainRef.current.indexOf(col) * CHAR_W;

        for (let i = 0; i < col.chars.length; i++) {
          const charY = col.y - i * CHAR_H;
          if (charY < -CHAR_H || charY > H) continue;

          const isHead = i === 0;
          const distFromHead = i / col.chars.length; // 0 at head, 1 at tail

          // Head is bright white-green, tail fades
          let alpha, color;
          if (isHead) {
            alpha = 1;
            color = '#ccffcc';
          } else {
            alpha = Math.max(0, 1 - distFromHead * 1.2);
            // Cycle through primary and accent
            color = distFromHead > 0.7 ? accent : primary;
          }

          if (alpha < 0.05) continue;

          ctx.font = 'bold 12px monospace';
          ctx.textAlign = 'center';
          ctx.fillStyle = color + Math.floor(alpha * 220).toString(16).padStart(2, '0');
          ctx.shadowColor = color;
          ctx.shadowBlur = isHead ? 12 : 3;
          ctx.fillText(col.chars[i], x + CHAR_W / 2, charY);
        }
      }

      ctx.shadowBlur = 0;

      // CRT scanlines
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      for (let y = 0; y < H; y += 3) {
        ctx.fillRect(0, y, W, 1);
      }

      // Border glow
      if (e > 0.4) {
        ctx.strokeStyle = primary + Math.floor(e * 80).toString(16).padStart(2, '0');
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, W - 2, H - 2);
      }

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
