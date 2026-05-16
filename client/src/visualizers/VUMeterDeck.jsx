// VU Meter Deck — full-scale stereo LED meter deck
import React, { useEffect, useRef } from 'react';
function css(v, f) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim() || f; }
function avg(data, a, b) { let s = 0, n = 0; for (let i = a; i < b; i++) { s += data[Math.min(data.length - 1, i)] || 0; n++; } return n ? s / (n * 255) : 0; }

export default function VUMeterDeck({ analyserNode }) {
  const containerRef = useRef(null), canvasRef = useRef(null), rafRef = useRef(null);
  const sizeRef = useRef({ W: 0, H: 0 });
  const levels = useRef({ l: 0, r: 0, lp: 0, rp: 0 });
  const timeRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current, container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    const primary = css('--primary', '#00FF41'), accent = css('--accent', '#00FFFF'), hi = css('--highlight', '#FF00FF'), dim = css('--dim', '#008844');
    const data = analyserNode ? new Uint8Array(analyserNode.frequencyBinCount) : null;
    const syncSize = () => { const dpr = window.devicePixelRatio || 1; const r = container.getBoundingClientRect(); const W = Math.floor(r.width), H = Math.floor(r.height); if (!W || !H) return; if (W !== sizeRef.current.W || H !== sizeRef.current.H) { canvas.width = W*dpr; canvas.height = H*dpr; canvas.style.width=W+'px'; canvas.style.height=H+'px'; ctx.setTransform(dpr,0,0,dpr,0,0); sizeRef.current={W,H}; }};
    const ro = new ResizeObserver(syncSize); ro.observe(container); syncSize();
    const drawMeter = (label, value, peak, x, y, w, h) => {
      ctx.fillStyle = '#070707'; ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = dim; ctx.lineWidth = 1; ctx.strokeRect(x+.5, y+.5, w-1, h-1);
      const segs = Math.max(28, Math.floor(w / 10)); const gap = 2; const sw = (w - gap * (segs + 1)) / segs;
      for (let i = 0; i < segs; i++) {
        const p = (i + 1) / segs; const active = p <= value;
        const col = p > .86 ? hi : p > .66 ? accent : primary;
        ctx.fillStyle = active ? col : dim + '22';
        ctx.shadowColor = col; ctx.shadowBlur = active ? 5 + value * 8 : 0;
        ctx.fillRect(x + gap + i * (sw + gap), y + h * .22, sw, h * .50);
      }
      ctx.shadowBlur = 0;
      const px = x + Math.min(1, peak) * w;
      ctx.fillStyle = peak > .86 ? hi : accent; ctx.fillRect(px - 2, y + h * .16, 4, h * .62);
      ctx.fillStyle = primary; ctx.font = `bold ${Math.max(10, Math.floor(h*.18))}px monospace`; ctx.textAlign='left'; ctx.fillText(label, x + 8, y + h - 8);
      ctx.textAlign='right'; ctx.fillText(`${Math.round(value*100)}%`, x + w - 8, y + h - 8);
    };
    const draw = () => {
      const { W, H } = sizeRef.current; if (!W || !H) { rafRef.current=requestAnimationFrame(draw); return; }
      timeRef.current += 0.04;
      let l, r;
      if (analyserNode && data) { analyserNode.getByteFrequencyData(data); l = avg(data, 0, data.length * .45); r = avg(data, data.length * .15, data.length); }
      else { l = .45 + .4*Math.abs(Math.sin(timeRef.current*1.7)); r = .42 + .42*Math.abs(Math.sin(timeRef.current*1.3+1.2)); }
      l = Math.min(1, l * 1.75); r = Math.min(1, r * 1.75);
      const s = levels.current; s.l = s.l*.62 + l*.38; s.r = s.r*.62 + r*.38; s.lp = Math.max(s.lp*.982, s.l); s.rp = Math.max(s.rp*.982, s.r);
      ctx.fillStyle = '#020402'; ctx.fillRect(0,0,W,H);
      ctx.strokeStyle = dim + '35'; ctx.lineWidth = .5; for(let i=1;i<10;i++){ const x=i*W/10; ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
      const pad = Math.max(10, W*.018); const mh = (H - pad*3) / 2;
      drawMeter('LEFT  -20  -10  -6  -3  0 +3', s.l, s.lp, pad, pad, W-pad*2, mh);
      drawMeter('RIGHT -20  -10  -6  -3  0 +3', s.r, s.rp, pad, pad*2+mh, W-pad*2, mh);
      rafRef.current=requestAnimationFrame(draw);
    };
    rafRef.current=requestAnimationFrame(draw); return()=>{cancelAnimationFrame(rafRef.current); ro.disconnect();};
  }, [analyserNode]);
  return <div className="visualizer-display" style={{padding:0}} ref={containerRef}><canvas ref={canvasRef} style={{width:'100%',height:'100%',background:'#000'}} /></div>;
}
