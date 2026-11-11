
"use strict";
(function(){
// ====== 基础 ======
const cv=document.getElementById('cv'), ctx=cv.getContext('2d');
let W=0,H=0,DPR=1;
// 布局缓存（resize 时重算）
let cx=0,cy=0,R=0,MR=0;                 // 圈心 / 圈半径 / 珠半径
const SHOME={x:0,y:0};                  // 母珠出发点（圈下方）
// 颜色（暖旧玻璃珠）
const COLORS=['#d9544d','#4a90b8','#6fae8e','#e0a14a','#8a6fb0','#7fb6b0'];
const GOLD='#f4c542';
const GROUND_TOP=0; // 由 layout 算

function layout(){
  const ow=W,oh=H;
  W=cv.clientWidth; H=cv.clientHeight;
  DPR=Math.min(2,window.devicePixelRatio||1);
  cv.width=Math.round(W*DPR); cv.height=Math.round(H*DPR);
  ctx.setTransform(DPR,0,0,DPR,0,0);
  const m=Math.min(W,H);
  R=m*0.30; MR=Math.max(13,Math.min(26,m*0.030));
  cx=W/2; cy=H*0.46;
  SHOME.x=cx; SHOME.y=H*0.86;
  if(ow>0){ const sx=W/ow, sy=H/oh;
    marbles.forEach(o=>{o.x*=sx;o.y*=sy;});
    particles.forEach(p=>{p.x*=sx;p.y*=sy;});
  }
  buildGrain();
}

// ====== 状态 ======
let scene='title';      // title | play | clear | lose | ending
let flashback=false;    // 回忆遮罩（暂停物理）
let levelIdx=0;
let unlocked=1;          // 已解锁关数
let best=[];            // 各关最佳星
let targetsLeft=0;
let shotsLeft=0, shotsUsed=0;
let pendingClear=false;
let aiming=false, aimCur={x:0,y:0};
let paperPlane=null;     // 彩蛋纸飞机
let idleT=0, sunTaps=0, lastTapT=0;

try{ unlocked=parseInt(localStorage.getItem('gm_unlocked')||'1')||1;
     best=JSON.parse(localStorage.getItem('gm_best')||'[]'); }catch(e){}

// ====== 实体 ======
let marbles=[];   // 含母珠 + 目标 + 障碍(pebble)
let particles=[];

function makeMarble(x,y,color,opt){
  opt=opt||{};
  return {x,y,vx:0,vy:0,r:opt.r||MR,color:color,
    shooter:!!opt.shooter,target:!!opt.target,gold:!!opt.gold,
    pebble:!!opt.pebble,out:false,dead:false,fade:1,
    inv:opt.pebble?0:1,seed:Math.random()*6.28};
}

// ====== 关卡 ======
// targets: 归一化偏移(×R) from 圈心; pebble/wind 可选
const LEVELS=[
 {t:[[0,0.12]],shots:3,par:1,hint:'拖住母珠往后拉，松手——把它弹出去'},
 {t:[[-0.38,0],[0.38,0]],shots:4,par:2,hint:'两颗并排，一颗一颗来'},
 {t:[[-0.42,-0.22],[0.42,-0.22],[0,0.34]],shots:5,par:3,hint:'三角摆着，先打最稳的那颗'},
 {t:[[-0.62,0.04],[-0.21,0.04],[0.21,0.04],[0.62,0.04]],shots:5,par:4,hint:'一排四颗，力道别太猛'},
 {t:[[-0.52,-0.32],[0.52,-0.32],[0,0.42]],shots:6,par:3,pebble:[0,-0.05],hint:'圈心有块小石子，会拐弯'},
 {t:[[-0.5,-0.34],[0.5,-0.34],[-0.62,0.28],[0.62,0.28],[0,0.5]],shots:6,par:5,hint:'五颗围着圈边，别让中间漏了'},
 {t:[[-0.55,-0.3],[0.55,-0.3],[0,-0.5],[-0.3,0.45],[0.3,0.45]],shots:7,par:5,pebble:[0,0.05],hint:'石子挡道，绕着打'},
 {t:[[0,0],[-0.3,-0.22],[0.3,-0.22],[-0.3,0.26],[0.3,0.26],[0,-0.04]],shots:7,par:6,hint:'挤成一团，第一下要干脆'},
 {t:[[-0.6,-0.34],[0.6,-0.34],[-0.34,0.4],[0.34,0.4],[0,-0.5],[-0.2,-0.1],[0.2,-0.1]],shots:9,par:7,
   pebble:[0,0.12],wind:[0.0,-26],gold:true,hint:'有风了——往下落的那颗金珠，是幸运珠'}
];
const CLEAR_LINES=['干净利落。','一颗没剩。','圈空了，蝉还在叫。','手感来了。','就喜欢你这股准头。','稳。','小时候你也是这样。'];

function loadLevel(i){
  levelIdx=i; scene='play'; flashback=false;
  const L=LEVELS[i];
  marbles=[]; particles=[];
  // 母珠
  marbles.push(makeMarble(SHOME.x,SHOME.y,'#f3ead2',{shooter:true,r:MR*1.04}));
  // 目标
  L.t.forEach((p,k)=>{
    const x=cx+p[0]*R, y=cy+p[1]*R;
    marbles.push(makeMarble(x,y,COLORS[k%COLORS.length],{target:true}));
  });
  if(L.gold){
    // 幸运金珠：圈心偏上一点
    const gx=cx, gy=cy-0.5*R;
    const gm=makeMarble(gx,gy,GOLD,{target:true,gold:true});
    marbles.push(gm);
  }
  if(L.pebble){
    marbles.push(makeMarble(cx+L.pebble[0]*R, cy+L.pebble[1]*R,'#8a7458',{pebble:true,r:MR*0.9}));
  }
  wind = L.wind?{x:L.wind[0],y:L.wind[1]}:{x:0,y:0};
  shotsLeft=L.shots; shotsUsed=0; targetsLeft=marbles.filter(m=>m.target).length;
  pendingClear=false; aiming=false; paperPlane=null;
  document.getElementById('hint').textContent=L.hint;
  document.getElementById('hint').classList.remove('hide');
  hidePanels();
}

// ====== 物理 ======
let wind={x:0,y:0};
const DAMP=1.85;       // 阻尼系数
const REST=0.9;        // 弹性
const STOP=16;         // 静止阈值 px/s
const MAXSPEED=1450;   // 满蓄力初速
const MAXDRAG=null;    // 运行时算

function stepPhysics(dt){
  // 重力感：轻微下沉无（俯视），只加风
  for(const m of marbles){
    if(m.dead) continue;
    if(m.inv===0) { m.vx=0; m.vy=0; continue; } // 障碍不动
    m.vx+=wind.x*dt; m.vy+=wind.y*dt;
    const f=Math.exp(-DAMP*dt);
    m.vx*=f; m.vy*=f;
    const sp=Math.hypot(m.vx,m.vy);
    if(sp<STOP){m.vx=0;m.vy=0;}
    m.x+=m.vx*dt; m.y+=m.vy*dt;
  }
  // 碰撞
  for(let i=0;i<marbles.length;i++){
    for(let j=i+1;j<marbles.length;j++){
      const a=marbles[i],b=marbles[j];
      if(a.dead||b.dead) continue;
      resolve(a,b);
    }
  }
  // 屏边软反弹 + 出圈判定
  for(const m of marbles){
    if(m.dead) continue;
    if(m.x<m.r){m.x=m.r; if(m.vx<0)m.vx=-m.vx*0.5;}
    if(m.x>W-m.r){m.x=W-m.r; if(m.vx>0)m.vx=-m.vx*0.5;}
    if(m.y<m.r){m.y=m.r; if(m.vy<0)m.vy=-m.vy*0.5;}
    if(m.y>H-m.r){m.y=H-m.r; if(m.vy>0)m.vy=-m.vy*0.5;}
    if(m.target && !m.out){
      const d=Math.hypot(m.x-cx,m.y-cy);
      if(d>R){ outMarble(m); }
    }
  }
  // 死亡淡出在 frame 循环里统一处理（避免停下后卡住不消失）
}

function resolve(a,b){
  let dx=b.x-a.x, dy=b.y-a.y; let dist=Math.hypot(dx,dy);
  const min=a.r+b.r; if(dist>=min) return;
  if(dist<1e-6){ dx=0.01; dy=0; dist=0.01; }
  const nx=dx/dist, ny=dy/dist, overlap=min-dist;
  const ia=a.inv, ib=b.inv, isum=ia+ib;
  if(isum===0) return;
  a.x-=nx*overlap*(ia/isum); a.y-=ny*overlap*(ia/isum);
  b.x+=nx*overlap*(ib/isum); b.y+=ny*overlap*(ib/isum);
  const rvx=b.vx-a.vx, rvy=b.vy-a.vy; const vn=rvx*nx+rvy*ny;
  if(vn<0){
    const j=-(1+REST)*vn/isum;
    a.vx-=j*ia*nx; a.vy-=j*ia*ny;
    b.vx+=j*ib*nx; b.vy+=j*ib*ny;
    const sp=Math.abs(vn);
    if(sp>120){ spawnDust((a.x+b.x)/2,(a.y+b.y)/2,Math.min(8,sp/90),false);
      if(audioOn) sfxTink(sp); }
  }
}

function outMarble(m){
  m.out=true; m.dead=true;
  targetsLeft--;
  spawnDust(m.x,m.y,14,true);
  if(audioOn) sfxOut();
  if(m.gold){ triggerFlashback(); }
  if(targetsLeft<=0) pendingClear=true;
}

function moving(){
  for(const m of marbles){ if(!m.dead && (m.vx||m.vy)) return true; }
  return false;
}

// ====== 粒子 ======
function spawnDust(x,y,n,big){
  for(let i=0;i<n;i++){
    if(particles.length>260) break;
    const a=Math.random()*6.28, s=(big?60:30)*(0.4+Math.random());
    particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-(big?20:8),
      life:big?0.9:0.5,age:0,r:(big?3:2)*(0.6+Math.random()),
      c:big?'#fff4d8':'#e9d4a6'});
  }
}
function stepParticles(dt){
  for(const p of particles){ p.age+=dt; p.vy+=140*dt; p.x+=p.vx*dt; p.y+=p.vy*dt; p.vx*=0.96; }
  particles=particles.filter(p=>p.age<p.life);
}

