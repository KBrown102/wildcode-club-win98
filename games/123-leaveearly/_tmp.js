
"use strict";
/* ============ 先 · 你先走也行 ============ */
var cv=null,ctx=null,W=0,H=0,DPR=1;
var S=null,G=null;
var mx=0,my=0,downX=0,downY=0,lastDownT=-9999,pdown=false,dragged=false,holding=false,downCam=0;
var AC=null,master=null,muted=false,started=false;
var last=0,rafId=0;
var glowS=null,starS=null;

var ROWS=7;
/* 七声：宫 商 角 变徵 徵 羽 变宫（由前排到后排逐级下行，越退越低沉） */
var SCALE=[587.33,523.25,466.16,440.00,392.00,349.23,311.13];
/* 每排一句大白话，点亮时浮现 */
var LINES=[
  "你本来是想看完的",
  "看了一会儿，够了",
  "往后挪一点，没人注意",
  "声音小了些，好多了",
  "这里也看得见台上",
  "快到门口了",
  "站起来，没人回头"
];
/* 北斗七星（勺形，归一化坐标，画在夜空） */
var DIPPER=[
  [0.735,0.150],[0.660,0.118],[0.586,0.132],[0.520,0.176],
  [0.452,0.150],[0.386,0.186],[0.318,0.242]
];

function clamp(a,b,c){return a<b?b:(a>c?c:a);}
function lerp(a,b,t){return a+(b-a)*t;}
function ease(t){return t<0?0:(t>1?1:t*t*(3-2*t));}
function rnd(a,b){return a+Math.random()*(b-a);}

/* 颜色混合：#rgb / #rrggbb / rgb() 都能解析 */
function pc(c){
  if(c.charAt(0)==="#"){
    if(c.length===4)return [parseInt(c[1]+c[1],16),parseInt(c[2]+c[2],16),parseInt(c[3]+c[3],16)];
    return [parseInt(c.substr(1,2),16),parseInt(c.substr(3,2),16),parseInt(c.substr(5,2),16)];
  }
  var m=c.match(/-?\d+(\.\d+)?/g)||[0,0,0];
  return [+m[0],+m[1],+m[2]];
}
function mixc(a,b,t){
  var A=pc(a),B=pc(b);
  return "rgb("+Math.round(lerp(A[0],B[0],t))+","+Math.round(lerp(A[1],B[1],t))+","+Math.round(lerp(A[2],B[2],t))+")";
}
function rgba(c,al){var A=pc(c);return "rgba("+A[0]+","+A[1]+","+A[2]+","+al+")";}

/* ---------- 预渲染光斑 ---------- */
function mkGlow(col,size){
  var c=document.createElement("canvas");c.width=c.height=size;
  var g=c.getContext("2d"),r=size/2;
  var gr=g.createRadialGradient(r,r,0,r,r,r);
  gr.addColorStop(0,rgba(col,.95));gr.addColorStop(.32,rgba(col,.42));
  gr.addColorStop(.7,rgba(col,.10));gr.addColorStop(1,rgba(col,0));
  g.fillStyle=gr;g.fillRect(0,0,size,size);
  return c;
}

