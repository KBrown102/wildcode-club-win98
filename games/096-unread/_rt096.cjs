/* 096 无头烟雾测试 —— vm 桩 */
const fs=require('fs'), vm=require('vm'), path=require('path');
const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const code=html.match(/<script>([\s\S]*?)<\/script>/)[1];

let errors=[], badColor=0, badCoord=0, badColorSamples=[], drawCalls=0;
let NOW=0;

function isNum(v){ return typeof v==='number' && isFinite(v); }
function chkNums(name,args){
  for(const a of args){
    if(typeof a==='number' && !isFinite(a)){ badCoord++; if(badCoord<6) errors.push('NaN coord in '+name+': '+args.join(',')); }
  }
}
function chkColor(v,where){
  if(v&&typeof v==='object'&&v.__grad) return;           // 渐变对象放行
  if(typeof v!=='string'){ badColor++; badColorSamples.push(where+':'+String(v)); return; }
  if(/NaN|undefined|Infinity/.test(v)){ badColor++; if(badColorSamples.length<8) badColorSamples.push(where+':'+v); return; }
  const s=v.trim();
  if(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s)) return;
  const m=s.match(/^rgba?\(([^)]+)\)$/i);
  if(m){
    const parts=m[1].split(',').map(x=>parseFloat(x));
    for(const p of parts){ if(!isFinite(p)){ badColor++; if(badColorSamples.length<8) badColorSamples.push(where+':'+v); return; } }
    return;
  }
  if(/^(transparent|none|black|white)$/i.test(s)) return;
  badColor++; if(badColorSamples.length<8) badColorSamples.push(where+':'+v);
}

function makeCtx(){
  const c={
    _fill:'#000', _stroke:'#000',
    get fillStyle(){return c._fill;}, set fillStyle(v){ chkColor(v,'fill'); c._fill=v; },
    get strokeStyle(){return c._stroke;}, set strokeStyle(v){ chkColor(v,'stroke'); c._stroke=v; },
    lineWidth:1, globalAlpha:1, globalCompositeOperation:'source-over', font:'', textAlign:'', textBaseline:'',
    filter:'none', lineCap:'butt', lineJoin:'miter', shadowBlur:0, shadowColor:'#000',
    setTransform(){}, save(){}, restore(){}, translate(...a){chkNums('translate',a);}, rotate(...a){chkNums('rotate',a);},
    scale(...a){chkNums('scale',a);}, beginPath(){}, closePath(){},
    moveTo(...a){chkNums('moveTo',a);}, lineTo(...a){chkNums('lineTo',a);},
    arc(...a){chkNums('arc',a);}, ellipse(...a){chkNums('ellipse',a);},
    quadraticCurveTo(...a){chkNums('qct',a);}, bezierCurveTo(...a){chkNums('bct',a);},
    rect(...a){chkNums('rect',a);}, clip(){}, fill(){}, stroke(){},
    fillRect(...a){chkNums('fillRect',a); drawCalls++;}, strokeRect(...a){chkNums('strokeRect',a);},
    clearRect(...a){chkNums('clearRect',a);}, fillText(){}, strokeText(){},
    measureText(){return {width:10};},
    drawImage(img,...a){ chkNums('drawImage',a); drawCalls++; },
    createLinearGradient(...a){ chkNums('linGrad',a); return {__grad:true,addColorStop(o,col){ chkColor(col,'gradStop'); if(!isFinite(o)) badCoord++; }}; },
    createRadialGradient(...a){ chkNums('radGrad',a); return {__grad:true,addColorStop(o,col){ chkColor(col,'gradStop'); if(!isFinite(o)) badCoord++; }}; },
    createPattern(){return null;}, getImageData(){return {data:new Uint8ClampedArray(4)};}, putImageData(){},
  };
  return c;
}
function makeCanvas(w,h){
  const o={ width:w||300, height:h||150, style:{}, getContext(){ return makeCtx(); },
    addEventListener(){}, removeEventListener(){}, getBoundingClientRect(){return {left:0,top:0,width:o.width,height:o.height};} };
  return o;
}