// ====== 音频（WebAudio 合成）======
let actx=null, audioOn=true, windNode=null, windGain=null;
function initAudio(){
  if(actx) return;
  try{ actx=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){ return; }
  // 风声环境
  const buf=actx.createBuffer(1,actx.sampleRate*2,actx.sampleRate);
  const d=buf.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*0.5;
  const src=actx.createBufferSource(); src.buffer=buf; src.loop=true;
  const lp=actx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=360;
  windGain=actx.createGain(); windGain.gain.value=audioOn?0.05:0;
  src.connect(lp); lp.connect(windGain); windGain.connect(actx.destination); src.start();
  windNode=src;
}
function tone(freq,dur,type,vol,when){
  if(!actx) return; const t=actx.currentTime+(when||0);
  const o=actx.createOscillator(),g=actx.createGain();
  o.type=type||'sine'; o.frequency.value=freq;
  g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(vol||0.2,t+0.01);
  g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t+dur+0.02);
}
function sfxTink(sp){ tone(620+Math.min(700,sp*0.5),0.12,'triangle',0.16); }
function sfxOut(){ tone(300,0.25,'sine',0.18); tone(180,0.3,'sine',0.12,0.02); }
function sfxLaunch(){ if(!actx)return; tone(220,0.12,'sawtooth',0.08); }
function sfxWin(){ [523,659,784,1046].forEach((f,i)=>tone(f,0.4,'triangle',0.18,i*0.12)); }
function sfxClick(){ tone(440,0.07,'square',0.08); }

