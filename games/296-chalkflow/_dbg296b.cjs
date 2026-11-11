const C=require('./game.js');
const H=760;
const lv=6;
const st=C.makeLevel(lv,1,H); st.rndf=C.mulberry32(1*31+7);
const order=st.bins.slice().sort((a,b)=>b.val-a.val); const bin=order[0];
C.addStroke(st,C.resample([{x:st.funnel.x-6,y:st.funnel.y+40},{x:bin.cx-bin.w*0.18,y:bin.y-28}]),0);
C.addStroke(st,C.resample([{x:bin.x+bin.w+9,y:bin.y-52},{x:bin.x+bin.w+9,y:bin.y+26}]),1);
console.log('funnel',st.funnel.x.toFixed(1),st.funnel.y.toFixed(1),'bin',bin.x.toFixed(0),bin.y);
let g=0;
while(!st.done&&g<26000){
  C.step(st,1/60); g++;
  if(st.balls.length&&g%8===0){const b=st.balls[0];console.log('t',st.time.toFixed(2),b.x.toFixed(1),b.y.toFixed(1),b.vx.toFixed(0),b.vy.toFixed(0));}
  if(g>260)break;
}
