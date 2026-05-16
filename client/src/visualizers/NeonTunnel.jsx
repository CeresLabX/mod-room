// Neon Tunnel — fast audio-reactive 3D wireframe tunnel
import React, { useEffect, useRef } from 'react';
function css(v, f) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim() || f; }
function avg(data, a, b) { let s=0,n=0; for(let i=a;i<b;i++){s+=data[Math.min(data.length-1,i)]||0;n++;} return n?s/(n*255):0; }
export default function NeonTunnel({ analyserNode }) {
  const containerRef=useRef(null), canvasRef=useRef(null), rafRef=useRef(null), sizeRef=useRef({W:0,H:0}), tRef=useRef(0), eRef=useRef({bass:0,mid:0,high:0});
  useEffect(()=>{
    const canvas=canvasRef.current, container=containerRef.current; if(!canvas||!container)return; const ctx=canvas.getContext('2d');
    const primary=css('--primary','#00FF41'), accent=css('--accent','#00FFFF'), hi=css('--highlight','#FF00FF');
    const data=analyserNode?new Uint8Array(analyserNode.frequencyBinCount):null;
    const sync=()=>{const dpr=window.devicePixelRatio||1,r=container.getBoundingClientRect(),W=Math.floor(r.width),H=Math.floor(r.height); if(!W||!H)return; if(W!==sizeRef.current.W||H!==sizeRef.current.H){canvas.width=W*dpr;canvas.height=H*dpr;canvas.style.width=W+'px';canvas.style.height=H+'px';ctx.setTransform(dpr,0,0,dpr,0,0);sizeRef.current={W,H};}};
    const ro=new ResizeObserver(sync); ro.observe(container); sync();
    const draw=()=>{
      const {W,H}=sizeRef.current; if(!W||!H){rafRef.current=requestAnimationFrame(draw);return;}
      let bass,mid,high; if(analyserNode&&data){analyserNode.getByteFrequencyData(data);bass=avg(data,0,data.length*.12);mid=avg(data,data.length*.12,data.length*.5);high=avg(data,data.length*.5,data.length);} else {const t=tRef.current; bass=.35+.35*Math.abs(Math.sin(t*2)); mid=.35+.35*Math.abs(Math.sin(t*1.3+1)); high=.25+.3*Math.abs(Math.sin(t*2.7));}
      const e=eRef.current; e.bass=e.bass*.7+bass*.3; e.mid=e.mid*.75+mid*.25; e.high=e.high*.65+high*.35;
      tRef.current += 0.018 + e.bass*0.055 + e.mid*0.025;
      const t=tRef.current, cx=W/2+Math.sin(t*1.4)*W*.12*e.mid, cy=H/2+Math.cos(t*1.1)*H*.12*e.high, maxR=Math.hypot(W,H)*.62;
      ctx.fillStyle='rgba(0,0,0,0.22)'; ctx.fillRect(0,0,W,H);
      const rings=28, spokes=36;
      for(let r=0;r<rings;r++){
        const p=((r/rings)+t)%1; const rad=(p*p)*maxR*(1+e.bass*.55); const twist=t*5+p*8+e.mid*2;
        const alpha=Math.max(0,1-p); const color=r%3===0?accent:r%3===1?primary:hi;
        ctx.beginPath();
        for(let i=0;i<=spokes;i++){
          const a=i/spokes*Math.PI*2+twist; const wob=1+Math.sin(a*5+t*8)*.045*e.high;
          const x=cx+Math.cos(a)*rad*wob; const y=cy+Math.sin(a)*rad*wob*.62;
          if(i===0)ctx.moveTo(x,y); else ctx.lineTo(x,y);
        }
        ctx.closePath(); ctx.strokeStyle=color+Math.floor(alpha*(130+e.bass*110)).toString(16).padStart(2,'0'); ctx.lineWidth=.6+alpha*2+e.bass*2; ctx.shadowColor=color; ctx.shadowBlur=3+e.bass*16; ctx.stroke();
      }
      for(let i=0;i<spokes;i++){
        const a=i/spokes*Math.PI*2+t*2.7; ctx.beginPath();
        for(let r=0;r<rings;r++){const p=((r/rings)+t)%1, rad=(p*p)*maxR*(1+e.bass*.55), x=cx+Math.cos(a+p*5)*rad, y=cy+Math.sin(a+p*5)*rad*.62; if(r===0)ctx.moveTo(x,y); else ctx.lineTo(x,y);}
        ctx.strokeStyle=accent+Math.floor((35+e.high*120)).toString(16).padStart(2,'0'); ctx.lineWidth=.5+e.high*1.5; ctx.stroke();
      }
      ctx.shadowBlur=0; const pulse=18+e.bass*90; const g=ctx.createRadialGradient(cx,cy,0,cx,cy,pulse); g.addColorStop(0,hi+Math.floor(80+e.bass*120).toString(16).padStart(2,'0')); g.addColorStop(1,'transparent'); ctx.fillStyle=g; ctx.fillRect(cx-pulse,cy-pulse,pulse*2,pulse*2);
      rafRef.current=requestAnimationFrame(draw);
    };
    rafRef.current=requestAnimationFrame(draw); return()=>{cancelAnimationFrame(rafRef.current);ro.disconnect();};
  },[analyserNode]);
  return <div className="visualizer-display" style={{padding:0}} ref={containerRef}><canvas ref={canvasRef} style={{width:'100%',height:'100%',background:'#000'}} /></div>;
}