// ====== 输入 ======
function getPos(e){ const r=cv.getBoundingClientRect();
  const t=e.touches?e.touches[0]:e; return {x:t.clientX-r.left,y:t.clientY-r.top}; }
function canAim(){ return scene==='play'&&!flashback&&!moving()&&shotsLeft>0; }

cv.addEventListener('pointerdown',e=>{
  if(scene==='title'||scene==='clear'||scene==='lose'||scene==='ending') return;
  if(!canAim()) return;
  const p=getPos(e); aiming=true; aimCur=p;
  cv.setPointerCapture&&cv.setPointerCapture(e.pointerId);
});
cv.addEventListener('pointermove',e=>{ if(aiming) aimCur=getPos(e); });
cv.addEventListener('pointerup',e=>{
  if(!aiming) return; aiming=false;
  const sh=marbles.find(m=>m.shooter); if(!sh) return;
  let dx=sh.x-aimCur.x, dy=sh.y-aimCur.y;   // 拉弓向量（向后拉→向前射）
  const dist=Math.hypot(dx,dy); const maxd=R*0.95;
  if(dist<14){ return; }                     // 太短，取消
  const power=Math.min(dist/maxd,1);
  const dirx=dx/dist, diry=dy/dist;
  sh.vx=dirx*power*MAXSPEED; sh.vy=diry*power*MAXSPEED;
  shotsLeft--; shotsUsed++; if(audioOn){sfxLaunch();}
  spawnDust(sh.x,sh.y,5,false);
});
cv.addEventListener('pointercancel',()=>{aiming=false;});

