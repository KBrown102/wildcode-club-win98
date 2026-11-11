
"use strict";
/* ========== 096 · 候 —— 它们在等，不在催 ========== */
/* 九宫洛书(4 9 2 / 3 5 7 / 8 1 6) × 九音(五声+高八度四音) × 九只等着的光鸟，齐套。 */

var cv=null, ctx=null, W=0, H=0, DPR=1, S=null;
var mx=0, my=0, running=false;

/* ---------- 工具 ---------- */
function clockNow(){
  return (typeof performance!=="undefined"&&performance.now)?performance.now():Date.now();
}
function cl(v,a,b){ return v<a?a:(v>b?b:v); }
function lerp(a,b,t){ return a+(b-a)*t; }
function ease(t){ return t<0?0:(t>1?1:t*t*(3-2*t)); }
function rnd(a,b){ return a+Math.random()*(b-a); }
function mixa(c1,c2,t){
  t=cl(t,0,1);
  return [lerp(c1[0],c2[0],t),lerp(c1[1],c2[1],t),lerp(c1[2],c2[2],t)];
}
function mixc(c1,c2,t){
  var c=mixa(c1,c2,t);
  return "rgb("+Math.round(c[0])+","+Math.round(c[1])+","+Math.round(c[2])+")";
}
function rgba(c,a){
  return "rgba("+Math.round(c[0])+","+Math.round(c[1])+","+Math.round(c[2])+","+a.toFixed(3)+")";
}

/* ---------- 洛书九宫 ---------- */
/* 幻方排布：行列对角线和皆 15。LUO[r][c] = 该格的洛书数(1..9) */
var LUO=[[4,9,2],[3,5,7],[8,1,6]];
/* 九音：五声宫商角徵羽 + 高八度宫商角徵（C4 D4 E4 G4 A4 C5 D5 E5 G5） */
var NOTE=[261.63,293.66,329.63,392.00,440.00,523.25,587.33,659.25,783.99];
function noteOf(n){ return NOTE[cl(n-1,0,8)]; }

/* ---------- 音 ---------- */
var AC=null, mg=null, sndOn=true;
function initAudio(){
  if(AC) return;
  try{
    var C=window.AudioContext||window.webkitAudioContext;
    if(!C) return;
    AC=new C();
    mg=AC.createGain(); mg.gain.value=0.24; mg.connect(AC.destination);
  }catch(e){ AC=null; }
}
function bell(f,vol,dur,type,delay){
  if(!AC||!sndOn) return;
  try{
    var t=AC.currentTime+(delay||0), o=AC.createOscillator(), g=AC.createGain();
    o.type=type||"sine"; o.frequency.value=f;
    g.gain.setValueAtTime(0,t);
    g.gain.linearRampToValueAtTime(vol,t+0.05);
    g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    o.connect(g); g.connect(mg); o.start(t); o.stop(t+dur+0.06);
  }catch(e){}
}
function airy(vol,dur,freq,q){
  if(!AC||!sndOn) return;
  try{
    var t=AC.currentTime, len=Math.max(1,Math.floor(AC.sampleRate*dur));
    var buf=AC.createBuffer(1,len,AC.sampleRate), d=buf.getChannelData(0);
    for(var i=0;i<len;i++){ d[i]=(Math.random()*2-1)*(1-i/len); }
    var src=AC.createBufferSource(); src.buffer=buf;
    var bp=AC.createBiquadFilter(); bp.type="bandpass"; bp.frequency.value=freq||900; bp.Q.value=q||0.8;
    var g=AC.createGain(); g.gain.value=vol;
    src.connect(bp); bp.connect(g); g.connect(mg); src.start(t);
  }catch(e){}
}
/* 回一只鸟：本格音 + 五度泛音 + 飞走的振翅 */
function sReply(n){
  var f=noteOf(n);
  bell(f,0.15,2.0,"sine");
  bell(f*1.5,0.055,1.4,"sine",0.06);
  bell(f*0.5,0.06,2.6,"sine");
  airy(0.035,0.26,1400,0.6);
}
/* 鸟飞来停下：极轻一声 */
function sArrive(n){
  bell(noteOf(n)*2,0.045,0.9,"sine");
  airy(0.025,0.22,1800,0.7);
}
/* 歇一会儿：低沉呼吸底音 */
function sRest(){
  bell(130.81,0.055,3.2,"sine");
  bell(196.00,0.032,2.6,"sine");
}
/* 抬头看窗外 */
function sSky(){
  airy(0.04,0.7,1200,0.4);
  bell(392,0.045,1.6,"sine");
}
/* 闲置彩蛋：一只鸟做了个小梦 */
function sDream(n){ bell(noteOf(n)*0.5,0.05,2.6,"sine"); }
/* 终章琶音 */
function sFin(k){
  var f=noteOf(k+1);
  bell(f,0.13,3.0,"sine");
  bell(f*2,0.04,1.8,"sine",0.08);
}

/* ---------- 布局 ---------- */
function geo(){
  var portrait = H>=W;
  var ww = portrait ? cl(W*0.78,170,520) : cl(Math.min(W*0.54,H*0.64),190,520);
  var wh = ww*1.04;
  var cx = W*0.5;
  var cy = portrait ? H*0.385 : H*0.425;
  var wx = cx-ww/2, wy = cy-wh/2;
  var fr = ww*0.052;              /* 窗框厚 */
  var mb = ww*0.020;              /* 窗棂条厚 */
  var ix = wx+fr, iy = wy+fr, iw = ww-2*fr, ih = wh-2*fr;
  var cw = (iw-2*mb)/3, ch = (ih-2*mb)/3;
  var sill = wy+wh+ww*0.030;
  var floor = cl(sill + (portrait? H*0.135 : H*0.115), sill+40, H*0.90);
  return {
    portrait:portrait, ww:ww, wh:wh, wx:wx, wy:wy, fr:fr, mb:mb,
    ix:ix, iy:iy, iw:iw, ih:ih, cw:cw, ch:ch,
    sill:sill, floor:floor,
    lx: portrait? W*0.235 : W*0.215,
    ly: floor,
    ls: cl(Math.min(W,H)/620,0.72,1.35),
    sc: cl(ww/430,0.52,1.30)
  };
}
function paneRect(g,p){
  var r=Math.floor(p/3), c=p%3;
  return { x:g.ix+c*(g.cw+g.mb), y:g.iy+r*(g.ch+g.mb), w:g.cw, h:g.ch };
}