/* ---------- 音频 ---------- */
function initAudio(){
  if(AC)return;
  try{
    var C=window.AudioContext||window.webkitAudioContext;
    if(!C)return;
    AC=new C();
    master=AC.createGain();master.gain.value=.9;master.connect(AC.destination);
    startStage();
  }catch(e){AC=null;}
}
var stageGain=null,stageLP=null,crowdSrc=null;
function noiseBuf(sec){
  var n=Math.floor(AC.sampleRate*sec),b=AC.createBuffer(1,n,AC.sampleRate),d=b.getChannelData(0);
  for(var i=0;i<n;i++)d[i]=(Math.random()*2-1);
  return b;
}
function startStage(){
  if(!AC)return;
  try{
    stageGain=AC.createGain();stageGain.gain.value=.10;
    stageLP=AC.createBiquadFilter();stageLP.type="lowpass";stageLP.frequency.value=1400;
    stageGain.connect(stageLP);stageLP.connect(master);
    /* 远处的人声底噪 */
    var src=AC.createBufferSource();src.buffer=noiseBuf(4);src.loop=true;
    var bp=AC.createBiquadFilter();bp.type="bandpass";bp.frequency.value=520;bp.Q.value=.7;
    var ng=AC.createGain();ng.gain.value=.055;
    src.connect(bp);bp.connect(ng);ng.connect(stageGain);src.start();crowdSrc=src;
    /* 两层极低频 pad */
    [82.4,123.5].forEach(function(f,i){
      var o=AC.createOscillator();o.type="sine";o.frequency.value=f;
      var g=AC.createGain();g.gain.value=i?.028:.040;
      var lfo=AC.createOscillator();lfo.type="sine";lfo.frequency.value=.05+i*.03;
      var lg=AC.createGain();lg.gain.value=i?.012:.018;
      lfo.connect(lg);lg.connect(g.gain);lfo.start();
      o.connect(g);g.connect(stageGain);o.start();
    });
  }catch(e){}
}
function tone(f,dur,vol,type){
  if(!AC||muted)return;
  try{
    var t=AC.currentTime,o=AC.createOscillator(),g=AC.createGain();
    o.type=type||"sine";o.frequency.value=f;
    g.gain.setValueAtTime(0,t);
    g.gain.linearRampToValueAtTime(vol,t+.03);
    g.gain.exponentialRampToValueAtTime(.0001,t+dur);
    o.connect(g);g.connect(master);o.start(t);o.stop(t+dur+.05);
  }catch(e){}
}
function pluck(f){
  tone(f,1.9,.16,"sine");tone(f*2.005,1.15,.045,"sine");tone(f*3.01,.7,.018,"triangle");
}
function breath(){
  if(!AC||muted)return;
  try{
    var t=AC.currentTime,s=AC.createBufferSource();s.buffer=noiseBuf(1.6);
    var bp=AC.createBiquadFilter();bp.type="bandpass";bp.frequency.value=760;bp.Q.value=.9;
    var g=AC.createGain();g.gain.setValueAtTime(0,t);
    g.gain.linearRampToValueAtTime(.036,t+.5);g.gain.linearRampToValueAtTime(0,t+1.5);
    s.connect(bp);bp.connect(g);g.connect(master);s.start(t);s.stop(t+1.6);
  }catch(e){}
}
function doorSound(){
  if(!AC||muted)return;
  try{
    var t=AC.currentTime,s=AC.createBufferSource();s.buffer=noiseBuf(2.4);
    var bp=AC.createBiquadFilter();bp.type="lowpass";bp.frequency.value=900;
    var g=AC.createGain();g.gain.setValueAtTime(0,t);
    g.gain.linearRampToValueAtTime(.07,t+.35);g.gain.linearRampToValueAtTime(0,t+2.2);
    s.connect(bp);bp.connect(g);g.connect(master);s.start(t);s.stop(t+2.4);
  }catch(e){}
  tone(196,3.4,.05,"sine");tone(293.66,3.0,.035,"sine");
}
function setStageMix(back,hold){
  if(!AC||!stageGain)return;
  try{
    var v=(muted?0:1)*lerp(.13,.020,back)*(hold?1.55:1);
    stageGain.gain.setTargetAtTime(v,AC.currentTime,.6);
    stageLP.frequency.setTargetAtTime(lerp(1500,330,back)*(hold?1.5:1),AC.currentTime,.7);
  }catch(e){}
}
/* ---------- 状态 ---------- */
function newState(){
  var lit=[],i;
  for(i=0;i<ROWS;i++)lit.push(false);
  var dim=[];
  for(i=0;i<58;i++)dim.push({x:Math.random(),y:Math.random()*.36,a:rnd(.10,.42),ph:rnd(0,6.28)});
  return {
    t:0, cam:0, camT:0, back:0, lit:lit, nlit:0,
    holdT:0, idle:0, fin:0, finStart:false, sweep:-1,
    warms:[], ripples:[], motes:[], breaths:[], dim:dim,
    hintT:0, openHint:0, sway:0
  };
}
function geo(){
  var por=H>W;
  return {
    por:por,
    hz: H*(por?.395:.425),
    K:  H*(por?.545:.470),
    SC: W*(por?.70:.52),
    cx: W*.5
  };
}
/* 每排投影 */
function proj(g,r,cam){
  var dz=(cam-r)+.85;
  if(dz<.2)dz=.2;
  return {dz:dz, y:g.hz+g.K/dz, s:g.SC/dz, h:g.K*.34/dz};
}
function stageProj(g,cam){
  var dz=cam+3.4;
  return {dz:dz, y:g.hz+g.K/dz, s:g.SC/dz};
}
/* 第 r 排提灯椅的横向偏移（-1..1），错落一些 */
function lampOff(r){ return [-0.10,0.30,-0.34,0.14,-0.22,0.38,-0.04][r]; }
function lampPos(g,r,cam){
  var p=proj(g,r,cam);
  return {x:g.cx+lampOff(r)*p.s, y:p.y-p.h*1.02, p:p};
}
function reachable(r,cam){ var d=cam-r; return d>=-.14 && d<=1.22; }