// 点天空（太阳/云）放纸飞机彩蛋
cv.addEventListener('pointerdown',e=>{
  if(scene!=='play'||flashback) return;
  const p=getPos(e);
  if(p.y<cy-R && p.x>W*0.55){ // 右上天空区
    const now=performance.now();
    if(now-lastTapT<600) sunTaps++; else sunTaps=1;
    lastTapT=now;
    if(sunTaps>=3 && !paperPlane){ paperPlane={x:-40,y:p.y+ (Math.random()*30-15),t:0}; sunTaps=0; }
  }
},true);

// ====== 回忆彩蛋 ======
const MEMORIES=[
 '那年夏天，水泥地烫脚。\n我们蹲成一排，把弹珠一颗颗，弹进夕阳里。',
 '输了的珠子要交给赢家。\n你攥着最后一颗，始终没松手。',
 '风把粉笔圈吹淡了。\n你说，明天再来。'
];
function triggerFlashback(){
  flashback=true;
  const t=document.getElementById('memText');
  t.textContent=MEMORIES[Math.floor(Math.random()*MEMORIES.length)];
  const f=document.getElementById('flash'); f.classList.add('on');
  if(audioOn){ tone(392,0.6,'sine',0.16); tone(523,0.8,'sine',0.14,0.2); tone(659,1.0,'sine',0.12,0.45); }
  setTimeout(()=>{ f.classList.remove('on'); flashback=false; }, 3600);
}

