const C=require('./game.js');
const H=760;
function trace(lv){
  const st=C.makeLevel(lv,1,H); st.rndf=C.mulberry32(1*31+7);
  const order=st.bins.slice().sort((a,b)=>b.val-a.val); const bin=order[0];
  const p=C.resample([{x:st.funnel.x-6,y:st.funnel.y+40},{x:bin.cx-bin.w*0.18,y:bin.y-28}]);
  const r=C.addStroke(st,p,0);
  const bb=C.addStroke(st,C.resample([{x:bin.x+bin.w+9,y:bin.y-52},{x:bin.x+bin.w+9,y:bin.y+26}]),1);
  console.log('L'+(lv+1),'ramp',r.ok,r.len&&r.len.toFixed(0),'bb',bb.ok,'chalk left',st.chalk.toFixed(0));
  let g=0; while(!st.done&&g<26000){C.step(st,1/60);g++;}
  const lost=st.events.filter(e=>e.t==='lost');
  console.log('  score',st.score,'caught',st.caught,'lost',st.lost,'lostXs',lost.map(e=>e.x.toFixed(0)).join(','));
  console.log('  bin x',st.bins.map(b=>b.x.toFixed(0)+'-'+(b.x+b.w).toFixed(0)+':'+b.val).join(' '),'funnel',st.funnel.x.toFixed(0));
}
[3,6,7].forEach(trace);
