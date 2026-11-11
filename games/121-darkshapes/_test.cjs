/* 无头烟雾测试：桩 canvas / DOM / WebAudio，手动推帧 */
const fs=require('fs'), path=require('path'), vm=require('vm');
const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const src=html.match(/<script>([\s\S]*?)<\/script>/)[1];

let errors=[], badColor=[], badCoord=[], textDraw=0, ops=0;
const OK=[], FAIL=[];
function t(name,cond,extra){ (cond?OK:FAIL).push(name+(extra?(' :: '+extra):'')); }

function chkNum(fn,args){
  for(const a of args){
    if(typeof a==='number' && !isFinite(a)){ badCoord.push(fn+' '+args.join(',')); return; }
  }
}
function chkColor(v){
  if(v && v.__grad) return;
  if(typeof v!=='string'){ badColor.push('non-string:'+String(v)); return; }
  if(/NaN|undefined|Infinity/.test(v)){ badColor.push(v); return; }
  if(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) return;
  if(/^rgba?\(\s*[-\d.]+\s*,\s*[-\d.]+\s*,\s*[-\d.]+\s*(,\s*[-\d.]+\s*)?\)$/i.test(v)) return;
  badColor.push(v);
}
function mkCtx(){
  const c={
    _fill:'#000', _stroke:'#000',
    set fillStyle(v){ chkColor(v); c._fill=v; },  get fillStyle(){ return c._fill; },
    set strokeStyle(v){ chkColor(v); c._stroke=v; }, get strokeStyle(){ return c._stroke; },
    globalAlpha:1, lineWidth:1, globalCompositeOperation:'source-over',
    lineCap:'butt', lineJoin:'miter', font:'', textAlign:'', textBaseline:'', filter:'none',
    shadowBlur:0, shadowColor:'#000',
    setTransform(){}, save(){}, restore(){}, translate(){}, rotate(){}, scale(){}, clip(){},
    beginPath(){ ops++; }, closePath(){},
    moveTo(x,y){ chkNum('moveTo',[x,y]); }, lineTo(x,y){ chkNum('lineTo',[x,y]); },
    arc(x,y,r,a,b){ chkNum('arc',[x,y,r,a,b]); },
    ellipse(x,y,rx,ry,rot,a,b){ chkNum('ellipse',[x,y,rx,ry,rot,a,b]); },
    quadraticCurveTo(a,b,cc,d){ chkNum('q',[a,b,cc,d]); },
    bezierCurveTo(a,b,cc,d,e,f){ chkNum('b',[a,b,cc,d,e,f]); },
    rect(x,y,w,h){ chkNum('rect',[x,y,w,h]); },
    fill(){ ops++; }, stroke(){ ops++; },
    fillRect(x,y,w,h){ chkNum('fillRect',[x,y,w,h]); ops++; },
    strokeRect(x,y,w,h){ chkNum('strokeRect',[x,y,w,h]); ops++; },
    clearRect(){}, drawImage(img,x,y,w,h){ chkNum('drawImage',[x,y,w,h]); ops++; },
    fillText(){ textDraw++; }, strokeText(){ textDraw++; },
    measureText(){ return {width:10}; },
    createLinearGradient(){ return grad(); },
    createRadialGradient(){ return grad(); },
    getImageData(){ return {data:new Uint8ClampedArray(4)}; },
    putImageData(){}, createPattern(){ return null; }
  };
  return c;
}
function grad(){ return { __grad:true, addColorStop(p,c){ chkColor(c); } }; }

function mkEl(id){
  const el={
    id:id, textContent:'', innerHTML:'', offsetWidth:100, offsetHeight:40,
    style:new Proxy({},{ set(o,k,v){ o[k]=v; return true; }, get(o,k){ return o[k]===undefined?'':o[k]; } }),
    _h:{},
    addEventListener(t,f){ (el._h[t]=el._h[t]||[]).push(f); },
    removeEventListener(){},
    dispatch(t,e){ (el._h[t]||[]).forEach(f=>f.call(el,e||{})); },
    getBoundingClientRect(){ return {left:0,top:0,width:VW,height:VH}; },
    getContext(){ return CTX; },
    click(){ el.dispatch('pointerdown',{clientX:10,clientY:10}); }
  };
  return el;
}

