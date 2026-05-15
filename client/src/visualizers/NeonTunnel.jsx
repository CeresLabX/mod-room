// Neon Tunnel — Retro 3D wireframe tunnel reacting to beat/volume
import React, { useEffect, useRef, useState } from 'react';

function getCSSColor(varName, fallback) {
  if (typeof document === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || fallback;
}

// Simple 3D math utilities
function rotateX(p, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: p.x, y: p.y * c - p.z * s, z: p.y * s + p.z * c };
}
function rotateY(p, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: p.x * c + p.z * s, y: p.y, z: -p.x * s + p.z * c };
}
function project(p, W, H, fov) {
  const scale = fov / (fov + p.z);
  return { sx: p.x * scale + W / 2, sy: p.y * scale + H / 2, scale };
}

export default function NeonTunnel({ analyserNode, status }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const timeRef = useRef(0);
  const [bars, setBars] = useState([0, 0, 0, 0, 0, 0, 0, 0]);

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

    const draw = () => {
      const W = canvas.width;
      const H = canvas.height;

      // Get audio energy
      let energy = 0;
      let bassLevel = 0;
      if (analyserNode && dataArray) {
        analyserNode.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
        energy = sum / (bufferLength * 255);
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
      } else {
        timeRef.current += 0.03;
        energy = 0.3 + 0.4 * Math.abs(Math.sin(timeRef.current));
        bassLevel = 0.2 + 0.3 * Math.abs(Math.sin(timeRef.current * 1.3));
        const t = timeRef.current;
        setBars([
          0.3 + 0.4 * Math.sin(t), 0.5 + 0.3 * Math.sin(t + 1),
          0.4 + 0.3 * Math.sin(t + 2), 0.6 + 0.3 * Math.sin(t + 0.5),
          0.3 + 0.4 * Math.sin(t + 1.5), 0.5 + 0.3 * Math.sin(t + 3),
          0.4 + 0.3 * Math.sin(t + 0.8), 0.6 + 0.3 * Math.sin(t + 2.5),
        ]);
      }

      // Clear with fade
      ctx.fillStyle = `rgba(0,0,0,0.3)`;
      ctx.fillRect(0, 0, W, H);

      const cx = W / 2;
      const cy = H / 2;
      const fov = 200;
      const depth = 20;
      const rings = 12;
      const spokes = 16;
      const time = timeRef.current;

      ctx.lineWidth = 1.2;

      // Draw rings
      for (let i = 0; i < rings; i++) {
        const t = (i / rings + time * 0.03 * (1 + bassLevel)) % 1;
        const z = t * depth;
        const radius = (10 + t * 60) * (1 + energy * 0.5);

        if (z < 0.5) continue;

        ctx.beginPath();
        for (let j = 0; j <= spokes; j++) {
          const a = (j / spokes) * Math.PI * 2;
          const p3d = { x: Math.cos(a) * radius, y: Math.sin(a) * radius, z };
          const p2d = project(rotateY(rotateX(p3d, time * 0.2), time * 0.3), W, H, fov);
          if (p2d.sx < 0 || p2d.sx > W || p2d.sy < 0 || p2d.sy > H) continue;
          if (j === 0) ctx.moveTo(p2d.sx, p2d.sy);
          else ctx.lineTo(p2d.sx, p2d.sy);
        }
        ctx.closePath();

        const alpha = Math.max(0, 1 - t);
        const color = i % 3 === 0 ? accent : i % 3 === 1 ? primary : highlight;
        ctx.strokeStyle = color + Math.floor(alpha * 200).toString(16).padStart(2, '0');
        ctx.shadowColor = color;
        ctx.shadowBlur = 4 + energy * 8;
        ctx.stroke();
      }

      // Draw spokes
      for (let i = 0; i < spokes; i++) {
        const angle = (i / spokes) * Math.PI * 2 + time * 0.05;
        ctx.beginPath();
        for (let j = 0; j < rings; j++) {
          const t = (j / rings + time * 0.03 * (1 + bassLevel)) % 1;
          const z = t * depth;
          const radius = (10 + t * 60) * (1 + energy * 0.5);
          const p3d = { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, z };
          const p2d = project(rotateY(rotateX(p3d, time * 0.2), time * 0.3), W, H, fov);
          if (j === 0) ctx.moveTo(p2d.sx, p2d.sy);
          else ctx.lineTo(p2d.sx, p2d.sy);
        }
        const alpha = 0.3 + energy * 0.4;
        ctx.strokeStyle = accent + Math.floor(alpha * 180).toString(16).padStart(2, '0');
        ctx.shadowColor = accent;
        ctx.shadowBlur = 3 + energy * 5;
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }

      // Center glow
      const glowR = 8 + energy * 20;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
      grad.addColorStop(0, accent + '40');
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.fillRect(cx - glowR, cy - glowR, glowR * 2, glowR * 2);

      if (!analyserNode) timeRef.current += 0.03;
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
