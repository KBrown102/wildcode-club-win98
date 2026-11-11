const G=require('./js/game.js');
function run(lv,seed,policy){
  const st=G.makeState(); G.start(st,lv,seed);
  let guard=0;
  while(!st.over && guard++<6000){
    if(!st.queue.length){ G.update(st,1/60); continue; }
    let did=false;
    if(policy==='noop'){ G.update(st,1/60); continue; }
    if(policy==='strong'){
      for(let qi=0;qi<st.queue.length;qi++){
        const id=st.queue[qi]; const p=st.plan[id];
        if(p && !st.shelves[p.s].cells[p.c]){ G.setHold(st,qi); did=G.place(st,p.s,p.c); break; }
      }
      if(!did){ outer: for(let s=0;s<st.shelves.length;s++) for(let c=0;c<st.shelves[s].cols;c++) if(!st.shelves[s].cells[c]){ G.place(st,s,c); did=true; break outer; } }
    } else if(policy==='naive'){
      const it=G.heldItem(st); let put=null;
      o2: for(let s=0;s<st.shelves.length&&!put;s++) for(let c=0;c<st.shelves[s].cols;c++) if(st.shelves[s].zones[c]===it.kind && !st.shelves[s].cells[c]){put={s,c};break o2;}
      if(!put){ o3: for(let s=0;s<st.shelves.length;s++) for(let c=0;c<st.shelves[s].cols;c++) if(!st.shelves[s].cells[c]){put={s,c};break o3;} }
      did=put?G.place(st,put.s,put.c):false;
    } else if(policy==='greedy'){
      const it=G.heldItem(st); let best=null,bestE=1e9;
      for(let s=0;s<st.shelves.length;s++) for(let c=0;c<st.shelves[s].cols;c++){
        if(st.shelves[s].cells[c]) continue;
        const inz = st.shelves[s].zones[c]===it.kind;
        st.shelves[s].cells[c]=it;
        let mx=0; for(let k=0;k<st.shelves.length;k++) mx=Math.max(mx,Math.abs(G.torqueOf(st.shelves[k])));
        st.shelves[s].cells[c]=null;
        const e = mx + (inz?0:60);
        if(e<bestE){bestE=e;best={s,c};}
      }
      did=best?G.place(st,best.s,best.c):false;
    } else if(policy==='random'){
      const cand=[]; for(let s=0;s<st.shelves.length;s++) for(let c=0;c<st.shelves[s].cols;c++) if(!st.shelves[s].cells[c]) cand.push({s,c});
      if(cand.length){const p=cand[Math.floor(Math.random()*cand.length)]; did=G.place(st,p.s,p.c);}
    }
    G.update(st,1/60);
  }
  return {win:st.win, sc:(st.over?st.finalScore:G.score(st)), moves:st.moves, slides:st.slides, falls:st.falls};
}
module.exports={run,G};
if(require.main===module){
  const pol=['noop','random','naive','greedy','strong'];
  for(const p of pol){
    const row=[]; let wins=0,tot=0,sum=0;
    for(let lv=0;lv<8;lv++){ let a=0,w=0;
      for(let sd=1;sd<=6;sd++){const r=run(lv,sd,p); a+=r.sc; if(r.win)w++; sum+=r.sc; tot++;}
      row.push(Math.round(a/6)+(w>0?'*'+w:'')); wins+=w;
    }
    console.log(p.padEnd(7),'wins='+wins+'/48','avg='+Math.round(sum/tot),'|',row.join('  '));
  }
}
