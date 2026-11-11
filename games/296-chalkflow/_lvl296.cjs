const C=require('./game.js');
const W=560,H=760;
for(let lv=0;lv<8;lv++){
  const st=C.makeLevel(lv,1,H); st.rndf=C.mulberry32(38);
  const order=st.bins.slice().sort((a,b)=>b.val-a.val);
  const out=[];
  order.forEach((bin,bi)=>{
    const a={x:st.funnel.x-6,y:st.funnel.y+40}, b={x:bin.cx-bin.w*0.18,y:bin.y-28};
    let hit=[];
    st.rocks.forEach((rk,ri)=>{
      const dx=b.x-a.x,dy=b.y-a.y,L2=dx*dx+dy*dy;
      let t=((rk.x-a.x)*dx+(rk.y-a.y)*dy)/L2; t=Math.max(0,Math.min(1,t));
      const d=Math.hypot(rk.x-(a.x+t*dx),rk.y-(a.y+t*dy));
      if(d<rk.r+C.SR+C.BR) hit.push(ri+'('+(d-rk.r).toFixed(0)+')');
    });
    out.push('bin'+bi+'v'+bin.val+' len'+Math.hypot(b.x-a.x,b.y-a.y).toFixed(0)+(hit.length?' HIT '+hit.join(','):' ok'));
  });
  console.log('L'+(lv+1),'funnel',st.funnel.x.toFixed(0),'|',out.join(' | '));
}