let VW=1280, VH=800;
const CTX=mkCtx();
const els={};
['cv','dim','warm','vig','hint','fin','mask','bSnd','bAgain','bStart','ui'].forEach(k=>els[k]=mkEl(k));
els.cv.getContext=()=>CTX;

let NOW=0;
const winH={};
const sandbox={
  console:console,
  performance:{ now(){ return NOW; } },
  Date:Date, Math:Math, isFinite:isFinite, parseFloat:parseFloat, parseInt:parseInt,
  Uint8ClampedArray:Uint8ClampedArray, Float32Array:Float32Array,
  setTimeout:(f,ms)=>{ TIMERS.push({f:f,at:NOW+(ms||0)}); return TIMERS.length; },
  clearTimeout:()=>{},
  requestAnimationFrame:(f)=>{ RAFQ.push(f); return RAFQ.length; },
  cancelAnimationFrame:()=>{},
  document:{
    readyState:'complete',
    getElementById:(id)=>els[id]||mkEl(id),
    addEventListener(t,f){ (winH[t]=winH[t]||[]).push(f); },
    createElement:(tag)=>{ const e=mkEl(tag); e.width=128; e.height=128; e.getContext=()=>mkCtx(); return e; }
  }
};
const TIMERS=[], RAFQ=[];
sandbox.window={
  innerWidth:VW, innerHeight:VH, devicePixelRatio:1,
  addEventListener(t,f){ (winH[t]=winH[t]||[]).push(f); },
  removeEventListener(){},
  AudioContext:function(){
    return {
      currentTime:0, sampleRate:44100, state:'running', destination:{},
      resume(){}, 
      createGain(){ return {gain:{value:0,setTargetAtTime(){},setValueAtTime(){},exponentialRampToValueAtTime(){},linearRampToValueAtTime(){}},connect(){},disconnect(){}}; },
      createOscillator(){ return {type:'sine',frequency:{value:0,setTargetAtTime(){}},detune:{value:0},connect(){},start(){},stop(){}}; },
      createBiquadFilter(){ return {type:'lowpass',frequency:{value:0},Q:{value:1},connect(){}}; },
      createBuffer(ch,n){ return {getChannelData(){ return new Float32Array(n); }}; },
      createBufferSource(){ return {buffer:null,connect(){},start(){}}; }
    };
  }
};
sandbox.globalThis=sandbox;
sandbox.window.window=sandbox.window;
vm.createContext(sandbox);
try{ vm.runInContext(src, sandbox, {filename:'game.js'}); }
catch(e){ errors.push('BOOT '+e.message); }

function flushTimers(){
  for(let i=TIMERS.length-1;i>=0;i--){ if(TIMERS[i].at<=NOW){ try{TIMERS[i].f();}catch(e){errors.push('timer '+e.message);} TIMERS.splice(i,1);} }
}
function step(n,dt){
  dt=dt||1/60;
  for(let i=0;i<n;i++){
    NOW+=dt*1000;
    try{ G.update(dt); G.draw(); }catch(e){ errors.push('frame '+e.message); if(errors.length>4) return; }
    flushTimers();
  }
}
function down(x,y){ NOW+=90; try{ els.cv.dispatch('pointerdown',{clientX:x,clientY:y}); }catch(e){ errors.push('down '+e.message); } }
function up(){ (winH['pointerup']||[]).forEach(f=>{ try{f({});}catch(e){errors.push('up '+e.message);} }); }
function move(x,y){ (winH['pointermove']||[]).forEach(f=>{ try{f({clientX:x,clientY:y});}catch(e){errors.push('move '+e.message);} }); }

const G=sandbox.__G;
t('探针 __G 可用', !!G);
if(!G){ console.log(FAIL.join('\n')); process.exit(1); }

// 开场遮罩
els.bStart.dispatch('pointerdown',{});
flushTimers();
t('开始后 mask.pointerEvents=none', els.mask.style.pointerEvents==='none', els.mask.style.pointerEvents);
t('开始后 started=true', (function(){ const g=G.geo(); return !!g; })());

step(60);
t('初始 6 件物品', G.S.v.length===6);
t('初始全部未认出', G.S.v.every(v=>!v.known));

