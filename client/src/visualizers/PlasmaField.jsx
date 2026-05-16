// Plasma Field — moving audio-reactive Amiga plasma
import React, { useEffect, useRef } from 'react';
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function avg(data,a,b){let s=0,n=0;for(let i=a;i<b;i++){s+=data[Math.min(data.length-1,i)]||0;n++;}return n?s/(n*255):0;}
export default function PlasmaField({ analyserNode }){
  const containerRef=useRef(null),canvasRef=useRef(null),rafRef=useRef(null),sizeRef=useRef({W:0,H:0}),tRef=useRef(0),energyRef=useRef({bass:0,mid:0,high:0});
  useEffect(()=>{
    const canvas=canvasRef.current,container=containerRef.current;if(!canvas||!container)return;const ctx=canvas.getContext('2d');
    const data=analyserNode?new Uint8Array(analyserNode.frequencyBinCount):null; const off=document.createElement('canvas'), ox=off.getContext('2d'); let OW=180,OH=70; off.width=OW; off.height=OH;
    const sync=()=>{const dpr=window.devicePixelRatio||1,r=container.getBoundingClientRect(),W=Math.floor(r.width),H=Math.floor(r.height);if(!W||!H)return;if(W!==sizeRef.current.W||H!==sizeRef.current.H){canvas.width=W*dpr;canvas.height=H*dpr;canvas.style.width=W+'px';canvas.style.height=H+'px';ctx.setTransform(dpr,0,0,dpr,0,0);sizeRef.current={W,H};OW=Math.max(140,Math.floor(W/6));OH=Math.max(60,Math.floor(H/6));off.width=OW;off.height=OH;}};
    const ro=new ResizeObserver(sync);ro.observe(container);sync();
    const draw=()=>{const {W,H}=sizeRef.current;if(!W||!H){rafRef.current=requestAnimationFrame(draw);return;}let bass,mid,high;if(analyserNode&&data){analyserNode.getByteFrequencyData(data);bass=avg(data,0,data.length*.12);mid=avg(data,data.length*.12,data.length*.55);high=avg(data,data.length*.55,data.length);}else{bass=.45+.35*Math.abs(Math.sin(tRef.current*1.4));mid=.4+.35*Math.abs(Math.sin(tRef.current*.9+1));high=.3+.25*Math.abs(Math.sin(tRef.current*2.1));}const e=energyRef.current;e.bass=e.bass*.7+bass*.3;e.mid=e.mid*.75+mid*.25;e.high=e.high*.65+high*.35;tRef.current+=.035+e.bass*.08+e.mid*.035;const t=tRef.current,img=ox.createImageData(OW,OH),d=img.data;
      for(let y=0;y<OH;y++)for(let x=0;x<OW;x++){const dx=x-OW/2+Math.sin(t*.8)*OW*.18,dy=y-OH/2+Math.cos(t*.7)*OH*.2;let v=0;v+=Math.sin(x*.115+t*2.1+e.bass*3);v+=Math.sin(y*.16+t*1.6+e.mid*4);v+=Math.sin((x+y)*.08+t*2.7);v+=Math.sin(Math.sqrt(dx*dx+dy*dy)*(.12+e.high*.05)-t*3.2);v=(v+4)/8;const idx=(y*OW+x)*4;d[idx]=clamp(30+255*Math.sin(v*Math.PI+e.bass),0,255);d[idx+1]=clamp(40+255*Math.sin(v*Math.PI+2.1+e.mid),0,255);d[idx+2]=clamp(80+255*Math.sin(v*Math.PI+4.2+e.high),0,255);d[idx+3]=255;}ox.putImageData(img,0,0);ctx.imageSmoothingEnabled=false;ctx.drawImage(off,0,0,W,H);ctx.fillStyle=`rgba(255,255,255,${e.bass*.06})`;ctx.fillRect(0,0,W,H);ctx.fillStyle='rgba(0,0,0,.08)';for(let y=0;y<H;y+=3)ctx.fillRect(0,y,W,1);rafRef.current=requestAnimationFrame(draw);};
    rafRef.current=requestAnimationFrame(draw);return()=>{cancelAnimationFrame(rafRef.current);ro.disconnect();};
  },[analyserNode]);
  return <div className="visualizer-display" style={{padding:0}} ref={containerRef}><canvas ref={canvasRef} style={{width:'100%',height:'100%',background:'#000',imageRendering:'pixelated'}} /></div>;
}