// ====== 绘制 ======
let grain=null;
function buildGrain(){
  grain=document.createElement('canvas'); grain.width=W; grain.height=H;
  const g=grain.getContext('2d');
  const img=g.createImageData(W,H); const d=img.data;
  for(let i=0;i<d.length;i+=4){ const v=200+Math.random()*55|0;
    d[i]=v; d[i+1]=v-20; d[i+2]=v-60; d[i+3]=Math.random()*16; }
  g.putImageData(img,0,0);
}
// 粉笔圈抖动点
function ringPoints(){
  const pts=[]; const N=64;
  for(let i=0;i<N;i++){ const a=i/N*6.283;
    const wob=Math.sin(a*7+1.3)*3+Math.cos(a*3)*2;
    pts.push([cx+Math.cos(a)*(R+wob), cy+Math.sin(a)*(R+wob)]);
  } return pts;
}
function drawRing(){
  const pts=ringPoints();
  ctx.save();
  ctx.lineJoin='round'; ctx.lineCap='round';
  ctx.strokeStyle='rgba(255,252,242,0.82)'; ctx.lineWidth=MR*0.42;
  ctx.beginPath(); ctx.moveTo(pts[0][0],pts[0][1]);
  for(let i=1;i<pts.length;i++) ctx.lineTo(pts[i][0],pts[i][1]);
  ctx.closePath(); ctx.stroke();
  // 内圈淡影
  ctx.strokeStyle='rgba(255,252,242,0.18)'; ctx.lineWidth=MR*0.18;
  ctx.beginPath(); ctx.arc(cx,cy,R*0.96,0,6.283); ctx.stroke();
  ctx.restore();
}
function drawGround(){
  // 天空带
  const skyH=cy-R;
  let sg=ctx.createLinearGradient(0,0,0,skyH);
  sg.addColorStop(0,'#f7dc9e'); sg.addColorStop(1,'#f3c887');
  ctx.fillStyle=sg; ctx.fillRect(0,0,W,skyH+2);
  // 暖阳
  const sx=W*0.8, sy=skyH*0.42;
  let sun=ctx.createRadialGradient(sx,sy,2,sx,sy,MR*2.4);
  sun.addColorStop(0,'rgba(255,248,220,0.95)'); sun.addColorStop(1,'rgba(255,240,200,0)');
  ctx.fillStyle=sun; ctx.beginPath(); ctx.arc(sx,sy,MR*2.4,0,6.283); ctx.fill();
  // 云
  ctx.fillStyle='rgba(255,250,235,0.55)';
  cloud(W*0.22, skyH*0.5, MR*1.6); cloud(W*0.5, skyH*0.3, MR*1.1);
  // 地面
  let gg=ctx.createLinearGradient(0,skyH,0,H);
  gg.addColorStop(0,'#e7cf9f'); gg.addColorStop(1,'#d3b07e');
  ctx.fillStyle=gg; ctx.fillRect(0,skyH,W,H-skyH);
  // 颗粒
  if(grain) ctx.drawImage(grain,0,0,W,H);
  // 暗角
  let vg=ctx.createRadialGradient(cx,cy,R*0.6,cx,cy,Math.max(W,H)*0.75);
  vg.addColorStop(0,'rgba(0,0,0,0)'); vg.addColorStop(1,'rgba(60,38,16,0.32)');
  ctx.fillStyle=vg; ctx.fillRect(0,0,W,H);
}
function cloud(x,y,r){
  ctx.beginPath();
  ctx.arc(x,y,r*0.6,0,6.283); ctx.arc(x+r*0.6,y+r*0.1,r*0.5,0,6.283);
  ctx.arc(x-r*0.6,y+r*0.12,r*0.45,0,6.283); ctx.arc(x+r*0.15,y-r*0.3,r*0.5,0,6.283);
  ctx.fill();
}
function drawShadow(m){
  ctx.save(); ctx.globalAlpha=0.22*m.fade;
  ctx.fillStyle='#3a2611';
  ctx.beginPath(); ctx.ellipse(m.x, m.y+m.r*0.85, m.r*0.95, m.r*0.42,0,0,6.283); ctx.fill();
  ctx.restore();
}
function drawMarble(m){
  if(m.pebble){
    ctx.save(); drawShadow(m);
    let pg=ctx.createRadialGradient(m.x-m.r*0.3,m.y-m.r*0.3,m.r*0.2,m.x,m.y,m.r);
    pg.addColorStop(0,'#b9a079'); pg.addColorStop(1,'#7c6743');
    ctx.fillStyle=pg; ctx.beginPath(); ctx.arc(m.x,m.y,m.r,0,6.283); ctx.fill();
    ctx.strokeStyle='rgba(60,46,26,0.5)'; ctx.lineWidth=2; ctx.stroke();
    ctx.restore(); return;
  }
  ctx.save(); drawShadow(m);
  ctx.globalAlpha=m.fade;
  // 玻璃体
  let bg=ctx.createRadialGradient(m.x-m.r*0.35,m.y-m.r*0.35,m.r*0.1,m.x,m.y,m.r);
  bg.addColorStop(0, lighten(m.color,0.55));
  bg.addColorStop(0.6, m.color);
  bg.addColorStop(1, darken(m.color,0.32));
  ctx.fillStyle=bg; ctx.beginPath(); ctx.arc(m.x,m.y,m.r,0,6.283); ctx.fill();
  // 内部猫眼纹（旋转）
  ctx.save(); ctx.translate(m.x,m.y); ctx.rotate(m.seed);
  ctx.globalAlpha=m.fade*0.5; ctx.strokeStyle=lighten(m.color,0.35);
  ctx.lineWidth=m.r*0.16;
  ctx.beginPath(); ctx.arc(0,0,m.r*0.5,0.4,3.4); ctx.stroke();
  ctx.restore();
  // 高光
  ctx.globalAlpha=m.fade;
  let hg=ctx.createRadialGradient(m.x-m.r*0.4,m.y-m.r*0.45,1,m.x-m.r*0.4,m.y-m.r*0.45,m.r*0.5);
  hg.addColorStop(0,'rgba(255,255,255,0.95)'); hg.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=hg; ctx.beginPath(); ctx.arc(m.x-m.r*0.4,m.y-m.r*0.45,m.r*0.5,0,6.283); ctx.fill();
  // 金珠闪光
  if(m.gold){ ctx.globalAlpha=m.fade*(0.5+0.5*Math.sin(performance.now()/200));
    ctx.fillStyle='rgba(255,255,255,0.9)';
    ctx.beginPath(); ctx.arc(m.x+m.r*0.3,m.y+m.r*0.2,m.r*0.12,0,6.283); ctx.fill(); }
  // 边缘暗环
  ctx.globalAlpha=m.fade*0.6; ctx.strokeStyle=darken(m.color,0.4); ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.arc(m.x,m.y,m.r-0.8,0,6.283); ctx.stroke();
  ctx.restore();
}
function drawParticles(){
  for(const p of particles){ const a=1-p.age/p.life;
    ctx.globalAlpha=a*0.8; ctx.fillStyle=p.c;
    ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,6.283); ctx.fill(); }
  ctx.globalAlpha=1;
}
function drawAim(){
  if(!aiming) return;
  const sh=marbles.find(m=>m.shooter); if(!sh) return;
  let dx=sh.x-aimCur.x, dy=sh.y-aimCur.y; const dist=Math.hypot(dx,dy);
  if(dist<4) return;
  const power=Math.min(dist/(R*0.95),1);
  const dirx=dx/dist, diry=dy/dist;
  // 拉线
  ctx.save(); ctx.strokeStyle='rgba(255,250,235,0.5)'; ctx.lineWidth=3; ctx.setLineDash([6,6]);
  ctx.beginPath(); ctx.moveTo(sh.x,sh.y); ctx.lineTo(aimCur.x,aimCur.y); ctx.stroke(); ctx.setLineDash([]);
  // 预测轨迹
  let px=sh.x,py=sh.y,pvx=dirx*power*MAXSPEED,pvy=diry*power*MAXSPEED;
  const f=Math.exp(-DAMP/60);
  ctx.fillStyle='rgba(255,250,235,0.85)';
  for(let i=0;i<70;i++){ px+=pvx/60; py+=pvy/60; pvx*=f; pvy*=f;
    if(i%4===0){ ctx.globalAlpha=0.7*(1-i/70);
      ctx.beginPath(); ctx.arc(px,py,Math.max(1.5,MR*0.12),0,6.283); ctx.fill(); }
    if(Math.hypot(pvx,pvy)<STOP) break;
  }
  ctx.globalAlpha=1;
  // 力度环
  ctx.strokeStyle='rgba(255,210,120,'+(0.4+power*0.5)+')'; ctx.lineWidth=4;
  ctx.beginPath(); ctx.arc(sh.x,sh.y,sh.r+6+power*10,0,6.283*power); ctx.stroke();
  ctx.restore();
}
function drawHUD(){
  ctx.save();
  ctx.fillStyle='rgba(255,250,235,0.92)';
  ctx.font='700 '+Math.round(MR*0.95)+'px "Kaiti SC",KaiTi,serif';
  ctx.textAlign='left'; ctx.textBaseline='top';
  ctx.fillText('第 '+(levelIdx+1)+' / '+LEVELS.length+' 关', 16, 14);
  ctx.fillText('剩 '+targetsLeft+' 颗', 16, 14+MR*1.15);
  // 发射数（圆点）
  const L=LEVELS[levelIdx]; ctx.textAlign='right';
  let sx=W-16;
    for(let i=0;i<L.shots;i++){ const used=i<shotsUsed;
    ctx.globalAlpha=used?0.3:1; ctx.fillStyle=used?'#b79a6e':'#fff5e4';
    ctx.beginPath(); ctx.arc(sx-i*(MR*0.7+6), 14+MR*0.5, MR*0.34,0,6.283); ctx.fill(); }
  ctx.globalAlpha=1;
  ctx.restore();
}
function drawPaperPlane(){
  if(!paperPlane) return;
  const p=paperPlane; ctx.save();
  ctx.translate(p.x,p.y); ctx.rotate(-0.18);
  ctx.fillStyle='rgba(255,250,235,0.95)';
  ctx.beginPath(); ctx.moveTo(18,0); ctx.lineTo(-14,-9); ctx.lineTo(-6,0); ctx.lineTo(-14,9); ctx.closePath(); ctx.fill();
  ctx.strokeStyle='rgba(180,150,110,0.6)'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(18,0); ctx.lineTo(-6,0); ctx.stroke();
  ctx.restore();
}

