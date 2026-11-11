const C=require('./game.js');
const H=760,lv=4;
const st=C.makeLevel(lv,1,H); st.rndf=C.mulberry32(38);
let acc=0.35,g=0,log=[];
while(!st.done&&g<26000){
  acc+=1/60;
  if(acc>=0.35){acc=0; const b=st.strokes.length,ch=st.chalk; C.aiDraw(st,'strong');
    if(st.strokes.length!==b||Math.abs(st.chalk-ch)>1) log.push('t'+st.time.toFixed(1)+' n '+b+'->'+st.strokes.length+' chalk '+ch.toFixed(0)+'->'+st.chalk.toFixed(0));}
  C.step(st,1/60); g++;
}
console.log(log.slice(0,12).join('\n'));
console.log('score',st.score,'caught',st.caught+'/'+st.N,'chalk',st.chalk.toFixed(0),'strokes',st.strokes.map(s=>s.len.toFixed(0)).join('/'));