/* ---------- 状态 ---------- */
function shuffled(n){
  var a=[],i,j,t;
  for(i=0;i<n;i++) a.push(i);
  for(i=n-1;i>0;i--){ j=Math.floor(Math.random()*(i+1)); t=a[i]; a[i]=a[j]; a[j]=t; }
  return a;
}
function reset(){
  var order=shuffled(9), birds=[], panes=[], i, r, c;
  for(i=0;i<9;i++){
    r=Math.floor(i/3); c=i%3;
    panes.push({ i:i, n:LUO[r][c], lit:0, mark:0, echo:0, fog:0 });
  }
  for(i=0;i<9;i++){
    var p=order[i];
    r=Math.floor(p/3); c=p%3;
    birds.push({
      i:i, pane:p, n:LUO[r][c],
      bx: 0.30+Math.random()*0.40,     /* 栖位在格内的横向比例 */
      here:false, gone:false, replied:false,
      land:0,                          /* 落定动画 0→1 */
      sleep:0, wake:1, blink:0, blinkT:2+Math.random()*4,
      ph:Math.random()*6.283, hop:0, tilt:0,
      dream:0, dreamY:0,
      fly:0, fdx:0, fdy:0, frot:0
    });
  }
  var stars=[], k;
  for(k=0;k<64;k++) stars.push({ x:Math.random(), y:Math.random()*0.72, r:rnd(0.35,1.25), tw:Math.random()*6.283 });
  var clouds=[];
  for(k=0;k<5;k++) clouds.push({ x:Math.random(), y:0.10+Math.random()*0.42, w:rnd(0.22,0.46), h:rnd(0.035,0.075), v:rnd(0.0035,0.0095), a:rnd(0.05,0.13) });
  S={
    t:0, warmth:0.10, targetW:0.10,
    holding:false, holdT:0, downX:0, downY:0, lastDownT:-999, dragged:false,
    birds:birds, panes:panes, stars:stars, clouds:clouds,
    motes:[], rings:[], ripples:[], sparks:[], flock:[],
    nextArrive:1.6, arrived:0, replied:0,
    lamp:0.16, lampT:0.16, breath:0, look:0, moon:0,
    fin:0, finSeq:-1, finT:0, finGap:0,
    idle:0, eggT:0
  };
}

/* ---------- 光晕 sprite 缓存 ---------- */
var glowCache={};
function glow(col,size){
  var key=Math.round(col[0]/8)+"_"+Math.round(col[1]/8)+"_"+Math.round(col[2]/8)+"_"+size;
  var c=glowCache[key];
  if(c) return c;
  var cn=document.createElement("canvas");
  cn.width=size; cn.height=size;
  var g2=cn.getContext("2d");
  var gr=g2.createRadialGradient(size/2,size/2,0,size/2,size/2,size/2);
  gr.addColorStop(0,   rgba(col,0.85));
  gr.addColorStop(0.28,rgba(col,0.34));
  gr.addColorStop(0.62,rgba(col,0.09));
  gr.addColorStop(1,   rgba(col,0));
  g2.fillStyle=gr; g2.fillRect(0,0,size,size);
  glowCache[key]=cn;
  return cn;
}
function drawGlow(x,y,rad,col,alpha){
  if(alpha<=0.004||rad<=0.3) return;
  var sp=glow(col,64);
  ctx.globalAlpha=cl(alpha,0,1);
  ctx.drawImage(sp,x-rad,y-rad,rad*2,rad*2);
  ctx.globalAlpha=1;
}

/* ---------- 颜色（随暖度） ---------- */
var COLD_WALL_T=[26,32,50], WARM_WALL_T=[62,48,44];
var COLD_WALL_B=[16,20,33], WARM_WALL_B=[38,28,27];
var COLD_FLOOR=[13,16,27],  WARM_FLOOR=[31,22,21];
var COLD_WOOD=[52,58,78],   WARM_WOOD=[118,84,58];
var COLD_BIRD=[178,198,226],WARM_BIRD=[248,208,142];
var LAMPC=[255,198,120];
function wallTop(){ return mixa(COLD_WALL_T,WARM_WALL_T,S.warmth); }
function wallBot(){ return mixa(COLD_WALL_B,WARM_WALL_B,S.warmth); }
function woodC(){  return mixa(COLD_WOOD,WARM_WOOD,S.warmth); }
function birdC(b){ return mixa(COLD_BIRD,WARM_BIRD,cl(S.warmth*0.85+b.land*0.10,0,1)); }

/* ---------- 粒子 ---------- */
function addMote(x,y,tx,ty,dl,col){
  if(S.motes.length>150) return;
  S.motes.push({ x:x, y:y, sx:x, sy:y, tx:tx, ty:ty, t:-dl, life:0.95+Math.random()*0.5,
                 col:col||LAMPC, r:rnd(1.1,2.4), sw:rnd(-24,24) });
}
function addRing(x,y,r0,r1,life,col,wd){
  if(S.rings.length>26) return;
  S.rings.push({ x:x, y:y, r0:r0, r1:r1, t:0, life:life, col:col||LAMPC, wd:wd||1.4 });
}
function addRipple(nx,ny,life){
  if(S.ripples.length>14) return;
  S.ripples.push({ x:nx, y:ny, t:0, life:life||2.4 });
}
function addSpark(x,y,col){
  if(S.sparks.length>140) return;
  S.sparks.push({ x:x, y:y, vx:rnd(-26,26), vy:rnd(-52,-14), t:0,
                  life:rnd(0.9,1.9), r:rnd(0.9,2.1), col:col||LAMPC });
}