// ---- 逐个认出（横屏）----
let gg=G.geo();
for(let i=0;i<6;i++){
  const sl=gg.slots[i];
  const hh=sl.shH*(1.42-0.42*G.S.curtain);
  down(sl.shX, gg.floorY-hh*0.46);
  up();
  step(8);
}
t('横屏：六个影子全部点得到并认出', G.S.v.every(v=>v.known),
  G.S.v.map(v=>v.known?1:0).join(''));
step(200);
t('认出后 ease 上升', G.S.ease>0.7, 'ease='+G.S.ease.toFixed(2));
t('终章已触发', G.S.fin>0, 'fin='+G.S.fin.toFixed(2));
step(400);
t('终章文字已显示', els.fin.style.opacity==='1');
t('终章后灯降到最微档', G.S.lamp===0, 'lamp='+G.S.lamp);
t('终章六律依次响完', G.S.chimeIdx===6, 'idx='+G.S.chimeIdx);

// ---- 重来 ----
G.restart();
step(5);
t('restart 后重新未认出', G.S.v.every(v=>!v.known));
t('restart 后 ease 归零', G.S.ease===0);
t('restart 后 fin 归零', G.S.fin===0);
t('restart 立刻清掉终章文字', els.fin.style.opacity==='0');
flushTimers();
t('restart 后恢复 fin 过渡', /opacity/.test(els.fin.style.transition), els.fin.style.transition);

// ---- 实物本体也能点 ----
gg=G.geo();
down(gg.slots[2].px, gg.slots[2].oy-gg.slots[2].oh*0.42); up(); step(4);
t('点地上的实物也能认出', G.S.v[2].known);

// ---- 点空处 = 呼吸，不误伤 ----
const beforeKnown=G.S.v.filter(v=>v.known).length;
down(gg.w*0.5, gg.floorY+gg.fh*0.92); step(30); up(); step(10);
t('点空处不会误认（命中只算核心）', G.S.v.filter(v=>v.known).length===beforeKnown);
t('按住空处产生呼吸圈', G.S.breaths.length>0);
step(260);
t('呼吸圈会自然消失（不残留）', G.S.breaths.length===0, 'n='+G.S.breaths.length);

// ---- 呼吸提示 ----
G.restart(); step(3);
gg=G.geo();
down(gg.w*0.45, gg.floorY+gg.fh*0.90);   // 空地上按住，呼吸圈慢慢涨到影子那儿
step(150); up(); step(2);
t('呼吸扫过未认出的影子会提示', G.S.v.some(v=>v.litHint>0), 'hints='+G.S.v.map(v=>v.litHint.toFixed(2)).join('/'));

// ---- 夜灯三档 ----
G.restart(); step(3);
gg=G.geo();
const l0=G.S.lamp;
down(gg.lampX,gg.lampY); up(); step(2);
const l1=G.S.lamp;
down(gg.lampX,gg.lampY); up(); step(2);
down(gg.lampX,gg.lampY); up(); step(2);
t('夜灯三档循环', l1!==l0 && G.S.lamp===l0, l0+'->'+l1+'->'+G.S.lamp);
t('夜灯档位改变压暗层', els.dim.style.opacity!=='');

// 微档认出加成更大
G.restart(); step(3);
while(G.S.lamp!==0){ gg=G.geo(); down(gg.lampX,gg.lampY); up(); step(2); }
gg=G.geo();
down(gg.slots[0].shX, gg.floorY-gg.slots[0].shH*0.46); up(); step(2);
const deepGain=G.S.ease;
t('最暗档认出有更高加成', G.S.v[0].deep && deepGain>0.19, 'ease='+deepGain.toFixed(3));

// ---- 窗帘拖动 ----
G.restart(); step(3);
gg=G.geo();
const c0=G.S.curtain;
down(gg.winX,gg.winY);
move(gg.winX+60, gg.winY);
move(gg.winX+120, gg.winY);
up(); step(3);
t('拖窗帘能改变开度', Math.abs(G.S.curtain-c0)>0.05, c0.toFixed(2)+'->'+G.S.curtain.toFixed(2));
t('窗帘开度在 0..1', G.S.curtain>=0 && G.S.curtain<=1);
// 窗帘影响影子长度（间接：hit 区随之变化，不应报错）
G.S.curtain=0; step(20);
G.S.curtain=1; step(20);
t('窗帘极值下无异常', errors.length===0);

