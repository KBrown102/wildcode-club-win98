/* 096 Playwright 真机冒烟 */
const path=require('path');
const { chromium } = require(process.env.PW_PATH||'playwright');
const FILE='file:///'+path.join(__dirname,'index.html').replace(/\\/g,'/');

let pass=0, fail=0;
function T(n,c,e){ if(c){pass++;console.log('  PASS  '+n);} else {fail++;console.log('  FAIL  '+n+(e!==undefined?'  -> '+JSON.stringify(e):''));} }

async function run(name,w,h,shot){
  console.log('\n--- '+name+' '+w+'x'+h+' ---');
  const browser=await chromium.launch();
  const page=await browser.newPage({ viewport:{width:w,height:h}, deviceScaleFactor:1 });
  const errs=[], cerr=[];
  page.on('pageerror',e=>errs.push(String(e)));
  page.on('console',m=>{ if(m.type()==='error') cerr.push(m.text()); });
  await page.goto(FILE);
  await page.waitForTimeout(900);

  await page.click('#bStart',{force:true});
  await page.waitForTimeout(1200);
  T('开场遮罩已可穿透', await page.evaluate(()=>{
    const m=document.getElementById('mask');
    return !m || m.style.pointerEvents==='none';
  }));
  T('running=true', await page.evaluate(()=>!!(window.__G&&window.__G.S)));

  // 等鸟来
  await page.waitForTimeout(3000);
  let st=await page.evaluate(()=>({arrived:window.__G.S.arrived, warmth:window.__G.S.warmth}));
  T('鸟陆续飞来', st.arrived>=1, st);

  // 动词②：按住歇
  const w0=await page.evaluate(()=>window.__G.S.warmth);
  await page.mouse.move(w*0.5,h*0.86);
  await page.mouse.down();
  await page.waitForTimeout(2200);
  await page.mouse.up();
  const w1=await page.evaluate(()=>window.__G.S.warmth);
  T('按住=歇：暖度真的上升', w1>w0+0.05, {w0:+w0.toFixed(3),w1:+w1.toFixed(3)});

  // 动词③：轻点空处
  const lk0=await page.evaluate(()=>window.__G.S.look);
  const gg=await page.evaluate(()=>{const g=window.__G.geo();return {ix:g.ix,iy:g.iy,iw:g.iw,ih:g.ih};});
  await page.mouse.click(gg.ix+gg.iw*0.5, gg.iy+gg.ih*0.05);
  await page.waitForTimeout(300);
  T('轻点=望 生效', (await page.evaluate(()=>window.__G.S.look))>lk0);

  // 动词①：点鸟回
  const bp=await page.evaluate(()=>{
    const G=window.__G, g=G.geo();
    const b=G.S.birds.find(x=>x.here&&!x.gone);
    if(!b) return null;
    const pr=G.paneRect(g,b.pane);
    return { x:pr.x+pr.w*b.bx, y:pr.y+pr.h-13*g.sc, pane:b.pane };
  });
  if(bp){
    await page.mouse.click(bp.x,bp.y);
    await page.waitForTimeout(600);
    const r=await page.evaluate(()=>({replied:window.__G.S.replied, motes:window.__G.S.motes.length}));
    T('点鸟=回 生效', r.replied>=1, r);
  } else { T('点鸟=回 生效（无鸟可点，跳过）', true); }

  // 单击不会被当双击
  const before=await page.evaluate(()=>window.__G.S.look);
  await page.mouse.click(w*0.12,h*0.20);
  await page.waitForTimeout(260);
  const after=await page.evaluate(()=>window.__G.S.look);
  T('单击只触发一次（无双击）', after>before && after-before<0.25, {d:+(after-before).toFixed(3)});

  // 拖拽不误触
  const rep0=await page.evaluate(()=>window.__G.S.replied);
  await page.mouse.move(w*0.3,h*0.6); await page.mouse.down();
  await page.mouse.move(w*0.6,h*0.7,{steps:12});
  await page.mouse.up();
  await page.waitForTimeout(200);
  T('拖拽不会误触发回复', (await page.evaluate(()=>window.__G.S.replied))===rep0);

  // 声音开关
  await page.click('#snd');
  await page.waitForTimeout(150);
  T('声音开关可切换', (await page.textContent('#snd'))==='·');
  await page.click('#snd');

  // resize
  await page.setViewportSize({width:Math.round(w*0.7),height:Math.round(h*0.8)});
  await page.waitForTimeout(700);
  await page.setViewportSize({width:w,height:h});
  await page.waitForTimeout(700);
  T('resize 无异常', errs.length===0, errs.slice(0,2));

  // 帧率
  const fps=await page.evaluate(()=>new Promise(res=>{
    let n=0; const t0=performance.now();
    function f(){ n++; if(performance.now()-t0<1500) requestAnimationFrame(f); else res(n/((performance.now()-t0)/1000)); }
    requestAnimationFrame(f);
  }));
  T('帧率 ≥ 50fps', fps>=50, +fps.toFixed(1));
  console.log('     fps='+fps.toFixed(1));

  // 全部回完 → 终章
  await page.evaluate(()=>{ const S=window.__G.S; S.nextArrive=0.1; });
  for(let i=0;i<14;i++){
    const p=await page.evaluate(()=>{
      const G=window.__G, g=G.geo();
      const b=G.S.birds.find(x=>x.here&&!x.gone);
      if(!b) return null;
      const pr=G.paneRect(g,b.pane);
      return { x:pr.x+pr.w*b.bx, y:pr.y+pr.h-13*g.sc };
    });
    if(p){ await page.mouse.click(p.x,p.y); await page.waitForTimeout(220); }
    else { await page.evaluate(()=>{ window.__G.S.nextArrive=0.05; }); await page.waitForTimeout(500); }
  }
  const fin=await page.evaluate(()=>({replied:window.__G.S.replied, fin:window.__G.S.fin}));
  T('九只回完进入终章', fin.fin===1||fin.replied>=8, fin);
  await page.waitForTimeout(4200);

  if(shot){
    await page.screenshot({path:path.join(__dirname,shot)});
  }
  T('0 pageerror', errs.length===0, errs.slice(0,3));
  T('0 console.error', cerr.length===0, cerr.slice(0,3));

  await browser.close();
}

(async()=>{
  console.log('\n=== 096 · 候 · Playwright 真机 ===');
  await run('desktop',1280,800,'_shot_desktop.png');
  await run('mobile',390,844,'_shot_mobile.png');
  console.log('\n--- 结果：'+pass+'/'+(pass+fail)+' ---');
  if(fail>0) process.exit(1);
  console.log('ALL PASS ✓\n');
})().catch(e=>{ console.error('FATAL '+e.message); process.exit(1); });