/* ---------- 动词 ---------- */
function replyBird(b,g){
  if(!b.here||b.gone||b.replied) return;
  var pr=paneRect(g,b.pane);
  var bxp=pr.x+pr.w*b.bx, byp=pr.y+pr.h;
  b.replied=true; b.gone=true; b.fly=0.0001;
  b.fdx=(b.bx<0.5?-1:1)*rnd(0.35,0.85);
  b.fdy=-rnd(0.9,1.4);
  b.wake=1; b.sleep=Math.max(0,b.sleep-0.4);
  var pane=S.panes[b.pane];
  pane.mark=Math.max(pane.mark,0.001);
  /* 你给它的一点暖光：从灯流向它 */
  var k;
  for(k=0;k<7;k++) addMote(g.lx,g.ly-42*g.ls,bxp+rnd(-8,8),byp+rnd(-14,2),k*0.055,LAMPC);
  for(k=0;k<9;k++) addSpark(bxp+rnd(-5,5),byp-6+rnd(-4,4),mixa(LAMPC,[255,238,206],0.4));
  addRing(bxp,byp-8,4,30*g.sc,1.5,[255,214,158],1.3);
  S.replied++;
  S.warmth=cl(S.warmth-replyCost(),0.04,1);
  S.lampT=cl(S.lampT+0.05,0,1);
  sReply(b.n);
  S.idle=0;
}
function replyCost(){ return 0.085*(1-S.warmth*0.92); }

function doRest(dt,g){
  var gain=0.052*(1+0.55*(1-S.warmth));
  S.warmth=cl(S.warmth+gain*dt,0,1);
  S.lampT=cl(S.lampT+0.34*dt,0,1);
  var i;
  for(i=0;i<S.birds.length;i++){
    var b=S.birds[i];
    if(b.here&&!b.gone) b.sleep=cl(b.sleep+0.30*dt,0,1);
  }
  for(i=0;i<S.panes.length;i++) S.panes[i].fog=cl(S.panes[i].fog+0.20*dt,0,0.5);
}
function doLook(x,y,g){
  S.look=cl(S.look+0.10,0,1);
  S.moon=cl(S.moon+0.07,0,1);
  S.warmth=cl(S.warmth+0.008,0,1);
  var nx=cl((x-g.ix)/g.iw,0,1), ny=cl((y-g.iy)/g.ih,0,1);
  addRipple(nx,ny,2.6);
  var i;
  for(i=0;i<S.panes.length;i++){
    if(S.panes[i].mark>0.4) S.panes[i].echo=1;
  }
  for(i=0;i<S.clouds.length;i++) S.clouds[i].a=Math.max(0.035,S.clouds[i].a-0.012);
  sSky();
  S.idle=0;
}

/* ---------- 更新 ---------- */
function update(dt){
  if(dt>0.05) dt=0.05;
  var g=geo(), i, b;
  S.t+=dt;
  S.idle+=dt;
  S.breath+=dt*0.55;

  /* 灯 */
  if(S.holding) S.holdT+=dt; else S.holdT=0;
  if(S.holding&&S.holdT>0.16) doRest(dt,g);
  S.lampT=cl(S.lampT-0.055*dt,0.16,1);
  S.lamp+=(S.lampT-S.lamp)*Math.min(1,dt*3.0);
  S.look=cl(S.look-0.055*dt,0,1);
  S.moon=cl(S.moon-0.018*dt,0,1);

  /* 鸟来（不催，只是来了就停着） */
  if(S.arrived<9&&!S.fin){
    S.nextArrive-=dt;
    if(S.nextArrive<=0){
      b=S.birds[S.arrived];
      b.here=true; b.land=0.0001;
      S.arrived++;
      S.nextArrive=8.5+Math.random()*5.5;
      sArrive(b.n);
    }
  }

  /* 鸟 */
  for(i=0;i<S.birds.length;i++){
    b=S.birds[i];
    b.ph+=dt*(0.55+0.22*i*0.1);
    if(b.here&&!b.gone){
      if(b.land<1) b.land=cl(b.land+dt*0.85,0,1);
      /* 没人理它也不会走，只会慢慢睡着 */
      var slp=S.holding?0.30:0.055;
      b.sleep=cl(b.sleep+slp*dt,0,1);
      b.wake=1-b.sleep*0.85;
      b.blinkT-=dt;
      if(b.blinkT<=0){ b.blink=1; b.blinkT=3.2+Math.random()*5.5; }
      b.blink=Math.max(0,b.blink-dt*2.2);
      b.hop=Math.max(0,b.hop-dt*2.0);
      b.tilt=Math.sin(b.ph*0.7)*0.06*(1-b.sleep);
      /* 睡着的鸟偶尔做个小梦 */
      if(b.sleep>0.7&&b.dream<=0&&Math.random()<dt*0.045){ b.dream=1; b.dreamY=0; }
      if(b.dream>0){
        b.dream=Math.max(0,b.dream-dt*0.42);
        b.dreamY+=dt*13;
      }
    }
    if(b.fly>0&&b.fly<1){
      b.fly=cl(b.fly+dt*0.46,0,1);
      b.frot+=dt*1.6;
    }
  }

  /* 格子的余温 */
  for(i=0;i<S.panes.length;i++){
    var p=S.panes[i];
    if(p.mark>0) p.mark=cl(p.mark+dt*0.55,0,1);
    var tl=p.mark*(0.55+0.45*S.warmth);
    p.lit+=(tl-p.lit)*Math.min(1,dt*1.6);
    p.echo=Math.max(0,p.echo-dt*0.55);
    p.fog=Math.max(0,p.fog-dt*0.10);
  }

  /* 光尘 */
  for(i=S.motes.length-1;i>=0;i--){
    var m=S.motes[i];
    m.t+=dt;
    if(m.t<0) continue;
    var k=cl(m.t/m.life,0,1), e=ease(k);
    m.x=lerp(m.sx,m.tx,e)+Math.sin(k*4.4+i)*m.sw*(1-e)*0.5;
    m.y=lerp(m.sy,m.ty,e)-Math.sin(k*3.14)*26;
    if(k>=1) S.motes.splice(i,1);
  }
  for(i=S.sparks.length-1;i>=0;i--){
    var s=S.sparks[i];
    s.t+=dt;
    s.x+=s.vx*dt; s.y+=s.vy*dt; s.vy+=16*dt; s.vx*=0.985;
    if(s.t>=s.life) S.sparks.splice(i,1);
  }
  for(i=S.rings.length-1;i>=0;i--){
    S.rings[i].t+=dt;
    if(S.rings[i].t>=S.rings[i].life) S.rings.splice(i,1);
  }
  for(i=S.ripples.length-1;i>=0;i--){
    S.ripples[i].t+=dt;
    if(S.ripples[i].t>=S.ripples[i].life) S.ripples.splice(i,1);
  }

  /* 云 */
  for(i=0;i<S.clouds.length;i++){
    var c=S.clouds[i];
    c.x+=c.v*dt*(0.5+S.look*0.9);
    if(c.x-c.w>1.05) c.x=-c.w-0.05;
  }

  /* 终章：九只都回过了 */
  if(!S.fin&&S.replied>=9){
    S.fin=1; S.finSeq=0; S.finGap=0.35; S.finT=0;
    S.flock=[];
    for(i=0;i<9;i++){
      S.flock.push({ i:i, t:-0.5-i*0.16, x:-0.15-i*0.06, y:0.30+Math.sin(i*1.1)*0.10, s:rnd(0.7,1.05) });
    }
  }
  if(S.fin){
    S.finT+=dt;
    S.warmth=cl(S.warmth+dt*0.10,0,1);
    if(S.finSeq>=0&&S.finSeq<9){
      S.finGap-=dt;
      if(S.finGap<=0){
        var num=S.finSeq+1, pi=-1;
        for(i=0;i<9;i++){ if(S.panes[i].n===num){ pi=i; break; } }
        if(pi>=0){
          S.panes[pi].echo=1.4;
          var pr=paneRect(g,pi);
          addRing(pr.x+pr.w/2,pr.y+pr.h/2,3,pr.w*0.62,1.8,[255,222,168],1.2);
        }
        sFin(S.finSeq);
        S.finSeq++;
        S.finGap=0.42;
      }
    }
    for(i=0;i<S.flock.length;i++){
      var f=S.flock[i];
      f.t+=dt;
      if(f.t>0){ f.x+=dt*0.085; f.y+=Math.sin(f.t*0.9+i)*dt*0.026; }
    }
  }

  /* 闲置彩蛋：某只睡着的鸟自己亮一下 */
  S.eggT-=dt;
  if(S.idle>15.5&&S.eggT<=0){
    var cand=[];
    for(i=0;i<S.birds.length;i++){ if(S.birds[i].here&&!S.birds[i].gone) cand.push(S.birds[i]); }
    if(cand.length){
      var pick=cand[Math.floor(Math.random()*cand.length)];
      pick.hop=1; pick.dream=1; pick.dreamY=0; pick.blink=1;
      sDream(pick.n);
      S.eggT=7.5+Math.random()*5;
      S.idle=0;
    } else {
      S.eggT=4;
    }
  }

  /* CSS 暖光层 */
  var dimEl=document.getElementById("dim");
  if(dimEl){
    var op=(S.warmth*0.42+S.fin*0.14).toFixed(3);
    if(dimEl.__op!==op){ dimEl.style.opacity=op; dimEl.__op=op; }
  }
}