// 颜色工具
function hex(c){c=c.replace('#','');return [parseInt(c.substr(0,2),16),parseInt(c.substr(2,2),16),parseInt(c.substr(4,2),16)];}
function lighten(c,a){const[x,y,z]=hex(c);return `rgb(${Math.min(255,x+(255-x)*a)|0},${Math.min(255,y+(255-y)*a)|0},${Math.min(255,z+(255-z)*a)|0})`;}
function darken(c,a){const[x,y,z]=hex(c);return `rgb(${(x*(1-a))|0},${(y*(1-a))|0},${(z*(1-a))|0})`;}

function draw(){
  ctx.clearRect(0,0,W,H);          // 铁律#1：首行硬清屏
  drawGround();
  drawRing();
  // 阴影层
  for(const m of marbles) if(!m.pebble) drawShadow(m);
  // 障碍
  for(const m of marbles) if(m.pebble) drawMarble(m);
  // 目标 + 母珠（母珠最后画在上层）
  for(const m of marbles){ if(!m.pebble && !m.shooter) drawMarble(m); }
  const sh=marbles.find(m=>m.shooter); if(sh) drawMarble(sh);
  // 母珠待发呼吸提示
  if(canAim() && sh){ const pl=1+0.06*Math.sin(performance.now()/220);
    ctx.save(); ctx.globalAlpha=0.4; ctx.strokeStyle='#fff5e4'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(sh.x,sh.y,sh.r+8*pl,0,6.283); ctx.stroke(); ctx.restore(); }
  drawParticles();
  drawAim();
  drawPaperPlane();
  if(scene==='play') drawHUD();
}

