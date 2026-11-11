const C=require('./game.js');
for(const H of [680,760,880,980]){
  let line=[];
  for(let lv=0;lv<8;lv++){
    let n=0,s=0,m=0;
    for(const sd of [1,2,3]){ const a=C.runAI(lv,sd,'noop',H); n+=a.score; const b=C.runAI(lv,sd,'strong',H); s+=b.score; m+=b.caught; }
    line.push('L'+(lv+1)+' noop'+(n/3).toFixed(0)+' st'+(s/3).toFixed(0)+'('+(m/3).toFixed(0)+'/'+C.LEVELS[lv].N+')');
  }
  console.log('H='+H+' '+line.join(' | '));
}
