const C=require('./game.js');
const W=560,H=760,BR=C.BR,SR=C.SR;
function gen(lv,seed){
  const cfg=C.LEVELS[lv];
  const rnd=C.mulberry32(seed*9176+lv*331+7);
  const fx=cfg.nx*W, fy=0.09*H;
  const bins=cfg.bins.map(b=>{const bx=b.nx*W,bw=b.nw*W;return{x:bx,w:bw,cx:bx+bw/2,y:H-26-64,val:b.val};});
  const top=bins.slice().sort((a,b)=>b.val-a.val)[0];
  const A={x:fx-6,y:fy+40}, B={x:top.cx-top.w*0.18,y:top.y-28};
  const n=cfg.rocks.length, rocks=[];
  for(let i=0;i<n;i++){
    const spec=cfg.rocks[i], r=spec.nr*W;
    const lo=0.08+(0.84*i)/n, hi=0.08+(0.84*(i+1))/n;
    let placed=null;
    for(let tries=0;tries<4000 && !placed;tries++){
      const nx=lo+rnd()*(hi-lo), ny=0.22+rnd()*0.48;
      const x=nx*W,y=ny*H;
      if(x-r<10||x+r>W-10) continue;
      if(Math.abs(x-fx) < r+18 && y>fy) continue;
      const dx=B.x-A.x,dy=B.y-A.y,L2=dx*dx+dy*dy;
      let t=((x-A.x)*dx+(y-A.y)*dy)/L2; t=Math.max(0,Math.min(1,t));
      if(Math.hypot(x-(A.x+t*dx),y-(A.y+t*dy)) < r+SR+BR+16) continue;
      let ok=true;
      for(const o of rocks){ if(Math.hypot(x-o.x,y-o.y)<r+o.r+22){ok=false;break;} }
      if(!ok) continue;
      for(const b of bins){ if(y+r>b.y-14 && x+r>b.x-10 && x-r<b.x+b.w+10){ok=false;break;} }
      if(!ok) continue;
      placed={nx:+nx.toFixed(3),ny:+ny.toFixed(3),nr:spec.nr};
    }
    if(!placed) return null;
    rocks.push({x:placed.nx*W,y:placed.ny*H,r:placed.nr*W,c:placed});
  }
  return rocks.map(o=>o.c);
}
for(let lv=0;lv<8;lv++){
  for(let s=1;s<600;s++){
    const r=gen(lv,s); if(!r) continue;
    const st=C.makeLevel(lv,1,H); st.rndf=C.mulberry32(38);
    st.rocks=r.map(o=>{const rr=o.nr*W;const pts=[];for(let p=0;p<9;p++)pts.push({a:p/9*Math.PI*2,m:0.9+((p*37%11)/11)*0.2});return{x:o.nx*W,y:o.ny*H,r:rr,pts:pts};});
    let g=0; while(!st.done&&g<26000){C.step(st,1/60);g++;}
    if(st.score===0){ console.log('L'+(lv+1)+' seed'+s+': '+JSON.stringify(r)); break; }
  }
}