/* ---------- 画布 ---------- */
function resize(){
  DPR=Math.min(2,window.devicePixelRatio||1);
  W=window.innerWidth;H=window.innerHeight;
  cv.width=Math.floor(W*DPR);cv.height=Math.floor(H*DPR);
  cv.style.width=W+"px";cv.style.height=H+"px";
  ctx.setTransform(DPR,0,0,DPR,0,0);
}

/* ---------- 输入 ---------- */
function evPos(e){
  var r=cv.getBoundingClientRect();
  return {x:(e.clientX||0)-r.left, y:(e.clientY||0)-r.top};
}
function onDown(e){
  var now=(typeof performance!=="undefined"&&performance.now)?performance.now():Date.now();
  if(now-lastDownT<70)return;
  lastDownT=now;
  var p=evPos(e);mx=p.x;my=p.y;downX=p.x;downY=p.y;
  pdown=true;dragged=false;holding=false;downCam=S.camT;
  S.idle=0;
  if(e.preventDefault)e.preventDefault();
}
function onMove(e){
  var p=evPos(e);mx=p.x;my=p.y;
  if(!pdown)return;
  var dx=p.x-downX, dy=p.y-downY;
  if(!dragged && (dx*dx+dy*dy)>64){dragged=true;holding=false;}
  if(dragged){
    var g=geo();
    S.camT=clamp(downCam+dy/(H*.30),0,6);
    S.idle=0;
  }
}
function onUp(e){
  if(!pdown)return;
  pdown=false;
  var wasHold=holding;holding=false;S.holdT=0;
  if(dragged||wasHold){dragged=false;return;}
  dragged=false;
  tapAt(mx,my);
}
function tapAt(x,y){
  var g=geo(),i,best=-1,bd=1e9;
  for(i=0;i<ROWS;i++){
    if(S.lit[i])continue;
    if(!reachable(i,S.cam))continue;
    var L=lampPos(g,i,S.cam);
    var rad=Math.max(26,Math.min(64,L.p.s*.10));
    var dx=x-L.x, dy=(y-L.y)*.9;
    var d=Math.sqrt(dx*dx+dy*dy);
    if(d<rad && d<bd){bd=d;best=i;}
  }
  if(best>=0){ lightRow(best); return; }
  /* 点空处：轻轻的一圈，不惩罚 */
  S.breaths.push({x:x,y:y,t:0,life:1.5,r0:8,r1:Math.max(W,H)*.13,a:.30});
  if(S.breaths.length>8)S.breaths.shift();
}
function lightRow(r){
  var g=geo(),L=lampPos(g,r,S.cam),i;
  S.lit[r]=true;S.nlit++;
  pluck(SCALE[r]);
  for(i=0;i<16;i++){
    var an=rnd(0,6.283),sp=rnd(14,60);
    S.warms.push({x:L.x,y:L.y,vx:Math.cos(an)*sp,vy:Math.sin(an)*sp-18,
      t:0,life:rnd(1.4,2.9),r:rnd(1.2,3.0)});
  }
  while(S.warms.length>64)S.warms.shift();
  S.ripples.push({x:L.x,y:L.y,t:0,life:2.0,r0:6,r1:Math.max(30,L.p.s*.22),a:.5,warm:true});
  while(S.ripples.length>12)S.ripples.shift();
  showHint(LINES[r]);
  S.idle=0;
}
var hintEl=null,hintTO=0;
function showHint(txt){
  if(!hintEl)return;
  hintEl.textContent=txt;hintEl.style.opacity="1";
  if(hintTO)clearTimeout(hintTO);
  hintTO=setTimeout(function(){hintEl.style.opacity="0";},3200);
}

