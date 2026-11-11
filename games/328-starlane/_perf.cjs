const { chromium } = require('playwright');
const { pathToFileURL } = require('url');
(async () => {
  const browser = await chromium.launch({ args:['--no-sandbox','--disable-gpu'] });
  const page = await browser.newPage({ viewport:{ width:1280, height:720 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  // wrap rAF to sample real per-frame time (includes render cost) under software compositing
  await page.addInitScript(() => {
    const _raf = window.requestAnimationFrame.bind(window);
    const samples = []; window.__samples = samples;
    window.requestAnimationFrame = function(cb){
      return _raf(function(ts){
        const last = window.__lastTs || ts;
        const dt = ts - last; window.__lastTs = ts;
        if(window.__sampling) samples.push(dt);
        cb(ts);
      });
    };
  });
  const url = pathToFileURL('E:/WorkSpeace/WorkSpeace_WorkBuddy/daily-games/328-starlane/index.html').href;
  await page.goto(url);
  await page.waitForTimeout(300);
  console.log('pageerror(early):', errors.length ? errors.join(' | ') : 'none');
  console.log('__STARLANE     :', await page.evaluate(()=> typeof window.__STARLANE));
  await page.click('#startBtn');
  await page.waitForTimeout(200);
  // stress: simulate aiming drags + launches (exercises preview predict, comet flight, glow sprites, fx)
  for(let i=0;i<10;i++){
    const sx=640, sy=560;
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    for(let k=1;k<=6;k++){ await page.mouse.move(sx-20*k, sy-15*k); await page.waitForTimeout(8); }
    await page.mouse.up();
    await page.waitForTimeout(100);
  }
  await page.evaluate(()=>{ window.__sampling = true; });
  await page.waitForTimeout(2500);
  await page.evaluate(()=>{ window.__sampling = false; });
  const stats = await page.evaluate(()=>{
    const s = window.__samples.slice();
    if(!s.length) return { n:0 };
    s.sort((a,b)=>a-b);
    const med = s[Math.floor(s.length/2)];
    const p90 = s[Math.floor(s.length*0.9)];
    const mean = s.reduce((a,b)=>a+b,0)/s.length;
    return { n:s.length, med, p90, mean, min:s[0], max:s[s.length-1] };
  });
  const st = await page.evaluate(()=>{
    if(!window.__STARLANE) return { bodies:0, score:0, rings:0, note:'__STARLANE missing' };
    return { bodies:window.__STARLANE.bodies(), score:window.__STARLANE.state.score, rings:window.__STARLANE.rings() };
  });
  console.log('pageerror      :', errors.length ? errors.join(' | ') : 'none');
  console.log('frames sampled :', stats.n);
  console.log('median frame   :', stats.med?.toFixed(2), 'ms  -> ~' + (stats.med ? (1000/stats.med).toFixed(1) : '-') + ' fps');
  console.log('p90 frame      :', stats.p90?.toFixed(2), 'ms  -> ~' + (stats.p90 ? (1000/stats.p90).toFixed(1) : '-') + ' fps (worst-case)');
  console.log('mean / max     :', stats.mean?.toFixed(2), 'ms /', stats.max?.toFixed(1), 'ms');
  console.log('state          :', JSON.stringify(st));
  await browser.close();
})();