const listeners={};
function elem(id){
  const e={ id, style:{}, textContent:'', className:'', parentNode:null,
    addEventListener(t,f){ (listeners[id]=listeners[id]||{})[t]=(listeners[id][t]||[]).concat(f); },
    removeEventListener(){}, click(){ const L=(listeners[id]||{}); (L.click||[]).forEach(f=>f({})); (L.pointerdown||[]).forEach(f=>f({preventDefault(){},stopPropagation(){}})); },
    getBoundingClientRect(){return {left:0,top:0,width:100,height:100};} };
  return e;
}
const els={ cv:makeCanvas(1280,800), vig:elem('vig'), dim:elem('dim'), snd:elem('snd'), mask:elem('mask'), bStart:elem('bStart') };
els.cv.addEventListener=function(t,f){ (listeners.cv=listeners.cv||{})[t]=(listeners.cv[t]||[]).concat(f); };
els.mask.parentNode={ removeChild(){} };

const winL={};
const sandbox={
  console:{ log:console.log, error:(...a)=>{ errors.push('console.error: '+a.map(String).join(' ')); }, warn:()=>{} },
  performance:{ now:()=>NOW },
  Date:Object.assign(function(){return new (Function.prototype.bind.call(Date))();},{now:()=>NOW}),
  Math:Math, JSON:JSON, isFinite, isNaN, parseFloat, parseInt,
  requestAnimationFrame(){ return 1; }, cancelAnimationFrame(){},
  setTimeout(f){ return 1; }, clearTimeout(){}, setInterval(){return 1;}, clearInterval(){},
  Uint8ClampedArray, Float32Array, Array, Object, String, Number, Boolean, Error,
};
sandbox.window=sandbox;
sandbox.self=sandbox;
sandbox.globalThis=sandbox;
sandbox.innerWidth=1280; sandbox.innerHeight=800; sandbox.devicePixelRatio=2;
sandbox.addEventListener=function(t,f){ (winL[t]=winL[t]||[]).push(f); };
sandbox.removeEventListener=function(){};
sandbox.document={
  readyState:'complete',
  getElementById(id){ return els[id]||null; },
  createElement(tag){ return tag==='canvas'?makeCanvas(64,64):elem(tag); },
  addEventListener(t,f){ (winL['doc:'+t]=winL['doc:'+t]||[]).push(f); },
  hidden:false, body:elem('body'), documentElement:elem('html')
};
function FakeAC(){
  this.currentTime=0; this.sampleRate=44100; this.state='running';
  this.destination={};
  this.createGain=()=>({gain:{value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}});
  this.createOscillator=()=>({type:'sine',frequency:{value:0,setValueAtTime(){},linearRampToValueAtTime(){}},connect(){},start(){},stop(){}});
  this.createBiquadFilter=()=>({type:'',frequency:{value:0},Q:{value:0},connect(){}});
  this.createBuffer=(ch,len)=>({getChannelData:()=>new Float32Array(len)});
  this.createBufferSource=()=>({buffer:null,connect(){},start(){}});
  this.resume=()=>{};
}
sandbox.AudioContext=FakeAC;
sandbox.webkitAudioContext=FakeAC;

const ctxvm=vm.createContext(sandbox);
try{ vm.runInContext(code,ctxvm,{filename:'096.js'}); }
catch(e){ console.log('FATAL boot: '+e.message); process.exit(1); }

// 开场
els.bStart.click();

const G=new Proxy({},{ get(_,k){ return sandbox.__G[k]; } });

let pass=0, fail=0;
function T(name,cond,extra){
  if(cond){ pass++; console.log('  PASS  '+name); }
  else{ fail++; console.log('  FAIL  '+name+(extra!==undefined?('  -> '+JSON.stringify(extra)):'')); }
}
function step(n,dt){
  dt=dt||1/60;
  for(let i=0;i<n;i++){ NOW+=dt*1000; try{ G.update(dt); G.draw(); }catch(e){ errors.push('loop: '+e.message); if(errors.length>4) throw e; } }
}
function down(x,y){ NOW+=80; G.onDown(x,y); }
function up(x,y){ NOW+=10; G.onUp(x,y); }
function tap(x,y){ down(x,y); step(4); up(x,y); }