/* ---------- 输入 ---------- */
function hitBird(x,y,g){
  var i,b,pr,bxp,byp,rr;
  for(i=0;i<S.birds.length;i++){
    b=S.birds[i];
    if(!b.here||b.gone) continue;
    pr=paneRect(g,b.pane);
    bxp=pr.x+pr.w*b.bx; byp=pr.y+pr.h;
    rr=Math.max(20,26*g.sc);
    var dx=x-bxp, dy=y-(byp-13*g.sc);
    if(dx*dx+dy*dy<rr*rr) return b;
  }
  return null;
}
function onDown(x,y){
  if(!S) return;
  var now=clockNow();
  if(now-S.lastDownT<70&&Math.abs(x-S.downX)<8&&Math.abs(y-S.downY)<8) return;
  S.lastDownT=now; S.downX=x; S.downY=y; S.dragged=false;
  S.holding=true; S.holdT=0;
  S.idle=0;
}
function onMove(x,y){
  mx=x; my=y;
  if(!S) return;
  if(S.holding&&(Math.abs(x-S.downX)>8||Math.abs(y-S.downY)>8)) S.dragged=true;
}
function onUp(x,y){
  if(!S) return;
  var g=geo();
  var wasHold=S.holdT;
  S.holding=false;
  if(wasHold>0.34){
    /* 歇完了，松手荡开一圈呼吸 */
    addRing(S.downX,S.downY,6,120*g.ls,2.2,[255,206,148],1.1);
    sRest();
    S.idle=0;
    return;
  }
  var b=hitBird(S.downX,S.downY,g);
  if(b){ replyBird(b,g); return; }
  doLook(S.downX,S.downY,g);
}

/* ---------- 绘制：缓存渐变 ---------- */
var gcache={ k:"", wall:null, sky:null, floor:null };
function gradKey(g){
  return W+"_"+H+"_"+Math.round(S.warmth*24)+"_"+Math.round(S.look*8)+"_"+Math.round(g.floor);
}
function buildGrads(g){
  var k=gradKey(g);
  if(gcache.k===k&&gcache.wall) return;
  var wt=wallTop(), wb=wallBot();
  var gw=ctx.createLinearGradient(0,0,0,H);
  gw.addColorStop(0,   rgba(wt,1));
  gw.addColorStop(0.62,rgba(mixa(wt,wb,0.7),1));
  gw.addColorStop(1,   rgba(wb,1));
  var gf=ctx.createLinearGradient(0,g.floor,0,H);
  gf.addColorStop(0,rgba(mixa(COLD_FLOOR,WARM_FLOOR,S.warmth),1));
  gf.addColorStop(1,rgba(mixa([8,10,18],[22,15,15],S.warmth),1));
  var gs=ctx.createLinearGradient(0,g.iy,0,g.iy+g.ih);
  var lk=S.look;
  gs.addColorStop(0,   rgba(mixa([10,14,32],[16,22,48],lk),1));
  gs.addColorStop(0.58,rgba(mixa([16,22,46],[24,32,64],lk),1));
  gs.addColorStop(0.88,rgba(mixa([30,34,58],[44,46,74],lk),1));
  gs.addColorStop(1,   rgba(mixa([46,42,58],[66,56,66],lk),1));
  gcache.k=k; gcache.wall=gw; gcache.sky=gs; gcache.floor=gf;
}

