const G = require('./game.js');
const seeds = [11,22,33,44,55,66,77,88];
const out=[];
for(let lv=0;lv<8;lv++){
  let bases=[], strs=[], lit=[];
  for(const s of seeds){
    const geo=G.genLevel(lv,s);
    const st=G.makeState(lv,geo,s); st.sandMax=geo.quota; st.sandBase=geo.quota; st.sandLeft=geo.quota;
    G.runAI(st,'strong',240);
    const base=G.homesCount(st)*G.CAT_PT + Math.round(st.litCount*G.LAMP_PT);
    bases.push(base); strs.push(G.score(st)); lit.push(st.litCount);
  }
  const mn=a=>Math.min(...a), avg=a=>Math.round(a.reduce((x,y)=>x+y,0)/a.length);
  const s1=Math.round(mn(bases)*0.95), s3=Math.round(avg(strs)*0.85);
  const s2=Math.round(s1+(s3-s1)*0.55);
  out.push({lv:lv+1, lit:mn(lit)+'-'+Math.max(...lit), base:mn(bases)+'-'+Math.max(...bases), str:mn(strs)+'-'+Math.max(...strs), avg:avg(strs), s1,s2,s3});
}
console.table(out);
console.log(JSON.stringify(out.map(r=>[r.s1,r.s2,r.s3])));