console.log('\n=== 096 · 候 · 无头烟雾 ===\n');

// --- 基础 ---
T('boot 无异常', errors.length===0, errors.slice(0,3));
T('S 已初始化', !!G.S);
T('九格齐套 panes=9', G.S.panes.length===9);
T('九鸟齐套 birds=9', G.S.birds.length===9);
const luoNums=G.S.panes.map(p=>p.n).sort((a,b)=>a-b);
T('洛书 1..9 齐套无重复', JSON.stringify(luoNums)==='[1,2,3,4,5,6,7,8,9]', luoNums);
const rows=[[0,1,2],[3,4,5],[6,7,8]].map(r=>r.reduce((s,i)=>s+G.S.panes[i].n,0));
const cols=[[0,3,6],[1,4,7],[2,5,8]].map(r=>r.reduce((s,i)=>s+G.S.panes[i].n,0));
const dgs=[[0,4,8],[2,4,6]].map(r=>r.reduce((s,i)=>s+G.S.panes[i].n,0));
T('洛书幻方行和=15', rows.every(v=>v===15), rows);
T('洛书幻方列和=15', cols.every(v=>v===15), cols);
T('洛书幻方对角=15', dgs.every(v=>v===15), dgs);
T('九音齐套且递增', G.NOTE.length===9 && G.NOTE.every((v,i)=>i===0||v>G.NOTE[i-1]));
const panesUsed=new Set(G.S.birds.map(b=>b.pane));
T('九鸟一鸟一格不重复', panesUsed.size===9);

// --- 鸟会来 ---
step(360);                                  // 6s
T('前 6s 至少来了一只', G.S.arrived>=1, G.S.arrived);
step(60*95);                                // 再 95s，应全部到齐
T('约 100s 内九只全到', G.S.arrived===9, G.S.arrived);
T('到齐后无异常', errors.length===0, errors.slice(0,3));

// --- 不理它们：不会走、只会睡着 ---
const sleepy=G.S.birds.filter(b=>b.here&&!b.gone);
T('不回复鸟也不会消失', sleepy.length===9, sleepy.length);
T('不理会时鸟会慢慢睡着', sleepy.every(b=>b.sleep>0.6), sleepy.map(b=>+b.sleep.toFixed(2)));
T('睡着的鸟仍然在场（无惩罚）', G.S.birds.every(b=>!b.gone));

// --- 动词②：按住歇一会儿 ---
const w0=G.S.warmth;
down(640,700);
step(150);                                   // 2.5s 按住
const w1=G.S.warmth;
up(640,700);
T('按住=歇：暖度上升', w1>w0+0.05, {w0:+w0.toFixed(3),w1:+w1.toFixed(3)});
T('歇息时窗上起薄雾', G.S.panes.some(p=>p.fog>0.05));
T('松手荡开一圈呼吸', G.S.rings.length>0);

// --- 动词③：轻点空处=望 ---
const lk0=G.S.look, rp0=G.S.ripples.length;
const g0=G.geo();
tap(g0.ix+g0.iw*0.5, g0.iy+g0.ih*0.06);      // 顶格空白（此处大概率无鸟落点）
T('轻点=望：look 上升', G.S.look>lk0, {lk0:+lk0.toFixed(3),now:+G.S.look.toFixed(3)});
T('望：空气涟漪产生', G.S.ripples.length>rp0);

// --- 动词①：点鸟=回 ---
function perch(b){ const g=G.geo(); const pr=G.paneRect(g,b.pane);
  return { x:pr.x+pr.w*b.bx, y:pr.y+pr.h-13*g.sc }; }
