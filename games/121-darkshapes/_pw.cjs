const { chromium } = require('playwright');
const path = require('path');

const OK=[], FAIL=[];
function t(n,c,x){ (c?OK:FAIL).push(n+(x?(' :: '+x):'')); }

(async () => {
  const browser = await chromium.launch({ headless: true });
  const url = 'file://' + path.resolve(__dirname, 'index.html').replace(/\\/g,'/');

  for (const dev of [{n:'desktop',w:1280,h:800},{n:'mobile',w:390,h:844}]) {
    const errors=[];
    const page = await browser.newPage({ viewport:{width:dev.w,height:dev.h}, deviceScaleFactor:1, hasTouch:dev.n==='mobile' });
    page.on('pageerror', e=>errors.push('pageerror: '+e.message));
    page.on('console', m=>{ if(m.type()==='error') errors.push('console.error: '+m.text()); });
    await page.goto(url);
    await page.waitForTimeout(800);

    t(dev.n+' 载入无错', errors.length===0, errors[0]||'');
    // 开场遮罩存在
    t(dev.n+' 开场遮罩可见', await page.evaluate(()=>getComputedStyle(document.getElementById('mask')).opacity!=='0'));
    await page.click('#bStart');
    await page.waitForTimeout(1300);
    t(dev.n+' 遮罩淡出后不吃事件', await page.evaluate(()=>document.getElementById('mask').style.pointerEvents==='none'));

    // 真实点击六个影子
    const slots = await page.evaluate(()=>{
      const g=__G.geo(), c=__G.S.curtain;
      return g.slots.map(s=>{ const hh=s.shH*(1.42-0.42*c); return {x:s.shX, y:g.floorY-hh*0.46}; });
    });
    for(const s of slots){
      await page.mouse.click(Math.round(s.x), Math.round(s.y));
      await page.waitForTimeout(120);
    }
    const st1 = await page.evaluate(()=>({known:__G.S.v.filter(v=>v.known).length, ease:__G.S.ease}));
    t(dev.n+' 六个影子真机全部点得到', st1.known===6, 'known='+st1.known);

    await page.waitForTimeout(4200);
    const st2 = await page.evaluate(()=>({fin:__G.S.fin, op:getComputedStyle(document.getElementById('fin')).opacity, lamp:__G.S.lamp}));
    t(dev.n+' 终章触发', st2.fin>0.3, 'fin='+st2.fin.toFixed(2));
    t(dev.n+' 结束语可见', parseFloat(st2.op)>0.2, 'op='+st2.op);

    // 重来
    await page.click('#bAgain');
    await page.waitForTimeout(300);
    const st3 = await page.evaluate(()=>({known:__G.S.v.filter(v=>v.known).length, op:getComputedStyle(document.getElementById('fin')).opacity}));
    t(dev.n+' 重来后复位', st3.known===0);
    t(dev.n+' 重来后结束语瞬清', parseFloat(st3.op)<0.05, 'op='+st3.op);

    // 拖窗帘
    const win = await page.evaluate(()=>{ const g=__G.geo(); return {x:g.winX, y:g.winY, w:g.winW}; });
    const c0 = await page.evaluate(()=>__G.S.curtain);
    await page.mouse.move(Math.round(win.x), Math.round(win.y));
    await page.mouse.down();
    for(let i=1;i<=8;i++){ await page.mouse.move(Math.round(win.x - win.w*0.4*i/8), Math.round(win.y)); await page.waitForTimeout(24); }
    await page.mouse.up();
    const c1 = await page.evaluate(()=>__G.S.curtain);
    t(dev.n+' 拖窗帘生效', Math.abs(c1-c0)>0.05, c0.toFixed(2)+'->'+c1.toFixed(2));

    // 点夜灯
    const lamp = await page.evaluate(()=>{ const g=__G.geo(); return {x:g.lampX,y:g.lampY}; });
    const L0 = await page.evaluate(()=>__G.S.lamp);
    await page.mouse.click(Math.round(lamp.x), Math.round(lamp.y));
    await page.waitForTimeout(200);
    const L1 = await page.evaluate(()=>__G.S.lamp);
    t(dev.n+' 点夜灯换档', L0!==L1, L0+'->'+L1);

    // 按住空处呼吸
    await page.mouse.move(Math.round(dev.w*0.45), Math.round(dev.h*0.9));
    await page.mouse.down();
    await page.waitForTimeout(900);
    const br = await page.evaluate(()=>__G.S.breaths.length);
    await page.mouse.up();
    t(dev.n+' 按住空处出现呼吸圈', br>0, 'n='+br);

    // 帧率
    const fps = await page.evaluate(()=>new Promise(res=>{
      let n=0; const t0=performance.now();
      function f(){ n++; if(performance.now()-t0<1500) requestAnimationFrame(f); else res(n/((performance.now()-t0)/1000)); }
      requestAnimationFrame(f);
    }));
    t(dev.n+' 帧率 >=45', fps>=45, fps.toFixed(1)+'fps');

    // 连点防抖：狂点同一处不应报错
    for(let i=0;i<14;i++){ await page.mouse.click(Math.round(dev.w*0.5), Math.round(dev.h*0.5)); }
    await page.waitForTimeout(400);

    t(dev.n+' 全流程 0 pageerror / 0 console.error', errors.length===0, errors.slice(0,2).join(' | '));
    await page.close();
  }
  await browser.close();

  console.log('\n== PASS ('+OK.length+') ==');
  OK.forEach(s=>console.log('  ✓ '+s));
  if(FAIL.length){ console.log('\n== FAIL ('+FAIL.length+') =='); FAIL.forEach(s=>console.log('  ✗ '+s)); }
  console.log('\n结果: '+OK.length+'/'+(OK.length+FAIL.length)+(FAIL.length?'  ** 有失败 **':'  ALL PASS'));
  process.exit(FAIL.length?1:0);
})();
