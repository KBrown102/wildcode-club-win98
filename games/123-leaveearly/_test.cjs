/* 无头烟雾测试：123-leaveearly */
const fs=require('fs'),vm=require('vm'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const js=html.match(/<script>([\s\S]*?)<\/script>/)[1];

let errors=[],badColor=[],badCoord=[],textDraw=0,maxAlphaBad=0;
let W=1280,H=800;
function chk(tag,v){
  if(typeof v==='number'&&!isFinite(v))badCoord.push(tag+':'+v);
}
function chkColor(tag,c){
  if(c&&c.__grad)return;
  if(typeof c!=='string'){badColor.push(tag+':'+typeof c);return;}
  if(/NaN|undefined|null/i.test(c))badColor.push(tag+':'+c);
}
function mkCtx(){
  const o={
    _fill:'#000',_stroke:'#000',globalAlpha:1,lineWidth:1,lineCap:'butt',
    globalCompositeOperation:'source-over',font:'',textAlign:'',textBaseline:'',
    set fillStyle(v){chkColor('fill',v);o._fill=v;},get fillStyle(){return o._fill;},
    set strokeStyle(v){chkColor('stroke',v);o._stroke=v;},get strokeStyle(){return o._stroke;},
    setTransform(){},save(){},restore(){},beginPath(){},closePath(){},
    moveTo(x,y){chk('moveTo',x);chk('moveTo',y);},
    lineTo(x,y){chk('lineTo',x);chk('lineTo',y);},
    quadraticCurveTo(a,b,c,d){[a,b,c,d].forEach(v=>chk('quad',v));},
    arc(x,y,r){chk('arc',x);chk('arc',y);chk('arcR',r);if(r<0)badCoord.push('negR:'+r);},
    ellipse(x,y,rx,ry){[x,y,rx,ry].forEach(v=>chk('ellipse',v));},
    fill(){},stroke(){},
    fillRect(x,y,w,h){[x,y,w,h].forEach(v=>chk('fillRect',v));},
    strokeRect(x,y,w,h){[x,y,w,h].forEach(v=>chk('strokeRect',v));},
    clearRect(){},clip(){},translate(){},rotate(){},scale(){},
    drawImage(img,x,y,w,h){[x,y,w,h].forEach(v=>chk('drawImage',v));
      if(w<0||h<0)badCoord.push('negSize');},
    fillText(){textDraw++;},strokeText(){textDraw++;},
    measureText(){return{width:10};},
    createLinearGradient(){return grad();},
    createRadialGradient(){return grad();},
    getImageData(){return{data:new Uint8ClampedArray(4)};},
    putImageData(){},
  };
  return o;
}
function grad(){return {__grad:true,addColorStop(p,c){chkColor('gradStop',c);if(!isFinite(p))badCoord.push('gradPos');}};}

const listeners={};
function mkEl(id){
  return {id,style:{},textContent:'',parentNode:null,
    addEventListener(t,f){(listeners[id+':'+t]=listeners[id+':'+t]||[]).push(f);},
    removeEventListener(){},click(){(listeners[id+':click']||[]).forEach(f=>f({}));},
    getBoundingClientRect(){return{left:0,top:0,width:W,height:H};},
    getContext(){return mkCtx();},width:0,height:0};
}
const els={};
['cv','warm','cool','vig','hint','fin','ui','bMute','bAgain','mask','bStart'].forEach(i=>els[i]=mkEl(i));
els.cv.getContext=()=>CTX;
const CTX=mkCtx();

let NOW=0;
const winL={};
const sandbox={
  console,
  performance:{now(){return NOW;}},
  Date:Date,Math:Math,JSON:JSON,
  setTimeout:(f,t)=>{try{f();}catch(e){errors.push('timeout:'+e.message);}return 1;},
  clearTimeout(){},
  requestAnimationFrame(){return 1;},cancelAnimationFrame(){},
  document:{
    readyState:'complete',
    getElementById:id=>els[id]||null,
    addEventListener(t,f){(listeners['doc:'+t]=listeners['doc:'+t]||[]).push(f);},
    createElement(tag){
      if(tag==='canvas'){const c=mkEl('tmpcv');c.getContext=()=>mkCtx();return c;}
      return mkEl(tag);
    }
  },
  window:{
    innerWidth:W,innerHeight:H,devicePixelRatio:2,
    addEventListener(t,f){(winL[t]=winL[t]||[]).push(f);},
    removeEventListener(){},
    AudioContext:function(){throw new Error('noaudio');}
  },
  Uint8ClampedArray,Object,Array,String,Number,Boolean,Error,isFinite,parseInt,parseFloat
};
sandbox.globalThis=sandbox;
sandbox.window.document=sandbox.document;
vm.createContext(sandbox);
try{vm.runInContext(js,sandbox,{filename:'game.js'});}catch(e){errors.push('load:'+e.message+'\n'+e.stack);}

const G=sandbox.__G;
const res=[];
function ok(n,c,extra){res.push([c?'PASS':'FAIL',n+(extra?' ('+extra+')':'')]);}

ok('脚本加载无异常',errors.length===0,errors.slice(0,2).join('|'));
ok('探针存在',!!G);
if(!G){print();process.exit(1);}

ok('初始 7 排未点亮',G.S.lit.filter(Boolean).length===0);
ok('ROWS=7',G.ROWS===7);
ok('文案 7 条',G.LINES.length===7);

/* 开场按钮 */
try{els.bStart.click();ok('开场按钮可点',true);}catch(e){ok('开场按钮可点',false,e.message);}
ok('遮罩 pointerEvents=none',els.mask.style.pointerEvents==='none',String(els.mask.style.pointerEvents));

/* 空跑 800 帧 */
function run(n){
  for(let i=0;i<n;i++){
    NOW+=1000/60;
    try{G.update(1/60);G.draw();}catch(e){errors.push('frame:'+e.message+'\n'+(e.stack||'').split('\n')[1]);break;}
  }
}
run(800);
ok('空跑 800 帧无异常',errors.length===0,errors.slice(0,1).join(''));

/* 点灯：逐排走到底 */
const g0=G.geo();
let litOrder=[];
for(let r=0;r<7;r++){
  G.setCam(r);
  run(6);
  const L=G.lampPos(G.geo(),r,G.S.cam);
  ok('第'+r+'排灯在屏内',L.x>-50&&L.x<W+50&&L.y>-200&&L.y<H+400,
     Math.round(L.x)+','+Math.round(L.y));
  ok('第'+r+'排可及',G.reachable(r,G.S.cam));
  NOW+=200;
  G.press(L.x,L.y);NOW+=30;G.release();
  if(G.S.lit[r])litOrder.push(r);
  run(10);
}
ok('七盏全部点亮',G.S.lit.every(Boolean),'lit='+G.S.lit.filter(Boolean).length);
ok('nlit 计数正确',G.S.nlit===7,'nlit='+G.S.nlit);

/* 终章 */
G.setCam(6);
run(400);
ok('终章触发',G.S.finStart===true);
ok('终章推进到 1',G.S.fin>0.9,'fin='+G.S.fin.toFixed(2));
ok('终章 fin 文字层显示',els.fin.style.opacity==='1');
run(600);
ok('终章后继续跑无异常',errors.length===0,errors.slice(0,1).join(''));

/* 重来 */
G.restart();
ok('重来后清零',G.S.nlit===0&&G.S.lit.every(v=>!v));
ok('重来后 fin 层瞬清零',els.fin.style.opacity==='0');
run(120);

/* 拖拽 = 走，不误点灯 */
G.restart();run(5);
NOW+=200;
G.press(W*0.5,H*0.5);
for(let i=1;i<=10;i++){NOW+=16;G.move(W*0.5,H*0.5+i*20);}
G.release();
run(30);
ok('拖拽改变了目标排',G.S.camT>0.4,'camT='+G.S.camT.toFixed(2));
ok('拖拽没有误点亮',G.S.nlit===0);

/* 往回拖 */
NOW+=200;
G.press(W*0.5,H*0.5);
for(let i=1;i<=12;i++){NOW+=16;G.move(W*0.5,H*0.5-i*22);}
G.release();run(40);
ok('可以往回走',G.S.camT<0.2,'camT='+G.S.camT.toFixed(2));

/* 按住 = 停下来听 */
G.restart();run(5);
NOW+=300;
G.press(W*0.5,H*0.62);
for(let i=0;i<200;i++){NOW+=1000/60;G.update(1/60);G.draw();}
const bcount=G.S.breaths.length,rcount=G.S.ripples.length;
ok('按住产生呼吸圈',bcount>0,'breaths='+bcount);
ok('按住给未点灯提示',rcount>0,'ripples='+rcount);
G.release();run(60);

/* 闲置彩蛋 */
G.restart();run(5);
for(let i=0;i<1400;i++){NOW+=1000/60;G.update(1/60);G.draw();}
ok('闲置彩蛋触发过或已复位',G.S.idle<17,'idle='+G.S.idle.toFixed(1));

/* 竖屏 */
sandbox.window.innerWidth=390;sandbox.window.innerHeight=844;
(winL['resize']||[]).forEach(f=>f());
W=390;H=844;
G.restart();
let allReach=true,off=[];
for(let r=0;r<7;r++){
  G.setCam(r);run(4);
  const L=G.lampPos(G.geo(),r,G.S.cam);
  if(!(L.x>0&&L.x<390&&L.y>-100&&L.y<844+300)){allReach=false;off.push(r+':'+Math.round(L.x)+','+Math.round(L.y));}
  NOW+=200;G.press(L.x,L.y);NOW+=30;G.release();
}
ok('竖屏七盏皆可达',allReach&&G.S.nlit===7,'off='+off.join(' ')+' nlit='+G.S.nlit);
run(300);

/* 粒子封顶 */
G.restart();
for(let k=0;k<40;k++){G.S.warms.push({x:1,y:1,vx:0,vy:0,t:0,life:9,r:2});}
for(let r=0;r<7;r++){G.setCam(r);run(3);NOW+=200;const L=G.lampPos(G.geo(),r,G.S.cam);G.press(L.x,L.y);NOW+=30;G.release();}
run(20);
ok('暖屑封顶 <=64',G.S.warms.length<=64,'n='+G.S.warms.length);
ok('涟漪封顶 <=12',G.S.ripples.length<=12,'n='+G.S.ripples.length);
ok('呼吸圈封顶 <=8',G.S.breaths.length<=8,'n='+G.S.breaths.length);
run(1200);

ok('全程 0 异常',errors.length===0,errors.slice(0,2).join('|'));
ok('无非法颜色',badColor.length===0,badColor.slice(0,3).join('|'));
ok('无 NaN 坐标',badCoord.length===0,badCoord.slice(0,3).join('|'));
ok('画布零文字',textDraw===0,'n='+textDraw);

function print(){
  let p=0,f=0;
  res.forEach(([s,n])=>{if(s==='PASS')p++;else f++;console.log(s+'  '+n);});
  console.log('\n'+p+'/'+(p+f)+(f?('  ✗ '+f+' FAILED'):'  ALL PASS'));
  if(errors.length)console.log('\nERRORS:\n'+errors.slice(0,4).join('\n---\n'));
}
print();