/* ---------- 更新 ---------- */
function update(dt){
  if(dt>.05)dt=.05;
  S.t+=dt;S.idle+=dt;S.sway+=dt;

  /* 相机缓动 */
  S.cam+=(S.camT-S.cam)*Math.min(1,dt*3.0);
  var back=clamp(S.cam/6,0,1);
  S.back+=(back-S.back)*Math.min(1,dt*2.2);

  /* 按住不动 */
  if(pdown&&!dragged){
    var now=(typeof performance!=="undefined"&&performance.now)?performance.now():Date.now();
    if(now-lastDownT>340)holding=true;
  }
  if(holding){
    S.holdT+=dt;S.idle=0;
    if(Math.floor(S.holdT/1.7)!==Math.floor((S.holdT-dt)/1.7)){
      S.breaths.push({x:mx,y:my,t:0,life:2.4,r0:10,r1:Math.max(W,H)*.30,a:.24});
      while(S.breaths.length>8)S.breaths.shift();
      breath();
    }
    if(Math.floor(S.holdT/2.1)!==Math.floor((S.holdT-dt)/2.1)){
      var g=geo();
      for(var i=0;i<ROWS;i++){
        if(S.lit[i]||!reachable(i,S.cam))continue;
        var L=lampPos(g,i,S.cam);
        S.ripples.push({x:L.x,y:L.y,t:0,life:2.2,r0:4,r1:Math.max(26,L.p.s*.16),a:.36,warm:false});
      }
      while(S.ripples.length>12)S.ripples.shift();
    }
  }
  setStageMix(S.back,holding);

  /* 粒子 */
  var j;
  for(j=S.warms.length-1;j>=0;j--){
    var w=S.warms[j];w.t+=dt;
    w.x+=w.vx*dt;w.y+=w.vy*dt;w.vy+=8*dt;w.vx*=.985;w.vy*=.985;
    if(w.t>=w.life)S.warms.splice(j,1);
  }
  for(j=S.ripples.length-1;j>=0;j--){var rp=S.ripples[j];rp.t+=dt;if(rp.t>=rp.life)S.ripples.splice(j,1);}
  for(j=S.breaths.length-1;j>=0;j--){var b=S.breaths[j];b.t+=dt;if(b.t>=b.life)S.breaths.splice(j,1);}

  /* 台前浮尘 */
  if(S.motes.length<44 && Math.random()<dt*13){
    S.motes.push({x:rnd(.24,.76),y:rnd(.34,.60),vx:rnd(-.012,.012),vy:rnd(-.020,-.004),
      t:0,life:rnd(5,11),r:rnd(.7,1.9),a:rnd(.15,.45)});
  }
  for(j=S.motes.length-1;j>=0;j--){
    var m=S.motes[j];m.t+=dt;m.x+=m.vx*dt;m.y+=m.vy*dt;
    if(m.t>=m.life)S.motes.splice(j,1);
  }

  /* 闲置彩蛋：台上换了一盏灯，暖光扫过椅背 */
  if(S.sweep<0 && S.idle>16 && !S.finStart){ S.sweep=0; tone(233.08,3.2,.045,"sine"); }
  if(S.sweep>=0){
    S.sweep+=dt/4.6;
    if(S.sweep>1){S.sweep=-1;S.idle=0;}
  }

  /* 提示：一直没动过 */
  if(S.nlit===0 && S.idle>7 && S.openHint===0){ S.openHint=1; showHint("上下拖动，往后退一排"); }

  /* 终章 */
  if(!S.finStart && S.nlit>=ROWS && S.cam>5.82){
    S.finStart=true;doorSound();
    if(hintEl)hintEl.style.opacity="0";
    setTimeout(function(){var f=document.getElementById("fin");if(f)f.style.opacity="1";},2600);
  }
  if(S.finStart)S.fin=Math.min(1,S.fin+dt/4.2);

  /* CSS 合成层 */
  var wm=document.getElementById("warm"),cl=document.getElementById("cool"),vg=document.getElementById("vig");
  var tw=lerp(.58,.14,S.back)*(holding?1.25:1);
  var tc=lerp(0,.34,S.back)+S.fin*.42;
  if(wm)wm.style.opacity=String(clamp(tw,0,1));
  if(cl)cl.style.opacity=String(clamp(tc,0,1));
  if(vg)vg.style.opacity=String(clamp(.90-S.fin*.30,0,1));
}
/* ---------- 绘制 ---------- */
var skyG=null,sgW=0,sgH=0;
function skyGrad(){
  if(skyG&&sgW===W&&sgH===H)return skyG;
  sgW=W;sgH=H;
  skyG=ctx.createLinearGradient(0,0,0,H*.62);
  skyG.addColorStop(0,"#070910");
  skyG.addColorStop(.45,"#0b111b");
  skyG.addColorStop(1,"#131a23");
  return skyG;
}
function chairPath(x,yb,w,h){
  var r=Math.min(w*.32,h*.30);
  ctx.beginPath();
  ctx.moveTo(x-w/2,yb);
  ctx.lineTo(x-w/2,yb-h+r);
  ctx.quadraticCurveTo(x-w/2,yb-h,x-w/2+r,yb-h);
  ctx.lineTo(x+w/2-r,yb-h);
  ctx.quadraticCurveTo(x+w/2,yb-h,x+w/2,yb-h+r);
  ctx.lineTo(x+w/2,yb);
  ctx.closePath();
}
function sprite(img,x,y,size,alpha){
  if(alpha<=0)return;
  ctx.globalAlpha=alpha;
  ctx.drawImage(img,x-size/2,y-size/2,size,size);
  ctx.globalAlpha=1;
}