/* ---------- 绘制：一只鸟 ---------- */
function drawBird(b,x,y,u,col,alpha,flap){
  if(alpha<=0.01) return;
  var sl=b.sleep, aw=1-sl;
  var br=0.5+0.5*Math.sin(b.ph*1.1);                  /* 呼吸 */
  var lift=b.hop*6*(u/12);
  var bodyRY=u*0.62*(1+sl*0.16)+br*u*0.03;
  var bodyRX=u*0.86*(1+sl*0.07);
  var face=b.bx<0.5?1:-1;
  ctx.save();
  ctx.translate(x,y-lift);
  ctx.globalAlpha=alpha;
  ctx.rotate(b.tilt*aw);

  /* 光晕 */
  drawGlow(0,-u*0.75,u*3.1,col,(0.10+0.16*aw+0.10*br*aw)*alpha);

  /* 腿（醒着才伸出来） */
  ctx.strokeStyle=rgba(mixa(col,[40,40,48],0.45),0.55*aw+0.12);
  ctx.lineWidth=Math.max(0.8,u*0.075);
  ctx.beginPath();
  var lgh=u*0.30*aw+u*0.05;
  ctx.moveTo(-u*0.16,-lgh); ctx.lineTo(-u*0.16,0);
  ctx.moveTo( u*0.16,-lgh); ctx.lineTo( u*0.16,0);
  ctx.stroke();

  var cy=-lgh-bodyRY*0.92;
  /* 身体 */
  ctx.fillStyle=rgba(col,0.90);
  ctx.beginPath();
  ctx.ellipse(0,cy,bodyRX,bodyRY,0,0,6.2832);
  ctx.fill();
  /* 尾 */
  ctx.beginPath();
  ctx.moveTo(-face*bodyRX*0.72,cy-u*0.02);
  ctx.lineTo(-face*(bodyRX+u*0.62),cy-u*0.30-sl*u*0.10);
  ctx.lineTo(-face*(bodyRX*0.80),cy+u*0.24);
  ctx.closePath();
  ctx.fill();
  /* 翅 */
  ctx.fillStyle=rgba(mixa(col,[255,255,255],0.14),0.62);
  ctx.save();
  ctx.translate(-face*u*0.10,cy);
  ctx.rotate(face*(flap? Math.sin(flap*11)*0.85 : (-0.10-sl*0.10)));
  ctx.beginPath();
  ctx.ellipse(0,0,bodyRX*0.66,bodyRY*0.52,0,0,6.2832);
  ctx.fill();
  ctx.restore();
  /* 头 */
  var hx=face*(bodyRX*0.70)*(1-sl*0.62);
  var hy=cy-bodyRY*(0.78-sl*0.52);
  var hr=u*0.44;
  ctx.fillStyle=rgba(col,0.94);
  ctx.beginPath();
  ctx.arc(hx,hy,hr,0,6.2832);
  ctx.fill();
  /* 喙 */
  if(sl<0.75){
    ctx.fillStyle=rgba(mixa(col,[250,196,120],0.55),0.85*(1-sl));
    ctx.beginPath();
    ctx.moveTo(hx+face*hr*0.86,hy+u*0.02);
    ctx.lineTo(hx+face*(hr+u*0.34),hy+u*0.10);
    ctx.lineTo(hx+face*hr*0.80,hy+u*0.17);
    ctx.closePath();
    ctx.fill();
  }
  /* 眼：醒着是一点暗芒，眨眼/睡着是一道弧 */
  var eo=1-b.blink;
  ctx.strokeStyle="rgba(38,36,48,"+(0.55*aw+0.30).toFixed(3)+")";
  ctx.lineWidth=Math.max(0.8,u*0.085);
  if(sl>0.55||eo<0.35){
    ctx.beginPath();
    ctx.arc(hx+face*hr*0.18,hy-u*0.02,hr*0.34,0.35,2.79);
    ctx.stroke();
  }else{
    ctx.fillStyle="rgba(34,32,44,"+(0.62*aw+0.22).toFixed(3)+")";
    ctx.beginPath();
    ctx.arc(hx+face*hr*0.20,hy-u*0.04,hr*0.24,0,6.2832);
    ctx.fill();
  }
  /* 梦泡 */
  if(b.dream>0){
    var da=b.dream*0.5;
    drawGlow(hx+face*u*0.5,hy-u*0.9-b.dreamY,u*1.5,mixa(col,[255,236,200],0.5),da*0.75);
    ctx.fillStyle=rgba([255,240,214],da*0.5);
    ctx.beginPath();
    ctx.arc(hx+face*u*0.5,hy-u*0.9-b.dreamY,u*0.16*b.dream+u*0.05,0,6.2832);
    ctx.fill();
  }
  ctx.restore();
}