// ====== 主循环 ======
let last=performance.now();
function frame(t){
  let dt=(t-last)/1000; last=t; if(dt>0.05)dt=0.05;
  if(scene==='play' && !flashback){
    if(moving()) stepPhysics(dt);
    stepParticles(dt);
    if(!moving() && (shotsUsed>0||pendingClear)){
      // 结算
      if(pendingClear){ doClear(); }
      else if(shotsLeft<=0 && targetsLeft>0){ scene='lose'; show('lose'); }
    }
  } else { stepParticles(dt); }
  // 死亡珠子淡出（与场景无关，统一处理）
  for(const m of marbles){ if(m.dead) m.fade-=dt*2.2; }
  marbles=marbles.filter(m=>!(m.dead&&m.fade<=0));
  // 纸飞机
  if(paperPlane){ paperPlane.x+=220*dt; paperPlane.t+=dt;
    if(paperPlane.x>W+60) paperPlane=null; }
  draw();
  requestAnimationFrame(frame);
}

function doClear(){
  scene='clear';
  const par=LEVELS[levelIdx].par;
  let stars=1; if(shotsUsed<=par)stars=3; else if(shotsUsed<=par+1)stars=2;
  if(!best[levelIdx]||stars>best[levelIdx]) best[levelIdx]=stars;
  if(levelIdx+1>=unlocked && levelIdx+1<LEVELS.length){ unlocked=levelIdx+2; }
  else if(levelIdx+1===LEVELS.length){ unlocked=LEVELS.length; }
  try{localStorage.setItem('gm_unlocked',unlocked);localStorage.setItem('gm_best',JSON.stringify(best));}catch(e){}
  if(audioOn) sfxWin();
  const st=document.getElementById('clearStars');
  st.textContent='★★★☆☆☆'.substr(3-stars,3);
  document.getElementById('clearTitle').textContent = (levelIdx+1===LEVELS.length)?'全 部 通 关':'过 关';
  document.getElementById('clearLine').textContent=CLEAR_LINES[Math.floor(Math.random()*CLEAR_LINES.length)];
  const nb=document.getElementById('nextBtn');
  nb.style.display='';
  nb.textContent=(levelIdx+1<LEVELS.length)?'下 一 关':'看 结 局';
  show('clear');
}

