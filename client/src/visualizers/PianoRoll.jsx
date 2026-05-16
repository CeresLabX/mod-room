// Piano Roll — Retro MIDI-style falling note blocks
import React, { useEffect, useRef, useState } from 'react';

function getCSSColor(varName, fallback) {
  if (typeof document === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || fallback;
}

const BASE_BLOCK_W = 20;
const BASE_BLOCK_H = 6;
const GAP = 2;
const LANES = 60;
const BASE_SPEED = 2.2;

export default function PianoRoll({ analyserNode, status }) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const timeRef = useRef(0);
  const notesRef = useRef([]);
  const sizeRef = useRef({ W: 0, H: 0, blockW: BASE_BLOCK_W, blockH: BASE_BLOCK_H });
  const [energy, setEnergy] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
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

    const syncSize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      const availW = Math.floor(rect.width);
      const availH = Math.floor(rect.height);
      if (availW === 0 || availH === 0) return;

      const blockW = Math.max(2, Math.floor((availW - GAP * (LANES - 1)) / LANES));
      const blockH = Math.max(3, Math.floor(availH / 28));
      const W = availW;
      const H = availH;

      if (W !== sizeRef.current.W || H !== sizeRef.current.H) {
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        canvas.style.width = W + 'px';
        canvas.style.height = H + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        sizeRef.current = { W, H, blockW, blockH };
      }
    };

    const ro = new ResizeObserver(syncSize);
    ro.observe(container);
    syncSize();

    class Note {
      constructor(lane, blockW, blockH) {
        this.lane = lane;
        this.x = lane * (blockW + GAP);
        this.y = -blockH;
        this.age = 0;
        this.maxAge = 60 + Math.random() * 80;
        this.vol = 0.4 + Math.random() * 0.6;
        this.hue = Math.floor(Math.random() * 3);
        this.width = blockW;
        this.blockH = blockH;
      }
      update(speed) {
        this.y += speed;
        this.age++;
      }
      get color() {
        if (this.hue === 0) return primary;
        if (this.hue === 1) return accent;
        return highlight;
      }
      get alive() { return this.y < sizeRef.current.H + this.blockH; }
    }

    let spawnTimer = 0;

    const draw = () => {
      const { W, H, blockW, blockH } = sizeRef.current;
      if (W === 0 || H === 0) { rafRef.current = requestAnimationFrame(draw); return; }

      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(0, 0, W, H);

      let e = 0.3;
      if (analyserNode && dataArray) {
        analyserNode.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
        e = Math.max(0, Math.min(1, (sum / (bufferLength * 255)) * 1.8));
        setEnergy(e);
      } else {
        timeRef.current += 0.02;
        e = 0.3 + 0.4 * Math.abs(Math.sin(timeRef.current));
        setEnergy(e);
      }

      const speed = BASE_SPEED * (0.9 + e * 1.4);

      spawnTimer++;
      const spawnRate = Math.max(2, Math.floor(7 - e * 5));
      if (spawnTimer >= spawnRate && e > 0.08) {
        spawnTimer = 0;
        const count = Math.max(1, Math.min(8, Math.round(1 + e * 9)));
        for (let c = 0; c < count; c++) {
          let lane = Math.floor(Math.random() * LANES);
          if (analyserNode && dataArray) {
            const probe = Math.floor(Math.random() * bufferLength);
            lane = Math.min(LANES - 1, Math.floor((probe / Math.max(1, bufferLength - 1)) * LANES));
          }
          notesRef.current.push(new Note(lane, blockW, blockH));
        }
      }

      notesRef.current = notesRef.current.filter(n => n.alive);
      for (const note of notesRef.current) {
        note.update(speed);

        const alpha = Math.min(1, (note.age / note.maxAge) * 2);
        ctx.fillStyle = note.color;
        ctx.shadowColor = note.color;
        ctx.shadowBlur = 4 + e * 6;
        ctx.fillRect(note.x + 1, note.y, note.width, note.blockH - 1);
        ctx.shadowBlur = 0;


        if (note.y > 0) {
          ctx.fillStyle = note.color + '20';
          ctx.fillRect(note.x + 1, note.y - 4, note.width, 4);
        }
      }

      ctx.strokeStyle = 'rgba(0,255,65,0.08)';
      ctx.lineWidth = 0.5;
      for (let i = 0; i <= LANES; i++) {
        const x = i * (blockW + GAP);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }

      ctx.strokeStyle = accent + '40';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, H - 1);
      ctx.lineTo(W, H - 1);
      ctx.stroke();

      if (e > 0.3) {
        ctx.fillStyle = accent + Math.floor(e * 60).toString(16).padStart(2, '0');
        ctx.fillRect(0, H - 3, W, 3);
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
    <div className="visualizer-display" style={{ padding: 0, justifyContent: 'stretch', alignItems: 'stretch' }} ref={containerRef}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', background: '#050505' }} />
    </div>
  );
}