/* ---------- 绘制：主 ---------- */
function draw(){
  var g=geo(), i, b, pr;
  buildGrads(g);

  /* 硬清屏（墙面渐变铺满） */
  ctx.fillStyle=gcache.wall;
  ctx.fillRect(0,0,W,H);

  /* 地面 */
  ctx.fillStyle=gcache.floor;
  ctx.fillRect(0,g.floor,W,H-g.floor);
  ctx.strokeStyle=rgba(mixa([40,46,64],[92,68,52],S.warmth),0.35);
  ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(0,g.floor+0.5); ctx.lineTo(W,g.floor+0.5); ctx.stroke();

  /* 灯光在墙上/地上的光池 */
  var lampY=g.ly-46*g.ls;
  drawGlow(g.lx,lampY,Math.min(W,H)*(0.46+S.lamp*0.30),LAMPC,0.10+S.lamp*0.16);
  drawGlow(g.lx,g.floor+6,Math.min(W,H)*0.20,LAMPC,0.06+S.lamp*0.10);

  /* ===== 窗 ===== */
  ctx.save();
  ctx.beginPath();
  ctx.rect(g.ix,g.iy,g.iw,g.ih);
  ctx.clip();

  /* 夜空 */
  ctx.fillStyle=gcache.sky;
  ctx.fillRect(g.ix,g.iy,g.iw,g.ih);

  /* 星 */
  for(i=0;i<S.stars.length;i++){
    var st=S.stars[i];
    var tw=0.35+0.65*(0.5+0.5*Math.sin(S.t*0.8+st.tw));
    ctx.fillStyle=rgba([226,234,250],tw*(0.42+S.look*0.30));
    ctx.beginPath();
    ctx.arc(g.ix+st.x*g.iw,g.iy+st.y*g.ih,st.r*(0.8+g.sc*0.4),0,6.2832);
    ctx.fill();
  }

  /* 月 */
  var mox=g.ix+g.iw*0.735, moy=g.iy+g.ih*0.205, mr=g.iw*0.062;
  drawGlow(mox,moy,mr*5.2,[214,226,248],0.10+S.moon*0.16);
  ctx.fillStyle=rgba([236,240,250],0.72+S.moon*0.22);
  ctx.beginPath(); ctx.arc(mox,moy,mr,0,6.2832); ctx.fill();
  ctx.fillStyle=gcache.sky;
  ctx.globalAlpha=0.92;
  ctx.beginPath(); ctx.arc(mox-mr*0.46,moy-mr*0.22,mr*0.94,0,6.2832); ctx.fill();
  ctx.globalAlpha=1;

  /* 云 */
  for(i=0;i<S.clouds.length;i++){
    var c=S.clouds[i];
    var cxp=g.ix+c.x*g.iw, cyp=g.iy+c.y*g.ih, cwp=c.w*g.iw, chp=c.h*g.ih;
    ctx.fillStyle=rgba(mixa([150,164,196],[210,186,168],S.warmth*0.5),c.a);
    ctx.beginPath();
    ctx.ellipse(cxp,cyp,cwp*0.5,chp*0.5,0,0,6.2832);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cxp+cwp*0.20,cyp+chp*0.16,cwp*0.32,chp*0.38,0,0,6.2832);
    ctx.fill();
  }

  /* 远处屋脊剪影 */
  var sky0=g.iy+g.ih*0.78;
  ctx.fillStyle=rgba(mixa([8,11,22],[20,15,20],S.warmth*0.6),0.92);
  ctx.beginPath();
  ctx.moveTo(g.ix,g.iy+g.ih);
  var segs=[[0.00,0.00],[0.07,0.045],[0.16,0.045],[0.19,0.085],[0.31,0.085],[0.34,0.030],
            [0.46,0.030],[0.50,0.070],[0.63,0.070],[0.66,0.020],[0.78,0.020],[0.82,0.060],
            [0.93,0.060],[0.97,0.028],[1.00,0.028]];
  for(i=0;i<segs.length;i++){
    ctx.lineTo(g.ix+segs[i][0]*g.iw, sky0-segs[i][1]*g.ih);
  }
  ctx.lineTo(g.ix+g.iw,g.iy+g.ih);
  ctx.closePath();
  ctx.fill();
  /* 远处也有亮着的窗 */
  for(i=0;i<6;i++){
    var wxp=g.ix+g.iw*(0.09+i*0.155), wyp=sky0-g.ih*0.012;
    var fl=0.30+0.30*Math.sin(S.t*0.5+i*1.7);
    ctx.fillStyle=rgba([255,206,140],fl*(0.30+S.warmth*0.25));
    ctx.fillRect(wxp,wyp,Math.max(1.2,g.iw*0.010),Math.max(1.6,g.ih*0.014));
  }

  /* 抬头看时的空气涟漪 */
  for(i=0;i<S.ripples.length;i++){
    var rp=S.ripples[i], k=cl(rp.t/rp.life,0,1);
    ctx.strokeStyle=rgba([210,224,250],(1-k)*0.16);
    ctx.lineWidth=1.1;
    ctx.beginPath();
    ctx.ellipse(g.ix+rp.x*g.iw,g.iy+rp.y*g.ih,ease(k)*g.iw*0.52,ease(k)*g.iw*0.38,0,0,6.2832);
    ctx.stroke();
  }

  /* 终章归来的鸟群（在远空掠过一圈） */
  if(S.fin){
    for(i=0;i<S.flock.length;i++){
      var f=S.flock[i];
      if(f.t<=0) continue;
      var fxp=g.ix+f.x*g.iw, fyp=g.iy+f.y*g.ih;
      if(f.x>1.2) continue;
      var fa=cl(1-Math.abs(f.x-0.5)*1.3,0,1)*0.85;
      ctx.strokeStyle=rgba([250,224,178],fa*0.75);
      ctx.lineWidth=Math.max(1,g.iw*0.006*f.s);
      var wsp=Math.sin(S.t*6+i)*0.5;
      var ws=g.iw*0.017*f.s;
      ctx.beginPath();
      ctx.moveTo(fxp-ws,fyp-ws*wsp);
      ctx.quadraticCurveTo(fxp,fyp+ws*0.30,fxp+ws,fyp-ws*wsp);
      ctx.stroke();
    }
  }

  /* 格子的余温 + 记号 */
  for(i=0;i<S.panes.length;i++){
    var p=S.panes[i];
    pr=paneRect(g,i);
    var lt=p.lit+p.echo*0.5;
    if(lt>0.01){
      drawGlow(pr.x+pr.w*0.5,pr.y+pr.h*0.62,pr.w*0.78,[255,204,146],cl(lt*0.26,0,0.45));
    }
    if(p.fog>0.01){
      ctx.fillStyle=rgba([226,232,244],p.fog*0.13);
      ctx.fillRect(pr.x,pr.y,pr.w,pr.h);
    }
  }
  /* 鸟停过的地方留一点光 */
  for(i=0;i<S.birds.length;i++){
    b=S.birds[i];
    if(b.mark===undefined) b.mark=0;
    var pn=S.panes[b.pane];
    if(b.replied&&pn.mark>0.02){
      pr=paneRect(g,b.pane);
      var mxp=pr.x+pr.w*b.bx, myp=pr.y+pr.h-2;
      drawGlow(mxp,myp,18*g.sc,[255,214,158],pn.mark*0.36);
      ctx.fillStyle=rgba([255,232,198],pn.mark*0.55);
      ctx.beginPath(); ctx.arc(mxp,myp,Math.max(1,1.7*g.sc),0,6.2832); ctx.fill();
    }
  }

  /* 鸟 */
  var u=g.cw*0.105;
  for(i=0;i<S.birds.length;i++){
    b=S.birds[i];
    if(!b.here) continue;
    pr=paneRect(g,b.pane);
    var bxp=pr.x+pr.w*b.bx, byp=pr.y+pr.h;
    var col=birdC(b);
    if(b.gone){
      if(b.fly>0&&b.fly<1){
        var e=ease(b.fly);
        var fx=bxp+b.fdx*g.cw*1.5*e;
        var fy=byp+b.fdy*g.ch*1.35*e-Math.sin(e*3.14)*g.ch*0.12;
        drawBird(b,fx,fy,u*(1-e*0.62),mixa(col,[255,226,180],0.5),(1-e*e)*0.95,b.frot);
      }
    }else{
      var la=ease(b.land);
      var yy=byp-(1-la)*g.ch*0.34;
      drawBird(b,bxp,yy,u,col,0.30+0.70*la,(1-la)*1.6);
    }
  }

  ctx.restore(); /* 结束窗内裁剪 */

  /* ===== 窗棂与窗框 ===== */
  var wood=woodC();
  ctx.strokeStyle=rgba(mixa(wood,[0,0,0],0.35),0.9);
  ctx.lineWidth=g.mb;
  ctx.beginPath();
  for(i=1;i<=2;i++){
    var vx=g.ix+i*g.cw+(i-0.5)*g.mb;
    ctx.moveTo(vx,g.iy); ctx.lineTo(vx,g.iy+g.ih);
    var hy2=g.iy+i*g.ch+(i-0.5)*g.mb;
    ctx.moveTo(g.ix,hy2); ctx.lineTo(g.ix+g.iw,hy2);
  }
  ctx.stroke();
  /* 棂条上的一线高光 */
  ctx.strokeStyle=rgba(mixa(wood,[255,226,180],0.55),0.30+S.warmth*0.24);
  ctx.lineWidth=Math.max(0.7,g.mb*0.26);
  ctx.beginPath();
  for(i=1;i<=2;i++){
    var vx2=g.ix+i*g.cw+(i-0.5)*g.mb-g.mb*0.26;
    ctx.moveTo(vx2,g.iy); ctx.lineTo(vx2,g.iy+g.ih);
    var hy3=g.iy+i*g.ch+(i-0.5)*g.mb-g.mb*0.26;
    ctx.moveTo(g.ix,hy3); ctx.lineTo(g.ix+g.iw,hy3);
  }
  ctx.stroke();

  /* 外框 */
  ctx.strokeStyle=rgba(wood,0.95);
  ctx.lineWidth=g.fr;
  ctx.strokeRect(g.wx+g.fr/2,g.wy+g.fr/2,g.ww-g.fr,g.wh-g.fr);
  ctx.strokeStyle=rgba(mixa(wood,[255,228,186],0.5),0.22+S.warmth*0.20);
  ctx.lineWidth=Math.max(0.8,g.fr*0.14);
  ctx.strokeRect(g.wx+g.fr*0.90,g.wy+g.fr*0.90,g.ww-g.fr*1.8,g.wh-g.fr*1.8);

  /* 窗台 */
  ctx.fillStyle=rgba(mixa(wood,[0,0,0],0.18),0.95);
  var slw=g.ww+g.ww*0.075;
  ctx.fillRect(g.wx-g.ww*0.0375,g.wy+g.wh,slw,g.ww*0.030);
  ctx.fillStyle=rgba(mixa(wood,[255,226,182],0.45),0.20+S.warmth*0.20);
  ctx.fillRect(g.wx-g.ww*0.0375,g.wy+g.wh,slw,Math.max(1,g.ww*0.007));

  /* ===== 灯 ===== */
  drawLamp(g,lampY);

  /* ===== 粒子 ===== */
  for(i=0;i<S.motes.length;i++){
    var m=S.motes[i];
    if(m.t<0) continue;
    var mk=cl(m.t/m.life,0,1);
    var ma=Math.sin(mk*3.14159)*0.9;
    drawGlow(m.x,m.y,m.r*7,m.col,ma*0.32);
    ctx.fillStyle=rgba(mixa(m.col,[255,246,226],0.4),ma*0.72);
    ctx.beginPath(); ctx.arc(m.x,m.y,m.r,0,6.2832); ctx.fill();
  }
  for(i=0;i<S.sparks.length;i++){
    var sp=S.sparks[i];
    var sk=1-cl(sp.t/sp.life,0,1);
    ctx.fillStyle=rgba(sp.col,sk*0.55);
    ctx.beginPath(); ctx.arc(sp.x,sp.y,sp.r*sk,0,6.2832); ctx.fill();
  }
  for(i=0;i<S.rings.length;i++){
    var rg=S.rings[i], rk=cl(rg.t/rg.life,0,1);
    ctx.strokeStyle=rgba(rg.col,(1-rk)*0.30);
    ctx.lineWidth=rg.wd*(1-rk*0.6);
    ctx.beginPath();
    ctx.arc(rg.x,rg.y,lerp(rg.r0,rg.r1,ease(rk)),0,6.2832);
    ctx.stroke();
  }

  /* 按住时手边的呼吸圈 */
  if(S.holding&&S.holdT>0.16){
    var hb=0.5+0.5*Math.sin(S.t*1.5);
    var hr2=(24+hb*16)*g.ls;
    drawGlow(S.downX,S.downY,hr2*2.6,LAMPC,0.10+0.10*hb);
    ctx.strokeStyle=rgba([255,214,160],0.16+0.10*hb);
    ctx.lineWidth=1.1;
    ctx.beginPath(); ctx.arc(S.downX,S.downY,hr2,0,6.2832); ctx.stroke();
  }
}

