const C=require('./game.js');
const H=760,lv=5;
const st=C.makeLevel(lv,1,H); st.rndf=C.mulberry32(38);
let acc=0.35,g=0,log=[];
while(!st.done&&g<26000){
  acc+=1/60;
  if(acc>=0.35){acc=0; const before=st.strokes.length; C.aiDraw(st,'strong'); if(st.strokes.length!==before) log.push('t'+st.time.toFixed(1)+' strokes '+before+'->'+st.strokes.length+' chalk '+st.chalk.toFixed(0));}
  C.step(st,1/60); g++;
}
console.log(log.slice(0,25).join('\n'));
console.log('score',st.score,'caught',st.caught+'/'+st.N,'chalk',st.chalk.toFixed(0));
const lost=st.events.filter(e=>e.t==='lost');
console.log('lostXs',lost.map(e=>e.x.toFixed(0)).join(','));
console.log('bins',st.bins.map(b=>b.x.toFixed(0)+'-'+(b.x+b.w).toFixed(0)+'v'+b.val+' n='+b.count).join(' '));
