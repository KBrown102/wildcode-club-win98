const C=require('./game.js');
const H=760;
for(let lv=0;lv<8;lv++){
  const st=C.runAI(lv,1,'strong',H);
  console.log('L'+(lv+1),'score',st.score,'caught',st.caught+'/'+st.N,'chalkLeft',st.chalk.toFixed(0)+'/'+st.chalkMax.toFixed(0),
    'strokes',st.strokes.length,'segsAlive',st.segs.filter(s=>!s.dead).length+'/'+st.segs.length,'time',st.time.toFixed(1));
}