/* ---------- 灯 ---------- */
function drawLamp(g,lampY){
  var s=g.ls, x=g.lx, y=g.ly;
  var wood=mixa([58,52,60],[122,86,60],S.warmth);
  /* 底座 */
  ctx.fillStyle=rgba(wood,0.95);
  ctx.beginPath();
  ctx.ellipse(x,y,20*s,5.2*s,0,0,6.2832);
  ctx.fill();
  /* 灯杆 */
  ctx.strokeStyle=rgba(wood,0.95);
  ctx.lineWidth=3.0*s;
  ctx.beginPath(); ctx.moveTo(x,y-2*s); ctx.lineTo(x,y-40*s); ctx.stroke();
  /* 灯罩 */
  var sh=mixa([74,70,86],[186,140,92],S.warmth);
  ctx.fillStyle=rgba(sh,0.92);
  ctx.beginPath();
  ctx.moveTo(x-24*s,y-40*s);
  ctx.lineTo(x-15*s,y-64*s);
  ctx.lineTo(x+15*s,y-64*s);
  ctx.lineTo(x+24*s,y-40*s);
  ctx.closePath();
  ctx.fill();
  /* 罩下的光 */
  var lg=ctx.createLinearGradient(x,y-40*s,x,y+4*s);
  lg.addColorStop(0,rgba(LAMPC,0.30+S.lamp*0.34));
  lg.addColorStop(1,rgba(LAMPC,0));
  ctx.fillStyle=lg;
  ctx.beginPath();
  ctx.moveTo(x-23*s,y-40*s);
  ctx.lineTo(x-40*s,y+4*s);
  ctx.lineTo(x+40*s,y+4*s);
  ctx.lineTo(x+23*s,y-40*s);
  ctx.closePath();
  ctx.fill();
  /* 灯芯 */
  drawGlow(x,y-44*s,44*s*(0.8+S.lamp*0.6),LAMPC,0.28+S.lamp*0.40);
  ctx.fillStyle=rgba([255,238,206],0.55+S.lamp*0.40);
  ctx.beginPath();
  ctx.ellipse(x,y-43*s,7.5*s,5.2*s*(0.9+S.lamp*0.25),0,0,6.2832);
  ctx.fill();
  /* 罩沿高光 */
  ctx.strokeStyle=rgba(mixa(sh,[255,232,196],0.6),0.35+S.warmth*0.25);
  ctx.lineWidth=Math.max(0.8,1.1*s);
  ctx.beginPath(); ctx.moveTo(x-24*s,y-40*s); ctx.lineTo(x+24*s,y-40*s); ctx.stroke();
}