function draw(){
  /* 硬清屏 */
  ctx.fillStyle="#080a0e";ctx.fillRect(0,0,W,H);
  var g=geo(),i,j;
  ctx.fillStyle=skyGrad();ctx.fillRect(0,0,W,H*.62);

  var back=S.back, fin=S.fin;

  /* ---- 夜空细星 ---- */
  ctx.fillStyle="#cdd8e8";
  for(i=0;i<S.dim.length;i++){
    var d=S.dim[i];
    var a=d.a*(.55+.45*Math.sin(S.t*.5+d.ph))*(.5+.5*back+fin*.4);
    ctx.globalAlpha=clamp(a,0,1);
    ctx.fillRect(d.x*W,d.y*H,1.3,1.3);
  }
  ctx.globalAlpha=1;

  /* ---- 北斗七星 ---- */
  if(S.nlit>=2){
    ctx.save();ctx.strokeStyle="rgba(190,214,246,"+(.06+.12*(S.nlit/ROWS))+")";
    ctx.lineWidth=1;ctx.beginPath();
    var started2=false;
    for(i=0;i<ROWS;i++){
      if(!S.lit[i])continue;
      var px=DIPPER[i][0]*W,py=DIPPER[i][1]*H;
      if(!started2){ctx.moveTo(px,py);started2=true;}else ctx.lineTo(px,py);
    }
    ctx.stroke();ctx.restore();
  }
  ctx.save();ctx.globalCompositeOperation="lighter";
  for(i=0;i<ROWS;i++){
    var sx=DIPPER[i][0]*W, sy=DIPPER[i][1]*H;
    if(S.lit[i]){
      var tw=.72+.28*Math.sin(S.t*.9+i*1.7);
      sprite(starS,sx,sy,Math.max(26,W*.036),(.55+.35*tw)*(.7+.3*fin));
    }else{
      sprite(starS,sx,sy,Math.max(12,W*.014),.10);
    }
  }
  ctx.restore();

  /* ---- 戏台 ---- */
  var st=stageProj(g,S.cam);
  var sw=st.s*1.02, sh=g.K*.62/st.dz;
  var sxL=g.cx-sw*.5, syT=st.y-sh, flick=.94+.06*Math.sin(S.t*3.1)+.03*Math.sin(S.t*7.7);
  var stAlpha=lerp(1,.62,back);

  ctx.save();ctx.globalCompositeOperation="lighter";
  sprite(glowS,g.cx,st.y-sh*.45,sw*2.5,(.30*stAlpha*flick)*(1-fin*.55));
  ctx.restore();

  /* 台后幕布 */
  var bg=ctx.createLinearGradient(0,syT,0,st.y);
  bg.addColorStop(0,rgba("#5c3a22",.85*stAlpha));
  bg.addColorStop(.55,rgba("#a4682f",.80*stAlpha));
  bg.addColorStop(1,rgba("#e0a05a",.72*stAlpha));
  ctx.fillStyle=bg;ctx.fillRect(sxL,syT,sw,sh);
  /* 台口边框 */
  ctx.strokeStyle=rgba("#2a1c12",.9);ctx.lineWidth=Math.max(1,sh*.05);
  ctx.strokeRect(sxL,syT,sw,sh);
  /* 两侧垂幕 */
  ctx.fillStyle=rgba("#231610",.92);
  ctx.fillRect(sxL,syT,sw*.17,sh);
  ctx.fillRect(sxL+sw*.83,syT,sw*.17,sh);
  /* 上檐 */
  ctx.fillStyle=rgba("#1e1410",.95);
  ctx.fillRect(sxL-sw*.05,syT-sh*.17,sw*1.10,sh*.20);

  /* 台上的人影：身子 + 摇动的水袖 */
  var pw=sw*.10,ph=sh*.52,pcx=g.cx+Math.sin(S.t*.28)*sw*.13,pby=st.y-sh*.05;
  ctx.fillStyle=rgba("#2b1a10",.88*stAlpha);
  ctx.beginPath();
  ctx.ellipse(pcx,pby-ph*.5,pw*.5,ph*.5,0,0,6.283);ctx.fill();
  ctx.beginPath();
  ctx.arc(pcx,pby-ph*1.02,pw*.30,0,6.283);ctx.fill();
  ctx.strokeStyle=rgba("#2b1a10",.7*stAlpha);
  ctx.lineWidth=Math.max(1,pw*.22);ctx.lineCap="round";
  var sl=Math.sin(S.t*.62)*pw*1.5;
  ctx.beginPath();
  ctx.moveTo(pcx,pby-ph*.78);
  ctx.quadraticCurveTo(pcx+sl*1.4,pby-ph*.95,pcx+sl*2.1,pby-ph*.52);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(pcx,pby-ph*.78);
  ctx.quadraticCurveTo(pcx-sl*1.2,pby-ph*.62,pcx-sl*1.8,pby-ph*.24);
  ctx.stroke();

  /* 台角两盏灯笼 */
  ctx.save();ctx.globalCompositeOperation="lighter";
  for(i=0;i<2;i++){
    var lx=g.cx+(i?1:-1)*sw*.40, ly=syT+sh*.16+Math.sin(S.t*.5+i*2)*sh*.02;
    sprite(glowS,lx,ly,sh*.55,.32*stAlpha*flick);
  }
  ctx.restore();

  /* 台前浮尘 */
  ctx.save();ctx.globalCompositeOperation="lighter";
  for(i=0;i<S.motes.length;i++){
    var m=S.motes[i],k=m.t/m.life,fa=Math.sin(Math.PI*k);
    sprite(glowS,m.x*W,m.y*H,m.r*7,m.a*fa*.5*stAlpha);
  }
  ctx.restore();

  /* 台前地面 */
  var fgd=ctx.createLinearGradient(0,st.y,0,H);
  fgd.addColorStop(0,rgba("#3c2a1c",.55*stAlpha));
  fgd.addColorStop(.42,rgba("#141a22",.85));
  fgd.addColorStop(1,"#0a0d13");
  ctx.fillStyle=fgd;ctx.fillRect(0,st.y,W,H-st.y);

  /* ---- 一排排空椅 ---- */
  var NCH=9, camF=S.cam, sweepX=(S.sweep>=0)?lerp(-.25,1.25,S.sweep)*W:-9999;
  for(var r=-2;r<=ROWS-1;r++){
    if(camF-r<-.14)continue;
    var p=proj(g,r,camF);
    if(p.dz>13)continue;
    if(p.y-p.h>H)continue;
    var wf=clamp((p.dz-.85)/6.2,0,1);
    var base=mixc("#141a22","#54402c",wf*.9);
    base=mixc(base,"#1b232e",back*.45);
    var cw=(p.s*2/NCH)*.74, ch=p.h;

    for(i=0;i<NCH;i++){
      var t=(NCH===1)?.5:i/(NCH-1);
      var x=g.cx+(t*2-1)*p.s*.94;
      if(x<-cw||x>W+cw)continue;
      var sweepAmt=(sweepX>-9000)?Math.max(0,1-Math.abs(x-sweepX)/(W*.20)):0;
      ctx.fillStyle=sweepAmt>0?mixc(base,"#7a5a34",sweepAmt*.55):base;
      chairPath(x,p.y,cw,ch);ctx.fill();
      /* 顶沿被台上的光描一道 */
      ctx.strokeStyle=rgba("#e6b071",(.10+.42*wf)*stAlpha*(1-fin*.4)+sweepAmt*.25);
      ctx.lineWidth=Math.max(.8,ch*.055);
      ctx.beginPath();
      ctx.moveTo(x-cw*.42,p.y-ch+ch*.03);
      ctx.lineTo(x+cw*.42,p.y-ch+ch*.03);
      ctx.stroke();
      /* 终章：身后的冷光沿下缘 */
      if(fin>.02){
        ctx.strokeStyle="rgba(178,208,240,"+(.30*fin*(1-wf*.5))+")";
        ctx.lineWidth=Math.max(.8,ch*.05);
        ctx.beginPath();
        ctx.moveTo(x-cw*.44,p.y-ch*.10);
        ctx.lineTo(x+cw*.44,p.y-ch*.10);
        ctx.stroke();
      }
    }

    /* 椅背上的小灯 */
    if(r>=0){
      var L=lampPos(g,r,camF);
      var rr=Math.max(2.2,p.s*.014);
      if(S.lit[r]){
        ctx.save();ctx.globalCompositeOperation="lighter";
        var pu=.82+.18*Math.sin(S.t*1.5+r);
        sprite(glowS,L.x,L.y,Math.max(28,p.s*.20),.42*pu*(1-fin*.35));
        ctx.restore();
        ctx.fillStyle="#ffe6bd";
        ctx.beginPath();ctx.arc(L.x,L.y,rr,0,6.283);ctx.fill();
      }else{
        var reach=reachable(r,camF);
        var pl=.5+.5*Math.sin(S.t*1.25+r*.9);
        if(reach){
          ctx.save();ctx.globalCompositeOperation="lighter";
          sprite(glowS,L.x,L.y,Math.max(20,p.s*.10),.10+.10*pl);
          ctx.restore();
        }
        ctx.strokeStyle=reach?rgba("#d8b184",.30+.26*pl):rgba("#8d9099",.16);
        ctx.lineWidth=Math.max(.9,rr*.55);
        ctx.beginPath();ctx.arc(L.x,L.y,rr*1.7,0,6.283);ctx.stroke();
      }
    }
  }

  /* ---- 涟漪 / 呼吸圈 ---- */
  for(i=0;i<S.ripples.length;i++){
    var rp=S.ripples[i],k2=rp.t/rp.life;
    ctx.strokeStyle=rp.warm?"rgba(232,180,116,"+(rp.a*(1-k2))+")":"rgba(186,206,232,"+(rp.a*(1-k2))+")";
    ctx.lineWidth=1.2;
    ctx.beginPath();ctx.arc(rp.x,rp.y,lerp(rp.r0,rp.r1,ease(k2)),0,6.283);ctx.stroke();
  }
  for(i=0;i<S.breaths.length;i++){
    var b=S.breaths[i],k3=b.t/b.life;
    ctx.strokeStyle="rgba(198,214,236,"+(b.a*(1-k3)*(1-k3))+")";
    ctx.lineWidth=1;
    ctx.beginPath();ctx.arc(b.x,b.y,lerp(b.r0,b.r1,ease(k3)),0,6.283);ctx.stroke();
  }

  /* ---- 暖屑 ---- */
  ctx.save();ctx.globalCompositeOperation="lighter";
  for(i=0;i<S.warms.length;i++){
    var w2=S.warms[i],k4=w2.t/w2.life;
    sprite(glowS,w2.x,w2.y,w2.r*9,(1-k4)*(1-k4)*.55);
  }
  ctx.restore();

  /* 终章冷光由 CSS #cool 合成层承担 */
}
/* ---------- 主循环 ---------- */
function frame(ts){
  rafId=requestAnimationFrame(frame);
  if(!last)last=ts;
  var dt=(ts-last)/1000;last=ts;
  if(dt>.05)dt=.05;
  if(dt<0)dt=0;
  update(dt);
  draw();
}

