const C=require('./game.js');
const H=760;
for(const lv of [0,7]){
  const st=C.makeLevel(lv,1,H); st.rndf=C.mulberry32(38);
  const order=st.bins.slice().sort((a,b)=>b.val-a.val), bin=order[0];
  const r=C.addStroke(st,C.resample([{x:st.funnel.x-6,y:st.funnel.y+40},{x:bin.cx-bin.w*0.18,y:bin.y-28}]),0);
  console.log('L'+(lv+1),'ramp len',r.len.toFixed(0),'segs',st.strokes[0].segs.length);
  let g=0; while(!st.done&&g<26000){C.step(st,1/60);g++;}
  const hp=st.strokes[0].segs.map(s=>s.hp);
  console.log('  caught',st.caught+'/'+st.N,'minHp',Math.min(...hp).toFixed(2),'avgHp',(hp.reduce((a,b)=>a+b,0)/hp.length).toFixed(2),'dead',hp.filter(h=>h<=0).length);
}