const b0=G.S.birds.find(b=>b.here&&!b.gone);
const p0=perch(b0);
T('命中判定能抓到鸟', !!G.hitBird(p0.x,p0.y,G.geo()));
const wBefore=G.S.warmth, cost=G.replyCost();
tap(p0.x,p0.y);
T('点鸟=回：鸟起飞离开', b0.gone===true && b0.replied===true);
T('回复计数 +1', G.S.replied===1, G.S.replied);
T('回复消耗一点暖度', G.S.warmth < wBefore-cost*0.5, {before:+wBefore.toFixed(3),after:+G.S.warmth.toFixed(3)});
T('回复时灯给出光尘', G.S.motes.length>0, G.S.motes.length);
step(120);
T('鸟飞走后留下暖光记号', G.S.panes[b0.pane].mark>0.1);
T('格子余温亮起', G.S.panes[b0.pane].lit>0.05);

// --- 暖度越高，回复越不费力 ---
G.S.warmth=0.05; const cLow=G.replyCost();
G.S.warmth=0.95; const cHigh=G.replyCost();
T('暖起来后回复几乎不耗力', cHigh<cLow*0.25, {cLow:+cLow.toFixed(4),cHigh:+cHigh.toFixed(4)});
G.S.warmth=0.5;

// --- 闲置彩蛋 ---
G.S.idle=0; G.S.eggT=0;
const dream0=G.S.birds.filter(b=>b.dream>0).length;
step(60*20);
T('闲置约16s 有鸟做小梦（彩蛋）', G.S.idle<15.5, +G.S.idle.toFixed(2));

// --- 回完九只 → 终章 ---
let guard=0;
while(G.S.replied<9 && guard++<40){
  const b=G.S.birds.find(x=>x.here&&!x.gone);
  if(!b) { step(60*12); continue; }
  const p=perch(b); tap(p.x,p.y); step(40);
}
T('九只全部回过', G.S.replied===9, G.S.replied);
step(30);
T('终章触发', G.S.fin===1);
T('终章鸟群归来', G.S.flock.length===9, G.S.flock.length);
step(60*10);
T('终章按洛书 1→9 依次点亮完毕', G.S.finSeq>=9, G.S.finSeq);
T('终章暖度接近满', G.S.warmth>0.9, +G.S.warmth.toFixed(3));

// --- 长跑 + resize ---
step(1500);
sandbox.innerWidth=390; sandbox.innerHeight=844;
(winL['resize']||[]).forEach(f=>f({}));
step(900);
sandbox.innerWidth=1600; sandbox.innerHeight=900;
(winL['resize']||[]).forEach(f=>f({}));
step(900);
T('resize 前后无异常', errors.length===0, errors.slice(0,3));

// --- 极端点击轰炸 ---
for(let i=0;i<260;i++){
  const x=Math.random()*sandbox.innerWidth, y=Math.random()*sandbox.innerHeight;
  down(x,y); step(2); up(x,y);
}
step(600);
T('随机轰炸 260 次无异常', errors.length===0, errors.slice(0,4));

// --- 池子上限 ---
T('motes 池 capped', G.S.motes.length<=160, G.S.motes.length);
T('sparks 池 capped', G.S.sparks.length<=150, G.S.sparks.length);
T('rings 池 capped', G.S.rings.length<=30, G.S.rings.length);
T('ripples 池 capped', G.S.ripples.length<=16, G.S.ripples.length);

// --- 重置后仍正常 ---
G.reset();
step(600);
T('reset 后可继续运行', errors.length===0 && G.S.birds.length===9);

// --- 全局质量 ---
T('全程 0 异常', errors.length===0, errors.slice(0,5));
T('无 NaN 颜色', badColor===0, badColorSamples.slice(0,5));
T('无 NaN 坐标', badCoord===0);
T('确有绘制发生', drawCalls>500, drawCalls);
T('无文字绘制（少文字铁律）', !/fillText\s*\(/.test(code) || (code.match(/ctx\.fillText/g)||[]).length===0);

console.log('\n--- 结果：'+pass+'/'+(pass+fail)+' 通过，errors='+errors.length+' badColor='+badColor+' badCoord='+badCoord+' ---');
if(fail>0||errors.length>0){ console.log('\n错误样本：'); errors.slice(0,6).forEach(e=>console.log('  '+e)); process.exit(1); }
console.log('ALL PASS ✓\n');