function restart(){
  S=newState();
  holding=false;pdown=false;dragged=false;
  var f=document.getElementById("fin");
  if(f){f.style.transition="none";f.style.opacity="0";
    setTimeout(function(){f.style.transition="opacity 2.4s ease";},40);}
  if(hintEl){hintEl.style.opacity="0";}
  var cl=document.getElementById("cool");
  if(cl){cl.style.transition="none";cl.style.opacity="0";
    setTimeout(function(){cl.style.transition="opacity 1.6s ease";},40);}
  setStageMix(0,false);
}

function boot(){
  cv=document.getElementById("cv");
  if(!cv)return;
  ctx=cv.getContext("2d");
  hintEl=document.getElementById("hint");
  glowS=mkGlow("#f0b878",64);
  starS=mkGlow("#dfe9ff",48);
  S=newState();
  resize();
  window.addEventListener("resize",function(){resize();skyG=null;},{passive:true});
  window.addEventListener("orientationchange",function(){setTimeout(function(){resize();skyG=null;},220);});

  cv.addEventListener("pointerdown",onDown,{passive:false});
  window.addEventListener("pointermove",onMove,{passive:true});
  window.addEventListener("pointerup",onUp,{passive:true});
  window.addEventListener("pointercancel",function(){pdown=false;dragged=false;holding=false;},{passive:true});
  window.addEventListener("keydown",function(e){
    if(e.key==="ArrowDown"||e.key==="s"){S.camT=clamp(S.camT+1,0,6);S.idle=0;}
    else if(e.key==="ArrowUp"||e.key==="w"){S.camT=clamp(S.camT-1,0,6);S.idle=0;}
  });

  var bm=document.getElementById("bMute");
  if(bm)bm.addEventListener("click",function(){
    muted=!muted;bm.textContent=muted?"静音":"声音";
    if(master)try{master.gain.value=muted?0:.9;}catch(e){}
  });
  var ba=document.getElementById("bAgain");
  if(ba)ba.addEventListener("click",function(){restart();});

  var mask=document.getElementById("mask"),bs=document.getElementById("bStart");
  function go(){
    started=true;initAudio();
    if(AC&&AC.state==="suspended"){try{AC.resume();}catch(e){}}
    if(mask){mask.style.opacity="0";mask.style.pointerEvents="none";
      setTimeout(function(){if(mask&&mask.parentNode)mask.parentNode.removeChild(mask);},1100);}
    S.idle=0;
  }
  if(bs)bs.addEventListener("click",go);

  rafId=requestAnimationFrame(frame);
}

/* 测试探针 */
Object.defineProperty(globalThis,"__G",{get:function(){
  return {
    get S(){return S;},
    geo:geo, proj:proj, lampPos:lampPos, reachable:reachable,
    update:update, draw:draw, tapAt:tapAt, lightRow:lightRow, restart:restart,
    get W(){return W;}, get H(){return H;},
    ROWS:ROWS, LINES:LINES,
    setCam:function(c){S.cam=c;S.camT=c;},
    press:function(x,y){onDown({clientX:x,clientY:y,preventDefault:function(){}});},
    move:function(x,y){onMove({clientX:x,clientY:y});},
    release:function(){onUp({});}
  };
},configurable:true});

if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);
else boot();
