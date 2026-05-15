// Piano Roll — Retro MIDI-style falling note blocks
import React, { useEffect, useRef, useState } from 'react';

function getCSSColor(varName, fallback) {
  if (typeof document === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || fallback;
}

const KEYS = 24; // number of piano keys (visual range)
const LANES = 12; // horizontal lanes
const BLOCK_W = 28;
const BLOCK_H = 6;
const SPEED = 1.5;

export default function PianoRoll({ analyserNode, status }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const timeRef = useRef(0);
  const notesRef = useRef([]);
  const [energy, setEnergy] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const primary = getCSSColor('--primary', '#00FF41');
    const accent = getCSSColor('--accent', '#00FFFF');
    const highlight = getCSSColor('--highlight', '#FF00FF');

    const W = LANES * (BLOCK_W + 2);
    const H = 120;
    canvas.width = W;
    canvas.height = H;

    // Note class
    class Note {
      constructor(lane) {
        this.lane = lane;
        this.x = lane * (BLOCK_W + 2);
        this.y = -BLOCK_H;
        this.age = 0;
        this.maxAge = 60 + Math.random() * 80;
        this.vol = 0.4 + Math.random() * 0.6;
        this.hue = Math.floor(Math.random() * 3); // 0=primary, 1=accent, 2=highlight
        this.width = BLOCK_W;
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
      get alive() { return this.y < H + BLOCK_H; }
    }

    let bufferLength = 0;
    let dataArray = null;
    if (analyserNode) {
      bufferLength = analyserNode.frequencyBinCount;
      dataArray = new Uint8Array(bufferLength);
    }

    let spawnTimer = 0;

    const draw = () => {
      const W = canvas.width;
      const H = canvas.height;

      // Fade trail
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(0, 0, W, H);

      // Get energy
      let e = 0.3;
      if (analyserNode && dataArray) {
        analyserNode.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
        e = sum / (bufferLength * 255);
        e = Math.max(0, Math.min(1, e * 1.5));
        setEnergy(e);
      } else {
        timeRef.current += 0.02;
        e = 0.3 + 0.4 * Math.abs(Math.sin(timeRef.current));
        setEnergy(e);
      }

      const speed = SPEED * (0.8 + e * 0.8);

      // Spawn new notes
      spawnTimer++;
      const spawnRate = Math.max(4, Math.floor(12 - e * 8));
      if (spawnTimer >= spawnRate && e > 0.15) {
        spawnTimer = 0;
        const count = e > 0.5 ? 2 : 1;
        for (let c = 0; c < count; c++) {
          const lane = Math.floor(Math.random() * LANES);
          notesRef.current.push(new Note(lane));
        }
      }

      // Update and draw notes
      notesRef.current = notesRef.current.filter(n => n.alive);
      for (const note of notesRef.current) {
        note.update(speed);

        const alpha = Math.min(1, (note.age / note.maxAge) * 2);
        ctx.fillStyle = note.color;
        ctx.shadowColor = note.color;
        ctx.shadowBlur = 4 + e * 6;
        ctx.fillRect(note.x + 1, note.y, note.width, BLOCK_H - 1);
        ctx.shadowBlur = 0;

        // Note name label (hex-ish)
        if (note.age < 10) {
          ctx.fillStyle = '#000';
          ctx.font = '5px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(['C', 'D', 'E', 'F', 'G', 'A', 'B'][note.lane % 7] + Math.floor(note.lane / 7), note.x + BLOCK_W / 2 + 1, note.y + BLOCK_H - 1);
        }

        // Trail
        if (note.y > 0) {
          ctx.fillStyle = note.color + '20';
          ctx.fillRect(note.x + 1, note.y - 4, note.width, 4);
        }
      }

      // Lane dividers
      ctx.strokeStyle = 'rgba(0,255,65,0.08)';
      ctx.lineWidth = 0.5;
      for (let i = 0; i <= LANES; i++) {
        const x = i * (BLOCK_W + 2);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }

      // Bottom line (landing zone)
      ctx.strokeStyle = accent + '40';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, H - 1);
      ctx.lineTo(W, H - 1);
      ctx.stroke();

      // Energy glow at bottom
      if (e > 0.3) {
        ctx.fillStyle = accent + Math.floor(e * 60).toString(16).padStart(2, '0');
        ctx.fillRect(0, H - 3, W, 3);
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [analyserNode, status]);

  return (
    <div className="visualizer-display" style={{ padding: 0, justifyContent: 'center' }}>
      <canvas
        ref={canvasRef}
        style={{ background: '#050505' }}
      />
    </div>
  );
}