/* ---------- 尺寸 ---------- */
function resize(){
  W=window.innerWidth||800;
  H=window.innerHeight||600;
  DPR=Math.min(2,window.devicePixelRatio||1);
  if(cv){
    cv.width=Math.max(1,Math.floor(W*DPR));
    cv.height=Math.max(1,Math.floor(H*DPR));
    cv.style.width=W+"px";
    cv.style.height=H+"px";
  }
  if(ctx) ctx.setTransform(DPR,0,0,DPR,0,0);
  gcache.k="";
}

/* ---------- 主循环 ---------- */
var last=0;
function frame(ts){
  if(!running) return;
  if(!last) last=ts;
  var dt=(ts-last)/1000;
  last=ts;
  if(dt>0.12) dt=0.12;
  if(dt<0) dt=0;
  try{ update(dt); draw(); }catch(e){ if(window.console) console.error(e); }
  requestAnimationFrame(frame);
}

/* ---------- 启动 ---------- */
function boot(){
  cv=document.getElementById("cv");
  if(!cv) return;
  ctx=cv.getContext("2d");
  resize();
  reset();
  mx=W*0.5; my=H*0.5;

  window.addEventListener("resize",function(){ resize(); },{passive:true});
  window.addEventListener("orientationchange",function(){ setTimeout(resize,220); },{passive:true});

  cv.addEventListener("pointerdown",function(e){
    e.preventDefault();
    onDown(e.clientX,e.clientY);
  },{passive:false});
  window.addEventListener("pointermove",function(e){
    onMove(e.clientX,e.clientY);
  },{passive:true});
  window.addEventListener("pointerup",function(e){
    onUp(e.clientX,e.clientY);
  },{passive:true});
  window.addEventListener("pointercancel",function(){
    if(S) S.holding=false;
  },{passive:true});

  var snd=document.getElementById("snd");
  if(snd){
    snd.addEventListener("pointerdown",function(e){
      e.stopPropagation();
      sndOn=!sndOn;
      snd.textContent=sndOn?"♪":"·";
      snd.style.opacity=sndOn?"0.55":"0.28";
    },{passive:false});
  }

  var mask=document.getElementById("mask"), bStart=document.getElementById("bStart");
  function start(){
    initAudio();
    if(AC&&AC.state==="suspended"){ try{ AC.resume(); }catch(e){} }
    if(mask){
      mask.style.opacity="0";
      mask.style.pointerEvents="none";
      setTimeout(function(){ if(mask&&mask.parentNode) mask.parentNode.removeChild(mask); },1100);
    }
    if(!running){ running=true; last=0; requestAnimationFrame(frame); }
    bell(261.63,0.07,2.4,"sine");
    bell(392.00,0.04,2.0,"sine",0.18);
  }
  if(bStart) bStart.addEventListener("click",start,{passive:true});
  if(mask) mask.addEventListener("click",start,{passive:true});

  document.addEventListener("visibilitychange",function(){
    if(document.hidden){ if(S) S.holding=false; }
    last=0;
  });
}

/* 测试钩子 */
Object.defineProperty(window,"__G",{ get:function(){
  return { S:S, geo:geo, update:update, draw:draw, reset:reset, paneRect:paneRect,
           onDown:onDown, onUp:onUp, onMove:onMove, hitBird:hitBird, LUO:LUO, NOTE:NOTE,
           replyCost:replyCost, W:function(){return W;}, H:function(){return H;} };
}});

if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",boot);
else boot();