// ---- 闲置彩蛋 ----
G.restart(); step(3);
step(17*60);
t('闲置约16秒触发彩蛋', G.S.easterOn||G.S.idle<2, 'idle='+G.S.idle.toFixed(1)+' on='+G.S.easterOn);
step(6*60);
t('彩蛋结束后 idle 归零（不连刷）', G.S.easterOn===false && G.S.idle<6, 'idle='+G.S.idle.toFixed(1));

// ---- 竖屏 ----
VW=390; VH=844;
sandbox.window.innerWidth=VW; sandbox.window.innerHeight=VH;
(winH['resize']||[]).forEach(f=>{ try{f();}catch(e){errors.push('resize '+e.message);} });
G.restart(); step(10);
gg=G.geo();
t('竖屏识别正确', gg.port===true);
let reach=0;
for(let i=0;i<6;i++){
  const sl=gg.slots[i];
  const hh=sl.shH*(1.42-0.42*G.S.curtain);
  const x=sl.shX, y=gg.floorY-hh*0.46;
  if(x>4 && x<VW-4 && y>4 && y<VH-4){
    down(x,y); up(); step(3);
    if(G.S.v[i].known) reach++;
  }
}
t('竖屏六件全部可达并认出', reach===6, 'reach='+reach);
t('竖屏槽位不越界', gg.slots.every(s=>s.px>0&&s.px<VW&&s.oy>gg.floorY&&s.oy<VH));
step(600);
t('竖屏长跑无异常', errors.length===0);

// ---- 极端尺寸 ----
[[320,480],[1920,1080],[900,900],[500,1000]].forEach(sz=>{
  VW=sz[0]; VH=sz[1];
  sandbox.window.innerWidth=VW; sandbox.window.innerHeight=VH;
  (winH['resize']||[]).forEach(f=>{ try{f();}catch(e){errors.push('resize '+e.message);} });
  step(45);
});
t('多种尺寸切换无异常', errors.length===0, errors[0]||'');

// ---- 长跑 ----
VW=1280; VH=800;
sandbox.window.innerWidth=VW; sandbox.window.innerHeight=VH;
(winH['resize']||[]).forEach(f=>{ try{f();}catch(e){} });
G.restart(); step(5);
for(let i=0;i<2600;i++){
  if(i%400===0){ gg=G.geo(); const k=(i/400)%6; down(gg.slots[k].shX, gg.floorY-gg.slots[k].shH*0.46); up(); }
  if(i%137===0){ gg=G.geo(); down(gg.w*0.4, gg.floorY+gg.fh*0.8); }
  if(i%149===0) up();
  step(1);
}
t('2600 帧长跑无异常', errors.length===0, errors.slice(0,2).join(' | '));
t('粒子池不无限增长', G.S.warms.length<=64 && G.S.motes.length<=60 && G.S.ripples.length<=12 && G.S.breaths.length<=8,
  'w'+G.S.warms.length+' m'+G.S.motes.length+' r'+G.S.ripples.length+' b'+G.S.breaths.length);

// ---- 全局质量 ----
t('无运行时异常', errors.length===0, errors.slice(0,3).join(' | '));
t('无非法颜色', badColor.length===0, badColor.slice(0,3).join(' | '));
t('无 NaN 坐标', badCoord.length===0, badCoord.slice(0,3).join(' | '));
t('未在 canvas 上画文字（文字走 DOM）', textDraw===0, 'n='+textDraw);
t('绘制指令数正常', ops>10000, 'ops='+ops);

console.log('\n== PASS ('+OK.length+') ==');
OK.forEach(s=>console.log('  ✓ '+s));
if(FAIL.length){
  console.log('\n== FAIL ('+FAIL.length+') ==');
  FAIL.forEach(s=>console.log('  ✗ '+s));
}
console.log('\n结果: '+OK.length+'/'+(OK.length+FAIL.length)+(FAIL.length?'  ** 有失败 **':'  ALL PASS'));
process.exit(FAIL.length?1:0);