// ====== UI 绑定 ======
function show(id){ ['title','clear','lose','ending'].forEach(p=>{
  document.getElementById(p).classList.toggle('hide', p!==id); }); }
function hidePanels(){ ['title','clear','lose','ending'].forEach(p=>document.getElementById(p).classList.add('hide')); }

document.getElementById('startBtn').onclick=()=>{ initAudio(); sfxClick();
  loadLevel(Math.min(unlocked-1, LEVELS.length-1)); };
document.getElementById('lvBtn').onclick=()=>{ initAudio(); sfxClick();
  const g=document.getElementById('lvGrid'); g.classList.toggle('hide');
  if(!g.dataset.built){ buildLvGrid(); g.dataset.built='1'; } };
document.getElementById('nextBtn').onclick=()=>{ sfxClick();
  if(levelIdx+1<LEVELS.length) loadLevel(levelIdx+1);
  else { scene='ending'; show('ending'); } };
document.getElementById('retryBtn').onclick=()=>{ sfxClick(); loadLevel(levelIdx); };
document.getElementById('loseRetry').onclick=()=>{ sfxClick(); loadLevel(levelIdx); };
document.getElementById('endAgain').onclick=()=>{ sfxClick(); loadLevel(0); };
document.getElementById('endMenu').onclick=()=>{ scene='title'; show('title'); };
document.getElementById('restart').onclick=()=>{ if(scene==='play'){ sfxClick(); loadLevel(levelIdx);} };
const muteBtn=document.getElementById('mute');
muteBtn.onclick=()=>{ audioOn=!audioOn; muteBtn.textContent=audioOn?'🔊':'🔇';
  if(windGain) windGain.gain.value=audioOn?0.05:0; if(audioOn) initAudio(); };

function buildLvGrid(){
  const g=document.getElementById('lvGrid'); g.innerHTML='';
  for(let i=0;i<LEVELS.length;i++){
    const d=document.createElement('div'); d.className='lv';
    const open=i<unlocked;
    if(!open) d.classList.add('lock');
    d.textContent=open?(i+1):'🔒';
    if(best[i]){ const s=document.createElement('span'); s.className='s';
      s.textContent='★'.repeat(best[i]); d.appendChild(s); }
    if(open) d.onclick=()=>{ sfxClick(); loadLevel(i); };
    g.appendChild(d);
  }
}

// 结局文案
document.getElementById('endLine').textContent='你把最后一颗珠子弹进了夕阳里。\n院子空了，蝉声还在。\n——那年夏天，我们好像永远都不会长大。';

// 首屏：标题
show('title');
window.addEventListener('resize',layout);
layout();
requestAnimationFrame(frame);

// 测试钩子
window.__G={ get scene(){return scene;}, get level(){return levelIdx;},
  get marbles(){return marbles;}, get targetsLeft(){return targetsLeft;},
  get shotsLeft(){return shotsLeft;},
  fire(dx,dy,power){ const sh=marbles.find(m=>m.shooter); if(!sh)return;
    const d=Math.hypot(dx,dy)||1; sh.vx=dx/d*power*MAXSPEED; sh.vy=dy/d*power*MAXSPEED;
    shotsLeft--; shotsUsed++; },
  load(i){ loadLevel(i); }, step(dt){ if(moving())stepPhysics(dt); }
};
})();
